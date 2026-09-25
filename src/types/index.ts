export type AssetType =
  | 'hisse'
  | 'usd_hisse'
  | 'kripto'
  | 'etf'
  | 'doviz'
  | 'altin'
  | 'fon'
  | 'bes'
  | 'vadeli'
  | 'nakit'
  | 'usd_nakit'
  | 'eur_nakit';

export interface Asset {
  id: string;
  portfolio_id: string;
  name?: string;
  symbol: string;
  type: AssetType | string;
  quantity?: number;
  avg_cost?: number;
  total_try_cost?: number;
  principal?: number;
  interest_rate?: number;
  start_date?: string;
  maturity_date?: string;
  maturity_days?: number;
  sector?: string;
  strategy?: string;
  coingecko_id?: string;
  created_at: string;
  manual_values?: { value: number; recorded_at: string }[];
}

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
}

export interface Liability {
  id: string;
  portfolio_id?: string;
  name: string;
  amount: number;
  currency?: 'TRY' | 'USD';
  monthly_payment?: number;
  interest_rate?: number;
  created_at?: string;
}

