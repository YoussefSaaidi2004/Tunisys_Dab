import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import api, { tokenStore } from '../api/axiosClient'

const AuthContext = createContext(null)

const STORAGE_KEY = 'tunisys_dab_auth'

function decodeJwtPayload(token) {
  try {
    if (!token || typeof token !== 'string') return null

    const parts = token.split('.')
    if (parts.length < 2 || !parts[1]) return null

    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const decoded = atob(padded)

    const bytes = Array.from(decoded, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
    const json = decodeURIComponent(bytes)

    return JSON.parse(json)
  } catch {
    return null
  }
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
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = loadSession()
    if (stored?.tokens) {
      tokenStore.setTokens(stored.tokens)

      const storedUser = stored.user || null
      const accessToken = stored.tokens?.access_token

      if (storedUser && !storedUser.role && accessToken) {
        const jwtPayload = decodeJwtPayload(accessToken)
        setUser({
          login: jwtPayload?.sub || storedUser.login,
          role: jwtPayload?.role,
        })
      } else {
        setUser(storedUser)
      }
    }
    setReady(true)
  }, [])

  const persist = (nextUser, tokens) => {
    setUser(nextUser)
    tokenStore.setTokens(tokens)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user: nextUser, tokens }))
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
