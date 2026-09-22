import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'
import { useAuth, registerSignOutHook } from './AuthContext'
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
  resetPortfolio: () => void
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

  const hasFetchedRef = useRef(false)
  const isFetchingRef = useRef(false)

  const resetPortfolio = useCallback(() => {
    hasFetchedRef.current = false
    isFetchingRef.current = false
    setAssets([])
    setPrices({})
    setPortfolioId(null)
    setHasFetched(false)
    setLastUpdated(null)
    setLoading(true)
  }, [])

  // Oturum kapatıldığında context belleğini anında temizle
  useEffect(() => {
    const unregister = registerSignOutHook(() => {
      resetPortfolio()
    })
    return unregister
  }, [resetPortfolio])

  // Kullanıcı oturumu açıldığında veya değiştiğinde portföyü yükle, oturum yoksa temizle
  useEffect(() => {
    if (user?.id) {
      refresh(true)
    } else {
      resetPortfolio()
    }
  }, [user?.id])

  const refresh = useCallback(async (force = false) => {
    if (!user) return
    if (hasFetchedRef.current && !force) { setLoading(false); return }
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {

    const { data: portfolios } = await supabase
      .from('portfolios').select('id').eq('user_id', user.id)

    if (!portfolios?.length) {
      const { data: newP } = await supabase
        .from('portfolios')
        .insert({ user_id: user.id, name: 'Ana Portföy' })
        .select('id')
        .single()

      if (newP?.id) {
        setPortfolioId(newP.id)
      }
      setAssets([])
      setLoading(false)
      hasFetchedRef.current = true
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
    hasFetchedRef.current = true
    setHasFetched(true)

    if (loaded.length > 0) {
      setPricesLoading(true)
      try {
        const fetched = await fetchAllPrices(loaded)
        setPrices(fetched)
        setLastUpdated(new Date())

        const usdtry = fetched['USDTRY=X'] || FALLBACK_USD_RATE

        // Snapshot İzolasyonu: Sadece kullanıcının kendi şahsi portföyüne ait varlıklar snapshot'a yazılır
        const personalAssets = loaded.filter(a => a.portfolio_id === portfolios[0].id)

        const tv = personalAssets.reduce((sum, a) => sum + getCurrentValue(a, fetched, usdtry), 0)
        const tc = personalAssets.reduce((sum, a) => sum + getCostValue(a, usdtry), 0)
        
        const performanceValue = personalAssets.reduce((sum, a) => {
          if (!isPerformanceAsset(a)) return sum
          return sum + getCurrentValue(a, fetched, usdtry)
        }, 0)
        
        const performanceCost = personalAssets.reduce((sum, a) => {
          if (!isPerformanceAsset(a)) return sum
          return sum + getCostValue(a, usdtry)
        }, 0)
        
        await saveSnapshot(portfolios[0].id, tv, tc, performanceValue, performanceCost)
      } catch (priceErr) {
        console.error('Error fetching prices or saving snapshot:', priceErr)
      } finally {
        setPricesLoading(false)
      }
    }
  } finally {
    isFetchingRef.current = false
  }
}, [user])

  return (
    <PortfolioContext.Provider value={{ assets, prices, loading, pricesLoading, lastUpdated, portfolioId, refresh, resetPortfolio, isHidden, setIsHidden }}>
      {children}
    </PortfolioContext.Provider>
  )
}

export const usePortfolio = () => useContext(PortfolioContext)