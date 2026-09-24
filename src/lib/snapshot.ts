import { supabase } from './supabase'
import { deduplicateSnapshots } from './benchmark'

export async function saveSnapshot(
  portfolioId: string,
  totalValue: number,
  totalCost: number,
  performanceValue: number = totalValue,
  performanceCost: number = totalCost
) {
  if (!portfolioId) return

  const today = new Date().toISOString().split('T')[0]

  const snapshotPayload = {
    portfolio_id: portfolioId,
    snapshot_date: today,
    total_value: Math.round(totalValue),
    total_cost: Math.round(totalCost),
    performance_value: Math.round(performanceValue),
    performance_cost: Math.round(performanceCost)
  }

  try {
    const { data: existing } = await supabase
      .from('portfolio_snapshots')
      .select('id')
      .eq('portfolio_id', portfolioId)
      .eq('snapshot_date', today)
      .limit(1)

    if (existing && existing.length > 0) {
      const { error: updateErr } = await supabase
        .from('portfolio_snapshots')
        .update({
          total_value: snapshotPayload.total_value,
          total_cost: snapshotPayload.total_cost,
          performance_value: snapshotPayload.performance_value,
          performance_cost: snapshotPayload.performance_cost
        })
        .eq('id', existing[0].id)

      if (updateErr) console.error('saveSnapshot update error:', updateErr)
    } else {
      const { error: insertErr } = await supabase
        .from('portfolio_snapshots')
        .insert(snapshotPayload)

      if (insertErr) {
        console.error('saveSnapshot insert error:', insertErr)
        // Fallback: minimal insert
        await supabase.from('portfolio_snapshots').insert({
          portfolio_id: portfolioId,
          snapshot_date: today,
          total_value: snapshotPayload.total_value,
          total_cost: snapshotPayload.total_cost
        })
      }
    }
  } catch (err) {
    console.error('saveSnapshot error:', err)
  }
}

export interface SnapshotData {
  id?: string
  portfolio_id?: string
  snapshot_date: string
  total_value: number
  total_cost: number
  performance_value?: number | null
  performance_cost?: number | null
  created_at?: string
}

export async function fetchSnapshots(
  portfolioIdOrIds?: string | string[],
  days: number = 365
): Promise<SnapshotData[]> {
  const ids = (Array.isArray(portfolioIdOrIds) ? portfolioIdOrIds : (portfolioIdOrIds ? [portfolioIdOrIds] : [])).filter(Boolean)

  const from = new Date()
  from.setDate(from.getDate() - days)
  const fromStr = from.toISOString().split('T')[0]

  try {
    if (ids.length > 0) {
      let query = supabase
        .from('portfolio_snapshots')
        .select('snapshot_date, total_value, total_cost, performance_value, performance_cost, created_at, portfolio_id')

      if (ids.length === 1) {
        query = query.eq('portfolio_id', ids[0])
      } else {
        query = query.in('portfolio_id', ids)
      }

      const { data, error } = await query
        .gte('snapshot_date', fromStr)
        .order('snapshot_date', { ascending: true })

      if (error) {
        console.error('fetchSnapshots primary query error:', error)
      } else if (data && data.length > 0) {
        return deduplicateSnapshots(data as SnapshotData[])
      }
    }

    // Fallback: RLS scoped data
    const { data: userScopedData, error: userError } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, total_value, total_cost, performance_value, performance_cost, created_at, portfolio_id')
      .gte('snapshot_date', fromStr)
      .order('snapshot_date', { ascending: true })

    if (userError) {
      console.error('fetchSnapshots fallback query error:', userError)
    } else if (userScopedData && userScopedData.length > 0) {
      return deduplicateSnapshots(userScopedData as SnapshotData[])
    }
  } catch (err) {
    console.error('fetchSnapshots unexpected error:', err)
  }

  return []
}

export { deduplicateSnapshots }