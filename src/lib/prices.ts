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

function formatDateTR(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}.${m}.${y}`
}

export async function fetchFundPrice(fundCode: string): Promise<number | null> {
  try {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 10) // hafta sonu/tatil için 10 günlük tampon

    const params = new URLSearchParams({
      fundCode: fundCode.toUpperCase(),
      startDate: formatDateTR(start),
      endDate: formatDateTR(end),
    })

    const res = await fetch(`${TEFAS_API}?${params}`)
    const data = await res.json()
    const prices = data?.prices || []
    if (!prices.length) return null

    const sorted = [...prices].sort(
      (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    return sorted[0]?.price ?? null
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
        USD: 'USDTRY=X', EUR: 'EURTRY=X', GBP: 'GBPTRY=X', CHF: 'CHFTRY=X'
      }
      const yahooSym = dovizMap[sym] || `${sym}TRY=X`
      const price = await fetchPrice(yahooSym)
      if (price) prices[sym] = price

    } else if (asset.type === 'altin') {
      const xauPrice = await fetchPrice('GC=F')
      if (xauPrice) {
        // Gram Altın (24 Ayar Has Altın) fiyatını hesapla
        const gramGoldPrice = (xauPrice / 31.1035) * usdtry

        if (sym === 'TRYG') {
          prices[sym] = gramGoldPrice
        } else if (sym === 'CEYREK') {
          prices[sym] = gramGoldPrice * 1.6065
        } else if (sym === 'YARIM') {
          prices[sym] = gramGoldPrice * 3.2130
        } else if (sym === 'TAM') {
          prices[sym] = gramGoldPrice * 6.4260
        } else if (sym === 'CUMHURIYET' || sym === 'ATA') {
          prices[sym] = gramGoldPrice * 7.2160
        } else if (sym === 'XAU') {
          prices[sym] = xauPrice
        } else {
          prices[sym] = xauPrice * usdtry
        }
      }

    } else if (asset.type === 'fon') {
      const price = await fetchFundPrice(sym)
      if (price) prices[sym] = price
    }
  }))

  return prices
}