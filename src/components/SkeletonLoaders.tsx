import React from 'react'

export const SkeletonBox: React.FC<{
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  className?: string
  style?: React.CSSProperties
}> = ({ width = '100%', height = '20px', borderRadius = '10px', className = '', style }) => {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style
      }}
    />
  )
}

export const DashboardSkeleton = () => {
  return (
    <div className="page-container animate-in">
      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingTop: '16px' }}>
        <div>
          <SkeletonBox width="140px" height="26px" style={{ marginBottom: '6px' }} />
          <SkeletonBox width="180px" height="14px" />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <SkeletonBox width="64px" height="34px" borderRadius="10px" />
          <SkeletonBox width="74px" height="34px" borderRadius="10px" />
        </div>
      </div>

      <div className="responsive-grid-2" style={{ marginBottom: '16px' }}>
        <div>
          {/* Main Card Skeleton */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', marginBottom: '16px', boxShadow: 'var(--shadow)' }}>
            <SkeletonBox width="130px" height="14px" style={{ marginBottom: '12px' }} />
            <SkeletonBox width="200px" height="40px" style={{ marginBottom: '10px' }} />
            <SkeletonBox width="90px" height="14px" style={{ marginBottom: '16px' }} />
            <SkeletonBox width="160px" height="32px" borderRadius="10px" />
          </div>

          {/* 3 KPI Cards */}
          <div className="responsive-grid-kpi">
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '14px' }}>
              <SkeletonBox width="50px" height="12px" style={{ marginBottom: '8px' }} />
              <SkeletonBox width="80px" height="18px" />
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '14px' }}>
              <SkeletonBox width="50px" height="12px" style={{ marginBottom: '8px' }} />
              <SkeletonBox width="80px" height="18px" />
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '14px' }}>
              <SkeletonBox width="50px" height="12px" style={{ marginBottom: '8px' }} />
              <SkeletonBox width="60px" height="18px" />
            </div>
          </div>
        </div>

        {/* Pie Chart Card Skeleton */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow)' }}>
          <SkeletonBox width="90px" height="18px" style={{ marginBottom: '18px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <SkeletonBox width="120px" height="120px" borderRadius="50%" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <SkeletonBox height="18px" />
              <SkeletonBox height="18px" />
              <SkeletonBox height="18px" />
              <SkeletonBox height="18px" />
            </div>
          </div>
        </div>
      </div>

      {/* Asset List Card Skeleton */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow)' }}>
        <SkeletonBox width="100px" height="18px" style={{ marginBottom: '16px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SkeletonBox height="44px" borderRadius="10px" />
          <SkeletonBox height="44px" borderRadius="10px" />
          <SkeletonBox height="44px" borderRadius="10px" />
        </div>
      </div>
    </div>
  )
}

export const AssetsSkeleton = () => {
  return (
    <div className="page-container animate-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingTop: '16px' }}>
        <div>
          <SkeletonBox width="190px" height="26px" style={{ marginBottom: '6px' }} />
          <SkeletonBox width="230px" height="14px" />
        </div>
        <SkeletonBox width="110px" height="38px" borderRadius="12px" />
      </div>

      {/* Asset Groups Skeletons */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow)' }}>
        <SkeletonBox width="130px" height="18px" style={{ marginBottom: '16px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <SkeletonBox width="140px" height="16px" />
                <SkeletonBox width="90px" height="12px" />
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <SkeletonBox width="70px" height="16px" />
                <SkeletonBox width="50px" height="28px" borderRadius="8px" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export const AnalyticsSkeleton = () => {
  return (
    <div className="page-container animate-in">
      <div style={{ paddingTop: '16px', marginBottom: '20px' }}>
        <SkeletonBox width="180px" height="26px" style={{ marginBottom: '6px' }} />
        <SkeletonBox width="240px" height="14px" />
      </div>

      {/* Filter / Chart Skeleton */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <SkeletonBox key={i} width="44px" height="28px" borderRadius="8px" />
          ))}
        </div>
        <SkeletonBox width="100%" height="220px" borderRadius="12px" style={{ marginBottom: '16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <SkeletonBox width="100px" height="20px" />
          <SkeletonBox width="80px" height="20px" />
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow)' }}>
        <SkeletonBox width="160px" height="18px" style={{ marginBottom: '14px' }} />
        <SkeletonBox width="100%" height="160px" borderRadius="12px" />
      </div>
    </div>
  )
}

export const GoalsSkeleton = () => {
  return (
    <div className="page-container animate-in">
      {/* Title */}
      <div style={{ paddingTop: '16px', marginBottom: '20px' }}>
        <SkeletonBox width="160px" height="26px" style={{ marginBottom: '6px' }} />
        <SkeletonBox width="180px" height="14px" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <SkeletonBox width="50%" height="40px" borderRadius="8px" />
        <SkeletonBox width="50%" height="40px" borderRadius="8px" />
      </div>

      {/* Net Worth Card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: 'var(--shadow)' }}>
        <SkeletonBox width="150px" height="14px" style={{ marginBottom: '10px' }} />
        <SkeletonBox width="200px" height="32px" style={{ marginBottom: '14px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          <SkeletonBox height="50px" borderRadius="10px" />
          <SkeletonBox height="50px" borderRadius="10px" />
          <SkeletonBox height="50px" borderRadius="10px" />
        </div>
      </div>

      {/* Progress Tube Skeleton */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
          <SkeletonBox width="140px" height="16px" />
          <SkeletonBox width="40px" height="16px" />
        </div>
        <SkeletonBox width="100%" height="24px" borderRadius="12px" />
      </div>

      {/* Milestones Skeleton */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow)' }}>
        <SkeletonBox width="120px" height="18px" style={{ marginBottom: '16px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <SkeletonBox height="54px" borderRadius="12px" />
          <SkeletonBox height="54px" borderRadius="12px" />
          <SkeletonBox height="54px" borderRadius="12px" />
        </div>
      </div>
    </div>
  )
}
