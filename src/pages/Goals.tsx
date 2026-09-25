import { useState, useEffect, useMemo } from 'react'
import { FALLBACK_USD_RATE, getTodayDate } from '../lib/constants'
import { getCurrentValue, getCostValue, isUSD, isPerformanceAsset } from '../lib/calculations'
import { usePortfolio } from '../context/PortfolioContext'
import { supabase } from '../lib/supabase'
import { fetchHistoricalRatesBatch } from '../lib/historicalRate'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList } from 'recharts'
import { GoalsSkeleton } from '../components/SkeletonLoaders'
import { useToast } from '../context/ToastContext'

const GOAL_USD = 1000000
const WITHDRAWAL_RATE = 0.04
const MILESTONES = [100000, 250000, 500000, 750000, 1000000]

const Goals = () => {
  const toast = useToast()
  const { assets, prices, portfolioId, isHidden } = usePortfolio()
  
  const [activeTab, setActiveTab] = useState<'hedefler' | 'fire'>('hedefler')
  
  const [manualAssets, setManualAssets] = useState<any[]>([])
  const [savings, setSavings] = useState<any[]>([])
  const [monthlyExpenseUSD, setMonthlyExpenseUSD] = useState('3300')
  const [targetYearsInput, setTargetYearsInput] = useState('')
  const [fireMode, setFireMode] = useState<'dinamik' | 'sabit'>('dinamik')
  const [showDistribution, setShowDistribution] = useState(false)
  const [showAssetList, setShowAssetList] = useState(false)
  const [showAssetForm, setShowAssetForm] = useState(false)
  const [showSavingForm, setShowSavingForm] = useState(false)
  const [showManageSavings, setShowManageSavings] = useState(false)
  const [savingType, setSavingType] = useState<'giris' | 'cekim'>('giris')
  const [showReturnDetails, setShowReturnDetails] = useState(false)

  // Borçlar & Yükümlülükler State
  const [liabilities, setLiabilities] = useState<any[]>([])
  const [showLiabilityList, setShowLiabilityList] = useState(false)
  const [showLiabilityForm, setShowLiabilityForm] = useState(false)
  const [liabilityForm, setLiabilityForm] = useState({
    name: '',
    amount: '',
    currency: 'TRY',
    monthly_payment: '',
    interest_rate: ''
  })
  
  const [assetForm, setAssetForm] = useState({ name: '', value_try: '', category: 'ev' })
  const [savingForm, setSavingForm] = useState({ month: getTodayDate().slice(0, 7), amount_try: '', income_try: '', note: '' })
  
  const [historicalRates, setHistoricalRates] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const CustomizedLineLabel = (props: any) => {
    const { x, y, value } = props
    if (value == null || isHidden) return null
    return (
      <g>
        <text x={x} y={y - 8} fill="#10b981" fontSize={10} fontWeight={700} textAnchor="middle">
          %{Number(value).toFixed(1)}
        </text>
      </g>
    )
  }

  useEffect(() => { if (portfolioId) fetchData() }, [portfolioId])

  useEffect(() => {
    const loadRates = async () => {
      const datesToFetch = Array.from(new Set([
        '2023-09-01', // BES Anchor
        ...assets.map(a => (a.start_date || a.created_at || '').split('T')[0]),
        ...savings.map(s => String(s.month).slice(0, 10))
      ])).filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d as string) && !historicalRates[d as string])

      if (datesToFetch.length === 0) return

      const newRates = await fetchHistoricalRatesBatch(datesToFetch as string[])
      if (Object.keys(newRates).length > 0) {
        setHistoricalRates(prev => ({ ...prev, ...newRates }))
      }
    }
    if (assets.length > 0 || savings.length > 0) loadRates()
  }, [assets, savings])

  const fetchData = async () => {
    const { data: ma } = await supabase
      .from('manual_assets').select('*').eq('portfolio_id', portfolioId).order('created_at', { ascending: false })
    setManualAssets(ma || [])

    const { data: sv } = await supabase
      .from('savings').select('*').eq('portfolio_id', portfolioId).order('month', { ascending: true })
    setSavings(sv || [])

    // Borçlar ve Yükümlülükler (Liabilities) çekme - resilient local storage fallback
    try {
      const { data: lb, error: lbErr } = await supabase
        .from('liabilities').select('*').eq('portfolio_id', portfolioId).order('created_at', { ascending: false })
      if (!lbErr && lb) {
        setLiabilities(lb)
        if (portfolioId) localStorage.setItem(`user_liabilities_${portfolioId}`, JSON.stringify(lb))
        localStorage.setItem('user_liabilities', JSON.stringify(lb))
      } else {
        const local = (portfolioId && localStorage.getItem(`user_liabilities_${portfolioId}`)) || localStorage.getItem('user_liabilities')
        if (local) setLiabilities(JSON.parse(local))
        else setLiabilities([])
      }
    } catch {
      const local = (portfolioId && localStorage.getItem(`user_liabilities_${portfolioId}`)) || localStorage.getItem('user_liabilities')
      if (local) setLiabilities(JSON.parse(local))
      else setLiabilities([])
    }

    setLoading(false)
  }

  const usdRate = prices['USDTRY=X'] || FALLBACK_USD_RATE
  const goalTRY = GOAL_USD * usdRate

  // Gerçek Net Varlık (True Net Worth) = (Portföy Varlıkları + Fiziksel Varlıklar) - Toplam Borçlar
  const portfolioTotal = assets.reduce((sum, a) => sum + getCurrentValue(a, prices, usdRate), 0)
  const manualTotal = manualAssets.reduce((sum, a) => sum + Number(a.value_try), 0)
  const totalAssetsTRY = portfolioTotal + manualTotal
  const totalLiabilitiesTRY = liabilities.reduce((sum, l) => {
    const amt = Number(l.amount || 0)
    return sum + (l.currency === 'USD' ? amt * usdRate : amt)
  }, 0)
  const netWorthTRY = totalAssetsTRY - totalLiabilitiesTRY
  const netWorthUSD = netWorthTRY / usdRate
  const totalAssetsUSD = totalAssetsTRY / usdRate
  const totalLiabilitiesUSD = totalLiabilitiesTRY / usdRate

  // Hedef ve Milestone'lar Gerçek Net Varlık bazlıdır
  const effectiveNW_TRY = Math.max(0, netWorthTRY)
  const progressPct = Math.min((effectiveNW_TRY / goalTRY) * 100, 100)

  const currentNW_USD = Math.max(0, netWorthUSD)
  const nextMilestoneUSD = MILESTONES.find(m => m > currentNW_USD) || MILESTONES[MILESTONES.length - 1]
  const prevMilestoneUSD = MILESTONES.slice().reverse().find(m => m <= currentNW_USD) || 0
  const milestoneRange = nextMilestoneUSD - prevMilestoneUSD
  const currentProgressInMilestone = currentNW_USD - prevMilestoneUSD
  const milestoneProgressPct = milestoneRange > 0 ? Math.min((currentProgressInMilestone / milestoneRange) * 100, 100) : 100

  const formatMonths = (m: number | null) => {
    if (m === null) return '50+ yıl'
    if (m === 0) return 'Ulaşıldı'
    const years = Math.floor(m / 12)
    const months = m % 12
    if (years === 0) return `${months} ay`
    if (months === 0) return `${years} yıl`
    return `${years}y ${months}a`
  }

  // --- DOĞRU VE HASSAS YATIRIM GETİRİSİ & FIRE PROJEKSİYONU ---
  const fireData = useMemo(() => {
    if (assets.length === 0) return null

    const besAssets = assets.filter(a => a.type === 'bes')
    // Aktif portföy havuzu: BES hariç tüm yatırımlar (Hisse, Kripto, Nakit, Fon, Vadeli vb.)
    const activeAssets = assets.filter(a => isPerformanceAsset(a) && (
      ['vadeli', 'nakit'].includes(a.type) || Number(a.quantity || 0) > 0
    ))

    // 1. BES Getirisi (Geçmiş Kur Maliyetli - İzole)
    const besValue = besAssets.reduce((sum, a) => sum + getCurrentValue(a, prices, usdRate), 0)
    const besCost = besAssets.reduce((sum, a) => sum + Number(a.principal || a.avg_cost || 0), 0)
    let besMonthlyUsdReturn = 0
    let besAnnPct = 0
    const besStartDateStr = besAssets[0]?.start_date || (besAssets[0]?.created_at || '').split('T')[0] || '2023-09-01'
    const besDateMs = besStartDateStr ? new Date(besStartDateStr).getTime() : NaN
    const besHoldingDays = !isNaN(besDateMs) && besDateMs > 0
      ? Math.max(30, (Date.now() - besDateMs) / 86400000)
      : Math.max(30, (Date.now() - new Date('2023-09-01').getTime()) / 86400000)
    const besHoldingYears = besHoldingDays / 365.25
    const rateBesAnchor = (besStartDateStr && historicalRates[besStartDateStr]) || historicalRates['2023-09-01'] || 27.0

    if (besCost > 0 && besValue > 0) {
      const besUsdCost = besCost / rateBesAnchor
      const besUsdVal = besValue / usdRate
      const besUsdReturnRatio = besUsdVal / besUsdCost
      if (besUsdReturnRatio > 0) {
        const rawBesAnn = Math.pow(besUsdReturnRatio, 1 / besHoldingYears) - 1
        besAnnPct = rawBesAnn * 100
        // Projeksiyon için makul sınır (-10% ile +25% arası)
        const projectedBesAnn = Math.max(-0.10, Math.min(0.25, rawBesAnn))
        besMonthlyUsdReturn = Math.pow(1 + projectedBesAnn, 1 / 12) - 1
      }
    }

    // 2. AKTİF PORTFÖY GETİRİSİ (Dolar-Ağırlıklı CAGR)
    let activeValueUSD = 0
    let activeCostUSD = 0
    let weightedHoldingDaysSum = 0

    activeAssets.forEach(a => {
      const startDateStr = (a.start_date || a.created_at || '').split('T')[0]
      const dateMs = startDateStr ? new Date(startDateStr).getTime() : NaN
      const holdingDays = !isNaN(dateMs) && dateMs > 0
        ? Math.max(1, (Date.now() - dateMs) / 86400000)
        : 30
      
      const isUsdAsset = isUSD(a.type)
      const valTRY = getCurrentValue(a, prices, usdRate)
      const assetValUSD = valTRY / usdRate
      activeValueUSD += assetValUSD

      const rateAtBuy = (startDateStr && historicalRates[startDateStr]) || usdRate
      let assetCostUSD = 0
      if (isUsdAsset) {
        assetCostUSD = Number(a.avg_cost || 0) * Number(a.quantity || 0)
      } else {
        const tryCost = getCostValue(a, rateAtBuy)
        assetCostUSD = tryCost / rateAtBuy
      }

      const effectiveCost = Math.max(0, assetCostUSD)
      activeCostUSD += effectiveCost
      weightedHoldingDaysSum += effectiveCost * holdingDays
    })

    const weightedHoldingDays = activeCostUSD > 0 ? weightedHoldingDaysSum / activeCostUSD : 30
    const safeHoldingDays = (!isNaN(weightedHoldingDays) && weightedHoldingDays > 0) ? weightedHoldingDays : 30
    const activeHoldingYears = Math.max(15, safeHoldingDays) / 365.25

    let activeRawAnnPct = 0
    let activeMonthlyUsdReturn = 0

    if (activeCostUSD > 0 && activeValueUSD > 0) {
      const activeReturnRatio = activeValueUSD / activeCostUSD
      const rawActiveCAGR = Math.pow(activeReturnRatio, 1 / activeHoldingYears) - 1
      activeRawAnnPct = rawActiveCAGR * 100

      // Kısa vadeli portföylerde volatiliteyi yumuşatmak için baseline (%8) ile ağırlıklandırma
      const historyWeight = Math.min(1, Math.max(0.15, safeHoldingDays / 365.25))
      const blendedCAGR = historyWeight * rawActiveCAGR + (1 - historyWeight) * 0.08
      
      // FIRE projeksiyonu için güvenli aralık (-20% ile +35% arası)
      const projectedCAGR = Math.max(-0.20, Math.min(0.35, blendedCAGR))
      activeMonthlyUsdReturn = Math.pow(1 + projectedCAGR, 1 / 12) - 1
    } else {
      activeMonthlyUsdReturn = Math.pow(1.08, 1 / 12) - 1
    }

    // TOPLAM LİKİT PORTFÖYÜ (Projeksiyonun Başlangıç Sermayesi)
    const totalInvestedValue = besValue + (activeValueUSD * usdRate)

    // Ağırlıklı Ortalama Getiri Formülü
    let aylikGetiri = 0
    let besW = 0, activeW = 0

    if (totalInvestedValue > 0) {
      besW = besValue / totalInvestedValue
      activeW = (activeValueUSD * usdRate) / totalInvestedValue
      aylikGetiri = (besW * besMonthlyUsdReturn) + (activeW * activeMonthlyUsdReturn)
    } else {
      aylikGetiri = Math.pow(1.08, 1 / 12) - 1
    }

    const sabitAylikGetiri = Math.pow(1.08, 1 / 12) - 1

    // Tasarruf Hesaplaması (Son 12 ay veya mevcut tüm aylar)
    const oneYearAgoMonth = getTodayDate(new Date(Date.now() - 365 * 86400000)).slice(0, 7)
    let candidateSavings = savings.filter(s => String(s.month).slice(0, 7) >= oneYearAgoMonth)
    if (candidateSavings.length === 0) {
      candidateSavings = savings
    }

    let D_usd = 0
    candidateSavings.forEach(s => {
      const dateKey = String(s.month).slice(0, 10)
      const rate = historicalRates[dateKey] || usdRate
      D_usd += Number(s.amount_try || 0) / rate
    })
    const distinctMonthCount = new Set(candidateSavings.map(s => String(s.month).slice(0, 7))).size
    const avgMonthlySaving_usd = distinctMonthCount > 0 ? D_usd / distinctMonthCount : 0
    const avgMonthlySaving = avgMonthlySaving_usd * usdRate

    const monthlyExpense = Number(monthlyExpenseUSD) || 0
    const fireTargetUSD = monthlyExpense * 12 / WITHDRAWAL_RATE
    
    const currentPortfUSD = totalInvestedValue / usdRate

    const simulateMonthsToTarget = (targetUSD: number, contributionUsd: number, rate: number, startUSD: number) => {
      let value = startUSD
      let months = 0
      const maxMonths = 600
      while (value < targetUSD && months < maxMonths) {
        value = value * (1 + rate) + contributionUsd
        months++
      }
      return months >= maxMonths ? null : months
    }

    const simulateMonthsToMilestone = (targetUSD: number, contributionUsd: number, rate: number) => {
      let liquid = currentPortfUSD
      let manual = manualTotal / usdRate
      let debt = totalLiabilitiesUSD
      let months = 0
      const maxMonths = 600
      while ((liquid + manual - debt) < targetUSD && months < maxMonths) {
        liquid = liquid * (1 + rate) + contributionUsd
        months++
      }
      return months >= maxMonths ? null : months
    }

    const monthsToFireDinamik = simulateMonthsToMilestone(fireTargetUSD, avgMonthlySaving_usd, aylikGetiri)
    const monthsToFireSabit = simulateMonthsToMilestone(fireTargetUSD, avgMonthlySaving_usd, sabitAylikGetiri)

    const monthsToMilestoneDinamik = simulateMonthsToMilestone(nextMilestoneUSD, avgMonthlySaving_usd, aylikGetiri)
    const monthsToMilestoneSabit = simulateMonthsToMilestone(nextMilestoneUSD, avgMonthlySaving_usd, sabitAylikGetiri)

    const liquidMilestoneEtas = MILESTONES.map(m => {
      const isReached = netWorthUSD >= m
      return {
        target: m,
        reached: isReached,
        monthsDinamik: isReached ? 0 : simulateMonthsToMilestone(m, avgMonthlySaving_usd, aylikGetiri),
        monthsSabit: isReached ? 0 : simulateMonthsToMilestone(m, avgMonthlySaving_usd, sabitAylikGetiri)
      }
    })

    const calculateRequired = (rate: number) => {
      const targetYears = Number(targetYearsInput)
      if (targetYears <= 0) return null
      const n = targetYears * 12
      const growthFactor = Math.pow(1 + rate, n)
      const currentEffectiveUSD = Math.max(0, netWorthUSD)
      let requiredUsd: number
      if (rate !== 0) {
        requiredUsd = (fireTargetUSD - currentEffectiveUSD * growthFactor) / ((growthFactor - 1) / rate)
      } else {
        requiredUsd = (fireTargetUSD - currentEffectiveUSD) / n
      }
      return requiredUsd * usdRate
    }

    return {
      aylikGetiri,
      sabitAylikGetiri,
      avgMonthlySaving,
      fireTargetUSD,
      fireTargetTRY: fireTargetUSD * usdRate, 
      monthsToFireDinamik,
      monthsToFireSabit,
      monthsToMilestoneDinamik,
      monthsToMilestoneSabit,
      liquidMilestoneEtas,
      requiredMonthlySavingDinamik: calculateRequired(aylikGetiri),
      requiredMonthlySavingSabit: calculateRequired(sabitAylikGetiri),
      besW,
      activeW,
      besAnnPct,
      activeAnnPct: safeHoldingDays < 60
        ? Math.max(-50, Math.min(100, (Math.pow(1 + activeMonthlyUsdReturn, 12) - 1) * 100))
        : Math.max(-90, Math.min(200, activeRawAnnPct)),
      portfolioAnnPct: (Math.pow(1 + aylikGetiri, 12) - 1) * 100,
      weightedHoldingDays: Math.round(safeHoldingDays),
      activeCostUSD,
      activeValueUSD
    }
  }, [assets, manualTotal, totalLiabilitiesUSD, savings, historicalRates, usdRate, monthlyExpenseUSD, targetYearsInput, nextMilestoneUSD, prices])

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
    toast.success('Duran varlık eklendi!')
    fetchData()
  }

  const handleDeleteManualAsset = async (id: string) => {
    if (!confirm('Silmek istediğine emin misin?')) return
    await supabase.from('manual_assets').delete().eq('id', id)
    toast.success('Duran varlık silindi!')
    fetchData()
  }

  const handleAddLiability = async () => {
    if (!liabilityForm.name || !liabilityForm.amount) return
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'lb_' + Date.now()
    const newLiability = {
      id,
      portfolio_id: portfolioId,
      name: liabilityForm.name.trim(),
      amount: Number(liabilityForm.amount),
      currency: liabilityForm.currency || 'TRY',
      monthly_payment: liabilityForm.monthly_payment ? Number(liabilityForm.monthly_payment) : null,
      interest_rate: liabilityForm.interest_rate ? Number(liabilityForm.interest_rate) : null,
      created_at: new Date().toISOString()
    }

    const updated = [newLiability, ...liabilities]
    setLiabilities(updated)
    if (portfolioId) {
      localStorage.setItem(`user_liabilities_${portfolioId}`, JSON.stringify(updated))
    }
    localStorage.setItem('user_liabilities', JSON.stringify(updated))

    try {
      await supabase.from('liabilities').insert(newLiability)
      toast.success('Borç / Kredi eklendi!')
    } catch {
      // offline/table fallback
      toast.error('Borç eklenirken bir hata oluştu.')
    }

    setLiabilityForm({ name: '', amount: '', currency: 'TRY', monthly_payment: '', interest_rate: '' })
    setShowLiabilityForm(false)
  }

  const handleDeleteLiability = async (id: string) => {
    if (!confirm('Bu borç / kredi kaydını silmek istediğinize emin misiniz?')) return
    const updated = liabilities.filter(l => l.id !== id)
    setLiabilities(updated)
    if (portfolioId) {
      localStorage.setItem(`user_liabilities_${portfolioId}`, JSON.stringify(updated))
    }
    localStorage.setItem('user_liabilities', JSON.stringify(updated))

    try {
      await supabase.from('liabilities').delete().eq('id', id)
      toast.success('Borç / Kredi silindi!')
    } catch {
      // offline/table fallback
      toast.error('Borç silinirken bir hata oluştu.')
    }
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

    setSavingForm({ month: getTodayDate().slice(0, 7), amount_try: '', income_try: '', note: '' })
    setSavingType('giris')
    setShowSavingForm(false)
    toast.success('Tasarruf kaydedildi!')
    fetchData()
  }

  const handleDeleteSaving = async (id: string) => {
    if (!confirm('Bu aya ait tasarruf kaydını silmek istediğine emin misin?')) return
    await supabase.from('savings').delete().eq('id', id)
    toast.success('Tasarruf silindi!')
    fetchData()
  }

  const fc = (val: number) => {
    if (isHidden) return '••••••'
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val)
  }

  const fcUSD = (val: number, maxDigits = 0) => {
    if (isHidden) return '••••••'
    return '$' + Number(val).toLocaleString('en-US', { maximumFractionDigits: maxDigits })
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

  if (loading) return <GoalsSkeleton />

  return (
    <div className="page-container animate-in">

      {/* Başlık Alanı */}
      <div style={{ paddingTop: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>🎯 {activeTab === 'hedefler' ? 'Hedefler' : 'FIRE & Tasarruf'}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>$1.000.000 hedefine yolculuk</p>
        </div>
      </div>

      {/* Sayfa İçi Menü (Tabs) */}
      <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '12px', padding: '4px', marginBottom: '20px', border: '1px solid var(--border)' }}>
        <button onClick={() => setActiveTab('hedefler')} style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', background: activeTab === 'hedefler' ? 'var(--accent)' : 'none', color: activeTab === 'hedefler' ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
          🏆 Hedefler
        </button>
        <button onClick={() => setActiveTab('fire')} style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', background: activeTab === 'fire' ? 'var(--accent)' : 'none', color: activeTab === 'fire' ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
          🔥 FIRE & Tasarruf
        </button>
      </div>

      {/* =========================================
          SEKME 1: HEDEFLER VE BARAJLAR
      ========================================= */}
      {activeTab === 'hedefler' && (
        <>
          <div className="responsive-grid-2" style={{ marginBottom: '16px' }}>
          {/* Gerçek Net Varlık Özet Kartı */}
          <div style={{ ...card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gerçek Net Varlık (Net Worth)</p>
                <h2 style={{ fontSize: '24px', fontWeight: '900', color: netWorthTRY >= 0 ? '#10b981' : 'var(--red)', letterSpacing: '-0.5px', marginTop: '2px' }}>
                  {fc(netWorthTRY)}
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: '600' }}>
                  {fcUSD(netWorthUSD)}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '700',
                  background: netWorthTRY >= 0 ? 'var(--green-dim)' : 'var(--red-dim)',
                  color: netWorthTRY >= 0 ? 'var(--green)' : 'var(--red)'
                }}>
                  {netWorthTRY >= 0 ? 'Net Pozitif' : 'Net Borçlu'}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '2px' }}>Toplam Varlıklar</p>
                <p style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>{fc(totalAssetsTRY)}</p>
                <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{fcUSD(totalAssetsUSD)}</p>
              </div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '2px' }}>Toplam Borçlar</p>
                <p style={{ fontSize: '13px', fontWeight: '800', color: totalLiabilitiesTRY > 0 ? 'var(--red)' : 'var(--text-primary)' }}>
                  {totalLiabilitiesTRY > 0 ? `-${fc(totalLiabilitiesTRY)}` : '₺0'}
                </p>
                <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{fcUSD(totalLiabilitiesUSD)}</p>
              </div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '10px', textAlign: 'center', border: '1px solid var(--accent)' }}>
                <p style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '2px' }}>Net Varlık</p>
                <p style={{ fontSize: '13px', fontWeight: '800', color: 'var(--accent)' }}>{fc(netWorthTRY)}</p>
                <p style={{ fontSize: '10px', color: 'var(--accent)' }}>{fcUSD(netWorthUSD)}</p>
              </div>
            </div>
          </div>

          {/* Ana Hedef Tüpü */}
          <div style={{ ...card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
              <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>$1M Hedef İlerlemesi (Net Varlık)</p>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#10b981' }}>%{isHidden ? '••' : progressPct.toFixed(1)}</p>
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
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>$0</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>$1M</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px' }}>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>Net Varlık</p>
                <p style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>{fc(netWorthTRY)}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{fcUSD(netWorthUSD)}</p>
              </div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>Kalan</p>
                <p style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>{fc(Math.max(goalTRY - netWorthTRY, 0))}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{fcUSD(Math.max((goalTRY - netWorthTRY) / usdRate, 0))}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="responsive-grid-2" style={{ marginBottom: '16px' }}>
          {/* Ara Hedef (Milestone) Kartı - Gerçek Net Varlık Bazlı */}
          <div style={{ ...card, marginBottom: '16px', border: '1px solid var(--accent)', background: 'linear-gradient(to right bottom, #ffffff, var(--bg-elevated))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sıradaki Milestone</p>
                <p style={{ fontWeight: '800', fontSize: '18px', color: 'var(--text-primary)' }}>{fcUSD(nextMilestoneUSD)}</p>
              </div>
              <p style={{ fontSize: '14px', fontWeight: '800', color: 'var(--accent)' }}>%{isHidden ? '••' : milestoneProgressPct.toFixed(1)}</p>
            </div>

            <div style={{ position: 'relative', height: '16px', background: 'var(--bg-card)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, height: '100%',
                width: `${milestoneProgressPct}%`,
                background: 'linear-gradient(90deg, #818cf8, #6366f1)',
                borderRadius: '8px',
                transition: 'width 0.6s ease'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>{fcUSD(Math.floor(currentNW_USD))}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Hedefe Kalan: {fcUSD(nextMilestoneUSD - currentNW_USD)}</span>
            </div>

            {fireData && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', marginTop: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>Tahmini Kalan Süre</p>
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                   <div>
                      <p style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>{formatMonths(fireData.monthsToMilestoneDinamik)}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Dinamik Hızla</p>
                   </div>
                   <div style={{ width: '1px', height: '30px', background: 'var(--border)' }} />
                   <div>
                      <p style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>{formatMonths(fireData.monthsToMilestoneSabit)}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Sabit %8 ile</p>
                   </div>
                </div>
              </div>
            )}
          </div>

          {/* Dağılım Kartı */}
          <div style={{ ...card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} role="button" tabIndex={0} onClick={() => setShowDistribution(!showDistribution)}>
              <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>Varlık & Yükümlülük Dağılımı</p>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{showDistribution ? '▲ Gizle' : '▼ Göster'}</span>
            </div>

            {showDistribution && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>📊 Yatırım Portföyü </span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(portfolioTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>🏠 Duran Varlıklar </span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{fc(manualTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--red)' }}>💳 Toplam Borçlar & Krediler </span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--red)' }}>-{fc(totalLiabilitiesTRY)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent)' }}>💎 Gerçek Net Varlık </span>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--accent)' }}>{fc(netWorthTRY)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="responsive-grid-2" style={{ marginBottom: '16px' }}>
          {/* Duran Varlıklar Kartı */}
          <div style={{ ...card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} role="button" tabIndex={0} onClick={() => setShowAssetList(!showAssetList)}>
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
                  <input value={assetForm.name} onChange={e => setAssetForm({ ...assetForm, name: e.target.value })} placeholder="örn. Ev, Arsa, Araba" style={inputStyle} />
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={labelStyle}>Değer (₺)</label>
                  <input type="number" inputMode="decimal" step="any" value={assetForm.value_try} onChange={e => setAssetForm({ ...assetForm, value_try: e.target.value })} placeholder="5000000" style={inputStyle} />
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

          {/* Borçlar & Yükümlülükler (Liabilities) Kartı */}
          <div style={{ ...card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} role="button" tabIndex={0} onClick={() => setShowLiabilityList(!showLiabilityList)}>
                <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>💳 Borçlar & Yükümlülükler</p>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{showLiabilityList ? '▲ Gizle' : '▼ Göster'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: totalLiabilitiesTRY > 0 ? 'var(--red)' : 'var(--text-secondary)' }}>
                  {totalLiabilitiesTRY > 0 ? `-${fc(totalLiabilitiesTRY)}` : '₺0'}
                </span>
                {showLiabilityList && (
                  <button onClick={() => setShowLiabilityForm(!showLiabilityForm)}
                    style={{ padding: '6px 12px', background: showLiabilityForm ? 'var(--bg-elevated)' : 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '8px', color: 'var(--accent)', fontSize: '12px', fontWeight: '700' }}>
                    {showLiabilityForm ? 'Kapat' : '+ Ekle'}
                  </button>
                )}
              </div>
            </div>

            {showLiabilityList && showLiabilityForm && (
              <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ marginBottom: '10px' }}>
                  <label style={labelStyle}>Borç / Kredi Adı</label>
                  <input value={liabilityForm.name} onChange={e => setLiabilityForm({ ...liabilityForm, name: e.target.value })} placeholder="örn. Konut Kredisi, Taşıt Kredisi, Kredi Kartı" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={labelStyle}>Kalan Tutar</label>
                    <input type="number" inputMode="decimal" step="any" value={liabilityForm.amount} onChange={e => setLiabilityForm({ ...liabilityForm, amount: e.target.value })} placeholder="450000" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Para Birimi</label>
                    <select value={liabilityForm.currency} onChange={e => setLiabilityForm({ ...liabilityForm, currency: e.target.value })} style={inputStyle}>
                      <option value="TRY">TRY (₺)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={labelStyle}>Aylık Taksit (opsiyonel)</label>
                    <input type="number" inputMode="decimal" step="any" value={liabilityForm.monthly_payment} onChange={e => setLiabilityForm({ ...liabilityForm, monthly_payment: e.target.value })} placeholder="15000" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Faiz Oranı (%) (opsiyonel)</label>
                    <input type="number" inputMode="decimal" step="any" value={liabilityForm.interest_rate} onChange={e => setLiabilityForm({ ...liabilityForm, interest_rate: e.target.value })} placeholder="3.5" style={inputStyle} />
                  </div>
                </div>
                <button onClick={handleAddLiability}
                  style={{ width: '100%', padding: '10px', background: 'var(--accent)', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '14px' }}>
                  Kaydet
                </button>
              </div>
            )}

            {showLiabilityList && (
              liabilities.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0', fontSize: '13px' }}>Henüz borç veya kredi kaydı eklenmedi</p>
              ) : (
                liabilities.map((l: any, i: number) => {
                  const isUsd = l.currency === 'USD'
                  const tryVal = isUsd ? Number(l.amount) * usdRate : Number(l.amount)
                  return (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < liabilities.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{l.name}</span>
                        {(l.monthly_payment || l.interest_rate) && (
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {l.monthly_payment ? `Taksit: ${isUsd ? '$' : '₺'}${Number(l.monthly_payment).toLocaleString('tr-TR')}` : ''}
                            {l.monthly_payment && l.interest_rate ? ' · ' : ''}
                            {l.interest_rate ? `Faiz: %${l.interest_rate}` : ''}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--red)' }}>
                            -{isUsd ? fcUSD(l.amount) : fc(l.amount)}
                          </span>
                          {isUsd && (
                            <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>≈ {fc(tryVal)}</p>
                          )}
                        </div>
                        <button onClick={() => handleDeleteLiability(l.id)}
                          style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '4px 8px', fontSize: '11px', fontWeight: '700' }}>
                          Sil
                        </button>
                      </div>
                    </div>
                  )
                })
              )
            )}
          </div>
        </div>
        </>
      )}

      {/* =========================================
          SEKME 2: FIRE & TASARRUF
      ========================================= */}
      {activeTab === 'fire' && (
        <>
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
                      <input type="number" inputMode="decimal" step="any" value={savingForm.income_try} onChange={e => setSavingForm({ ...savingForm, income_try: e.target.value })} placeholder="76000" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Bu Girişteki Tasarruf (₺)</label>
                      <input type="number" inputMode="decimal" step="any" value={savingForm.amount_try} onChange={e => setSavingForm({ ...savingForm, amount_try: e.target.value })} placeholder="60000" style={inputStyle} />
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={labelStyle}>Çekim Tutarı (₺)</label>
                    <input type="number" inputMode="decimal" step="any" value={savingForm.amount_try} onChange={e => setSavingForm({ ...savingForm, amount_try: e.target.value })} placeholder="10000" style={{ ...inputStyle, border: '1px solid var(--red)' }} />
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
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: '800', fontSize: '13px', flexShrink: 0 }} aria-label="Kapat">
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
                  const ytdAvgAmount = ytdCount > 0 ? ytdSavings.reduce((sum, s) => sum + Number(s.amount_try || 0), 0) / ytdCount : 0
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
                                Tasarruf Oranı: %{isHidden ? '••' : data.oran.toFixed(1)}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize: '11px', fontWeight: '600' }} />
                    <Bar yAxisId="left" dataKey="gelir" name="Gelir" fill="#80cbd0" barSize={28} radius={[6, 6, 0, 0]} />
                    <Bar yAxisId="left" dataKey="tasarruf" name="Tasarruf" fill="#264653" barSize={28} radius={[6, 6, 0, 0]}>
                      {!isHidden && (
                        <LabelList dataKey="tasarruf" position="center" fill="#ffffff" fontSize={10} fontWeight="700" formatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                      )}
                    </Bar>
                    <Line yAxisId="right" type="monotone" dataKey="oran" name="Tasarruf Oranı (%)" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: '#10b981' }} label={<CustomizedLineLabel />} />
                 </ComposedChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          <div className="responsive-grid-2" style={{ marginBottom: '16px' }}>
          {/* FIRE Projeksiyonu Kartı */}
          <div style={{ ...card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>🔥 FIRE Projeksiyonu</p>
              <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)' }}>
                <button onClick={() => setFireMode('dinamik')} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: fireMode === 'dinamik' ? 'var(--accent)' : 'none', color: fireMode === 'dinamik' ? 'white' : 'var(--text-secondary)' }}>Dinamik</button>
                <button onClick={() => setFireMode('sabit')} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: fireMode === 'sabit' ? 'var(--accent)' : 'none', color: fireMode === 'sabit' ? 'white' : 'var(--text-secondary)' }}>Sabit %8</button>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Aylık Hedef Gider ($)</label>
              <input type="number" inputMode="decimal" step="any" value={monthlyExpenseUSD} onChange={e => setMonthlyExpenseUSD(e.target.value)} placeholder="3300" style={inputStyle} />
            </div>

            {!fireData ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>
                Portföyünüze varlık eklediğinizde FIRE projeksiyonu aktif olacaktır.
              </p>
            ) : (
              <>
                {(() => {
                  const currentAylikGetiri = fireMode === 'dinamik' ? fireData.aylikGetiri : fireData.sabitAylikGetiri;
                  const currentMonthsToFire = fireMode === 'dinamik' ? fireData.monthsToFireDinamik : fireData.monthsToFireSabit;
                  const currentRequiredSaving = fireMode === 'dinamik' ? fireData.requiredMonthlySavingDinamik : fireData.requiredMonthlySavingSabit;

                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                        <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px' }}>
                          <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>FIRE Hedefi</p>
                          <p style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>{fc(fireData.fireTargetTRY)}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{fcUSD(fireData.fireTargetUSD)}</p>
                        </div>
                        <div 
                          role="button" tabIndex={0} onClick={() => setShowReturnDetails(!showReturnDetails)}
                          onMouseEnter={() => setShowReturnDetails(true)} 
                          onMouseLeave={() => setShowReturnDetails(false)}
                          style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px', position: 'relative', cursor: 'pointer' }}
                        >
                          <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                            Yıllık Getiri {fireMode === 'dinamik' ? '(Dinamik)' : '(Sabit)'} ⓘ
                          </p>
                          <p style={{ fontSize: '15px', fontWeight: '800', color: currentAylikGetiri >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            %{isHidden ? '••' : ((Math.pow(1 + currentAylikGetiri, 12) - 1) * 100).toFixed(1)}
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Dolar (USD) Bazlı</p>

                          {showReturnDetails && (
                            <div style={{ position: 'absolute', top: '100%', left: '0', background: 'var(--bg-card)', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', zIndex: 50, width: '230px', boxShadow: 'var(--shadow-md)', marginTop: '8px' }}>
                              <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
                                {fireMode === 'dinamik' ? 'Dinamik Getiri Detayları' : 'Sabit Getiri Modu'}
                              </p>
                              {fireMode === 'dinamik' ? (
                                <>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>BES (%{(fireData.besW * 100).toFixed(0)}):</span>
                                    <span style={{ fontSize: '11px', fontWeight: '700', color: fireData.besAnnPct >= 0 ? 'var(--green)' : 'var(--red)' }}>%{fireData.besAnnPct.toFixed(1)}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Aktif Portföy (%{(fireData.activeW * 100).toFixed(0)}):</span>
                                    <span style={{ fontSize: '11px', fontWeight: '700', color: fireData.activeAnnPct >= 0 ? 'var(--green)' : 'var(--red)' }}>%{fireData.activeAnnPct.toFixed(1)}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', borderTop: '1px solid var(--border-light)', paddingTop: '6px' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Ağırlıklı Portföy Yaşı:</span>
                                    <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-primary)' }}>{fireData.weightedHoldingDays} gün</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Projeksiyon Oranı:</span>
                                    <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--accent)' }}>%{fireData.portfolioAnnPct.toFixed(1)} / yıl</span>
                                  </div>
                                </>
                              ) : (
                                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                  Sabit modda tarihsel küresel borsa ortalaması olan yıllık net <strong>%8 USD reel getiri</strong> kullanılır.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', borderRadius: '14px', padding: '18px', marginBottom: '14px', textAlign: 'center' }}>
                        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginBottom: '6px', fontWeight: '600' }}>Mevcut tempoyla FIRE'a kalan süre</p>
                        {currentMonthsToFire === null ? (
                          <p style={{ color: 'white', fontSize: '18px', fontWeight: '800' }}>50+ yıl (tempo yetersiz)</p>
                        ) : currentMonthsToFire === 0 ? (
                          <>
                            <p style={{ color: 'white', fontSize: '24px', fontWeight: '800' }}>
                              Hedefe Ulaşıldı! 🎉
                            </p>
                            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginTop: '4px' }}>
                              Finansal özgürlük portföy büyüklüğüne eriştiniz!
                            </p>
                          </>
                        ) : (
                          <>
                            <p style={{ color: 'white', fontSize: '28px', fontWeight: '800' }}>
                              {(currentMonthsToFire / 12).toFixed(1)} yıl
                            </p>
                            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginTop: '4px' }}>
                              ~{new Date(Date.now() + currentMonthsToFire * 30 * 24 * 60 * 60 * 1000).getFullYear()} yılında
                            </p>
                          </>
                        )}
                      </div>

                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.5' }}>
                        Aylık tasarrufunuz ortalama <strong>{fc(fireData.avgMonthlySaving)}</strong> baz alındı. 
                      </p>

                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                        <label style={labelStyle}>Şu kadar yılda ulaşmak istersem, aylık ne kadar tasarruf gerekir?</label>
                        <input type="number" inputMode="decimal" step="any" value={targetYearsInput} onChange={e => setTargetYearsInput(e.target.value)} placeholder="örn. 5" style={inputStyle} />

                        {currentRequiredSaving !== null && (
                          <div style={{ marginTop: '10px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '10px', padding: '12px' }}>
                            {currentRequiredSaving > 0 ? (
                              <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent)' }}>
                                Gereken aylık tasarruf: {fc(currentRequiredSaving)}
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
                  );
                })()}
              </>
            )}
          </div>

          {/* Net Varlık Yol Haritası Kartı */}
          <div style={{ ...card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <p style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>📈 Net Varlık Yol Haritası</p>
            </div>
            
            {!fireData ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>Yol haritası hesaplanıyor...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {fireData.liquidMilestoneEtas.map((m: any, index: number) => {
                  const isLast = index === MILESTONES.length - 1;
                  const isNext = !m.reached && (index === 0 || fireData.liquidMilestoneEtas[index - 1].reached);
                  
                  const milestoneRange = m.target - (index === 0 ? 0 : MILESTONES[index - 1]);
                  const currentNW = Math.max(0, netWorthUSD);
                  const currentProgressInMilestone = currentNW - (index === 0 ? 0 : MILESTONES[index - 1]);
                  const progressPct = Math.max(0, Math.min((currentProgressInMilestone / milestoneRange) * 100, 100));

                  return (
                    <div key={m.target} style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ 
                          width: '16px', height: '16px', borderRadius: '50%', 
                          background: m.reached ? 'var(--green)' : isNext ? 'var(--accent)' : 'var(--bg-elevated)',
                          border: `2px solid ${m.reached ? 'var(--green)' : isNext ? 'var(--accent)' : 'var(--border)'}`,
                          zIndex: 2
                        }} />
                        {!isLast && (
                          <div style={{ width: '2px', flex: 1, background: m.reached ? 'var(--green)' : 'var(--border)', margin: '4px 0' }} />
                        )}
                      </div>
                      
                      <div style={{ flex: 1, paddingBottom: isLast ? '0' : '20px', marginTop: '-2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <p style={{ fontWeight: '800', fontSize: '15px', color: m.reached ? 'var(--green)' : isNext ? 'var(--accent)' : 'var(--text-primary)' }}>
                            {fcUSD(m.target)}
                          </p>
                          {m.reached ? (
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--green)', background: 'var(--green-dim)', padding: '2px 8px', borderRadius: '10px' }}>Ulaşıldı ✓</span>
                          ) : isNext ? (
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'white', background: 'var(--accent)', padding: '2px 8px', borderRadius: '10px' }}>Milestone</span>
                          ) : null}
                        </div>

                        {isNext && (
                          <div style={{ marginTop: '10px', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Şu an: {fcUSD(Math.floor(currentNW))}</span>
                              <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '700' }}>%{isHidden ? '••' : progressPct.toFixed(1)}</span>
                            </div>
                            <div style={{ position: 'relative', height: '8px', background: 'var(--bg-elevated)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                              <div style={{
                                position: 'absolute', left: 0, top: 0, height: '100%',
                                width: `${progressPct}%`,
                                background: 'linear-gradient(90deg, #818cf8, #6366f1)',
                                borderRadius: '4px',
                                transition: 'width 0.6s ease'
                              }} />
                            </div>
                          </div>
                        )}

                        {!m.reached && (
                          <div style={{ display: 'flex', gap: '16px', marginTop: '10px', background: isNext ? 'var(--accent-dim)' : 'var(--bg-elevated)', padding: '10px', borderRadius: '10px', border: `1px solid ${isNext ? 'var(--accent)' : 'var(--border)'}` }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '2px' }}>DİNAMİK HIZLA</p>
                              <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                {formatMonths(m.monthsDinamik)}
                              </p>
                            </div>
                            <div style={{ width: '1px', background: 'var(--border)' }} />
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', marginBottom: '2px' }}>SABİT %8 İLE</p>
                              <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                {formatMonths(m.monthsSabit)}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        </>
      )}

    </div>
  )
}

export default Goals