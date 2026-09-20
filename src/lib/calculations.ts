import type { Asset } from '../types';
import { FALLBACK_USD_RATE } from './constants';

export const isUSD = (type: string): boolean => {
  return ['usd_hisse', 'kripto', 'etf'].includes(type);
};

export const getCurrentValue = (a: Asset, fetchedPrices: Record<string, number>, usdtry: number = FALLBACK_USD_RATE): number => {
  if (['bes', 'vadeli'].includes(a.type)) {
    if (a.type === 'vadeli' && a.principal && a.interest_rate) {
      const start = new Date(a.start_date || a.created_at);
      const days = Math.max(
        0,
        Math.floor((new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      );
      const dailyRate = Number(a.interest_rate) / 365 / 100;
      return Number(a.principal) * (1 + dailyRate * days);
    }

    const vals = a.manual_values || [];
    return Number(vals[vals.length - 1]?.value || 0);
  }

  // Nakit
  if (a.type === 'nakit') {
    return Number(a.quantity || 0) * (Number(a.avg_cost) || 1);
  }

  const price = fetchedPrices[a.symbol];
  if (price !== undefined) {
    return Number(price) * Number(a.quantity || 0);
  }

  // Fallbacks if price is not fetched
  if (isUSD(a.type)) {
    return Number(a.avg_cost || 0) * usdtry * Number(a.quantity || 0);
  }

  return Number(a.avg_cost || 0) * Number(a.quantity || 0);
};

export const getCostValue = (a: Asset, usdtry: number = FALLBACK_USD_RATE): number => {
  if (a.type === 'bes') {
    return Number(a.principal ?? a.avg_cost ?? 0);
  }

  if (a.type === 'vadeli') {
    return Number(a.principal ?? 0);
  }

  if (a.type === 'nakit') {
    return Number(a.quantity || 0) * (Number(a.avg_cost) || 1);
  }

  if (isUSD(a.type)) {
    if (a.total_try_cost) return Number(a.total_try_cost);
    return Number(a.avg_cost || 0) * Number(a.quantity || 0) * usdtry;
  }

  return Number(a.avg_cost || 0) * Number(a.quantity || 0);
};

export const isPerformanceAsset = (a: Asset): boolean => {
  if (a.type === 'bes') return false;
  return true;
};
