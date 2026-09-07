import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePortfolio } from '../context/PortfolioContext'
import { supabase } from '../lib/supabase'
import { fetchHistoricalRate } from '../lib/historicalRate'
import { useNavigate, useLocation } from 'react-router-dom'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList } from 'recharts'

const GOAL_USD = 1000000
const GROWTH_WINDOW_START_DATE = '2026-07-01' // İlk güvenilir portföy snapshot tarihi — büyüme hızı bu tarihten itibaren hesaplanır
const WITHDRAWAL_RATE = 0.04

const Goals = () => {
  const { user } = useAuth()
  const { assets, prices, portfolioId, isHidden, setIsHidden } = usePortfolio()
  const navigate = useNavigate()
  const location = useLocation()
  const [manualAssets, setManualAssets] = useState<any[]>([])
  const [savings, setSavings] = useState<any[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [monthlyExpenseUSD, setMonthlyExpenseUSD] = useState('3300')
  const [targetYearsInput, setTargetYearsInput] = useState('')
  const [historicalRates, setHistoricalRates] = useState<Record<string, number>>({})
  const [showDistribution, setShowDistribution] = useState(false)
  const [loading, setLoading] = useState(true)

  const [showAssetForm, setShowAssetForm] = useState(false)
  const [showAssetList, setShowAssetList] = useState(false)
  const [assetForm, setAssetForm] = useState({ name: '', value_try: '', category: 'ev' })

  const [showSavingForm, setShowSavingForm] = useState(false)
  const [showManageSavings, setShowManageSavings] = useState(false)
  const [savingType, setSavingType] = useState<'giris' | 'cekim'>('giris')
  const [savingForm, setSavingForm] = useState({ 
    month: new Date().toISOString().slice(0, 7), 
    amount_try: '',
    income_try: '',
    note: ''
  })

  // Çizginin üzerindeki oran etiketleri (Bileşen içine alınarak global isHidden state'ine bağlandı)
  const CustomizedLineLabel = (props: any) => {
    const { x, y, value } = props
    if (value === undefined || value === null || isHidden) return null
    return (
      <g>
        <rect x={x - 22} y={y - 22} width={44} height={16} rx={4} fill="#e6f4ea" stroke="#10b981" strokeWidth={1} />
        <text x={x} y={y - 11} fill="#059669" fontSize={10} fontWeight="700" textAnchor="middle">
          %{Number(value).toFixed(1)}
        </text>
      </g>
    )
  }

  useEffect(() => { if (portfolioId) fetchData() }, [portfolioId])

  useEffect(() => {
    const loadRates = async () => {
      if (snapshots.length === 0) return
      const priorSnaps = snapshots.filter(s => s.snapshot_date < GROWTH_WINDOW_START_DATE)
      const startSnap = priorSnaps.length > 0
        ? priorSnaps[priorSnaps.length - 1]
        : snapshots.find(s => s.snapshot_date >= GROWTH_WINDOW_START_DATE)
      if (!startSnap) return

      const startMonth = GROWTH_WINDOW_START_DATE.slice(0, 7)
      const windowSavings = savings.filter(s => String(s.month).slice(0, 7) >= startMonth)

      const datesToFetch = Array.from(new Set([
        startSnap.snapshot_date,
        ...windowSavings.map(s => String(s.month).slice(0, 10))
      ])).filter(d => !historicalRates[d])

      if (datesToFetch.length === 0) return

      const newRates: Record<string, number> = {}
      for (const date of datesToFetch) {
        const rate = await fetchHistoricalRate(date)
        if (rate) newRates[date] = rate
      }
      if (Object.keys(newRates).length > 0) {
        setHistoricalRates(prev => ({ ...prev, ...newRates }))
      }
    }
    loadRates()
  }, [snapshots, savings])

  const fetchData = async () => {
    const { data: ma } = await supabase
      .from('manual_assets').select('*').eq('portfolio_id', portfolioId).order('created_at', { ascending: false })
    setManualAssets(ma || [])

    const { data: sv } = await supabase
      .from('savings').select('*').eq('portfolio_id', portfolioId).order('month', { ascending: true })
    setSavings(sv || [])

    const { data: snap } = await supabase
      .from('portfolio_snapshots').select('snapshot_date, total_value').eq('portfolio_id', portfolioId).order('snapshot_date', { ascending: true })
    setSnapshots(snap || [])

    setLoading(false)
  }

  const usdRate = prices['USDTRY=X'] || 46.4
  const goalTRY = GOAL_USD * usdRate

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

  const portfolioTotal = assets.reduce((sum, a) => sum + getAssetValue(a), 0)
  const manualTotal = manualAssets.reduce((sum, a) => sum + Number(a.value_try), 0)
  const grandTotal = portfolioTotal + manualTotal
  const progressPct = Math.min((grandTotal / goalTRY) * 100, 100)

  // --- FIRE Projeksiyonu ---
  const fireData = (() => {
    if (snapshots.length === 0) return null

    const priorSnaps = snapshots.filter(s => s.snapshot_date < GROWTH_WINDOW_START_DATE)
    const startSnap = priorSnaps.length > 0
      ? priorSnaps[priorSnaps.length - 1]
      : snapshots.find(s => s.snapshot_date >= GROWTH_WINDOW_START_DATE)
    if (!startSnap) return null

    const rateV0 = historicalRates[startSnap.snapshot_date]
    if (!rateV0) return null // geçmiş kur henüz yükleniyor

    const V0 = Number(startSnap.total_value)
    const V1 = portfolioTotal
    if (!V0 || V0 <= 0) return null

    const V0_usd = V0 / rateV0
    const V1_usd = V1 / usdRate

    const startMonth = GROWTH_WINDOW_START_DATE.slice(0, 7)
    const windowSavings = savings.filter(s => String(s.month).slice(0, 7) >= startMonth)

    let D_usd = 0
    let missingRate = false
    windowSavings.forEach(s => {
      const dateKey = String(s.month).slice(0, 10)
      const rate = historicalRates[dateKey]
      if (!rate) { missingRate = true; return }
      D_usd += Number(s.amount_try || 0) / rate
    })
    if (missingRate) return null // bazı geçmiş kurlar henüz yükleniyor

    const gunSayisi = Math.max(1, Math.floor((new Date().getTime() - new Date(startSnap.snapshot_date).getTime()) / (1000 * 60 * 60 * 24)))
    const donemGetirisiPct = (V1_usd - V0_usd - D_usd) / V0_usd
    const aylikGetiri = Math.pow(1 + donemGetirisiPct, 30 / gunSayisi) - 1

    const distinctMonthCount = new Set(windowSavings.map(s => String(s.month).slice(0, 7))).size
    const avgMonthlySaving_usd = distinctMonthCount > 0 ? D_usd / distinctMonthCount : 0
    const avgMonthlySaving = avgMonthlySaving_usd * usdRate // TRY karşılığı, gösterim için

    const monthlyExpense = Number(monthlyExpenseUSD) || 0
    const fireTargetUSD = monthlyExpense * 12 / WITHDRAWAL_RATE

    const simulateMonths = (contributionUsd: number) => {
      let value = V1_usd
      let months = 0
      const maxMonths = 600
      while (value < fireTargetUSD && months < maxMonths) {
        value = value * (1 + aylikGetiri) + contributionUsd
        months++
      }
      return months >= maxMonths ? null : months
    }

    const monthsToFire = simulateMonths(avgMonthlySaving_usd)

    let requiredMonthlySaving: number | null = null
    const targetYears = Number(targetYearsInput)
    if (targetYears > 0) {
      const n = targetYears * 12
      const r = aylikGetiri
      const growthFactor = Math.pow(1 + r, n)
      let requiredUsd: number
      if (r !== 0) {
        requiredUsd = (fireTargetUSD - V1_usd * growthFactor) / ((growthFactor - 1) / r)
      } else {
        requiredUsd = (fireTargetUSD - V1_usd) / n
      }
      requiredMonthlySaving = requiredUsd * usdRate
    }

    return {
      V0, V1, D: D_usd * usdRate, donemGetirisiPct, aylikGetiri, avgMonthlySaving,
      fireTargetUSD, fireTargetTRY: fireTargetUSD * usdRate, monthsToFire, requiredMonthlySaving,
      startDate: startSnap.snapshot_date
    }
  })()

  const handleAddManualAsset = async () => {
    if (!assetForm.name || !assetForm.value_try) return
    await supabase.from('manual_assets').insert({
      portfolio_id: portfolioId,
      name: assetForm.name,
      value_try: Number(assetForm.value_try),
      category: assetForm.category
    })
    setAssetForm({ name: '', value_try: '', category: 'ev' })
    setShowAssetForm(false)
    fetchData()
  }

  const handleDeleteManualAsset = async (id: string) => {
    if (!confirm('Silmek istediğine emin misin?')) return
    await supabase.from('manual_assets').delete().eq('id', id)
    fetchData()
  }

  const handleAddSaving = async () => {
    if (!savingForm.amount_try) return
    if (savingType === 'giris' && !savingForm.income_try) return
    const monthDate = savingForm.month + '-01'

    const finalAmount = savingType === 'cekim'
      ? -Math.abs(Number(savingForm.amount_try))
      : Number(savingForm.amount_try)

    await supabase.from('savings').insert({
      portfolio_id: portfolioId,
      month: monthDate,
      amount_try: finalAmount,
      income_try: savingType === 'cekim' ? 0 : Number(savingForm.income_try),
      note: savingForm.note || (savingType === 'cekim' ? 'Çekim' : null)
    })

    setSavingForm({ month: new Date().toISOString().slice(0, 7), amount_try: '', income_try: '', note: '' })
    setSavingType('giris')
    setShowSavingForm(false)
    fetchData()
  }

  const handleDeleteSaving = async (id: string) => {
    if (!confirm('Bu aya ait tasarruf kaydını silmek istediğine emin misin?')) return
    await supabase.from('savings').delete().eq('id', id)
    fetchData()
  }

  const fc = (val: number) => {
    if (isHidden) return '••••••'
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val)
  }
  
  const monthlyTotals: Record<string, { gelir: number; tasarruf: number; monthDate: string }> = {}
  savings.forEach(s => {
    const key = String(s.month).slice(0, 10)
    if (!monthlyTotals[key]) monthlyTotals[key] = { gelir: 0, tasarruf: 0, monthDate: key }
    monthlyTotals[key].gelir += Number(s.income_try || 0)
    monthlyTotals[key].tasarruf += Number(s.amount_try || 0)
  })

  const chartData = Object.values(monthlyTotals)
    .sort((a, b) => a.monthDate.localeCompare(b.monthDate))
    .map(m => {
      const oran = m.gelir > 0 ? (m.tasarruf / m.gelir) * 100 : 0
      return {
        id: m.monthDate,
        month: new Date(m.monthDate).toLocaleString('tr-TR', { month: 'short', year: '2-digit' }),
        tasarruf: m.tasarruf,
        gelir: m.gelir,
        oran
      }
    })

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

      {/* Başlık Alanı ve Sağ Köşeye Senkronize Edilen Global Buton */}
      <div style={{ paddingTop: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>🎯 Hedefler</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>$1.000.000 hedefine yolculuk</p>
        </div>
        <button 
          onClick={() => setIsHidden(!isHidden)} 
          style={{ padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}
        >
          {isHidden ? '👁️ Göster' : '🔒 Gizle'}
        </button>
      </div>

      {/* Hedef Tüpü */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>Toplam Varlık</p>
          <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent)' }}>%{progressPct.toFixed(1)}</p>
        </div>

        <div style={{ position: 'relative', height: '24px', background: 'var(--bg-elevated)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg, #059669, #10b981)',
            borderRadius: '12px',
            transition: 'width 0.6s ease'
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>₺0</span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{fc(goalTRY / 1000000)}M</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px' }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px' }}>
            <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>Şu An</p>
            <p style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>{fc(grandTotal)}</p>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>${(grandTotal / usdRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px' }}>
            <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>Kalan</p>
            <p style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>{fc(Math.max(goalTRY - grandTotal, 0))}</p>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>${Math.max((goalTRY - grandTotal) / usdRate, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
          </div>
      </div>

      {/* FIRE Projeksiyonu Kartı */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <p style={{ fontWeight: '700', fontSize: '15px', marginBottom: '14px', color: 'var(--text-primary)' }}>🔥 FIRE Projeksiyonu</p>

        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Aylık Hedef Gider ($)</label>
          <input type="number" value={monthlyExpenseUSD} onChange={e => setMonthlyExpenseUSD(e.target.value)} placeholder="3300" style={inputStyle} />
        </div>

        {!fireData ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>
            Projeksiyon için yeterli snapshot verisi yok.
          </p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>FIRE Hedefi</p>
                <p style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>{fc(fireData.fireTargetTRY)}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>${fireData.fireTargetUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
              </div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>Yıllıklandırılmış Getiri</p>
                <p style={{ fontSize: '15px', fontWeight: '800', color: fireData.aylikGetiri >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  %{isHidden ? '••' : ((Math.pow(1 + fireData.aylikGetiri, 12) - 1) * 100).toFixed(1)}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{fireData.startDate} itibarıyla</p>
              </div>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', borderRadius: '14px', padding: '18px', marginBottom: '14px', textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginBottom: '6px', fontWeight: '600' }}>Mevcut tempoyla FIRE'a kalan süre</p>
              {fireData.monthsToFire === null ? (
                <p style={{ color: 'white', fontSize: '18px', fontWeight: '800' }}>50+ yıl (tempo yetersiz)</p>
              ) : (
                <>
                  <p style={{ color: 'white', fontSize: '28px', fontWeight: '800' }}>
                    {(fireData.monthsToFire / 12).toFixed(1)} yıl
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginTop: '4px' }}>
                    ~{new Date(Date.now() + fireData.monthsToFire * 30 * 24 * 60 * 60 * 1000).getFullYear()} yılında
                  </p>
                </>
              )}
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.5' }}>
              Ortalama aylık tasarrufun {fc(fireData.avgMonthlySaving)} baz alınarak hesaplandı ({fireData.startDate}'ten bugüne piyasa getirisi ayrıştırılarak).
            </p>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <label style={labelStyle}>Şu kadar yılda ulaşmak istersem, aylık ne kadar tasarruf gerekir?</label>
              <input type="number" value={targetYearsInput} onChange={e => setTargetYearsInput(e.target.value)} placeholder="örn. 5" style={inputStyle} />

              {fireData.requiredMonthlySaving !== null && (
                <div style={{ marginTop: '10px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '10px', padding: '12px' }}>
                  {fireData.requiredMonthlySaving > 0 ? (
                    <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent)' }}>
                      Gereken aylık tasarruf: {fc(fireData.requiredMonthlySaving)}
                    </p>
                  ) : (
                    <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--green)' }}>
                      Bu hedefe mevcut portföyünle bile tasarruf yapmadan ulaşabilirsin! 🎉
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Dağılım Kartı */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setShowDistribution(!showDistribution)}>
          <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>Toplam Dağılım</p>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{showDistribution ? '▲ Gizle' : '▼ Göster'}</span>
        </div>

        {showDistribution && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>📊 Portföy </span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(portfolioTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>🏠 Duran Varlıklar </span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(manualTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Duran Varlıklar Kartı */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setShowAssetList(!showAssetList)}>
            <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>🏠 Duran Varlıklar</p>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{showAssetList ? '▲ Gizle' : '▼ Göster'}</span>
          </div>
          {showAssetList && (
            <button onClick={() => setShowAssetForm(!showAssetForm)}
              style={{ padding: '6px 12px', background: showAssetForm ? 'var(--bg-elevated)' : 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '8px', color: 'var(--accent)', fontSize: '12px', fontWeight: '700' }}>
              {showAssetForm ? 'Kapat' : '+ Ekle'}
            </button>
          )}
        </div>

        {showAssetList && showAssetForm && (
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Ad</label>
              <input value={assetForm.name} onChange={e => setAssetForm({ ...assetForm, name: e.target.value })} placeholder="örn. Ev" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Değer (₺)</label>
              <input type="number" value={assetForm.value_try} onChange={e => setAssetForm({ ...assetForm, value_try: e.target.value })} placeholder="5000000" style={inputStyle} />
            </div>
            <button onClick={handleAddManualAsset}
              style={{ width: '100%', padding: '10px', background: 'var(--accent)', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '14px' }}>
              Kaydet
            </button>
          </div>
        )}

        {showAssetList && (
          manualAssets.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0', fontSize: '13px' }}>Henüz manuel varlık eklenmedi</p>
          ) : (
            manualAssets.map((a: any, i: number) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < manualAssets.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{a.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700' }}>{fc(a.value_try)}</span>
                  <button onClick={() => handleDeleteManualAsset(a.id)}
                    style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '4px 8px', fontSize: '11px', fontWeight: '700' }}>
                    Sil
                  </button>
                </div>
              </div>
            ))
          )
        )}
      </div>

      {/* Tasarruf Oranı Bölümü */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>💰 Tasarruf Oranı</p>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setShowManageSavings(!showManageSavings)}
              style={{ padding: '6px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' }}>
              {showManageSavings ? 'Kapat' : '⚙️ Düzenle'}
            </button>
            <button onClick={() => setShowSavingForm(!showSavingForm)}
              style={{ padding: '6px 12px', background: showSavingForm ? 'var(--bg-elevated)' : 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '8px', color: 'var(--accent)', fontSize: '12px', fontWeight: '700' }}>
              {showSavingForm ? 'Kapat' : '+ Ekle'}
            </button>
          </div>
        </div>

        {showSavingForm && (
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>

            <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '10px', padding: '3px', marginBottom: '14px', border: '1px solid var(--border)' }}>
              <button onClick={() => setSavingType('giris')}
                style={{ flex: 1, padding: '9px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', background: savingType === 'giris' ? '#10b981' : 'none', color: savingType === 'giris' ? 'white' : 'var(--text-secondary)' }}>
                ↑ Giriş
              </button>
              <button onClick={() => setSavingType('cekim')}
                style={{ flex: 1, padding: '9px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', background: savingType === 'cekim' ? 'var(--red)' : 'none', color: savingType === 'cekim' ? 'white' : 'var(--text-secondary)' }}>
                ↓ Çekim
              </button>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Ay</label>
              <input type="month" value={savingForm.month} onChange={e => setSavingForm({ ...savingForm, month: e.target.value })} style={inputStyle} />
            </div>

            {savingType === 'giris' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={labelStyle}>Bu Girişteki Gelir (₺)</label>
                  <input type="number" value={savingForm.income_try} onChange={e => setSavingForm({ ...savingForm, income_try: e.target.value })} placeholder="76000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Bu Girişteki Tasarruf (₺)</label>
                  <input type="number" value={savingForm.amount_try} onChange={e => setSavingForm({ ...savingForm, amount_try: e.target.value })} placeholder="60000" style={inputStyle} />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Çekim Tutarı (₺)</label>
                <input type="number" value={savingForm.amount_try} onChange={e => setSavingForm({ ...savingForm, amount_try: e.target.value })} placeholder="10000" style={{ ...inputStyle, border: '1px solid var(--red)' }} />
              </div>
            )}

            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Not (opsiyonel)</label>
              <input value={savingForm.note} onChange={e => setSavingForm({ ...savingForm, note: e.target.value })} placeholder={savingType === 'cekim' ? 'örn. Acil ihtiyaç' : 'örn. Avans'} style={inputStyle} />
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Aynı ay için birden fazla giriş ekleyebilirsin — hepsi toplanarak dikkate alınır.
            </p>

            <button onClick={handleAddSaving}
              style={{ width: '100%', padding: '10px', background: savingType === 'cekim' ? 'var(--red)' : 'var(--accent)', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '14px' }}>
              {savingType === 'cekim' ? 'Çekimi Kaydet' : 'Ekle'}
            </button>
          </div>
        )}

        {showManageSavings && savings.length > 0 && (
          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', maxHeight: '220px', overflowY: 'auto' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Girişleri Sil</p>
            {[...savings]
              .sort((a, b) => String(a.month).localeCompare(String(b.month)) || String(a.created_at).localeCompare(String(b.created_at)))
              .map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', marginBottom: '6px' }}>
                  <div>
                    <span style={{ fontWeight: '700' }}>{new Date(s.month).toLocaleString('tr-TR', { month: 'short', year: '2-digit' })}</span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
                      {fc(Number(s.amount_try))} / {fc(Number(s.income_try))}
                    </span>
                    {s.note && <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>· {s.note}</span>}
                  </div>
                  <button onClick={() => handleDeleteSaving(s.id)} 
                    style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: '800', fontSize: '13px', flexShrink: 0 }}>
                    ✕
                  </button>
                </div>
              ))}
          </div>
        )}

{chartData.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0', fontSize: '13px' }}>Henüz tasarruf kaydı yok</p>
        ) : (
          <>
            {(() => {
              const currentYear = String(new Date().getFullYear())
              const ytdSavings = savings.filter(s => String(s.month).slice(0, 4) === currentYear)
              const ytdCount = ytdSavings.length
              const ytdAvgAmount = ytdCount > 0
                ? ytdSavings.reduce((sum, s) => sum + Number(s.amount_try || 0), 0) / ytdCount
                : 0
              const ytdTotalIncome = ytdSavings.reduce((sum, s) => sum + Number(s.income_try || 0), 0)
              const ytdTotalSaving = ytdSavings.reduce((sum, s) => sum + Number(s.amount_try || 0), 0)
              const ytdAvgRate = ytdTotalIncome > 0 ? (ytdTotalSaving / ytdTotalIncome) * 100 : 0

              if (ytdCount === 0) return null

              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px' }}>
                    <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>Ortalama Tasarruf</p>
                    <p style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>{fc(ytdAvgAmount)}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{currentYear} · {ytdCount} ay</p>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px' }}>
                    <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>Ortalama Oran</p>
                    <p style={{ fontSize: '15px', fontWeight: '800', color: '#10b981' }}>%{isHidden ? '••' : ytdAvgRate.toFixed(1)}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>gelire oranla</p>
                  </div>
                </div>
              )
            })()}

            <ResponsiveContainer width="100%" height={260}>
              {/* barGap={-28} verilerek barların tam arkalı önlü çakışması sağlandı */}
              <ComposedChart data={chartData} barGap={-28} margin={{ top: 20, right: -10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} />
                
                <YAxis yAxisId="left" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} hide={true} />
                
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px', fontSize: '12px', boxShadow: 'var(--shadow-md)' }}>
                          <p style={{ fontWeight: '700', marginBottom: '6px', color: 'var(--text-primary)' }}>{data.month}</p>
                          <p style={{ color: '#80cbd0' }}>Gelir: <strong style={{ color: 'var(--text-primary)' }}>{fc(data.gelir)}</strong></p>
                          <p style={{ color: '#264653' }}>Tasarruf: <strong style={{ color: 'var(--text-primary)' }}>{fc(data.tasarruf)}</strong></p>
                          <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-light)', color: '#10b981', fontWeight: '700' }}>
                            Tasarruf Oranı: %{data.oran.toFixed(1)}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize: '11px', fontWeight: '600' }} />
                
                {/* Gelir ve Tasarruf barları left Y ekseni üzerinden tam üst üste bindirildi */}
                <Bar yAxisId="left" dataKey="gelir" name="Gelir" fill="#80cbd0" barSize={28} radius={[6, 6, 0, 0]} />
                <Bar yAxisId="left" dataKey="tasarruf" name="Tasarruf" fill="#264653" barSize={28} radius={[6, 6, 0, 0]}>
                  {!isHidden && (
                    <LabelList 
                      dataKey="tasarruf" 
                      position="center" 
                      fill="#ffffff" 
                      fontSize={10} 
                      fontWeight="700" 
                      formatter={(v: number) => `${(v / 1000).toFixed(0)}K`} 
                    />
                  )}
                </Bar>

                {/* Çift eksenli sağ ölçeğe bağlı dalgalanan oran çizgisi */}
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="oran" 
                  name="Tasarruf Oranı (%)" 
                  stroke="#10b981" 
                  strokeWidth={2} 
                  dot={{ r: 4, fill: '#10b981' }}
                  label={<CustomizedLineLabel />}
                />
             </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

       {/* Alt Navigasyon Sıralaması (4: Hedefler, 5: İşlem) */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '10px 0 16px' }}>
        {[
          { path: '/', icon: '📊', label: 'Portföy' },
          { path: '/performans', icon: '📈', label: 'Performans' },
          { path: '/analitik-varliklar', icon: '📋', label: 'Varlıklar' },
          { path: '/hedefler', icon: '🎯', label: 'Hedefler' },
          { path: '/varliklar', icon: '➕', label: 'İşlem' },
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

export default Goals