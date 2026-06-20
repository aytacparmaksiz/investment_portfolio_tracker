const COINGECKO = 'https://api.coingecko.com/api/v3'
const API_BASE = 'https://kumbaram-three.vercel.app/api/price'

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
}

async function fetchPriceFull(symbol: string): Promise<{price: number, prevClose: number} | null> {
  try {
    const res = await fetch(`${API_BASE}?symbol=${encodeURIComponent(symbol)}`)
    const data = await res.json()
    if (!data?.price) return null
    return { price: Number(data.price), prevClose: Number(data.prevClose || data.price) }
  } catch {
    return null
  }
}

async function fetchPrice(symbol: string): Promise<number | null> {
  const r = await fetchPriceFull(symbol)
  return r?.price ?? null
}

export async function fetchCryptoPrice(symbol: string): Promise<number | null> {
  try {
    const id = CRYPTO_IDS[symbol.toUpperCase()]
    if (!id) return null
    const res = await fetch(`${COINGECKO}/simple/price?ids=${id}&vs_currencies=try`)
    const data = await res.json()
    return data?.[id]?.try ?? null
  } catch {
    return null
  }
}

export async function fetchAllPrices(assets: any[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}

  // Önce USD/TRY kuru al
  const usdtry = await fetchPrice('USDTRY=X') ?? 46.4
  prices['USDTRY=X'] = usdtry

  await Promise.all(assets.map(async (asset) => {
    if (!asset.symbol) return
    const sym = asset.symbol.toUpperCase()

if (asset.type === 'hisse') {
      let r = await fetchPriceFull(`${sym}.IS`)
      if (!r) r = await fetchPriceFull(`${sym}.E.IS`)
      if (r) {
        prices[sym] = r.price
        prices[sym + '_dailypct'] = r.prevClose ? ((r.price - r.prevClose) / r.prevClose) * 100 : 0
      }

    } else if (asset.type === 'usd_hisse') {
      const r = await fetchPriceFull(sym)
      if (r) {
        prices[sym] = r.price * usdtry
        prices[sym + '_dailypct'] = r.prevClose ? ((r.price - r.prevClose) / r.prevClose) * 100 : 0
      }

    } else if (asset.type === 'etf') {
      const r = await fetchPriceFull(sym)
      if (r) {
        prices[sym] = r.price * usdtry
        prices[sym + '_dailypct'] = r.prevClose ? ((r.price - r.prevClose) / r.prevClose) * 100 : 0
      }

    } else if (asset.type === 'kripto') {
      const id = asset.coingecko_id || CRYPTO_IDS[sym]
      if (id) {
        try {
          const res = await fetch(`${COINGECKO}/simple/price?ids=${id}&vs_currencies=try,usd&include_24hr_change=true`)
          const data = await res.json()
          if (data?.[id]?.try) prices[sym] = data[id].try
          if (data?.[id]?.usd) prices[sym + '_usd'] = data[id].usd
          if (data?.[id]?.try_24h_change !== undefined) prices[sym + '_dailypct'] = data[id].try_24h_change
        } catch {}
      } else {
        const price = await fetchCryptoPrice(sym)
        if (price) prices[sym] = price
      }
    } else if (asset.type === 'doviz') {
      const dovizMap: Record<string, string> = {
        USD: 'USDTRY=X', EUR: 'EURTRY=X', GBP: 'GBPTRY=X', CHF: 'CHFTRY=X'
      }
      const yahooSym = dovizMap[sym] || `${sym}TRY=X`
      const price = await fetchPrice(yahooSym)
      if (price) prices[sym] = price

    } else if (asset.type === 'altin') {
      if (sym === 'TRYG') {
        // Gram altın: ons fiyatı / 31.1035 * usdtry
        const xauPrice = await fetchPrice('GC=F')
        if (xauPrice) prices[sym] = (xauPrice / 31.1035) * usdtry
      } else {
        // Ons altın veya diğer
        const price = await fetchPrice('GC=F')
        if (price) prices[sym] = price * usdtry
      }
    }
  }))

  return prices
}