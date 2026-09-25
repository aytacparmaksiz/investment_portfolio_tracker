import { useState, useRef, useEffect, useCallback } from 'react';
import { searchTicker } from '../lib/search.ts';

export const useAssetSearch = () => {
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cancel any pending timers or in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const updateSearchResults = useCallback((results: any[] | ((prev: any[]) => any[])) => {
    if (typeof results !== 'function' && results.length === 0) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setSearching(false);
    }
    setSearchResults(results);
  }, []);

  const executeSearch = useCallback((value: string, type: string) => {
    // 1. Cancel previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // 2. Abort previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 3. Check query threshold
    if (!value || value.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    // Immediate user feedback while debouncing
    setSearching(true);

    // 4. Start 300ms debounce
    debounceTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const { signal } = controller;

      try {
        if (type === 'kripto') {
          try {
            const res = await fetch(`https://kumbaram-three.vercel.app/api/crypto-search?q=${encodeURIComponent(value)}`, { signal });
            if (signal.aborted) return;
            if (!res.ok) {
              if (!signal.aborted) setSearchResults([]);
              return;
            }
            const data = await res.json();
            if (!signal.aborted) {
              setSearchResults(data.coins || []);
            }
          } catch (err: any) {
            if (err?.name === 'AbortError' || signal.aborted) return;
            setSearchResults([]);
          }
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
          if (!signal.aborted) {
            setSearchResults(filtered.map(m => ({ ...m, type: 'METAL', exchange: 'TR' })));
          }
          return;
        }

        if (type === 'fon') {
          const clean = value.trim().toUpperCase().replace(/^(TEFAS|FON):/, '').replace(/\.IS$/, '');
          if (clean.length >= 2) {
            try {
              const endpoints = [
                `https://kumbaram-three.vercel.app/api/tefas?fundCode=${encodeURIComponent(clean)}`,
                `/api/tefas?fundCode=${encodeURIComponent(clean)}`
              ];
              let foundTitle: string | null = null;
              for (const url of endpoints) {
                if (signal.aborted) return;
                try {
                  const res = await fetch(url, { signal });
                  if (res.ok) {
                    const data = await res.json();
                    foundTitle = data?.prices?.[0]?.title || data?.title || null;
                    if (foundTitle) break;
                  }
                } catch (endpointErr: any) {
                  if (endpointErr?.name === 'AbortError' || signal.aborted) throw endpointErr;
                  // next endpoint
                }
              }
              if (!signal.aborted) {
                setSearchResults([{
                  symbol: clean,
                  name: foundTitle || `${clean} TEFAS Fonu`,
                  type: 'FON',
                  exchange: 'TEFAS'
                }]);
              }
            } catch (err: any) {
              if (err?.name === 'AbortError' || signal.aborted) return;
              setSearchResults([{ symbol: clean, name: `${clean} Yatırım Fonu`, type: 'FON', exchange: 'TEFAS' }]);
            }
          } else {
            if (!signal.aborted) setSearchResults([]);
          }
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
          if (!signal.aborted) {
            setSearchResults(filtered.map(c => ({ ...c, type: 'CURRENCY', exchange: 'TRY' })));
          }
          return;
        }

        // Default: Stock / ETF
        if (signal.aborted) return;
        const results = await searchTicker(value, signal);
        if (signal.aborted) return;
        const typeMap: Record<string, string> = { hisse: 'EQUITY', usd_hisse: 'EQUITY', etf: 'ETF' };
        const wantedType = typeMap[type];
        const filtered = wantedType ? results.filter((r: any) => r.type === wantedType) : results;
        if (!signal.aborted) {
          setSearchResults(filtered.slice(0, 5));
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || signal.aborted) {
          return;
        }
        setSearchResults([]);
      } finally {
        if (!signal.aborted) {
          setSearching(false);
        }
      }
    }, 300);
  }, []);

  return { searchResults, searching, executeSearch, setSearchResults: updateSearchResults };
};
