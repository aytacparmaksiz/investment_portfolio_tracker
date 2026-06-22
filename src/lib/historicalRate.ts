const API_BASE = 'https://kumbaram-three.vercel.app/api/history'

export async function fetchHistoricalRate(date: string): Promise<number | null> {
  try {
    // Tarihten 5 gün öncesinden bugüne kadar veri çek, en yakın tarihi bul
    const res = await fetch(`${API_BASE}?symbol=USDTRY%3DX&from=${date}`)
    const data = await res.json()
    const prices = data.prices || []
    if (prices.length === 0) return null

    // Girilen tarihe en yakın (eşit veya sonraki) kaydı bul
    const target = new Date(date).getTime()
    let closest = prices[0]
    let minDiff = Math.abs(new Date(prices[0].date).getTime() - target)

    for (const p of prices) {
      const diff = Math.abs(new Date(p.date).getTime() - target)
      if (diff < minDiff) {
        minDiff = diff
        closest = p
      }
    }

    return closest.price
  } catch {
    return null
  }
}