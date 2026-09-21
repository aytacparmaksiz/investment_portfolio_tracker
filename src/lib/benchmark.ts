export interface SnapshotRecord {
  snapshot_date: string;
  total_value: number;
  total_cost: number;
  performance_value?: number | null;
  performance_cost?: number | null;
}

export interface BenchmarkChartPoint {
  date: string;
  rawDate: string;
  deger: number;
  maliyet: number;
  kar: number;
  aktifDeger: number;
  aktifMaliyet: number;
  qqqmDeger: number;
  hasPerformanceData: boolean;
}

export interface BenchmarkSummary {
  lastActive: number;
  lastQqqm: number;
  diffAmount: number;
  diffPercent: number;
  isBehind: boolean;
  activeReturnPct: number;
  qqqmReturnPct: number;
}

export function findClosestPrice(
  prices: { date: string; price: number }[],
  targetDate: string,
  livePrice?: number | null
): number {
  if (!prices || prices.length === 0) {
    return livePrice && livePrice > 0 ? livePrice : 0;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (targetDate >= todayStr && livePrice && livePrice > 0) {
    return livePrice;
  }

  // Sort ascending by date
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));

  // Find exact or closest preceding date
  let chosen = sorted[0].price;
  for (const item of sorted) {
    if (item.date <= targetDate) {
      chosen = item.price;
    } else {
      break;
    }
  }

  return chosen > 0 ? chosen : (livePrice && livePrice > 0 ? livePrice : 0);
}

export function buildBenchmarkSeries(
  snapshots: SnapshotRecord[],
  qqqmHistory: { date: string; price: number }[],
  usdHistory: { date: string; price: number }[],
  liveQqqmUSD: number,
  liveUsdRate: number,
  firstTxDate?: string,
  initialCost?: number
): { points: BenchmarkChartPoint[]; summary: BenchmarkSummary | null } {
  if (!snapshots || snapshots.length === 0) {
    return { points: [], summary: null };
  }

  // Filter and sort snapshots ascending
  const sortedSnaps = [...snapshots]
    .filter(s => s && s.snapshot_date)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  if (sortedSnaps.length === 0) {
    return { points: [], summary: null };
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'short' })}`;
  };

  // If only 1 snapshot and we have an earlier initial date, synthesize a start point
  let effectiveSnaps: {
    snapshot_date: string;
    total_value: number;
    total_cost: number;
    performance_value: number;
    performance_cost: number;
  }[] = sortedSnaps.map(s => {
    const totalV = Number(s.total_value || 0);
    const totalC = Number(s.total_cost || 0);
    const activeV = s.performance_value != null && Number(s.performance_value) > 0
      ? Number(s.performance_value)
      : totalV;
    const activeC = s.performance_cost != null && Number(s.performance_cost) > 0
      ? Number(s.performance_cost)
      : totalC;

    return {
      snapshot_date: s.snapshot_date,
      total_value: totalV,
      total_cost: totalC,
      performance_value: activeV,
      performance_cost: activeC
    };
  });

  if (
    effectiveSnaps.length === 1 &&
    firstTxDate &&
    firstTxDate < effectiveSnaps[0].snapshot_date &&
    initialCost &&
    initialCost > 0
  ) {
    effectiveSnaps = [
      {
        snapshot_date: firstTxDate,
        total_value: initialCost,
        total_cost: initialCost,
        performance_value: initialCost,
        performance_cost: initialCost
      },
      ...effectiveSnaps
    ];
  }

  // Calculate QQQM shadow investment tracking active portfolio capital
  let runningShares = 0;
  let runningInvested = 0;
  let previousActiveCost = 0;
  let lastKnownQqqmPriceTRY = 0;

  const points: BenchmarkChartPoint[] = effectiveSnaps.map((s, idx) => {
    const activeV = s.performance_value;
    const activeC = s.performance_cost;

    // Determine QQQM price in TRY for this date
    const qqqmUsd = findClosestPrice(qqqmHistory, s.snapshot_date, liveQqqmUSD);
    const usdRate = findClosestPrice(usdHistory, s.snapshot_date, liveUsdRate);

    let qqqmPriceTRY = (qqqmUsd > 0 && usdRate > 0) ? qqqmUsd * usdRate : 0;
    if (qqqmPriceTRY > 0) {
      lastKnownQqqmPriceTRY = qqqmPriceTRY;
    } else if (lastKnownQqqmPriceTRY > 0) {
      qqqmPriceTRY = lastKnownQqqmPriceTRY;
    }

    let qqqmVal = 0;

    if (idx === 0) {
      // Day 0: Benchmark matches initial active portfolio capital
      runningInvested = activeC;
      previousActiveCost = activeC;
      if (qqqmPriceTRY > 0 && activeV > 0) {
        runningShares = activeV / qqqmPriceTRY;
      }
      qqqmVal = activeV;
    } else {
      // Recover runningShares if day 0 had no valid price
      if (runningShares === 0 && qqqmPriceTRY > 0) {
        const baseForShares = activeV > 0 ? activeV : (activeC > 0 ? activeC : 0);
        if (baseForShares > 0) {
          runningShares = baseForShares / qqqmPriceTRY;
        }
      }

      const costDelta = activeC - previousActiveCost;
      if (costDelta > 0 && qqqmPriceTRY > 0) {
        // Additional capital added -> buy more QQQM shares
        const newShares = costDelta / qqqmPriceTRY;
        runningShares += newShares;
        runningInvested += costDelta;
      } else if (costDelta < 0 && previousActiveCost > 0) {
        // Capital withdrawn -> proportional share redemption
        const withdrawRatio = Math.min(1, Math.abs(costDelta) / previousActiveCost);
        runningShares = Math.max(0, runningShares * (1 - withdrawRatio));
        runningInvested += costDelta;
      }
      previousActiveCost = activeC;
      qqqmVal = runningShares * qqqmPriceTRY;
    }

    const totalKar = s.total_cost > 0 ? s.total_value - s.total_cost : 0;

    return {
      date: formatDate(s.snapshot_date),
      rawDate: s.snapshot_date,
      deger: s.total_value,
      maliyet: s.total_cost,
      kar: totalKar,
      aktifDeger: activeV,
      aktifMaliyet: activeC,
      qqqmDeger: Math.round(qqqmVal),
      hasPerformanceData: true
    };
  });

  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  let summary: BenchmarkSummary | null = null;
  if (lastPoint && lastPoint.qqqmDeger > 0 && firstPoint) {
    const lastActive = lastPoint.aktifDeger;
    const lastQqqm = lastPoint.qqqmDeger;
    const diffAmount = lastActive - lastQqqm;
    const diffPercent = lastQqqm > 0 ? (diffAmount / lastQqqm) * 100 : 0;
    const isBehind = diffAmount < 0;

    const startActive = firstPoint.aktifDeger;
    const netCashFlow = lastPoint.aktifMaliyet - firstPoint.aktifMaliyet;

    let baseCapital: number;
    let activeGain: number;
    let qqqmGain: number;

    if (startActive > 0) {
      baseCapital = Math.max(1, startActive + (netCashFlow > 0 ? 0.5 * netCashFlow : 0));
      activeGain = lastActive - startActive - netCashFlow;
      qqqmGain = lastQqqm - startActive - netCashFlow;
    } else {
      baseCapital = lastPoint.aktifMaliyet > 0 ? lastPoint.aktifMaliyet : Math.max(1, lastActive);
      activeGain = lastActive - (lastPoint.aktifMaliyet > 0 ? lastPoint.aktifMaliyet : 0);
      qqqmGain = lastQqqm - (lastPoint.aktifMaliyet > 0 ? lastPoint.aktifMaliyet : 0);
    }

    const activeReturnPct = baseCapital > 0 ? (activeGain / baseCapital) * 100 : 0;
    const qqqmReturnPct = baseCapital > 0 ? (qqqmGain / baseCapital) * 100 : 0;

    summary = {
      lastActive,
      lastQqqm,
      diffAmount,
      diffPercent,
      isBehind,
      activeReturnPct,
      qqqmReturnPct
    };
  }

  return { points, summary };
}
