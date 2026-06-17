export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
  
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
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
      const currency = data?.chart?.result?.[0]?.meta?.currency
  
      if (!price) return res.status(404).json({ error: 'Fiyat bulunamadı' })
  
      return res.status(200).json({ symbol, price, currency })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }