const API_BASE = 'https://kumbaram-three.vercel.app/api/history'

export async function fetchHistoricalPrices(symbol: string, from: string): Promise<{date: string, price: number}[]> {
  try {
    const res = await fetch(`${API_BASE}?symbol=${encodeURIComponent(symbol)}&from=${from}`)
    const data = await res.json()
    return data.prices || []
  } catch {
    return []
  }
}

export async function calculateComparison(totalCost: number, fromDate: string) {
  const [sp500Prices, bistPrices, goldPrices, usdPrices] = await Promise.all([
    fetchHistoricalPrices('^GSPC', fromDate),
    fetchHistoricalPrices('XU100.IS', fromDate),
    fetchHistoricalPrices('GC=F', fromDate),
    fetchHistoricalPrices('USDTRY=X', fromDate),
  ])

  const usdStart = usdPrices[0]?.price || 38
  const usdEnd = usdPrices[usdPrices.length - 1]?.price || 38

  // S&P 500: USD bazlı, TRY'ye çevir
  const sp500Start = sp500Prices[0]?.price
  const sp500End = sp500Prices[sp500Prices.length - 1]?.price
  const sp500Value = sp500Start
    ? (totalCost / (sp500Start * usdStart)) * (sp500End || sp500Start) * usdEnd
    : null

  // BIST 100: zaten TRY bazlı
  const bistStart = bistPrices[0]?.price
  const bistEnd = bistPrices[bistPrices.length - 1]?.price
  const bistValue = bistStart
    ? (totalCost / bistStart) * (bistEnd || bistStart)
    : null

  // Altın: USD bazlı, TRY'ye çevir
  const goldStart = goldPrices[0]?.price
  const goldEnd = goldPrices[goldPrices.length - 1]?.price
  const goldValue = goldStart
    ? (totalCost / (goldStart * usdStart)) * (goldEnd || goldStart) * usdEnd
    : null

  // Enflasyon: aylık ~%3.5 bileşik
  const months = Math.max(1, Math.round(
    (new Date().getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24 * 30)
  ))
  const inflationValue = totalCost * Math.pow(1.035, months)

  return {
    sp500: sp500Value,
    bist: bistValue,
    gold: goldValue,
    inflation: inflationValue,
    months
  }
}