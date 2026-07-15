import api from '../api/axiosClient'

export const USE_MOCK = String(import.meta.env.VITE_USE_MOCK).toLowerCase() === 'true'

const REPORT_TYPES = {
  journalier: 'Journalier',
  hebdomadaire: 'Hebdomadaire',
  mensuel: 'Mensuel',
}

const MOCK_TERMINALS = [
  { terminal_id: '120001', nom: 'DAB Agence Centrale', actif: true },
  { terminal_id: '100203', nom: 'DAB La Marsa', actif: true },
  { terminal_id: '111502', nom: 'DAB Sfax Port', actif: true },
]

function delay(value, timeout = 180) {
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

function normalizeReportType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return REPORT_TYPES[normalized] ? normalized : 'mensuel'
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function toIsoDateOnly(date) {
  return date.toISOString().slice(0, 10)
}

function parseDateOnly(value) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return null
  }

  const candidate = normalized.length === 7 ? `${normalized}-01` : normalized.slice(0, 10)
  const date = new Date(`${candidate}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setUTCDate(nextDate.getUTCDate() + days)
  return nextDate
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function endOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

function startOfPreviousWeek(date) {
  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayIndex = (normalized.getUTCDay() + 6) % 7
  normalized.setUTCDate(normalized.getUTCDate() - dayIndex - 7)
  return normalized
}

function getDefaultPeriodValue(type, referenceDate = new Date()) {
  const normalizedType = normalizeReportType(type)
  const current = new Date(referenceDate)

  if (normalizedType === 'journalier') {
    current.setUTCDate(current.getUTCDate() - 1)
    return toIsoDateOnly(current)
  }

  if (normalizedType === 'hebdomadaire') {
    return toIsoDateOnly(startOfPreviousWeek(current))
  }

  const previousMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1))
  return `${previousMonth.getUTCFullYear()}-${pad(previousMonth.getUTCMonth() + 1)}`
}

function resolveReportPeriod(type, periodValue) {
  const normalizedType = normalizeReportType(type)
  const fallbackValue = getDefaultPeriodValue(normalizedType)
  const anchor = parseDateOnly(periodValue || fallbackValue) || parseDateOnly(fallbackValue) || new Date()

  if (normalizedType === 'journalier') {
    const from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()))
    const label = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(from)

    return {
      type: normalizedType,
      from: toIsoDateOnly(from),
      to: toIsoDateOnly(from),
      libelle: label,
      anchor: toIsoDateOnly(from),
    }
  }

  if (normalizedType === 'hebdomadaire') {
    const from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()))
    const to = addDays(from, 6)
    const fromLabel = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(from)
    const toLabel = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(to)

    return {
      type: normalizedType,
      from: toIsoDateOnly(from),
      to: toIsoDateOnly(to),
      libelle: `Semaine du ${fromLabel} au ${toLabel}`,
      anchor: toIsoDateOnly(from),
    }
  }

  const monthSource = periodValue && String(periodValue).length >= 7 ? String(periodValue).slice(0, 7) : fallbackValue
  const [yearPart, monthPart] = monthSource.split('-').map((item) => Number(item))
  const monthDate = new Date(Date.UTC(Number.isFinite(yearPart) ? yearPart : anchor.getUTCFullYear(), Number.isFinite(monthPart) ? monthPart - 1 : anchor.getUTCMonth(), 1))
  const from = startOfMonth(monthDate)
  const to = endOfMonth(monthDate)
  const libelle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(from)

  return {
    type: normalizedType,
    from: toIsoDateOnly(from),
    to: toIsoDateOnly(to),
    libelle: libelle.charAt(0).toUpperCase() + libelle.slice(1),
    anchor: `${from.getUTCFullYear()}-${pad(from.getUTCMonth() + 1)}`,
  }
}

function normalizeTerminalIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean)
  }

  if (value === undefined || value === null || value === '') {
    return []
  }

  if (typeof value === 'string' && value.includes(',')) {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }

  return [String(value)]
}

function normalizeRequestParams(params = {}) {
  const type = normalizeReportType(params.type)
  const periodValue = params.periodValue || params.period || params.date || params.date_debut || params.mois || params.month
  const period = resolveReportPeriod(type, periodValue)
  const terminalIds = normalizeTerminalIds(params.terminal_id ?? params.terminal_ids ?? params.terminalIds)

  const requestParams = {
    type,
    date: period.anchor,
  }

  if (terminalIds.length > 0) {
    requestParams.terminal_id = terminalIds
  }

  return {
    type,
    periodValue: period.anchor,
    period,
    terminalIds,
    requestParams,
  }
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

function getTerminalWeights(count) {
  if (count <= 0) {
    return []
  }

  const baseWeights = [0.48, 0.32, 0.2]
  const weights = Array.from({ length: count }, (_unused, index) => baseWeights[index] || Math.max(0.08, 1 / (count + index + 1)))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  return weights.map((weight) => weight / total)
}

function buildSeriePoints(period, totalAmount, type) {
  const start = new Date(`${period.from}T00:00:00Z`)
  const points = []

  if (type === 'journalier') {
    for (let hour = 0; hour < 24; hour += 1) {
      const wave = 0.5 + (Math.sin((hour - 6) / 3) + 1) * 0.5
      points.push({
        label: `${pad(hour)}h`,
        montant: Math.max(0, Math.round((totalAmount / 24) * wave * 1000) / 1000),
      })
    }
    return points
  }

  const toDate = new Date(`${period.to}T00:00:00Z`)
  const days = Math.max(1, Math.round((toDate - start) / 86400000) + 1)

  for (let index = 0; index < days; index += 1) {
    const current = addDays(start, index)
    const amountFactor = type === 'hebdomadaire'
      ? 0.88 + (Math.cos(index * 1.1) + 1) * 0.18
      : 0.82 + (Math.sin(index / 2.2) + 1) * 0.16

    points.push({
      label: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(current),
      montant: Math.max(0, Math.round((totalAmount / days) * amountFactor * 1000) / 1000),
    })
  }

  return points
}

function buildMockReportData(params = {}) {
  const normalized = normalizeRequestParams(params)
  const selectedTerminals = normalized.terminalIds.length > 0
    ? MOCK_TERMINALS.filter((terminal) => normalized.terminalIds.includes(terminal.terminal_id))
    : [...MOCK_TERMINALS]

  const activeTerminals = selectedTerminals.filter((terminal) => terminal.actif)
  const inactiveTerminals = selectedTerminals.filter((terminal) => !terminal.actif)
  const selectedCount = Math.max(1, selectedTerminals.length)
  const totalAmountBase = normalized.type === 'journalier'
    ? 224600.125
    : normalized.type === 'hebdomadaire'
      ? 1250400.000
      : 4867200.875
  const totalAmount = Math.round((totalAmountBase * (selectedCount / MOCK_TERMINALS.length)) * 1000) / 1000
  const weights = getTerminalWeights(selectedTerminals.length)

  const parTerminal = selectedTerminals.map((terminal, index) => {
    const share = weights[index] || 0
    const montantDistribue = Math.round((totalAmount * share) * 1000) / 1000
    const nbTransactions = Math.max(18, Math.round(montantDistribue / (normalized.type === 'journalier' ? 78 : normalized.type === 'hebdomadaire' ? 84 : 92)))
    const resteCoffre = Math.max(0, Math.round((56000 + index * 8400 - totalAmount * 0.008 * (index + 1)) * 1000) / 1000)

    return {
      terminal_id: terminal.terminal_id,
      nom: terminal.nom,
      montant_distribue: montantDistribue,
      nb_transactions: nbTransactions,
      reste_coffre_dernier: resteCoffre,
      disponibilite: terminal.actif ? 'OPERATIONNEL' : 'INDISPONIBLE',
      alerte_coffre_bas: index === 0 && totalAmount > 1200000,
    }
  })

  const serie_temporelle = buildSeriePoints(normalized.period, totalAmount, normalized.type)
  const serieTotal = serie_temporelle.reduce((sum, item) => sum + Number(item.montant || 0), 0)
  const montantDistribue = Math.round(Math.max(totalAmount, serieTotal) * 1000) / 1000
  const nbTransactions = parTerminal.reduce((sum, item) => sum + Number(item.nb_transactions || 0), 0)
  const nbChargements = normalized.type === 'journalier' ? 4 : normalized.type === 'hebdomadaire' ? 10 : 18
  const nbDechargements = normalized.type === 'journalier' ? 2 : normalized.type === 'hebdomadaire' ? 7 : 12
  const nbAlertes = parTerminal.filter((item) => item.alerte_coffre_bas).length

  const cycles = selectedTerminals.map((terminal, index) => ({
    terminal_id: terminal.terminal_id,
    nom: terminal.nom,
    datetime_dechargement: addDays(new Date(`${normalized.period.from}T00:00:00Z`), Math.min(index * 2, Math.max(0, serie_temporelle.length - 1))).toISOString(),
    montant_charge: Math.round((430000 + index * 85000) * 1000) / 1000,
    montant_distribue: Math.round((260000 + index * 64000) * 1000) / 1000,
  }))

  return {
    periode: {
      type: normalized.type,
      from: normalized.period.from,
      to: normalized.period.to,
      libelle: normalized.period.libelle,
    },
    kpis: {
      montant_total_distribue: montantDistribue,
      nb_transactions_tr: nbTransactions,
      nb_chargements: nbChargements,
      nb_dechargements: nbDechargements,
      terminaux_actifs: activeTerminals.length,
      terminaux_inactifs: inactiveTerminals.length,
      nb_alertes_coffre_bas: nbAlertes,
    },
    par_terminal: parTerminal,
    serie_temporelle,
    cycles,
  }
}

function formatDateForFilename(value) {
  return String(value || '').replace(/-/g, '')
}

function buildReportFilename(report, format) {
  const extension = format === 'excel' ? 'xlsx' : 'pdf'
  const safeType = String(report?.periode?.type || 'rapport').toLowerCase()
  const from = formatDateForFilename(report?.periode?.from)
  const to = formatDateForFilename(report?.periode?.to)
  return `rapport_${safeType}_${from}_${to}.${extension}`
}

function extractFilenameFromContentDisposition(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return ''
  }

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const plainMatch = headerValue.match(/filename="?([^";]+)"?/i)
  return plainMatch?.[1] || ''
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

// Import dynamique : xlsx n'est utile qu'en mode mock (VITE_USE_MOCK), le
// vrai export passe par le backend (openpyxl, voir rapports.py). Charger la
// lib à la demande évite de l'embarquer/exécuter dans le bundle de prod
// (xlsx a une vulnérabilité connue sans correctif — cf. npm audit).
async function buildExcelBlob(report) {
  const XLSX = await import('xlsx')

  const resumeRows = [
    ['Champ', 'Valeur'],
    ['Type de rapport', REPORT_TYPES[report.periode.type] || report.periode.type],
    ['Période', report.periode.libelle],
    ['Du', report.periode.from],
    ['Au', report.periode.to],
    ['Montant total distribué', formatCurrency(report.kpis.montant_total_distribue)],
    ['Nb transactions TR', report.kpis.nb_transactions_tr],
    ['Nb chargements', report.kpis.nb_chargements],
    ['Nb déchargements', report.kpis.nb_dechargements],
    ['Terminaux actifs', report.kpis.terminaux_actifs],
    ['Terminaux inactifs', report.kpis.terminaux_inactifs],
    ['Alertes coffre bas', report.kpis.nb_alertes_coffre_bas],
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(resumeRows), 'Résumé')
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(report.par_terminal.map((terminal) => ({
      Terminal: terminal.terminal_id,
      Nom: terminal.nom,
      'Montant distribué (DT)': terminal.montant_distribue,
      'Nb transactions': terminal.nb_transactions,
      'Reste coffre dernier (DT)': terminal.reste_coffre_dernier,
      Disponibilité: terminal.disponibilite,
      'Alerte coffre bas': terminal.alerte_coffre_bas ? 'Oui' : 'Non',
    })) ),
    'Terminaux',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(report.serie_temporelle.map((item) => ({
      Libellé: item.label,
      'Montant distribué (DT)': item.montant,
    }))),
    'Série',
  )

  if (Array.isArray(report.cycles) && report.cycles.length > 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(report.cycles.map((cycle) => ({
        Terminal: cycle.terminal_id,
        Nom: cycle.nom,
        'Date déchargement': cycle.datetime_dechargement,
        'Montant charge (DT)': cycle.montant_charge,
        'Montant distribué (DT)': cycle.montant_distribue,
      }))),
      'Cycles',
    )
  }

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function buildPdfFallbackBlob(report) {
  const rows = report.par_terminal.map((terminal) => `
    <tr>
      <td>${terminal.nom} (${terminal.terminal_id})</td>
      <td style="text-align:right">${formatCurrency(terminal.montant_distribue)}</td>
      <td style="text-align:right">${terminal.nb_transactions}</td>
      <td style="text-align:right">${formatCurrency(terminal.reste_coffre_dernier)}</td>
      <td>${terminal.disponibilite}</td>
    </tr>
  `).join('')

  const html = `
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Rapport ${report.periode.type}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0d1728; }
          h1, h2, h3 { margin: 0 0 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #d0d7e2; padding: 8px 10px; font-size: 12px; }
          th { background: #eef4ff; text-align: left; }
          .meta { margin-bottom: 16px; font-size: 13px; }
          .muted { color: #4b5b74; }
        </style>
      </head>
      <body>
        <h1>Rapport ${REPORT_TYPES[report.periode.type] || report.periode.type}</h1>
        <div class="meta">Période: ${report.periode.libelle} (${report.periode.from} → ${report.periode.to})</div>
        <div class="meta muted">Montant total distribué: ${formatCurrency(report.kpis.montant_total_distribue)} DT</div>
        <h2>Par terminal</h2>
        <table>
          <thead>
            <tr>
              <th>Terminal</th>
              <th>Montant distribué (DT)</th>
              <th>Nb transactions</th>
              <th>Reste coffre (DT)</th>
              <th>Disponibilité</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `

  return new Blob([html], { type: 'text/html;charset=utf-8' })
}

async function parseAxiosBlobError(error) {
  const data = error?.response?.data

  if (data instanceof Blob) {
    const text = await data.text()
    try {
      const parsed = JSON.parse(text)
      return parsed?.message || parsed?.detail || parsed?.error || error.message
    } catch {
      return text || error.message
    }
  }

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return parsed?.message || parsed?.detail || parsed?.error || error.message
    } catch {
      return data
    }
  }

  return data?.message || data?.detail || error.message
}

function getResponseFilename(response, fallbackFilename) {
  const headerFilename = extractFilenameFromContentDisposition(response?.headers?.['content-disposition'] || response?.headers?.['Content-Disposition'])
  return headerFilename || fallbackFilename
}

export const REPORT_TYPES_OPTIONS = Object.entries(REPORT_TYPES).map(([value, label]) => ({ value, label }))

export function formatReportTypeLabel(type) {
  return REPORT_TYPES[normalizeReportType(type)] || String(type || '')
}

export function formatReportDate(dateValue) {
  if (!dateValue) {
    return '—'
  }

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return String(dateValue)
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatReportDateTime(dateValue) {
  if (!dateValue) {
    return '—'
  }

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return String(dateValue)
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export function formatReportCurrency(value) {
  return `${Number(value || 0).toLocaleString('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} DT`
}

export function getReportDefaultPeriod(type) {
  return getDefaultPeriodValue(type)
}

export function resolveReportPreviewLabel(type, periodValue) {
  return resolveReportPeriod(type, periodValue).libelle
}

export function normalizeReportRequest(params = {}) {
  return normalizeRequestParams(params)
}

export function normalizeReportPreview(response) {
  const payload = response?.data?.data
  if (payload?.periode && payload?.kpis) {
    return payload
  }

  if (response?.data?.data && typeof response.data.data === 'object') {
    return response.data.data
  }

  return response?.data || null
}

export function getRapport(params = {}) {
  if (USE_MOCK) {
    return delay(makeSuccess(buildMockReportData(params), {
      type: normalizeReportRequest(params).type,
      periode: resolveReportPeriod(params.type, params.periodValue || params.period || params.date),
    }))
  }

  const normalized = normalizeReportRequest(params)
  return api.get('/rapports', {
    params: normalized.requestParams,
    paramsSerializer: {
      indexes: null,
    },
  })
}

export async function exportRapport(params = {}, format = 'pdf') {
  const normalized = normalizeReportRequest(params)
  const report = USE_MOCK
    ? buildMockReportData(params)
    : null

  if (USE_MOCK) {
    const blob = format === 'excel' ? await buildExcelBlob(report) : buildPdfFallbackBlob(report)
    const filename = buildReportFilename(report, format)
    downloadBlob(blob, filename)
    return
  }

  try {
    const response = await api.get('/rapports/export', {
      params: {
        ...normalized.requestParams,
        format,
      },
      responseType: 'blob',
      paramsSerializer: {
        indexes: null,
      },
    })

    const contentType = String(response.headers?.['content-type'] || '').toLowerCase()
    const fallbackFilename = buildReportFilename({ periode: normalized.period }, format)
    const filename = getResponseFilename(response, fallbackFilename)
    const blob = response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: contentType || 'application/octet-stream' })

    downloadBlob(blob, filename)
  } catch (error) {
    const message = await parseAxiosBlobError(error)
    throw new Error(message)
  }
}
