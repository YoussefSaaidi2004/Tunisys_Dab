import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
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

import { fetchCassetteEventDetail, fetchCassetteEvents } from '../../api/endpoints/cassettes'

const DEFAULT_LIMIT = 50

function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10)
}

function getDefaultStartDate() {
  const date = new Date()
  date.setDate(date.getDate() - 6)
  return date.toISOString().slice(0, 10)
}

function createDefaultFilters() {
  return {
    type_evenement: '',
    date_debut: getDefaultStartDate(),
    date_fin: getTodayDateValue(),
  }
}

function buildRequestParams(filters, atmId, skip, limit) {
  return {
    atm_id: Number.isFinite(atmId) && atmId > 0 ? [atmId] : undefined,
    type_evenement: filters.type_evenement || undefined,
    date_debut: filters.date_debut || undefined,
    date_fin: filters.date_fin || undefined,
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

function typeChipSx(typeEvenement) {
  if (typeEvenement === 'CH') {
    return {
      color: '#4caf50',
      borderColor: 'rgba(76,175,80,0.45)',
      backgroundColor: 'rgba(76,175,80,0.12)',
    }
  }

  return {
    color: '#ffa726',
    borderColor: 'rgba(255,167,38,0.45)',
    backgroundColor: 'rgba(255,167,38,0.12)',
  }
}

export default function CassetteEventsPanel({ atmId }) {
  const [filters, setFilters] = useState(() => createDefaultFilters())
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultFilters())
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ total: 0 })
  const [skip, setSkip] = useState(0)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)

  const requestParams = useMemo(() => buildRequestParams(appliedFilters, atmId, skip, limit), [appliedFilters, atmId, skip, limit])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')

    fetchCassetteEvents(requestParams)
      .then((response) => {
        if (!mounted) return
        setRows(response.data?.data || [])
        setMeta(response.data?.meta || { total: 0 })
      })
      .catch((err) => {
        if (!mounted) return
        setRows([])
        setMeta({ total: 0 })
        setError(err.response?.data?.detail || err.message || 'Impossible de charger les événements cassettes')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [requestParams])

  const handleFilterChange = (field) => (event) => {
    setFilters((current) => ({
      ...current,
      [field]: event.target.value,
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

  const handleRowClick = async (row) => {
    setSelectedEvent(row)
    setSelectedDetail(null)
    setDialogError('')
    setDialogOpen(true)
    setDialogLoading(true)

    try {
      const response = await fetchCassetteEventDetail(row.id)
      setSelectedDetail(response.data?.data || null)
    } catch (err) {
      setDialogError(await extractErrorMessage(err, 'Impossible de charger le détail de l’événement'))
    } finally {
      setDialogLoading(false)
    }
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setDialogLoading(false)
    setDialogError('')
    setSelectedEvent(null)
    setSelectedDetail(null)
  }

  const total = meta?.total || 0
  const page = Math.floor(skip / limit)
  const detail = selectedDetail || selectedEvent
  const caisses = detail?.caisses || []

  return (
    <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
      <CardContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Événements cassettes
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>
            Consultation des événements CH/DE du terminal.
          </Typography>
        </Box>

        {error ? <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert> : null}

        <Card sx={{ mb: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  select
                  label="Type"
                  value={filters.type_evenement}
                  onChange={handleFilterChange('type_evenement')}
                >
                  <MenuItem value="">Tous</MenuItem>
                  <MenuItem value="CH">CH</MenuItem>
                  <MenuItem value="DE">DE</MenuItem>
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
              <Button variant="contained" onClick={handleSearch}>
                Rechercher
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <TableContainer component={Paper} sx={{ background: 'transparent', boxShadow: 'none', borderRadius: 0, overflowX: 'auto' }}>
          <Table sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Heure</TableCell>
                <TableCell align="right">Billets rejetés</TableCell>
                <TableCell align="right">Nb cassettes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {Array.from({ length: 5 }).map((__unused, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton variant="text" width={cellIndex === 0 ? 90 : 120} />
                    </TableCell>
                  ))}
                </TableRow>
              )) : null}

              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 8, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                      Aucun événement cassette ne correspond à ces critères
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}

              {!loading && rows.map((row) => (
                <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => handleRowClick(row)}>
                  <TableCell>
                    <Chip
                      label={row.type_evenement}
                      size="small"
                      variant="outlined"
                      sx={typeChipSx(row.type_evenement)}
                    />
                  </TableCell>
                  <TableCell>{formatDate(row.date_evenement)}</TableCell>
                  <TableCell>{row.heure_evenement}</TableCell>
                  <TableCell align="right">{row.billets_rejet}</TableCell>
                  <TableCell align="right">{row.nb_cassettes}</TableCell>
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
          rowsPerPage={limit}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[25, 50, 100, 500]}
        />
      </CardContent>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="md">
        <DialogTitle>
          Détail de l’événement cassette
          {detail ? (
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', mt: 0.5 }}>
              {detail.atm_nom} ({detail.terminal_id}) · {detail.type_evenement} · {formatDate(detail.date_evenement || detail.datetime_evenement)}
            </Typography>
          ) : null}
        </DialogTitle>
        <DialogContent dividers>
          {dialogError ? <Alert severity="warning" sx={{ mb: 2 }}>{dialogError}</Alert> : null}

          {dialogLoading ? <Skeleton variant="rounded" height={220} /> : null}

          {!dialogLoading && caisses.length === 0 && !dialogError ? (
            <Typography variant="body2" color="text.secondary">
              Aucune caisse associée à cet événement.
            </Typography>
          ) : null}

          {!dialogLoading && caisses.length > 0 ? (
            <TableContainer component={Paper} sx={{ background: 'transparent', boxShadow: 'none' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>N° caisse</TableCell>
                    <TableCell>Dénomination</TableCell>
                    <TableCell align="right">Nb billets</TableCell>
                    <TableCell align="right">Montant</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {caisses.map((caisse) => (
                    <TableRow key={caisse.numero_caisse}>
                      <TableCell>{caisse.numero_caisse}</TableCell>
                      <TableCell>{caisse.denomination}</TableCell>
                      <TableCell align="right">{caisse.nb_billets}</TableCell>
                      <TableCell align="right">{formatAmount(caisse.montant)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}