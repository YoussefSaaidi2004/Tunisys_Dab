import { Routes, Route, Navigate } from 'react-router-dom'

import { useAuth } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import { getDefaultRouteForRole } from './auth/roleRoutes'
import Cycles from './pages/Cycles'
import DabDetail from './pages/DabDetail'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Terminaux from './pages/Terminaux'
import Transactions from './pages/Transactions'

export default function App() {
  const { isAuthenticated, user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute roles={["ADMIN", "SUPERVISOR"]}>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute roles={["ADMIN", "SUPERVISOR", "AGENT"]}>
            <Transactions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/terminaux"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <Terminaux />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dab/:id"
        element={
          <ProtectedRoute roles={["ADMIN", "SUPERVISOR"]}>
            <DabDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cycles"
        element={
          <ProtectedRoute roles={["ADMIN", "SUPERVISOR", "AGENT", "AUDITOR"]}>
            <Cycles />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? getDefaultRouteForRole(user?.role) : '/login'} replace />} />
    </Routes>
  )
}
