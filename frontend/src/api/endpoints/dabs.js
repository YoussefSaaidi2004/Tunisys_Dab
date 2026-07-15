import api from '../axiosClient'

export function fetchDabList(params) {
  return api.get('/dab', { params })
}

export function fetchDabs() {
  return fetchDabList()
}

export function fetchDabDetail(atmId) {
  return api.get(`/dab/${atmId}`)
}

export function createDab(payload) {
  return api.post('/dab', payload)
}

export function updateDab(atmId, payload) {
  return api.put(`/dab/${atmId}`, payload)
}

export function deactivateDab(atmId) {
  return updateDab(atmId, { actif: false })
}
