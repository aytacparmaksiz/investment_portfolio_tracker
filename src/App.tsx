import { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PortfolioProvider } from './context/PortfolioContext'
import BottomNav from './components/BottomNav'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Assets from './pages/Assets'
import Analytics from './pages/Analytics'
import Goals from './pages/Goals'
import ErrorBoundary from './components/ErrorBoundary'

const PrivateRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
        Yükleniyor...
      </div>
    )
  }
  return user ? <>{children}</> : <Navigate to="/login" />
}

const AppRoutes = () => {
  const { user } = useAuth()
  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/varliklar" element={<PrivateRoute><Assets /></PrivateRoute>} />
        <Route path="/hedefler" element={<PrivateRoute><Goals /></PrivateRoute>} />
        <Route path="/performans" element={<PrivateRoute><Analytics /></PrivateRoute>} />
        <Route path="/analitik-varliklar" element={<PrivateRoute><Analytics /></PrivateRoute>} />
      </Routes>
      {user && <BottomNav />}
    </>
  )
}

const App = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PortfolioProvider>
          <AppRoutes />
        </PortfolioProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App