import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchAllPrices } from '../lib/prices'
import { saveSnapshot } from '../lib/snapshot'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6']

const ASSET_LABELS: Record<string, string> = {
  hisse: 'BIST Hisse', usd_hisse: 'ABD Hisse', kripto: 'Kripto',
  etf: 'ETF', doviz: 'Döviz/Altın', bes: 'BES', vadeli: 'Vadeli Mevduat'
}

const Dashboard = () => {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [assets, setAssets] = useState<any[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [displayCurrency, setDisplayCurrency] = useState<'TRY' | 'USD'>('TRY')
  const [usdRate, setUsdRate] = useState<number>(38)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')
  const [portfolioId, setPortfolioId] = useState<string | null>(null)

  useEffect(() => { fetchAssets() }, [])

  const fetchAssets = async () => {
    const { data: portfolios } = await supabase
      .from('portfolios').select('id').eq('user_id', user.id)
      if (portfolios?.length) setPortfolioId(portfolios[0].id)

  const handleInvite = async () => {
    if (!inviteEmail || !portfolioId) return
    setInviteStatus('loading')
    const { data, error } = await supabase.rpc('invite_member', {
      p_portfolio_id: portfolioId,
      p_email: inviteEmail
    })
    if (error) { setInviteStatus('error'); return }
    if (data === 'user_not_found') setInviteStatus('not_found')
    else if (data === 'already_member') setInviteStatus('already')
    else setInviteStatus('success')
  }

    if (!portfolios?.length) {
      await supabase.from('portfolios').insert({ user_id: user.id, name: 'Ana Portföy' })
      setLoading(false)
      return
    }

    const { data: assetsData } = await supabase
      .from('assets')
      .select('*, manual_values(value, recorded_at)')
      .eq('portfolio_id', portfolios[0].id)
      .order('created_at', { ascending: false })

    const loaded = assetsData || []
    setAssets(loaded)
    setLoading(false)

    if (loaded.length > 0) {
      setPricesLoading(true)
      const fetched = await fetchAllPrices(loaded)
      setPrices(fetched)
      setLastUpdated(new Date())

      if (fetched['USDTRY=X']) setUsdRate(fetched['USDTRY=X'])
      else if (fetched['USD']) setUsdRate(fetched['USD'])

      if (portfolios?.[0]?.id) {
        const tv = loaded.reduce((sum: number, a: any) => {
          if (['bes', 'vadeli'].includes(a.type)) {
            const vals = a.manual_values || []
            return sum + Number(vals[vals.length - 1]?.value || 0)
          }
          const p = fetched[a.symbol] ?? a.avg_cost ?? 0
          return sum + p * Number(a.quantity)
        }, 0)
        const tc = loaded.reduce((sum: number, a: any) => {
          if (['bes', 'vadeli'].includes(a.type)) {
            const vals = a.manual_values || []
            return sum + Number(vals[vals.length - 1]?.value || 0)
          }
          return sum + (a.avg_cost || 0) * Number(a.quantity)
        }, 0)
        await saveSnapshot(portfolios[0].id, tv, tc)
      }
      setPricesLoading(false)
    }
  }

  const getAssetValue = (asset: any) => {
    if (['bes', 'vadeli'].includes(asset.type)) {
      const vals = asset.manual_values || []
      return Number(vals[vals.length - 1]?.value || 0)
    }
    const price = prices[asset.symbol] ?? asset.avg_cost ?? 0
    return price * Number(asset.quantity)
  }

  const getCostValue = (asset: any) => {
    if (['bes', 'vadeli'].includes(asset.type)) return getAssetValue(asset)
    const isUSD = ['usd_hisse', 'kripto', 'etf'].includes(asset.type)
    const cost = (asset.avg_cost || 0) * Number(asset.quantity)
    return isUSD ? cost * usdRate : cost
  }

  const groupByType = () => {
    const groups: Record<string, any> = {}
    assets.forEach(asset => {
      const type = asset.type
      if (!groups[type]) groups[type] = {
        type, label: ASSET_LABELS[type] || type,
        name: ASSET_LABELS[type] || type,
        value: 0, cost: 0, items: []
      }
      groups[type].value += getAssetValue(asset)
      groups[type].cost += getCostValue(asset)
      groups[type].items.push(asset)
    })
    return Object.values(groups).filter(g => g.value > 0)
  }

  const pieData = groupByType()
  const total = assets.reduce((sum, a) => sum + getAssetValue(a), 0)
  const totalCost = assets.reduce((sum, a) => sum + getCostValue(a), 0)
  const totalGain = total - totalCost
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  const fc = (val: number) => {
    if (displayCurrency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val / usdRate)
    }
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val)
  }

  const fp = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: 'var(--text-secondary)' }}>Yükleniyor...</p>
    </div>
  )

  const cardStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '14px',
    padding: '16px'
  }

  const labelStyle = {
    color: 'var(--text-secondary)',
    fontSize: '11px',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '16px', paddingBottom: '80px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingTop: '16px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '700' }}>💼 Kumbaram</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{user.email}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-primary)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)' }}>
            <button onClick={() => setDisplayCurrency('TRY')}
              style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: displayCurrency === 'TRY' ? 'var(--accent)' : 'none', color: displayCurrency === 'TRY' ? 'white' : 'var(--text-secondary)' }}>
              ₺
            </button>
            <button onClick={() => setDisplayCurrency('USD')}
              style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: displayCurrency === 'USD' ? 'var(--accent)' : 'none', color: displayCurrency === 'USD' ? 'white' : 'var(--text-secondary)' }}>
              $
            </button>
          </div>
          <button onClick={signOut} style={{ padding: '8px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Çıkış
          </button>
        </div>
      </div>

      {/* 4 Metrik Kart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={cardStyle}>
          <p style={labelStyle}>Toplam Değer</p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent)' }}>{fc(total)}</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '4px' }}>{assets.length} varlık</p>
        </div>
        <div style={cardStyle}>
          <p style={labelStyle}>Yatırılan</p>
          <p style={{ fontSize: '18px', fontWeight: '700' }}>{fc(totalCost)}</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '4px' }}>maliyet bazı</p>
        </div>
        <div style={cardStyle}>
          <p style={labelStyle}>Toplam Kar/Zarar</p>
          <p style={{ fontSize: '18px', fontWeight: '700', color: totalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totalGain >= 0 ? '+' : ''}{fc(totalGain)}
          </p>
          <p style={{ fontSize: '11px', marginTop: '4px', color: totalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fp(totalGainPct)}
          </p>
        </div>
        <div style={cardStyle}>
          <p style={labelStyle}>Son Güncelleme</p>
          <p style={{ fontSize: '13px', fontWeight: '600', marginTop: '8px' }}>
            {pricesLoading ? '⏳ Yükleniyor...' : lastUpdated ? lastUpdated.toLocaleTimeString('tr-TR') : '-'}
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '4px' }}>canlı fiyat</p>
        </div>
      </div>

      {/* Pasta Grafik */}
      {pieData.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: '16px' }}>
          <p style={{ fontWeight: '600', marginBottom: '4px' }}>Dağılım</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name" paddingAngle={3}>
                {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(val: any, name: any) => [fc(val), name]} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {pieData.map((item: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                <span style={{ fontWeight: '600' }}>%{total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kategori Bazlı Varlık Listesi */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <p style={{ fontWeight: '600', marginBottom: '12px' }}>Portföy</p>
        {pieData.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>Henüz varlık eklenmedi</p>
        ) : (
          pieData.map((group: any, gi: number) => {
            const groupGain = group.value - group.cost
            const groupGainPct = group.cost > 0 ? (groupGain / group.cost) * 100 : 0
            return (
              <div key={gi} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[gi % COLORS.length] }} />
                    <span style={{ fontWeight: '600', fontSize: '13px' }}>{group.label}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{group.items.length} varlık</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '600' }}>{fc(group.value)}</p>
                    {group.cost > 0 && (
                      <p style={{ fontSize: '11px', color: groupGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {fp(groupGainPct)}
                      </p>
                    )}
                  </div>
                </div>
                {group.items.map((asset: any) => {
                  const value = getAssetValue(asset)
                  const cost = getCostValue(asset)
                  const gain = value - cost
                  const gainPct = cost > 0 ? (gain / cost) * 100 : 0
                  const isManual = ['bes', 'vadeli'].includes(asset.type)
                  const hasPrice = prices[asset.symbol] !== undefined
                  const isUSD = ['usd_hisse', 'kripto', 'etf'].includes(asset.type)

                  return (
                    <div key={asset.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 8px 16px' }}>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: '500' }}>{asset.name}</p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                          {asset.symbol || ''}
                          {!isManual && asset.quantity ? ` • ${asset.quantity} adet` : ''}
                          {hasPrice ? ` • ${isUSD ? `$${(prices[asset.symbol] / usdRate).toFixed(2)}` : fc(prices[asset.symbol])}` : ''}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '14px', fontWeight: '600' }}>{fc(value)}</p>
                        {!isManual && cost > 0 && (
                          <p style={{ fontSize: '11px', color: gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {fp(gainPct)}
                          </p>
                        )}
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          %{total > 0 ? ((value / total) * 100).toFixed(1) : 0}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {/* Yenile */}
      <button onClick={fetchAssets} disabled={pricesLoading}
        style={{ width: '100%', padding: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px', opacity: pricesLoading ? 0.6 : 1 }}>
        {pricesLoading ? 'Güncelleniyor...' : '🔄 Fiyatları Yenile'}
      </button>

      {/* Davet */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: '600', fontSize: '14px' }}>👥 Portföyü Paylaş</p>
          <button onClick={() => setShowInvite(!showInvite)}
            style={{ background: 'none', color: 'var(--accent)', fontSize: '13px' }}>
            {showInvite ? 'Kapat' : 'Davet Et'}
          </button>
        </div>
        {showInvite && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="esim@email.com"
                style={{ flex: 1, padding: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }}
              />
              <button onClick={handleInvite}
                style={{ padding: '10px 16px', background: 'var(--accent)', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '14px' }}>
                Gönder
              </button>
            </div>
            {inviteStatus === 'success' && <p style={{ color: 'var(--green)', fontSize: '13px', marginTop: '8px' }}>✅ Davet gönderildi!</p>}
            {inviteStatus === 'not_found' && <p style={{ color: 'var(--red)', fontSize: '13px', marginTop: '8px' }}>❌ Bu email ile kayıtlı kullanıcı bulunamadı. Önce kayıt olması gerekiyor.</p>}
            {inviteStatus === 'already' && <p style={{ color: 'var(--yellow)', fontSize: '13px', marginTop: '8px' }}>⚠️ Bu kullanıcı zaten portföy üyesi.</p>}
            {inviteStatus === 'error' && <p style={{ color: 'var(--red)', fontSize: '13px', marginTop: '8px' }}>❌ Bir hata oluştu.</p>}
          </div>
        )}
      </div>

      {/* Alt Navigasyon */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '12px 0' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', color: 'var(--accent)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ fontSize: '20px' }}>📊</span> Portföy
        </button>
        <button onClick={() => navigate('/analitik')} style={{ background: 'none', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ fontSize: '20px' }}>📈</span> Analitik
        </button>
        <button onClick={() => navigate('/varliklar')} style={{ background: 'none', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ fontSize: '20px' }}>➕</span> Varlık Ekle
        </button>
      </div>
    </div>
  )
}

export default Dashboard