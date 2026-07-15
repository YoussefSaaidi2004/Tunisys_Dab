import api from '../axiosClient'

export function triggerCollecte() {
  return api.post('/collecte/declencher')
}

export function fetchCollecteStatut() {
  return api.get('/collecte/statut')
}

export function fetchTxFiles(skip = 0, limit = 20) {
  return api.get('/fichiers-tx', { params: { skip, limit } })
}
