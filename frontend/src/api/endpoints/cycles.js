import api from '../axiosClient'

function serializeParams(params = {}) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return
    }

    searchParams.append(key, String(value))
  })

  return searchParams.toString()
}

export function fetchDabCycles(atmId, params) {
  return api.get(`/dab/${atmId}/cycles`, {
    params,
    paramsSerializer: serializeParams,
  })
}

export function fetchCycleDetail(cycleId) {
  return api.get(`/cycles/${cycleId}`)
}

export function exportDabCyclesCsv(atmId, params) {
  return api.get(`/dab/${atmId}/cycles/export`, {
    params,
    paramsSerializer: serializeParams,
    responseType: 'blob',
  })
}
