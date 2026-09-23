import type { Asset } from '../types/index.ts'
import { FALLBACK_USD_RATE } from './constants.ts'
import { isPerformanceAsset, getCostValue } from './calculations.ts'
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
    // TEFAS fonları için maliyet ile bugünkü canlı fiyat arasında tarihe bağlı interpolasyon
    const startStr = (asset.start_date || asset.created_at || '').split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]
    const startCost = Number(asset.avg_cost || livePrice)

    if (date <= startStr) return startCost
    if (date >= todayStr) return livePrice

    const startTime = new Date(startStr).getTime()
    const endTime = new Date(todayStr).getTime()
    const targetTime = new Date(date).getTime()

    if (endTime > startTime) {
      const fraction = Math.min(1, Math.max(0, (targetTime - startTime) / (endTime - startTime)))
      return startCost + (livePrice - startCost) * fraction
    }
    return livePrice
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

  // 3. Tarih kümesini oluştur (fiyat tarihlerinden veya takvim günlerinden)
  const dateSet = new Set<string>()
  Object.values(priceMaps).forEach(series => {
    series.forEach(item => {
      if (item.date >= fromDate && item.date <= toDate) {
        dateSet.add(item.date)
      }
    })
  })

  // Eğer piyasa tarihleri çok az ise (örneğin tatil günleri veya ağ hatası), takvim günlerini üret
  if (dateSet.size < 5) {
    const curr = new Date(fromDate)
    const end = new Date(toDate)
    while (curr <= end) {
      dateSet.add(curr.toISOString().split('T')[0])
      curr.setDate(curr.getDate() + 1)
    }
  }

  // Her zaman bugünün tarihini ve başlangıç tarihini dahil et
  dateSet.add(fromDate)
  dateSet.add(toDate)

  const sortedDates = Array.from(dateSet).sort()
  const liveUsdRate = livePrices['USDTRY=X'] || FALLBACK_USD_RATE
  const usdSeries = priceMaps['USDTRY=X'] || []

  // Var olan DB snapshot'larını tarih eşleşmesi için haritalandır
  const dbSnapMap = new Map<string, SnapshotData>()
  existingSnapshots.forEach(s => {
    if (s.snapshot_date) dbSnapMap.set(s.snapshot_date, s)
  })

  // 4. Her bir gün için portföy toplam değerlerini hesapla
  const result: SnapshotRecord[] = sortedDates.map(date => {
    const existing = dbSnapMap.get(date)
    const currentUsdRate = findClosestPrice(usdSeries, date, liveUsdRate)

    // Eğer veritabanında bu tarihe ait geçerli bir snapshot varsa önceliklendir
    if (existing && existing.total_value > 0) {
      let perfVal = existing.performance_value
      let perfCost = existing.performance_cost

      // Eğer eski kayıtta performance_value null ise varlıklardan hesapla
      if (perfVal == null || Number(perfVal) <= 0) {
        perfVal = assets.reduce((sum, a) => {
          if (!isPerformanceAsset(a)) return sum
          const assetDate = (a.start_date || a.created_at || '').split('T')[0]
          if (assetDate > date) return sum
          const unitPrice = calculateAssetUnitPriceTRY(a, date, priceMaps, livePrices, currentUsdRate)
          return sum + Number(a.quantity || (a.type === 'vadeli' ? 1 : 0)) * unitPrice
        }, 0)
        perfCost = assets.reduce((sum, a) => {
          if (!isPerformanceAsset(a)) return sum
          const assetDate = (a.start_date || a.created_at || '').split('T')[0]
          if (assetDate > date) return sum
          return sum + getCostValue(a, currentUsdRate)
        }, 0)
      }

      return {
        snapshot_date: date,
        total_value: Math.round(Number(existing.total_value)),
        total_cost: Math.round(Number(existing.total_cost)),
        performance_value: Math.round(Number(perfVal)),
        performance_cost: Math.round(Number(perfCost || existing.total_cost)),
        created_at: existing.created_at
      }
    }

    // Veritabanında yoksa: varlıkların o günkü fiyatlarından yeniden hesapla
    let totalVal = 0
    let totalCost = 0
    let perfVal = 0
    let perfCost = 0

    assets.forEach(a => {
      const assetDate = (a.start_date || a.created_at || '').split('T')[0]
      // Varlık bu tarihten sonra alınmışsa o gün portföyde yoktur
      if (assetDate && assetDate > date) return

      const unitPrice = calculateAssetUnitPriceTRY(a, date, priceMaps, livePrices, currentUsdRate)
      const qty = Number(a.quantity || (['vadeli', 'bes'].includes(a.type) ? 1 : 0))
      const assetValue = a.type === 'vadeli' ? unitPrice : qty * unitPrice
      const assetCost = getCostValue(a, currentUsdRate)

      totalVal += assetValue
      totalCost += assetCost

      if (isPerformanceAsset(a)) {
        perfVal += assetValue
        perfCost += assetCost
      }
    })

    return {
      snapshot_date: date,
      total_value: Math.round(totalVal),
      total_cost: Math.round(totalCost),
      performance_value: Math.round(perfVal),
      performance_cost: Math.round(perfCost),
      created_at: `${date}T12:00:00.000Z`
    }
  })

  return result
}

/**
 * Yeniden oluşturulan snapshot'ları Supabase'e arka planda kaydeder.
 */
export async function batchSaveSnapshots(portfolioId: string, snapshots: SnapshotRecord[]) {
  if (!portfolioId || !snapshots || snapshots.length === 0) return

  try {
    // Mevcut tarihleri al
    const { data: existing } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date')
      .eq('portfolio_id', portfolioId)

    const existingDates = new Set((existing || []).map((e: any) => e.snapshot_date))
    const missing = snapshots.filter(s => !existingDates.has(s.snapshot_date))

    if (missing.length === 0) return

    // 25'erli paketler halinde kaydet
    const CHUNK_SIZE = 25
    for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
      const chunk = missing.slice(i, i + CHUNK_SIZE).map(s => ({
        portfolio_id: portfolioId,
        snapshot_date: s.snapshot_date,
        total_value: s.total_value,
        total_cost: s.total_cost,
        performance_value: s.performance_value,
        performance_cost: s.performance_cost
      }))

      await supabase.from('portfolio_snapshots').insert(chunk)
    }
  } catch (err) {
    console.warn('batchSaveSnapshots warning:', err)
  }
}
