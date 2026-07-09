import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DownloadIcon from '@mui/icons-material/Download'
import PrintIcon from '@mui/icons-material/Print'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import {
  formatReportCurrency,
  formatReportDate,
  formatReportDateTime,
  formatReportTypeLabel,
} from '../../services/rapportsService'

function formatGeneratedAt(value) {
  return value ? formatReportDateTime(value) : formatReportDateTime(new Date().toISOString())
}

function getAvailabilityColor(value) {
  const normalized = String(value || '').toUpperCase()
  if (normalized.includes('OPERATIONNEL') || normalized.includes('OK') || normalized.includes('ACTIF')) {
    return 'success'
  }
  if (normalized.includes('INDISPONIBLE') || normalized.includes('INACTIF')) {
    return 'warning'
  }
  return 'default'
}

function MetricCard({ label, value, loading }) {
  return (
    <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.08)' }}>
      <CardContent>
        <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.62)' }}>
          {label}
        </Typography>
        <Typography variant="h5" sx={{ mt: 1, fontWeight: 700 }}>
          {loading ? <Skeleton width={120} /> : value}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default function RapportPreview({
  report,
  loading,
  error,
  generatedAt,
  onRetry,
  onExportPdf,
  onExportExcel,
  exportLoading,
  exportNote,
}) {
  const hasContent = Boolean(report)
  const serieTemporelle = Array.isArray(report?.serie_temporelle) ? report.serie_temporelle : []
  const parTerminal = Array.isArray(report?.par_terminal) ? report.par_terminal : []
  const cycles = Array.isArray(report?.cycles) ? report.cycles : []
  const periode = report?.periode || null
  const kpis = report?.kpis || {}

  if (loading) {
    return (
      <Stack spacing={3}>
        <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <CardContent>
            <Stack spacing={1}>
              <Skeleton width={240} height={36} />
              <Skeleton width={420} />
              <Skeleton width={180} />
            </Stack>
          </CardContent>
        </Card>
        <Grid container spacing={3}>
          {Array.from({ length: 7 }).map((_, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
              <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.08)' }}>
                <CardContent>
                  <Skeleton width={100} />
                  <Skeleton width={120} height={44} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Stack>
    )
  }

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" startIcon={<AutorenewIcon />} onClick={onRetry}>
            Réessayer
          </Button>
        }
        sx={{ border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {error}
      </Alert>
    )
  }

  if (!hasContent) {
    return (
      <Card sx={{ border: '1px dashed rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.02)' }}>
        <CardContent>
          <Stack spacing={1.5} alignItems="flex-start">
            <Typography variant="h6">Aucun rapport généré</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
              Choisissez un type de rapport, une période et des terminaux, puis lancez la génération pour afficher l’aperçu.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    )
  }

  const kpiCards = [
    { label: 'Montant total distribué', value: formatReportCurrency(kpis.montant_total_distribue) },
    { label: 'Nb transactions TR', value: Number(kpis.nb_transactions_tr || 0).toLocaleString('fr-FR') },
    { label: 'Nb chargements', value: Number(kpis.nb_chargements || 0).toLocaleString('fr-FR') },
    { label: 'Nb déchargements', value: Number(kpis.nb_dechargements || 0).toLocaleString('fr-FR') },
    { label: 'Terminaux actifs', value: Number(kpis.terminaux_actifs || 0).toLocaleString('fr-FR') },
    { label: 'Terminaux inactifs', value: Number(kpis.terminaux_inactifs || 0).toLocaleString('fr-FR') },
    { label: 'Alertes coffre bas', value: Number(kpis.nb_alertes_coffre_bas || 0).toLocaleString('fr-FR') },
  ]

  const chartData = serieTemporelle.map((item) => ({
    label: item.label,
    montant: Number(item.montant || 0),
  }))

  return (
    <Stack spacing={3}>
      <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
              <Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                  <Chip label={formatReportTypeLabel(periode?.type)} color="primary" variant="outlined" />
                  <Chip label={periode?.libelle || 'Période'} variant="outlined" />
                </Stack>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Rapport {periode?.libelle || ''}
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
                  Généré le {formatGeneratedAt(generatedAt)}
                </Typography>
              </Box>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button variant="outlined" color="inherit" startIcon={<DownloadIcon />} onClick={onExportPdf} disabled={exportLoading}>
                  Exporter PDF
                </Button>
                <Button variant="contained" startIcon={<PrintIcon />} onClick={onExportExcel} disabled={exportLoading}>
                  Exporter Excel
                </Button>
              </Stack>
            </Stack>

            {exportNote ? <Alert severity="info">{exportNote}</Alert> : null}
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>
              Période couverte du {formatReportDate(periode?.from)} au {formatReportDate(periode?.to)}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {kpiCards.map((item) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={item.label}>
            <MetricCard label={item.label} value={item.value} loading={loading} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} xl={8}>
          <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Évolution du montant distribué
              </Typography>
              {chartData.length > 0 ? (
                <Box sx={{ width: '100%', height: 340 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                      <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.72)' }} />
                      <YAxis tick={{ fill: 'rgba(255,255,255,0.72)' }} />
                      <Tooltip formatter={(value) => formatReportCurrency(value)} />
                      <Bar dataKey="montant" fill="#1f7aec" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Alert severity="info">Aucune donnée pour cette période</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} xl={4}>
          <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Tableau par terminal
              </Typography>
              {parTerminal.length > 0 ? (
                <Stack spacing={1.5}>
                  {parTerminal.map((terminal) => (
                    <Card key={`${terminal.terminal_id}-${terminal.nom}`} sx={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                      <CardContent sx={{ py: 1.8 }}>
                        <Stack spacing={1}>
                          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                            <Box>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                {terminal.nom}
                              </Typography>
                              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>
                                {terminal.terminal_id}
                              </Typography>
                            </Box>
                            {terminal.alerte_coffre_bas ? <Chip label="Alerte coffre bas" color="warning" size="small" /> : null}
                          </Stack>
                          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                            <Typography variant="body2">Distribué: {formatReportCurrency(terminal.montant_distribue)}</Typography>
                            <Typography variant="body2">TR: {Number(terminal.nb_transactions || 0).toLocaleString('fr-FR')}</Typography>
                            <Typography variant="body2">Reste coffre: {formatReportCurrency(terminal.reste_coffre_dernier)}</Typography>
                          </Stack>
                          <Chip label={terminal.disponibilite || '—'} color={getAvailabilityColor(terminal.disponibilite)} size="small" sx={{ alignSelf: 'flex-start' }} />
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Alert severity="info">Aucun terminal dans le périmètre sélectionné.</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Accordion sx={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Cycles de trésorerie</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {cycles.length > 0 ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Terminal</TableCell>
                  <TableCell>Date déchargement</TableCell>
                  <TableCell align="right">Montant charge</TableCell>
                  <TableCell align="right">Montant distribué</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cycles.map((cycle) => (
                  <TableRow key={`${cycle.terminal_id}-${cycle.datetime_dechargement}`}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {cycle.nom || cycle.terminal_id}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                        {cycle.terminal_id}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatReportDateTime(cycle.datetime_dechargement)}</TableCell>
                    <TableCell align="right">{formatReportCurrency(cycle.montant_charge)}</TableCell>
                    <TableCell align="right">{formatReportCurrency(cycle.montant_distribue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Alert severity="info">Aucun cycle de trésorerie disponible sur cette période.</Alert>
          )}
        </AccordionDetails>
      </Accordion>
    </Stack>
  )
}
