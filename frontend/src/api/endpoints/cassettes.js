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

export function fetchCassetteEvents(params) {
  return api.get('/cassettes', {
    params,
    paramsSerializer: serializeParams,
  })
}

export function fetchCassetteEventDetail(eventId) {
  return api.get(`/cassettes/${eventId}`)
}