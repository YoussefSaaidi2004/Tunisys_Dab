import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
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
import SearchIcon from '@mui/icons-material/Search'

import { fetchDabs } from '../api/endpoints/dabs'
import { exportTransactionsCsv, fetchTransactions, fetchTransactionsDailySummary } from '../api/endpoints/transactions'
import { useAuth } from '../auth/AuthContext'
import AppShell from '../components/layout/AppShell'
import DailyDistributionChart from '../components/charts/DailyDistributionChart'

const DEFAULT_LIMIT = 50

function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10)
}

function createDefaultFilters() {
  const today = getTodayDateValue()
  return {
    atm_id: [],
    date_debut: today,
    date_fin: today,
    montant_min: '',
    montant_max: '',
    reste_coffre_max: '',
    search: '',
    tri_reste_coffre: '',
  }
}

function buildRequestParams(filters, skip, limit) {
  return {
    date_debut: filters.date_debut || undefined,
    date_fin: filters.date_fin || undefined,
    atm_id: filters.atm_id.length === 0 ? undefined : filters.atm_id.map(Number),
    montant_min: filters.montant_min === '' ? undefined : Number(filters.montant_min),
    montant_max: filters.montant_max === '' ? undefined : Number(filters.montant_max),
    reste_coffre_max: filters.reste_coffre_max === '' ? undefined : Number(filters.reste_coffre_max),
    search: filters.search.trim() === '' ? undefined : filters.search.trim(),
    tri_reste_coffre: filters.tri_reste_coffre === '' ? undefined : filters.tri_reste_coffre,
    skip,
    limit,
  }
}

function formatDate(value) {
  if (!value) return ''
  const text = String(value)
  if (text.includes('-')) {
    const [year, month, day] = text.slice(0, 10).split('-')
    return `${day}/${month}/${year}`
  }
  return text
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

async function extractErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') {
    return detail
  }

  const responseData = error.response?.data
  if (responseData instanceof Blob) {
    try {
      const text = await responseData.text()
      if (!text) return fallback

      try {
        const parsed = JSON.parse(text)
        return parsed.detail || parsed.message || text || fallback
      } catch {
        return text || fallback
      }
    } catch {
      return fallback
    }
  }

  return error.message || fallback
}

export default function Transactions() {
  const { user } = useAuth()
  const [filters, setFilters] = useState(() => createDefaultFilters())
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultFilters())
  const [dabs, setDabs] = useState([])
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ total: 0 })
  const [skip, setSkip] = useState(0)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [loading, setLoading] = useState(true)
  const [loadingDabs, setLoadingDabs] = useState(true)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [dailySummary, setDailySummary] = useState([])
  const [loadingSummary, setLoadingSummary] = useState(true)

  const requestParams = useMemo(() => buildRequestParams(appliedFilters, skip, limit), [appliedFilters, skip, limit])
  const summaryParams = useMemo(() => buildRequestParams(appliedFilters, undefined, undefined), [appliedFilters])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')

    fetchTransactions(requestParams)
      .then((response) => {
        if (!mounted) return
        setRows(response.data?.data || [])
        setMeta(response.data?.meta || { total: 0 })
      })
      .catch((err) => {
        if (!mounted) return
        setRows([])
        setMeta({ total: 0 })
        setError(err.response?.data?.detail || err.message || 'Impossible de charger les transactions')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [requestParams])

  useEffect(() => {
    let mounted = true
    setLoadingSummary(true)

    fetchTransactionsDailySummary(summaryParams)
      .then((response) => {
        if (!mounted) return
        setDailySummary(response.data?.data || [])
      })
      .catch(() => {
        if (!mounted) return
        setDailySummary([])
      })
      .finally(() => {
        if (mounted) setLoadingSummary(false)
      })

    return () => {
      mounted = false
    }
  }, [summaryParams])

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
    const value = event.target.value
    setFilters((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleSearch = () => {
    setAppliedFilters(filters)
    setSkip(0)
  }

  const handleReset = () => {
    const nextFilters = createDefaultFilters()
    setFilters(nextFilters)
    setAppliedFilters(nextFilters)
    setSkip(0)
  }

  const handleChangePage = (_event, newPage) => {
    setSkip(newPage * limit)
  }

  const handleChangeRowsPerPage = (event) => {
    setLimit(Number(event.target.value))
    setSkip(0)
  }

  const handleExportCsv = async () => {
    setExportError('')
    setExporting(true)

    try {
      const response = await exportTransactionsCsv(buildRequestParams(appliedFilters, 0, 50000))
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'transactions_export.csv'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url)
      }, 1000)
    } catch (err) {
      setExportError(await extractErrorMessage(err, 'Impossible d’exporter les transactions'))
    } finally {
      setExporting(false)
    }
  }

  const total = meta?.total || 0
  const page = Math.floor(skip / limit)
  const canExport = user?.role !== 'AGENT'

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Transactions
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
          Recherche multi-critères, pagination serveur et export CSV.
        </Typography>
      </Box>

      {error ? <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert> : null}
      {exportError ? <Alert severity="warning" sx={{ mb: 3 }}>{exportError}</Alert> : null}

      <Card sx={{ mb: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Recherche"
                placeholder="N° autorisation monétique, N° carte, nom ou terminal du DAB…"
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
                label="DAB"
                value={filters.atm_id}
                onChange={handleFilterChange('atm_id')}
                SelectProps={{
                  multiple: true,
                  renderValue: (selected) => {
                    if (!selected || selected.length === 0) return 'Tous les DAB'
                    return dabs
                      .filter((dab) => selected.includes(String(dab.id)))
                      .map((dab) => dab.nom)
                      .join(', ')
                  },
                }}
              >
                {loadingDabs ? <MenuItem value="" disabled>Chargement...</MenuItem> : null}
                {dabs.map((dab) => (
                  <MenuItem key={dab.id} value={String(dab.id)}>
                    <Checkbox checked={filters.atm_id.indexOf(String(dab.id)) > -1} size="small" />
                    <ListItemText primary={`${dab.nom} (${dab.terminal_id})`} />
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                type="date"
                label="Date début"
                value={filters.date_debut}
                onChange={handleFilterChange('date_debut')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                type="date"
                label="Date fin"
                value={filters.date_fin}
                onChange={handleFilterChange('date_fin')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                type="number"
                label="Montant min"
                value={filters.montant_min}
                onChange={handleFilterChange('montant_min')}
                inputProps={{ min: 0, step: '0.001' }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                type="number"
                label="Montant max"
                value={filters.montant_max}
                onChange={handleFilterChange('montant_max')}
                inputProps={{ min: 0, step: '0.001' }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                type="number"
                label="Seuil coffre bas"
                value={filters.reste_coffre_max}
                onChange={handleFilterChange('reste_coffre_max')}
                inputProps={{ min: 0, step: '0.001' }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                select
                label="Tri par reste coffre"
                value={filters.tri_reste_coffre}
                onChange={handleFilterChange('tri_reste_coffre')}
              >
                <MenuItem value="">Aucun tri</MenuItem>
                <MenuItem value="asc">Reste coffre croissant</MenuItem>
                <MenuItem value="desc">Reste coffre décroissant</MenuItem>
              </TextField>
            </Grid>
          </Grid>

          <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 2, flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={handleReset}>
              Réinitialiser
            </Button>
            <Button variant="contained" onClick={handleSearch}>
              Rechercher
            </Button>
            {canExport ? (
              <Button variant="outlined" color="inherit" onClick={handleExportCsv} disabled={loading || rows.length === 0 || exporting}>
                Exporter en CSV
              </Button>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Distribution journalière
          </Typography>
          {loadingSummary ? (
            <Skeleton variant="rectangular" height={300} />
          ) : (
            <DailyDistributionChart data={dailySummary} dabs={dabs} />
          )}
        </CardContent>
      </Card>

      <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <TableContainer component={Paper} sx={{ background: 'transparent', boxShadow: 'none', borderRadius: 0, overflowX: 'auto' }}>
          <Table sx={{ minWidth: 1100 }}>
            <TableHead>
              <TableRow>
                <TableCell>Terminal</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Heure</TableCell>
                <TableCell align="right">Montant (DT)</TableCell>
                <TableCell align="right">Reste coffre (DT)</TableCell>
                <TableCell>N° autorisation monétique</TableCell>
                <TableCell>N° carte</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {Array.from({ length: 7 }).map((__unused, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton variant="text" width={cellIndex === 0 ? 220 : 120} />
                    </TableCell>
                  ))}
                </TableRow>
              )) : null}

              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 8, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                      Aucune transaction ne correspond à ces critères
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}

              {!loading && rows.map((row) => {
                const lowCash = Number(row.reste_coffre) < 10000
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {row.atm_nom} ({row.terminal_id})
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(row.date_operation)}</TableCell>
                    <TableCell>{row.heure_operation}</TableCell>
                    <TableCell align="right">{formatAmount(row.montant)}</TableCell>
                    <TableCell align="right" sx={lowCash ? { color: '#ffa726', fontWeight: 600 } : undefined}>
                      {formatAmount(row.reste_coffre)}
                    </TableCell>
                    <TableCell>{row.num_autorisation_monetique}</TableCell>
                    <TableCell>{row.numero_carte || '—'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={limit}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[25, 50, 100, 500]}
        />
      </Card>
    </AppShell>
  )
}