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

async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}?symbol=${symbol}`)
    const data = await res.json()
    return data?.price ? Number(data.price) : null
  } catch {
    return null
  }
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
  const usdtry = await fetchPrice('USDTRY=X') ?? 38

  await Promise.all(assets.map(async (asset) => {
    if (!asset.symbol) return
    const sym = asset.symbol.toUpperCase()

    if (asset.type === 'hisse') {
      let price = await fetchPrice(`${sym}.IS`)
      if (!price) price = await fetchPrice(`${sym}.E.IS`)
      if (price) prices[sym] = price

    } else if (asset.type === 'usd_hisse') {
      const usdPrice = await fetchPrice(sym)
      if (usdPrice) prices[sym] = usdPrice * usdtry

    } else if (asset.type === 'etf') {
      const usdPrice = await fetchPrice(sym)
      if (usdPrice) prices[sym] = usdPrice * usdtry

    } else if (asset.type === 'kripto') {
      const price = await fetchCryptoPrice(sym)
      if (price) prices[sym] = price

    } else if (asset.type === 'doviz') {
      const dovizMap: Record<string, string> = {
        USD: 'USDTRY=X',
        EUR: 'EURTRY=X',
        GBP: 'GBPTRY=X',
        XAU: 'GC=F',
        ALTIN: 'GC=F',
        TRYG: 'GC=F',
      }
      const yahooSym = dovizMap[sym] || `${sym}TRY=X`
      const price = await fetchPrice(yahooSym)

      if (sym === 'TRYG' && price) {
        // Gram altın: ons fiyatı (USD) / 31.1035 * usdtry
        prices[sym] = (price / 31.1035) * usdtry
      } else if (price) {
        prices[sym] = price
      }
    }
  }))

  return prices
}