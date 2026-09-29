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

const cryptoCache: Record<string, { try: number; usd: number; dailyPct?: number }> = {}

export async function fetchCryptoPrice(symbol: string, usdtry: number, coingeckoId?: string): Promise<{ try: number; usd: number; dailyPct?: number } | null> {
  const sym = symbol.trim().toUpperCase()
  const cleanCoingeckoId = coingeckoId?.trim().toLowerCase()
  const id = cleanCoingeckoId || CRYPTO_IDS[sym]

  // 1. Binance 24hr Ticker (Fast, CEX cryptos, zero rate limits)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2500)
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}USDT`, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (res.ok) {
      const data = await res.json()
      if (data?.lastPrice) {
        const usd = Number(data.lastPrice)
        const dailyPct = data?.priceChangePercent != null && !isNaN(Number(data.priceChangePercent))
          ? Number(data.priceChangePercent)
          : undefined
        const result = {
          try: usd * usdtry,
          usd,
          dailyPct
        }
        cryptoCache[sym] = result
        return result
      }
    }
  } catch {
    // devam et
  }

  // 2. DexScreener API (DEX tokens, meme coins, liquid staking tokens like P33, PHAR, Uniswap/Raydium/Pharaoh tokens)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(sym)}`, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (res.ok) {
      const data = await res.json()
      if (data?.pairs && data.pairs.length > 0) {
        const exactMatches = data.pairs.filter((p: any) => p.baseToken?.symbol?.toUpperCase() === sym)
        exactMatches.sort((a: any, b: any) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))
        const bestPair = exactMatches[0] || data.pairs[0]
        const priceUsd = Number(bestPair.priceUsd)
        if (!isNaN(priceUsd) && priceUsd > 0) {
          const dailyPct = bestPair.priceChange?.h24 != null && !isNaN(Number(bestPair.priceChange.h24))
            ? Number(bestPair.priceChange.h24)
            : undefined
          const result = {
            try: priceUsd * usdtry,
            usd: priceUsd,
            dailyPct
          }
          cryptoCache[sym] = result
          return result
        }
      }
    }
  } catch {
    // devam et
  }

  // 3. GeckoTerminal On-chain Pools API (CoinGecko DEX network backup)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(sym)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    clearTimeout(timeoutId)
    if (res.ok) {
      const data = await res.json()
      const pools = data?.data
      if (Array.isArray(pools) && pools.length > 0) {
        const first = pools[0]
        const priceUsd = Number(first.attributes?.base_token_price_usd)
        if (!isNaN(priceUsd) && priceUsd > 0) {
          const dailyPct = first.attributes?.price_change_percentage?.h24 != null && !isNaN(Number(first.attributes.price_change_percentage.h24))
            ? Number(first.attributes.price_change_percentage.h24)
            : undefined
          const result = {
            try: priceUsd * usdtry,
            usd: priceUsd,
            dailyPct
          }
          cryptoCache[sym] = result
          return result
        }
      }
    }
  } catch {
    // devam et
  }

  // 4. CoinGecko Simple Price
  if (id) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)
      const res = await fetch(`${COINGECKO}/simple/price?ids=${id}&vs_currencies=try,usd&include_24hr_change=true`, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (res.ok) {
        const data = await res.json()
        const tryPrice = data?.[id]?.try
        const usdPrice = data?.[id]?.usd
        if (usdPrice) {
          const usd = Number(usdPrice)
          const result = {
            try: tryPrice ? Number(tryPrice) : usd * usdtry,
            usd,
            dailyPct: data[id].usd_24h_change != null ? Number(data[id].usd_24h_change) : undefined
          }
          cryptoCache[sym] = result
          return result
        }
      }
    } catch {
      // devam et
    }
  }

  // 5. Yahoo Finance
  try {
    const detail = await fetchPriceDetails(`${sym}-USD`)
    if (detail && detail.price) {
      const usd = detail.price
      const result = {
        try: usd * usdtry,
        usd,
        dailyPct: detail.dailyPct
      }
      cryptoCache[sym] = result
      return result
    }
  } catch {
    // devam et
  }

  // 6. Cache veya son çare
  if (cryptoCache[sym]) {
    return cryptoCache[sym]
  }

  return null
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
      const cryptoPrice = await fetchCryptoPrice(sym, usdtry, asset.coingecko_id)
      if (cryptoPrice) {
        setPrice(sym, cryptoPrice.try, cryptoPrice.dailyPct)
        prices[sym + '_usd'] = cryptoPrice.usd
        prices[rawSym + '_usd'] = cryptoPrice.usd
        prices[sym.toLowerCase() + '_usd'] = cryptoPrice.usd
      } else if (asset.avg_cost) {
        const usdCost = Number(asset.avg_cost)
        if (!isNaN(usdCost) && usdCost > 0) {
          setPrice(sym, usdCost * usdtry, 0)
          prices[sym + '_usd'] = usdCost
          prices[rawSym + '_usd'] = usdCost
          prices[sym.toLowerCase() + '_usd'] = usdCost
        }
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
          prices[sym + '_usd'] = gramGoldPrice / usdtry
        } else if (sym === 'CEYREK') {
          setPrice(sym, gramGoldPrice * 1.6065, daily)
          prices[sym + '_usd'] = (gramGoldPrice * 1.6065) / usdtry
        } else if (sym === 'YARIM') {
          setPrice(sym, gramGoldPrice * 3.2130, daily)
          prices[sym + '_usd'] = (gramGoldPrice * 3.2130) / usdtry
        } else if (sym === 'TAM') {
          setPrice(sym, gramGoldPrice * 6.4260, daily)
          prices[sym + '_usd'] = (gramGoldPrice * 6.4260) / usdtry
        } else if (sym === 'CUMHURIYET' || sym === 'ATA') {
          setPrice(sym, gramGoldPrice * 7.2160, daily)
          prices[sym + '_usd'] = (gramGoldPrice * 7.2160) / usdtry
        } else if (sym === 'XAU') {
          setPrice(sym, xauPrice * usdtry, daily)
          prices[sym + '_usd'] = xauPrice
          prices[rawSym + '_usd'] = xauPrice
          prices[sym.toLowerCase() + '_usd'] = xauPrice
        } else {
          setPrice(sym, xauPrice * usdtry, daily)
          prices[sym + '_usd'] = xauPrice
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