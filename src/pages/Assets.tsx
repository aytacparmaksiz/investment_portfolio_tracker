import { useState, useEffect } from 'react'
import { isUSD, getCurrentValue, getCostValue } from '../lib/calculations'
import { useAuth } from '../context/AuthContext'
import { usePortfolio } from '../context/PortfolioContext'
import { supabase } from '../lib/supabase'
import { addTransaction, fetchTransactions, deleteTransaction, syncInitialTransaction } from '../lib/transactions'
import { fetchHistoricalRate } from '../lib/historicalRate'
import { useNavigate, useLocation } from 'react-router-dom'
import { ASSET_TYPES, ASSET_LABELS, SECTOR_OPTIONS, FALLBACK_USD_RATE, getTodayDate } from '../lib/constants'
import { useAssetSearch } from '../hooks/useAssetSearch'

const Assets = () => {
  const { user } = useAuth()
  const { refresh, prices, isHidden, portfolioId: contextPortfolioId } = usePortfolio()
  const navigate = useNavigate()
  const location = useLocation()
  const [assets, setAssets] = useState<any[]>([])
  const [portfolioId, setPortfolioId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    type: 'hisse', name: '', symbol: '', quantity: '', avg_cost: '', manual_value: '',
    interest_rate: '', maturity_days: '', coingecko_id: '', start_date: getTodayDate(),
    txDate: getTodayDate(), manualRate: '', strategy: 'Core', sector: ''
  })
  const [rateNotFound, setRateNotFound] = useState(false)
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set())

  // --- DÜZENLEME (EDIT) STATE'LERİ ---
  const [editAsset, setEditAsset] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({ name: '', symbol: '', quantity: '', avg_cost: '', strategy: 'Core', sector: '', coingecko_id: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const { executeSearch: executeEditSearch, searchResults: editSearchResults, setSearchResults: setEditSearchResults, searching: editSearching } = useAssetSearch()

  const [txAsset, setTxAsset] = useState<any | null>(null)
  const [txType, setTxType] = useState<'buy' | 'sell'>('buy')
  const [txForm, setTxForm] = useState({ quantity: '', price: '', tryTotal: '', date: getTodayDate(), note: '', manualRate: '' })
  const [txRateNotFound, setTxRateNotFound] = useState(false)
  const [txHistory, setTxHistory] = useState<any[]>([])
  const [txSaving, setTxSaving] = useState(false)
  const [txError, setTxError] = useState('')
  const [creditCashOnSell, setCreditCashOnSell] = useState(true)
  const [deductCashOnBuy, setDeductCashOnBuy] = useState(true)
  const [deductCashOnNewAsset, setDeductCashOnNewAsset] = useState(true)

  const activePid = portfolioId || contextPortfolioId
  const cashAsset = assets.find((a: any) => a.portfolio_id === activePid && a.type === 'nakit')
  const availableCash = cashAsset ? Number(cashAsset.quantity || 0) : 0
  
  const { executeSearch: executeAddSearch, searchResults, setSearchResults, searching } = useAssetSearch()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  
  const [manualAsset, setManualAsset] = useState<any | null>(null)
  const [manualForm, setManualForm] = useState({
    value: '', principal: '', interest_rate: '', maturity_days: '', start_date: getTodayDate()
  })
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState('')
  
  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    if (!user) { setLoading(false); return }
    let pid = portfolioId || contextPortfolioId
    if (!pid) {
      const { data: portfolios } = await supabase
        .from('portfolios').select('id').eq('user_id', user.id)
      if (portfolios?.length) {
        pid = portfolios[0].id
        setPortfolioId(pid)
      } else {
        const { data: newP } = await supabase
          .from('portfolios')
          .insert({ user_id: user.id, name: 'Ana Portföy' })
          .select('id')
          .single()
        if (newP?.id) {
          pid = newP.id
          setPortfolioId(pid)
        }
      }
    }
    if (pid) {
      const { data } = await supabase
        .from('assets')
        .select('*, manual_values(value, recorded_at)')
        .eq('portfolio_id', pid)
        .order('created_at', { ascending: false })
      setAssets(data || [])
    }
    setLoading(false)
  }

  const selectedType = ASSET_TYPES.find(t => t.value === form.type)
  const isManual = ['bes', 'vadeli', 'nakit'].includes(form.type)
  const isVadeli = form.type === 'vadeli'


  const handleSymbolSearch = (value: string) => {
    setForm({ ...form, symbol: value })
    executeAddSearch(value, form.type)
  }

  const handleEditSymbolSearch = (value: string) => {
    setEditForm({ ...editForm, symbol: value })
    executeEditSearch(value, editAsset.type)
  }

  const handleSave = async () => {
    setError('')
    if (!form.name) return setError('Varlık adı zorunludur.')
    if (!isManual && !form.quantity) return setError('Adet zorunludur.')
    if (form.type === 'bes' && !form.avg_cost) return setError('BES için yatırılan tutar zorunludur.')
    if (isManual && !form.manual_value) return setError(form.type === 'bes' ? 'BES güncel değeri zorunludur.' : 'Değer zorunludur.')
    
    let targetPid = portfolioId || contextPortfolioId
    if (!targetPid && user?.id) {
      const { data: newP } = await supabase
        .from('portfolios')
        .insert({ user_id: user.id, name: 'Ana Portföy' })
        .select('id')
        .single()
      if (newP?.id) {
        targetPid = newP.id
        setPortfolioId(newP.id)
      }
    }
    if (!targetPid) {
      setError('Portföy oluşturulamadı veya bulunamadı. Lütfen sayfayı yenileyin.')
      return
    }

    setSaving(true)
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .insert({
        portfolio_id: targetPid,
        type: form.type,
        name: form.name,
        symbol: form.symbol ? form.symbol.trim().toUpperCase() : null,
        quantity: isManual ? 1 : Number(form.quantity),
        avg_cost: form.avg_cost ? Number(form.avg_cost) : null,
        coingecko_id: form.coingecko_id ? form.coingecko_id.trim().toLowerCase() : null,
        strategy: form.type === 'usd_hisse' ? form.strategy : null,
        sector: (form.type === 'usd_hisse' || form.type === 'hisse') ? (form.sector || 'Diğer') : null
      })
      .select().single()

    if (assetError) { setError('Kayıt hatası: ' + assetError.message); setSaving(false); return }

    if (isManual) {
      await supabase.from('manual_values').insert({ asset_id: asset.id, value: Number(form.manual_value) })
      if (form.type === 'bes') {
        await supabase.from('assets').update({ principal: Number(form.avg_cost), avg_cost: Number(form.avg_cost), symbol: null }).eq('id', asset.id)
      }
      if (form.type === 'nakit') {
        await supabase.from('assets').update({ quantity: Number(form.manual_value), avg_cost: 1, symbol: null }).eq('id', asset.id)
      }
      if (isVadeli && form.interest_rate && form.maturity_days) {
        const [y, m, d] = (form.start_date || getTodayDate()).split('-').map(Number)
        const maturityDate = new Date(Date.UTC(y, m - 1, d + Number(form.maturity_days), 12, 0, 0))
        await supabase.from('assets').update({
          principal: Number(form.manual_value),
          interest_rate: Number(form.interest_rate),
          maturity_days: Number(form.maturity_days),
          maturity_date: getTodayDate(maturityDate),
          start_date: form.start_date,
          symbol: null
        }).eq('id', asset.id)
      }
    } else if (form.quantity && form.avg_cost) {
      const isUsdType = isUSD(form.type)
      if (isUsdType) {
        const historicalRate = await fetchHistoricalRate(form.txDate)
        const currentRate = historicalRate || prices['USDTRY=X'] || (form.manualRate ? Number(form.manualRate) : null)
        if (!currentRate) {
          setRateNotFound(true)
          setError('O tarihe ait kur bulunamadı. Aşağıdan kuru manuel girip tekrar kaydet.')
          setSaving(false)
          return
        }
        const usdPrice = Number(form.avg_cost)
        const tryAmount = usdPrice * Number(form.quantity) * currentRate
        await addTransaction(asset.id, 'buy', Number(form.quantity), usdPrice, form.txDate, undefined, currentRate, tryAmount)
      } else {
        await addTransaction(asset.id, 'buy', Number(form.quantity), Number(form.avg_cost), form.txDate)
      }
    }

    // Yeni varlık alımında tutarı Nakit hesabından düş
    let newAssetCashNotice = ''
    if (!isManual && deductCashOnNewAsset && form.quantity && form.avg_cost) {
      const isUsdType = isUSD(form.type)
      const currentRate = prices['USDTRY=X'] || (form.manualRate ? Number(form.manualRate) : 34)
      const costTRY = isUsdType ? Number(form.avg_cost) * Number(form.quantity) * currentRate : Number(form.avg_cost) * Number(form.quantity)
      if (costTRY > 0) {
        const cashAsset = assets.find((a: any) => a.portfolio_id === targetPid && a.type === 'nakit')
        if (cashAsset) {
          const currentQty = Number(cashAsset.quantity || 0)
          const newQty = Math.round((currentQty - costTRY) * 100) / 100
          await supabase.from('assets').update({ quantity: newQty, avg_cost: 1 }).eq('id', cashAsset.id)
          newAssetCashNotice = ` (₺${Math.round(costTRY).toLocaleString('tr-TR')} nakitten düşüldü)`
        }
      }
    }

    setSuccess(`Varlık başarıyla eklendi!${newAssetCashNotice}`)
    setForm({ type: 'hisse', name: '', symbol: '', quantity: '', avg_cost: '', manual_value: '', interest_rate: '', maturity_days: '', coingecko_id: '', start_date: getTodayDate(), txDate: getTodayDate(), manualRate: '', strategy: 'Core', sector: '' })
    setRateNotFound(false)
    setShowForm(false)
    fetchData()
    refresh(true)
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  // --- DÜZENLEME (EDIT) FONKSİYONLARI ---
  const openEditModal = (asset: any) => {
    setEditAsset(asset)
    setEditError('')
    setEditForm({
      name: asset.name || '',
      symbol: asset.symbol || '',
      quantity: asset.quantity ? String(asset.quantity) : '',
      avg_cost: asset.avg_cost ? String(asset.avg_cost) : '',
      strategy: asset.strategy || 'Core',
      sector: asset.sector || '',
      coingecko_id: asset.coingecko_id || ''
    })
    setEditSearchResults([])
  }

  const handleEditSave = async () => {
    if (!editForm.name || !editForm.quantity || !editForm.avg_cost) {
       setEditError('Ad, adet ve ortalama maliyet zorunludur.')
       return
    }
    setEditSaving(true)
    const newQty = Number(editForm.quantity)
    const newCost = Number(editForm.avg_cost)
    const isUsdType = isUSD(editAsset.type)

    const payload = {
      name: editForm.name,
      symbol: editForm.symbol ? editForm.symbol.trim().toUpperCase() : null,
      quantity: newQty,
      avg_cost: newCost,
      strategy: editAsset.type === 'usd_hisse' ? editForm.strategy : null,
      sector: (editAsset.type === 'usd_hisse' || editAsset.type === 'hisse') ? (editForm.sector || 'Diğer') : null,
      coingecko_id: editForm.coingecko_id ? editForm.coingecko_id.trim().toLowerCase() : null
    }
    const { error } = await supabase.from('assets').update(payload).eq('id', editAsset.id)
    if (error) { setEditError(error.message); setEditSaving(false); return }

    // Senkronizasyon: update_asset_stats çağrıldığında kullanıcının el ile girdiği adet ve maliyet ezilmesin
    if (!['bes', 'vadeli', 'nakit'].includes(editAsset.type)) {
      const usdRate = isUsdType ? (prices['USDTRY=X'] || FALLBACK_USD_RATE) : undefined
      await syncInitialTransaction(editAsset.id, newQty, newCost, isUsdType, usdRate)
    }

    setEditSaving(false)
    setEditAsset(null)
    fetchData()
    refresh(true)
    setSuccess('Varlık başarıyla düzenlendi!')
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu varlığı silmek istediğinize emin misiniz?')) return
    await supabase.from('assets').delete().eq('id', id)
    fetchData()
    refresh(true)
  }

  const openTxModal = async (asset: any) => {
    setTxAsset(asset)
    setTxType('buy')
    setCreditCashOnSell(true)
    setDeductCashOnBuy(true)
    setTxForm({ quantity: '', price: '', tryTotal: '', date: getTodayDate(), note: '', manualRate: '' })
    setTxRateNotFound(false)
    setTxError('')
    const history = await fetchTransactions(asset.id)
    setTxHistory(history)
  }

  const handleTxSave = async () => {
    setTxError('')
    const usdType = isUSD(txAsset.type)
    if (!txForm.quantity || !txForm.price) return setTxError('Adet ve fiyat zorunludur.')
    if (txType === 'sell' && Number(txForm.quantity) > Number(txAsset.quantity)) {
      return setTxError(`Maksimum satılabilir: ${txAsset.quantity}`)
    }
    setTxSaving(true)
    let finalPrice = Number(txForm.price)
    let tryRate: number | undefined
    let tryTotal: number | undefined
    if (usdType) {
      const historicalRate = await fetchHistoricalRate(txForm.date)
      const currentUsdRate = historicalRate || prices['USDTRY=X'] || (txForm.manualRate ? Number(txForm.manualRate) : null)
      if (!currentUsdRate) {
        setTxRateNotFound(true)
        setTxError('O tarihe ait kur bulunamadı. Aşağıdan kuru manuel girip tekrar dene.')
        setTxSaving(false)
        return
      }
      tryRate = currentUsdRate
      tryTotal = finalPrice * Number(txForm.quantity) * currentUsdRate
    }
    const { error } = await addTransaction(txAsset.id, txType, Number(txForm.quantity), finalPrice, txForm.date, txForm.note, tryRate, tryTotal)
    if (error) { setTxError('Hata: ' + error.message); setTxSaving(false); return }

    // Satış tutarını otomatik Nakit hesabına aktar
    let cashCreditedNotice = ''
    if (txType === 'sell' && creditCashOnSell) {
      const proceedsTRY = tryTotal || (finalPrice * Number(txForm.quantity))
      if (proceedsTRY > 0) {
        const targetPid = txAsset.portfolio_id || portfolioId || contextPortfolioId
        const cashAsset = assets.find((a: any) => a.portfolio_id === targetPid && a.type === 'nakit')
        if (cashAsset) {
          const currentQty = Number(cashAsset.quantity || 0)
          const newQty = Math.round((currentQty + proceedsTRY) * 100) / 100
          await supabase.from('assets').update({ quantity: newQty, avg_cost: 1 }).eq('id', cashAsset.id)
        } else if (targetPid) {
          await supabase.from('assets').insert({
            portfolio_id: targetPid,
            name: 'Nakit (TL)',
            symbol: 'TL',
            type: 'nakit',
            quantity: Math.round(proceedsTRY * 100) / 100,
            avg_cost: 1
          })
        }
        cashCreditedNotice = ` (₺${Math.round(proceedsTRY).toLocaleString('tr-TR')} nakite aktarıldı)`
      }
    }

    // Alım yapıldığında tutarı Nakit hesabından düş
    let cashDeductedNotice = ''
    if (txType === 'buy' && deductCashOnBuy) {
      const costTRY = tryTotal || (finalPrice * Number(txForm.quantity))
      if (costTRY > 0) {
        const targetPid = txAsset.portfolio_id || portfolioId || contextPortfolioId
        const cashAsset = assets.find((a: any) => a.portfolio_id === targetPid && a.type === 'nakit')
        if (cashAsset) {
          const currentQty = Number(cashAsset.quantity || 0)
          const newQty = Math.round((currentQty - costTRY) * 100) / 100
          await supabase.from('assets').update({ quantity: newQty, avg_cost: 1 }).eq('id', cashAsset.id)
          cashDeductedNotice = ` (₺${Math.round(costTRY).toLocaleString('tr-TR')} nakitten düşüldü)`
        }
      }
    }

    const history = await fetchTransactions(txAsset.id)
    setTxHistory(history)
    setTxForm({ quantity: '', price: '', tryTotal: '', date: getTodayDate(), note: '', manualRate: '' })
    setTxRateNotFound(false)
    setTxSaving(false)
    fetchData()
    refresh(true)
    setSuccess(`İşlem kaydedildi!${cashCreditedNotice}${cashDeductedNotice}`)
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleDeleteTx = async (txId: string) => {
    if (!confirm('Bu işlemi silmek istediğinize emin misiniz? Ortalama maliyet yeniden hesaplanacak.')) return
    setTxSaving(true)
    setTxError('')

    // 1. Silinecek işlemi bul (önce geçmiş listesinden, yoksa Supabase'den sorgula)
    let txToDelete = txHistory.find((t: any) => t.id === txId)
    if (!txToDelete) {
      const { data } = await supabase.from('transactions').select('*').eq('id', txId).maybeSingle()
      txToDelete = data
    }

    if (!txToDelete) {
      setTxError('Silinecek işlem kaydı bulunamadı.')
      setTxSaving(false)
      return
    }

    // 2. İşlemi sil ve istatistikleri yeniden hesaplat
    const { error: delErr } = await deleteTransaction(txId, txAsset.id)
    if (delErr) {
      setTxError('Silme hatası: ' + delErr.message)
      setTxSaving(false)
      return
    }

    // 3. Nakit iadesi / düşümü (Cash Reversal)
    let cashNotice = ''
    const isUsdType = isUSD(txAsset.type)
    const usdRate = Number(prices['USDTRY=X']) || FALLBACK_USD_RATE || 1
    const effectiveRate = isUsdType ? (Number(txToDelete.try_rate) || usdRate) : 1
    const rawTryTotal = txToDelete.try_total != null ? Number(txToDelete.try_total) : 0
    const tryAmount = (isUsdType && rawTryTotal > 0)
      ? rawTryTotal
      : (Number(txToDelete.quantity || 0) * Number(txToDelete.price || 0) * effectiveRate)

    if (tryAmount > 0) {
      const targetPid = txAsset.portfolio_id || portfolioId || contextPortfolioId
      if (targetPid) {
        // En güncel nakit varlığını doğrudan Supabase'den çek
        const { data: dbCash } = await supabase
          .from('assets')
          .select('*')
          .eq('portfolio_id', targetPid)
          .eq('type', 'nakit')
          .maybeSingle()

        const cashAsset = dbCash || assets.find((a: any) => a.portfolio_id === targetPid && a.type === 'nakit')

        if (txToDelete.type === 'buy') {
          // Alım işlemi nakit düşmüştü, silinince nakite iade edilir (kredi)
          if (cashAsset) {
            const currentQty = Number(cashAsset.quantity || 0)
            const newQty = Math.round((currentQty + tryAmount) * 100) / 100
            const { error: updErr } = await supabase
              .from('assets')
              .update({ quantity: newQty, avg_cost: 1 })
              .eq('id', cashAsset.id)
            if (updErr) {
              console.error('Nakit güncelleme hatası:', updErr)
            } else {
              cashNotice = ` (₺${Math.round(tryAmount).toLocaleString('tr-TR')} nakite iade edildi)`
            }
          } else {
            const { error: insErr } = await supabase.from('assets').insert({
              portfolio_id: targetPid,
              name: 'Nakit (TL)',
              symbol: 'TL',
              type: 'nakit',
              quantity: Math.round(tryAmount * 100) / 100,
              avg_cost: 1
            })
            if (insErr) {
              console.error('Nakit oluşturma hatası:', insErr)
            } else {
              cashNotice = ` (₺${Math.round(tryAmount).toLocaleString('tr-TR')} nakite iade edildi)`
            }
          }
        } else if (txToDelete.type === 'sell') {
          // Satış işlemi nakit eklemişti, silinince nakitten düşülür (borç)
          if (cashAsset) {
            const currentQty = Number(cashAsset.quantity || 0)
            const newQty = Math.round((currentQty - tryAmount) * 100) / 100
            const { error: updErr } = await supabase
              .from('assets')
              .update({ quantity: newQty, avg_cost: 1 })
              .eq('id', cashAsset.id)
            if (updErr) {
              console.error('Nakit düşme hatası:', updErr)
            } else {
              cashNotice = ` (₺${Math.round(tryAmount).toLocaleString('tr-TR')} nakitten düşüldü)`
            }
          }
        }
      }
    }

    const history = await fetchTransactions(txAsset.id)
    setTxHistory(history)

    const { data: updatedAsset } = await supabase.from('assets').select('*').eq('id', txAsset.id).maybeSingle()
    if (updatedAsset) setTxAsset(updatedAsset)

    await fetchData()
    await refresh(true)
    setTxSaving(false)
    setSuccess(`İşlem silindi ve maliyet güncellendi.${cashNotice}`)
    setTimeout(() => setSuccess(''), 3000)
  }

  const openManualUpdateModal = (asset: any) => {
    const lastManualValue = asset.manual_values?.[asset.manual_values.length - 1]?.value
    const currentValue = asset.type === 'nakit' ? Number(asset.quantity || 0) * Number(asset.avg_cost || 1) : Number(lastManualValue || asset.principal || 0)
    setManualAsset(asset)
    setManualError('')
    setManualForm({
      value: currentValue ? String(currentValue) : '',
      principal: asset.principal ? String(asset.principal) : asset.avg_cost ? String(asset.avg_cost) : '',
      interest_rate: asset.interest_rate ? String(asset.interest_rate) : '',
      maturity_days: '',
      start_date: asset.start_date || getTodayDate()
    })
  }
  
  const handleManualUpdate = async () => {
    if (!manualAsset) return
    setManualError('')
    if (!manualForm.value) return setManualError('Güncel değer zorunludur.')
    if (manualAsset.type === 'bes' && !manualForm.principal) return setManualError('BES için yatırılan tutar zorunludur.')
    setManualSaving(true)
    const value = Number(manualForm.value)
  
    if (manualAsset.type === 'nakit') {
      const { error } = await supabase.from('assets').update({ quantity: value, avg_cost: 1, symbol: null }).eq('id', manualAsset.id)
      if (error) { setManualError(error.message); setManualSaving(false); return }
    }
  
    if (manualAsset.type === 'bes') {
      await supabase.from('manual_values').insert({ asset_id: manualAsset.id, value })
      const { error } = await supabase.from('assets').update({ principal: Number(manualForm.principal), avg_cost: Number(manualForm.principal), symbol: null }).eq('id', manualAsset.id)
      if (error) { setManualError(error.message); setManualSaving(false); return }
    }
  
    if (manualAsset.type === 'vadeli') {
      await supabase.from('manual_values').insert({ asset_id: manualAsset.id, value })
      const updatePayload: any = { principal: value, symbol: null }
      if (manualForm.interest_rate) updatePayload.interest_rate = Number(manualForm.interest_rate)
      if (manualForm.start_date) updatePayload.start_date = manualForm.start_date
      if (manualForm.maturity_days) {
        updatePayload.maturity_days = Number(manualForm.maturity_days)
        const [y, m, d] = (manualForm.start_date || getTodayDate()).split('-').map(Number)
        const maturityDate = new Date(Date.UTC(y, m - 1, d + Number(manualForm.maturity_days), 12, 0, 0))
        updatePayload.maturity_date = getTodayDate(maturityDate)
      }
      const { error } = await supabase.from('assets').update(updatePayload).eq('id', manualAsset.id)
      if (error) { setManualError(error.message); setManualSaving(false); return }
    }
  
    setManualSaving(false)
    setManualAsset(null)
    fetchData()
    refresh(true)
    setSuccess('Varlık değeri güncellendi!')
    setTimeout(() => setSuccess(''), 3000)
  }

  const formatCurrency = (val: number, type?: string) => {
    if (isHidden) return '••••••'
    return type && isUSD(type)
      ? `$${Number(val).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : `₺${Number(val).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
  }

  const toggleGroup = (type: string) => {
    const next = new Set(expandedGroups)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    setExpandedGroups(next)
  }

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow)' }
  const inputStyle = { width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '14px' }
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }
  
  const visibleAssets = assets.filter((asset: any) => {
    if (['bes', 'vadeli', 'nakit'].includes(asset.type)) return true
    return Number(asset.quantity || 0) > 0
  })

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: 'var(--text-secondary)' }}>Yükleniyor...</p>
    </div>
  )

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '16px', paddingBottom: '90px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Düzenleme (Edit) Modalı */}
      {editAsset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontWeight: '800', fontSize: '18px', color: 'var(--text-primary)' }}>Varlığı Düzenle</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{editAsset.name}</p>
              </div>
              <button onClick={() => setEditAsset(null)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', width: '32px', height: '32px', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Varlık Adı</label>
              <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} />
            </div>

            <div style={{ marginBottom: '12px', position: 'relative' }}>
              <label style={labelStyle}>Sembol</label>
              <input value={editForm.symbol} onChange={e => handleEditSymbolSearch(e.target.value)} style={inputStyle} />
              {editSearching && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Aranıyor...</p>}
              {editSearchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow-md)', zIndex: 50, overflow: 'hidden' }}>
                  {editSearchResults.map((r: any) => (
                    <div key={r.symbol} onClick={() => { 
                        let cleanSymbol = r.symbol; 
                        if (editAsset.type === 'hisse') cleanSymbol = r.symbol.replace('.IS', ''); 
                        setEditForm({ ...editForm, symbol: cleanSymbol, name: r.name, coingecko_id: r.id || '' }); 
                        setEditSearchResults([]); 
                      }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                      <p style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>{r.symbol}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{r.name} · {r.exchange}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div><label style={labelStyle}>Adet</label><input type="number" value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Ortalama Maliyet {isUSD(editAsset.type) ? '($)' : '(₺)'}</label><input type="number" value={editForm.avg_cost} onChange={e => setEditForm({ ...editForm, avg_cost: e.target.value })} style={inputStyle} /></div>
            </div>

            {editAsset.type === 'usd_hisse' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Strateji</label>
                <select value={editForm.strategy} onChange={e => setEditForm({ ...editForm, strategy: e.target.value })} style={inputStyle}>
                  <option value="Core">Core</option>
                  <option value="Value">Value</option>
                  <option value="Growth">Growth</option>
                </select>
              </div>
            )}

            {(editAsset.type === 'usd_hisse' || editAsset.type === 'hisse') && (
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Sektör</label>
                <select value={editForm.sector || 'Diğer'} onChange={e => setEditForm({ ...editForm, sector: e.target.value })} style={inputStyle}>
                  {SECTOR_OPTIONS.map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>
            )}

            {editError && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '10px', padding: '10px', marginBottom: '12px', color: 'var(--red)', fontSize: '13px', fontWeight: '600' }}>{editError}</div>}
            
            <button onClick={handleEditSave} disabled={editSaving} style={{ width: '100%', padding: '14px', background: '#3b82f6', borderRadius: '12px', color: 'white', fontWeight: '700', fontSize: '15px', opacity: editSaving ? 0.7 : 1 }}>
              {editSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </button>
          </div>
        </div>
      )}

      {/* İşlem Modalı */}
      {txAsset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ fontWeight: '800', fontSize: '18px', color: 'var(--text-primary)' }}>{txAsset.name}</h3>
              <button onClick={() => setTxAsset(null)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', width: '32px', height: '32px', fontSize: '16px' }}>✕</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              Mevcut: <strong>{isHidden ? '••••••' : `${txAsset.quantity} adet`}</strong> · Ort: <strong>{formatCurrency(txAsset.avg_cost, txAsset.type)}</strong>
            </p>
            <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '12px', padding: '3px', marginBottom: '20px', border: '1px solid var(--border)' }}>
              <button onClick={() => setTxType('buy')} style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', background: txType === 'buy' ? 'var(--green)' : 'none', color: txType === 'buy' ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s' }}>↑ Alım</button>
              <button onClick={() => setTxType('sell')} style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', background: txType === 'sell' ? 'var(--red)' : 'none', color: txType === 'sell' ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s' }}>↓ Satım</button>
            </div>
            {isUSD(txAsset.type) ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Adet</label>
                    <input type="number" value={txForm.quantity} onChange={e => setTxForm({ ...txForm, quantity: e.target.value })} placeholder="100" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--accent)' }}>Birim Fiyat ($)</label>
                    <input type="number" value={txForm.price} onChange={e => setTxForm({ ...txForm, price: e.target.value })} placeholder="örn. 242" style={{ ...inputStyle, border: '1px solid var(--accent)' }} />
                  </div>
                </div>
                {txRateNotFound && (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--accent)' }}>O Tarihteki USD/TRY Kuru (manuel)</label>
                    <input type="number" value={txForm.manualRate} onChange={e => setTxForm({ ...txForm, manualRate: e.target.value })} placeholder="örn. 44.20" style={{ ...inputStyle, border: '1px solid var(--accent)' }} />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Adet</label>
                  <input type="number" value={txForm.quantity} onChange={e => setTxForm({ ...txForm, quantity: e.target.value })} placeholder="100" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Birim Fiyat (₺)</label>
                  <input type="number" value={txForm.price} onChange={e => setTxForm({ ...txForm, price: e.target.value })} placeholder="250" style={inputStyle} />
                </div>
              </div>
            )}
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Tarih</label>
              <input type="date" value={txForm.date} onChange={e => setTxForm({ ...txForm, date: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Not (opsiyonel)</label>
              <input type="text" value={txForm.note} onChange={e => setTxForm({ ...txForm, note: e.target.value })} placeholder="Örn: Uzun vadeli alım" style={inputStyle} />
            </div>
            {txType === 'buy' && (
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="deductCashBuy"
                    checked={deductCashOnBuy}
                    onChange={e => setDeductCashOnBuy(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <label htmlFor="deductCashBuy" style={{ fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600' }}>
                    💰 Alım tutarını <strong>Nakit</strong> hesabımdan düş
                  </label>
                </div>
                <span style={{ fontSize: '11px', color: availableCash > 0 ? 'var(--green)' : 'var(--text-secondary)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                  Nakit: ₺{Math.round(availableCash).toLocaleString('tr-TR')}
                </span>
              </div>
            )}
            {txType === 'sell' && (
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <input
                  type="checkbox"
                  id="creditCash"
                  checked={creditCashOnSell}
                  onChange={e => setCreditCashOnSell(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <label htmlFor="creditCash" style={{ fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600' }}>
                  💰 Satış tutarını otomatik <strong>Nakit</strong> hesabına aktar
                </label>
              </div>
            )}
            {txError && (
              <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '10px', padding: '10px', marginBottom: '12px', color: 'var(--red)', fontSize: '13px', fontWeight: '600' }}>
                {txError}
              </div>
            )}
            <button onClick={handleTxSave} disabled={txSaving}
              style={{ width: '100%', padding: '14px', background: txType === 'buy' ? 'var(--green)' : 'var(--red)', borderRadius: '12px', color: 'white', fontWeight: '700', fontSize: '15px', opacity: txSaving ? 0.7 : 1, marginBottom: '20px' }}>
              {txSaving ? 'Kaydediliyor...' : txType === 'buy' ? '↑ Alımı Kaydet' : '↓ Satımı Kaydet'}
            </button>
            {txHistory.length > 0 && (
              <div>
                <p style={{ fontWeight: '700', fontSize: '13px', marginBottom: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>İşlem Geçmişi</p>
                {txHistory.map((tx: any) => (
                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: tx.type === 'buy' ? 'var(--green)' : 'var(--red)', background: tx.type === 'buy' ? 'var(--green-dim)' : 'var(--red-dim)', padding: '2px 8px', borderRadius: '20px' }}>
                          {tx.type === 'buy' ? '↑ Alım' : '↓ Satım'}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{tx.transaction_date}</span>
                      </div>
                      {tx.note && <p style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{tx.note}</p>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{isHidden ? '••••••' : `${tx.quantity} adet`}</p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{formatCurrency(tx.price, txAsset.type)}</p>
                      </div>
                      <button onClick={() => handleDeleteTx(tx.id)} disabled={txSaving} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: '800', fontSize: '16px', opacity: txSaving ? 0.5 : 1, padding: '4px' }} title="İşlemi Sil">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Manuel Varlık Güncelleme Modalı */}
      {manualAsset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontWeight: '800', fontSize: '18px', color: 'var(--text-primary)' }}>{manualAsset.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>Manuel değer güncelle</p>
              </div>
              <button onClick={() => setManualAsset(null)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', width: '32px', height: '32px', fontSize: '16px' }}>✕</button>
            </div>
            {manualAsset.type === 'bes' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Yatırılan Tutar</label>
                  <input type="number" value={manualForm.principal} onChange={e => setManualForm({ ...manualForm, principal: e.target.value })} placeholder="150000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Güncel Değer</label>
                  <input type="number" value={manualForm.value} onChange={e => setManualForm({ ...manualForm, value: e.target.value })} placeholder="350000" style={inputStyle} />
                </div>
              </div>
            )}
            {manualAsset.type === 'vadeli' && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Anapara</label>
                  <input type="number" value={manualForm.value} onChange={e => setManualForm({ ...manualForm, value: e.target.value })} placeholder="100000" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>Yıllık Faiz (%)</label>
                    <input type="number" value={manualForm.interest_rate} onChange={e => setManualForm({ ...manualForm, interest_rate: e.target.value })} placeholder="40" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Vade (Gün)</label>
                    <input type="number" value={manualForm.maturity_days} onChange={e => setManualForm({ ...manualForm, maturity_days: e.target.value })} placeholder="30" style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Başlangıç Tarihi</label>
                  <input type="date" value={manualForm.start_date} onChange={e => setManualForm({ ...manualForm, start_date: e.target.value })} style={inputStyle} />
                </div>
              </>
            )}
            {manualAsset.type === 'nakit' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>TRY Nakit Tutarı</label>
                <input type="number" value={manualForm.value} onChange={e => setManualForm({ ...manualForm, value: e.target.value })} placeholder="50000" style={inputStyle} />
              </div>
            )}
            {manualError && (
              <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '10px', padding: '10px', marginBottom: '12px', color: 'var(--red)', fontSize: '13px', fontWeight: '600' }}>
                {manualError}
              </div>
            )}
            <button onClick={handleManualUpdate} disabled={manualSaving} style={{ width: '100%', padding: '14px', background: 'var(--accent)', borderRadius: '12px', color: 'white', fontWeight: '700', fontSize: '15px', opacity: manualSaving ? 0.7 : 1 }}>
              {manualSaving ? 'Güncelleniyor...' : 'Güncelle'}
            </button>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingTop: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>Varlıklarım</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{visibleAssets.length} varlık</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ padding: '10px 18px', background: showForm ? 'var(--bg-card)' : 'var(--accent)', border: `1px solid ${showForm ? 'var(--border)' : 'var(--accent)'}`, borderRadius: '12px', color: showForm ? 'var(--text-secondary)' : 'white', fontWeight: '700', fontSize: '14px', boxShadow: showForm ? 'var(--shadow)' : '0 4px 12px rgba(99,102,241,0.3)' }}>
          {showForm ? 'İptal' : '+ Yeni Varlık'}
        </button>
      </div>
      {success && (
        <div style={{ background: 'var(--green-dim)', border: '1px solid var(--green)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', color: 'var(--green)', fontSize: '14px', fontWeight: '600' }}>
          ✅ {success}
        </div>
      )}
      
      {/* Yeni Varlık Formu */}
      {showForm && (
        <div style={{ ...card, marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px', color: 'var(--text-primary)' }}>Yeni Varlık Ekle</p>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Varlık Türü</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {ASSET_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm({ ...form, type: t.value })}
                  style={{ padding: '7px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                    background: form.type === t.value ? 'var(--accent)' : 'var(--bg-elevated)',
                    border: `1px solid ${form.type === t.value ? 'var(--accent)' : 'var(--border)'}`,
                    color: form.type === t.value ? 'white' : 'var(--text-secondary)' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Varlık Adı</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="örn. Türk Hava Yolları" style={inputStyle} />
          </div>
          {selectedType?.hasSymbol && (
            <div style={{ marginBottom: '12px', position: 'relative' }}>
              <label style={labelStyle}>Sembol</label>
              <input value={form.symbol} onChange={e => handleSymbolSearch(e.target.value)} placeholder={selectedType.symbolPlaceholder} style={inputStyle} />
              {searching && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Aranıyor...</p>}
              {searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow-md)', zIndex: 50, overflow: 'hidden' }}>
                  {searchResults.map((r: any) => (
                    <div key={r.symbol} onClick={() => { let cleanSymbol = r.symbol; if (form.type === 'hisse') cleanSymbol = r.symbol.replace('.IS', ''); setForm({ ...form, symbol: cleanSymbol, name: r.name, coingecko_id: r.id || '' }); setSearchResults([]); }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                      <p style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>{r.symbol}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{r.name} · {r.exchange}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {isManual ? (
          <div>
            {form.type === 'bes' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div><label style={labelStyle}>Yatırılan Tutar (₺)</label><input type="number" value={form.avg_cost} onChange={e => setForm({ ...form, avg_cost: e.target.value })} placeholder="150000" style={inputStyle} /></div>
                <div><label style={labelStyle}>Güncel Değer (₺)</label><input type="number" value={form.manual_value} onChange={e => setForm({ ...form, manual_value: e.target.value })} placeholder="350000" style={inputStyle} /></div>
              </div>
            ) : (
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Anapara (₺)</label>
                <input type="number" value={form.manual_value} onChange={e => setForm({ ...form, manual_value: e.target.value })} placeholder="100000" style={inputStyle} />
              </div>
            )}
            {isVadeli && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div><label style={labelStyle}>Yıllık Faiz (%)</label><input type="number" value={form.interest_rate} onChange={e => setForm({ ...form, interest_rate: e.target.value })} placeholder="40" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Vade (Gün)</label><input type="number" value={form.maturity_days} onChange={e => setForm({ ...form, maturity_days: e.target.value })} placeholder="30" style={inputStyle} /></div>
                </div>
                <div style={{ marginBottom: '12px' }}><label style={labelStyle}>Başlangıç Tarihi</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inputStyle} /></div>
              </div>
            )}
            </div>
          ) : (
            isUSD(form.type) ? (
              <div>
                {form.type === 'usd_hisse' && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Strateji</label>
                    <select value={form.strategy} onChange={e => setForm({ ...form, strategy: e.target.value })} style={inputStyle}>
                      <option value="Core">Core</option>
                      <option value="Value">Value</option>
                      <option value="Growth">Growth</option>
                    </select>
                  </div>
                )}
                {form.type === 'usd_hisse' && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Sektör</label>
                    <select value={form.sector || 'Diğer'} onChange={e => setForm({ ...form, sector: e.target.value })} style={inputStyle}>
                      {SECTOR_OPTIONS.map(sec => (
                        <option key={sec} value={sec}>{sec}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div><label style={labelStyle}>Adet</label><input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="100" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Birim Fiyat ($)</label><input type="number" value={form.avg_cost} onChange={e => setForm({ ...form, avg_cost: e.target.value })} placeholder="240" style={inputStyle} /></div>
                </div>
                <div style={{ marginBottom: '12px' }}><label style={labelStyle}>İşlem Tarihi</label><input type="date" value={form.txDate} onChange={e => setForm({ ...form, txDate: e.target.value })} style={inputStyle} /></div>
                {rateNotFound && (
                  <div style={{ marginBottom: '12px' }}><label style={{ ...labelStyle, color: 'var(--accent)' }}>O Tarihteki USD/TRY Kuru (manuel)</label><input type="number" value={form.manualRate} onChange={e => setForm({ ...form, manualRate: e.target.value })} placeholder="örn. 44.20" style={{ ...inputStyle, border: '1px solid var(--accent)' }} /></div>
                )}
              </div>
            ) : (
              <div>
                {form.type === 'hisse' && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Sektör</label>
                    <select value={form.sector || 'Diğer'} onChange={e => setForm({ ...form, sector: e.target.value })} style={inputStyle}>
                      {SECTOR_OPTIONS.map(sec => (
                        <option key={sec} value={sec}>{sec}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div><label style={labelStyle}>Adet</label><input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="100" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Ort. Maliyet (₺)</label><input type="number" value={form.avg_cost} onChange={e => setForm({ ...form, avg_cost: e.target.value })} placeholder="250" style={inputStyle} /></div>
                </div>
              </div>
            )
          )}
          {!isManual && (
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="deductCashNewAsset"
                  checked={deductCashOnNewAsset}
                  onChange={e => setDeductCashOnNewAsset(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <label htmlFor="deductCashNewAsset" style={{ fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600' }}>
                  💰 Alım tutarını <strong>Nakit</strong> hesabımdan düş
                </label>
              </div>
              <span style={{ fontSize: '11px', color: availableCash > 0 ? 'var(--green)' : 'var(--text-secondary)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                Nakit: ₺{Math.round(availableCash).toLocaleString('tr-TR')}
              </span>
            </div>
          )}
          {error && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '10px', padding: '10px', marginBottom: '12px', color: 'var(--red)', fontSize: '13px', fontWeight: '600' }}>{error}</div>}
          <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '13px', background: 'var(--accent)', borderRadius: '12px', color: 'white', fontWeight: '700', fontSize: '15px', opacity: saving ? 0.7 : 1, boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      )}

      {/* Varlık Listesi */}
      <div style={card}>
        <p style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px', color: 'var(--text-primary)' }}>Mevcut Varlıklar</p>
        {visibleAssets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}><p style={{ fontSize: '32px', marginBottom: '8px' }}>📭</p><p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Henüz varlık eklenmedi</p></div>
        ) : (() => {
          const TYPE_COLORS: Record<string, string> = { hisse: '#3487AB', usd_hisse: '#707272', kripto: '#8b5cf6', etf: '#B32132', doviz: '#33622C', altin: '#ECC703', vadeli: '#0891b2' }
          const groups: Record<string, any[]> = {}
          visibleAssets.forEach(a => { if (!groups[a.type]) groups[a.type] = []; groups[a.type].push(a) })
          
          return Object.entries(groups).map(([type, items]) => {
            const typeColor = TYPE_COLORS[type] || '#6b7280'
            const isExpanded = expandedGroups.has(type)
          
            return (
              <div key={type} style={{ marginBottom: '12px' }}>
                <div onClick={() => toggleGroup(type)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: isExpanded ? '10px' : '0', padding: '10px 0', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeColor }} />
                    <p style={{ fontWeight: '700', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {ASSET_LABELS[type]} · {items.length}
                    </p>
                  </div>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', fontWeight: '700' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && items.map((asset: any, index: number) => {
                  const isManualAsset = ['bes', 'vadeli', 'nakit'].includes(asset.type)
                  const lastValue = asset.manual_values?.[asset.manual_values.length - 1]?.value
                  const manualDisplayValue = asset.type === 'nakit'
                      ? Number(asset.quantity || 0) * Number(asset.avg_cost || 1)
                      : Number(lastValue || asset.principal || 0)

                  return (
                    <div key={asset.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: index < items.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                      <div>
                        <p style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{asset.name}</p>
                        <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '2px' }}>
                          {asset.symbol && <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{asset.symbol}</span>}
                          {!isManualAsset && ` · ${isHidden ? '••••••' : asset.quantity} adet`}
                          {!isManualAsset && asset.avg_cost > 0 && ` · Ort: ${formatCurrency(asset.avg_cost, asset.type)}`}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isManualAsset && manualDisplayValue > 0 && (
                          <p style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>
                            {isHidden ? '••••••' : `₺${Number(manualDisplayValue).toLocaleString('tr-TR')}`}
                          </p>
                        )}
                        {isManualAsset && (
                          <button onClick={() => openManualUpdateModal(asset)} style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '8px', color: 'var(--accent)', padding: '6px 10px', fontSize: '11px', fontWeight: '700' }}>Güncelle</button>
                        )}
                        {!isManualAsset && (
                          <>
                            <button onClick={() => openEditModal(asset)} style={{ background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: '8px', color: '#3b82f6', padding: '6px 10px', fontSize: '11px', fontWeight: '700' }}>Düzenle</button>
                            <button onClick={() => openTxModal(asset)} style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '8px', color: 'var(--accent)', padding: '6px 10px', fontSize: '11px', fontWeight: '700' }}>İşlem</button>
                          </>
                        )}
                        <button onClick={() => handleDelete(asset.id)} style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '8px', color: 'var(--red)', padding: '6px 10px', fontSize: '11px', fontWeight: '700' }}>Sil</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })
        })()}
      </div>


    </div>
  )
}

export default Assets