import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { FALLBACK_USD_RATE } from '../lib/constants'
import { fetchAllPrices } from '../lib/prices'
import { saveSnapshot } from '../lib/snapshot'
import type { Asset } from '../types'
import { getCurrentValue, getCostValue, isPerformanceAsset } from '../lib/calculations'

interface PortfolioContextType {
  assets: Asset[]
  prices: Record<string, number>
  loading: boolean
  pricesLoading: boolean
  lastUpdated: Date | null
  portfolioId: string | null
  refresh: (force?: boolean) => Promise<void>
  isHidden: boolean
  setIsHidden: (hidden: boolean) => void
}

const PortfolioContext = createContext<PortfolioContextType>({} as PortfolioContextType)

export const PortfolioProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const [assets, setAssets] = useState<Asset[]>([])
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

    const loaded: Asset[] = assetsData || []
    setAssets(loaded)
    setLoading(false)
    setHasFetched(true)

    if (loaded.length > 0) {
      setPricesLoading(true)
      const fetched = await fetchAllPrices(loaded)
      setPrices(fetched)
      setLastUpdated(new Date())

      const usdtry = fetched['USDTRY=X'] || FALLBACK_USD_RATE

      const tv = loaded.reduce((sum, a) => sum + getCurrentValue(a, fetched), 0)
      const tc = loaded.reduce((sum, a) => sum + getCostValue(a, usdtry), 0)
      
      const performanceValue = loaded.reduce((sum, a) => {
        if (!isPerformanceAsset(a)) return sum
        return sum + getCurrentValue(a, fetched)
      }, 0)
      
      const performanceCost = loaded.reduce((sum, a) => {
        if (!isPerformanceAsset(a)) return sum
        return sum + getCostValue(a, usdtry)
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