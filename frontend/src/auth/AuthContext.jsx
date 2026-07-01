import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import api, { tokenStore } from '../api/axiosClient'

const AuthContext = createContext(null)

const STORAGE_KEY = 'tunisys_dab_auth'

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
      setUser(stored.user || null)
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

    const nextUser = { login: loginValue }
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
