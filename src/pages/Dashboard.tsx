import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchAllPrices } from '../lib/prices'
import { saveSnapshot } from '../lib/snapshot'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#6366f1', '#059669', '#d97706', '#dc2626', '#2563eb', '#7c3aed', '#0891b2']

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
  const [usdRate, setUsdRate] = useState<number>(46.4)
  const [portfolioId, setPortfolioId] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')
  const [dailyChange, setDailyChange] = useState<number | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  useEffect(() => { fetchAssets() }, [])

  const fetchAssets = async () => {
    const { data: portfolios } = await supabase
      .from('portfolios').select('id').eq('user_id', user.id)

    if (!portfolios?.length) {
      await supabase.from('portfolios').insert({ user_id: user.id, name: 'Ana Portföy' })
      setLoading(false)
      return
    }

    if (portfolios?.length) setPortfolioId(portfolios[0].id)

    const { data: memberPortfolios } = await supabase
      .from('portfolio_members').select('portfolio_id').eq('user_id', user.id)

    const allPortfolioIds = [
      portfolios[0].id,
      ...(memberPortfolios?.map((m: any) => m.portfolio_id) || [])
    ]

    const { data: assetsData } = await supabase
      .from('assets')
      .select('*, manual_values(value, recorded_at)')
      .in('portfolio_id', allPortfolioIds)
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
      // Günlük değişim hesapla
      if (portfolios?.[0]?.id) {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yStr = yesterday.toISOString().split('T')[0]

        const { data: ySnap } = await supabase
          .from('portfolio_snapshots')
          .select('total_value')
          .eq('portfolio_id', portfolios[0].id)
          .eq('snapshot_date', yStr)
          .single()

        if (ySnap) {
          const todayVal = loaded.reduce((sum: number, a: any) => {
            if (['bes', 'vadeli'].includes(a.type)) {
              const vals = a.manual_values || []
              return sum + Number(vals[vals.length - 1]?.value || 0)
            }
            const p = fetched[a.symbol] ?? a.avg_cost ?? 0
            return sum + p * Number(a.quantity)
          }, 0)
          setDailyChange(todayVal - Number(ySnap.total_value))
        }
      }
      setPricesLoading(false)
    }
  }

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

  const getAssetValue = (asset: any) => {
    if (asset.type === 'vadeli' && asset.principal && asset.interest_rate) {
      const start = new Date(asset.start_date || asset.created_at)
      const days = Math.max(0, Math.floor((new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
      const dailyRate = asset.interest_rate / 365 / 100
      return Number(asset.principal) * (1 + dailyRate * days)
    }
    if (['bes', 'vadeli'].includes(asset.type)) {
      const vals = asset.manual_values || []
      return Number(vals[vals.length - 1]?.value || 0)
    }
    const price = prices[asset.symbol] ?? asset.avg_cost ?? 0
    return price * Number(asset.quantity)
  }

  const getCostValue = (asset: any) => {
    if (asset.type === 'vadeli' && asset.principal) return Number(asset.principal)
    if (asset.type === 'bes') return getAssetValue(asset)
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <p style={{ color: 'var(--text-secondary)' }}>Yükleniyor...</p>
    </div>
  )

  const card = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: 'var(--shadow)'
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '16px', paddingBottom: '90px', background: 'var(--bg-primary)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingTop: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>Kumbaram</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{user.email}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '10px', padding: '3px', border: '1px solid var(--border)' }}>
            <button onClick={() => setDisplayCurrency('TRY')}
              style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', background: displayCurrency === 'TRY' ? 'var(--accent)' : 'none', color: displayCurrency === 'TRY' ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
              ₺
            </button>
            <button onClick={() => setDisplayCurrency('USD')}
              style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', background: displayCurrency === 'USD' ? 'var(--accent)' : 'none', color: displayCurrency === 'USD' ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
              $
            </button>
          </div>
          <button onClick={signOut} style={{ padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '13px', boxShadow: 'var(--shadow)' }}>
            Çıkış
          </button>
        </div>
      </div>

      {/* Ana Değer Kartı */}
      <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', borderRadius: '20px', padding: '24px', marginBottom: '16px', boxShadow: '0 8px 32px rgba(99,102,241,0.3)' }}>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginBottom: '8px', fontWeight: '500' }}>Toplam Portföy Değeri</p>
        <p style={{ fontSize: '36px', fontWeight: '800', color: 'white', letterSpacing: '-1px', marginBottom: '4px' }}>{fc(total)}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{assets.length} varlık</span>
          {totalCost > 0 && (
            <span style={{ fontSize: '13px', fontWeight: '700', color: totalGain >= 0 ? '#a7f3d0' : '#fca5a5', background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: '20px' }}>
              {fp(totalGainPct)} ({fc(totalGain)})
            </span>
          )}
        </div>
        {dailyChange !== null && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.15)', borderRadius: '20px', padding: '4px 12px', marginTop: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: dailyChange >= 0 ? '#a7f3d0' : '#fca5a5' }}>
              {dailyChange >= 0 ? '▲' : '▼'} Bugün: {dailyChange >= 0 ? '+' : ''}{fc(dailyChange)}
            </span>
          </div>
        )}
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '6px' }}>
          {pricesLoading ? '⏳ Fiyatlar güncelleniyor...' : lastUpdated ? `Son güncelleme: ${lastUpdated.toLocaleTimeString('tr-TR')}` : ''}
        </p>
      </div>

      {/* 3 Metrik Kart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ ...card, padding: '14px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '10px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Yatırılan</p>
          <p style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(totalCost)}</p>
        </div>
        <div style={{ ...card, padding: '14px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '10px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Kar/Zarar</p>
          <p style={{ fontSize: '15px', fontWeight: '700', color: totalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totalGain >= 0 ? '+' : ''}{fc(totalGain)}
          </p>
        </div>
        <div style={{ ...card, padding: '14px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '10px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Getiri</p>
          <p style={{ fontSize: '15px', fontWeight: '700', color: totalGainPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fp(totalGainPct)}
          </p>
        </div>
      </div>

      {/* Dağılım */}
      {pieData.length > 0 && (
        <div style={{ ...card, marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px', color: 'var(--text-primary)' }}>Dağılım</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" nameKey="name" paddingAngle={2}
                onClick={(data: any) => setSelectedGroup(selectedGroup === data.type ? null : data.type)}
                style={{ cursor: 'pointer' }}>
                  {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(val: any, name: any) => [fc(val), name]} contentStyle={{ background: 'white', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {pieData.map((item: any, i: number) => (
                <div key={i}
                  onClick={() => setSelectedGroup(selectedGroup === item.type ? null : item.type)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', background: selectedGroup === item.type ? 'var(--bg-elevated)' : 'none', transition: 'background 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: COLORS[i % COLORS.length] }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    %{total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {selectedGroup && (() => {
            const group = pieData.find((g: any) => g.type === selectedGroup)
            if (!group) return null
            return (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <p style={{ fontWeight: '700', fontSize: '13px', marginBottom: '10px', color: 'var(--text-primary)' }}>{group.label} — Dağılım</p>
                {group.items.map((asset: any) => {
                  const value = getAssetValue(asset)
                  const weight = group.value > 0 ? ((value / group.value) * 100).toFixed(1) : 0
                  return (
                    <div key={asset.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600' }}>{asset.name}</span>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '13px', fontWeight: '700' }}>{fc(value)}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>%{weight}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* Portföy Listesi */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <p style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px', color: 'var(--text-primary)' }}>Portföy</p>
        {pieData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ fontSize: '32px', marginBottom: '8px' }}>📭</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Henüz varlık eklenmedi</p>
          </div>
        ) : (
          pieData.map((group: any, gi: number) => {
            const groupGain = group.value - group.cost
            const groupGainPct = group.cost > 0 ? (groupGain / group.cost) * 100 : 0
            return (
              <div key={gi} style={{ marginBottom: '8px' }}>
                {/* Kategori Başlığı */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: '10px', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[gi % COLORS.length] }} />
                    <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>{group.label}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{group.items.length}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(group.value)}</p>
                    {group.cost > 0 && (
                      <p style={{ fontSize: '11px', fontWeight: '600', color: groupGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {fp(groupGainPct)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Varlıklar */}
                {group.items.map((asset: any, ai: number) => {
                  const value = getAssetValue(asset)
                  const cost = getCostValue(asset)
                  const gain = value - cost
                  const gainPct = cost > 0 ? (gain / cost) * 100 : 0
                  const isManual = ['bes', 'vadeli'].includes(asset.type)
                  const isUSDAsset = ['usd_hisse', 'kripto', 'etf'].includes(asset.type)
                  const hasPrice = prices[asset.symbol] !== undefined

                  return (
                    <div key={asset.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px 10px 28px', borderBottom: ai < group.items.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                     <div>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{asset.name}</p>
                        <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '2px' }}>
                          {asset.symbol && <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{asset.symbol}</span>}
                          {!isManual && asset.quantity ? ` · ${asset.quantity} adet` : ''}
                          {hasPrice ? ` · ${isUSDAsset ? `$${(prices[asset.symbol + '_usd'] ?? (prices[asset.symbol] / usdRate)).toFixed(2)}` : fc(prices[asset.symbol])}` : ''}                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {fc(value)}
                        </p>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                          {!isManual && prices[asset.symbol + '_dailypct'] !== undefined && (
                            <span style={{ fontSize: '11px', fontWeight: '600', color: prices[asset.symbol + '_dailypct'] >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {prices[asset.symbol + '_dailypct'] >= 0 ? '▲' : '▼'} {Math.abs(prices[asset.symbol + '_dailypct']).toFixed(2)}%
                            </span>
                          )}
                        </div>
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
        style={{ width: '100%', padding: '13px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', color: pricesLoading ? 'var(--text-tertiary)' : 'var(--accent)', fontSize: '14px', fontWeight: '600', marginBottom: '12px', boxShadow: 'var(--shadow)', transition: 'all 0.2s' }}>
        {pricesLoading ? '⏳ Güncelleniyor...' : '🔄 Fiyatları Yenile'}
      </button>

      {/* Davet */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>👥 Portföyü Paylaş</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>Eşini davet et</p>
          </div>
          <button onClick={() => setShowInvite(!showInvite)}
            style={{ padding: '7px 14px', background: showInvite ? 'var(--bg-elevated)' : 'var(--accent-dim)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--accent)', fontSize: '13px', fontWeight: '600' }}>
            {showInvite ? 'Kapat' : 'Davet Et'}
          </button>
        </div>
        {showInvite && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="esim@email.com"
                style={{ flex: 1, padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '14px' }} />
              <button onClick={handleInvite}
                style={{ padding: '10px 16px', background: 'var(--accent)', borderRadius: '10px', color: 'white', fontWeight: '600', fontSize: '14px' }}>
                Gönder
              </button>
            </div>
            {inviteStatus === 'success' && <p style={{ color: 'var(--green)', fontSize: '13px', marginTop: '8px', fontWeight: '600' }}>✅ Davet gönderildi!</p>}
            {inviteStatus === 'not_found' && <p style={{ color: 'var(--red)', fontSize: '13px', marginTop: '8px' }}>❌ Kullanıcı bulunamadı. Önce kayıt olması gerekiyor.</p>}
            {inviteStatus === 'already' && <p style={{ color: 'var(--yellow)', fontSize: '13px', marginTop: '8px' }}>⚠️ Bu kullanıcı zaten üye.</p>}
            {inviteStatus === 'error' && <p style={{ color: 'var(--red)', fontSize: '13px', marginTop: '8px' }}>❌ Bir hata oluştu.</p>}
          </div>
        )}
      </div>

      {/* Alt Navigasyon */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '10px 0 16px' }}>
        {[
          { path: '/', icon: '📊', label: 'Portföy' },
          { path: '/analitik', icon: '📈', label: 'Analitik' },
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

export default Dashboard