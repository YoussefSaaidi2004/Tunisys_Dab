import api from '../api/axiosClient'

const USE_MOCK = String(import.meta.env.VITE_USE_MOCK).toLowerCase() === 'true'

const DEFAULT_ACTIONS = [
  'LOGIN',
  'IMPORT_TX',
  'EXPORT_RAPPORT',
  'MODIF_ATM',
  'CREATION_USER',
  'MODIF_USER',
  'SUPPRESSION_USER',
  'COLLECTE_MANUELLE',
]

const MOCK_USERS = [
  { id: 1, login: 'admin', nom: 'Administrateur Système' },
  { id: 2, login: 'supervision', nom: 'Responsable Supervision' },
  { id: 3, login: 'agent.tunis', nom: 'Agent Tunis Centre' },
  { id: 4, login: 'agent.sfax', nom: 'Agent Sfax Port' },
  { id: 5, login: 'auditeur1', nom: 'Auditeur Interne' },
  { id: 6, login: 'agent.nabeul', nom: 'Agent Nabeul Centre' },
]

const MOCK_BLUEPRINTS = [
  { utilisateur_id: 5, action: 'LOGIN', ressource: 'Portail audit', resultat: 'SUCCES', details: () => ({ mode: 'JWT', source: '192.168.10.44', session_id: 'AUD-20260706-001' }) },
  { utilisateur_id: 5, action: 'LOGIN', ressource: 'Portail audit', resultat: 'ECHEC', details: () => null },
  { utilisateur_id: 3, action: 'IMPORT_TX', ressource: 'TX20260705TerID111502.txt', resultat: 'SUCCES', details: () => ({ fichier: 'TX20260705TerID111502.txt', nb_lignes: 34, montant_total: 420000 }) },
  {
    utilisateur_id: 2,
    action: 'MODIF_ATM',
    ressource: 'DAB Tunis Centre',
    resultat: 'SUCCES',
    details: () => ({ avant: { seuil_retrait: 50000, etat: 'ACTIF' }, apres: { seuil_retrait: 60000, etat: 'ACTIF' } }),
  },
  {
    utilisateur_id: 1,
    action: 'SUPPRESSION_USER',
    ressource: 'agent.sfax',
    resultat: 'SUCCES',
    details: () => ({ avant: { login: 'agent.sfax', role: 'AGENT', actif: true }, apres: null, motif: 'Compte remplacé après réaffectation des terminaux' }),
  },
  { utilisateur_id: 4, action: 'COLLECTE_MANUELLE', ressource: 'DAB Sfax Port', resultat: 'SUCCES', details: () => ({ terminal_id: '111502', duree_secondes: 84, fichiers_traites: 2 }) },
  { utilisateur_id: 5, action: 'EXPORT_RAPPORT', ressource: 'Rapport audit journalier', resultat: 'SUCCES', details: () => ({ rapport: 'Journal d’audit', format: 'CSV', lignes: 128, filtre: '7 derniers jours' }) },
  {
    utilisateur_id: 1,
    action: 'CREATION_USER',
    ressource: 'nouvel.agent',
    resultat: 'SUCCES',
    details: () => ({ avant: null, apres: { login: 'nouvel.agent', role: 'AGENT', actif: true }, notification: 'Compte créé avec mot de passe temporaire' }),
  },
  { utilisateur_id: 1, action: 'MODIF_USER', ressource: 'auditeur1', resultat: 'SUCCES', details: () => ({ avant: { email: 'audit@banque.tn', role: 'AUDITOR' }, apres: { email: 'audit.interne@banque.tn', role: 'AUDITOR' } }) },
  { utilisateur_id: 6, action: 'IMPORT_TX', ressource: 'TX20260701TerID160044.txt', resultat: 'ECHEC', details: () => ({ fichier: 'TX20260701TerID160044.txt', erreur: 'Fichier TX vide' }) },
]

function delay(value, timeout = 120) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), timeout)
  })
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
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

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeDateInput(value) {
  const cleaned = String(value || '').trim()
  return cleaned ? cleaned.slice(0, 10) : ''
}

function parseDateOnly(value) {
  const normalized = normalizeDateInput(value)
  return normalized ? new Date(`${normalized}T00:00:00Z`) : null
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getUserById(id) {
  return MOCK_USERS.find((user) => user.id === Number(id)) || null
}

function buildMockAuditEntries() {
  const baseDate = new Date('2026-07-06T18:00:00Z')

  return Array.from({ length: 30 }, (_unused, index) => {
    const blueprint = MOCK_BLUEPRINTS[index % MOCK_BLUEPRINTS.length]
    const user = getUserById(blueprint.utilisateur_id) || MOCK_USERS[0]
    const date = new Date(baseDate)
    date.setUTCDate(baseDate.getUTCDate() - index)
    date.setUTCHours(18 - (index % 9), (index * 11) % 60, (index * 17) % 60, 0)

    return {
      id: 3000 - index,
      utilisateur_id: user.id,
      utilisateur_login: user.login,
      utilisateur_nom: user.nom,
      action: blueprint.action,
      ressource: blueprint.ressource,
      details: blueprint.details(),
      adresse_ip: `10.12.${(index % 3) + 1}.${40 + index}`,
      horodatage: date.toISOString(),
      resultat: blueprint.resultat,
    }
  }).sort((left, right) => new Date(right.horodatage) - new Date(left.horodatage))
}

const MOCK_AUDIT_ENTRIES = buildMockAuditEntries()

function paginate(params = {}) {
  const safePageSize = Math.max(1, Number(params.page_size || params.limit || 20) || 20)
  const safePage = Math.max(1, Number(params.page || 1) || 1)
  const safeSkip = params.skip !== undefined ? Math.max(0, Number(params.skip) || 0) : (safePage - 1) * safePageSize

  return {
    page: safePage,
    page_size: safePageSize,
    skip: safeSkip,
  }
}

function filterMockAudit(params = {}) {
  const dateFrom = parseDateOnly(params.date_debut || params.date_from)
  const dateTo = parseDateOnly(params.date_fin || params.date_to)
  const userId = params.utilisateur_id === undefined || params.utilisateur_id === null || params.utilisateur_id === '' ? null : Number(params.utilisateur_id)
  const userSearch = normalizeSearch(params.utilisateur_search || params.user_search || params.utilisateur_query)
  const action = normalizeSearch(params.action)
  const resultat = normalizeSearch(params.resultat)

  return MOCK_AUDIT_ENTRIES.filter((entry) => {
    const entryDate = new Date(entry.horodatage)
    const normalizedEntryDate = new Date(Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), entryDate.getUTCDate()))

    if (dateFrom && normalizedEntryDate < dateFrom) {
      return false
    }

    if (dateTo && normalizedEntryDate > dateTo) {
      return false
    }

    if (userId !== null && !Number.isNaN(userId) && entry.utilisateur_id !== userId) {
      return false
    }

    if (userSearch) {
      const haystack = `${entry.utilisateur_login || ''} ${entry.utilisateur_nom || ''}`.toLowerCase()
      if (!haystack.includes(userSearch)) {
        return false
      }
    }

    if (action && !String(entry.action || '').toLowerCase().includes(action)) {
      return false
    }

    if (resultat && String(entry.resultat || '').toLowerCase() !== resultat) {
      return false
    }

    return true
  })
}

function normalizeAuditListResponse(response) {
  const payload = response?.data?.data
  const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : []
  const total = Number(payload?.total ?? response?.data?.meta?.total ?? items.length)

  return {
    items,
    total,
  }
}

export function listAudit(params = {}) {
  if (USE_MOCK) {
    const pagination = paginate(params)
    const filtered = filterMockAudit(params)
    const pageItems = filtered.slice(pagination.skip, pagination.skip + pagination.page_size)

    return delay(
      makeSuccess(
        {
          total: filtered.length,
          items: clone(pageItems),
        },
        {
          total: filtered.length,
          page: pagination.page,
          page_size: pagination.page_size,
        },
      ),
    )
  }

  const requestParams = {
    skip: Math.max(0, (Math.max(1, Number(params.page) || 1) - 1) * Math.max(1, Number(params.page_size) || 20)),
    limit: Math.max(1, Number(params.page_size) || 20),
  }

  const dateDebut = normalizeDateInput(params.date_debut || params.date_from)
  const dateFin = normalizeDateInput(params.date_fin || params.date_to)
  const utilisateurId = params.utilisateur_id === undefined || params.utilisateur_id === null || params.utilisateur_id === '' ? '' : String(params.utilisateur_id)

  if (dateDebut) requestParams.date_debut = dateDebut
  if (dateFin) requestParams.date_fin = dateFin
  if (utilisateurId) requestParams.utilisateur_id = utilisateurId
  if (params.action) requestParams.action = params.action
  if (params.resultat) requestParams.resultat = params.resultat
  if (params.utilisateur_search) requestParams.utilisateur_search = params.utilisateur_search

  return api.get('/audit', { params: requestParams }).then((response) => ({
    ...response,
    data: {
      ...response.data,
      data: normalizeAuditListResponse(response),
    },
  }))
}

export function getAuditFiltres() {
  if (USE_MOCK) {
    const utilisateurs = []
    const seenUsers = new Set()

    MOCK_AUDIT_ENTRIES.forEach((entry) => {
      if (seenUsers.has(entry.utilisateur_id)) {
        return
      }

      seenUsers.add(entry.utilisateur_id)
      utilisateurs.push({
        id: entry.utilisateur_id,
        login: entry.utilisateur_login,
        nom: entry.utilisateur_nom,
      })
    })

    return delay(
      makeSuccess({
        utilisateurs,
        actions: [...new Set(MOCK_AUDIT_ENTRIES.map((entry) => entry.action))],
      }),
    )
  }

  return api.get('/audit/filtres').catch((error) => {
    if (error.response?.status === 404) {
      return makeSuccess({
        utilisateurs: [],
        actions: DEFAULT_ACTIONS,
        fallback_user_search: true,
      })
    }

    throw error
  })
}

export function formatAuditDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString().slice(0, 10)
}

export function isPlainAuditObject(value) {
  return isPlainObject(value)
}