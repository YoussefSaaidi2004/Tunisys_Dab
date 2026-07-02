import api from '../axiosClient'

export function fetchDabs() {
  return api.get('/dab')
}
