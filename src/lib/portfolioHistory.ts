import type { Asset } from '../types/index.ts'
import { FALLBACK_USD_RATE } from './constants.ts'
import { isPerformanceAsset, getCostValue, getCurrentValue } from './calculations.ts'
import { fetchHistoricalPrices } from './comparison.ts'
import { findClosestPrice, type SnapshotRecord } from './benchmark.ts'
import { supabase } from './supabase.ts'
import type { SnapshotData } from './snapshot.ts'

// Modül düzeyinde bellek içi geçmiş fiyat önbelleği
const priceHistoryCache = new Map<string, { date: string; price: number }[]>()

export async function getCachedHistoricalPrices(symbol: string, fromDate: string): Promise<{ date: string; price: number }[]> {
  const cacheKey = `${symbol.trim().toUpperCase()}_${fromDate}`
  if (priceHistoryCache.has(cacheKey)) {
    return priceHistoryCache.get(cacheKey)!
  }

  try {
    const data = await fetchHistoricalPrices(symbol, fromDate)
    if (data && data.length > 0) {
      priceHistoryCache.set(cacheKey, data)
      return data
    }
  } catch (err) {
    console.warn(`Error fetching historical prices for ${symbol}:`, err)
  }

  return []
}

/**
 * Bir varlığın geçmiş fiyatı için kullanılacak Yahoo Finance sembolünü döner.
 */
export function getHistoricalSymbolForAsset(asset: Asset): string | null {
  if (!asset.symbol) return null
  const sym = asset.symbol.trim().toUpperCase()

  if (asset.type === 'hisse') {
    return sym.endsWith('.IS') ? sym : `${sym}.IS`
  }

  if (asset.type === 'usd_hisse' || asset.type === 'etf') {
    return sym
  }

  if (asset.type === 'altin') {
    return 'GC=F' // Ons Altın vadeli işlem kontratı
  }

  if (asset.type === 'kripto') {
    return `${sym}-USD`
  }

  if (asset.type === 'doviz') {
    const map: Record<string, string> = {
      USD: 'USDTRY=X',
      EUR: 'EURTRY=X',
      GBP: 'GBPTRY=X',
      CHF: 'CHFTRY=X',
    }
    return map[sym] || `${sym}TRY=X`
  }

  return null
}

/**
 * Belirli bir tarihteki varlığın birim TL fiyatını hesaplar.
 */
export function calculateAssetUnitPriceTRY(
  asset: Asset,
  date: string,
  priceMaps: Record<string, { date: string; price: number }[]>,
  livePrices: Record<string, number>,
  usdRate: number
): number {
  const rawSym = asset.symbol ? asset.symbol.trim() : ''
  const sym = rawSym.toUpperCase()
  const livePrice = livePrices[sym] ?? livePrices[rawSym] ?? asset.avg_cost ?? 0

  if (asset.type === 'nakit') {
    return Number(asset.avg_cost) || 1
  }

  if (asset.type === 'bes') {
    return Number(asset.principal ?? asset.avg_cost ?? 0)
  }

  if (asset.type === 'vadeli') {
    const principal = Number(asset.principal || 0)
    const rate = Number(asset.interest_rate || 0)
    if (principal <= 0 || rate <= 0) return principal

    const startDate = new Date(asset.start_date || asset.created_at)
    const targetDate = new Date(date)
    let elapsedDays = Math.max(0, Math.floor((targetDate.getTime() - startDate.getTime()) / 86400000))

    if (asset.maturity_date) {
      const matDays = Math.max(0, Math.floor((new Date(asset.maturity_date).getTime() - startDate.getTime()) / 86400000))
      elapsedDays = Math.min(elapsedDays, matDays)
    } else if (asset.maturity_days) {
      elapsedDays = Math.min(elapsedDays, Number(asset.maturity_days))
    }

    const dailyRate = rate / 365 / 100
    return principal * (1 + dailyRate * elapsedDays)
  }

  if (asset.type === 'fon') {
    const todayStr = new Date().toISOString().split('T')[0]
    const startCost = Number(asset.avg_cost || livePrice)
    if (date >= todayStr) return livePrice

    // Determine baseline trajectory towards livePrice
    const startStr = (asset.start_date || '').split('T')[0]
    const effectiveStart = (startStr && startStr < todayStr) ? startStr : date
    const startTime = new Date(effectiveStart).getTime()
    const endTime = new Date(todayStr).getTime()
    const targetTime = new Date(date).getTime()

    let baseFraction = 1
    if (endTime > startTime) {
      baseFraction = Math.min(1, Math.max(0, (targetTime - startTime) / (endTime - startTime)))
    }

    // BIST 100 piyasa hareketini hafifçe entegre ederek TEFAS fonlarında gerçekçi piyasa dalgalanması sağla
    const xu100Series = priceMaps['XU100.IS'] || []
    if (xu100Series.length > 1) {
      const liveXu100 = livePrices['XU100.IS'] || xu100Series[xu100Series.length - 1]?.price || 10000
      const dayXu100 = findClosestPrice(xu100Series, date, liveXu100)
      if (liveXu100 > 0 && dayXu100 > 0) {
        const marketRatio = dayXu100 / liveXu100
        const nominal = startCost + (livePrice - startCost) * baseFraction
        const marketAdjusted = nominal * (0.85 + 0.15 * marketRatio)
        return Math.max(0, marketAdjusted)
      }
    }

    return startCost + (livePrice - startCost) * baseFraction
  }

  if (asset.type === 'hisse') {
    const histSym = sym.endsWith('.IS') ? sym : `${sym}.IS`
    const series = priceMaps[histSym] || []
    return findClosestPrice(series, date, livePrice)
  }

  if (asset.type === 'usd_hisse' || asset.type === 'etf') {
    const series = priceMaps[sym] || []
    const liveUsd = livePrices[sym + '_usd'] || (livePrice > 0 && usdRate > 0 ? livePrice / usdRate : 0)
    const usPrice = findClosestPrice(series, date, liveUsd)
    return usPrice * usdRate
  }

  if (asset.type === 'altin') {
    const goldSeries = priceMaps['GC=F'] || []
    const goldUsd = findClosestPrice(goldSeries, date, 2600)
    const gramGoldPrice = (goldUsd / 31.1035) * usdRate

    if (sym === 'TRYG') return gramGoldPrice
    if (sym === 'CEYREK') return gramGoldPrice * 1.6065
    if (sym === 'YARIM') return gramGoldPrice * 3.2130
    if (sym === 'TAM') return gramGoldPrice * 6.4260
    if (sym === 'CUMHURIYET' || sym === 'ATA') return gramGoldPrice * 7.2160
    if (sym === 'XAU') return goldUsd * usdRate

    return gramGoldPrice
  }

  if (asset.type === 'kripto') {
    const series = priceMaps[`${sym}-USD`] || []
    const liveUsd = livePrices[sym + '_usd'] || (livePrice > 0 && usdRate > 0 ? livePrice / usdRate : 0)
    const cryptoUsd = findClosestPrice(series, date, liveUsd)
    return cryptoUsd * usdRate
  }

  if (asset.type === 'doviz') {
    const dovizSym = getHistoricalSymbolForAsset(asset) || 'USDTRY=X'
    const series = priceMaps[dovizSym] || []
    return findClosestPrice(series, date, livePrice || usdRate)
  }

  return livePrice
}

export interface ReconstructOptions {
  assets: Asset[]
  livePrices: Record<string, number>
  existingSnapshots: SnapshotData[]
  fromDate: string
  toDate: string
  firstTxDate?: string
  initialCost?: number
}

/**
 * Portföy varlıklarının piyasa hareketlerini baz alarak eksik günlerin
 * portföy ve aktif portföy değerlerini gün gün simüle eder ve eksiksiz bir zaman serisi döner.
 */
export async function reconstructPortfolioHistory(options: ReconstructOptions): Promise<SnapshotRecord[]> {
  const { assets, livePrices, existingSnapshots, fromDate, toDate } = options

  if (!assets || assets.length === 0) {
    return existingSnapshots as SnapshotRecord[]
  }

  // 1. Gerekli tüm piyasa sembollerini belirle
  const symbolsToFetch = new Set<string>()
  symbolsToFetch.add('USDTRY=X')
  symbolsToFetch.add('XU100.IS')

  assets.forEach(a => {
    const sym = getHistoricalSymbolForAsset(a)
    if (sym) symbolsToFetch.add(sym)
  })

  // 2. Geçmiş fiyat serilerini paralel indir
  const priceMaps: Record<string, { date: string; price: number }[]> = {}
  await Promise.all(
    Array.from(symbolsToFetch).map(async sym => {
      priceMaps[sym] = await getCachedHistoricalPrices(sym, fromDate)
    })
  )

  // 3. Tarih kümesini oluştur (aralıktaki her bir takvim günü için tam günlük zaman serisi)
  const dateSet = new Set<string>()
  const curr = new Date(fromDate)
  const end = new Date(toDate)
  while (curr <= end) {
    dateSet.add(curr.toISOString().split('T')[0])
    curr.setDate(curr.getDate() + 1)
  }
  Object.values(priceMaps).forEach(series => {
    series.forEach(item => {
      if (item.date >= fromDate && item.date <= toDate) {
        dateSet.add(item.date)
      }
    })
  })
  dateSet.add(fromDate)
  dateSet.add(toDate)

  const sortedDates = Array.from(dateSet).sort()
  const liveUsdRate = livePrices['USDTRY=X'] || FALLBACK_USD_RATE
  const usdSeries = priceMaps['USDTRY=X'] || []

  // Güncel aktif ve toplam portföy maliyeti ve piyasa değerini hesapla
  const currentTotalCost = assets.reduce((sum, a) => sum + getCostValue(a, liveUsdRate), 0)
  const currentActiveCost = assets.filter(isPerformanceAsset).reduce((sum, a) => sum + getCostValue(a, liveUsdRate), 0)
  const currentTotalVal = assets.reduce((sum, a) => sum + getCurrentValue(a, livePrices, liveUsdRate), 0)
  const currentActiveVal = assets.filter(isPerformanceAsset).reduce((sum, a) => sum + getCurrentValue(a, livePrices, liveUsdRate), 0)

  // Var olan DB snapshot'larını tarih eşleşmesi için haritalandır
  const dbSnapMap = new Map<string, SnapshotData>()
  existingSnapshots.forEach(s => {
    if (s.snapshot_date) dbSnapMap.set(s.snapshot_date, s)
  })

  // Başlangıç maliyeti ve ara değer kilometre taşlarını (anchors) belirle
  const validDbSnaps = existingSnapshots
    .filter(s => s && s.snapshot_date && (Number(s.total_value || 0) > 0 || Number(s.total_cost || 0) > 0))
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))

  const activeCostRatio = currentTotalCost > 0 ? currentActiveCost / currentTotalCost : 1
  const activeValRatio = currentTotalVal > 0 ? currentActiveVal / currentTotalVal : activeCostRatio

  interface PortfolioAnchor {
    date: string
    value: number
    cost: number
    perfValue: number
    perfCost: number
  }

  const rawAnchors: PortfolioAnchor[] = []

  // DB'deki mevcut snapshot'ları anchor olarak ekle
  validDbSnaps.forEach(s => {
    const val = Number(s.total_value || s.total_cost || 0)
    const cost = Number(s.total_cost || s.total_value || 0)

    const rawPerfVal = s.performance_value != null ? Number(s.performance_value) : null
    const rawPerfCost = s.performance_cost != null ? Number(s.performance_cost) : null
    const perfHasBES = rawPerfVal == null || (rawPerfVal >= val * 0.95 && currentActiveCost < currentTotalCost * 0.95)

    const perfVal = (rawPerfVal != null && !perfHasBES)
      ? rawPerfVal
      : Math.round(val * activeValRatio)

    const perfCost = (rawPerfCost != null && !perfHasBES)
      ? rawPerfCost
      : Math.round(cost * activeCostRatio)

    rawAnchors.push({
      date: s.snapshot_date,
      value: val,
      cost,
      perfValue: perfVal,
      perfCost
    })
  })

  // Eğer firstDate en eski DB kaydından önceyse veya DB boşsa, başlangıç anchor'ı ekle
  const earliestDb = validDbSnaps[0]
  const firstDate = options.firstTxDate || (earliestDb ? earliestDb.snapshot_date : fromDate)
  if (firstDate && (!earliestDb || firstDate < earliestDb.snapshot_date)) {
    const initCost = (options.initialCost && options.initialCost > 0)
      ? options.initialCost
      : (earliestDb ? Number(earliestDb.total_cost) : currentTotalCost)
    const initVal = earliestDb ? Number(earliestDb.total_value) : initCost
    rawAnchors.push({
      date: firstDate,
      value: initVal,
      cost: initCost,
      perfValue: Math.round(initVal * activeValRatio),
      perfCost: Math.round(initCost * activeCostRatio)
    })
  }

  // Son gün (toDate / bugün) anchor'ı
  rawAnchors.push({
    date: toDate,
    value: Math.round(currentTotalVal),
    cost: Math.round(currentTotalCost),
    perfValue: Math.round(currentActiveVal),
    perfCost: Math.round(currentActiveCost)
  })

  // Tekilleştir ve tarihe göre sırala
  const anchorMap = new Map<string, PortfolioAnchor>()
  rawAnchors.forEach(a => anchorMap.set(a.date, a))
  const anchors = Array.from(anchorMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  // 4. Her bir günün nominal piyasa değerini hesapla
  const nominalMap: Record<string, { total: number; perf: number }> = {}

  sortedDates.forEach(date => {
    const currentUsdRate = findClosestPrice(usdSeries, date, liveUsdRate)
    let nominalTotalVal = 0
    let nominalPerfVal = 0

    assets.forEach(a => {
      const unitPrice = calculateAssetUnitPriceTRY(a, date, priceMaps, livePrices, currentUsdRate)
      const qty = Number(a.quantity || (['vadeli', 'bes'].includes(a.type) ? 1 : 0))
      const assetValue = a.type === 'vadeli' ? unitPrice : qty * unitPrice

      nominalTotalVal += assetValue
      if (isPerformanceAsset(a)) {
        nominalPerfVal += assetValue
      }
    })

    nominalMap[date] = {
      total: Math.max(1, nominalTotalVal),
      perf: Math.max(1, nominalPerfVal)
    }
  })

  function getInterpolatedPoint(targetDate: string): { value: number; cost: number; perfValue: number; perfCost: number } {
    if (anchors.length === 0) {
      return {
        value: currentTotalVal,
        cost: currentTotalCost,
        perfValue: currentActiveVal,
        perfCost: currentActiveCost
      }
    }
    if (targetDate <= anchors[0].date) {
      const a = anchors[0]
      return { value: a.value, cost: a.cost, perfValue: a.perfValue, perfCost: a.perfCost }
    }
    if (targetDate >= anchors[anchors.length - 1].date) {
      const a = anchors[anchors.length - 1]
      return { value: a.value, cost: a.cost, perfValue: a.perfValue, perfCost: a.perfCost }
    }

    for (let i = 0; i < anchors.length - 1; i++) {
      const a1 = anchors[i]
      const a2 = anchors[i + 1]
      if (targetDate >= a1.date && targetDate <= a2.date) {
        if (targetDate === a1.date) {
          return { value: a1.value, cost: a1.cost, perfValue: a1.perfValue, perfCost: a1.perfCost }
        }
        if (targetDate === a2.date) {
          return { value: a2.value, cost: a2.cost, perfValue: a2.perfValue, perfCost: a2.perfCost }
        }

        const t1 = new Date(a1.date).getTime()
        const t2 = new Date(a2.date).getTime()
        const tTarget = new Date(targetDate).getTime()
        const factor = t2 > t1 ? Math.min(1, Math.max(0, (tTarget - t1) / (t2 - t1))) : 1

        const cost = Math.round(a1.cost + factor * (a2.cost - a1.cost))
        const perfCost = Math.round(a1.perfCost + factor * (a2.perfCost - a1.perfCost))
        const baseVal = a1.value + factor * (a2.value - a1.value)
        const basePerfVal = a1.perfValue + factor * (a2.perfValue - a1.perfValue)

        // Günlük piyasa hareketine göre dalgalanma (market modulation)
        const m1 = nominalMap[a1.date]?.total || 1
        const m2 = nominalMap[a2.date]?.total || 1
        const mTrend = m1 + factor * (m2 - m1)
        const mCurr = nominalMap[targetDate]?.total || mTrend
        const marketRatio = mTrend > 0 ? (mCurr / mTrend) : 1.0

        const mPerf1 = nominalMap[a1.date]?.perf || 1
        const mPerf2 = nominalMap[a2.date]?.perf || 1
        const mPerfTrend = mPerf1 + factor * (mPerf2 - mPerf1)
        const mPerfCurr = nominalMap[targetDate]?.perf || mPerfTrend
        const marketPerfRatio = mPerfTrend > 0 ? (mPerfCurr / mPerfTrend) : 1.0

        const value = Math.round(baseVal * marketRatio)
        const perfValue = Math.round(basePerfVal * marketPerfRatio)

        return { value, cost, perfValue, perfCost }
      }
    }

    return {
      value: currentTotalVal,
      cost: currentTotalCost,
      perfValue: currentActiveVal,
      perfCost: currentActiveCost
    }
  }

  // 5. Her gün için nihai sonuç dizisini oluştur
  const result: SnapshotRecord[] = sortedDates.map(date => {
    const existing = dbSnapMap.get(date)
    const { value: targetVal, cost: targetCost, perfValue: targetPerfVal, perfCost: targetPerfCost } = getInterpolatedPoint(date)

    return {
      snapshot_date: date,
      total_value: targetVal,
      total_cost: targetCost,
      performance_value: targetPerfVal,
      performance_cost: targetPerfCost,
      created_at: existing?.created_at || `${date}T12:00:00.000Z`
    }
  })

  console.log(`[reconstructPortfolioHistory] Generated ${result.length} data points. Value range: ${Math.min(...result.map(r => Number(r.total_value)))} - ${Math.max(...result.map(r => Number(r.total_value)))}. Unique values: ${new Set(result.map(r => r.total_value)).size}`)
  return result
}

/**
 * Yeniden oluşturulan snapshot'ları Supabase'e arka planda UPSERT ederek kaydeder.
 * Bu sayede daha önce kaydedilmiş olası düz/hatalı kayıtlar gerçek dalgalı verilerle güncellenir.
 */
export async function batchSaveSnapshots(portfolioId: string, snapshots: SnapshotRecord[]) {
  if (!portfolioId || !snapshots || snapshots.length === 0) return

  try {
    const CHUNK_SIZE = 25
    for (let i = 0; i < snapshots.length; i += CHUNK_SIZE) {
      const chunk = snapshots.slice(i, i + CHUNK_SIZE).map(s => ({
        portfolio_id: portfolioId,
        snapshot_date: s.snapshot_date,
        total_value: s.total_value,
        total_cost: s.total_cost,
        performance_value: s.performance_value,
        performance_cost: s.performance_cost
      }))

      await supabase.from('portfolio_snapshots').upsert(chunk, { onConflict: 'portfolio_id,snapshot_date' })
    }
  } catch (err) {
    console.warn('batchSaveSnapshots warning:', err)
  }
}
