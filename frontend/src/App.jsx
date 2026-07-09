import { Routes, Route, Navigate } from 'react-router-dom'

import { useAuth } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import GestionUtilisateurs from './pages/GestionUtilisateurs'
import JournalAudit from './pages/JournalAudit'
import ImportTX from './pages/ImportTX'
import Login from './pages/Login'
import Rapports from './pages/Rapports'

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
      <Route
        path="/utilisateurs"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <GestionUtilisateurs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute roles={["ADMIN", "AUDITOR"]}>
            <JournalAudit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/rapports"
        element={
          <ProtectedRoute roles={["ADMIN", "SUPERVISOR", "AUDITOR"]}>
            <Rapports />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
    </Routes>
  )
}
