import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchSnapshots } from '../lib/snapshot'
import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const Analytics = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [portfolioId, setPortfolioId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<number>(30)

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (portfolioId) loadSnapshots(portfolioId, range) }, [range, portfolioId])

  const fetchData = async () => {
    const { data: portfolios } = await supabase
      .from('portfolios').select('id').eq('user_id', user.id)
    if (portfolios?.length) {
      setPortfolioId(portfolios[0].id)
      await loadSnapshots(portfolios[0].id, range)
    }
    setLoading(false)
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

  const cardStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '14px',
    padding: '16px'
  }

  const ranges = [
    { label: '7G', value: 7 },
    { label: '1A', value: 30 },
    { label: '3A', value: 90 },
    { label: '6A', value: 180 },
    { label: '1Y', value: 365 },
  ]

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p style={{ color: 'var(--text-secondary)' }}>Yükleniyor...</p>
    </div>
  )

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '16px', paddingBottom: '80px' }}>

      <div style={{ paddingTop: '16px', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: '700' }}>📈 Analitik</h1>
      </div>

      {snapshots.length < 2 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 16px' }}>
          <p style={{ fontSize: '32px', marginBottom: '12px' }}>📊</p>
          <p style={{ fontWeight: '600', marginBottom: '8px' }}>Henüz yeterli veri yok</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Grafik oluşmaya başlaması için en az 2 gün fiyat yenilemen gerekiyor.
          </p>
        </div>
      ) : (
        <>
          {/* Özet */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={cardStyle}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' as const }}>Başlangıç Değeri</p>
              <p style={{ fontSize: '16px', fontWeight: '700' }}>{fc(first)}</p>
            </div>
            <div style={cardStyle}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' as const }}>Güncel Değer</p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: 'var(--accent)' }}>{fc(last)}</p>
            </div>
            <div style={cardStyle}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' as const }}>Dönem Değişimi</p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: totalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {totalGain >= 0 ? '+' : ''}{fc(totalGain)}
              </p>
              <p style={{ fontSize: '11px', color: totalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {totalGain >= 0 ? '+' : ''}{totalGainPct.toFixed(2)}%
              </p>
            </div>
            <div style={cardStyle}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' as const }}>Toplam Kar/Zarar</p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: (last - (chartData[chartData.length-1]?.maliyet||0)) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {fc(last - (chartData[chartData.length-1]?.maliyet||0))}
              </p>
            </div>
          </div>

          {/* Zaman Aralığı */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {ranges.map(r => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                style={{
                  padding: '6px 12px', borderRadius: '20px', fontSize: '13px',
                  background: range === r.value ? 'var(--accent)' : 'var(--bg-secondary)',
                  border: `1px solid ${range === r.value ? 'var(--accent)' : 'var(--border)'}`,
                  color: range === r.value ? 'white' : 'var(--text-secondary)'
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Büyüme Grafiği */}
          <div style={{ ...cardStyle, marginBottom: '16px' }}>
            <p style={{ fontWeight: '600', marginBottom: '16px' }}>Portföy Büyümesi</p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorDeger" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorMaliyet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={(val: any) => fc(val)} labelStyle={{ color: '#f1f5f9' }} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="deger" name="Değer" stroke="#6366f1" fill="url(#colorDeger)" strokeWidth={2} />
                <Area type="monotone" dataKey="maliyet" name="Maliyet" stroke="#94a3b8" fill="url(#colorMaliyet)" strokeWidth={1} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Kar/Zarar Grafiği */}
          <div style={{ ...cardStyle, marginBottom: '16px' }}>
            <p style={{ fontWeight: '600', marginBottom: '16px' }}>Kar/Zarar Performansı</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorKar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={(val: any) => fc(val)} labelStyle={{ color: '#f1f5f9' }} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                <ReferenceLine y={0} stroke="#334155" />
                <Area type="monotone" dataKey="kar" name="Kar/Zarar" stroke="#22c55e" fill="url(#colorKar)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Alt Navigasyon */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '12px 0' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ fontSize: '20px' }}>📊</span> Portföy
        </button>
        <button onClick={() => navigate('/analitik')} style={{ background: 'none', color: 'var(--accent)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ fontSize: '20px' }}>📈</span> Analitik
        </button>
        <button onClick={() => navigate('/varliklar')} style={{ background: 'none', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ fontSize: '20px' }}>➕</span> Varlık Ekle
        </button>
      </div>
    </div>
  )
}

export default Analytics