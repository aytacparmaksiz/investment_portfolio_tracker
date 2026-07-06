import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { fetchAllPrices } from '../lib/prices'
import { saveSnapshot } from '../lib/snapshot'

interface PortfolioContextType {
  assets: any[]
  prices: Record<string, number>
  loading: boolean
  pricesLoading: boolean
  lastUpdated: Date | null
  portfolioId: string | null
  refresh: (force?: boolean) => Promise<void>
}

const PortfolioContext = createContext<PortfolioContextType>({} as any)

export const PortfolioProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const [assets, setAssets] = useState<any[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [portfolioId, setPortfolioId] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)
  const [isHidden, setIsHidden] = useState(false)

  const refresh = useCallback(async (force = false) => {
    if (!user) return
    if (hasFetched && !force) { setLoading(false); return }

    const { data: portfolios } = await supabase
      .from('portfolios').select('id').eq('user_id', user.id)

    if (!portfolios?.length) {
      await supabase.from('portfolios').insert({ user_id: user.id, name: 'Ana Portföy' })
      setLoading(false)
      setHasFetched(true)
      return
    }

    setPortfolioId(portfolios[0].id)

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
    setHasFetched(true)

    if (loaded.length > 0) {
      setPricesLoading(true)
      const fetched = await fetchAllPrices(loaded)
      setPrices(fetched)
      setLastUpdated(new Date())

      const getCurrentValue = (a: any) => {
        if (['bes', 'vadeli'].includes(a.type)) {
          if (a.type === 'vadeli' && a.principal && a.interest_rate) {
            const start = new Date(a.start_date || a.created_at)
            const days = Math.max(
              0,
              Math.floor((new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
            )
            const dailyRate = Number(a.interest_rate) / 365 / 100
            return Number(a.principal) * (1 + dailyRate * days)
          }
      
          const vals = a.manual_values || []
          return Number(vals[vals.length - 1]?.value || 0)
        }
      
        const p = fetched[a.symbol] ?? a.avg_cost ?? 0
        return Number(p) * Number(a.quantity || 0)
      }
      
      const getCostValue = (a: any) => {
        if (a.type === 'bes') {
          return Number(a.principal ?? a.avg_cost ?? 0)
        }
      
        if (a.type === 'vadeli') {
          return Number(a.principal ?? 0)
        }
      
        return Number(a.avg_cost || 0) * Number(a.quantity || 0)
      }
      
      const isPerformanceAsset = (a: any) => {
        // TRY nakit kar/zarar performansına dahil edilmez
        if (['nakit', 'try', 'TRY'].includes(a.type)) return false
      
        // BES sadece maliyet girildiyse performansa dahil edilir
        if (a.type === 'bes') {
          return Number(a.principal ?? a.avg_cost ?? 0) > 0
        }
      
        return true
      }
      
      const tv = loaded.reduce((sum: number, a: any) => {
        return sum + getCurrentValue(a)
      }, 0)
      
      const tc = loaded.reduce((sum: number, a: any) => {
        // Portföy Büyümesi grafiğindeki maliyet çizgisi mevcut mantıkla devam etsin
        if (['bes', 'vadeli'].includes(a.type)) return sum
        return sum + getCostValue(a)
      }, 0)
      
      const performanceValue = loaded.reduce((sum: number, a: any) => {
        if (!isPerformanceAsset(a)) return sum
        return sum + getCurrentValue(a)
      }, 0)
      
      const performanceCost = loaded.reduce((sum: number, a: any) => {
        if (!isPerformanceAsset(a)) return sum
        return sum + getCostValue(a)
      }, 0)
      
      await saveSnapshot(portfolios[0].id, tv, tc, performanceValue, performanceCost)
      setPricesLoading(false)
    }
  }, [user, hasFetched])

  return (
    <PortfolioContext.Provider value={{ assets, prices, loading, pricesLoading, lastUpdated, portfolioId, refresh, isHidden, setIsHidden }}>
      {children}
    </PortfolioContext.Provider>
  )
}

export const usePortfolio = () => useContext(PortfolioContext)