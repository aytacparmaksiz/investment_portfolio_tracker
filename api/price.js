export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { symbol } = req.query
  if (!symbol) return res.status(400).json({ error: 'Symbol gerekli' })

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      }
    )

    const data = await response.json()
    const meta = data?.chart?.result?.[0]?.meta
    const lastQuoteClose = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c) => c != null && !isNaN(c)).slice(-1)[0]
    const price = meta?.regularMarketPrice ?? lastQuoteClose
    const currency = meta?.currency
    const prevClose = meta?.chartPreviousClose ?? meta?.previousClose
    const dailyPct = (price && prevClose) ? ((price - prevClose) / prevClose) * 100 : undefined

    if (!price) return res.status(404).json({ error: 'Fiyat bulunamadı' })

    return res.status(200).json({ symbol, price, currency, prevClose, dailyPct })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}