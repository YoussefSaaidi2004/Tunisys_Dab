import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import VisibilityIcon from '@mui/icons-material/Visibility'

import { useAuth } from '../auth/AuthContext'
import AppShell from '../components/layout/AppShell'
import AuditDetailDialog from '../components/audit/AuditDetailDialog'
import { formatAuditDateOnly, getAuditFiltres, listAudit } from '../services/auditService'

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50]
const RESULT_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'SUCCES', label: 'Succès' },
  { value: 'ECHEC', label: 'Échec' },
]

function formatDateTime(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
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

function formatActionLabel(action) {
  if (!action) {
    return '—'
  }

  const labels = {
    LOGIN: 'Connexion',
    IMPORT_TX: 'Import TX',
    EXPORT_RAPPORT: 'Export rapport',
    MODIF_ATM: 'Modification ATM',
    CREATION_USER: 'Création utilisateur',
    MODIF_USER: 'Modification utilisateur',
    SUPPRESSION_USER: 'Suppression utilisateur',
    COLLECTE_MANUELLE: 'Collecte manuelle',
  }

  return labels[action] || String(action).replace(/_/g, ' ')
}

function getActionChipColor(action) {
  const normalized = String(action || '').toUpperCase()
  if (normalized === 'LOGIN') return 'default'
  if (normalized.includes('IMPORT') || normalized.includes('EXPORT')) return 'primary'
  if (normalized.includes('SUPPRESSION')) return 'error'
  if (normalized.includes('MODIF') || normalized.includes('CREATION')) return 'warning'
  return 'default'
}

function getResultChipColor(resultat) {
  return String(resultat || '').toUpperCase() === 'ECHEC' ? 'error' : 'success'
}

function getDefaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 6)

  return {
    dateFrom: formatAuditDateOnly(from),
    dateTo: formatAuditDateOnly(to),
  }
}

export default function JournalAudit() {
  const { logout } = useAuth()
  const defaults = useMemo(() => getDefaultRange(), [])
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[1])
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom)
  const [dateTo, setDateTo] = useState(defaults.dateTo)
  const [utilisateurId, setUtilisateurId] = useState('')
  const [utilisateurSearch, setUtilisateurSearch] = useState('')
  const [action, setAction] = useState('')
  const [resultat, setResultat] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtersLoading, setFiltersLoading] = useState(true)
  const [filtersError, setFiltersError] = useState('')
  const [users, setUsers] = useState([])
  const [actions, setActions] = useState([])
  const [userFilterMode, setUserFilterMode] = useState('select')
  const [selectedEntry, setSelectedEntry] = useState(null)

  const handleSessionExpired = useCallback(async () => {
    await logout()
  }, [logout])

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true)
    setFiltersError('')

    try {
      const response = await getAuditFiltres()
      const payload = response.data?.data || {}
      const nextUsers = Array.isArray(payload.utilisateurs) ? payload.utilisateurs : []
      const nextActions = Array.isArray(payload.actions) ? payload.actions : []

      setUsers(nextUsers)
      setActions(nextActions)
      setUserFilterMode(nextUsers.length > 0 ? 'select' : 'search')
    } catch (err) {
      const status = err.response?.status
      if (status === 401 || status === 403) {
        await handleSessionExpired()
        window.location.assign('/login')
        return
      }

      setUsers([])
      setActions([])
      setUserFilterMode('search')
      setFiltersError(err.response?.data?.message || err.response?.data?.detail || err.message || 'Impossible de charger les filtres')
    } finally {
      setFiltersLoading(false)
    }
  }, [handleSessionExpired])

  const pageParams = useMemo(
    () => ({
      page: page + 1,
      page_size: rowsPerPage,
      date_debut: dateFrom,
      date_fin: dateTo,
      utilisateur_id: utilisateurId,
      utilisateur_search: utilisateurSearch,
      action,
      resultat,
    }),
    [action, dateFrom, dateTo, page, resultat, rowsPerPage, utilisateurId, utilisateurSearch],
  )

  const loadAudit = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await listAudit(pageParams)
      const payload = response.data?.data || {}
      const nextItems = Array.isArray(payload.items) ? payload.items : []
      const nextTotal = Number(payload.total ?? response.data?.meta?.total ?? nextItems.length)

      setItems(nextItems)
      setTotal(nextTotal)
    } catch (err) {
      const status = err.response?.status
      if (status === 401 || status === 403) {
        await handleSessionExpired()
        window.location.assign('/login')
        return
      }

      setError(err.response?.data?.message || err.response?.data?.detail || err.message || 'Impossible de charger le journal d’audit')
    } finally {
      setLoading(false)
    }
  }, [handleSessionExpired, pageParams])

  useEffect(() => {
    void loadFilters()
  }, [loadFilters])

  useEffect(() => {
    void loadAudit()
  }, [loadAudit])

  const handleReset = () => {
    const range = getDefaultRange()
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
    setUtilisateurId('')
    setUtilisateurSearch('')
    setAction('')
    setResultat('')
    setPage(0)
  }

  const handleChangePage = (_event, nextPage) => {
    setPage(nextPage)
  }

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(Number(event.target.value))
    setPage(0)
  }

  const openDetails = (entry) => {
    setSelectedEntry(entry)
  }

  const closeDetails = () => {
    setSelectedEntry(null)
  }

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Journal d’audit
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
          Consultation de l’historique des actions sensibles, en lecture seule.
        </Typography>
      </Box>

      <Card sx={{ mb: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between">
              <Grid container spacing={2} sx={{ flex: 1 }}>
                <Grid item xs={12} md={6} lg={3}>
                  <TextField
                    label="Du"
                    type="date"
                    value={dateFrom}
                    onChange={(event) => {
                      setDateFrom(event.target.value)
                      setPage(0)
                    }}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} md={6} lg={3}>
                  <TextField
                    label="Au"
                    type="date"
                    value={dateTo}
                    onChange={(event) => {
                      setDateTo(event.target.value)
                      setPage(0)
                    }}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>

                <Grid item xs={12} md={6} lg={3}>
                  {userFilterMode === 'select' ? (
                    <FormControl size="small" fullWidth>
                      <InputLabel id="audit-user-filter-label">Utilisateur</InputLabel>
                      <Select
                        labelId="audit-user-filter-label"
                        label="Utilisateur"
                        value={utilisateurId}
                        onChange={(event) => {
                          setUtilisateurId(event.target.value)
                          setPage(0)
                        }}
                        disabled={filtersLoading}
                      >
                        <MenuItem value="">Tous</MenuItem>
                        {users.map((user) => (
                          <MenuItem key={user.id} value={user.id}>
                            {user.nom || user.login}
                            {user.login ? ` (${user.login})` : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <TextField
                      label="Utilisateur"
                      value={utilisateurSearch}
                      onChange={(event) => {
                        setUtilisateurSearch(event.target.value)
                        setPage(0)
                      }}
                      placeholder="Login ou nom"
                      fullWidth
                      size="small"
                    />
                  )}
                </Grid>

                <Grid item xs={12} md={6} lg={3}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="audit-action-filter-label">Type d’action</InputLabel>
                    <Select
                      labelId="audit-action-filter-label"
                      label="Type d’action"
                      value={action}
                      onChange={(event) => {
                        setAction(event.target.value)
                        setPage(0)
                      }}
                      disabled={filtersLoading}
                    >
                      <MenuItem value="">Tous</MenuItem>
                      {(actions.length > 0 ? actions : ['LOGIN', 'IMPORT_TX', 'EXPORT_RAPPORT', 'MODIF_ATM', 'CREATION_USER', 'MODIF_USER', 'SUPPRESSION_USER', 'COLLECTE_MANUELLE']).map((item) => (
                        <MenuItem key={item} value={item}>
                          {formatActionLabel(item)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6} lg={3}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="audit-result-filter-label">Résultat</InputLabel>
                    <Select
                      labelId="audit-result-filter-label"
                      label="Résultat"
                      value={resultat}
                      onChange={(event) => {
                        setResultat(event.target.value)
                        setPage(0)
                      }}
                    >
                      {RESULT_OPTIONS.map((option) => (
                        <MenuItem key={option.value || 'all'} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void loadAudit()} disabled={loading}>
                  Rafraîchir
                </Button>
                <Button variant="outlined" onClick={handleReset} disabled={loading}>
                  Réinitialiser les filtres
                </Button>
              </Stack>
            </Stack>

            {userFilterMode === 'search' && !filtersLoading ? (
              <Alert severity="info">Le backend n’expose pas encore la liste des utilisateurs d’audit. Le filtre utilisateur passe donc en recherche texte.</Alert>
            ) : null}

            {filtersError ? <Alert severity="info">{filtersError}</Alert> : null}
          </Stack>
        </CardContent>
      </Card>

      {error ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void loadAudit()}>Réessayer</Button>} sx={{ mb: 3 }}>
          {error}
        </Alert>
      ) : null}

      <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ p: 3, display: 'grid', placeItems: 'center', minHeight: 260 }}>
              <CircularProgress />
            </Box>
          ) : null}

          {!loading && items.length === 0 && !error ? (
            <Box sx={{ py: 7, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Aucune entrée pour ces critères
              </Typography>
              <Typography color="text.secondary">Ajustez la période ou les filtres pour élargir la recherche.</Typography>
            </Box>
          ) : null}

          {!loading && items.length > 0 ? (
            <Box sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Horodatage</TableCell>
                    <TableCell>Utilisateur</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Ressource</TableCell>
                    <TableCell>Résultat</TableCell>
                    <TableCell>Adresse IP</TableCell>
                    <TableCell>Détail</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((entry) => {
                    const hasDetails = entry.details !== null && entry.details !== undefined

                    return (
                      <TableRow key={entry.id} hover>
                        <TableCell>{formatDateTime(entry.horodatage)}</TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2">{entry.utilisateur_nom || '—'}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                              {entry.utilisateur_login ? `@${entry.utilisateur_login}` : 'Login indisponible'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" color={getActionChipColor(entry.action)} label={formatActionLabel(entry.action)} variant="outlined" />
                        </TableCell>
                        <TableCell>
                          {entry.ressource ? (
                            <Tooltip title={entry.ressource} arrow>
                              <Typography variant="body2" sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.ressource}
                              </Typography>
                            </Tooltip>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip size="small" color={getResultChipColor(entry.resultat)} label={entry.resultat === 'ECHEC' ? 'Échec' : 'Succès'} />
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{entry.adresse_ip || '—'}</TableCell>
                        <TableCell>
                          <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => openDetails(entry)} disabled={!hasDetails}>
                            Voir
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>
          ) : null}

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </CardContent>
      </Card>

      <AuditDetailDialog open={Boolean(selectedEntry)} auditEntry={selectedEntry} onClose={closeDetails} />
    </AppShell>
  )
}