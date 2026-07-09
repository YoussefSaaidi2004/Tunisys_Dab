import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'

import { useAuth } from '../auth/AuthContext'
import AppShell from '../components/layout/AppShell'
import RapportFiltres from '../components/rapports/RapportFiltres'
import RapportPreview from '../components/rapports/RapportPreview'
import { listDabs } from '../services/utilisateursService'
import {
  USE_MOCK,
  exportRapport,
  formatReportTypeLabel,
  getReportDefaultPeriod,
  getRapport,
  normalizeReportPreview,
  resolveReportPreviewLabel,
} from '../services/rapportsService'

const DEFAULT_REPORT_TYPE = 'mensuel'

function normalizeTerminals(items) {
  return (Array.isArray(items) ? items : []).map((terminal) => ({
    ...terminal,
    terminal_id: String(terminal.terminal_id ?? terminal.terminalId ?? terminal.id ?? ''),
  }))
}

export default function Rapports() {
  const { logout } = useAuth()
  const [reportType, setReportType] = useState(DEFAULT_REPORT_TYPE)
  const [periodValue, setPeriodValue] = useState(() => getReportDefaultPeriod(DEFAULT_REPORT_TYPE))
  const [selectedTerminalIds, setSelectedTerminalIds] = useState([])
  const [terminals, setTerminals] = useState([])
  const [terminalsLoading, setTerminalsLoading] = useState(true)
  const [terminalsError, setTerminalsError] = useState('')
  const [report, setReport] = useState(null)
  const [generatedAt, setGeneratedAt] = useState('')
  const [generatedCriteria, setGeneratedCriteria] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [reportError, setReportError] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [exportNote, setExportNote] = useState('')

  const resolvedPreviewLabel = useMemo(() => resolveReportPreviewLabel(reportType, periodValue), [periodValue, reportType])

  const clearDisplayedReport = useCallback(() => {
    setReport(null)
    setGeneratedAt('')
    setGeneratedCriteria(null)
    setReportError('')
    setExportNote('')
  }, [])

  const handleSessionExpired = useCallback(async () => {
    await logout()
    window.location.assign('/login')
  }, [logout])

  const loadTerminals = useCallback(async () => {
    setTerminalsLoading(true)
    setTerminalsError('')

    try {
      const response = await listDabs()
      const payload = response.data?.data ?? response.data ?? []
      setTerminals(normalizeTerminals(payload))
    } catch (error) {
      const status = error.response?.status
      if (status === 401 || status === 403) {
        await handleSessionExpired()
        return
      }

      setTerminals([])
      setTerminalsError(error.response?.data?.message || error.response?.data?.detail || error.message || 'Impossible de charger les terminaux')
    } finally {
      setTerminalsLoading(false)
    }
  }, [handleSessionExpired])

  useEffect(() => {
    void loadTerminals()
  }, [loadTerminals])

  const handleReportTypeChange = useCallback((nextType) => {
    const fallbackPeriod = getReportDefaultPeriod(nextType)
    setReportType(nextType)
    setPeriodValue(fallbackPeriod)
    clearDisplayedReport()
  }, [clearDisplayedReport])

  const handlePeriodValueChange = useCallback((nextValue) => {
    setPeriodValue(nextValue)
    clearDisplayedReport()
  }, [clearDisplayedReport])

  const handleSelectedTerminalIdsChange = useCallback((nextValue) => {
    setSelectedTerminalIds(Array.isArray(nextValue) ? nextValue.map((value) => String(value)) : [])
    clearDisplayedReport()
  }, [clearDisplayedReport])

  const handleGenerate = useCallback(async () => {
    setLoadingReport(true)
    setReportError('')
    setExportNote('')

    try {
      const response = await getRapport({
        type: reportType,
        periodValue,
        terminalIds: selectedTerminalIds,
      })
      const payload = normalizeReportPreview(response)

      if (!payload) {
        throw new Error('Réponse de rapport invalide')
      }

      setReport(payload)
      setGeneratedAt(new Date().toISOString())
      setGeneratedCriteria({
        type: reportType,
        periodValue,
        terminalIds: [...selectedTerminalIds],
      })

      if (USE_MOCK) {
        setExportNote('Export client activé en mode mock. Ce téléchargement n’est pas journalisé côté audit.')
      }
    } catch (error) {
      const status = error.response?.status
      if (status === 401 || status === 403) {
        await handleSessionExpired()
        return
      }

      setReport(null)
      setGeneratedAt('')
      setGeneratedCriteria(null)
      setReportError(error.response?.data?.message || error.response?.data?.detail || error.message || 'Impossible de générer le rapport')
    } finally {
      setLoadingReport(false)
    }
  }, [handleSessionExpired, periodValue, reportType, selectedTerminalIds])

  const handleExport = useCallback(async (format) => {
    if (!generatedCriteria) {
      return
    }

    setExportLoading(true)
    setReportError('')

    try {
      await exportRapport(generatedCriteria, format)
      if (USE_MOCK) {
        setExportNote('Export généré côté client en mode mock. Non journalisé côté audit.')
      }
    } catch (error) {
      const status = error.response?.status
      if (status === 401 || status === 403) {
        await handleSessionExpired()
        return
      }

      setReportError(error.message || 'Impossible de générer le fichier d’export')
    } finally {
      setExportLoading(false)
    }
  }, [generatedCriteria, handleSessionExpired])

  const selectedPreview = report

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>
          Rapports et exports
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
          Consultation, aperçu et export PDF / Excel des agrégations de trésorerie DAB.
        </Typography>
      </Box>

      {terminalsError ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {terminalsError}
        </Alert>
      ) : null}

      <RapportFiltres
        reportType={reportType}
        periodValue={periodValue}
        selectedTerminalIds={selectedTerminalIds}
        terminals={terminals}
        loadingTerminals={terminalsLoading}
        onReportTypeChange={handleReportTypeChange}
        onPeriodValueChange={handlePeriodValueChange}
        onSelectedTerminalIdsChange={handleSelectedTerminalIdsChange}
        onGenerate={handleGenerate}
        generating={loadingReport}
      />

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent>
              <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                Type sélectionné
              </Typography>
              <Typography variant="h5" sx={{ mt: 1, fontWeight: 700 }}>
                {formatReportTypeLabel(reportType)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent>
              <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                Période résolue
              </Typography>
              <Typography variant="h5" sx={{ mt: 1, fontWeight: 700 }}>
                {resolvedPreviewLabel}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent>
              <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                Export
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void handleGenerate()} disabled={loadingReport}>
                  Régénérer
                </Button>
                <Button variant="outlined" onClick={() => void handleExport('pdf')} disabled={!generatedCriteria || loadingReport || exportLoading}>
                  PDF
                </Button>
                <Button variant="contained" onClick={() => void handleExport('excel')} disabled={!generatedCriteria || loadingReport || exportLoading}>
                  Excel
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <RapportPreview
        report={selectedPreview}
        loading={loadingReport}
        error={reportError}
        generatedAt={generatedAt}
        onRetry={handleGenerate}
        onExportPdf={() => void handleExport('pdf')}
        onExportExcel={() => void handleExport('excel')}
        exportLoading={exportLoading}
        exportNote={exportNote}
      />
    </AppShell>
  )
}
