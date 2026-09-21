export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { symbol, from, interval: requestedInterval } = req.query
  if (!symbol || !from) return res.status(400).json({ error: 'symbol ve from gerekli' })

  const fromTime = Math.floor(new Date(from).getTime() / 1000)
  const toTime = Math.floor(Date.now() / 1000)
  const diffDays = (toTime - fromTime) / 86400

  // Interval belirtilmemişse, 1 yıldan kısa ise 1d, daha uzun ise 1mo
  const interval = requestedInterval || (diffDays <= 365 ? '1d' : '1mo')

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&period1=${fromTime}&period2=${toTime}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    })
    const data = await response.json()
    const timestamps = data?.chart?.result?.[0]?.timestamp || []
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []

    const prices = timestamps.map((t: number, i: number) => ({
      date: new Date(t * 1000).toISOString().split('T')[0],
      price: closes[i]
    })).filter((p: any) => p.price != null && !isNaN(p.price))

    return res.status(200).json({ symbol, prices })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}