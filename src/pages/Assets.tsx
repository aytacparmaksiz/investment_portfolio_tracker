import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { addTransaction, fetchTransactions } from '../lib/transactions'
import { useNavigate } from 'react-router-dom'
import { usePortfolio } from '../context/PortfolioContext'
import { fetchHistoricalRate } from '../lib/historicalRate'

const ASSET_TYPES = [
  { value: 'hisse', label: 'BIST Hisse', hasSymbol: true, symbolPlaceholder: 'THYAO, GARAN...', currency: 'TRY' },
  { value: 'usd_hisse', label: 'ABD Hisse', hasSymbol: true, symbolPlaceholder: 'AAPL, TSLA...', currency: 'USD' },
  { value: 'kripto', label: '₿ Kripto', hasSymbol: true, symbolPlaceholder: 'BTC, ETH...', currency: 'USD' },
  { value: 'etf', label: '📈 ETF', hasSymbol: true, symbolPlaceholder: 'SPY, QQQ...', currency: 'USD' },
  { value: 'doviz', label: '💱 Döviz', hasSymbol: true, symbolPlaceholder: 'USD, EUR, GBP...', currency: 'TRY' },
  { value: 'altin', label: '🥇 Altın', hasSymbol: true, symbolPlaceholder: 'TRYG (gram), XAU (ons)...', currency: 'TRY' },
  { value: 'bes', label: '🏦 BES', hasSymbol: false, currency: 'TRY' },
  { value: 'vadeli', label: '💰 Vadeli Mevduat', hasSymbol: false, currency: 'TRY' },
]

const ASSET_LABELS: Record<string, string> = {
  hisse: 'BIST', usd_hisse: 'ABD', kripto: '₿ Kripto',
  etf: '📈 ETF', doviz: '💱 Döviz', altin: '🥇 Altın', bes: '🏦 BES', vadeli: '💰 Vadeli'
}

const Assets = () => {
  const { user } = useAuth()
  const { refresh, prices } = usePortfolio()
  const navigate = useNavigate()
  const [assets, setAssets] = useState<any[]>([])
  const [portfolioId, setPortfolioId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    type: 'hisse', name: '', symbol: '', quantity: '', avg_cost: '', manual_value: '',
    interest_rate: '', maturity_days: '', coingecko_id: '', start_date: new Date().toISOString().split('T')[0],
    txDate: new Date().toISOString().split('T')[0], manualRate: ''
  })
  const [rateNotFound, setRateNotFound] = useState(false)

  const [txAsset, setTxAsset] = useState<any | null>(null)
  const [txType, setTxType] = useState<'buy' | 'sell'>('buy')
  const [txForm, setTxForm] = useState({ quantity: '', price: '', tryTotal: '', date: new Date().toISOString().split('T')[0], note: '', manualRate: '' })
  const [txRateNotFound, setTxRateNotFound] = useState(false)
  const [txHistory, setTxHistory] = useState<any[]>([])
  const [txSaving, setTxSaving] = useState(false)
  const [txError, setTxError] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: portfolios } = await supabase
      .from('portfolios').select('id').eq('user_id', user.id)

    if (portfolios?.length) {
      setPortfolioId(portfolios[0].id)
      const { data } = await supabase
        .from('assets')
        .select('*, manual_values(value, recorded_at)')
        .eq('portfolio_id', portfolios[0].id)
        .order('created_at', { ascending: false })
      setAssets(data || [])
    }
    setLoading(false)
  }

  const selectedType = ASSET_TYPES.find(t => t.value === form.type)
  const isManual = ['bes', 'vadeli'].includes(form.type)
  const isVadeli = form.type === 'vadeli'

  const handleSymbolSearch = async (value: string) => {
    setForm({ ...form, symbol: value })
    if (value.length < 2) { setSearchResults([]); return }

    if (form.type === 'kripto') {
      setSearching(true)
      try {
        const res = await fetch(`https://kumbaram-three.vercel.app/api/crypto-search?q=${value}`)
        const data = await res.json()
        setSearchResults(data.coins || [])
      } catch { setSearchResults([]) }
      setSearching(false)
      return
    }

    if (form.type === 'altin') {
      const METALS = [
        { symbol: 'TRYG', name: 'Gram Altın' },
        { symbol: 'CEYREK', name: 'Çeyrek Altın' },
        { symbol: 'YARIM', name: 'Yarım Altın' },
        { symbol: 'TAM', name: 'Tam Altın' },
        { symbol: 'CUMHURIYET', name: 'Cumhuriyet Altını' },
        { symbol: 'ATA', name: 'Ata Altın' },
        { symbol: 'XAU', name: 'Ons Altın' },
        { symbol: 'XAG', name: 'Gümüş (Ons)' },
        { symbol: 'GRAMGUMUS', name: 'Gram Gümüş' },
      ]
      const filtered = METALS.filter(m =>
        m.symbol.toLowerCase().includes(value.toLowerCase()) ||
        m.name.toLowerCase().includes(value.toLowerCase())
      )
      setSearchResults(filtered.map(m => ({ ...m, type: 'METAL', exchange: 'TR' })))
      return
    }

    if (form.type === 'doviz') {
      const CURRENCIES = [
        { symbol: 'USD', name: 'Amerikan Doları' },
        { symbol: 'EUR', name: 'Euro' },
        { symbol: 'GBP', name: 'İngiliz Sterlini' },
        { symbol: 'CHF', name: 'İsviçre Frangı' },
        { symbol: 'JPY', name: 'Japon Yeni' },
        { symbol: 'CAD', name: 'Kanada Doları' },
        { symbol: 'AUD', name: 'Avustralya Doları' },
        { symbol: 'SEK', name: 'İsveç Kronu' },
        { symbol: 'RUB', name: 'Rus Rublesi' },
        { symbol: 'CNY', name: 'Çin Yuanı' },
      ]
      const filtered = CURRENCIES.filter(c =>
        c.symbol.toLowerCase().includes(value.toLowerCase()) ||
        c.name.toLowerCase().includes(value.toLowerCase())
      )
      setSearchResults(filtered.map(c => ({ ...c, type: 'CURRENCY', exchange: 'TRY' })))
      return
    }

    setSearching(true)
    const { searchTicker } = await import('../lib/search')
    const results = await searchTicker(value)
    const typeMap: Record<string, string> = { hisse: 'EQUITY', usd_hisse: 'EQUITY', etf: 'ETF' }
    const wantedType = typeMap[form.type]
    const filtered = wantedType ? results.filter((r: any) => r.type === wantedType) : results
    setSearchResults(filtered.slice(0, 5))
    setSearching(false)
  }
  const handleSave = async () => {
    setError('')
    if (!form.name) return setError('Varlık adı zorunludur.')
    if (!isManual && !form.quantity) return setError('Adet zorunludur.')
    if (isManual && !form.manual_value) return setError('Değer zorunludur.')

    setSaving(true)
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .insert({
        portfolio_id: portfolioId,
        type: form.type,
        name: form.name,
        symbol: form.symbol?.toUpperCase() || null,
        quantity: isManual ? 1 : Number(form.quantity),
        avg_cost: form.avg_cost ? Number(form.avg_cost) : null,
        coingecko_id: form.coingecko_id || null
      })
      .select().single()

    if (assetError) { setError('Kayıt hatası: ' + assetError.message); setSaving(false); return }

    if (isManual) {
      await supabase.from('manual_values').insert({ asset_id: asset.id, value: Number(form.manual_value) })

      if (isVadeli && form.interest_rate && form.maturity_days) {
        const maturityDate = new Date(form.start_date)
        maturityDate.setDate(maturityDate.getDate() + Number(form.maturity_days))
        await supabase.from('assets').update({
          principal: Number(form.manual_value),
          interest_rate: Number(form.interest_rate),
          maturity_date: maturityDate.toISOString().split('T')[0],
          start_date: form.start_date,
          symbol: null
        }).eq('id', asset.id)
      }
    } else if (form.quantity && form.avg_cost) {
      const isUsdType = isUSD(form.type)
      if (isUsdType) {
        // form.avg_cost burada artık TOPLAM ödenen TRY tutarı
        const historicalRate = await fetchHistoricalRate(form.txDate)
        const currentRate = historicalRate || prices['USDTRY=X'] || (form.manualRate ? Number(form.manualRate) : null)
        if (!currentRate) {
          setRateNotFound(true)
          setError('O tarihe ait kur bulunamadı. Aşağıdan kuru manuel girip tekrar kaydet.')
          setSaving(false)
          return
        }
        const tryAmount = Number(form.avg_cost)
        const usdPrice = (tryAmount / currentRate) / Number(form.quantity)
        await addTransaction(asset.id, 'buy', Number(form.quantity), usdPrice, form.txDate, undefined, currentRate, tryAmount)
      } else {
        await addTransaction(asset.id, 'buy', Number(form.quantity), Number(form.avg_cost), form.txDate)
      }
    }

    setSuccess('Varlık başarıyla eklendi!')
    setForm({ type: 'hisse', name: '', symbol: '', quantity: '', avg_cost: '', manual_value: '' })
    setShowForm(false)
    fetchData()
    refresh(true)
    setSaving(false)
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
    setTxForm({ quantity: '', price: '', tryTotal: '', date: new Date().toISOString().split('T')[0], note: '' })
    setTxError('')
    const history = await fetchTransactions(asset.id)
    setTxHistory(history)
  }

  const handleTxSave = async () => {
    setTxError('')
    const usdType = isUSD(txAsset.type)

    if (usdType) {
      if (!txForm.quantity || !txForm.tryTotal) return setTxError('Adet ve TRY tutarı zorunludur.')
    } else {
      if (!txForm.quantity || !txForm.price) return setTxError('Adet ve fiyat zorunludur.')
    }
    if (txType === 'sell' && Number(txForm.quantity) > Number(txAsset.quantity)) {
      return setTxError(`Maksimum satılabilir: ${txAsset.quantity}`)
    }
    setTxSaving(true)

    let finalPrice = Number(txForm.price)
    let tryRate: number | undefined
    let tryTotal: number | undefined

    if (usdType) {
      tryTotal = Number(txForm.tryTotal)
      const historicalRate = await fetchHistoricalRate(txForm.date)
      const currentUsdRate = historicalRate || prices['USDTRY=X'] || (txForm.manualRate ? Number(txForm.manualRate) : null)
      if (!currentUsdRate) {
        setTxRateNotFound(true)
        setTxError('O tarihe ait kur bulunamadı. Aşağıdan kuru manuel girip tekrar dene.')
        setTxSaving(false)
        return
      }
      finalPrice = (tryTotal / currentUsdRate) / Number(txForm.quantity)
      tryRate = currentUsdRate
    }

    const { error } = await addTransaction(txAsset.id, txType, Number(txForm.quantity), finalPrice, txForm.date, txForm.note, tryRate, tryTotal)
    if (error) { setTxError('Hata: ' + error.message); setTxSaving(false); return }

    const history = await fetchTransactions(txAsset.id)
    setTxHistory(history)
    setTxForm({ quantity: '', price: '', tryTotal: '', date: new Date().toISOString().split('T')[0], note: '' })
    setTxSaving(false)
    fetchData()
    refresh(true)
    setSuccess('İşlem kaydedildi!')
    setTimeout(() => setSuccess(''), 3000)
  }

  const isUSD = (type: string) => ['usd_hisse', 'kripto', 'etf'].includes(type)
  const formatCurrency = (val: number, type?: string) =>
    type && isUSD(type)
      ? `$${Number(val).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : `₺${Number(val).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`

  const card = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: 'var(--shadow)'
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    fontSize: '14px'
  }

  const labelStyle = {
    display: 'block', marginBottom: '6px',
    fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600'
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: 'var(--text-secondary)' }}>Yükleniyor...</p>
    </div>
  )

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '16px', paddingBottom: '90px', background: 'var(--bg-primary)', minHeight: '100vh' }}>

      {/* İşlem Modalı */}
      {txAsset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ fontWeight: '800', fontSize: '18px', color: 'var(--text-primary)' }}>{txAsset.name}</h3>
              <button onClick={() => setTxAsset(null)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', width: '32px', height: '32px', fontSize: '16px' }}>✕</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              Mevcut: <strong>{txAsset.quantity} adet</strong> · Ort: <strong>{
                isUSD(txAsset.type) && txAsset.total_try_cost
                  ? `$${((txAsset.total_try_cost / (prices['USDTRY=X'] || 46.4)) / Number(txAsset.quantity)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                  : formatCurrency(txAsset.avg_cost, txAsset.type)
              }</strong>
            </p>

            {/* Alım/Satım Toggle */}
            <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '12px', padding: '3px', marginBottom: '20px', border: '1px solid var(--border)' }}>
              <button onClick={() => setTxType('buy')}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', background: txType === 'buy' ? 'var(--green)' : 'none', color: txType === 'buy' ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
                ↑ Alım
              </button>
              <button onClick={() => setTxType('sell')}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', background: txType === 'sell' ? 'var(--red)' : 'none', color: txType === 'sell' ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
                ↓ Satım
              </button>
            </div>

            {isUSD(txAsset.type) ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Adet</label>
                  <input type="number" value={txForm.quantity} onChange={e => setTxForm({ ...txForm, quantity: e.target.value })}
                    placeholder="100"
                    style={{ width: '100%', padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--accent)' }}>
                    {txType === 'buy' ? 'Ödediğin TRY' : 'Aldığın TRY'}
                  </label>
                  <input type="number" value={txForm.tryTotal} onChange={e => setTxForm({ ...txForm, tryTotal: e.target.value })}
                    placeholder="örn. 24200"
                    style={{ width: '100%', padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--accent)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
                </div>
                {txRateNotFound && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--accent)' }}>O Tarihteki USD/TRY Kuru (manuel)</label>
                    <input type="number" value={txForm.manualRate} onChange={e => setTxForm({ ...txForm, manualRate: e.target.value })}
                      placeholder="örn. 44.20"
                      style={{ width: '100%', padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--accent)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Adet</label>
                  <input type="number" value={txForm.quantity} onChange={e => setTxForm({ ...txForm, quantity: e.target.value })}
                    placeholder="100"
                    style={{ width: '100%', padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Birim Fiyat (₺)</label>
                  <input type="number" value={txForm.price} onChange={e => setTxForm({ ...txForm, price: e.target.value })}
                    placeholder="250"
                    style={{ width: '100%', padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
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

            {txForm.quantity && txForm.price && (
              <div style={{ background: txType === 'buy' ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${txType === 'buy' ? 'var(--green)' : 'var(--red)'}`, borderRadius: '10px', padding: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>Toplam Tutar</span>
                <span style={{ fontSize: '16px', fontWeight: '800', color: txType === 'buy' ? 'var(--green)' : 'var(--red)' }}>
                  {formatCurrency(Number(txForm.quantity) * Number(txForm.price), txAsset.type)}
                </span>
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
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{tx.quantity} adet</p>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{formatCurrency(tx.price, txAsset.type)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingTop: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>Varlıklarım</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{assets.length} varlık</p>
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
              <input
                value={form.symbol}
                onChange={e => handleSymbolSearch(e.target.value)}
                placeholder={selectedType.symbolPlaceholder}
                style={inputStyle}
              />
              {searching && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Aranıyor...</p>}
              {searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow-md)', zIndex: 50, overflow: 'hidden' }}>
                  {searchResults.map((r: any) => (
                    <div key={r.symbol}
                      onClick={() => {
                        let cleanSymbol = r.symbol
                        if (form.type === 'hisse') cleanSymbol = r.symbol.replace('.IS', '')
                        setForm({ ...form, symbol: cleanSymbol, name: r.name, coingecko_id: r.id || '' })
                        setSearchResults([])
                      }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                    >
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
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Anapara (₺)</label>
                <input type="number" value={form.manual_value} onChange={e => setForm({ ...form, manual_value: e.target.value })} placeholder="100000" style={inputStyle} />
              </div>
              {isVadeli && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={labelStyle}>Yıllık Faiz (%)</label>
                      <input type="number" value={form.interest_rate} onChange={e => setForm({ ...form, interest_rate: e.target.value })} placeholder="40" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Vade (Gün)</label>
                      <input type="number" value={form.maturity_days} onChange={e => setForm({ ...form, maturity_days: e.target.value })} placeholder="30" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>İşlem Tarihi</label>
                  <input type="date" value={form.txDate} onChange={e => setForm({ ...form, txDate: e.target.value })} style={inputStyle} />
                </div>
                {rateNotFound && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ ...labelStyle, color: 'var(--accent)' }}>O Tarihteki USD/TRY Kuru (manuel)</label>
                    <input type="number" value={form.manualRate} onChange={e => setForm({ ...form, manualRate: e.target.value })} placeholder="örn. 44.20" style={{ ...inputStyle, border: '1px solid var(--accent)' }} />
                  </div>
                )}
              </div>
              )}
            </div>
          ) : (
            isUSD(form.type) ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>Adet</label>
                    <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="100" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Ödediğin Toplam TRY</label>
                    <input type="number" value={form.avg_cost} onChange={e => setForm({ ...form, avg_cost: e.target.value })} placeholder="24000" style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>İşlem Tarihi</label>
                  <input type="date" value={form.txDate} onChange={e => setForm({ ...form, txDate: e.target.value })} style={inputStyle} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Adet</label>
                  <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="100" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Ort. Maliyet (₺)</label>
                  <input type="number" value={form.avg_cost} onChange={e => setForm({ ...form, avg_cost: e.target.value })} placeholder="250" style={inputStyle} />
                </div>
              </div>
            )
          )}

          {error && (
            <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '10px', padding: '10px', marginBottom: '12px', color: 'var(--red)', fontSize: '13px', fontWeight: '600' }}>
              {error}
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            style={{ width: '100%', padding: '13px', background: 'var(--accent)', borderRadius: '12px', color: 'white', fontWeight: '700', fontSize: '15px', opacity: saving ? 0.7 : 1, boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      )}

{/* Varlık Listesi */}
<div style={card}>
        <p style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px', color: 'var(--text-primary)' }}>Mevcut Varlıklar</p>
        {assets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ fontSize: '32px', marginBottom: '8px' }}>📭</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Henüz varlık eklenmedi</p>
          </div>
        ) : (() => {
          const TYPE_COLORS: Record<string, string> = {
            hisse: '#3487AB', usd_hisse: '#707272', kripto: '#8b5cf6',
            etf: '#B32132', doviz: '#33622C', altin: '#ECC703', vadeli: '#0891b2'
          }
          const groups: Record<string, any[]> = {}
          assets.forEach(a => { if (!groups[a.type]) groups[a.type] = []; groups[a.type].push(a) })

          return Object.entries(groups).map(([type, items]) => {
            const typeColor = TYPE_COLORS[type] || '#6b7280'
            return (
              <div key={type} style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeColor }} />
                  <p style={{ fontWeight: '700', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {ASSET_LABELS[type]} · {items.length}
                  </p>
                </div>

                {items.map((asset: any, index: number) => {
                  const isManualAsset = ['bes', 'vadeli'].includes(asset.type)
                  const lastValue = asset.manual_values?.[asset.manual_values.length - 1]?.value
                  return (
                    <div key={asset.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: index < items.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                      <div>
                        <p style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{asset.name}</p>
                        <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '2px' }}>
                          {asset.symbol ? <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{asset.symbol}</span> : ''}
                          {!isManualAsset ? ` · ${asset.quantity} adet` : ''}
                          {!isManualAsset && asset.avg_cost > 0 ? ` · Ort: ${
                            isUSD(asset.type) && asset.total_try_cost
                              ? `$${((asset.total_try_cost / (prices['USDTRY=X'] || 46.4)) / Number(asset.quantity)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                              : formatCurrency(asset.avg_cost, asset.type)
                          }` : ''}                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isManualAsset && lastValue && (
                          <p style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>₺{Number(lastValue).toLocaleString('tr-TR')}</p>
                        )}
                        {!isManualAsset && (
                          <button onClick={() => openTxModal(asset)}
                            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '8px', color: 'var(--accent)', padding: '6px 10px', fontSize: '11px', fontWeight: '700' }}>
                            İşlem
                          </button>
                        )}
                        <button onClick={() => handleDelete(asset.id)}
                          style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '8px', color: 'var(--red)', padding: '6px 10px', fontSize: '11px', fontWeight: '700' }}>
                          Sil
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })
        })()}
      </div>      {/* Alt Navigasyon */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '10px 0 16px' }}>
        {[
          { path: '/', icon: '📊', label: 'Portföy' },
          { path: '/performans', icon: '📈', label: 'Performans' },
          { path: '/analitik-varliklar', icon: '📋', label: 'Varlıklar' },
          { path: '/varliklar', icon: '➕', label: 'İşlem' },
        ].map(item => (
          <button key={item.path} onClick={() => navigate(item.path)}
            style={{ background: 'none', color: location.pathname === item.path ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: '600', padding: '4px 16px' }}>
            <span style={{ fontSize: '22px' }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default Assets