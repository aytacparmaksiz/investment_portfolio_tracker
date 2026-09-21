import { supabase } from './supabase'

export async function addTransaction(
  assetId: string,
  type: 'buy' | 'sell',
  quantity: number,
  price: number,
  date: string,
  note?: string,
  tryRate?: number,
  tryTotal?: number
) {
  const payload: any = {
    asset_id: assetId,
    type,
    quantity,
    price,
    total: quantity * price,
    transaction_date: date,
    note: note || null
  }

  if (tryRate) payload.try_rate = tryRate
  if (tryTotal) payload.try_total = tryTotal

  const { error } = await supabase.from('transactions').insert(payload)

  if (error) return { error }

  const { error: fnError } = await supabase.rpc('update_asset_stats', {
    p_asset_id: assetId
  })

  return { error: fnError }
}

export async function fetchTransactions(assetId: string) {
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('asset_id', assetId)
    .order('transaction_date', { ascending: false })

  return data || []
}

export async function deleteTransaction(transactionId: string, assetId: string) {
  // 1. İşlemi sil
  const { error } = await supabase.from('transactions').delete().eq('id', transactionId)
  
  if (error) return { error }

  // 2. Varlık istatistiklerini (adet, ortalama maliyet) yeniden hesapla
  const { error: fnError } = await supabase.rpc('update_asset_stats', {
    p_asset_id: assetId
  })

  return { error: fnError }
}

export async function syncInitialTransaction(
  assetId: string,
  quantity: number,
  avgCost: number,
  isUsd?: boolean,
  tryRate?: number
) {
  // 1. Mevcut işlemleri sorgula
  const { data: txs, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: true })

  if (fetchError) {
    console.error('Error fetching transactions for sync:', fetchError)
    return { error: fetchError }
  }

  // 2. Hiç işlem yoksa başlangıç alım işlemi oluştur
  if (!txs || txs.length === 0) {
    const payload: any = {
      asset_id: assetId,
      type: 'buy',
      quantity,
      price: avgCost,
      total: quantity * avgCost,
      transaction_date: new Date().toISOString().split('T')[0],
      note: 'Başlangıç Alımı'
    }
    if (isUsd && tryRate) {
      payload.try_rate = tryRate
      payload.try_total = quantity * avgCost * tryRate
    }
    const { error: insErr } = await supabase.from('transactions').insert(payload)
    return { error: insErr }
  }

  // 3. Tek bir işlem varsa veya ilk alış kaydını güncelle
  const targetTx = (txs.length === 1) ? txs[0] : (txs.find(t => t.type === 'buy') || txs[0])
  const effectiveRate = tryRate || targetTx.try_rate
  const updatePayload: any = {
    quantity,
    price: avgCost,
    total: quantity * avgCost
  }
  if (effectiveRate) {
    updatePayload.try_rate = effectiveRate
    updatePayload.try_total = quantity * avgCost * effectiveRate
  }

  const { error: updErr } = await supabase
    .from('transactions')
    .update(updatePayload)
    .eq('id', targetTx.id)

  if (updErr) return { error: updErr }

  // 4. Eğer birden fazla işlem varsa, kullanıcının doğrudan varlık kartını düzenlemesi
  // sonucu oluşan yeni adet ve maliyetin update_asset_stats tarafından bozulmaması için
  // diğer eski işlemleri temizle
  if (txs.length > 1) {
    const otherTxIds = txs.filter(t => t.id !== targetTx.id).map(t => t.id)
    if (otherTxIds.length > 0) {
      await supabase.from('transactions').delete().in('id', otherTxIds)
    }
  }

  // 5. İstatistikleri yeniden hesapla
  const { error: fnErr } = await supabase.rpc('update_asset_stats', {
    p_asset_id: assetId
  })

  return { error: fnErr }
}