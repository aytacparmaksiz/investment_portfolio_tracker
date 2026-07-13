export default async function handler(req, res) {
  const { fundCode, startDate, endDate } = req.query;

  if (!fundCode || !startDate || !endDate) {
    return res.status(400).json({ error: 'fundCode, startDate, endDate zorunlu' });
  }

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  };

  try {
    // 1. Adım: Sayfayı ziyaret edip session cookie al
    const pageResponse = await fetch('https://www.tefas.gov.tr/TarihselVeriler.aspx', {
      method: 'GET',
      headers: browserHeaders,
    });

    const setCookieHeader = pageResponse.headers.get('set-cookie') || '';
    const cookies = setCookieHeader.split(',').map(c => c.split(';')[0]).join('; ');

// 2. Adım: Alınan cookie ile veriyi çek — fon tipini otomatik dene (YAT / EMK / BYF)
const fundTypes = ['YAT', 'EMK', 'BYF'];
let raw = { data: [] };
let triedType = null;

for (const fontip of fundTypes) {
  const params = new URLSearchParams({
    fontip,
    sfontur: '',
    fonkod: fundCode,
    fongrup: '',
    bastarih: startDate,
    bittarih: endDate,
    fonturkod: '',
    fonunvantip: '',
  });

  const response = await fetch('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
    method: 'POST',
    headers: {
      ...browserHeaders,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Origin': 'https://www.tefas.gov.tr',
      'Referer': 'https://www.tefas.gov.tr/TarihselVeriler.aspx',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookies,
    },
    body: params,
  });

  const result = await response.json();
  triedType = fontip;
  if (result?.data?.length > 0) {
    raw = result;
    break;
  }
}

const prices = (raw.data || []).map((item) => ({
  date: item.TARIH,
  price: parseFloat(item.FIYAT),
  code: item.FONKODU,
  title: item.FONUNVAN,
}));

res.status(200).json({ prices, debug: { cookiesReceived: !!cookies, rawCount: (raw.data || []).length, matchedType: raw.data?.length ? triedType : null } });
  } catch (err) {
    res.status(500).json({ error: 'TEFAS verisi alınamadı', detail: err.message });
  }
}