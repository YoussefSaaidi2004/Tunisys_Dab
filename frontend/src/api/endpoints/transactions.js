import api from '../axiosClient'

const USE_MOCK = String(import.meta.env.VITE_USE_MOCK).toLowerCase() === 'true'

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

function delay(value, timeout = 500, signal) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => resolve(value), timeout)

    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId)
        const abortError = new Error('Aborted')
        abortError.name = 'AbortError'
        reject(abortError)
      })
    }
  })
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// Jeu nominal : 3 DAB, reflète l'exemple du contrat API.
export const MOCK_DISTRIBUTION_PAR_DAB = {
  status: 'success',
  data: [
    { atm_id: 1, terminal_id: '120001', nom: 'DAB Agence Centrale', montant_total: 458300.000, nb_transactions: 2841, pourcentage: 52.4 },
    { atm_id: 2, terminal_id: '100203', nom: 'GAB Menzah 6', montant_total: 271500.000, nb_transactions: 1093, pourcentage: 31.0 },
    { atm_id: 3, terminal_id: '111502', nom: 'DAB Lac 2', montant_total: 145200.000, nb_transactions: 612, pourcentage: 16.6 },
  ],
  meta: {
    montant_global: 875000.000,
    nb_transactions_global: 4546,
    nb_dab: 3,
    date_debut: '2026-06-01',
    date_fin: '2026-06-30',
  },
}

// Jeu à 8 DAB : vérifie la lisibilité des libellés (angle des ticks, légende
// tronquée) et l'absence de collision dans la palette catégorielle partagée.
export const MOCK_DISTRIBUTION_PAR_DAB_8_DAB = {
  status: 'success',
  data: [
    { atm_id: 1, terminal_id: '120001', nom: 'DAB Agence Centrale', montant_total: 458300.000, nb_transactions: 2841, pourcentage: 39.7 },
    { atm_id: 2, terminal_id: '100203', nom: 'GAB Menzah 6', montant_total: 271500.000, nb_transactions: 1093, pourcentage: 23.5 },
    { atm_id: 3, terminal_id: '111502', nom: 'DAB Lac 2', montant_total: 145200.000, nb_transactions: 612, pourcentage: 12.6 },
    { atm_id: 4, terminal_id: '031002', nom: 'DAB Ariana Centre', montant_total: 98700.000, nb_transactions: 430, pourcentage: 8.5 },
    { atm_id: 5, terminal_id: '140007', nom: 'GAB Sousse Corniche', montant_total: 76500.000, nb_transactions: 310, pourcentage: 6.6 },
    { atm_id: 6, terminal_id: '150011', nom: 'DAB Sfax Ville', montant_total: 54200.000, nb_transactions: 240, pourcentage: 4.7 },
    { atm_id: 7, terminal_id: '160044', nom: 'DAB Nabeul Centre', montant_total: 32100.000, nb_transactions: 145, pourcentage: 2.8 },
    { atm_id: 8, terminal_id: '170099', nom: 'GAB Bizerte Port', montant_total: 18900.000, nb_transactions: 88, pourcentage: 1.6 },
  ],
  meta: {
    montant_global: 1155400.000,
    nb_transactions_global: 5759,
    nb_dab: 8,
    date_debut: '2026-06-01',
    date_fin: '2026-06-30',
  },
}

export const MOCK_DISTRIBUTION_PAR_DAB_VIDE = {
  status: 'success',
  data: [],
  meta: {
    montant_global: 0,
    nb_transactions_global: 0,
    nb_dab: 0,
    date_debut: null,
    date_fin: null,
  },
}

function normalizeDateParam(value) {
  return value ? String(value).slice(0, 10) : null
}

function parseAtmIdsParam(atmIds) {
  if (!atmIds) return null
  return String(atmIds)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number)
}

// Simule le filtrage serveur sur les leviers réellement testables depuis
// l'écran (période, DAB sélectionnés, montant min/max) à partir des jeux de
// données statiques ci-dessus. Les filtres secondaires (recherche, reste
// coffre, heures) sont acceptés mais non simulés : le mock reste un outil de
// développement, pas une réplique fidèle du moteur SQL du backend réel.
function buildMockDistributionResponse(params = {}) {
  const dateDebut = normalizeDateParam(params.date_debut)
  const dateFin = normalizeDateParam(params.date_fin)
  const requestedAtmIds = parseAtmIdsParam(params.atm_ids)

  const horsPeriode = Boolean(dateDebut) && Boolean(dateFin) && (dateFin < '2026-06-01' || dateDebut > '2026-06-30')
  if (horsPeriode) {
    return {
      ...clone(MOCK_DISTRIBUTION_PAR_DAB_VIDE),
      meta: { ...MOCK_DISTRIBUTION_PAR_DAB_VIDE.meta, date_debut: dateDebut, date_fin: dateFin },
    }
  }

  const source = requestedAtmIds && requestedAtmIds.length > 3 ? MOCK_DISTRIBUTION_PAR_DAB_8_DAB : MOCK_DISTRIBUTION_PAR_DAB

  let items = clone(source.data)

  if (requestedAtmIds && requestedAtmIds.length > 0) {
    items = items.filter((item) => requestedAtmIds.includes(item.atm_id))
  }

  if (params.montant_min !== undefined && params.montant_min !== '') {
    items = items.filter((item) => item.montant_total >= Number(params.montant_min))
  }

  if (params.montant_max !== undefined && params.montant_max !== '') {
    items = items.filter((item) => item.montant_total <= Number(params.montant_max))
  }

  if (items.length === 0) {
    return {
      ...clone(MOCK_DISTRIBUTION_PAR_DAB_VIDE),
      meta: { ...MOCK_DISTRIBUTION_PAR_DAB_VIDE.meta, date_debut: dateDebut, date_fin: dateFin },
    }
  }

  const montantGlobal = items.reduce((sum, item) => sum + item.montant_total, 0)
  const nbTransactionsGlobal = items.reduce((sum, item) => sum + item.nb_transactions, 0)

  items = items
    .map((item) => ({
      ...item,
      pourcentage: montantGlobal ? Math.round((item.montant_total / montantGlobal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.montant_total - a.montant_total)

  return {
    status: 'success',
    data: items,
    meta: {
      montant_global: montantGlobal,
      nb_transactions_global: nbTransactionsGlobal,
      nb_dab: items.length,
      date_debut: dateDebut || source.meta.date_debut,
      date_fin: dateFin || source.meta.date_fin,
    },
  }
}

export function fetchDistributionParDab(params, { signal } = {}) {
  if (USE_MOCK) {
    const response = buildMockDistributionResponse(params)
    return delay({ data: response }, 500, signal)
  }

  return api.get('/transactions/statistiques/distribution-par-dab', {
    params,
    paramsSerializer: serializeParams,
    signal,
  })
}