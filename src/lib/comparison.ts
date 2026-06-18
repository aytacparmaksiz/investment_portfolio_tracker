const API_BASE = 'https://kumbaram-three.vercel.app/api/history'

export async function fetchHistoricalPrices(symbol: string, from: string): Promise<{date: string, price: number}[]> {
  try {
    const res = await fetch(`${API_BASE}?symbol=${symbol}&from=${from}`)
    const data = await res.json()
    return data.prices || []
  } catch {
    return []
  }
}

export async function calculateComparison(
  totalCost: number,
  fromDate: string
) {
  const [usdPrices, goldPrices] = await Promise.all([
    fetchHistoricalPrices('USDTRY=X', fromDate),
    fetchHistoricalPrices('GC=F', fromDate),
  ])

  // Başlangıç fiyatları
  const usdStart = usdPrices[0]?.price
  const usdEnd = usdPrices[usdPrices.length - 1]?.price
  const goldStart = goldPrices[0]?.price
  const goldEnd = goldPrices[goldPrices.length - 1]?.price

  // Dolar alsaydın: aynı TL ile kaç dolar alırdın, bugün ne eder
  const usdValue = usdStart ? (totalCost / usdStart) * (usdEnd || usdStart) : null

  // Altın alsaydın: aynı TL ile kaç ons alırdın, bugün ne eder (TRY cinsinden)
  const currentUsdTry = usdEnd || 38
  const goldValueUSD = goldStart ? (totalCost / (goldStart * (usdStart || 38))) * (goldEnd || goldStart) : null
  const goldValueTRY = goldValueUSD ? goldValueUSD * currentUsdTry : null

  // Enflasyon: aylık %3.5 bileşik (yaklaşık)
  const months = Math.max(1, Math.round(
    (new Date().getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24 * 30)
  ))
  const inflationValue = totalCost * Math.pow(1.035, months)

  return {
    usd: usdValue,
    gold: goldValueTRY,
    inflation: inflationValue,
    months
  }
}