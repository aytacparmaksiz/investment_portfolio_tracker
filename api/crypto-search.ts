export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { q } = req.query
  if (!q) return res.status(400).json({ error: 'q gerekli' })

  const queryStr = String(q).trim()
  const coins: any[] = []
  const seen = new Set<string>()

  // 1. Try CoinGecko Search
  try {
    const cgRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(queryStr)}`)
    if (cgRes.ok) {
      const data = await cgRes.json()
      for (const c of (data?.coins || []).slice(0, 8)) {
        const sym = c.symbol.toUpperCase()
        if (!seen.has(sym)) {
          seen.add(sym)
          coins.push({
            symbol: sym,
            name: c.name,
            id: c.id,
            type: 'CRYPTOCURRENCY'
          })
        }
      }
    }
  } catch {
    // continue to DexScreener
  }

  // 2. Try DexScreener Search (Finds DEX, LST, meme tokens like P33, PHAR, etc.)
  if (coins.length < 8) {
    try {
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(queryStr)}`)
      if (dexRes.ok) {
        const dexData = await dexRes.json()
        if (dexData?.pairs && Array.isArray(dexData.pairs)) {
          for (const pair of dexData.pairs) {
            const sym = pair.baseToken?.symbol?.toUpperCase()
            if (sym && !seen.has(sym)) {
              seen.add(sym)
              coins.push({
                symbol: sym,
                name: `${pair.baseToken?.name || sym} (${pair.dexId || 'DEX'})`,
                id: sym.toLowerCase(),
                type: 'CRYPTOCURRENCY'
              })
            }
            if (coins.length >= 8) break
          }
        }
      }
    } catch {
      // continue
    }
  }

  return res.status(200).json({ coins })
}