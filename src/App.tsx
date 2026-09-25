import { ReactNode, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PortfolioProvider } from './context/PortfolioContext'
import BottomNav from './components/BottomNav'
import ErrorBoundary from './components/ErrorBoundary'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Assets = lazy(() => import('./pages/Assets'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Goals = lazy(() => import('./pages/Goals'))
const Login = lazy(() => import('./pages/Login'))

const PageSkeleton = () => (
  <div style={{
    minHeight: '80vh',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  }}>
    <style>{`
      @keyframes pulseSkeleton {
        0%, 100% { opacity: 0.6; transform: scale(1); }
        50% { opacity: 0.25; transform: scale(0.998); }
      }
      .skeleton-pulse {
        background: #e2e8f0;
        border-radius: 12px;
        animation: pulseSkeleton 1.5s ease-in-out infinite;
      }
    `}</style>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div className="skeleton-pulse" style={{ width: '160px', height: '32px' }} />
      <div className="skeleton-pulse" style={{ width: '80px', height: '32px', borderRadius: '20px' }} />
    </div>
    <div className="skeleton-pulse" style={{ width: '100%', height: '140px' }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
      <div className="skeleton-pulse" style={{ height: '90px' }} />
      <div className="skeleton-pulse" style={{ height: '90px' }} />
      <div className="skeleton-pulse" style={{ height: '90px' }} />
    </div>
    <div className="skeleton-pulse" style={{ width: '100%', height: '240px' }} />
  </div>
)

const PrivateRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth()
  if (loading) {
    return <PageSkeleton />
  }
  return user ? <>{children}</> : <Navigate to="/login" />
}

const AppRoutes = () => {
  const { user } = useAuth()
  return (
    <>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/varliklar" element={<PrivateRoute><Assets /></PrivateRoute>} />
          <Route path="/hedefler" element={<PrivateRoute><Goals /></PrivateRoute>} />
          <Route path="/performans" element={<PrivateRoute><Analytics /></PrivateRoute>} />
          <Route path="/analitik-varliklar" element={<PrivateRoute><Analytics /></PrivateRoute>} />
        </Routes>
      </Suspense>
      {user && <BottomNav />}
    </>
  )
}

import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'

const App = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <PortfolioProvider>
              <AppRoutes />
            </PortfolioProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App