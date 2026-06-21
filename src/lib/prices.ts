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

export async function fetchAllPrices(assets: any[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}

  // Önce USD/TRY kuru al
  const usdtry = await fetchPrice('USDTRY=X') ?? 46.4
  prices['USDTRY=X'] = usdtry

  // Kripto varlıkları topla ve TEK seferde sorgula
  const kriptoAssets = assets.filter(a => a.type === 'kripto' && a.symbol)
  const kriptoIdMap: Record<string, string> = {} // id -> sym
  kriptoAssets.forEach(a => {
    const sym = a.symbol.toUpperCase()
    const id = a.coingecko_id || CRYPTO_IDS[sym]
    if (id) kriptoIdMap[id] = sym
  })

  const kriptoIds = Object.keys(kriptoIdMap)
  if (kriptoIds.length > 0) {
    try {
      const res = await fetch(`${COINGECKO}/simple/price?ids=${kriptoIds.join(',')}&vs_currencies=try,usd&include_24hr_change=true`)
      const data = await res.json()
      Object.entries(kriptoIdMap).forEach(([id, sym]) => {
        if (data?.[id]?.try) prices[sym] = data[id].try
        if (data?.[id]?.usd) prices[sym + '_usd'] = data[id].usd
        if (data?.[id]?.try_24h_change !== undefined) prices[sym + '_dailypct'] = data[id].try_24h_change
      })
    } catch {}
  }

  // Diğer varlık türleri (paralel)
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
        const gramPrice = (xauPrice / 31.1035) * usdtry
        const GOLD_GRAMS: Record<string, number> = {
          TRYG: 1, CEYREK: 1.75, YARIM: 3.5, TAM: 7.0,
          CUMHURIYET: 7.0, ATA: 7.2,
        }
        if (sym === 'XAU') {
          prices[sym] = xauPrice * usdtry
        } else if (sym === 'XAG' || sym === 'GRAMGUMUS') {
          const xagPrice = await fetchPrice('SI=F')
          if (xagPrice) {
            prices[sym] = sym === 'XAG' ? xagPrice * usdtry : (xagPrice / 31.1035) * usdtry
          }
        } else if (GOLD_GRAMS[sym]) {
          prices[sym] = gramPrice * GOLD_GRAMS[sym]
        } else {
          prices[sym] = gramPrice
        }
      }
    }
  }))

  return prices
}