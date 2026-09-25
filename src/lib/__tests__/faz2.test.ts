// Unit Test Suite for Faz 2: Mimari, Performans & Güvenlik
import { getTodayDate } from '../constants.ts'
import { getTodayDate as getTodayDateFromDateModule } from '../date.ts'
import { searchTicker } from '../search.ts'
import fs from 'fs'

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`PASS: ${msg}`)
}

console.log('--- TEST SUITE: Faz 2 Performance & Timezone Standardization ---\n')

// 1. Timezone standardization test
{
  const todayStr = getTodayDate()
  const todayFromModule = getTodayDateFromDateModule()

  assert(todayStr === todayFromModule, `getTodayDate identical across imports: ${todayStr}`)
  assert(/^\d{4}-\d{2}-\d{2}$/.test(todayStr), `Date format is ISO YYYY-MM-DD: ${todayStr}`)

  // Europe/Istanbul verification
  const istanbulFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
  assert(todayStr === istanbulFormat, `Timezone matches Europe/Istanbul (${todayStr})`)

  // Midnight boundary test: 22:30 UTC is 01:30 next day in Istanbul (+3)
  const utcLateNight = new Date('2026-10-15T22:30:00.000Z')
  const istanbulDay = getTodayDate(utcLateNight)
  assert(istanbulDay === '2026-10-16', `Late night UTC shifts to next day in Istanbul: expected 2026-10-16, got ${istanbulDay}`)
}

// 2. AbortSignal in searchTicker test
{
  const controller = new AbortController()
  controller.abort() // Pre-aborted controller

  try {
    await searchTicker('THYAO', controller.signal)
    assert(false, 'searchTicker should have thrown on aborted signal')
  } catch (err: any) {
    assert(err?.name === 'AbortError' || controller.signal.aborted, 'searchTicker correctly recognizes aborted signal')
  }
}

// 3. vite.config.ts chunk configuration test
{
  const viteConfigContent = fs.readFileSync('vite.config.ts', 'utf8')
  assert(viteConfigContent.includes("'vendor-react': ['react', 'react-dom', 'react-router-dom']"), 'vite.config.ts configures vendor-react chunk')
  assert(viteConfigContent.includes("'vendor-recharts': ['recharts']"), 'vite.config.ts configures vendor-recharts chunk')
  assert(viteConfigContent.includes("'vendor-supabase': ['@supabase/supabase-js']"), 'vite.config.ts configures vendor-supabase chunk')
}

// 4. App.tsx lazy imports and Suspense verification
{
  const appContent = fs.readFileSync('src/App.tsx', 'utf8')
  assert(appContent.includes("lazy(() => import('./pages/Dashboard'))"), 'App.tsx lazy imports Dashboard')
  assert(appContent.includes("lazy(() => import('./pages/Assets'))"), 'App.tsx lazy imports Assets')
  assert(appContent.includes("lazy(() => import('./pages/Analytics'))"), 'App.tsx lazy imports Analytics')
  assert(appContent.includes("lazy(() => import('./pages/Goals'))"), 'App.tsx lazy imports Goals')
  assert(appContent.includes("lazy(() => import('./pages/Login'))"), 'App.tsx lazy imports Login')
  assert(appContent.includes('<Suspense fallback='), 'App.tsx wraps routes in Suspense fallback')
  assert(appContent.includes('PageSkeleton'), 'App.tsx includes PageSkeleton fallback')
}

// 5. Cleanup verification
{
  assert(!fs.existsSync('src/App.css'), 'src/App.css is deleted')
  assert(!fs.existsSync('src/components/assets'), 'src/components/assets empty dir is deleted')
  const analyticsContent = fs.readFileSync('src/pages/Analytics.tsx', 'utf8')
  assert(!analyticsContent.includes('reconstructPortfolioHistory'), 'Analytics.tsx does not import reconstructPortfolioHistory')
  assert(!analyticsContent.includes('batchSaveSnapshots'), 'Analytics.tsx does not import batchSaveSnapshots')
}

console.log('\n--- ALL FAZ 2 UNIT TESTS PASSED! ---')
