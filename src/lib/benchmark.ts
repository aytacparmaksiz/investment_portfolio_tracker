export interface SnapshotRecord {
  snapshot_date: string;
  total_value: number;
  total_cost: number;
  performance_value?: number | null;
  performance_cost?: number | null;
  created_at?: string;
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

export function deduplicateSnapshots<T extends { snapshot_date: string; performance_value?: number | null; performance_cost?: number | null; created_at?: string }>(
  data: T[]
): T[] {
  const dateMap = new Map<string, T>();

  const toTime = (dateStr?: string) => {
    if (!dateStr) return 0;
    const t = new Date(dateStr).getTime();
    return isNaN(t) ? 0 : t;
  };

  for (const snap of data) {
    if (!snap || !snap.snapshot_date) continue;

    const existing = dateMap.get(snap.snapshot_date);
    if (!existing) {
      dateMap.set(snap.snapshot_date, snap);
      continue;
    }

    const existingHasPerf = (existing.performance_value != null && Number(existing.performance_value) > 0) ||
                            (existing.performance_cost != null && Number(existing.performance_cost) > 0);
    const currentHasPerf = (snap.performance_value != null && Number(snap.performance_value) > 0) ||
                           (snap.performance_cost != null && Number(snap.performance_cost) > 0);

    if (currentHasPerf && !existingHasPerf) {
      dateMap.set(snap.snapshot_date, snap);
    } else if (!currentHasPerf && existingHasPerf) {
      // Keep existing record with valid performance data
    } else {
      // Both have or both lack performance data: prefer latest created_at
      const existingTime = toTime(existing.created_at);
      const currentTime = toTime(snap.created_at);
      if (currentTime >= existingTime) {
        dateMap.set(snap.snapshot_date, snap);
      }
    }
  }

  return Array.from(dateMap.values()).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
}

export function buildBenchmarkSeries(
  snapshots: SnapshotRecord[],
  qqqmHistory: { date: string; price: number }[],
  usdHistory: { date: string; price: number }[],
  liveQqqmUSD: number,
  liveUsdRate: number,
  firstTxDate?: string,
  initialCost?: number,
  rangeFromDate?: string
): { points: BenchmarkChartPoint[]; summary: BenchmarkSummary | null } {
  if (!snapshots || snapshots.length === 0) {
    return { points: [], summary: null };
  }

  // 1. Deduplicate incoming snapshots by snapshot_date (preferring records with valid performance data and latest created_at)
  const sortedSnaps = deduplicateSnapshots(snapshots);

  if (sortedSnaps.length === 0) {
    return { points: [], summary: null };
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'short' })}`;
  };

  // 2. Normalize historical snapshots that lack performance_value
  // Find first snapshot with a valid performance_value (> 0)
  const firstValid = sortedSnaps.find(
    s => s.performance_value != null && Number(s.performance_value) > 0
  );

  let activeRatio = 1;
  let costRatio = 1;

  if (firstValid) {
    const fvTotalV = Number(firstValid.total_value || 0);
    const fvPerfV = Number(firstValid.performance_value || 0);
    if (fvTotalV > 0 && fvPerfV > 0) {
      activeRatio = Math.min(1, Math.max(0, fvPerfV / fvTotalV));
    }

    const fvTotalC = Number(firstValid.total_cost || 0);
    const fvPerfC = firstValid.performance_cost != null && Number(firstValid.performance_cost) > 0
      ? Number(firstValid.performance_cost)
      : fvTotalC * activeRatio;

    if (fvTotalC > 0 && fvPerfC > 0) {
      costRatio = Math.min(1, Math.max(0, fvPerfC / fvTotalC));
    } else {
      costRatio = activeRatio;
    }
  }

  // If only 1 snapshot and we have an earlier initial date, synthesize a start point
  let effectiveSnaps: {
    snapshot_date: string;
    total_value: number;
    total_cost: number;
    performance_value: number;
    performance_cost: number;
    isEstimated: boolean;
    isSynthetic?: boolean;
  }[] = sortedSnaps.map(s => {
    const totalV = Number(s.total_value || 0);
    const totalC = Number(s.total_cost || 0);
    const hasPerfV = s.performance_value != null;
    const hasPerfC = s.performance_cost != null;

    let activeV: number;
    let activeC: number;
    let isEstimated = false;

    if (hasPerfV) {
      activeV = Number(s.performance_value);
      activeC = hasPerfC ? Number(s.performance_cost) : Math.round(totalC * costRatio);
    } else {
      if (firstValid) {
        activeV = Math.round(totalV * activeRatio);
        activeC = Math.round(totalC * costRatio);
        isEstimated = true;
      } else {
        activeV = totalV;
        activeC = totalC;
        isEstimated = false;
      }
    }

    return {
      snapshot_date: s.snapshot_date,
      total_value: totalV,
      total_cost: totalC,
      performance_value: activeV,
      performance_cost: activeC,
      isEstimated
    };
  });

  if (rangeFromDate && effectiveSnaps.length > 1) {
    const inRange = effectiveSnaps.filter(s => s.snapshot_date >= rangeFromDate);
    if (inRange.length >= 1) {
      // If the first in-range snapshot is after rangeFromDate, find the closest preceding snapshot to preserve starting baseline
      const preceding = effectiveSnaps
        .filter(s => s.snapshot_date < rangeFromDate)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
      if (preceding && inRange[0].snapshot_date > rangeFromDate) {
        effectiveSnaps = [preceding, ...inRange];
      } else {
        effectiveSnaps = inRange;
      }
    }
  }

  if (effectiveSnaps.length === 1) {
    const single = effectiveSnaps[0];
    const baseCost = (initialCost && initialCost > 0) ? initialCost : (single.total_cost > 0 ? single.total_cost : single.total_value);
    
    let baseDate: string;
    if (rangeFromDate && rangeFromDate < single.snapshot_date) {
      baseDate = rangeFromDate;
    } else if (firstTxDate && firstTxDate < single.snapshot_date) {
      baseDate = firstTxDate;
    } else {
      baseDate = new Date(new Date(single.snapshot_date).getTime() - 86400000).toISOString().split('T')[0];
    }

    const perfBaseCost = (initialCost && initialCost > 0)
      ? initialCost
      : ((single.performance_cost && single.performance_cost > 0) ? single.performance_cost : single.performance_value);

    effectiveSnaps = [
      {
        snapshot_date: baseDate,
        total_value: baseCost,
        total_cost: baseCost,
        performance_value: perfBaseCost,
        performance_cost: perfBaseCost,
        isEstimated: true,
        isSynthetic: true
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
      // Recover runningShares if day 0 had no valid price or 0 capital
      if (runningShares === 0 && qqqmPriceTRY > 0) {
        const baseForShares = activeV > 0 ? activeV : (activeC > 0 ? activeC : 0);
        if (baseForShares > 0) {
          runningShares = baseForShares / qqqmPriceTRY;
          runningInvested = activeC > 0 ? activeC : baseForShares;
        }
      } else {
        const costDelta = activeC - previousActiveCost;
        const prevSnap = effectiveSnaps[idx - 1];
        const isTransitionFromEstimated =
          (prevSnap && prevSnap.isEstimated && !s.isEstimated) || Boolean(prevSnap?.isSynthetic);

        if (costDelta > 0 && qqqmPriceTRY > 0) {
          // Additional capital added -> buy more QQQM shares
          const newShares = costDelta / qqqmPriceTRY;
          runningShares += newShares;
          runningInvested += costDelta;
        } else if (costDelta < 0 && previousActiveCost > 0) {
          if (!isTransitionFromEstimated) {
            // Capital withdrawn -> proportional share redemption
            const withdrawRatio = Math.min(1, Math.abs(costDelta) / previousActiveCost);
            runningShares = Math.max(0, runningShares * (1 - withdrawRatio));
            runningInvested += costDelta;
          } else {
            // Transition from estimated to first real snapshot or from synthetic point:
            // Do not trigger cash withdrawal / share redemption on negative costDelta
            runningInvested = activeC;
          }
        }
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
