import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PortfolioProvider } from './context/PortfolioContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Assets from './pages/Assets'
import Analytics from './pages/Analytics'
import Goals from './pages/Goals'

import { ReactNode } from 'react'

const PrivateRoute = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" />
}

import BottomNav from './components/BottomNav'

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
    <AuthProvider>
      <PortfolioProvider>
        <AppRoutes />
      </PortfolioProvider>
    </AuthProvider>
  )
}

export default App