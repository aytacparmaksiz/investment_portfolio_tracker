import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePortfolio } from '../context/PortfolioContext'
import { supabase } from '../lib/supabase'
import { fetchSnapshots } from '../lib/snapshot'
import { calculateComparison } from '../lib/comparison'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useNavigate, useLocation } from 'react-router-dom'

const Analytics = () => {
  const { user } = useAuth()
  const { assets, prices, portfolioId, refresh } = usePortfolio()
  const navigate = useNavigate()
  const location = useLocation()
  const [snapshots, setSnapshots] = useState<any[]>([])
  
  // URL'e göre aktif sekmeyi anlık belirliyoruz (Geçişi 0ms yapan kısım)
  const activeTab = location.pathname === '/analitik-varliklar' ? 'varliklar' : 'performans'
  
  const [range, setRange] = useState<number>(30)
  const [comparison, setComparison] = useState<any | null>(null)
  const [compLoading, setCompLoading] = useState(false)
  const [totalCost, setTotalCost] = useState<number>(0)
  const [firstTxDate, setFirstTxDate] = useState<string>('')
  const [expandedAssetGroups, setExpandedAssetGroups] = useState<Set<string>>(new Set())

  // İlk açılışta verileri tazele
  useEffect(() => { 
    refresh()
    fetchExtra() 
  }, [])

  // Range veya portfolioId değiştiğinde snapshot'ları getir (Sayfayı kilitlemeden arka planda yüklenir)
  useEffect(() => { 
    if (portfolioId) loadSnapshots(portfolioId, range) 
  }, [range, portfolioId])

  useEffect(() => {
    if (assets.length > 0 && expandedAssetGroups.size === 0) {
      const usdRateLocal = prices['USDTRY=X'] || 46.4
      const filtered = assets.filter(a => !['bes', 'vadeli'].includes(a.type))
      const groups: Record<string, any[]> = {}
      filtered.forEach(a => { if (!groups[a.type]) groups[a.type] = []; groups[a.type].push(a) })
      const sorted = Object.entries(groups).sort((a, b) => {
        const sumValue = (items: any[]) => items.reduce((s, asset) => {
          const isU = ['usd_hisse', 'kripto', 'etf'].includes(asset.type)
          const p = prices[asset.symbol] ?? (asset.avg_cost ? asset.avg_cost * (isU ? usdRateLocal : 1) : 0)
          return s + p * Number(asset.quantity)
        }, 0)
        return sumValue(b[1]) - sumValue(a[1])
      })
      if (sorted.length > 0) setExpandedAssetGroups(new Set([sorted[0][0]]))
    }
  }, [assets, prices])

  const fetchExtra = async () => {
    if (!user) return
    const { data: portfolios } = await supabase
      .from('portfolios').select('id').eq('user_id', user.id)

    if (portfolios?.length) {
      const { data: snapData } = await supabase
        .from('portfolio_snapshots')
        .select('total_cost, snapshot_date')
        .eq('portfolio_id', portfolios[0].id)
        .order('snapshot_date', { ascending: true })
        .limit(1)

      if (snapData?.length) {
        setTotalCost(Number(snapData[0].total_cost))
        setFirstTxDate(snapData[0].snapshot_date)
      }
    }
  }

  const loadSnapshots = async (pid: string, days: number) => {
    const data = await fetchSnapshots(pid, days)
    setSnapshots(data)
  }

  const fc = (val: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val)

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'short' })}`
  }

  const chartData = snapshots.map(s => ({
    date: formatDate(s.snapshot_date),
    deger: Number(s.total_value),
    maliyet: Number(s.total_cost),
    kar: Number(s.total_value) - Number(s.total_cost)
  }))

  const first = chartData[0]?.deger || 0
  const last = chartData[chartData.length - 1]?.deger || 0
  const totalGain = last - first
  const totalGainPct = first > 0 ? (totalGain / first) * 100 : 0

  const ranges = [
    { label: '7G', value: 7 },
    { label: '1A', value: 30 },
    { label: '3A', value: 90 },
    { label: '6A', value: 180 },
    { label: '1Y', value: 365 },
  ]

  const card = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: 'var(--shadow)'
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '16px', paddingBottom: '90px', background: 'var(--bg-primary)', minHeight: '100vh' }}>

      <div style={{ paddingTop: '16px', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>Analitik</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>Portföy performansı</p>
      </div>

      {/* Varlıklar Sekmesi */}
      {activeTab === 'varliklar' && (() => {
        const ASSET_LABELS: Record<string, string> = {
          hisse: 'BIST Hisse', usd_hisse: 'ABD Hisse', kripto: '₿ Kripto',
          etf: '📈 ETF', doviz: '💱 Döviz', altin: '🥇 Altın'
        }
        const usdRate = prices['USDTRY=X'] || 46.4
        const TYPE_COLORS: Record<string, string> = {
          hisse: '#35D6ED', usd_hisse: '#1A224C', kripto: '#8b5cf6',
          etf: '#f59e0b', doviz: '#10b981', altin: '#ECC703', vadeli: '#0891b2'
        }
        const filtered = assets.filter(a => !['bes', 'vadeli'].includes(a.type))
        const groups: Record<string, any[]> = {}
        filtered.forEach(a => {
          if (!groups[a.type]) groups[a.type] = []
          groups[a.type].push(a)
        })
        const sortedGroupEntries = Object.entries(groups).sort((a, b) => {
          const sumValue = (items: any[]) => items.reduce((s, asset) => {
            const isU = ['usd_hisse', 'kripto', 'etf'].includes(asset.type)
            const p = prices[asset.symbol] ?? (asset.avg_cost ? asset.avg_cost * (isU ? usdRate : 1) : 0)
            return s + p * Number(asset.quantity)
          }, 0)
          return sumValue(b[1]) - sumValue(a[1])
        })

        return (
          <div>
            <p style={{ fontWeight: '800', fontSize: '17px', marginBottom: '16px', color: 'var(--text-primary)' }}>Varlık Performansı</p>
            {filtered.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: '32px 0' }}>
                <p style={{ fontSize: '32px', marginBottom: '8px' }}>📭</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Henüz varlık eklenmedi</p>
              </div>
            ) : (
              sortedGroupEntries.map(([type, items]) => {
                const isUSD = ['usd_hisse', 'kripto', 'etf'].includes(type)
                const isExpanded = expandedAssetGroups.has(type)
                return (
                <div key={type} style={{ ...card, marginBottom: '12px', borderLeft: `3px solid ${TYPE_COLORS[type] || '#6b7280'}` }}>
                  <div onClick={() => {
                      const next = new Set(expandedAssetGroups)
                      if (next.has(type)) next.delete(type); else next.add(type)
                      setExpandedAssetGroups(next)
                    }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isExpanded ? '14px' : 0 }}>
                    <p style={{ fontWeight: '800', fontSize: '11px', color: TYPE_COLORS[type] || '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      {ASSET_LABELS[type] || type} · {items.length} varlık
                    </p>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                  </div>

                  {isExpanded && items.map((asset: any, index: number) => {
                    const livePrice = prices[asset.symbol] ?? (asset.avg_cost ? asset.avg_cost * (isUSD ? usdRate : 1) : 0)
                    const currentValue = livePrice * Number(asset.quantity)
                    const costValueTRY = isUSD && asset.total_try_cost ? Number(asset.total_try_cost) : (isUSD ? (asset.avg_cost || 0) * usdRate * Number(asset.quantity) : (asset.avg_cost || 0) * Number(asset.quantity))
                    const gain = currentValue - costValueTRY
                    const gainPct = costValueTRY > 0 ? (gain / costValueTRY) * 100 : 0
                    const dailyPct = prices[asset.symbol + '_dailypct']
                    const unitCostDisplay = isUSD
                      ? `$${((costValueTRY / Number(asset.quantity || 1)) / usdRate).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                      : `₺${(costValueTRY / Number(asset.quantity || 1)).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
                    const unitPriceDisplay = isUSD
                      ? `$${(livePrice / usdRate).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                      : `₺${livePrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`

                    return (
                      <div key={asset.id} style={{ marginBottom: index < items.length - 1 ? '16px' : 0, paddingBottom: index < items.length - 1 ? '16px' : 0, borderBottom: index < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <div style={{ width: '3px', height: '32px', borderRadius: '2px', background: TYPE_COLORS[type] || '#6b7280', flexShrink: 0, marginTop: '2px' }} />
                            <div>
                              <p style={{ fontWeight: '700', fontSize: '14px', color: '#1e1b4b' }}>{asset.name}</p>
                              <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '1px' }}>{asset.symbol} · {asset.quantity} adet</p>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <p style={{ fontSize: '15px', fontWeight: '800', color: gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {gain >= 0 ? `+₺${Math.abs(gain).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}` : `-₺${Math.abs(gain).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`}
                            </p>
                            <p style={{ fontSize: '11px', fontWeight: '700', color: gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {gain >= 0 ? '▲' : '▼'} {Math.abs(gainPct).toFixed(2)}%
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '3px' }}>MALİYET</p>
                            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>₺{costValueTRY.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
                            <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{unitCostDisplay}</p>
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '3px' }}>GÜNCEL</p>
                            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>₺{currentValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
                            <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{unitPriceDisplay}</p>
                          </div>
                          <div style={{ flex: 1, textAlign: 'right' }}>
                            <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '3px' }}>GÜNLÜK</p>
                            {dailyPct !== undefined ? (
                              <p style={{ fontSize: '12px', fontWeight: '700', color: dailyPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {dailyPct >= 0 ? '▲' : '▼'} {Math.abs(dailyPct).toFixed(2)}%
                              </p>
                            ) : <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>—</p>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )})
            )}
          </div>
        )
      })()}

      {/* Performans Sekmesi */}
      {activeTab === 'performans' && (
        <>
          {snapshots.length < 2 ? (
            <div style={{ ...card, textAlign: 'center', padding: '48px 16px' }}>
              <p style={{ fontSize: '40px', marginBottom: '12px' }}>📊</p>
              <p style={{ fontWeight: '700', fontSize: '16px', marginBottom: '8px', color: 'var(--text-primary)' }}>Henüz yeterli veri yok</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' }}>
                Grafik oluşması için en az 2 gün fiyat yenilemen gerekiyor.
              </p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {[
                  { label: 'Başlangıç', value: fc(first), color: 'var(--text-primary)' },
                  { label: 'Güncel', value: fc(last), color: 'var(--accent)' },
                  { label: 'Dönem Değişimi', value: `${totalGain >= 0 ? '+' : ''}${fc(totalGain)}`, color: totalGain >= 0 ? 'var(--green)' : 'var(--red)', sub: `${totalGain >= 0 ? '+' : ''}${totalGainPct.toFixed(2)}%` },
                  { label: 'Toplam Kar/Zarar', value: fc(last - (chartData[chartData.length-1]?.maliyet||0)), color: (last - (chartData[chartData.length-1]?.maliyet||0)) >= 0 ? 'var(--green)' : 'var(--red)' },
                ].map((item, i) => (
                  <div key={i} style={{ ...card, padding: '16px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' as const, fontWeight: '600', letterSpacing: '0.5px' }}>{item.label}</p>
                    <p style={{ fontSize: '16px', fontWeight: '700', color: item.color }}>{item.value}</p>
                    {item.sub && <p style={{ fontSize: '12px', color: item.color, marginTop: '2px', fontWeight: '600' }}>{item.sub}</p>}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                {ranges.map(r => (
                  <button key={r.value} onClick={() => setRange(r.value)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: '10px', fontSize: '12px', fontWeight: '700',
                      background: range === r.value ? 'var(--accent)' : 'var(--bg-card)',
                      border: `1px solid ${range === r.value ? 'var(--accent)' : 'var(--border)'}`,
                      color: range === r.value ? 'white' : 'var(--text-secondary)',
                      boxShadow: 'var(--shadow)' }}>
                    {r.label}
                  </button>
                ))}
              </div>

              <div style={{ ...card, marginBottom: '16px' }}>
                <p style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px', color: 'var(--text-primary)' }}>Portföy Büyümesi</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorDeger" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorMaliyet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <Tooltip formatter={(val: any) => fc(val)} contentStyle={{ background: 'white', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px', boxShadow: 'var(--shadow-md)' }} />
                    <Area type="monotone" dataKey="deger" name="Değer" stroke="#6366f1" fill="url(#colorDeger)" strokeWidth={2} />
                    <Area type="monotone" dataKey="maliyet" name="Maliyet" stroke="#9ca3af" fill="url(#colorMaliyet)" strokeWidth={1.5} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div style={{ ...card, marginBottom: '16px' }}>
                <p style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px', color: 'var(--text-primary)' }}>Kar/Zarar Performansı</p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorKar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <Tooltip formatter={(val: any) => fc(val)} contentStyle={{ background: 'white', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px', boxShadow: 'var(--shadow-md)' }} />
                    <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
                    <Area type="monotone" dataKey="kar" name="Kar/Zarar" stroke="#059669" fill="url(#colorKar)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {totalCost > 0 && firstTxDate && (
                <div style={{ ...card, marginBottom: '16px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>Alsaydın ne olurdu?</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                      {firstTxDate} · ₺{totalCost.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} yatırım
                    </p>
                  </div>

                  {!comparison && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px' }}>Başlangıç Tarihi</label>
                        <input type="date" defaultValue="2025-01-01" id="compFromDate"
                          style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px' }}>Yatırım Tutarı (₺)</label>
                        <input type="number" defaultValue={totalCost} id="compTotalCost"
                          style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
                      </div>
                      <button onClick={async () => {
                        const dateEl = document.getElementById('compFromDate') as HTMLInputElement
                        const costEl = document.getElementById('compTotalCost') as HTMLInputElement
                        const fromDate = dateEl?.value || '2025-01-01'
                        const cost = Number(costEl?.value) || totalCost
                        setCompLoading(true)
                        const result = await calculateComparison(cost, fromDate)
                        setComparison(result)
                        setCompLoading(false)
                      }}
                        style={{ padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '14px', fontWeight: '700' }}>
                        Hesapla
                      </button>
                    </div>
                  )}

                  {compLoading && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>⏳ Hesaplanıyor...</p>
                  )}

                  {comparison && (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {[
                        { label: '📈 S&P 500 alsaydın', value: comparison.sp500, color: '#2563eb' },
                        { label: 'BIST 100 alsaydın', value: comparison.bist, color: '#dc2626' },
                        { label: '🥇 Altın alsaydın', value: comparison.gold, color: '#d97706' },
                        { label: '📊 Enflasyona göre olması gereken', value: comparison.inflation, color: '#6b7280' },
                      ].map((item, i) => {
                        if (!item.value) return null
                        const gain = item.value - totalCost
                        const gainPct = (gain / totalCost) * 100
                        const portfolioValue = Number(snapshots[snapshots.length-1]?.total_value || totalCost)
                        const portfolioGainPct = ((portfolioValue - totalCost) / totalCost) * 100
                        const beating = portfolioGainPct > gainPct

                        return (
                          <div key={i} style={{ background: `${item.color}10`, border: `1px solid ${item.color}30`, borderRadius: '12px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>{item.label}</p>
                              <p style={{ fontSize: '18px', fontWeight: '800', color: item.color }}>
                                ₺{item.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                              </p>
                              <p style={{ fontSize: '11px', color: item.color, fontWeight: '600', marginTop: '2px' }}>
                                {gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                              </p>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <p style={{ fontSize: '28px' }}>{beating ? '✅' : '❌'}</p>
                              <p style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '700' }}>
                                {beating ? 'Yendin!' : 'Yenildin'}
                              </p>
                            </div>
                          </div>
                        )
                      })}

                      <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '12px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>💼 Portföyün</p>
                          <p style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent)' }}>
                            ₺{Number(snapshots[snapshots.length-1]?.total_value || totalCost).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '600', marginTop: '2px' }}>
                            {(((Number(snapshots[snapshots.length-1]?.total_value || totalCost) - totalCost) / totalCost) * 100).toFixed(1)}%
                          </p>
                        </div>
                        <p style={{ fontSize: '28px' }}>💼</p>
                      </div>

                      <button onClick={() => setComparison(null)}
                        style={{ padding: '8px', background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600' }}>
                        Yeniden Hesapla
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Alt Navigasyon */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '10px 0 16px' }}>
        {[
          { path: '/', icon: '📊', label: 'Portföy' },
          { path: '/performans', icon: '📈', label: 'Performans' },
          { path: '/analitik-varliklar', icon: '📋', label: 'Varlıklar' },
          { path: '/varliklar', icon: '➕', label: 'İşlem' },
          { path: '/hedefler', icon: '🎯', label: 'Hedefler' },
        ].map(item => (
          <button key={item.path} onClick={() => navigate(item.path)}
            style={{ background: 'none', color: location.pathname === item.path ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: '600', padding: '4px 8px' }}>
            <span style={{ fontSize: '18px' }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default Analytics