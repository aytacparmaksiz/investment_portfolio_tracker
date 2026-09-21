import { useState, useEffect, useMemo } from 'react'
import { FALLBACK_USD_RATE } from '../lib/constants'
import { useAuth } from '../context/AuthContext'
import { usePortfolio } from '../context/PortfolioContext'
import { supabase } from '../lib/supabase'
import { fetchSnapshots } from '../lib/snapshot'
import { calculateComparison, fetchHistoricalPrices } from '../lib/comparison'
import { fetchPrice } from '../lib/prices'
import { getCurrentValue, getCostValue, isUSD, isPerformanceAsset } from '../lib/calculations'
import { buildBenchmarkSeries } from '../lib/benchmark'
import { ComposedChart, AreaChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useLocation } from 'react-router-dom'

const Analytics = () => {
  const { user } = useAuth()
  const { assets, prices, portfolioId, refresh, isHidden } = usePortfolio()
  const location = useLocation()
  const [snapshots, setSnapshots] = useState<any[]>([])
  
  const activeTab = location.pathname === '/analitik-varliklar' ? 'varliklar' : 'performans'
  
  const [range, setRange] = useState<number>(30)
  const [comparison, setComparison] = useState<any | null>(null)
  const [compLoading, setCompLoading] = useState(false)
  const [totalCost, setTotalCost] = useState<number>(0)
  const [firstTxDate, setFirstTxDate] = useState<string>('')
  const [expandedAssetGroups, setExpandedAssetGroups] = useState<Set<string>>(new Set())
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set())

  // QQQM Benchmark verileri
  const [benchmarkPrices, setBenchmarkPrices] = useState<{
    qqqm: { date: string; price: number }[];
    usd: { date: string; price: number }[];
    liveQqqm: number;
  }>({ qqqm: [], usd: [], liveQqqm: 304.12 })

  useEffect(() => { 
    refresh()
    fetchExtra() 
  }, [])

  useEffect(() => { 
    if (portfolioId) loadSnapshots(portfolioId, range) 
  }, [range, portfolioId])

  useEffect(() => {
    if (assets.length > 0 && expandedAssetGroups.size === 0) {
      const usdRateLocal = prices['USDTRY=X'] || FALLBACK_USD_RATE
      const filtered = assets.filter(a => !['bes', 'vadeli'].includes(a.type) && Number(a.quantity) > 0)
      const groups: Record<string, any[]> = {}
      filtered.forEach(a => { if (!groups[a.type]) groups[a.type] = []; groups[a.type].push(a) })
      const sorted = Object.entries(groups).sort((a, b) => {
        const sumValue = (items: any[]) => items.reduce((s, asset) => {
          return s + getCurrentValue(asset, prices, usdRateLocal)
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
        .select('total_cost, performance_cost, snapshot_date')
        .eq('portfolio_id', portfolios[0].id)
        .order('snapshot_date', { ascending: true })
        .limit(1)

      if (snapData?.length) {
        setTotalCost(Number(snapData[0].performance_cost || snapData[0].total_cost || 0))
        setFirstTxDate(snapData[0].snapshot_date)
      }
    }
  }

  const loadSnapshots = async (pid: string, days: number) => {
    const data = await fetchSnapshots(pid, days)
    setSnapshots(data)

    const defaultRangeDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
    const fromDate = (data.length > 1 && data[0].snapshot_date < defaultRangeDate)
      ? data[0].snapshot_date
      : (firstTxDate && firstTxDate < defaultRangeDate ? firstTxDate : defaultRangeDate)

    // QQQM ve USDTRY geçmiş fiyatlarını ve anlık QQQM fiyatını paralel çek
    const [qqqmData, usdData, liveQqqmData] = await Promise.all([
      fetchHistoricalPrices('QQQM', fromDate),
      fetchHistoricalPrices('USDTRY=X', fromDate),
      fetchPrice('QQQM')
    ])

    setBenchmarkPrices({
      qqqm: qqqmData,
      usd: usdData,
      liveQqqm: liveQqqmData || 304.12
    })
  }

  const fc = (val: number) => {
    if (isHidden) return '••••••'
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val)
  }

  const earliestActiveDate = useMemo(() => {
    const active = assets.filter(isPerformanceAsset)
    const dates = active
      .map(a => (a.start_date || a.created_at || '').split('T')[0])
      .filter(Boolean)
      .sort()
    return dates[0] || firstTxDate || ''
  }, [assets, firstTxDate])

  const currentActiveCost = useMemo(() => {
    if (totalCost > 0) return totalCost
    const usdRateLocal = prices['USDTRY=X'] || FALLBACK_USD_RATE
    return assets.filter(isPerformanceAsset).reduce((sum, a) => sum + getCostValue(a, usdRateLocal), 0)
  }, [totalCost, assets, prices])

  // --- GRAFİK VE QQQM BENCHMARK HESAPLAMASI ---
  const { chartData, benchmarkSummary } = useMemo(() => {
    const usdRateLocal = prices['USDTRY=X'] || FALLBACK_USD_RATE
    const effectiveFirstDate = firstTxDate || earliestActiveDate
    const effectiveCost = totalCost > 0 ? totalCost : currentActiveCost

    const { points, summary } = buildBenchmarkSeries(
      snapshots,
      benchmarkPrices.qqqm,
      benchmarkPrices.usd,
      benchmarkPrices.liveQqqm,
      usdRateLocal,
      effectiveFirstDate,
      effectiveCost
    )
    return { chartData: points, benchmarkSummary: summary }
  }, [snapshots, benchmarkPrices, prices, firstTxDate, totalCost, earliestActiveDate, currentActiveCost])

  // Genel Özet Kartları İçin Hesaplamalar (Tüm Servet)
  const first = chartData[0]?.deger || 0
  const last = chartData[chartData.length - 1]?.deger || 0
  const totalGain = last - first
  const totalGainPct = first > 0 ? (totalGain / first) * 100 : 0
  const latestProfit = Number(chartData[chartData.length - 1]?.kar || 0)

  // Benchmark Grafiği verisi (tüm geçerli noktalar)
  const benchmarkData = chartData.filter(d => d.qqqmDeger > 0)

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
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>Portföy performansı & Benchmark</p>
      </div>

      {/* Varlıklar Sekmesi */}
      {activeTab === 'varliklar' && (() => {
        const ASSET_LABELS: Record<string, string> = {
          hisse: 'BIST Hisse', usd_hisse: 'ABD Hisse', kripto: '₿ Kripto',
          etf: '📈 ETF', doviz: '💱 Döviz', altin: '🥇 Altın', fon: '📊 TEFAS Fon'
        }
        const usdRate = prices['USDTRY=X'] || FALLBACK_USD_RATE
        const TYPE_COLORS: Record<string, string> = {
          hisse: '#35D6ED', usd_hisse: '#1A224C', kripto: '#8b5cf6',
          etf: '#f59e0b', doviz: '#10b981', altin: '#ECC703', vadeli: '#0891b2', fon: '#059669'
        }
        const filtered = assets.filter(a => !['bes', 'vadeli'].includes(a.type) && Number(a.quantity) > 0)
        const groups: Record<string, any[]> = {}
        filtered.forEach(a => {
          if (!groups[a.type]) groups[a.type] = []
          groups[a.type].push(a)
        })
        const sortedGroupEntries = Object.entries(groups).sort((a, b) => {
          const sumValue = (items: any[]) => items.reduce((s, asset) => {
            return s + getCurrentValue(asset, prices, usdRate)
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

                  {isExpanded && type === 'usd_hisse' ? (() => {
                    const sectors: Record<string, any[]> = {}
                    items.forEach((a: any) => {
                      const sec = a.sector || 'Diğer'
                      if (!sectors[sec]) sectors[sec] = []
                      sectors[sec].push(a)
                    })
                    return Object.entries(sectors).map(([sectorName, secItems]) => {
                      const isSecExpanded = expandedSectors.has(sectorName)
                      
                      let sectorCost = 0;
                      let sectorValue = 0;
                      secItems.forEach((asset: any) => {
                        sectorValue += getCurrentValue(asset, prices, usdRate);
                        sectorCost += getCostValue(asset, usdRate);
                      });
                      const sectorGain = sectorValue - sectorCost;
                      const sectorGainPct = sectorCost > 0 ? (sectorGain / sectorCost) * 100 : 0;
  
                      return (
                        <div key={sectorName} style={{ paddingLeft: '8px', marginTop: '8px', marginBottom: '8px' }}>
                          <div onClick={() => {
                            const next = new Set(expandedSectors)
                            if (next.has(sectorName)) next.delete(sectorName)
                            else next.add(sectorName)
                            setExpandedSectors(next)
                          }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '6px 0', borderBottom: isSecExpanded ? 'none' : '1px solid var(--border-light)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{isSecExpanded ? '▼' : '▶'}</span>
                              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>{sectorName} ({secItems.length})</span>
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: sectorGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {isHidden ? '••••••' : `${sectorGain >= 0 ? '+' : ''}%${Math.abs(sectorGainPct).toFixed(1)}`}
                            </span>
                          </div>
                          
                          {isSecExpanded && secItems.map((asset: any, index: number) => {
                            const livePrice = prices[asset.symbol] ?? (asset.avg_cost ? asset.avg_cost * usdRate : 0)
                            const currentValue = getCurrentValue(asset, prices, usdRate)
                            const costValueTRY = getCostValue(asset, usdRate)
                            const gain = currentValue - costValueTRY
                            const gainPct = costValueTRY > 0 ? (gain / costValueTRY) * 100 : 0
                            const dailyPct = prices[asset.symbol + '_dailypct']
                            
                            const unitCostDisplay = isHidden ? '••••••' : `$${Number(asset.avg_cost || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                            const unitPriceDisplay = isHidden ? '••••••' : `$${(prices[asset.symbol + '_usd'] ?? (livePrice / usdRate)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

                            return (
                              <div key={asset.id} style={{ marginBottom: index < secItems.length - 1 ? '16px' : 0, paddingBottom: index < secItems.length - 1 ? '16px' : 0, borderBottom: index < secItems.length - 1 ? '1px solid var(--border)' : 'none', paddingLeft: '14px', paddingTop: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                    <div style={{ width: '3px', height: '32px', borderRadius: '2px', background: TYPE_COLORS[type] || '#6b7280', flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                      <p style={{ fontWeight: '700', fontSize: '14px', color: '#1e1b4b' }}>{asset.name}</p>
                                      <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '1px' }}>{asset.symbol} · {isHidden ? '••••••' : asset.quantity} adet · <span style={{ color: 'var(--accent)' }}>{asset.strategy || 'Core'}</span></p>
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    <p style={{ fontSize: '15px', fontWeight: '800', color: gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                      {isHidden ? '••••••' : (gain >= 0 ? `+₺${Math.abs(gain).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}` : `-₺${Math.abs(gain).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`)}
                                    </p>
                                    <p style={{ fontSize: '11px', fontWeight: '700', color: gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                      {isHidden ? '••••••' : `${gain >= 0 ? '▲' : '▼'} ${Math.abs(gainPct).toFixed(2)}%`}
                                    </p>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                                  <div style={{ flex: 1 }}>
                                    <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '3px' }}>MALİYET</p>
                                    <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(costValueTRY)}</p>
                                    <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{unitCostDisplay}</p>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '3px' }}>GÜNCEL</p>
                                    <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(currentValue)}</p>
                                    <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{unitPriceDisplay}</p>
                                  </div>
                                  <div style={{ flex: 1, textAlign: 'right' }}>
                                    <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '3px' }}>GÜNLÜK</p>
                                    {dailyPct !== undefined ? (
                                      <p style={{ fontSize: '12px', fontWeight: '700', color: dailyPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                        {isHidden ? '••••••' : `${dailyPct >= 0 ? '▲' : '▼'} ${Math.abs(dailyPct).toFixed(2)}%`}
                                      </p>
                                    ) : <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>—</p>}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })
                  })() : isExpanded && items.map((asset: any, index: number) => {
                    const isU = isUSD(asset.type)
                    const livePrice = prices[asset.symbol] ?? (asset.avg_cost ? asset.avg_cost * (isU ? usdRate : 1) : 0)
                    const currentValue = getCurrentValue(asset, prices, usdRate)
                    const costValueTRY = getCostValue(asset, usdRate)
                    const gain = currentValue - costValueTRY
                    const gainPct = costValueTRY > 0 ? (gain / costValueTRY) * 100 : 0
                    const dailyPct = prices[asset.symbol + '_dailypct']
                    
                    const unitCostDisplay = isHidden ? '••••••' : (isU
                      ? `$${Number(asset.avg_cost || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                      : `₺${(costValueTRY / Number(asset.quantity || 1)).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`)
                    
                    const unitPriceDisplay = isHidden ? '••••••' : (isU
                      ? `$${(prices[asset.symbol + '_usd'] ?? (livePrice / usdRate)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                      : `₺${livePrice.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`)

                    return (
                      <div key={asset.id} style={{ marginBottom: index < items.length - 1 ? '16px' : 0, paddingBottom: index < items.length - 1 ? '16px' : 0, borderBottom: index < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <div style={{ width: '3px', height: '32px', borderRadius: '2px', background: TYPE_COLORS[type] || '#6b7280', flexShrink: 0, marginTop: '2px' }} />
                            <div>
                              <p style={{ fontWeight: '700', fontSize: '14px', color: '#1e1b4b' }}>{asset.name}</p>
                              <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '1px' }}>{asset.symbol} · {isHidden ? '••••••' : asset.quantity} adet</p>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <p style={{ fontSize: '15px', fontWeight: '800', color: gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {isHidden ? '••••••' : (gain >= 0 ? `+₺${Math.abs(gain).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}` : `-₺${Math.abs(gain).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`)}
                            </p>
                            <p style={{ fontSize: '11px', fontWeight: '700', color: gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {isHidden ? '••••••' : `${gain >= 0 ? '▲' : '▼'} ${Math.abs(gainPct).toFixed(2)}%`}
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '3px' }}>MALİYET</p>
                            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(costValueTRY)}</p>
                            <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{unitCostDisplay}</p>
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '3px' }}>GÜNCEL</p>
                            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(currentValue)}</p>
                            <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{unitPriceDisplay}</p>
                          </div>
                          <div style={{ flex: 1, textAlign: 'right' }}>
                            <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '3px' }}>GÜNLÜK</p>
                            {dailyPct !== undefined ? (
                              <p style={{ fontSize: '12px', fontWeight: '700', color: dailyPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {isHidden ? '••••••' : `${dailyPct >= 0 ? '▲' : '▼'} ${Math.abs(dailyPct).toFixed(2)}%`}
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
          {chartData.length < 1 ? (
            <div style={{ ...card, textAlign: 'center', padding: '48px 16px' }}>
              <p style={{ fontSize: '40px', marginBottom: '12px' }}>📊</p>
              <p style={{ fontWeight: '700', fontSize: '16px', marginBottom: '8px', color: 'var(--text-primary)' }}>Henüz yeterli veri yok</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' }}>
                Grafik oluşması için ana sayfadan fiyatları yenileyerek portföy snapshot'ı kaydetmeniz gerekiyor.
              </p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {[
                  { label: 'Başlangıç', value: fc(first), color: 'var(--text-primary)' },
                  { label: 'Güncel', value: fc(last), color: 'var(--accent)' },
                  { label: 'Dönem Değişimi', value: isHidden ? '••••••' : `${totalGain >= 0 ? '+' : ''}${fc(totalGain)}`, color: totalGain >= 0 ? 'var(--green)' : 'var(--red)', sub: isHidden ? '••••••' : `${totalGain >= 0 ? '+' : ''}${totalGainPct.toFixed(2)}%` },
                  { label: 'Toplam Kar/Zarar', value: fc(latestProfit), color: latestProfit >= 0 ? 'var(--green)' : 'var(--red)' },
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

              {/* GRAFİK 1: Tüm Servet Büyümesi (BES Dahil) */}
              <div style={{ ...card, marginBottom: '16px' }}>
                <p style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px', color: 'var(--text-primary)' }}>Portföy Büyümesi</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorDeger" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 10, filter: isHidden ? 'blur(5px)' : 'none' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(val: any, name: any) => [fc(Number(val)), name === 'deger' ? 'Toplam Değer' : 'Yatırılan']} contentStyle={{ background: 'white', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px' }} />
                    <Area type="monotone" dataKey="deger" name="deger" stroke="#6366f1" fill="url(#colorDeger)" strokeWidth={2} />
                    <Area type="stepAfter" dataKey="maliyet" name="maliyet" stroke="#9ca3af" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* GRAFİK 2: Tüm Servet Kar/Zarar */}
              <div style={{ ...card, marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                  <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>Kar/Zarar Performansı</p>
                  <span title="Bu grafiğe BES performansı dahildir." style={{ cursor: 'help', fontSize: '14px', color: 'var(--text-tertiary)' }}>ⓘ</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorKar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 10, filter: isHidden ? 'blur(5px)' : 'none' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(val: any) => [fc(Number(val)), 'Net Kar/Zarar']} contentStyle={{ background: 'white', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px' }} />
                    <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
                    <Area type="monotone" dataKey="kar" name="kar" stroke={latestProfit >= 0 ? "#10b981" : "#ef4444"} fill="url(#colorKar)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* GRAFİK 3: Aktif Performans (QQQM) YARIŞI */}
              <div style={{ ...card, marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                  <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>Performans vs Nasdaq (QQQM)</p>
                  <span title="Bu grafiğe BES dahil değildir. Aktif portföyünüzün yatırılan sermayesi üzerinden simüle edilen QQQM ETF performansı ile doğrudan kıyaslamasıdır." style={{ cursor: 'help', fontSize: '14px', color: 'var(--text-tertiary)' }}>ⓘ</span>
                </div>

                {benchmarkData.length < 2 ? (
                   <div style={{ padding: '24px 0', textAlign: 'center' }}>
                     <p style={{ fontSize: '28px', marginBottom: '8px' }}>🏁</p>
                     <p style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '700', marginBottom: '4px' }}>Benchmark Verisi Birikiyor</p>
                     <p style={{ color: 'var(--text-secondary)', fontSize: '12px', padding: '0 20px' }}>
                       QQQM ile aktif portföy kıyaslaması için en az 2 güne ait portföy snapshot verisi gerekiyor.
                     </p>
                   </div>
                ) : (
                  <>
                    {benchmarkSummary && (
                      <div style={{
                        background: benchmarkSummary.isBehind ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                        border: `1px solid ${benchmarkSummary.isBehind ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
                        borderRadius: '10px',
                        padding: '12px 14px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}>
                        <span style={{ fontSize: '22px' }}>{benchmarkSummary.isBehind ? '📉' : '🚀'}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                            Aktif portföyün QQQM benchmark'ının{' '}
                            <strong style={{ color: benchmarkSummary.isBehind ? 'var(--red)' : 'var(--green)' }}>
                              {isHidden ? '••••••' : fc(Math.abs(benchmarkSummary.diffAmount))} (%{Math.abs(benchmarkSummary.diffPercent).toFixed(2)})
                            </strong>{' '}
                            {benchmarkSummary.isBehind ? 'gerisinde.' : 'önünde!'}
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                            Dönem Getirisi: Portföy <strong>%{benchmarkSummary.activeReturnPct.toFixed(1)}</strong> vs QQQM <strong>%{benchmarkSummary.qqqmReturnPct.toFixed(1)}</strong>
                          </p>
                        </div>
                      </div>
                    )}

                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={benchmarkData} margin={{ top: 10, right: 0, left: -15, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorAktif" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={20} />
                        <YAxis domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 10, filter: isHidden ? 'blur(5px)' : 'none' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                        <Tooltip formatter={(val: any, name: any) => [fc(Number(val)), name === 'aktifDeger' ? 'Aktif Portföy' : name === 'qqqmDeger' ? 'QQQM Benchmark' : 'Yatırılan Ana Para']} contentStyle={{ background: 'white', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px' }} />
                        <Area type="monotone" dataKey="aktifDeger" name="aktifDeger" stroke="#3b82f6" fill="url(#colorAktif)" strokeWidth={2} isAnimationActive={false} />
                        <Line type="stepAfter" dataKey="aktifMaliyet" name="aktifMaliyet" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="qqqmDeger" name="qqqmDeger" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} /><span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Aktif Portföy</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} /><span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>QQQM</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6' }} /><span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Yatırılan</span></div>
                    </div>
                  </>
                )}
              </div>

              {(totalCost > 0 || currentActiveCost > 0) && (
                <div style={{ ...card, marginBottom: '16px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>Alsaydın ne olurdu?</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                      {firstTxDate || earliestActiveDate || 'Portföy başlangıcı'} · {isHidden ? '••••••' : `₺${Math.round(totalCost > 0 ? totalCost : currentActiveCost).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`} aktif yatırım
                    </p>
                  </div>

                  {!comparison && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px' }}>Başlangıç Tarihi</label>
                        <input type="date" defaultValue={firstTxDate || earliestActiveDate || "2025-01-01"} id="compFromDate"
                          style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px' }}>Yatırım Tutarı (₺)</label>
                        <input type="number" defaultValue={Math.round(totalCost > 0 ? totalCost : currentActiveCost).toString()} placeholder={Math.round(totalCost > 0 ? totalCost : currentActiveCost).toString()} id="compTotalCost"
                          style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px' }} />
                      </div>
                      <button onClick={async () => {
                        const dateEl = document.getElementById('compFromDate') as HTMLInputElement
                        const costEl = document.getElementById('compTotalCost') as HTMLInputElement
                        const fromDate = dateEl?.value || firstTxDate || earliestActiveDate || '2025-01-01'
                        const cost = Number(costEl?.value) || (totalCost > 0 ? totalCost : currentActiveCost)
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

                  {comparison && (() => {
                    const baseCost = Number(comparison.baseCost) || (totalCost > 0 ? totalCost : currentActiveCost)
                    const latestActiveVal = Number(snapshots[snapshots.length - 1]?.performance_value || snapshots[snapshots.length - 1]?.total_value || baseCost)
                    const latestActiveCost = Number(snapshots[snapshots.length - 1]?.performance_cost || snapshots[snapshots.length - 1]?.total_cost || baseCost)
                    const activePortfolioReturnPct = latestActiveCost > 0 ? ((latestActiveVal - latestActiveCost) / latestActiveCost) * 100 : 0

                    return (
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {[
                          { label: '🚀 QQQM (Nasdaq-100) alsaydın', value: comparison.qqqm, color: '#f59e0b' },
                          { label: '📈 S&P 500 alsaydın', value: comparison.sp500, color: '#2563eb' },
                          { label: '🇹🇷 BIST 100 alsaydın', value: comparison.bist, color: '#dc2626' },
                          { label: '🥇 Altın alsaydın', value: comparison.gold, color: '#d97706' },
                          { label: '📊 Enflasyona göre olması gereken', value: comparison.inflation, color: '#6b7280' },
                        ].map((item, i) => {
                          if (!item.value) return null
                          const gain = item.value - baseCost
                          const gainPct = baseCost > 0 ? (gain / baseCost) * 100 : 0
                          const beating = activePortfolioReturnPct > gainPct

                          return (
                            <div key={i} style={{ background: `${item.color}10`, border: `1px solid ${item.color}30`, borderRadius: '12px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>{item.label}</p>
                                <p style={{ fontSize: '18px', fontWeight: '800', color: item.color }}>
                                  {fc(item.value)}
                                </p>
                                <p style={{ fontSize: '11px', color: item.color, fontWeight: '600', marginTop: '2px' }}>
                                  {isHidden ? '••••••' : `${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)}%`}
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
                            <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>💼 Aktif Portföyün</p>
                            <p style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent)' }}>
                              {fc(latestActiveVal)}
                            </p>
                            <p style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '600', marginTop: '2px' }}>
                              {isHidden ? '••••••' : `${activePortfolioReturnPct >= 0 ? '+' : ''}${activePortfolioReturnPct.toFixed(1)}%`}
                            </p>
                          </div>
                          <p style={{ fontSize: '28px' }}>💼</p>
                        </div>

                        <button onClick={() => setComparison(null)}
                          style={{ padding: '8px', background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600' }}>
                          Yeniden Hesapla
                        </button>
                      </div>
                    )
                  })()}
                </div>
              )}
            </>
          )}
        </>
      )}


    </div>
  )
}

export default Analytics