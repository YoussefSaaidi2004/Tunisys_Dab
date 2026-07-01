import { Navigate } from 'react-router-dom'

import { useAuth } from './AuthContext'

export default function ProtectedRoute({ children, roles }) {
  const { user, ready, isAuthenticated } = useAuth()

  if (!ready) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (roles?.length && user?.role && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return children
}
