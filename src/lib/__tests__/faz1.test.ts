// Unit Test Suite for Faz 1: Acil & Kritik Veri Bütünlüğü (P0)
import { isUSD } from '../calculations.ts'

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`PASS: ${msg}`)
}

console.log('--- TEST SUITE: Faz 1 Data Integrity & Cash Reversal ---\n')

// 1. Test calculation of tryAmount in Cash Reversal
function computeTryAmount(tx: any, assetType: string, usdRate: number): number {
  const isUsdType = isUSD(assetType)
  const effectiveRate = isUsdType ? (Number(tx.try_rate) || usdRate) : 1
  const rawTryTotal = tx.try_total != null ? Number(tx.try_total) : 0
  return (isUsdType && rawTryTotal > 0)
    ? rawTryTotal
    : (Number(tx.quantity || 0) * Number(tx.price || 0) * effectiveRate)
}

// Scenario 1A: Non-USD Buy transaction (TRY stock)
{
  const tx = { type: 'buy', quantity: 100, price: 50 }
  const amount = computeTryAmount(tx, 'hisse', 34.5)
  assert(amount === 5000, `TRY stock buy amount is 5000 (got ${amount})`)
}

// Scenario 1B: Non-USD Sell transaction with string quantities from DB
{
  const tx = { type: 'sell', quantity: '50', price: '120.50' }
  const amount = computeTryAmount(tx, 'hisse', 34.5)
  assert(amount === 6025, `TRY stock sell amount with string inputs is 6025 (got ${amount})`)
}

// Scenario 1C: Non-USD stock corrupted by legacy bug (contains try_total = 5000 * 34.5 = 172500)
{
  const tx = { type: 'buy', quantity: 100, price: 50, try_total: 172500, try_rate: 34.5 }
  const amount = computeTryAmount(tx, 'hisse', 34.5)
  assert(amount === 5000, `Corrupted TRY stock ignores try_total and correctly yields 5000 (got ${amount})`)
}

// Scenario 1D: USD Stock with explicit try_total
{
  const tx = { type: 'buy', quantity: 10, price: 100, try_total: 34000, try_rate: 34 }
  const amount = computeTryAmount(tx, 'usd_hisse', 35)
  assert(amount === 34000, `USD stock with try_total uses historical 34000 (got ${amount})`)
}

// Scenario 1E: USD Stock without try_total, using try_rate
{
  const tx = { type: 'buy', quantity: 10, price: 100, try_rate: 34 }
  const amount = computeTryAmount(tx, 'usd_hisse', 35)
  assert(amount === 34000, `USD stock without try_total uses try_rate 34 -> 34000 (got ${amount})`)
}

// Scenario 1F: USD Stock without try_total and without try_rate, fallback to current rate
{
  const tx = { type: 'buy', quantity: 10, price: 100 }
  const amount = computeTryAmount(tx, 'usd_hisse', 35)
  assert(amount === 35000, `USD stock fallback uses current rate 35 -> 35000 (got ${amount})`)
}

// Scenario 1G: Crypto asset (USD-based)
{
  const tx = { type: 'sell', quantity: 0.5, price: 60000, try_rate: 34 }
  const amount = computeTryAmount(tx, 'kripto', 34)
  assert(amount === 1020000, `Crypto sell calculates correctly as 1020000 (got ${amount})`)
}

// 2. Test Cash Reversal Simulation (credit for buy delete, debit for sell delete)
interface CashState {
  quantity: number
}

function simulateCashReversal(
  tx: any,
  assetType: string,
  usdRate: number,
  existingCash: CashState | null
): { newCash: number; action: 'credit' | 'debit' | 'created' | 'skipped' } {
  const tryAmount = computeTryAmount(tx, assetType, usdRate)
  if (tryAmount <= 0) return { newCash: existingCash?.quantity || 0, action: 'skipped' }

  if (tx.type === 'buy') {
    if (existingCash) {
      const newQty = Math.round((existingCash.quantity + tryAmount) * 100) / 100
      return { newCash: newQty, action: 'credit' }
    } else {
      const newQty = Math.round(tryAmount * 100) / 100
      return { newCash: newQty, action: 'created' }
    }
  } else if (tx.type === 'sell') {
    if (existingCash) {
      const newQty = Math.round((existingCash.quantity - tryAmount) * 100) / 100
      return { newCash: newQty, action: 'debit' }
    } else {
      return { newCash: 0, action: 'skipped' }
    }
  }
  return { newCash: existingCash?.quantity || 0, action: 'skipped' }
}

// Scenario 2A: Deleting a BUY credits cash back
{
  const tx = { type: 'buy', quantity: 100, price: 25.5 } // 2550 TL
  const cash = { quantity: 10000 }
  const result = simulateCashReversal(tx, 'hisse', 34, cash)
  assert(result.action === 'credit', 'Action is credit')
  assert(result.newCash === 12550, `Cash credited: 10000 + 2550 = 12550 (got ${result.newCash})`)
}

// Scenario 2B: Deleting a BUY when no cash asset exists creates cash
{
  const tx = { type: 'buy', quantity: 10, price: 50 } // 500 TL
  const result = simulateCashReversal(tx, 'hisse', 34, null)
  assert(result.action === 'created', 'Action is created')
  assert(result.newCash === 500, `Cash created with 500 (got ${result.newCash})`)
}

// Scenario 2C: Deleting a SELL debits cash
{
  const tx = { type: 'sell', quantity: 50, price: 30 } // 1500 TL
  const cash = { quantity: 10000 }
  const result = simulateCashReversal(tx, 'hisse', 34, cash)
  assert(result.action === 'debit', 'Action is debit')
  assert(result.newCash === 8500, `Cash debited: 10000 - 1500 = 8500 (got ${result.newCash})`)
}

// Scenario 2D: Deleting a SELL when no cash asset exists is skipped without crash
{
  const tx = { type: 'sell', quantity: 50, price: 30 }
  const result = simulateCashReversal(tx, 'hisse', 34, null)
  assert(result.action === 'skipped', 'Action is skipped when no cash asset')
}

// Scenario 2E: Floating point precision rounding test
{
  const tx = { type: 'buy', quantity: 1.33, price: 10.33 } // 13.7389
  const cash = { quantity: 100.15 }
  const result = simulateCashReversal(tx, 'hisse', 34, cash)
  assert(result.newCash === 113.89, `Floating point rounded correctly: 100.15 + 13.7389 = 113.89 (got ${result.newCash})`)
}

// 3. Test syncInitialTransaction mock logic
function simulateSyncInitialTransaction(
  existingTxs: any[],
  newQty: number,
  newCost: number,
  isUsd?: boolean,
  tryRate?: number
) {
  let txs = [...existingTxs]
  if (txs.length === 0) {
    const payload: any = {
      id: 'tx-new',
      type: 'buy',
      quantity: newQty,
      price: newCost,
      total: newQty * newCost
    }
    if (isUsd && tryRate) {
      payload.try_rate = tryRate
      payload.try_total = newQty * newCost * tryRate
    }
    txs.push(payload)
    return { txs, updatedTx: payload }
  }

  const targetTx = (txs.length === 1) ? txs[0] : (txs.find(t => t.type === 'buy') || txs[0])
  const effectiveRate = isUsd ? (tryRate || targetTx.try_rate) : null
  const updatePayload: any = {
    quantity: newQty,
    price: newCost,
    total: newQty * newCost
  }
  if (effectiveRate) {
    updatePayload.try_rate = effectiveRate
    updatePayload.try_total = newQty * newCost * effectiveRate
  } else if (!isUsd) {
    updatePayload.try_rate = null
    updatePayload.try_total = null
  }

  // Update targetTx in place
  Object.assign(targetTx, updatePayload)
  return { txs, updatedTx: targetTx }
}

// Scenario 3A: Preserves multiple historical transactions (Fix 1 verification)
{
  const initialTxs = [
    { id: 'tx-1', type: 'buy', quantity: 100, price: 10, total: 1000 },
    { id: 'tx-2', type: 'buy', quantity: 50, price: 20, total: 1000 },
    { id: 'tx-3', type: 'sell', quantity: 30, price: 25, total: 750 }
  ]

  const { txs, updatedTx } = simulateSyncInitialTransaction(initialTxs, 120, 15, false, 34.5)
  assert(txs.length === 3, `All 3 transactions are preserved (got ${txs.length})`)
  assert(updatedTx.id === 'tx-1', 'Updated first buy transaction')
  assert(updatedTx.quantity === 120, `Updated quantity is 120 (got ${updatedTx.quantity})`)
  assert(updatedTx.price === 15, `Updated price is 15 (got ${updatedTx.price})`)
  assert(updatedTx.try_rate === null, 'try_rate is null for TRY stock')
  assert(updatedTx.try_total === null, 'try_total is null for TRY stock')
  assert(txs[1].id === 'tx-2' && txs[1].quantity === 50, 'tx-2 was untouched')
  assert(txs[2].id === 'tx-3' && txs[2].quantity === 30, 'tx-3 was untouched')
}

// Scenario 3B: Correctly sets try_rate and try_total for USD assets
{
  const initialTxs = [
    { id: 'tx-usd', type: 'buy', quantity: 10, price: 100, total: 1000, try_rate: 30, try_total: 30000 }
  ]

  const { txs, updatedTx } = simulateSyncInitialTransaction(initialTxs, 20, 150, true, 35)
  assert(txs.length === 1, 'Single transaction preserved')
  assert(updatedTx.quantity === 20, 'Quantity updated to 20')
  assert(updatedTx.price === 150, 'Price updated to 150')
  assert(updatedTx.total === 3000, 'Total updated to 3000')
  assert(updatedTx.try_rate === 35, `try_rate updated to 35 (got ${updatedTx.try_rate})`)
  assert(updatedTx.try_total === 105000, `try_total updated to 105000 (got ${updatedTx.try_total})`)
}

console.log('\n--- ALL FAZ 1 INTEGRITY TESTS PASSED! ---')
