import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { addTransaction, fetchTransactions } from '../lib/transactions'
import { useNavigate } from 'react-router-dom'

const ASSET_TYPES = [
  { value: 'hisse', label: '🇹🇷 BIST Hisse', hasSymbol: true, symbolPlaceholder: 'THYAO, GARAN...', currency: 'TRY' },
  { value: 'usd_hisse', label: '🇺🇸 ABD Hisse', hasSymbol: true, symbolPlaceholder: 'AAPL, TSLA...', currency: 'USD' },
  { value: 'kripto', label: '₿ Kripto', hasSymbol: true, symbolPlaceholder: 'BTC, ETH...', currency: 'USD' },
  { value: 'etf', label: '📈 ETF', hasSymbol: true, symbolPlaceholder: 'SPY, QQQ...', currency: 'USD' },
  { value: 'doviz', label: '💱 Döviz/Altın', hasSymbol: true, symbolPlaceholder: 'USD, EUR, XAU...', currency: 'TRY' },
  { value: 'bes', label: '🏦 BES', hasSymbol: false, currency: 'TRY' },
  { value: 'vadeli', label: '💰 Vadeli Mevduat', hasSymbol: false, currency: 'TRY' },
]

const ASSET_LABELS: Record<string, string> = {
  hisse: '🇹🇷 BIST', usd_hisse: '🇺🇸 ABD', kripto: '₿ Kripto',
  etf: '📈 ETF', doviz: '💱 Döviz', bes: '🏦 BES', vadeli: '💰 Vadeli'
}

const Assets = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [assets, setAssets] = useState<any[]>([])
  const [portfolioId, setPortfolioId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Yeni varlık formu
  const [form, setForm] = useState({
    type: 'hisse', name: '', symbol: '', quantity: '', avg_cost: '', manual_value: ''
  })

  // İşlem modalı
  const [txAsset, setTxAsset] = useState<any | null>(null)
  const [txType, setTxType] = useState<'buy' | 'sell'>('buy')
  const [txForm, setTxForm] = useState({ quantity: '', price: '', date: new Date().toISOString().split('T')[0], note: '' })
  const [txHistory, setTxHistory] = useState<any[]>([])
  const [txSaving, setTxSaving] = useState(false)
  const [txError, setTxError] = useState('')

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
        avg_cost: form.avg_cost ? Number(form.avg_cost) : null
      })
      .select().single()

    if (assetError) { setError('Kayıt hatası: ' + assetError.message); setSaving(false); return }

    if (isManual) {
      await supabase.from('manual_values').insert({ asset_id: asset.id, value: Number(form.manual_value) })
    } else if (form.quantity && form.avg_cost) {
      // İlk alımı işlem olarak kaydet
      await addTransaction(asset.id, 'buy', Number(form.quantity), Number(form.avg_cost), new Date().toISOString().split('T')[0])
    }

    setSuccess('Varlık başarıyla eklendi!')
    setForm({ type: 'hisse', name: '', symbol: '', quantity: '', avg_cost: '', manual_value: '' })
    setShowForm(false)
    fetchData()
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu varlığı silmek istediğinize emin misiniz?')) return
    await supabase.from('assets').delete().eq('id', id)
    fetchData()
  }

  const openTxModal = async (asset: any) => {
    setTxAsset(asset)
    setTxType('buy')
    setTxForm({ quantity: '', price: '', date: new Date().toISOString().split('T')[0], note: '' })
    setTxError('')
    const history = await fetchTransactions(asset.id)
    setTxHistory(history)
  }

  const handleTxSave = async () => {
    setTxError('')
    if (!txForm.quantity || !txForm.price) return setTxError('Adet ve fiyat zorunludur.')
    if (txType === 'sell' && Number(txForm.quantity) > Number(txAsset.quantity)) {
      return setTxError(`Maksimum satılabilir: ${txAsset.quantity}`)
    }

    setTxSaving(true)
    const { error } = await addTransaction(
      txAsset.id, txType,
      Number(txForm.quantity), Number(txForm.price),
      txForm.date, txForm.note
    )

    if (error) { setTxError('Hata: ' + error.message); setTxSaving(false); return }

    const history = await fetchTransactions(txAsset.id)
    setTxHistory(history)
    setTxForm({ quantity: '', price: '', date: new Date().toISOString().split('T')[0], note: '' })
    setTxSaving(false)
    fetchData()
    setSuccess('İşlem kaydedildi!')
    setTimeout(() => setSuccess(''), 3000)
  }

  const isUSD = (type: string) => ['usd_hisse', 'kripto', 'etf'].includes(type)

  const formatCurrency = (val: number, type?: string) =>
    type && isUSD(type)
      ? `$${Number(val).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : `₺${Number(val).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: 'var(--text-secondary)' }}>Yükleniyor...</p>
    </div>
  )

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '16px', paddingBottom: '80px' }}>

      {/* İşlem Modalı */}
      {txAsset && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000090', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px 16px 0 0', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: '700' }}>{txAsset.name}</h3>
              <button onClick={() => setTxAsset(null)} style={{ background: 'none', color: 'var(--text-secondary)', fontSize: '20px' }}>✕</button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
              Mevcut: {txAsset.quantity} adet • Ort. Maliyet: {formatCurrency(txAsset.avg_cost, txAsset.type)}
            </p>

            {/* Alım/Satım Toggle */}
            <div style={{ display: 'flex', background: 'var(--bg-primary)', borderRadius: '8px', padding: '2px', marginBottom: '16px' }}>
              <button
                onClick={() => setTxType('buy')}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '14px', fontWeight: '600', background: txType === 'buy' ? 'var(--green)' : 'none', color: txType === 'buy' ? 'white' : 'var(--text-secondary)' }}
              >
                Alım
              </button>
              <button
                onClick={() => setTxType('sell')}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '14px', fontWeight: '600', background: txType === 'sell' ? 'var(--red)' : 'none', color: txType === 'sell' ? 'white' : 'var(--text-secondary)' }}
              >
                Satım
              </button>
            </div>

            {/* İşlem Formu */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Adet</label>
                <input type="number" value={txForm.quantity} onChange={e => setTxForm({ ...txForm, quantity: e.target.value })}
                  placeholder="100"
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Birim Fiyat ({isUSD(txAsset.type) ? '$' : '₺'})
                </label>
                <input type="number" value={txForm.price} onChange={e => setTxForm({ ...txForm, price: e.target.value })}
                  placeholder="250"
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Tarih</label>
              <input type="date" value={txForm.date} onChange={e => setTxForm({ ...txForm, date: e.target.value })}
                style={{ width: '100%', padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Not (opsiyonel)</label>
              <input type="text" value={txForm.note} onChange={e => setTxForm({ ...txForm, note: e.target.value })}
                placeholder="Örn: Uzun vadeli alım"
                style={{ width: '100%', padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
            </div>

            {txForm.quantity && txForm.price && (
              <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '10px', marginBottom: '12px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Toplam: </span>
                <span style={{ fontWeight: '700' }}>{formatCurrency(Number(txForm.quantity) * Number(txForm.price), txAsset.type)}</span>
              </div>
            )}

            {txError && (
              <div style={{ background: '#ef444420', border: '1px solid var(--red)', borderRadius: '8px', padding: '10px', marginBottom: '12px', color: 'var(--red)', fontSize: '13px' }}>
                {txError}
              </div>
            )}

            <button onClick={handleTxSave} disabled={txSaving}
              style={{ width: '100%', padding: '12px', background: txType === 'buy' ? 'var(--green)' : 'var(--red)', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '15px', opacity: txSaving ? 0.7 : 1, marginBottom: '16px' }}>
              {txSaving ? 'Kaydediliyor...' : txType === 'buy' ? 'Alımı Kaydet' : 'Satımı Kaydet'}
            </button>

            {/* İşlem Geçmişi */}
            {txHistory.length > 0 && (
              <div>
                <p style={{ fontWeight: '600', fontSize: '13px', marginBottom: '10px', color: 'var(--text-secondary)' }}>İşlem Geçmişi</p>
                {txHistory.map((tx: any) => (
                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                    <div>
                      <span style={{ fontWeight: '600', color: tx.type === 'buy' ? 'var(--green)' : 'var(--red)' }}>
                        {tx.type === 'buy' ? '↑ Alım' : '↓ Satım'}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>{tx.transaction_date}</span>
                      {tx.note && <p style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{tx.note}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p>{tx.quantity} adet</p>
                      <p style={{ color: 'var(--text-secondary)' }}>{formatCurrency(tx.price, txAsset.type)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingTop: '16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: '700' }}>Varlıklarım</h1>
        <button onClick={() => setShowForm(!showForm)}
          style={{ padding: '8px 16px', background: 'var(--accent)', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '14px' }}>
          {showForm ? 'İptal' : '+ Ekle'}
        </button>
      </div>

      {success && (
        <div style={{ background: '#22c55e20', border: '1px solid var(--green)', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: 'var(--green)', fontSize: '14px' }}>
          {success}
        </div>
      )}

      {showForm && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '600', marginBottom: '16px' }}>Yeni Varlık Ekle</p>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>Varlık Türü</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {ASSET_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm({ ...form, type: t.value })}
                  style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '13px', background: form.type === t.value ? 'var(--accent)' : 'var(--bg-primary)', border: `1px solid ${form.type === t.value ? 'var(--accent)' : 'var(--border)'}`, color: form.type === t.value ? 'white' : 'var(--text-secondary)' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>Varlık Adı</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="örn. Türk Hava Yolları"
              style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '15px' }} />
          </div>

          {selectedType?.hasSymbol && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>Sembol</label>
              <input value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })} placeholder={selectedType.symbolPlaceholder}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '15px' }} />
            </div>
          )}

          {isManual ? (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>Güncel Değer (₺)</label>
              <input type="number" value={form.manual_value} onChange={e => setForm({ ...form, manual_value: e.target.value })} placeholder="150000"
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '15px' }} />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>Adet</label>
                <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="100"
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '15px' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Ort. Maliyet ({selectedType?.currency === 'USD' ? '$' : '₺'})
                </label>
                <input type="number" value={form.avg_cost} onChange={e => setForm({ ...form, avg_cost: e.target.value })} placeholder="250"
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '15px' }} />
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: '#ef444420', border: '1px solid var(--red)', borderRadius: '8px', padding: '10px', marginBottom: '12px', color: 'var(--red)', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            style={{ width: '100%', padding: '12px', background: 'var(--accent)', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '15px', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      )}

      {/* Varlık Listesi */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
        <p style={{ fontWeight: '600', marginBottom: '16px' }}>Mevcut Varlıklar ({assets.length})</p>
        {assets.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>Henüz varlık eklenmedi</p>
        ) : (
          assets.map((asset: any) => {
            const isManualAsset = ['bes', 'vadeli'].includes(asset.type)
            const lastValue = asset.manual_values?.[asset.manual_values.length - 1]?.value
            return (
              <div key={asset.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p style={{ fontWeight: '600', fontSize: '15px' }}>{asset.name}</p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {ASSET_LABELS[asset.type]} {asset.symbol ? `• ${asset.symbol}` : ''}
                    {!isManualAsset ? ` • ${asset.quantity} adet` : ''}
                  </p>
                  {!isManualAsset && asset.avg_cost > 0 && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                      Ort: {formatCurrency(asset.avg_cost, asset.type)}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isManualAsset && lastValue && (
                    <p style={{ fontWeight: '600', fontSize: '14px' }}>₺{Number(lastValue).toLocaleString('tr-TR')}</p>
                  )}
                  {!isManualAsset && (
                    <button onClick={() => openTxModal(asset)}
                      style={{ background: '#6366f120', border: '1px solid var(--accent)', borderRadius: '6px', color: 'var(--accent)', padding: '4px 10px', fontSize: '12px' }}>
                      İşlem
                    </button>
                  )}
                  <button onClick={() => handleDelete(asset.id)}
                    style={{ background: '#ef444420', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '4px 10px', fontSize: '12px' }}>
                    Sil
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Alt Navigasyon */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '12px 0' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ fontSize: '20px' }}>📊</span> Portföy
        </button>
        <button onClick={() => navigate('/analitik')} style={{ background: 'none', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ fontSize: '20px' }}>📈</span> Analitik
        </button>
        <button onClick={() => navigate('/varliklar')} style={{ background: 'none', color: 'var(--accent)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ fontSize: '20px' }}>➕</span> Varlık Ekle
        </button>
      </div>
    </div>
  )
}

export default Assets