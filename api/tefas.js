export default async function handler(req, res) {
  const { fundCode } = req.query;

  if (!fundCode) {
    return res.status(400).json({ error: 'fundCode zorunlu' });
  }

  const apiKey = process.env.FONOLOJI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'FONOLOJI_API_KEY tanımlı değil' });
  }

  try {
    const response = await fetch(
      `https://fonoloji.com/v1/funds/${fundCode.toUpperCase()}`,
      { headers: { 'X-API-Key': apiKey } }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'Fonoloji API hatası', detail: errText });
    }

    const data = await response.json();
    const fund = data?.fund;

    if (!fund || fund.current_price == null) {
      return res.status(404).json({ error: 'Fon bulunamadı veya fiyat yok', prices: [] });
    }

    // lib/prices.ts'in beklediği { prices: [...] } formatına çeviriyoruz
    res.status(200).json({
      prices: [
        { date: fund.current_date, price: fund.current_price, code: fund.code, title: fund.name }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: 'TEFAS verisi alınamadı', detail: err.message });
  }
}