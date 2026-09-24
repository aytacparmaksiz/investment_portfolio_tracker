import { useState, useEffect } from 'react'
import { FALLBACK_USD_RATE } from '../lib/constants'
import { useAuth } from '../context/AuthContext'
import { usePortfolio } from '../context/PortfolioContext'
import { supabase } from '../lib/supabase'
import { fetchSnapshots } from '../lib/snapshot'
import { useNavigate, useLocation } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { getCurrentValue, getCostValue, isUSD } from '../lib/calculations'

const COLORS = ['#6366f1', '#059669', '#d97706', '#dc2626', '#2563eb', '#7c3aed', '#0891b2']

const ASSET_LABELS: Record<string, string> = {
  hisse: 'BIST Hisse', usd_hisse: 'ABD Hisse', kripto: 'Kripto',
  etf: 'ETF', doviz: 'Döviz', altin: 'Altın', fon: 'TEFAS Fon', bes: 'BES', vadeli: 'Vadeli Mevduat', nakit: 'Nakit'
}

const Dashboard = () => {
  const { user, signOut } = useAuth()
  const { assets, prices, loading, pricesLoading, lastUpdated, portfolioId, allPortfolioIds, refresh, isHidden, setIsHidden } = usePortfolio()
  const navigate = useNavigate()
  const location = useLocation()
  const [displayCurrency, setDisplayCurrency] = useState<'TRY' | 'USD'>('TRY')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [dailyChange, setDailyChange] = useState<number | null>(null)
  const [dailyChangePct, setDailyChangePct] = useState(0)
  
  const { pullDistance, refreshing } = usePullToRefresh(refresh)

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const calcDaily = async () => {
      const pids = (allPortfolioIds && allPortfolioIds.length > 0) ? allPortfolioIds : (portfolioId ? [portfolioId] : [])
      if (pids.length === 0) return

      try {
        const data = await fetchSnapshots(pids, 30)
        if (!data || data.length < 2) return

        const latest = data[data.length - 1]
        const previous = data[data.length - 2]

        const change =
          (Number(latest.total_value) - Number(previous.total_value)) -
          (Number(latest.total_cost || 0) - Number(previous.total_cost || 0))

        setDailyChange(change)
        setDailyChangePct(
          Number(previous.total_value) > 0
            ? (change / Number(previous.total_value)) * 100
            : 0
        )
      } catch (err) {
        console.error('Error calculating daily change:', err)
      }
    }

    calcDaily()
  }, [portfolioId, allPortfolioIds, refreshing])

  const usdRate = prices['USDTRY=X'] || FALLBACK_USD_RATE

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

  
  const groupByType = () => {
    const groups: Record<string, any> = {}
    assets.filter((asset: any) => {
      if (['bes', 'vadeli', 'nakit'].includes(asset.type)) return true
      return Number(asset.quantity) > 0
    }).forEach(asset => {
      const type = asset.type
      if (!groups[type]) groups[type] = {
        type, label: ASSET_LABELS[type] || type,
        name: ASSET_LABELS[type] || type,
        value: 0, cost: 0, costUSD: 0, items: []
      }
      groups[type].value += getCurrentValue(asset, prices, usdRate)
      
      const costTRY = getCostValue(asset, usdRate)
      groups[type].cost += costTRY

      const isUSDAsset = isUSD(asset.type)
      const isUsdDoviz = asset.type === 'doviz' && (asset.symbol?.toUpperCase() === 'USD' || !asset.symbol)
      const assetCostUSD = isUSDAsset
        ? (Number(asset.avg_cost || 0) * Number(asset.quantity || 0))
        : isUsdDoviz
        ? Number(asset.quantity || 0)
        : (costTRY / usdRate)

      groups[type].costUSD += assetCostUSD

      groups[type].items.push(asset)
    })
    return Object.values(groups).filter((g: any) => g.value > 0).sort((a: any, b: any) => b.value - a.value)
  }

  const pieData = groupByType()
  const activeAssets = assets.filter((a: any) => ['bes', 'vadeli', 'nakit'].includes(a.type) || Number(a.quantity) > 0)
  
  const total = activeAssets.reduce((sum, a) => sum + getCurrentValue(a, prices, usdRate), 0)
  const totalCost = activeAssets.reduce((sum, a) => sum + getCostValue(a, usdRate), 0)
  
  const totalCostUSD = activeAssets.reduce((sum, a) => {
    const isUSDAsset = isUSD(a.type)
    const isUsdDoviz = a.type === 'doviz' && (a.symbol?.toUpperCase() === 'USD' || !a.symbol)
    if (isUSDAsset) {
      return sum + (Number(a.avg_cost || 0) * Number(a.quantity || 0))
    }
    if (isUsdDoviz) {
      return sum + Number(a.quantity || 0)
    }
    return sum + (getCostValue(a, usdRate) / usdRate)
  }, 0)

  const isDispUSD = displayCurrency === 'USD'
  const dispTotalCost = isDispUSD ? totalCostUSD : totalCost
  const dispTotalGain = (isDispUSD ? total / usdRate : total) - dispTotalCost
  const dispTotalGainPct = dispTotalCost > 0 ? (dispTotalGain / dispTotalCost) * 100 : 0

  const fc = (val: number) => {
    if (isHidden) return '••••••'
    if (displayCurrency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val / usdRate)
    }
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val)
  }
  
  const formatExact = (val: number, isUSD: boolean) => {
    if (isHidden) return '••••••'
    if (isUSD) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
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

      {(pullDistance > 0 || refreshing) && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: `${refreshing ? 50 : pullDistance}px`, transition: refreshing ? 'none' : 'height 0.1s', overflow: 'hidden' }}>
          <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: '600' }}>
            {refreshing ? '⏳ Yenileniyor...' : pullDistance > 60 ? '↓ Bırak ve yenile' : '↓ Çek'}
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingTop: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>Kumbaram</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{user.email}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '10px', padding: '3px', border: '1px solid var(--border)' }}>
            <button onClick={() => setDisplayCurrency('TRY')}
              style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', background: displayCurrency === 'TRY' ? 'var(--accent)' : 'none', color: displayCurrency === 'TRY' ? 'white' : 'var(--text-secondary)' }}>
              ₺
            </button>
            <button onClick={() => setDisplayCurrency('USD')}
              style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', background: displayCurrency === 'USD' ? 'var(--accent)' : 'none', color: displayCurrency === 'USD' ? 'white' : 'var(--text-secondary)' }}>
              $
            </button>
          </div>
          <button 
            onClick={() => setIsHidden(!isHidden)} 
            style={{ 
              padding: '8px 12px', 
              background: 'var(--bg-card)', 
              border: '1px solid var(--border)', 
              borderRadius: '10px', 
              cursor: 'pointer', 
              fontSize: '13px', 
              fontWeight: '600', 
              color: 'var(--text-primary)' 
            }}
          >
            {isHidden ? '👁️ Göster' : '🔒 Gizle'}
          </button>
          <button onClick={signOut} style={{ padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '13px', boxShadow: 'var(--shadow)' }}>
            Çıkış
          </button>
        </div>
      </div>

      {/* Ana Değer Kartı */}
      <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', borderRadius: '20px', padding: '24px', marginBottom: '16px', boxShadow: '0 8px 32px rgba(99,102,241,0.3)' }}>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginBottom: '8px', fontWeight: '500' }}>Toplam Portföy Değeri</p>
        <p style={{ fontSize: '36px', fontWeight: '800', color: 'white', letterSpacing: '-1px', marginBottom: '4px' }}>{fc(total)}</p>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginTop: '4px' }}>{activeAssets.length} varlık</p>
        {dailyChange !== null && (
          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: '14px',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '10px',
              padding: '8px 14px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: dailyChange >= 0 ? '#a7f3d0' : '#fca5a5',
                fontWeight: 700
              }}
            >
              <span>{dailyChange >= 0 ? '▲' : '▼'}</span>

              <span>{fc(Math.abs(dailyChange))}</span>

              <span>
                ({dailyChangePct >= 0 ? '+' : ''}
                {dailyChangePct.toFixed(2)}%)
              </span>
            </div>

            <div
              style={{
                marginTop: '2px',
                fontSize: '11px',
                color: 'rgba(255,255,255,.75)'
              }}
            >
            </div>
          </div>
        )}

        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '10px' }}>
          {pricesLoading ? '⏳ Fiyatlar güncelleniyor...' : lastUpdated ? `Son güncelleme: ${lastUpdated.toLocaleTimeString('tr-TR')}` : ''}
        </p>
      </div>

      {/* 3 Metrik Kart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ ...card, padding: '14px', minWidth: 0 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '10px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Yatırılan</p>
          <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatExact(dispTotalCost, isDispUSD)}</p>
        </div>
        <div style={{ ...card, padding: '14px', minWidth: 0 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '10px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Kar/Zarar</p>
          <p style={{ fontSize: '13px', fontWeight: '700', color: dispTotalGain >= 0 ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {dispTotalGain >= 0 ? '+' : ''}{formatExact(dispTotalGain, isDispUSD)}
          </p>
        </div>
        <div style={{ ...card, padding: '14px', minWidth: 0 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '10px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Getiri</p>
          <p style={{ fontSize: '13px', fontWeight: '700', color: dispTotalGainPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fp(dispTotalGainPct)}
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
                  style={{ cursor: 'pointer', outline: 'none' }}
                  tabIndex={-1}
                  isAnimationActive={false}>
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

            if (group.type === 'usd_hisse') {
              const strategies: Record<string, { value: number, items: any[] }> = {}
              group.items.forEach((a: any) => {
                const st = a.strategy || 'Belirtilmemiş'
                if (!strategies[st]) strategies[st] = { value: 0, items: [] }
                strategies[st].value += getCurrentValue(a, prices, usdRate)
                strategies[st].items.push(a)
              })
              
              const strategyData = Object.entries(strategies).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.value - a.value)
              
              return (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    {selectedStrategy && (
                      <button onClick={() => setSelectedStrategy(null)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', fontWeight: '700', padding: '4px 8px', color: 'var(--text-secondary)' }}>← Geri</button>
                    )}
                    <p style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>
                      {selectedStrategy ? `${selectedStrategy} Stratejisi Detayı` : `${group.label} — Strateji Dağılımı`}
                    </p>
                  </div>

                  {!selectedStrategy ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <ResponsiveContainer width={100} height={100}>
                        <PieChart>
                          <Pie data={strategyData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" nameKey="name" paddingAngle={2}
                            onClick={(data: any) => setSelectedStrategy(data.name)} style={{ cursor: 'pointer', outline: 'none' }} isAnimationActive={false}>
                            {strategyData.map((_: any, i: number) => <Cell key={i} fill={['#f59e0b', '#10b981', '#6366f1', '#8b5cf6'][i % 4]} />)}
                          </Pie>
                          <Tooltip formatter={(val: any, name: any) => [fc(val), name]} contentStyle={{ background: 'white', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1 }}>
                        {strategyData.map((item: any, i: number) => {
                          const weight = group.value > 0 ? ((item.value / group.value) * 100).toFixed(1) : 0
                          return (
                            <div key={i} onClick={() => setSelectedStrategy(item.name)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: ['#f59e0b', '#10b981', '#6366f1', '#8b5cf6'][i % 4] }} />
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.name}</span>
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>%{weight}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {strategies[selectedStrategy]?.items
                        .map((asset: any) => ({ asset, value: getCurrentValue(asset, prices, usdRate) }))
                        .sort((a: any, b: any) => b.value - a.value)
                        .map(({ asset, value }) => {
                          const weight = strategies[selectedStrategy].value > 0 ? ((value / strategies[selectedStrategy].value) * 100).toFixed(1) : 0;
                          return (
                            <div key={asset.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid var(--border-light)', borderRadius: '6px' }}>
                              <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600' }}>{asset.name}</span>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '13px', fontWeight: '700' }}>{fc(value)}</p>
                                <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>%{weight}</p>
                              </div>
                            </div>
                          )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <p style={{ fontWeight: '700', fontSize: '13px', marginBottom: '10px', color: 'var(--text-primary)' }}>{group.label} — Dağılım</p>
                {group.items
                  .map((asset: any) => ({ asset, value: getCurrentValue(asset, prices, usdRate) }))
                  .sort((a: any, b: any) => b.value - a.value)
                  .map(({ asset, value }) => {
                    const weight = group.value > 0 ? ((value / group.value) * 100).toFixed(1) : 0;
                    return (
                      <div key={asset.id}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid var(--border-light)', borderRadius: '6px', transition: 'background 0.15s ease' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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
            const groupGainTRY = group.value - group.cost
            const groupGainPctTRY = group.cost > 0 ? (groupGainTRY / group.cost) * 100 : 0
            
            const groupValueUSD = group.value / usdRate
            const groupGainUSD = groupValueUSD - group.costUSD
            const groupGainPctUSD = group.costUSD > 0 ? (groupGainUSD / group.costUSD) * 100 : 0
            
            const dispGroupGainPct = isDispUSD ? groupGainPctUSD : groupGainPctTRY

            return (
              <div key={gi} style={{ marginBottom: '8px' }}>
                <div onClick={() => {
                    const next = new Set(expandedGroups)
                    if (next.has(group.type)) next.delete(group.type)
                    else next.add(group.type)
                    setExpandedGroups(next)
                  }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: '10px', marginBottom: '4px', cursor: 'pointer', transition: 'background 0.15s ease, transform 0.1s ease' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.99)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[gi % COLORS.length] }} />
                    <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>{group.label}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{group.items.length}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: expandedGroups.has(group.type) ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(group.value)}</p>
                    {(isDispUSD ? group.costUSD > 0 : group.cost > 0) && (
                      <p style={{ fontSize: '11px', fontWeight: '600', color: dispGroupGainPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {fp(dispGroupGainPct)}
                      </p>
                    )}
                  </div>
                </div>

                {expandedGroups.has(group.type) && group.items.map((asset: any, ai: number) => {
                  const value = getCurrentValue(asset, prices, usdRate)
                  const isManual = ['bes', 'vadeli'].includes(asset.type)
                  const isUSDAsset = isUSD(asset.type)
                  const hasPrice = prices[asset.symbol] !== undefined

                  return (
                    <div key={asset.id}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px 10px 28px', borderBottom: ai < group.items.length - 1 ? '1px solid var(--border-light)' : 'none', borderRadius: '8px', transition: 'background 0.15s ease' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{asset.name}</p>
                        <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '2px' }}>
                          {asset.symbol && <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>{asset.symbol}</span>}
                          {!isManual && asset.quantity ? ` · ${asset.quantity} adet` : ''}
                          {hasPrice ? ` · ${isUSDAsset ? `$${(prices[asset.symbol + '_usd'] ?? (prices[asset.symbol] / usdRate)).toFixed(2)}` : fc(prices[asset.symbol])}` : ''}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(value)}</p>
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
      <button onClick={() => refresh(true)} disabled={pricesLoading}
        style={{ width: '100%', padding: '13px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', color: pricesLoading ? 'var(--text-tertiary)' : 'var(--accent)', fontSize: '14px', fontWeight: '600', marginBottom: '12px', boxShadow: 'var(--shadow)', transition: 'all 0.2s' }}>
        {pricesLoading ? '⏳ Güncelleniyor...' : '🔄 Fiyatları Yenile'}
      </button>

      {/* Davet */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>👥 Portföyünü Paylaş</p>
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


    </div>
  )
}

export default Dashboard