import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
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
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { fetchDabs } from '../api/endpoints/dabs'
import { exportDabCyclesCsv, fetchDabCycles } from '../api/endpoints/cycles'
import { useAuth } from '../auth/AuthContext'
import AppShell from '../components/layout/AppShell'
import CycleDetailPanel from '../components/cycles/CycleDetailPanel'

const DEFAULT_PAGE_SIZE = 20
const TABLE_COLUMN_COUNT = 8

function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10)
}

function getDefaultStartDate() {
  const date = new Date()
  date.setDate(date.getDate() - 29)
  return date.toISOString().slice(0, 10)
}

function createDefaultFilters() {
  return {
    date_debut: getDefaultStartDate(),
    date_fin: getTodayDateValue(),
  }
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
}

function formatChartLabel(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
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

export default function Cycles() {
  const { user } = useAuth()
  const [dabs, setDabs] = useState([])
  const [loadingDabs, setLoadingDabs] = useState(true)
  const [selectedAtmId, setSelectedAtmId] = useState('')
  const [filters, setFilters] = useState(() => createDefaultFilters())
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultFilters())
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ total: 0 })
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [expandedCycleId, setExpandedCycleId] = useState(null)

  const canExport = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR' || user?.role === 'AUDITOR'

  useEffect(() => {
    let mounted = true

    fetchDabs()
      .then((response) => {
        if (!mounted) return
        const list = response.data?.data || []
        setDabs(list)
        if (list.length > 0) {
          setSelectedAtmId((current) => current || String(list[0].id))
        }
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

  const requestParams = useMemo(
    () => ({
      date_debut: appliedFilters.date_debut || undefined,
      date_fin: appliedFilters.date_fin || undefined,
      page: pageIndex + 1,
      page_size: pageSize,
    }),
    [appliedFilters, pageIndex, pageSize],
  )

  useEffect(() => {
    if (!selectedAtmId) {
      setRows([])
      setMeta({ total: 0 })
      return
    }

    let mounted = true
    setLoading(true)
    setError('')

    fetchDabCycles(selectedAtmId, requestParams)
      .then((response) => {
        if (!mounted) return
        setRows(response.data?.data || [])
        setMeta(response.data?.meta || { total: 0 })
      })
      .catch((err) => {
        if (!mounted) return
        setRows([])
        setMeta({ total: 0 })
        setError(err.response?.data?.detail || err.message || 'Impossible de charger les cycles de trésorerie')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [selectedAtmId, requestParams])

  const handleFilterChange = (field) => (event) => {
    setFilters((current) => ({
      ...current,
      [field]: event.target.value,
    }))
  }

  const handleApply = () => {
    setAppliedFilters(filters)
    setPageIndex(0)
  }

  const handleReset = () => {
    const nextFilters = createDefaultFilters()
    setFilters(nextFilters)
    setAppliedFilters(nextFilters)
    setPageIndex(0)
  }

  const handleChangeDab = (event) => {
    setSelectedAtmId(event.target.value)
    setPageIndex(0)
    setExpandedCycleId(null)
  }

  const handleChangePage = (_event, newPage) => {
    setPageIndex(newPage)
    setExpandedCycleId(null)
  }

  const handleChangeRowsPerPage = (event) => {
    setPageSize(Number(event.target.value))
    setPageIndex(0)
  }

  const handleToggleDetail = (cycleId) => {
    setExpandedCycleId((current) => (current === cycleId ? null : cycleId))
  }

  const handleExportCsv = async () => {
    if (!selectedAtmId) return

    setExportError('')
    setExporting(true)

    try {
      const response = await exportDabCyclesCsv(selectedAtmId, {
        date_debut: appliedFilters.date_debut || undefined,
        date_fin: appliedFilters.date_fin || undefined,
      })
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'cycles_tresorerie_export.csv'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url)
      }, 1000)
    } catch (err) {
      setExportError(await extractErrorMessage(err, 'Impossible d’exporter les cycles'))
    } finally {
      setExporting(false)
    }
  }

  const total = meta?.total || 0
  const chartData = rows.map((row) => ({
    label: formatChartLabel(row.datetime_dechargement),
    montant: row.montant_distribue || 0,
  }))

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Cycles de trésorerie
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
          Suivi des cycles déchargement / chargement et ventilation par cassette.
        </Typography>
      </Box>

      {error ? <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert> : null}
      {exportError ? <Alert severity="warning" sx={{ mb: 3 }}>{exportError}</Alert> : null}

      <Card sx={{ mb: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                select
                label="DAB"
                value={selectedAtmId}
                onChange={handleChangeDab}
              >
                {loadingDabs ? <MenuItem value="" disabled>Chargement...</MenuItem> : null}
                {!loadingDabs && dabs.length === 0 ? <MenuItem value="" disabled>Aucun terminal disponible</MenuItem> : null}
                {dabs.map((dab) => (
                  <MenuItem key={dab.id} value={String(dab.id)}>
                    {dab.nom} ({dab.terminal_id})
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
          </Grid>

          <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 2, flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={handleReset}>
              Réinitialiser
            </Button>
            <Button variant="contained" onClick={handleApply}>
              Appliquer
            </Button>
            {canExport ? (
              <Button
                variant="outlined"
                color="inherit"
                onClick={handleExportCsv}
                disabled={!selectedAtmId || loading || rows.length === 0 || exporting}
              >
                Exporter en CSV
              </Button>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Montant distribué par cycle
          </Typography>
          <Box sx={{ width: '100%', height: 300 }}>
            {chartData.length === 0 ? (
              <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Aucune donnée à afficher sur la période
                </Typography>
              </Box>
            ) : (
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`${formatAmount(value)} DT`, 'Montant distribué']} />
                  <Bar dataKey="montant" fill="#1f7aec" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <TableContainer component={Paper} sx={{ background: 'transparent', boxShadow: 'none', borderRadius: 0, overflowX: 'auto' }}>
          <Table sx={{ minWidth: 1100 }}>
            <TableHead>
              <TableRow>
                <TableCell>Terminal</TableCell>
                <TableCell>Déchargement (DE)</TableCell>
                <TableCell>Chargement (CH)</TableCell>
                <TableCell align="right">Montant chargé (DT)</TableCell>
                <TableCell align="right">Restant avant DE (DT)</TableCell>
                <TableCell align="right">Montant distribué (DT)</TableCell>
                <TableCell align="center">Billets rejetés</TableCell>
                <TableCell align="center">Détail</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {Array.from({ length: TABLE_COLUMN_COUNT }).map((__unused, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton variant="text" width={cellIndex === 0 ? 180 : 100} />
                    </TableCell>
                  ))}
                </TableRow>
              )) : null}

              {!loading && !selectedAtmId ? (
                <TableRow>
                  <TableCell colSpan={TABLE_COLUMN_COUNT} sx={{ py: 8, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                      Sélectionnez un terminal pour afficher ses cycles
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}

              {!loading && selectedAtmId && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={TABLE_COLUMN_COUNT} sx={{ py: 8, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                      Aucun cycle sur la période
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}

              {!loading && rows.map((row) => {
                const isExpanded = expandedCycleId === row.id
                return (
                  <Fragment key={row.id}>
                    <TableRow hover>
                      <TableCell>{row.nom_dab} ({row.terminal_id})</TableCell>
                      <TableCell>{formatDateTime(row.datetime_dechargement)}</TableCell>
                      <TableCell>{formatDateTime(row.datetime_chargement)}</TableCell>
                      <TableCell align="right">{formatAmount(row.montant_charge)}</TableCell>
                      <TableCell align="right">{formatAmount(row.montant_restant_avant_de)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{formatAmount(row.montant_distribue)}</TableCell>
                      <TableCell align="center">{row.nb_billets_rejet}</TableCell>
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => handleToggleDetail(row.id)} aria-label="Voir le détail du cycle">
                          {isExpanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    <CycleDetailPanel cycleId={row.id} open={isExpanded} colSpan={TABLE_COLUMN_COUNT} />
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={pageIndex}
          onPageChange={handleChangePage}
          rowsPerPage={pageSize}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
        />
      </Card>
    </AppShell>
  )
}
