export interface Asset {
  id: string;
  portfolio_id: string;
  symbol: string;
  type: string;
  quantity?: number;
  avg_cost?: number;
  total_try_cost?: number;
  principal?: number;
  interest_rate?: number;
  start_date?: string;
  created_at: string;
  manual_values?: { value: number; recorded_at: string }[];
}

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
}
