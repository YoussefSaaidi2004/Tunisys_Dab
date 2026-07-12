import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Grid,
  ListItemText,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import SearchIcon from '@mui/icons-material/Search'

import { fetchDabs } from '../api/endpoints/dabs'
import { exportReapprovisionnementsCsv, fetchReapprovisionnements } from '../api/endpoints/cycles'
import { useAuth } from '../auth/AuthContext'
import AppShell from '../components/layout/AppShell'

const DEFAULT_PAGE_SIZE = 100
const COLUMN_COUNT = 6

function createDefaultFilters() {
  return {
    terminal_id: [],
    date_from: '',
    date_to: '',
    statut: '',
    search: '',
  }
}

function buildRequestParams(filters, page, pageSize) {
  return {
    terminal_id: filters.terminal_id.length === 0 ? undefined : filters.terminal_id,
    date_from: filters.date_from || undefined,
    date_to: filters.date_to || undefined,
    statut: filters.statut || undefined,
    search: filters.search.trim() === '' ? undefined : filters.search.trim(),
    sort: '-date_reappro',
    page,
    page_size: pageSize,
  }
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
}

function formatAmount(value) {
  if (value === null || value === undefined) return '—'
  return Number(value).toLocaleString('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

async function extractErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  return error.message || fallback
}

export default function Reapprovisionnements() {
  const { user } = useAuth()
  // Pattern du projet : vérification de rôle inline (pas de module RBAC
  // centralisé dans ce repo). Export réservé à ADMIN/SUPERVISOR/AUDITOR (DR2).
  const canExport = user?.role !== 'AGENT'

  const [filters, setFilters] = useState(() => createDefaultFilters())
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultFilters())
  const [dabs, setDabs] = useState([])
  const [loadingDabs, setLoadingDabs] = useState(true)
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ total: 0 })
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const requestParams = useMemo(
    () => buildRequestParams(appliedFilters, page + 1, pageSize),
    [appliedFilters, page, pageSize],
  )

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')

    fetchReapprovisionnements(requestParams)
      .then((response) => {
        if (!mounted) return
        setRows(response.data?.data || [])
        setMeta(response.data?.meta || { total: 0 })
      })
      .catch((err) => {
        if (!mounted) return
        setRows([])
        setMeta({ total: 0 })
        setError(err.response?.data?.detail || err.message || 'Impossible de charger les réapprovisionnements')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [requestParams, refreshKey])

  useEffect(() => {
    let mounted = true

    fetchDabs()
      .then((response) => {
        if (!mounted) return
        setDabs(response.data?.data || [])
      })
      .catch(() => {
        if (!mounted) return
        setDabs([])
      })
      .finally(() => {
        if (mounted) setLoadingDabs(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const handleFilterChange = (field) => (event) => {
    setFilters((current) => ({ ...current, [field]: event.target.value }))
  }

  const handleSearch = () => {
    setAppliedFilters(filters)
    setPage(0)
  }

  const handleReset = () => {
    const next = createDefaultFilters()
    setFilters(next)
    setAppliedFilters(next)
    setPage(0)
  }

  const handleRefresh = () => setRefreshKey((key) => key + 1)

  const handleChangePage = (_event, newPage) => setPage(newPage)

  const handleChangeRowsPerPage = (event) => {
    setPageSize(Number(event.target.value))
    setPage(0)
  }

  const handleExportCsv = async () => {
    setExportError('')
    setExporting(true)

    try {
      const response = await exportReapprovisionnementsCsv(buildRequestParams(appliedFilters, undefined, undefined))
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'reapprovisionnements_export.csv'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url)
      }, 1000)
    } catch (err) {
      setExportError(await extractErrorMessage(err, "Impossible d'exporter les réapprovisionnements"))
    } finally {
      setExporting(false)
    }
  }

  const total = meta?.total || 0

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Réapprovisionnements
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
          Journal des réapprovisionnements par DAB — recherche, filtres et export.
        </Typography>
      </Box>

      {error ? (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={handleRefresh}>
              Réessayer
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}
      {exportError ? <Alert severity="warning" sx={{ mb: 3 }}>{exportError}</Alert> : null}

      <Card sx={{ mb: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Recherche"
                placeholder="Nom ou localisation du DAB…"
                value={filters.search}
                onChange={handleFilterChange('search')}
                InputProps={{
                  startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'rgba(255,255,255,0.5)' }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                select
                label="Terminal"
                value={filters.terminal_id}
                onChange={handleFilterChange('terminal_id')}
                SelectProps={{
                  multiple: true,
                  renderValue: (selected) => {
                    if (!selected || selected.length === 0) return 'Tous les terminaux'
                    return dabs
                      .filter((dab) => selected.includes(dab.terminal_id))
                      .map((dab) => dab.nom)
                      .join(', ')
                  },
                }}
              >
                {loadingDabs ? <MenuItem value="" disabled>Chargement...</MenuItem> : null}
                {dabs.map((dab) => (
                  <MenuItem key={dab.id} value={dab.terminal_id}>
                    <Checkbox checked={filters.terminal_id.indexOf(dab.terminal_id) > -1} size="small" />
                    <ListItemText primary={`${dab.nom} (${dab.terminal_id})`} />
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                type="date"
                label="Date de"
                value={filters.date_from}
                onChange={handleFilterChange('date_from')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                type="date"
                label="Date à"
                value={filters.date_to}
                onChange={handleFilterChange('date_to')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField fullWidth select label="Statut" value={filters.statut} onChange={handleFilterChange('statut')}>
                <MenuItem value="">Tous les statuts</MenuItem>
                <MenuItem value="IN_SERVICE">In Service</MenuItem>
                <MenuItem value="OUT_OF_SERVICE">Out Of Service</MenuItem>
              </TextField>
            </Grid>
          </Grid>

          <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 2, flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={handleReset}>
              Réinitialiser
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<RefreshIcon />} onClick={handleRefresh}>
              Rafraîchir
            </Button>
            <Button variant="contained" onClick={handleSearch}>
              Rechercher
            </Button>
            {canExport ? (
              <Button
                variant="outlined"
                color="inherit"
                onClick={handleExportCsv}
                disabled={loading || rows.length === 0 || exporting}
              >
                Exporter CSV
              </Button>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <TableContainer component={Paper} sx={{ background: 'transparent', boxShadow: 'none', borderRadius: 0, overflowX: 'auto' }}>
          <Table sx={{ minWidth: 1100 }}>
            <TableHead>
              <TableRow>
                <TableCell>Terminal</TableCell>
                <TableCell>Localisation</TableCell>
                <TableCell>Date réappro</TableCell>
                <TableCell align="right">Montant avant réappro (DT)</TableCell>
                <TableCell align="right">Montant réapprovisionné (DT)</TableCell>
                <TableCell>Statut</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      {Array.from({ length: COLUMN_COUNT }).map((__unused, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton variant="text" width={cellIndex === 0 ? 220 : 120} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : null}

              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} sx={{ py: 8, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                      Aucun réapprovisionnement ne correspond à ces critères
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}

              {!loading &&
                rows.map((row) => (
                  <TableRow key={row.cycle_id} hover>
                    <TableCell>
                      <Typography variant="body2">{row.atm_nom}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.terminal_id}
                      </Typography>
                    </TableCell>
                    <TableCell>{row.localisation || '—'}</TableCell>
                    <TableCell>{formatDateTime(row.date_reappro)}</TableCell>
                    <TableCell align="right">{formatAmount(row.montant_avant_reappro)}</TableCell>
                    <TableCell align="right">{formatAmount(row.montant_reapprovisionne)}</TableCell>
                    <TableCell>
                      <Chip
                        label={row.statut === 'IN_SERVICE' ? 'In Service' : 'Out Of Service'}
                        size="small"
                        color={row.statut === 'IN_SERVICE' ? 'success' : 'error'}
                        variant={row.statut === 'IN_SERVICE' ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={pageSize}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[50, 100, 200]}
          labelDisplayedRows={({ from, to, count }) =>
            `Affichage ${from} à ${to} sur ${count !== -1 ? count : `plus de ${to}`} lignes`
          }
        />
      </Card>
    </AppShell>
  )
}
