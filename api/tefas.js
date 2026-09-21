export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const body = req.body || {}
  const rawCode = req.query.fundCode || req.query.symbol || req.query.code || body.fundCode || body.symbol || body.code
  if (!rawCode) {
    return res.status(400).json({ error: 'fundCode zorunlu' })
  }

  const fundCode = String(rawCode).trim().toUpperCase().replace(/^(TEFAS|FON):/, '').replace(/\.IS$/, '')

  // 1. Fonoloji API (Eğer API key tanımlı ise)
  const apiKey = process.env.FONOLOJI_API_KEY
  if (apiKey) {
    try {
      const response = await fetch(
        `https://fonoloji.com/v1/funds/${fundCode}`,
        { headers: { 'X-API-Key': apiKey } }
      )

      if (response.ok) {
        const data = await response.json()
        const fund = data?.fund

        if (fund && fund.current_price != null) {
          const price = Number(fund.current_price)
          const dailyPct = fund.daily_return != null ? Number(fund.daily_return) : undefined

          return res.status(200).json({
            symbol: fundCode,
            price,
            dailyPct,
            prices: [
              {
                date: fund.current_date || new Date().toISOString().split('T')[0],
                price,
                code: fund.code || fundCode,
                title: fund.name || fundCode,
                dailyPct
              }
            ]
          })
        }
      }
    } catch (err) {
      console.error('Fonoloji API hatası, doğrudan TEFAS deneniyor:', err)
    }
  }

  // 2. Doğrudan TEFAS Web API Fallback (BindHistoryInfo)
  try {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 10)

    const formatDateTR = (d) => {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      return `${dd}.${mm}.${yyyy}`
    }

    const queryTefas = async (fontip) => {
      const tefasRes = await fetch('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: new URLSearchParams({
          fontip,
          fonkod: fundCode,
          bastarih: formatDateTR(start),
          bittarih: formatDateTR(end)
        })
      })

      if (!tefasRes.ok) return []
      const tefasData = await tefasRes.json()
      return tefasData?.data || (Array.isArray(tefasData) ? tefasData : [])
    }

    let list = await queryTefas('YAT')
    if (!Array.isArray(list) || list.length === 0) {
      list = await queryTefas('EMK')
    }

    if (Array.isArray(list) && list.length > 0) {
      const sorted = [...list].sort((a, b) => {
        const ta = a.TARIH ? new Date(a.TARIH).getTime() : 0
        const tb = b.TARIH ? new Date(b.TARIH).getTime() : 0
        return tb - ta
      })
      const latest = sorted[0]
      const price = Number(latest.FIYAT || latest.price)
      if (!isNaN(price) && price > 0) {
        const prevItem = sorted[1]
        const prevPrice = prevItem ? Number(prevItem.FIYAT || prevItem.price) : null
        const dailyPct = (prevPrice && prevPrice > 0) ? ((price - prevPrice) / prevPrice) * 100 : undefined

        return res.status(200).json({
          symbol: fundCode,
          price,
          dailyPct,
          prices: [
            {
              date: latest.TARIH ? new Date(latest.TARIH).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              price,
              code: fundCode,
              title: latest.FONUNVANI || fundCode,
              dailyPct
            }
          ]
        })
      }
    }
  } catch (tefasErr) {
    console.error('TEFAS doğrudan erişim hatası:', tefasErr)
  }

  return res.status(404).json({ error: 'Fon bulunamadı veya fiyat yok', prices: [] })
}