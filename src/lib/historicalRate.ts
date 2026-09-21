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

export async function fetchHistoricalRatesBatch(dates: string[]): Promise<Record<string, number>> {
  if (!dates.length) return {}
  const result: Record<string, number> = {}

  try {
    const validDates = dates.filter(Boolean)
    if (validDates.length === 0) return {}

    const sortedDates = [...validDates].sort()
    const earliest = sortedDates[0]

    // Tek bir istek ile en eski tarihten bugüne kur serisini çek
    const res = await fetch(`${API_BASE}?symbol=USDTRY%3DX&from=${earliest}&interval=1d`)
    if (res.ok) {
      const data = await res.json()
      const prices: { date: string; price: number }[] = data.prices || []
      if (prices.length > 0) {
        for (const date of validDates) {
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
          if (closest?.price) {
            result[date] = closest.price
          }
        }
      }
    }
  } catch (err) {
    console.warn('Batch historical rate fetch error, falling back to parallel fetch:', err)
  }

  // Eksik kalan tarihler varsa paralel olarak Promise.all ile çek
  const missingDates = dates.filter(d => d && !result[d])
  if (missingDates.length > 0) {
    const fallbackResults = await Promise.all(
      missingDates.map(async (d) => {
        const rate = await fetchHistoricalRate(d)
        return { date: d, rate }
      })
    )
    for (const item of fallbackResults) {
      if (item.rate) {
        result[item.date] = item.rate
      }
    }
  }

  return result
}