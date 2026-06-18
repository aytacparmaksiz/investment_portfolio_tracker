export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { symbol, from } = req.query
  if (!symbol || !from) return res.status(400).json({ error: 'symbol ve from gerekli' })

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&period1=${Math.floor(new Date(from).getTime()/1000)}&period2=${Math.floor(Date.now()/1000)}`
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
    })).filter((p: any) => p.price)

    return res.status(200).json({ symbol, prices })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}