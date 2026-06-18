export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  
    const { q } = req.query
    if (!q) return res.status(400).json({ error: 'q gerekli' })
  
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=5&newsCount=0&listsCount=0`
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      })
      const data = await response.json()
      const quotes = data?.quotes?.map((q: any) => ({
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        type: q.quoteType,
        exchange: q.exchange
      })) || []
  
      return res.status(200).json({ quotes })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }