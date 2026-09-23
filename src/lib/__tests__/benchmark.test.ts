import { buildBenchmarkSeries, type SnapshotRecord } from '../benchmark.ts'

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`PASS: ${msg}`)
}

console.log('--- TEST SUITE: Benchmark & Snapshot Fixes ---\n')

// 1. Scenario reproducing the Sept 15 -> Sept 16 cliff:
// Sept 15: BES included (total 1,000,000, cost 800,000), perf is NULL
// Sept 16: BES excluded (total 1,000,000, cost 800,000, perf_val 600,000, perf_cost 480,000)
// Sept 17: Normal day (perf_val 610,000, perf_cost 480,000)
{
  const testSnaps: SnapshotRecord[] = [
    { snapshot_date: '2026-09-14', total_value: 980000, total_cost: 800000, performance_value: null, performance_cost: null },
    { snapshot_date: '2026-09-15', total_value: 1000000, total_cost: 800000, performance_value: null, performance_cost: null },
    { snapshot_date: '2026-09-16', total_value: 1000000, total_cost: 800000, performance_value: 600000, performance_cost: 480000 },
    { snapshot_date: '2026-09-17', total_value: 1020000, total_cost: 800000, performance_value: 610000, performance_cost: 480000 }
  ]

  const qqqmPrices = [
    { date: '2026-09-14', price: 100 },
    { date: '2026-09-15', price: 100 },
    { date: '2026-09-16', price: 100 },
    { date: '2026-09-17', price: 100 }
  ]
  const usdPrices = [
    { date: '2026-09-14', price: 40 },
    { date: '2026-09-15', price: 40 },
    { date: '2026-09-16', price: 40 },
    { date: '2026-09-17', price: 40 }
  ]

  const { points, summary } = buildBenchmarkSeries(
    testSnaps,
    qqqmPrices,
    usdPrices,
    100,
    40
  )

  // Verify points length
  assert(points.length === 4, 'Points count is 4')

  // Verify Sept 15 normalization:
  // activeRatio = 600000 / 1000000 = 0.6
  // costRatio = 480000 / 800000 = 0.6
  // Sept 15 aktifDeger should be ~600,000, NOT 1,000,000
  const ptSept15 = points[1]
  const ptSept16 = points[2]
  assert(ptSept15.aktifDeger === 600000, `Sept 15 normalized active value is 600000 (was ${ptSept15.aktifDeger})`)
  assert(ptSept15.aktifMaliyet === 480000, `Sept 15 normalized active cost is 480000 (was ${ptSept15.aktifMaliyet})`)

  // Sept 16 aktifDeger and aktifMaliyet
  assert(ptSept16.aktifDeger === 600000, `Sept 16 active value is 600000 (was ${ptSept16.aktifDeger})`)
  assert(ptSept16.aktifMaliyet === 480000, `Sept 16 active cost is 480000 (was ${ptSept16.aktifMaliyet})`)

  // Crucial: No artificial drop between Sept 15 and Sept 16!
  const drop = ptSept15.aktifDeger - ptSept16.aktifDeger
  assert(drop === 0, `No artificial drop between Sept 15 and Sept 16 (drop was ${drop})`)

  // Crucial: QQQM benchmark shares NOT slashed on Sept 16!
  // Sept 14: activeV = 980000 * 0.6 = 588000. QQQM price = 4000 TRY. Shares = 588000 / 4000 = 147.
  // Sept 15: QQQM val = 147 * 4000 = 588000.
  // Sept 16: Cost delta = 480000 - 480000 = 0. QQQM val = 588000.
  assert(ptSept16.qqqmDeger > 500000, `QQQM line did not crash on Sept 16 (value is ${ptSept16.qqqmDeger})`)
}

// 2. Test Deduplication of snapshots by snapshot_date:
{
  const dupSnaps: SnapshotRecord[] = [
    { snapshot_date: '2026-09-15', total_value: 1000000, total_cost: 800000, performance_value: null, created_at: '2026-09-15T10:00:00Z' },
    // Earlier record on Sept 16 with null performance
    { snapshot_date: '2026-09-16', total_value: 1000000, total_cost: 800000, performance_value: null, created_at: '2026-09-16T08:00:00Z' },
    // Later record on Sept 16 with valid performance
    { snapshot_date: '2026-09-16', total_value: 1000000, total_cost: 800000, performance_value: 600000, performance_cost: 480000, created_at: '2026-09-16T14:00:00Z' },
    // Later record on Sept 16 with updated total_value and performance
    { snapshot_date: '2026-09-16', total_value: 1010000, total_cost: 800000, performance_value: 605000, performance_cost: 480000, created_at: '2026-09-16T18:00:00Z' }
  ]

  const { points } = buildBenchmarkSeries(dupSnaps, [], [], 100, 40)
  assert(points.length === 2, `Deduplicated points count is 2 (dates 15 and 16) - got ${points.length}`)
  assert(points[1].rawDate === '2026-09-16', 'Second point is Sept 16')
  assert(points[1].aktifDeger === 605000, `Selected latest record with valid performance (got ${points[1].aktifDeger}, expected 605000)`)
}

// 3. Test Transition with slight estimation boundary difference (negative costDelta on transition):
{
  // Suppose Sept 15 estimate gives activeC = 500,000, but real Sept 16 activeC is 490,000 (delta = -10,000)
  const testSnaps: SnapshotRecord[] = [
    { snapshot_date: '2026-09-15', total_value: 1000000, total_cost: 1000000, performance_value: null, performance_cost: null },
    // Sept 16: first real perf. activeRatio = 500/1000 = 0.5, costRatio = 490/1000 = 0.49
    // Wait, with firstValid on Sept 16, Sept 15 activeC = round(1000000 * 0.49) = 490000
    // But suppose total_cost on Sept 15 was 1,020,000 -> Sept 15 activeC = round(1020000 * 0.49) = 499800
    // Sept 16 activeC = 490000 -> costDelta = 490000 - 499800 = -9800 < 0!
    { snapshot_date: '2026-09-15', total_value: 1000000, total_cost: 1020000, performance_value: null, performance_cost: null },
    { snapshot_date: '2026-09-16', total_value: 1000000, total_cost: 1000000, performance_value: 500000, performance_cost: 490000 }
  ]

  const qqqmPrices = [{ date: '2026-09-15', price: 100 }, { date: '2026-09-16', price: 100 }]
  const usdPrices = [{ date: '2026-09-15', price: 40 }, { date: '2026-09-16', price: 40 }]

  const { points } = buildBenchmarkSeries(testSnaps, qqqmPrices, usdPrices, 100, 40)
  // On Sept 15: activeV = 500000, price = 4000 -> shares = 500000 / 4000 = 125
  // On Sept 16: transition from estimated to real with costDelta < 0. Shares must NOT be redeemed!
  // QQQM val on Sept 16 should still be 125 * 4000 = 500000!
  assert(points[0].qqqmDeger === 500000, `Day 0 QQQM is 500000 (got ${points[0].qqqmDeger})`)
  assert(points[1].qqqmDeger === 500000, `Day 1 QQQM is preserved across transition without redemption penalty (got ${points[1].qqqmDeger})`)
}

// 4. Test Edge cases:
{
  // Empty snapshots
  const resEmpty = buildBenchmarkSeries([], [], [], 100, 40)
  assert(resEmpty.points.length === 0 && resEmpty.summary === null, 'Empty snapshots returns empty points')

  // All snapshots lack performance_value
  const noPerfSnaps: SnapshotRecord[] = [
    { snapshot_date: '2026-09-10', total_value: 100000, total_cost: 80000, performance_value: null, performance_cost: null },
    { snapshot_date: '2026-09-11', total_value: 110000, total_cost: 80000, performance_value: null, performance_cost: null }
  ]
  const resNoPerf = buildBenchmarkSeries(noPerfSnaps, [], [], 100, 40)
  assert(resNoPerf.points.length === 2, 'No perf snapshots returns 2 points')
  assert(resNoPerf.points[0].aktifDeger === 100000, 'Falls back to total_value when no perf data exists')

  // Single snapshot with synthetic start date
  const singleSnap: SnapshotRecord[] = [
    { snapshot_date: '2026-09-16', total_value: 200000, total_cost: 150000, performance_value: 120000, performance_cost: 90000 }
  ]
  const resSingle = buildBenchmarkSeries(singleSnap, [], [], 100, 40, '2026-09-01', 80000)
  assert(resSingle.points.length === 16, `Synthesized daily points from firstTxDate for single snapshot (got ${resSingle.points.length})`)
  assert(resSingle.points[0].rawDate === '2026-09-01', 'Synthesized start date matches firstTxDate')
  assert(resSingle.points[0].aktifDeger === 80000, 'Synthesized start date has initialCost as active value')
}

// 5. Test Synthetic Start Date when initialCost > snapshot cost (MUST NOT REDEEM SHARES):
{
  const singleSnap: SnapshotRecord[] = [
    { snapshot_date: '2026-09-16', total_value: 450000, total_cost: 450000, performance_value: 450000, performance_cost: 450000 }
  ]
  const qqqmPrices = [{ date: '2026-09-01', price: 100 }, { date: '2026-09-16', price: 100 }]
  const usdPrices = [{ date: '2026-09-01', price: 1 }, { date: '2026-09-16', price: 1 }]
  // initialCost is 500,000, snapshot cost is 450,000. QQQM price is constant 100 TRY.
  // Day 0: 500,000 / 100 = 5000 shares -> 500,000 TRY.
  // Day 1: Must NOT redeem shares on synthetic transition! Day 1 QQQM must still be 500,000!
  const res = buildBenchmarkSeries(singleSnap, qqqmPrices, usdPrices, 100, 1, '2026-09-01', 500000)
  assert(res.points[0].qqqmDeger === 500000, 'Day 0 synthetic QQQM is 500000')
  assert(res.points[1].qqqmDeger === 500000, `Day 1 QQQM preserved across synthetic boundary without redemption (got ${res.points[1].qqqmDeger})`)
}

// 6. Test Zero Initial Capital on Day 0 and First Deposit on Day 1 (MUST NOT DOUBLE-PURCHASE SHARES):
{
  const snaps: SnapshotRecord[] = [
    { snapshot_date: '2026-09-15', total_value: 0, total_cost: 0, performance_value: 0, performance_cost: 0 },
    { snapshot_date: '2026-09-16', total_value: 100000, total_cost: 100000, performance_value: 100000, performance_cost: 100000 }
  ]
  const qqqmPrices = [{ date: '2026-09-15', price: 100 }, { date: '2026-09-16', price: 100 }]
  const usdPrices = [{ date: '2026-09-15', price: 1 }, { date: '2026-09-16', price: 1 }]
  const res = buildBenchmarkSeries(snaps, qqqmPrices, usdPrices, 100, 1)
  assert(res.points[0].qqqmDeger === 0, 'Day 0 QQQM is 0')
  assert(res.points[1].qqqmDeger === 100000, `Day 1 QQQM matches deposit 100000 without double-purchase (got ${res.points[1].qqqmDeger})`)
}

// 7. Test Performance_Value = 0 on or after firstValid (MUST NOT FABRICATE ESTIMATED VALUE):
{
  const snaps: SnapshotRecord[] = [
    { snapshot_date: '2026-09-15', total_value: 1000000, total_cost: 800000, performance_value: null, performance_cost: null },
    { snapshot_date: '2026-09-16', total_value: 1000000, total_cost: 800000, performance_value: 600000, performance_cost: 480000 },
    { snapshot_date: '2026-09-17', total_value: 400000, total_cost: 320000, performance_value: 0, performance_cost: 0 }
  ]
  const res = buildBenchmarkSeries(snaps, [], [], 100, 40)
  assert(res.points[2].aktifDeger === 0, `Sept 17 aktifDeger is 0 (got ${res.points[2].aktifDeger})`)
  assert(res.points[2].aktifMaliyet === 0, `Sept 17 aktifMaliyet is 0 (got ${res.points[2].aktifMaliyet})`)
}

// 8. Test Direct deduplicateSnapshots function:
{
  const { deduplicateSnapshots } = await import('../benchmark.ts')
  const records = [
    { snapshot_date: '2026-09-16', total_value: 100000, total_cost: 80000, performance_value: null, created_at: '2026-09-16T08:00:00Z' },
    { snapshot_date: '2026-09-16', total_value: 100000, total_cost: 80000, performance_value: 60000, created_at: '2026-09-16T12:00:00Z' },
    { snapshot_date: '2026-09-16', total_value: 100000, total_cost: 80000, performance_value: null, created_at: '2026-09-16T18:00:00Z' },
    { snapshot_date: '2026-09-17', total_value: 110000, total_cost: 80000, performance_value: 65000, created_at: 'invalid-date' }
  ]
  const deduped = deduplicateSnapshots(records)
  assert(deduped.length === 2, `Direct deduplicate result length is 2 (got ${deduped.length})`)
  assert(deduped[0].performance_value === 60000, `Prefers record with performance_value over null even if null has later created_at (got ${deduped[0].performance_value})`)
  assert(deduped[1].snapshot_date === '2026-09-17', 'Handles invalid created_at timestamp safely')
}

// 9. Test rangeFromDate parameter:
{
  const snaps: SnapshotRecord[] = [
    { snapshot_date: '2026-06-22', total_value: 500000, total_cost: 500000, performance_value: 500000, performance_cost: 500000 },
    { snapshot_date: '2026-08-20', total_value: 550000, total_cost: 500000, performance_value: 550000, performance_cost: 500000 },
    { snapshot_date: '2026-09-01', total_value: 570000, total_cost: 500000, performance_value: 570000, performance_cost: 500000 },
    { snapshot_date: '2026-09-22', total_value: 600000, total_cost: 500000, performance_value: 600000, performance_cost: 500000 }
  ]
  // With 30-day range starting from 2026-08-23:
  const res = buildBenchmarkSeries(snaps, [], [], 100, 40, '2026-06-22', 500000, '2026-08-23')
  // Should include preceding baseline (2026-08-20) plus in-range dates filled with daily continuity
  assert(res.points.length === 34, `Filtered to range with baseline preserves correct points and daily continuity (got ${res.points.length})`)
  assert(res.points[0].rawDate === '2026-08-20', `Starting point is closest preceding baseline (got ${res.points[0].rawDate})`)
}

// 10. Test single snapshot with rangeFromDate (MUST NOT STRETCH TO 3 MONTHS AGO):
{
  const single: SnapshotRecord[] = [
    { snapshot_date: '2026-09-22', total_value: 600000, total_cost: 500000, performance_value: 600000, performance_cost: 500000 }
  ]
  // User selected 7G (7 days, from 2026-09-15)
  const res = buildBenchmarkSeries(single, [], [], 100, 40, '2026-06-22', 500000, '2026-09-15')
  assert(res.points.length === 8, `Single snap has 8 points across 7-day range (got ${res.points.length})`)
  assert(res.points[0].rawDate === '2026-09-15', `Day 0 baseline date is range start 2026-09-15 NOT 2026-06-22 (got ${res.points[0].rawDate})`)
}

// 11. Test distant preceding snapshot (e.g. 60 days ago) is NOT prepended when user selects 30-day range:
{
  const snaps: SnapshotRecord[] = [
    { snapshot_date: '2026-06-25', total_value: 439482, total_cost: 439482, performance_value: 439482, performance_cost: 439482 },
    { snapshot_date: '2026-08-25', total_value: 1000000, total_cost: 900000, performance_value: 1000000, performance_cost: 900000 },
    { snapshot_date: '2026-09-23', total_value: 1100000, total_cost: 1048593, performance_value: 1100000, performance_cost: 1048593 }
  ]
  // 30-day range starting 2026-08-24. Preceding is 2026-06-25 (60 days ago!).
  const res = buildBenchmarkSeries(snaps, [], [], 100, 40, '2026-06-25', 439482, '2026-08-24')
  assert(res.points.length === 31, `Distant preceding snapshot is omitted, points count is 31 (got ${res.points.length})`)
  assert(res.points[0].rawDate === '2026-08-24', `First point is 2026-08-24 NOT 2026-06-25 (got ${res.points[0].rawDate})`)
}

console.log('\n--- ALL UNIT TESTS PASSED! ---')
