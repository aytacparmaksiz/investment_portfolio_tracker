export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    const { q } = req.query
    if (!q) return res.status(400).json({ error: 'q gerekli' })
  
    try {
      const res2 = await fetch(`https://api.coingecko.com/api/v3/search?query=${q}`)
      const data = await res2.json()
      const coins = (data?.coins || []).slice(0, 8).map((c: any) => ({
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        id: c.id,
        type: 'CRYPTOCURRENCY'
      }))
      return res.status(200).json({ coins })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }