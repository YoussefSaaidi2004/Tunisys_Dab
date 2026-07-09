import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import HighlightOffIcon from '@mui/icons-material/HighlightOff'
import InventoryIcon from '@mui/icons-material/Inventory'
import PaymentsIcon from '@mui/icons-material/Payments'
import ReceiptIcon from '@mui/icons-material/Receipt'
import RefreshIcon from '@mui/icons-material/Refresh'

import { fetchDashboardStatistics } from '../api/endpoints/statistiques'
import AppShell from '../components/layout/AppShell'
import DistributionByTerminalChart from '../components/charts/DistributionByTerminalChart'

const CHART_COLORS = ['#1f7aec', '#66bb6a', '#ffa726', '#ef5350', '#ab47bc', '#26a69a', '#8d6e63', '#42a5f5']

const STATUT_CHIP_COLOR = {
  IMPORTE: 'primary',
  PARSE: 'success',
  VIDE: 'default',
  ERREUR: 'error',
}

const DISPONIBILITE_CHIP = {
  OPERATIONNEL_SANS_TX: { color: 'warning', label: 'Sans activité' },
  INDISPONIBLE: { color: 'error', label: 'Indisponible' },
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

function formatDateShort(isoDate) {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}

function formatDateLong(isoDate) {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function formatDateTime(isoDateTime) {
  const parsed = new Date(isoDateTime)
  if (Number.isNaN(parsed.getTime())) return isoDateTime

  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function buildChartSeries(graphique) {
  const order = []
  const meta = {}

  graphique.forEach((row) => {
    if (!meta[row.terminal_id]) {
      meta[row.terminal_id] = { key: row.terminal_id, name: `${row.nom_terminal} (${row.terminal_id})` }
      order.push(row.terminal_id)
    }
  })

  return order.map((key, index) => ({
    ...meta[key],
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))
}

function buildChartData(graphique) {
  const byDate = new Map()

  graphique.forEach((row) => {
    if (!byDate.has(row.date)) {
      byDate.set(row.date, {
        date: row.date,
        label: formatDateShort(row.date),
        fullDate: formatDateLong(row.date),
      })
    }
    byDate.get(row.date)[row.terminal_id] = row.montant_distribue
  })

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function filterByRange(chartData, rangeDays) {
  const threshold = new Date()
  threshold.setDate(threshold.getDate() - (rangeDays - 1))
  const thresholdIso = threshold.toISOString().slice(0, 10)
  return chartData.filter((row) => row.date >= thresholdIso)
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rangeDays, setRangeDays] = useState(30)

  const loadStatistics = useCallback(() => {
    setLoading(true)
    setError('')

    fetchDashboardStatistics()
      .then((result) => {
        setData(result || null)
      })
      .catch((err) => {
        setData(null)
        setError(err.response?.data?.message || err.response?.data?.detail || err.message || 'Impossible de charger les statistiques')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadStatistics()
  }, [loadStatistics])

  const chartSeries = useMemo(() => buildChartSeries(data?.graphique_distribution || []), [data])
  const chartData = useMemo(() => buildChartData(data?.graphique_distribution || []), [data])
  const filteredChartData = useMemo(() => filterByRange(chartData, rangeDays), [chartData, rangeDays])

  const isEmpty = Boolean(
    data
    && (data.derniers_imports || []).length === 0
    && (data.graphique_distribution || []).length === 0,
  )

  const todayLabel = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const kpis = data?.kpis
  const alertes = data?.alertes_seuil_bas || []
  const derniersImports = data?.derniers_imports || []

  const alerteSeverity = alertes.length > 3 ? 'error' : 'warning'

  return (
    <AppShell>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ mb: 0.5 }}>
            Tableau de bord
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Données du {todayLabel}
          </Typography>
        </Box>
        <IconButton onClick={loadStatistics} disabled={loading} aria-label="Actualiser">
          <RefreshIcon />
        </IconButton>
      </Box>

      {error ? <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert> : null}

      {!loading && !error && isEmpty ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          Aucune donnée disponible — la base ne contient pas encore de transactions importées
        </Alert>
      ) : null}

      {!error && !isEmpty ? (
        <Stack spacing={3}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={2.4}>
              <Card elevation={2}>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Transactions du jour</Typography>
                    <ReceiptIcon fontSize="small" color="action" />
                  </Stack>
                  <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                    {loading ? <Skeleton width={80} /> : (kpis?.nb_transactions_jour ?? 0)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
              <Card elevation={2}>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Montant distribué</Typography>
                    <PaymentsIcon fontSize="small" color="action" />
                  </Stack>
                  <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                    {loading ? <Skeleton width={100} /> : `${formatAmount(kpis?.montant_distribue_jour)} DT`}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
              <Card elevation={2}>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Chargements du jour</Typography>
                    <InventoryIcon fontSize="small" color="action" />
                  </Stack>
                  <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                    {loading ? <Skeleton width={80} /> : (kpis?.nb_chargements_jour ?? 0)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
              <Card elevation={2}>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Terminaux actifs</Typography>
                    <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />
                  </Stack>
                  <Typography variant="h4" sx={{ mt: 1, fontWeight: 700, color: 'success.main' }}>
                    {loading ? <Skeleton width={60} /> : (kpis?.nb_terminaux_actifs ?? 0)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
              <Card elevation={2}>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Terminaux inactifs</Typography>
                    <HighlightOffIcon fontSize="small" sx={{ color: (kpis?.nb_terminaux_inactifs ?? 0) > 0 ? 'error.main' : 'text.disabled' }} />
                  </Stack>
                  <Typography
                    variant="h4"
                    sx={{ mt: 1, fontWeight: 700, color: (kpis?.nb_terminaux_inactifs ?? 0) > 0 ? 'error.main' : 'text.disabled' }}
                  >
                    {loading ? <Skeleton width={60} /> : (kpis?.nb_terminaux_inactifs ?? 0)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h6">Montant distribué par terminal</Typography>
                <ToggleButtonGroup
                  size="small"
                  value={rangeDays}
                  exclusive
                  onChange={(_event, value) => value && setRangeDays(value)}
                >
                  <ToggleButton value={7}>7 jours</ToggleButton>
                  <ToggleButton value={30}>30 jours</ToggleButton>
                </ToggleButtonGroup>
              </Stack>

              {loading ? (
                <Skeleton variant="rounded" height={350} />
              ) : (
                <DistributionByTerminalChart data={filteredChartData} series={chartSeries} />
              )}
            </CardContent>
          </Card>

          {!loading && alertes.length > 0 ? (
            <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  ⚠ Alertes coffre bas
                </Typography>
                <Alert severity={alerteSeverity} sx={{ mb: 2 }}>
                  {alertes.length} terminal{alertes.length > 1 ? 'aux' : ''} sous le seuil d’alerte
                </Alert>
                <List disablePadding>
                  {alertes.map((alerte) => (
                    <ListItem key={alerte.atm_id} divider sx={{ px: 0 }}>
                      <ListItemText
                        primary={`${alerte.nom} (${alerte.terminal_id})`}
                        secondary={`Dernière transaction : ${formatDateTime(alerte.datetime_derniere_transaction)}`}
                      />
                      <Typography sx={{ color: 'error.main', fontWeight: 700 }}>
                        Reste : {formatAmount(alerte.reste_coffre)} DT
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          ) : null}

          <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Derniers imports TX
              </Typography>

              {loading ? <Skeleton variant="rounded" height={160} /> : null}

              {!loading ? (
                <TableContainer component={Paper} sx={{ background: 'transparent', boxShadow: 'none', borderRadius: 0, overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Fichier</TableCell>
                        <TableCell>Terminal</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Statut</TableCell>
                        <TableCell>Disponibilité</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {derniersImports.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ py: 4, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">Aucun import récent</Typography>
                          </TableCell>
                        </TableRow>
                      ) : null}

                      {derniersImports.map((item) => {
                        const disponibiliteChip = DISPONIBILITE_CHIP[item.disponibilite]
                        return (
                          <TableRow key={`${item.nom_fichier}-${item.terminal_id}`}>
                            <TableCell>{item.nom_fichier}</TableCell>
                            <TableCell>{item.terminal_id}</TableCell>
                            <TableCell>{formatDateLong(item.date_fichier)}</TableCell>
                            <TableCell>
                              <Chip size="small" label={item.statut} color={STATUT_CHIP_COLOR[item.statut] || 'default'} />
                            </TableCell>
                            <TableCell>
                              {disponibiliteChip ? (
                                <Chip size="small" label={disponibiliteChip.label} color={disponibiliteChip.color} />
                              ) : null}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : null}
            </CardContent>
          </Card>
        </Stack>
      ) : null}
    </AppShell>
  )
}
