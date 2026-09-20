export const ASSET_TYPES = [
  { value: 'hisse', label: 'BIST Hisse', hasSymbol: true, symbolPlaceholder: 'THYAO, GARAN...', currency: 'TRY' },
  { value: 'usd_hisse', label: 'ABD Hisse', hasSymbol: true, symbolPlaceholder: 'AAPL, TSLA...', currency: 'USD' },
  { value: 'kripto', label: '₿ Kripto', hasSymbol: true, symbolPlaceholder: 'BTC, ETH...', currency: 'USD' },
  { value: 'etf', label: '📈 ETF', hasSymbol: true, symbolPlaceholder: 'SPY, QQQ...', currency: 'USD' },
  { value: 'doviz', label: '💱 Döviz', hasSymbol: true, symbolPlaceholder: 'USD, EUR, GBP...', currency: 'TRY' },
  { value: 'altin', label: '🥇 Altın', hasSymbol: true, symbolPlaceholder: 'TRYG, CEYREK...', currency: 'TRY' },
  { value: 'fon', label: '📊 TEFAS Fon', hasSymbol: true, symbolPlaceholder: 'TP2, AFT...', currency: 'TRY' },
  { value: 'bes', label: '🏦 BES', hasSymbol: false, currency: 'TRY' },
  { value: 'vadeli', label: '💰 Vadeli Mevduat', hasSymbol: false, currency: 'TRY' },
  { value: 'nakit', label: '💵 TRY Nakit', hasSymbol: false, currency: 'TRY' },
];

export const ASSET_LABELS: Record<string, string> = {
  hisse: '🇹🇷 BIST', usd_hisse: '🇺🇸 ABD', kripto: '₿ Kripto',
  etf: '📈 ETF', doviz: '💱 Döviz', altin: '🥇 Altın', fon: '📊 Fon', nakit: '💵 Nakit', bes: '🏦 BES', vadeli: '💰 Vadeli'
};

export const FALLBACK_USD_RATE = 46.4;
