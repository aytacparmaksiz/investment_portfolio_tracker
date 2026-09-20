import { useState } from 'react';

export const useAssetSearch = () => {
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const executeSearch = async (value: string, type: string) => {
    if (value.length < 2) { 
      setSearchResults([]); 
      return; 
    }

    if (type === 'kripto') {
      setSearching(true);
      try {
        const res = await fetch(`https://kumbaram-three.vercel.app/api/crypto-search?q=${value}`);
        const data = await res.json();
        setSearchResults(data.coins || []);
      } catch { 
        setSearchResults([]); 
      }
      setSearching(false);
      return;
    }

    if (type === 'altin') {
      const METALS = [
        { symbol: 'TRYG', name: 'Gram Altın' }, { symbol: 'CEYREK', name: 'Çeyrek Altın' },
        { symbol: 'YARIM', name: 'Yarım Altın' }, { symbol: 'TAM', name: 'Tam Altın' },
        { symbol: 'CUMHURIYET', name: 'Cumhuriyet Altını' }, { symbol: 'ATA', name: 'Ata Altın' },
        { symbol: 'XAU', name: 'Ons Altın' }, { symbol: 'XAG', name: 'Gümüş (Ons)' },
        { symbol: 'GRAMGUMUS', name: 'Gram Gümüş' },
      ];
      const filtered = METALS.filter(m => m.symbol.toLowerCase().includes(value.toLowerCase()) || m.name.toLowerCase().includes(value.toLowerCase()));
      setSearchResults(filtered.map(m => ({ ...m, type: 'METAL', exchange: 'TR' })));
      return;
    }

    if (type === 'fon') { 
      setSearchResults([]); 
      return; 
    }

    if (type === 'doviz') {
      const CURRENCIES = [
        { symbol: 'USD', name: 'Amerikan Doları' }, { symbol: 'EUR', name: 'Euro' },
        { symbol: 'GBP', name: 'İngiliz Sterlini' }, { symbol: 'CHF', name: 'İsviçre Frangı' },
        { symbol: 'JPY', name: 'Japon Yeni' }, { symbol: 'CAD', name: 'Kanada Doları' },
        { symbol: 'AUD', name: 'Avustralya Doları' }, { symbol: 'SEK', name: 'İsveç Kronu' },
        { symbol: 'RUB', name: 'Rus Rublesi' }, { symbol: 'CNY', name: 'Çin Yuanı' },
      ];
      const filtered = CURRENCIES.filter(c => c.symbol.toLowerCase().includes(value.toLowerCase()) || c.name.toLowerCase().includes(value.toLowerCase()));
      setSearchResults(filtered.map(c => ({ ...c, type: 'CURRENCY', exchange: 'TRY' })));
      return;
    }

    setSearching(true);
    const { searchTicker } = await import('../lib/search');
    const results = await searchTicker(value);
    const typeMap: Record<string, string> = { hisse: 'EQUITY', usd_hisse: 'EQUITY', etf: 'ETF' };
    const wantedType = typeMap[type];
    const filtered = wantedType ? results.filter((r: any) => r.type === wantedType) : results;
    setSearchResults(filtered.slice(0, 5));
    setSearching(false);
  };

  return { searchResults, searching, executeSearch, setSearchResults };
};
