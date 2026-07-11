import api from '../api/axiosClient'

const USE_MOCK = String(import.meta.env.VITE_USE_MOCK).toLowerCase() === 'true'

const MOCK_DABS = [
  { id: 1, terminal_id: '120001', nom: 'DAB Tunis Centre', actif: true },
  { id: 2, terminal_id: '100203', nom: 'DAB La Marsa', actif: true },
  { id: 3, terminal_id: '111502', nom: 'DAB Sfax Port', actif: true },
  { id: 4, terminal_id: '140118', nom: 'DAB Sousse Ville', actif: false },
  { id: 5, terminal_id: '160044', nom: 'DAB Nabeul Centre', actif: true },
]

let mockUsers = [
  {
    id: 1,
    login: 'admin',
    nom: 'Administrateur Système',
    email: 'admin@banque.tn',
    role: 'ADMIN',
    actif: true,
    date_creation: '2026-06-01T09:00:00Z',
    derniere_connexion: '2026-07-06T14:22:00Z',
  },
  {
    id: 2,
    login: 'supervision',
    nom: 'Responsable Supervision',
    email: 'supervision@banque.tn',
    role: 'SUPERVISOR',
    actif: true,
    date_creation: '2026-06-05T10:30:00Z',
    derniere_connexion: '2026-07-05T17:15:00Z',
  },
  {
    id: 3,
    login: 'agent.tunis',
    nom: 'Agent Tunis Centre',
    email: 'agent.tunis@banque.tn',
    role: 'AGENT',
    actif: true,
    date_creation: '2026-06-12T08:45:00Z',
    derniere_connexion: '2026-07-06T08:10:00Z',
  },
  {
    id: 4,
    login: 'agent.sfax',
    nom: 'Agent Sfax Port',
    email: 'agent.sfax@banque.tn',
    role: 'AGENT',
    actif: false,
    date_creation: '2026-06-14T11:00:00Z',
    derniere_connexion: null,
  },
  {
    id: 5,
    login: 'auditeur1',
    nom: 'Auditeur Interne',
    email: 'audit@banque.tn',
    role: 'AUDITOR',
    actif: true,
    date_creation: '2026-06-20T13:15:00Z',
    derniere_connexion: '2026-07-04T09:00:00Z',
  },
  {
    id: 6,
    login: 'agent.nabeul',
    nom: 'Agent Nabeul Centre',
    email: 'agent.nabeul@banque.tn',
    role: 'AGENT',
    actif: true,
    date_creation: '2026-06-22T15:05:00Z',
    derniere_connexion: '2026-07-06T12:40:00Z',
  },
]

let mockAffectations = [
  { id: 1, utilisateur_id: 3, atm_id: 1, date_affectation: '2026-06-12T10:00:00Z' },
  { id: 2, utilisateur_id: 3, atm_id: 2, date_affectation: '2026-06-13T10:00:00Z' },
  { id: 3, utilisateur_id: 4, atm_id: 3, date_affectation: '2026-06-14T10:00:00Z' },
  { id: 4, utilisateur_id: 6, atm_id: 5, date_affectation: '2026-06-22T16:00:00Z' },
]

let nextUserId = 7
let nextAffectationId = 5

function delay(value, timeout = 180) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), timeout)
  })
}

function createError(message, status = 400, code = 'ERR_MOCK') {
  const error = new Error(message)
  error.response = {
    status,
    data: {
      status: 'error',
      code,
      message,
    },
  }
  return error
}

function makeSuccess(data, meta = null) {
  return {
    data: {
      status: 'success',
      data,
      meta,
    },
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return value === 'true'
  }

  return Boolean(value)
}

function getMockAffectationView(userId) {
  return mockAffectations
    .filter((item) => item.utilisateur_id === userId)
    .map((item) => {
      const dab = MOCK_DABS.find((entry) => entry.id === item.atm_id)
      return {
        id: item.id,
        utilisateur_id: item.utilisateur_id,
        atm_id: item.atm_id,
        date_affectation: item.date_affectation,
        utilisateur_login: mockUsers.find((user) => user.id === item.utilisateur_id)?.login || null,
        atm_terminal_id: dab?.terminal_id || null,
        atm_nom: dab?.nom || null,
      }
    })
}

function filterUsers({ search, role, actif }) {
  const normalizedSearch = normalizeSearch(search)
  const normalizedRole = String(role || '').trim().toUpperCase()
  const normalizedActif = normalizeBoolean(actif)

  return mockUsers.filter((user) => {
    if (normalizedRole && user.role !== normalizedRole) {
      return false
    }

    if (normalizedActif !== undefined && user.actif !== normalizedActif) {
      return false
    }

    if (!normalizedSearch) {
      return true
    }

    const haystack = [user.login, user.nom, user.email || ''].join(' ').toLowerCase()
    return haystack.includes(normalizedSearch)
  })
}

function paginate(items, page, pageSize) {
  const safePage = Math.max(1, Number(page) || 1)
  const safePageSize = Math.max(1, Number(pageSize) || 10)
  const start = (safePage - 1) * safePageSize

  return {
    total: items.length,
    page: safePage,
    page_size: safePageSize,
    items: items.slice(start, start + safePageSize),
  }
}

function getUserOrThrow(id) {
  const user = mockUsers.find((entry) => entry.id === Number(id))
  if (!user) {
    throw createError('Utilisateur introuvable', 404, 'ERR_USER_NOT_FOUND')
  }
  return user
}

function ensureLoginEmailUnique({ login, email, excludeId }) {
  if (login) {
    const duplicateLogin = mockUsers.find((user) => user.login === login && user.id !== excludeId)
    if (duplicateLogin) {
      throw createError('Ce login est déjà utilisé', 409, 'ERR_DUPLICATE_LOGIN')
    }
  }

  if (email) {
    const duplicateEmail = mockUsers.find((user) => user.email === email && user.id !== excludeId)
    if (duplicateEmail) {
      throw createError('Cet email est déjà utilisé', 409, 'ERR_DUPLICATE_EMAIL')
    }
  }
}

function resolvePayloadEmail(email) {
  if (email === undefined) return undefined
  const cleaned = String(email || '').trim()
  return cleaned ? cleaned : null
}

export function listDabs() {
  if (USE_MOCK) {
    return delay(makeSuccess(clone(MOCK_DABS), { total: MOCK_DABS.length }))
  }

  return api.get('/dab')
}

export function listUsers({ page = 1, page_size = 10, search = '', role = '', actif = undefined } = {}) {
  if (USE_MOCK) {
    const filtered = filterUsers({ search, role, actif })
    const pagination = paginate(filtered, page, page_size)
    return delay(
      makeSuccess(
        {
          total: pagination.total,
          items: clone(pagination.items),
        },
        {
          total: pagination.total,
          page: pagination.page,
          page_size: pagination.page_size,
        },
      ),
    )
  }

  const params = {
    skip: (Math.max(1, Number(page) || 1) - 1) * Math.max(1, Number(page_size) || 10),
    limit: Math.max(1, Number(page_size) || 10),
  }

  const normalizedSearch = normalizeSearch(search)
  if (normalizedSearch) {
    params.search = normalizedSearch
  }

  const normalizedRole = String(role || '').trim().toUpperCase()
  if (normalizedRole) {
    params.role = normalizedRole
  }

  const normalizedActif = normalizeBoolean(actif)
  if (normalizedActif !== undefined) {
    params.actif = normalizedActif
  }

  return api.get('/utilisateurs', { params })
}

export function createUser(payload) {
  if (USE_MOCK) {
    const login = String(payload.login || '').trim()
    const nom = String(payload.nom || '').trim()
    const email = resolvePayloadEmail(payload.email)

    ensureLoginEmailUnique({ login, email })

    const nextUser = {
      id: nextUserId,
      login,
      nom,
      email,
      role: String(payload.role || '').trim().toUpperCase(),
      actif: Boolean(payload.actif),
      date_creation: new Date().toISOString(),
      derniere_connexion: null,
    }

    if (!nextUser.role) {
      throw createError('Le rôle est requis', 400, 'ERR_INVALID_ROLE')
    }

    mockUsers = [...mockUsers, nextUser]
    nextUserId += 1

    return delay(makeSuccess(clone(nextUser)))
  }

  return api.post('/utilisateurs', payload)
}

export function updateUser(id, payload) {
  if (USE_MOCK) {
    const user = getUserOrThrow(id)
    const nextEmail = resolvePayloadEmail(payload.email)
    ensureLoginEmailUnique({ login: user.login, email: nextEmail, excludeId: user.id })

    if (payload.nom !== undefined) {
      user.nom = String(payload.nom || '').trim()
    }

    if (payload.email !== undefined) {
      user.email = nextEmail
    }

    if (payload.role !== undefined) {
      user.role = String(payload.role || '').trim().toUpperCase()
      if (user.role !== 'AGENT') {
        mockAffectations = mockAffectations.filter((item) => item.utilisateur_id !== user.id)
      }
    }

    if (payload.actif !== undefined) {
      user.actif = Boolean(payload.actif)
    }

    if (payload.mot_de_passe) {
      user._mot_de_passe_reinitialise = true
    }

    return delay(makeSuccess(clone(user)))
  }

  return api.put(`/utilisateurs/${id}`, payload)
}



export function getAffectations(id) {
  if (USE_MOCK) {
    const items = getMockAffectationView(Number(id))
    return delay(
      makeSuccess(
        {
          total: items.length,
          items: clone(items),
        },
        {
          total: items.length,
          page: 1,
          page_size: items.length || 0,
        },
      ),
    )
  }

  return api.get(`/utilisateurs/${id}/affectations`).catch((error) => {
    if (error.response?.status === 404) {
      return api.get('/affectations', { params: { utilisateur_id: id } })
    }

    throw error
  })
}

export function addAffectation(id, atmId) {
  if (USE_MOCK) {
    const user = getUserOrThrow(id)
    if (user.role !== 'AGENT') {
      throw createError('Seul un utilisateur AGENT peut être affecté à un DAB', 400, 'ERR_INVALID_ROLE')
    }

    const dab = MOCK_DABS.find((item) => item.id === Number(atmId))
    if (!dab) {
      throw createError('DAB introuvable', 404, 'ERR_DAB_NOT_FOUND')
    }

    const existing = mockAffectations.find((item) => item.utilisateur_id === user.id && item.atm_id === Number(atmId))
    if (existing) {
      throw createError('Cet agent est déjà affecté à ce DAB', 409, 'ERR_DUPLICATE_AFFECTATION')
    }

    const affectation = {
      id: nextAffectationId,
      utilisateur_id: user.id,
      atm_id: Number(atmId),
      date_affectation: new Date().toISOString(),
    }

    mockAffectations = [...mockAffectations, affectation]
    nextAffectationId += 1

    return delay(
      makeSuccess({
        ...clone(affectation),
        utilisateur_login: user.login,
        atm_terminal_id: dab.terminal_id,
        atm_nom: dab.nom,
      }),
    )
  }

  return api.post(`/utilisateurs/${id}/affectations`, {
    atm_id: atmId,
  }).catch((error) => {
    if (error.response?.status === 404) {
      return api.post('/affectations', {
        utilisateur_id: id,
        atm_id: atmId,
      })
    }

    throw error
  })
}

export async function removeAffectation(id, atmId) {
  if (USE_MOCK) {
    const affectation = mockAffectations.find((item) => item.utilisateur_id === Number(id) && item.atm_id === Number(atmId))
    if (!affectation) {
      throw createError('Affectation introuvable', 404, 'ERR_AFFECTATION_NOT_FOUND')
    }

    mockAffectations = mockAffectations.filter((item) => item.id !== affectation.id)
    return delay(makeSuccess({ message: 'Affectation supprimée avec succès' }))
  }

  try {
    return await api.delete(`/utilisateurs/${id}/affectations/${atmId}`)
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error
    }
  }

  const response = await api.get('/affectations', { params: { utilisateur_id: id } })
  const items = response.data?.data?.items || []
  const affectation = items.find((item) => Number(item.atm_id) === Number(atmId))

  if (!affectation?.id) {
    throw createError('Affectation introuvable', 404, 'ERR_AFFECTATION_NOT_FOUND')
  }

  return api.delete(`/affectations/${affectation.id}`)
}