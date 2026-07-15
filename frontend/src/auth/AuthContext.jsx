import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import api, { setSessionExpiredHandler, tokenStore } from '../api/axiosClient'

const AuthContext = createContext(null)

const STORAGE_KEY = 'tunisys_dab_auth'

// setTimeout ne supporte pas un délai au-delà de ~24.8 jours (overflow
// 32-bit) ; le refresh token vit au plus JWT_REFRESH_TOKEN_EXPIRE_DAYS
// (7 jours par défaut) mais on plafonne par sécurité si la config change.
const MAX_TIMEOUT_MS = 2_147_483_647

function decodeJwtPayload(token) {
  try {
    if (!token || typeof token !== 'string') return null

    const parts = token.split('.')
    if (parts.length < 2 || !parts[1]) return null

    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const decoded = atob(padded)

    // Décodage UTF-8 correct (pas juste atob+JSON.parse) : robuste si le
    // payload contient un jour des caractères non-ASCII (login/nom accentués).
    const bytes = Array.from(decoded, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
    const json = decodeURIComponent(bytes)

    return JSON.parse(json)
  } catch {
    return null
  }
}

function decodeJwtRole(accessToken) {
  return decodeJwtPayload(accessToken)?.role || null
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const expiryTimerRef = useRef(null)

  const clearExpiryTimer = () => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current)
      expiryTimerRef.current = null
    }
  }

  const forceLogout = () => {
    clearExpiryTimer()
    tokenStore.clear()
    setUser(null)
    sessionStorage.removeItem(STORAGE_KEY)
    navigate('/login', { replace: true, state: { sessionExpired: true } })
  }

  // Déconnexion proactive : programmée sur l'expiration réelle du refresh
  // token (la véritable limite de la session), pas seulement en réaction à
  // un prochain appel API qui échouerait.
  const scheduleExpiryLogout = (refreshTokenValue) => {
    clearExpiryTimer()
    const payload = refreshTokenValue ? decodeJwtPayload(refreshTokenValue) : null
    if (!payload?.exp) return

    const msUntilExpiry = payload.exp * 1000 - Date.now()
    if (msUntilExpiry <= 0) {
      forceLogout()
      return
    }
    expiryTimerRef.current = setTimeout(forceLogout, Math.min(msUntilExpiry, MAX_TIMEOUT_MS))
  }

  useEffect(() => {
    setSessionExpiredHandler(forceLogout)
    return () => setSessionExpiredHandler(null)
  }, [])

  useEffect(() => {
    const stored = loadSession()
    if (stored?.tokens) {
      tokenStore.setTokens(stored.tokens)
      const nextRole = stored.user?.role || decodeJwtRole(stored.tokens.access_token)
      const nextUser = stored.user ? { ...stored.user, role: nextRole } : null
      setUser(nextUser)
      scheduleExpiryLogout(stored.tokens.refresh_token)

      if (stored.user && stored.user.role !== nextRole) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user: nextUser, tokens: stored.tokens }))
      }
    }
    setReady(true)
    return () => clearExpiryTimer()
  }, [])

  const persist = (nextUser, tokens) => {
    setUser(nextUser)
    tokenStore.setTokens(tokens)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user: nextUser, tokens }))
    scheduleExpiryLogout(tokens.refresh_token)
  }

  const login = async (loginValue, motDePasse) => {
    const response = await api.post('/auth/login', {
      login: loginValue,
      mot_de_passe: motDePasse,
    })

    const payload = response.data?.data
    if (!payload?.access_token || !payload?.refresh_token) {
      throw new Error('Réponse d’authentification invalide')
    }

    const tokenPayload = decodeJwtPayload(payload.access_token)
    const nextUser = {
      login: tokenPayload?.sub || loginValue,
      role: tokenPayload?.role,
    }
    persist(nextUser, payload)
    return nextUser
  }

  const logout = async () => {
    const refreshToken = tokenStore.getRefreshToken()
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refresh_token: refreshToken })
      }
    } finally {
      clearExpiryTimer()
      tokenStore.clear()
      setUser(null)
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  const value = useMemo(
    () => ({
      user,
      ready,
      isAuthenticated: Boolean(user && tokenStore.getAccessToken()),
      login,
      logout,
      accessToken: tokenStore.getAccessToken(),
    }),
    [user, ready],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth doit être utilisé dans AuthProvider')
  }
  return context
}
