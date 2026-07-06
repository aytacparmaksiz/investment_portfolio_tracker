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
    total_value: totalValue,
    total_cost: totalCost,
    performance_value: performanceValue,
    performance_cost: performanceCost
  }

  // Bugün zaten snapshot var mı?
  const { data: existing } = await supabase
    .from('portfolio_snapshots')
    .select('id')
    .eq('portfolio_id', portfolioId)
    .eq('snapshot_date', today)
    .single()

  if (existing) {
    // Varsa güncelle
    await supabase
      .from('portfolio_snapshots')
      .update(snapshotPayload)
      .eq('id', existing.id)
  } else {
    // Yoksa yeni ekle
    await supabase
      .from('portfolio_snapshots')
      .insert({
        portfolio_id: portfolioId,
        ...snapshotPayload
      })
  }
}

export async function fetchSnapshots(portfolioId: string, days: number = 90) {
  const from = new Date()
  from.setDate(from.getDate() - days)
  const fromStr = from.toISOString().split('T')[0]

  const { data } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date, total_value, total_cost, performance_value, performance_cost')
    .eq('portfolio_id', portfolioId)
    .gte('snapshot_date', fromStr)
    .order('snapshot_date', { ascending: true })

  return data || []
}