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
  rangeFromDate?: string,
  besDeduction?: { value: number; cost: number }
): { points: BenchmarkChartPoint[]; summary: BenchmarkSummary | null } {
  if (!snapshots || snapshots.length === 0) {
    return { points: [], summary: null };
  }

  // 1. Snapshot kayıtlarını tarihe göre tekilleştir
  const sortedSnaps = deduplicateSnapshots(snapshots);
  if (sortedSnaps.length === 0) {
    return { points: [], summary: null };
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'short' })}`;
  };

  // 2. İlk geçerli performans kaydını bul (tarihsel oran tespiti için)
  const firstValid = sortedSnaps.find(
    s => s.performance_value != null && Number(s.performance_value) > 0
  );

  let activeRatio = 1;
  let costRatio = 1;

  if (besDeduction && (besDeduction.value > 0 || besDeduction.cost > 0) && sortedSnaps[0]?.total_value > 0) {
    const tv = sortedSnaps[0].total_value;
    const tc = sortedSnaps[0].total_cost || tv;
    activeRatio = Math.min(1, Math.max(0.05, (tv - (besDeduction.value || 0)) / tv));
    costRatio = Math.min(1, Math.max(0.05, (tc - (besDeduction.cost || 0)) / tc));
  } else if (firstValid) {
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

  // 3. Seçilen zaman aralığına göre (7G, 1A, 3A vb.) filtrele
  let effectiveSnaps = sortedSnaps;
  if (rangeFromDate && sortedSnaps.length > 1) {
    const inRange = sortedSnaps.filter(s => s.snapshot_date >= rangeFromDate);
    if (inRange.length > 0) {
      // Dönem başlangıcından önceki en yakın snapshot'ı (en fazla 7 gün öncesi) baseline olarak al
      const preceding = sortedSnaps
        .filter(s => s.snapshot_date < rangeFromDate)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];

      if (preceding && inRange[0].snapshot_date > rangeFromDate) {
        const daysBeforeRange = (new Date(rangeFromDate).getTime() - new Date(preceding.snapshot_date).getTime()) / 86400000;
        if (daysBeforeRange <= 7) {
          effectiveSnaps = [preceding, ...inRange];
        } else {
          effectiveSnaps = inRange;
        }
      } else {
        effectiveSnaps = inRange;
      }
    }
  }

  // 4. Yalnızca tek bir snapshot varsa (örneğin sıfır kilometre yeni kullanıcı)
  // grafik çizgisinin oluşabilmesi için önceki güne maliyet tabanlı 1 başlangıç noktası ekle
  if (effectiveSnaps.length === 1) {
    const single = effectiveSnaps[0];
    const baseDate = (rangeFromDate && rangeFromDate < single.snapshot_date)
      ? rangeFromDate
      : (firstTxDate && firstTxDate < single.snapshot_date
          ? firstTxDate
          : new Date(new Date(single.snapshot_date).getTime() - 86400000).toISOString().split('T')[0]);

    const baseCost = single.total_cost > 0 ? single.total_cost : single.total_value;
    const basePerfCost = (single.performance_cost && single.performance_cost > 0)
      ? single.performance_cost
      : (single.performance_value || baseCost);

    effectiveSnaps = [
      {
        snapshot_date: baseDate,
        total_value: baseCost,
        total_cost: baseCost,
        performance_value: basePerfCost,
        performance_cost: basePerfCost
      },
      single
    ];
  }

  // 5. Ham snapshot verilerini doğrudan grafik noktalarına dönüştür & QQQM Benchmark hesapla
  // (KESİNLİKLE sentetik ara günler, leadDays veya yapay interpolasyon eklenmez!)
  let runningShares = 0;
  let runningInvested = 0;
  let previousActiveCost = 0;
  let lastKnownQqqmPriceTRY = 0;

  const points: BenchmarkChartPoint[] = effectiveSnaps.map((s, idx) => {
    const totalV = Number(s.total_value || 0);
    const totalC = Number(s.total_cost || 0);

    // Aktif Portföy: BES tutarı Day 0'dan itibaren tamamen çıkarılmış saf yatırım portföyü
    let activeV: number;
    let activeC: number;

    const hasPerf = s.performance_value != null && Number(s.performance_value) > 0;
    const userHasBES = besDeduction && (besDeduction.value > 0 || besDeduction.cost > 0);
    // If performance_value was recorded but is basically identical to total_value (historical unseparated data),
    // and the user has BES, treat it as containing BES and deduct BES.
    const perfHasBES = userHasBES && hasPerf && totalV > 0 && Number(s.performance_value) >= totalV * 0.95;

    if (hasPerf && !perfHasBES) {
      activeV = Number(s.performance_value);
      activeC = (s.performance_cost != null && Number(s.performance_cost) > 0)
        ? Number(s.performance_cost)
        : (totalC > 0 && firstValid ? Math.round(totalC * costRatio) : totalC);
    } else if (userHasBES) {
      activeV = Math.max(0, totalV - (besDeduction.value || 0));
      activeC = Math.max(0, totalC - (besDeduction.cost || 0));
    } else if (firstValid && Number(firstValid.performance_value) > 0) {
      activeV = Math.round(totalV * activeRatio);
      activeC = Math.round(totalC * costRatio);
    } else {
      activeV = totalV;
      activeC = totalC;
    }

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
      // Day 0: Benchmark doğrudan BES'siz aktif portföy değeriyle başlar
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
          runningInvested = activeC > 0 ? activeC : baseForShares;
        }
      } else {
        const costDelta = activeC - previousActiveCost;

        if (costDelta > 0 && qqqmPriceTRY > 0) {
          // Aktif portföye yeni nakit/maliyet eklendiğinde QQQM payı al
          const newShares = costDelta / qqqmPriceTRY;
          runningShares += newShares;
          runningInvested += costDelta;
        } else if (costDelta < 0 && previousActiveCost > 0) {
          // Sermaye çıkışı yapıldığında oransal pay itfası
          const withdrawRatio = Math.min(1, Math.abs(costDelta) / previousActiveCost);
          runningShares = Math.max(0, runningShares * (1 - withdrawRatio));
          runningInvested += costDelta;
        }
      }
      previousActiveCost = activeC;
      qqqmVal = runningShares * qqqmPriceTRY;
    }

    // Doğal kâr/zarar: total_value - total_cost
    const totalKar = totalC > 0 ? totalV - totalC : (totalV > 0 ? totalV : 0);

    return {
      date: formatDate(s.snapshot_date),
      rawDate: s.snapshot_date,
      deger: totalV,
      maliyet: totalC,
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
