import { supabase } from './supabase'

export async function saveSnapshot(
  portfolioId: string,
  totalValue: number,
  totalCost: number,
  performanceValue: number = totalValue,
  performanceCost: number = totalCost
) {
  const today = new Date().toISOString().split('T')[0]

  const snapshotPayload = {
    portfolio_id: portfolioId,
    snapshot_date: today,
    total_value: totalValue,
    total_cost: totalCost,
    performance_value: performanceValue,
    performance_cost: performanceCost
  }

  const { error } = await supabase
    .from('portfolio_snapshots')
    .upsert(snapshotPayload, { onConflict: 'portfolio_id,snapshot_date' })

  if (error) {
    console.error('Snapshot upsert error:', error)
  }
}

export interface SnapshotData {
  snapshot_date: string
  total_value: number
  total_cost: number
  performance_value?: number | null
  performance_cost?: number | null
  created_at?: string
}

export async function fetchSnapshots(portfolioId: string, days: number = 90): Promise<SnapshotData[]> {
  const from = new Date()
  from.setDate(from.getDate() - days)
  const fromStr = from.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date, total_value, total_cost, performance_value, performance_cost, created_at')
    .eq('portfolio_id', portfolioId)
    .gte('snapshot_date', fromStr)
    .order('snapshot_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error || !data) {
    if (error) console.error('fetchSnapshots error:', error)
    return []
  }

  return deduplicateSnapshots(data as SnapshotData[])
}

export { deduplicateSnapshots } from './benchmark'