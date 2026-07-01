import api from '../axiosClient'

export function fetchDashboardStatistics() {
  return api.get('/statistiques')
}
