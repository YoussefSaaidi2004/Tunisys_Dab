import { Routes, Route, Navigate } from 'react-router-dom'

import { useAuth } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import ImportTX from './pages/ImportTX'
import Login from './pages/Login'

export default function App() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute roles={["ADMIN", "SUPERVISOR", "AGENT", "AUDITOR"]}>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/import"
        element={
          <ProtectedRoute roles={["ADMIN", "SUPERVISOR"]}>
            <ImportTX />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
    </Routes>
  )
}
