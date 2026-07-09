import api from '../axiosClient'

export async function fetchDashboardStatistics() {
  const response = await api.get('/statistiques')
  return response.data?.data
}
