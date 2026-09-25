// Unit Test Suite for Faz 4: UI/UX & Mobil/Masaüstü Deneyimi
import fs from 'fs'

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`PASS: ${msg}`)
}

console.log('--- TEST SUITE: Faz 4 UI/UX & Responsive Experience ---\n')

// 1. Navigation & BottomNav Alignment
{
  const bottomNavContent = fs.readFileSync('src/components/BottomNav.tsx', 'utf8')
  assert(bottomNavContent.includes("{ path: '/', icon: '📊', label: 'Portföy' }"), "BottomNav has Portföy item with 📊 icon")
  assert(bottomNavContent.includes("{ path: '/performans', icon: '📈', label: 'Performans' }"), "BottomNav has Performans item with 📈 icon")
  assert(bottomNavContent.includes("{ path: '/analitik-varliklar', icon: '📋', label: 'Varlıklar' }"), "BottomNav has Varlıklar item with 📋 icon")
  assert(bottomNavContent.includes("{ path: '/hedefler', icon: '🎯', label: 'Hedefler' }"), "BottomNav has Hedefler item with 🎯 icon")
  assert(bottomNavContent.includes("{ path: '/varliklar', icon: '➕', label: 'İşlem' }"), "BottomNav has İşlem item with ➕ icon")
  assert(bottomNavContent.includes('bottom-nav-container'), "BottomNav uses bottom-nav-container class")
  assert(bottomNavContent.includes('bottom-nav-content'), "BottomNav uses bottom-nav-content class")
}

// 2. Page Titles Alignment
{
  const assetsContent = fs.readFileSync('src/pages/Assets.tsx', 'utf8')
  assert(assetsContent.includes('Varlık & İşlem Yönetimi'), "Assets.tsx has main title 'Varlık & İşlem Yönetimi'")
  assert(assetsContent.includes('Yeni varlık ekle, alım-satım yap ve portföyünü yönet'), "Assets.tsx has subtext 'Yeni varlık ekle, alım-satım yap ve portföyünü yönet'")

  const analyticsContent = fs.readFileSync('src/pages/Analytics.tsx', 'utf8')
  assert(analyticsContent.includes("activeTab === 'varliklar' ? 'Varlık Performansı' : 'Portföy Performansı'"), "Analytics.tsx has dynamic title between Varlık and Portföy Performansı")
  assert(analyticsContent.includes("activeTab === 'varliklar' ? 'Kategori ve varlık bazlı kâr/zarar oranları' : 'Zaman serisi grafikleri & Benchmark kıyaslama'"), "Analytics.tsx has dynamic subtext matching active tab")
}

// 3. Mobile Ergonomics & Quick Sell Precision
{
  const assetsContent = fs.readFileSync('src/pages/Assets.tsx', 'utf8')
  assert(assetsContent.includes('inputMode="decimal"'), "Assets.tsx uses inputMode='decimal'")
  assert(assetsContent.includes('step="any"'), "Assets.tsx uses step='any'")
  assert(assetsContent.includes("label: '%25', val: 25"), "Quick sell has %25 chip")
  assert(assetsContent.includes("label: '%50', val: 50"), "Quick sell has %50 chip")
  assert(assetsContent.includes("label: '%75', val: 75"), "Quick sell has %75 chip")
  assert(assetsContent.includes("label: 'Tümü (%100)', val: 100"), "Quick sell has Tümü (%100) chip")

  // Test quick sell algorithm with stock and high-precision crypto
  const quickSellCompute = (totalQty: number, percentage: number, isCrypto: boolean): number => {
    if (percentage === 100) return totalQty
    const decimals = isCrypto ? 8 : 4
    return parseFloat((totalQty * (percentage / 100)).toFixed(decimals))
  }

  // Stock scenario: 100 shares
  assert(quickSellCompute(100, 25, false) === 25, "100 shares 25% = 25")
  assert(quickSellCompute(100, 50, false) === 50, "100 shares 50% = 50")
  assert(quickSellCompute(100, 75, false) === 75, "100 shares 75% = 75")
  assert(quickSellCompute(100, 100, false) === 100, "100 shares 100% = 100")

  // Fractional crypto scenario: 0.00345 BTC
  assert(quickSellCompute(0.00345, 25, true) === 0.0008625, "0.00345 BTC 25% preserves 8-decimal precision: 0.0008625")
  assert(quickSellCompute(0.00345, 50, true) === 0.001725, "0.00345 BTC 50% preserves precision: 0.001725")
  assert(quickSellCompute(0.00345, 75, true) === 0.0025875, "0.00345 BTC 75% preserves precision: 0.0025875")
  assert(quickSellCompute(0.00345, 100, true) === 0.00345, "0.00345 BTC 100% preserves precision: 0.00345")

  // Micro crypto scenario: 0.00005 BTC (should NOT round to 0)
  assert(quickSellCompute(0.00005, 50, true) === 0.000025, "0.00005 BTC 50% does not round to zero: 0.000025")
}

// 4. Responsive Layout & CSS
{
  const cssContent = fs.readFileSync('src/index.css', 'utf8')
  assert(cssContent.includes('.page-container'), "index.css has .page-container")
  assert(cssContent.includes('max-width: 480px'), "index.css defines mobile max-width 480px")
  assert(cssContent.includes('max-width: 960px'), "index.css defines tablet max-width 960px")
  assert(cssContent.includes('max-width: 1100px'), "index.css defines desktop max-width 1100px")
  assert(cssContent.includes('.responsive-grid-2'), "index.css defines .responsive-grid-2")
  assert(cssContent.includes('.responsive-grid-kpi'), "index.css defines .responsive-grid-kpi")
  assert(cssContent.includes('.bottom-nav-container'), "index.css defines .bottom-nav-container")
  assert(cssContent.includes('.bottom-nav-content'), "index.css defines .bottom-nav-content with max-width 600px")
  assert(cssContent.includes('@keyframes skeletonShimmer'), "index.css defines @keyframes skeletonShimmer")
  assert(cssContent.includes('.skeleton-shimmer'), "index.css defines .skeleton-shimmer")

  // Verify page-container integration across all pages
  const dashboardContent = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8')
  assert(dashboardContent.includes('page-container'), "Dashboard.tsx uses page-container")
  assert(dashboardContent.includes('responsive-grid-2'), "Dashboard.tsx uses responsive-grid-2")
  assert(dashboardContent.includes('responsive-grid-kpi'), "Dashboard.tsx uses responsive-grid-kpi")

  const goalsContent = fs.readFileSync('src/pages/Goals.tsx', 'utf8')
  assert(goalsContent.includes('page-container'), "Goals.tsx uses page-container")
  assert(goalsContent.includes('responsive-grid-2'), "Goals.tsx uses responsive-grid-2")

  const assetsContent = fs.readFileSync('src/pages/Assets.tsx', 'utf8')
  assert(assetsContent.includes('page-container'), "Assets.tsx uses page-container")

  const analyticsContent = fs.readFileSync('src/pages/Analytics.tsx', 'utf8')
  assert(analyticsContent.includes('page-container'), "Analytics.tsx uses page-container")
  assert(analyticsContent.includes('responsive-grid-2'), "Analytics.tsx uses responsive-grid-2")
}

// 5. Skeleton Loaders
{
  const skeletonContent = fs.readFileSync('src/components/SkeletonLoaders.tsx', 'utf8')
  assert(skeletonContent.includes('export const SkeletonBox'), "SkeletonLoaders exports SkeletonBox")
  assert(skeletonContent.includes('export const DashboardSkeleton'), "SkeletonLoaders exports DashboardSkeleton")
  assert(skeletonContent.includes('export const AssetsSkeleton'), "SkeletonLoaders exports AssetsSkeleton")
  assert(skeletonContent.includes('export const AnalyticsSkeleton'), "SkeletonLoaders exports AnalyticsSkeleton")
  assert(skeletonContent.includes('export const GoalsSkeleton'), "SkeletonLoaders exports GoalsSkeleton")

  const dashboardContent = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8')
  assert(dashboardContent.includes('<DashboardSkeleton />'), "Dashboard.tsx renders DashboardSkeleton")

  const assetsContent = fs.readFileSync('src/pages/Assets.tsx', 'utf8')
  assert(assetsContent.includes('<AssetsSkeleton />'), "Assets.tsx renders AssetsSkeleton")

  const analyticsContent = fs.readFileSync('src/pages/Analytics.tsx', 'utf8')
  assert(analyticsContent.includes('<AnalyticsSkeleton />'), "Analytics.tsx renders AnalyticsSkeleton")

  const goalsContent = fs.readFileSync('src/pages/Goals.tsx', 'utf8')
  assert(goalsContent.includes('<GoalsSkeleton />'), "Goals.tsx renders GoalsSkeleton")
}

console.log('\n--- ALL FAZ 4 UNIT TESTS PASSED! ---')
