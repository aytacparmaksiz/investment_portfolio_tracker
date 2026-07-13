export default async function handler(req, res) {
    const { fundCode, startDate, endDate } = req.query;
  
    if (!fundCode || !startDate || !endDate) {
      return res.status(400).json({ error: 'fundCode, startDate, endDate zorunlu' });
    }
  
    const params = new URLSearchParams({
      fontip: 'YAT', // YAT: yatırım fonu, EMK: emeklilik fonu
      sfontur: '',
      fonkod: fundCode,
      fongrup: '',
      bastarih: startDate, // format: GG.AA.YYYY
      bittarih: endDate,   // format: GG.AA.YYYY
      fonturkod: '',
      fonunvantip: '',
    });
  
    try {
      const response = await fetch('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://www.tefas.gov.tr',
          'Referer': 'https://www.tefas.gov.tr/TarihselVeriler.aspx',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        body: params,
      });
      
      const raw = await response.json();
  
      const prices = (raw.data || []).map((item) => ({
        date: item.TARIH,
        price: parseFloat(item.FIYAT),
        code: item.FONKODU,
        title: item.FONUNVAN,
      }));
  
      res.status(200).json({ prices });
    } catch (err) {
      res.status(500).json({ error: 'TEFAS verisi alınamadı', detail: err.message });
    }
  }