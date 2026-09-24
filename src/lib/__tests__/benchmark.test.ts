import { buildBenchmarkSeries, deduplicateSnapshots, type SnapshotRecord } from '../benchmark.ts'

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`PASS: ${msg}`)
}

console.log('--- TEST SUITE: Streamlined Natural Snapshots & Benchmark ---\n')

// 1. Scenario: Raw Snapshots directly rendered without synthetic gap-filling:
{
  const testSnaps: SnapshotRecord[] = [
    { snapshot_date: '2026-08-25', total_value: 1000000, total_cost: 800000, performance_value: 700000, performance_cost: 550000 },
    { snapshot_date: '2026-08-28', total_value: 1020000, total_cost: 800000, performance_value: 720000, performance_cost: 550000 },
    { snapshot_date: '2026-09-05', total_value: 1050000, total_cost: 820000, performance_value: 750000, performance_cost: 570000 },
    { snapshot_date: '2026-09-23', total_value: 1100000, total_cost: 850000, performance_value: 800000, performance_cost: 600000 }
  ]

  const { points } = buildBenchmarkSeries(testSnaps, [], [], 100, 40)
  
  // Tam olarak veritabanındaki 4 snapshot gelmeli (araya yapay 30 gün doldurulmamalı)
  assert(points.length === 4, `Points count is exactly 4 raw snapshots (got ${points.length})`)
  
  // Doğal kâr/zarar kontrolü: kar = deger - maliyet
  assert(points[0].kar === 200000, `Day 0 kar is 200000 (got ${points[0].kar})`)
  assert(points[3].kar === 250000, `Day 3 kar is 250000 (got ${points[3].kar})`)
  assert(points[0].deger === 1000000, `Day 0 deger is raw 1000000`)
  assert(points[0].maliyet === 800000, `Day 0 maliyet is raw 800000`)
}

// 2. Scenario: BES Direct Deduction from Day 0:
{
  // Eski snapshot'larda performance_value null veya BES dahil olabilir
  const snapsWithBES: SnapshotRecord[] = [
    { snapshot_date: '2026-08-24', total_value: 1000000, total_cost: 800000, performance_value: null, performance_cost: null },
    { snapshot_date: '2026-09-23', total_value: 1200000, total_cost: 900000, performance_value: null, performance_cost: null }
  ]

  // Portföyde 200,000 TL değerinde ve 150,000 TL maliyetinde BES var
  const besDeduction = { value: 200000, cost: 150000 }

  const qqqmPrices = [
    { date: '2026-08-24', price: 100 },
    { date: '2026-09-23', price: 110 }
  ]
  const usdPrices = [
    { date: '2026-08-24', price: 40 },
    { date: '2026-09-23', price: 40 }
  ]

  const { points, summary } = buildBenchmarkSeries(
    snapsWithBES,
    qqqmPrices,
    usdPrices,
    110,
    40,
    '2026-08-24',
    undefined,
    '2026-08-24',
    besDeduction
  )

  // Day 0'da aktif değer BES düşülerek başlamalı: 1,000,000 - 200,000 = 800,000
  assert(points[0].aktifDeger === 800000, `Day 0 aktifDeger directly excludes BES (expected 800000, got ${points[0].aktifDeger})`)
  assert(points[0].aktifMaliyet === 650000, `Day 0 aktifMaliyet directly excludes BES (expected 650000, got ${points[0].aktifMaliyet})`)

  // Day 0'da QQQM doğrudan aktif değer ile başlar
  assert(points[0].qqqmDeger === 800000, `Day 0 QQQM matches active capital without BES (expected 800000, got ${points[0].qqqmDeger})`)

  // QQQM %10 arttı (100 -> 110) ve 100k yeni para eklendi: 800k * 1.10 + 100k = 980,000 TL
  assert(points[1].qqqmDeger === 980000, `Day 1 QQQM accurately reflects price gain and new deposit (expected 980000, got ${points[1].qqqmDeger})`)

  assert(summary !== null, 'Summary is calculated')
  assert(Math.abs(summary!.qqqmReturnPct - 9.41) < 0.1, `QQQM return is 9.4% Dietz return (got %${summary!.qqqmReturnPct.toFixed(2)})`)
}

// 3. Test Deduplication of snapshots by snapshot_date:
{
  const dupSnaps: SnapshotRecord[] = [
    { snapshot_date: '2026-09-15', total_value: 1000000, total_cost: 800000, performance_value: null, created_at: '2026-09-15T10:00:00Z' },
    { snapshot_date: '2026-09-16', total_value: 1000000, total_cost: 800000, performance_value: null, created_at: '2026-09-16T08:00:00Z' },
    { snapshot_date: '2026-09-16', total_value: 1000000, total_cost: 800000, performance_value: 600000, performance_cost: 480000, created_at: '2026-09-16T14:00:00Z' },
    { snapshot_date: '2026-09-16', total_value: 1010000, total_cost: 800000, performance_value: 605000, performance_cost: 480000, created_at: '2026-09-16T18:00:00Z' }
  ]

  const { points } = buildBenchmarkSeries(dupSnaps, [], [], 100, 40)
  assert(points.length === 2, `Deduplicated points count is 2 (got ${points.length})`)
  assert(points[1].rawDate === '2026-09-16', 'Second point is Sept 16')
  assert(points[1].aktifDeger === 605000, `Selected latest record with valid performance (got ${points[1].aktifDeger})`)
}

// 4. Test Single Snapshot baseline generation for new user:
{
  const singleSnap: SnapshotRecord[] = [
    { snapshot_date: '2026-09-24', total_value: 500000, total_cost: 400000, performance_value: 350000, performance_cost: 300000 }
  ]
  const { points } = buildBenchmarkSeries(singleSnap, [], [], 100, 40)
  assert(points.length === 2, `Single snapshot gets 1 baseline point for rendering (got ${points.length})`)
  assert(points[0].deger === 400000, 'Baseline point total value matches cost basis')
  assert(points[1].deger === 500000, 'Current point matches actual total value')
}

// 5. Test Range filtering preserves immediate preceding baseline:
{
  const snaps: SnapshotRecord[] = [
    { snapshot_date: '2026-08-20', total_value: 900000, total_cost: 800000, performance_value: 700000, performance_cost: 600000 },
    { snapshot_date: '2026-08-26', total_value: 920000, total_cost: 800000, performance_value: 710000, performance_cost: 600000 },
    { snapshot_date: '2026-09-10', total_value: 950000, total_cost: 800000, performance_value: 730000, performance_cost: 600000 },
    { snapshot_date: '2026-09-24', total_value: 980000, total_cost: 800000, performance_value: 760000, performance_cost: 600000 }
  ]

  // Range starts 2026-08-24 (30 days ago). Preceding is 2026-08-20 (4 days before range, <= 7 days).
  const { points } = buildBenchmarkSeries(snaps, [], [], 100, 40, undefined, undefined, '2026-08-24')
  assert(points.length === 4, `Preserves preceding baseline + 3 in-range points (got ${points.length})`)
  assert(points[0].rawDate === '2026-08-20', `Starts with preceding baseline 2026-08-20`)
}

// 6. Test Distant preceding snapshot (> 7 days) is omitted:
{
  const snaps: SnapshotRecord[] = [
    { snapshot_date: '2026-06-25', total_value: 400000, total_cost: 400000, performance_value: 300000, performance_cost: 300000 },
    { snapshot_date: '2026-08-26', total_value: 920000, total_cost: 800000, performance_value: 710000, performance_cost: 600000 },
    { snapshot_date: '2026-09-24', total_value: 980000, total_cost: 800000, performance_value: 760000, performance_cost: 600000 }
  ]

  // Range starts 2026-08-24. Preceding is June 25 (60 days ago > 7 days!). Must NOT prepend June 25.
  const { points } = buildBenchmarkSeries(snaps, [], [], 100, 40, undefined, undefined, '2026-08-24')
  assert(points.length === 2, `Distant snapshot is omitted (got ${points.length})`)
  assert(points[0].rawDate === '2026-08-26', `Starts cleanly with in-range snapshot 2026-08-26`)
}

console.log('\n--- ALL UNIT TESTS PASSED! ---')
