const COINGECKO = 'https://api.coingecko.com/api/v3'
const API_BASE = 'https://kumbaram-three.vercel.app/api/price'
const TEFAS_API = 'https://kumbaram-three.vercel.app/api/tefas'

const CRYPTO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  USDT: 'tether',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  ADA: 'cardano',
  LINK: 'chainlink',
  LTC: 'litecoin',
  P33: 'pharaoh-liquid-staking-token',
  USDC: 'usd-coin',
}

export interface PriceDetail {
  price: number
  dailyPct?: number
}

export async function fetchPriceDetails(symbol: string): Promise<PriceDetail | null> {
  const cleanSymbol = symbol.trim().toUpperCase()
  const endpoints = [
    `${API_BASE}?symbol=${encodeURIComponent(cleanSymbol)}`,
    `/api/price?symbol=${encodeURIComponent(cleanSymbol)}`
  ]

  for (const url of endpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)

      if (!res.ok) continue
      const data = await res.json()
      if (data?.price != null && !isNaN(Number(data.price))) {
        return {
          price: Number(data.price),
          dailyPct: data.dailyPct != null && !isNaN(Number(data.dailyPct)) ? Number(data.dailyPct) : undefined
        }
      }
    } catch {
      // sonraki endpointi dene
    }
  }

  return null
}

export async function fetchPrice(symbol: string): Promise<number | null> {
  const details = await fetchPriceDetails(symbol)
  return details ? details.price : null
}

export async function fetchCryptoPrice(symbol: string): Promise<{ try: number; usd: number; dailyPct?: number } | null> {
  try {
    const id = CRYPTO_IDS[symbol.trim().toUpperCase()]
    if (!id) return null
    const res = await fetch(`${COINGECKO}/simple/price?ids=${id}&vs_currencies=try,usd&include_24hr_change=true`)
    const data = await res.json()
    const tryPrice = data?.[id]?.try
    const usdPrice = data?.[id]?.usd
    const dailyPct = data?.[id]?.usd_24h_change != null ? Number(data[id].usd_24h_change) : undefined
    if (!tryPrice || !usdPrice) return null
    return { try: Number(tryPrice), usd: Number(usdPrice), dailyPct }
  } catch {
    return null
  }
}

function formatDateTR(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}.${m}.${y}`
}

export async function fetchFundDetails(fundCode: string): Promise<PriceDetail | null> {
  if (!fundCode || !fundCode.trim()) return null
  const cleanCode = fundCode.trim().toUpperCase().replace(/^(TEFAS|FON):/, '').replace(/\.IS$/, '')

  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 10)

  const params = new URLSearchParams({
    fundCode: cleanCode,
    symbol: cleanCode,
    startDate: formatDateTR(start),
    endDate: formatDateTR(end),
  })

  const endpoints = [
    `${TEFAS_API}?${params}`,
    `/api/tefas?${params}`
  ]

  for (const url of endpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 7000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)

      if (!res.ok) continue
      const data = await res.json()

      const prices = Array.isArray(data) ? data : (data?.prices || data?.data || [])
      if (Array.isArray(prices) && prices.length > 0) {
        const valid = prices.filter((p: any) => p && Number(p.price ?? p.FIYAT ?? p.current_price) > 0)
        if (valid.length > 0) {
          const sorted = [...valid].sort(
            (a: any, b: any) => (a.date || a.TARIH ? new Date(a.date || a.TARIH).getTime() : 0) - (b.date || b.TARIH ? new Date(b.date || b.TARIH).getTime() : 0)
          )
          const latest = sorted[sorted.length - 1]
          const price = Number(latest.price ?? latest.FIYAT ?? latest.current_price)
          if (!isNaN(price) && price > 0) {
            let dailyPct = (latest.dailyPct != null || latest.daily_return != null)
              ? Number(latest.dailyPct ?? latest.daily_return)
              : undefined
            if (dailyPct === undefined && sorted.length >= 2) {
              const prev = Number(sorted[sorted.length - 2].price ?? sorted[sorted.length - 2].FIYAT ?? sorted[sorted.length - 2].current_price)
              if (prev > 0) {
                dailyPct = ((price - prev) / prev) * 100
              }
            }
            return { price, dailyPct }
          }
        }
      }

      const directPrice = Number(data?.price ?? data?.current_price ?? data?.FIYAT)
      if (!isNaN(directPrice) && directPrice > 0) {
        return {
          price: directPrice,
          dailyPct: (data?.dailyPct != null || data?.daily_return != null)
            ? Number(data.dailyPct ?? data.daily_return)
            : undefined
        }
      }
    } catch {
      // diğer endpoint
    }
  }

  return null
}

export async function fetchFundPrice(fundCode: string): Promise<number | null> {
  const details = await fetchFundDetails(fundCode)
  return details ? details.price : null
}

export async function fetchAllPrices(assets: any[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}

  // Önce USD/TRY kuru al
  const usdtryDetail = await fetchPriceDetails('USDTRY=X')
  const usdtry = usdtryDetail?.price ?? 38
  prices['USDTRY=X'] = usdtry
  if (usdtryDetail?.dailyPct !== undefined) {
    prices['USDTRY=X_dailypct'] = usdtryDetail.dailyPct
  }

  await Promise.all(assets.map(async (asset) => {
    if (!asset.symbol) return
    const rawSym = asset.symbol
    const sym = rawSym.trim().toUpperCase()

    const setPrice = (key: string, val: number, daily?: number) => {
      prices[key] = val
      prices[rawSym] = val
      prices[sym] = val
      prices[sym.toLowerCase()] = val
      if (daily !== undefined) {
        prices[key + '_dailypct'] = daily
        prices[rawSym + '_dailypct'] = daily
        prices[sym + '_dailypct'] = daily
        prices[sym.toLowerCase() + '_dailypct'] = daily
      }
    }

    if (asset.type === 'hisse') {
      let detail = await fetchPriceDetails(`${sym}.IS`)
      if (!detail) detail = await fetchPriceDetails(`${sym}.E.IS`)
      if (detail) {
        setPrice(sym, detail.price, detail.dailyPct)
      }

    } else if (asset.type === 'usd_hisse' || asset.type === 'etf') {
      const detail = await fetchPriceDetails(sym)
      if (detail) {
        setPrice(sym, detail.price * usdtry, detail.dailyPct)
        prices[sym + '_usd'] = detail.price
        prices[rawSym + '_usd'] = detail.price
        prices[sym.toLowerCase() + '_usd'] = detail.price
      }

    } else if (asset.type === 'kripto') {
      const cryptoPrice = await fetchCryptoPrice(sym)
      if (cryptoPrice) {
        setPrice(sym, cryptoPrice.try, cryptoPrice.dailyPct)
        prices[sym + '_usd'] = cryptoPrice.usd
        prices[rawSym + '_usd'] = cryptoPrice.usd
        prices[sym.toLowerCase() + '_usd'] = cryptoPrice.usd
      }

    } else if (asset.type === 'doviz') {
      const dovizMap: Record<string, string> = {
        USD: 'USDTRY=X', EUR: 'EURTRY=X', GBP: 'GBPTRY=X', CHF: 'CHFTRY=X'
      }
      const yahooSym = dovizMap[sym] || `${sym}TRY=X`
      const detail = await fetchPriceDetails(yahooSym)
      if (detail) {
        setPrice(sym, detail.price, detail.dailyPct)
      }

    } else if (asset.type === 'altin') {
      const detail = await fetchPriceDetails('GC=F')
      if (detail) {
        const xauPrice = detail.price
        const gramGoldPrice = (xauPrice / 31.1035) * usdtry
        const daily = detail.dailyPct

        if (sym === 'TRYG') {
          setPrice(sym, gramGoldPrice, daily)
        } else if (sym === 'CEYREK') {
          setPrice(sym, gramGoldPrice * 1.6065, daily)
        } else if (sym === 'YARIM') {
          setPrice(sym, gramGoldPrice * 3.2130, daily)
        } else if (sym === 'TAM') {
          setPrice(sym, gramGoldPrice * 6.4260, daily)
        } else if (sym === 'CUMHURIYET' || sym === 'ATA') {
          setPrice(sym, gramGoldPrice * 7.2160, daily)
        } else if (sym === 'XAU') {
          setPrice(sym, xauPrice, daily)
        } else {
          setPrice(sym, xauPrice * usdtry, daily)
        }
      }

    } else if (asset.type === 'fon') {
      const fundDetail = await fetchFundDetails(sym)
      if (fundDetail) {
        setPrice(sym, fundDetail.price, fundDetail.dailyPct)
      }
    }
  }))

  return prices
}