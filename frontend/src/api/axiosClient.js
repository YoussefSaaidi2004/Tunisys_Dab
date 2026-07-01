import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

let accessToken = null
let refreshToken = null
let refreshPromise = null

export const tokenStore = {
  getAccessToken: () => accessToken,
  setTokens: ({ access_token, refresh_token }) => {
    accessToken = access_token
    refreshToken = refresh_token || refreshToken
  },
  setAccessToken: (token) => {
    accessToken = token
  },
  setRefreshToken: (token) => {
    refreshToken = token
  },
  clear: () => {
    accessToken = null
    refreshToken = null
  },
  getRefreshToken: () => refreshToken,
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

async function refreshAccessToken() {
  const currentRefreshToken = tokenStore.getRefreshToken()
  if (!currentRefreshToken) {
    throw new Error('Aucun refresh token disponible')
  }

  if (!refreshPromise) {
    refreshPromise = api.post('/auth/refresh', { refresh_token: currentRefreshToken })
      .then((response) => {
        const nextToken = response.data?.data?.access_token
        if (!nextToken) {
          throw new Error('Refresh token invalide')
        }
        tokenStore.setAccessToken(nextToken)
        return nextToken
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest?._retry && tokenStore.getRefreshToken()) {
      originalRequest._retry = true
      const nextAccessToken = await refreshAccessToken()
      originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`
      return api(originalRequest)
    }
    return Promise.reject(error)
  },
)

export default api
