// Unit Test Suite for Faz 3: Finansal Özellikler & Fonksiyon Zenginliği (P2)
import { isUSD, getCurrentValue, getCostValue } from '../calculations.ts'
import { ASSET_TYPES, ASSET_LABELS, FALLBACK_USD_RATE } from '../constants.ts'
import type { Asset, Liability } from '../../types/index.ts'

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`PASS: ${msg}`)
}

console.log('--- TEST SUITE: Faz 3 Multi-Currency Cash & Liabilities ---\n')

// ============================================================================
// 1. Constants & Asset Types
// ============================================================================
{
  const typeValues = ASSET_TYPES.map(t => t.value)
  assert(typeValues.includes('doviz'), 'ASSET_TYPES includes doviz')
  
  
  assert(ASSET_LABELS['doviz'] === '💱 Döviz', 'ASSET_LABELS[doviz] is correct')
}

// ============================================================================
// 2. Currency Identification (isUSD)
// ============================================================================
{
  assert(isUSD('doviz', 'USD') === true, 'isUSD recognizes doviz USD')
  assert(isUSD('usd_hisse') === true, 'isUSD recognizes usd_hisse')
  assert(isUSD('etf') === true, 'isUSD recognizes etf')
  assert(isUSD('kripto') === true, 'isUSD recognizes kripto')
  assert(isUSD('doviz', 'EUR') === false, 'isUSD returns false for doviz EUR')
  assert(isUSD('nakit') === false, 'isUSD returns false for nakit (TRY)')
  assert(isUSD('hisse') === false, 'isUSD returns false for hisse (BIST)')
  assert(isUSD('bes') === false, 'isUSD returns false for bes')
}

// ============================================================================
// 3. Current Value & Cost Calculations (getCurrentValue & getCostValue)
// ============================================================================
{
  const usdRate = 35.0
  const eurRate = 38.5

  // 3A: USD Nakit
  const usdCash: Asset = {
    id: 'usd-cash-1',
    portfolio_id: 'p1',
    name: 'USD Nakit',
    symbol: 'USD',
    type: 'doviz', symbol: 'USD',
    quantity: 2500,
    avg_cost: 32.0, // Acquired at 32 TRY / USD
    created_at: '2026-01-01'
  }

  const usdCurrentVal = getCurrentValue(usdCash, {}, usdRate)
  assert(usdCurrentVal === 2500 * 35.0, `USD Nakit current value is 2500 * 35 = 87500 (got ${usdCurrentVal})`)

  const usdCostVal = getCostValue(usdCash, usdRate)
  assert(usdCostVal === 2500 * 32.0, `USD Nakit cost value is 2500 * 32 = 80000 (got ${usdCostVal})`)

  // USD Nakit without avg_cost (falls back to current usdRate)
  const usdCashNoCost: Asset = {
    ...usdCash,
    avg_cost: 0
  }
  const usdCostValFallback = getCostValue(usdCashNoCost, usdRate)
  assert(usdCostValFallback === 2500 * 35.0, `USD Nakit without avg_cost falls back to usdRate: 87500 (got ${usdCostValFallback})`)

  // 3B: EUR Nakit with explicit EURTRY price in fetchedPrices
  const eurCash: Asset = {
    id: 'eur-cash-1',
    portfolio_id: 'p1',
    name: 'EUR Nakit',
    symbol: 'EUR',
    type: 'doviz', symbol: 'EUR',
    quantity: 1000,
    avg_cost: 36.0,
    created_at: '2026-01-01'
  }

  const eurCurrentValWithPrice = getCurrentValue(eurCash, { 'EURTRY=X': eurRate }, usdRate)
  assert(eurCurrentValWithPrice === 1000 * 38.5, `EUR Nakit with EURTRY=X is 1000 * 38.5 = 38500 (got ${eurCurrentValWithPrice})`)

  // EUR Nakit fallback when EURTRY price is missing (usdRate * 1.08)
  const eurCurrentValFallback = getCurrentValue(eurCash, {}, usdRate)
  assert(eurCurrentValFallback === 1000 * (35.0 * 1.08), `EUR Nakit missing EURTRY falls back to usd*1.08: 37800 (got ${eurCurrentValFallback})`)

  const eurCostVal = getCostValue(eurCash, usdRate)
  assert(eurCostVal === 1000 * 36.0, `EUR Nakit cost value with avg_cost is 36000 (got ${eurCostVal})`)

  const eurCashNoCost: Asset = {
    ...eurCash,
    avg_cost: 0
  }
  const eurCostValFallback = getCostValue(eurCashNoCost, usdRate)
  assert(eurCostValFallback === 1000 * (35.0 * 1.08), `EUR Nakit without avg_cost falls back to usd*1.08: 37800 (got ${eurCostValFallback})`)

  // 3C: Default parameter fallback (FALLBACK_USD_RATE = 38.0)
  const usdDefaultVal = getCurrentValue(usdCash)
  assert(usdDefaultVal === 2500 * FALLBACK_USD_RATE, `getCurrentValue default usdtry uses FALLBACK_USD_RATE (got ${usdDefaultVal})`)
}

// ============================================================================
// 4. USD Cash Debit / Credit / Reversal Simulation (Assets.tsx logic)
// ============================================================================
{
  interface AssetRecord {
    id: string
    portfolio_id: string
    name: string
    type: string
    quantity: number
    avg_cost?: number
  }

  // Helper simulating buy execution in Assets.tsx
  function simulateBuy(
    assets: AssetRecord[],
    targetPid: string,
    isUsdType: boolean,
    finalPrice: number,
    quantity: number,
    usdRate: number
  ) {
    const list = assets.map(a => ({ ...a }))
    const usdCash = isUsdType ? list.find(a => a.portfolio_id === targetPid && a.type === 'doviz' && a.symbol === 'USD') : null
    let notice = ''

    if (isUsdType && usdCash) {
      const costUSD = finalPrice * quantity
      usdCash.quantity = Math.round((usdCash.quantity - costUSD) * 100) / 100
      notice = `$${costUSD.toFixed(2)} USD nakitten düşüldü`
    } else {
      const costTRY = isUsdType ? finalPrice * quantity * usdRate : finalPrice * quantity
      const tryCash = list.find(a => a.portfolio_id === targetPid && a.type === 'nakit')
      if (tryCash) {
        tryCash.quantity = Math.round((tryCash.quantity - costTRY) * 100) / 100
        notice = `₺${costTRY} nakitten düşüldü`
      }
    }
    return { assets: list, notice }
  }

  // Helper simulating sell execution in Assets.tsx
  function simulateSell(
    assets: AssetRecord[],
    targetPid: string,
    isUsdType: boolean,
    finalPrice: number,
    quantity: number,
    usdRate: number
  ) {
    const list = assets.map(a => ({ ...a }))
    const usdCash = isUsdType ? list.find(a => a.portfolio_id === targetPid && a.type === 'doviz' && a.symbol === 'USD') : null
    let notice = ''

    if (isUsdType && usdCash) {
      const proceedsUSD = finalPrice * quantity
      usdCash.quantity = Math.round((usdCash.quantity + proceedsUSD) * 100) / 100
      notice = `$${proceedsUSD.toFixed(2)} USD nakite aktarıldı`
    } else {
      const proceedsTRY = isUsdType ? finalPrice * quantity * usdRate : finalPrice * quantity
      let tryCash = list.find(a => a.portfolio_id === targetPid && a.type === 'nakit')
      if (tryCash) {
        tryCash.quantity = Math.round((tryCash.quantity + proceedsTRY) * 100) / 100
      } else {
        tryCash = { id: 'try-new', portfolio_id: targetPid, name: 'Nakit (TL)', type: 'nakit', quantity: Math.round(proceedsTRY * 100) / 100 }
        list.push(tryCash)
      }
      notice = `₺${proceedsTRY} nakite aktarıldı`
    }
    return { assets: list, notice }
  }

  // Helper simulating transaction deletion in Assets.tsx
  function simulateDeleteTx(
    assets: AssetRecord[],
    targetPid: string,
    isUsdType: boolean,
    txType: 'buy' | 'sell',
    price: number,
    quantity: number,
    usdRate: number
  ) {
    const list = assets.map(a => ({ ...a }))
    const usdCash = isUsdType ? list.find(a => a.portfolio_id === targetPid && a.type === 'doviz' && a.symbol === 'USD') : null
    let notice = ''

    if (isUsdType && usdCash) {
      const usdAmount = quantity * price
      if (txType === 'buy') {
        usdCash.quantity = Math.round((usdCash.quantity + usdAmount) * 100) / 100
        notice = `$${usdAmount.toFixed(2)} USD nakite iade edildi`
      } else {
        usdCash.quantity = Math.round((usdCash.quantity - usdAmount) * 100) / 100
        notice = `$${usdAmount.toFixed(2)} USD nakitten düşüldü`
      }
    } else {
      const tryAmount = isUsdType ? quantity * price * usdRate : quantity * price
      const tryCash = list.find(a => a.portfolio_id === targetPid && a.type === 'nakit')
      if (tryCash) {
        if (txType === 'buy') {
          tryCash.quantity = Math.round((tryCash.quantity + tryAmount) * 100) / 100
          notice = `₺${tryAmount} nakite iade edildi`
        } else {
          tryCash.quantity = Math.round((tryCash.quantity - tryAmount) * 100) / 100
          notice = `₺${tryAmount} nakitten düşüldü`
        }
      }
    }
    return { assets: list, notice }
  }

  const initialAssets: AssetRecord[] = [
    { id: 'c1', portfolio_id: 'p1', name: 'USD Nakit', type: 'doviz', symbol: 'USD', quantity: 1000 },
    { id: 'c2', portfolio_id: 'p1', name: 'TL Nakit', type: 'nakit', quantity: 50000 }
  ]

  // Scenario 4A: Buy USD stock (AAPL: 5 shares @ $150 = $750) -> Deducted from USD cash
  const buyRes = simulateBuy(initialAssets, 'p1', true, 150, 5, 35)
  const usdAfterBuy = buyRes.assets.find(a => a.type === 'doviz' && a.symbol === 'USD')!
  const tryAfterBuy = buyRes.assets.find(a => a.type === 'nakit')!
  assert(usdAfterBuy.quantity === 250, `USD Cash decreased by $750 to $250 (got ${usdAfterBuy.quantity})`)
  assert(tryAfterBuy.quantity === 50000, `TL Cash remained untouched at 50000 (got ${tryAfterBuy.quantity})`)
  assert(buyRes.notice.includes('$750.00 USD nakitten düşüldü'), 'Correct notice generated on USD buy')

  // Scenario 4B: Revert the buy transaction -> USD cash refunded
  const revBuyRes = simulateDeleteTx(buyRes.assets, 'p1', true, 'buy', 150, 5, 35)
  const usdAfterRev = revBuyRes.assets.find(a => a.type === 'doviz' && a.symbol === 'USD')!
  assert(usdAfterRev.quantity === 1000, `USD Cash restored to $1000 after buy deletion (got ${usdAfterRev.quantity})`)

  // Scenario 4C: Sell USD stock (NVDA: 2 shares @ $500 = $1000) -> Credited to USD cash
  const sellRes = simulateSell(initialAssets, 'p1', true, 500, 2, 35)
  const usdAfterSell = sellRes.assets.find(a => a.type === 'doviz' && a.symbol === 'USD')!
  assert(usdAfterSell.quantity === 2000, `USD Cash increased by $1000 to $2000 (got ${usdAfterSell.quantity})`)

  // Scenario 4D: Revert the sell transaction -> USD cash debited back
  const revSellRes = simulateDeleteTx(sellRes.assets, 'p1', true, 'sell', 500, 2, 35)
  const usdAfterRevSell = revSellRes.assets.find(a => a.type === 'doviz' && a.symbol === 'USD')!
  assert(usdAfterRevSell.quantity === 1000, `USD Cash debited back to $1000 after sell deletion (got ${usdAfterRevSell.quantity})`)

  // Scenario 4E: USD Buy when user has NO USD cash -> Falls back to TL cash
  const assetsWithoutUsdCash: AssetRecord[] = [
    { id: 'c2', portfolio_id: 'p1', name: 'TL Nakit', type: 'nakit', quantity: 50000 }
  ]
  const buyFallbackRes = simulateBuy(assetsWithoutUsdCash, 'p1', true, 100, 2, 35) // $200 * 35 = 7000 TL
  const tryAfterFallback = buyFallbackRes.assets.find(a => a.type === 'nakit')!
  assert(tryAfterFallback.quantity === 43000, `TL Cash debited by 7000 to 43000 (got ${tryAfterFallback.quantity})`)
}

// ============================================================================
// 5. Liabilities & Gerçek Net Varlık (True Net Worth) in Goals.tsx
// ============================================================================
{
  const usdRate = 35.0

  const portfolioAssets: Asset[] = [
    { id: 'a1', portfolio_id: 'p1', name: 'THYAO', symbol: 'THYAO.IS', type: 'hisse', quantity: 1000, avg_cost: 300, created_at: '2026-01-01' },
    { id: 'a2', portfolio_id: 'p1', name: 'USD Nakit', symbol: 'USD', type: 'doviz', symbol: 'USD', quantity: 10000, avg_cost: 34, created_at: '2026-01-01' }
  ]
  const prices = {
    'THYAO.IS': 320,
    'USDTRY=X': 35.0
  }

  // Portfolio total: THYAO (1000 * 320 = 320,000) + USD Nakit (10000 * 35 = 350,000) = 670,000 TRY
  const portfolioTotal = portfolioAssets.reduce((sum, a) => sum + getCurrentValue(a, prices, usdRate), 0)
  assert(portfolioTotal === 670000, `Portfolio total is 670,000 TRY (got ${portfolioTotal})`)

  // Physical assets (e.g. Ev: 2,500,000 TRY, Araba: 800,000 TRY = 3,300,000 TRY)
  const manualAssets = [
    { id: 'm1', name: 'Ev', value_try: 2500000 },
    { id: 'm2', name: 'Araba', value_try: 800000 }
  ]
  const manualTotal = manualAssets.reduce((sum, a) => sum + Number(a.value_try), 0)
  assert(manualTotal === 3300000, `Manual total is 3,300,000 TRY (got ${manualTotal})`)

  const totalAssetsTRY = portfolioTotal + manualTotal
  assert(totalAssetsTRY === 3970000, `Total Assets TRY is 3,970,000 (got ${totalAssetsTRY})`)

  // Liabilities (Borçlar):
  // 1. Konut Kredisi: 1,500,000 TRY
  // 2. Yabancı Borç: 20,000 USD (20,000 * 35 = 700,000 TRY)
  const liabilities: Liability[] = [
    {
      id: 'l1',
      portfolio_id: 'p1',
      name: 'Konut Kredisi',
      amount: 1500000,
      currency: 'TRY',
      monthly_payment: 35000,
      interest_rate: 3.2,
      created_at: '2026-01-01'
    },
    {
      id: 'l2',
      portfolio_id: 'p1',
      name: 'USD Kredisi',
      amount: 20000,
      currency: 'USD',
      created_at: '2026-01-01'
    }
  ]

  const totalLiabilitiesTRY = liabilities.reduce((sum, l) => {
    const amt = Number(l.amount || 0)
    return sum + (l.currency === 'USD' ? amt * usdRate : amt)
  }, 0)
  assert(totalLiabilitiesTRY === 1500000 + 700000, `Total Liabilities TRY is 2,200,000 (got ${totalLiabilitiesTRY})`)

  // True Net Worth = Total Assets - Total Liabilities
  const netWorthTRY = totalAssetsTRY - totalLiabilitiesTRY
  assert(netWorthTRY === 1770000, `True Net Worth TRY is 3.97M - 2.2M = 1,770,000 TRY (got ${netWorthTRY})`)

  const netWorthUSD = netWorthTRY / usdRate
  assert(Math.round(netWorthUSD) === Math.round(1770000 / 35.0), `True Net Worth USD is ~50,571 USD (got ${Math.round(netWorthUSD)})`)

  // Target Progress & FIRE milestones based on True Net Worth
  const GOAL_USD = 1000000
  const goalTRY = GOAL_USD * usdRate
  const effectiveNW_TRY = Math.max(0, netWorthTRY)
  const progressPct = (effectiveNW_TRY / goalTRY) * 100
  assert(progressPct > 5.0 && progressPct < 5.1, `Progress to $1M is ~5.06% (got ${progressPct.toFixed(2)}%)`)

  // Negative Net Worth Edge Case (Liabilities exceed Assets)
  const massiveLiabilities: Liability[] = [
    { id: 'l_huge', portfolio_id: 'p1', name: 'Devasa Borç', amount: 5000000, currency: 'TRY', created_at: '2026-01-01' }
  ]
  const negNetWorthTRY = totalAssetsTRY - massiveLiabilities[0].amount // 3,970,000 - 5,000,000 = -1,030,000
  assert(negNetWorthTRY === -1030000, `Negative Net Worth is -1,030,000 TRY (got ${negNetWorthTRY})`)
  const clampedEffective = Math.max(0, negNetWorthTRY)
  assert(clampedEffective === 0, `Clamped effective net worth for progress is 0%`)
}

// ============================================================================
// 6. FIRE Milestones Roadmap & Simulation based on True Net Worth
// ============================================================================
{
  const MILESTONES = [100000, 250000, 500000, 750000, 1000000]
  
  // Scenario 6A: Liquid portfolio is $120k, but user has $50k liability
  // True Net Worth = $70k (< $100k milestone)
  const currentPortfUSD = 120000
  const manualTotalUSD = 0
  const totalLiabilitiesUSD = 50000
  const netWorthUSD = (currentPortfUSD + manualTotalUSD) - totalLiabilitiesUSD // 70000

  const simulateMonthsToMilestone = (
    targetUSD: number,
    contributionUsd: number,
    rate: number,
    startPortfUSD: number,
    manualUSD: number,
    debtUSD: number
  ) => {
    let liquid = startPortfUSD
    let manual = manualUSD
    let debt = debtUSD
    let months = 0
    const maxMonths = 600
    while ((liquid + manual - debt) < targetUSD && months < maxMonths) {
      liquid = liquid * (1 + rate) + contributionUsd
      months++
    }
    return months >= maxMonths ? null : months
  }

  const milestoneRoadmap = MILESTONES.map(m => {
    const isReached = netWorthUSD >= m
    return {
      target: m,
      reached: isReached,
      months: isReached ? 0 : simulateMonthsToMilestone(m, 1000, 0.0064, currentPortfUSD, manualTotalUSD, totalLiabilitiesUSD)
    }
  })

  // 100k milestone must NOT be reached because Net Worth is $70k (despite liquid portfolio being $120k)
  assert(milestoneRoadmap[0].reached === false, 'Milestone $100k is NOT reached when Net Worth is $70k (even with $120k liquid portfolio)')
  assert((milestoneRoadmap[0].months ?? 0) > 0, 'Milestone $100k requires months of saving to overcome debt and reach $100k')

  // Progress towards 100k is 70% ($70k / $100k)
  const milestoneRange = MILESTONES[0] - 0
  const currentProgress = Math.max(0, netWorthUSD)
  const progressPct = (currentProgress / milestoneRange) * 100
  assert(Math.round(progressPct) === 70, `Milestone progress is 70% based on True Net Worth (got ${progressPct}%)`)

  // Scenario 6B: User pays off $50k debt -> True Net Worth becomes $120k
  const netWorthUSD_afterPayoff = currentPortfUSD
  const milestoneRoadmapPaid = MILESTONES.map(m => {
    const isReached = netWorthUSD_afterPayoff >= m
    return {
      target: m,
      reached: isReached,
      months: isReached ? 0 : simulateMonthsToMilestone(m, 1000, 0.0064, currentPortfUSD, manualTotalUSD, 0)
    }
  })
  assert(milestoneRoadmapPaid[0].reached === true, 'Milestone $100k is reached once True Net Worth reaches $120k')
  assert(milestoneRoadmapPaid[0].months === 0, 'Months to milestone is 0 when already reached')
  assert(milestoneRoadmapPaid[1].reached === false, 'Milestone $250k is not yet reached')

  // Scenario 6C: LocalStorage fallback resilient logic test
  // If DB query succeeds (!lbErr && lb) but lb is empty array [], it should NOT revive old local storage data
  let localStore: Record<string, string> = { 'user_liabilities_p1': JSON.stringify([{ id: 'old_debt' }]) }
  function resolveLiabilities(dbData: any[] | null, dbErr: any) {
    if (!dbErr && dbData) {
      localStore['user_liabilities_p1'] = JSON.stringify(dbData)
      return dbData
    } else {
      const local = localStore['user_liabilities_p1']
      return local ? JSON.parse(local) : []
    }
  }

  const emptyDbResult = resolveLiabilities([], null)
  assert(Array.isArray(emptyDbResult) && emptyDbResult.length === 0, 'Empty DB result correctly updates and returns [] without reviving stale localStorage')
  assert(localStore['user_liabilities_p1'] === '[]', 'LocalStorage was correctly synced to empty array')

  // If DB query failed (table does not exist)
  localStore['user_liabilities_p1'] = JSON.stringify([{ id: 'offline_debt', name: 'Kredi', amount: 10000 }])
  const offlineResult = resolveLiabilities(null, { message: 'relation liabilities does not exist' })
  assert(offlineResult.length === 1 && offlineResult[0].id === 'offline_debt', 'Failed DB query falls back to localStorage')
}

console.log('\n--- ALL FAZ 3 UNIT TESTS PASSED! ---')

