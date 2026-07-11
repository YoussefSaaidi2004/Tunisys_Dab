import api from '../axiosClient'

function serializeParams(params = {}) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== null && item !== undefined && item !== '') {
          searchParams.append(key, String(item))
        }
      })
      return
    }

    searchParams.append(key, String(value))
  })

  return searchParams.toString()
}

export function fetchTransactions(params) {
  return api.get('/transactions', {
    params,
    paramsSerializer: serializeParams,
  })
}

export function fetchTransactionsDailySummary(params) {
  return api.get('/transactions/daily-summary', {
    params,
    paramsSerializer: serializeParams,
  })
}

export function exportTransactionsCsv(params) {
  return api.get('/transactions/export', {
    params: { ...params, format: 'csv' },
    paramsSerializer: serializeParams,
    responseType: 'blob',
  })
}