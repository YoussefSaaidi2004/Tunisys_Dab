import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'

import { REPORT_TYPES_OPTIONS, resolveReportPreviewLabel } from '../../services/rapportsService'

function formatTerminalLabel(terminal) {
  const terminalId = terminal?.terminal_id || terminal?.terminalId || terminal?.id || ''
  const label = terminal?.nom || terminal?.name || terminalId
  return terminalId ? `${label} (${terminalId})` : label
}

export default function RapportFiltres({
  reportType,
  periodValue,
  selectedTerminalIds,
  terminals,
  loadingTerminals,
  onReportTypeChange,
  onPeriodValueChange,
  onSelectedTerminalIdsChange,
  onGenerate,
  generating,
}) {
  const periodInputType = reportType === 'mensuel' ? 'month' : 'date'
  const resolvedLabel = resolveReportPreviewLabel(reportType, periodValue)
  const selectedTerminalLabels = terminals
    .filter((terminal) => selectedTerminalIds.includes(String(terminal.terminal_id || terminal.id)))
    .map(formatTerminalLabel)

  return (
    <Alert severity="info" variant="outlined" sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.12)' }}>
      <Stack spacing={2}>
        <Stack spacing={0.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Paramètres du rapport
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)' }}>
            Choisissez le type, la période et les terminaux avant de générer l’aperçu.
          </Typography>
        </Stack>

        <Grid container spacing={2} alignItems="stretch">
          <Grid item xs={12} md={6} lg={3}>
            <Stack spacing={1}>
              <Typography variant="caption" sx={{ letterSpacing: 1.5, color: 'rgba(255,255,255,0.58)' }}>
                Type de rapport
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                color="primary"
                value={reportType}
                onChange={(_event, nextValue) => {
                  if (nextValue) {
                    onReportTypeChange(nextValue)
                  }
                }}
                sx={{
                  '& .MuiToggleButton-root': {
                    borderColor: 'rgba(255,255,255,0.12)',
                    color: 'text.primary',
                  },
                }}
              >
                {REPORT_TYPES_OPTIONS.map((option) => (
                  <ToggleButton key={option.value} value={option.value} sx={{ textTransform: 'none' }}>
                    {option.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
          </Grid>

          <Grid item xs={12} md={6} lg={3}>
            <Stack spacing={1}>
              <Typography variant="caption" sx={{ letterSpacing: 1.5, color: 'rgba(255,255,255,0.58)' }}>
                Période
              </Typography>
              <TextField
                type={periodInputType}
                size="small"
                fullWidth
                label={reportType === 'mensuel' ? 'Mois' : 'Date de début'}
                value={periodValue}
                onChange={(event) => onPeriodValueChange(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <FormHelperText sx={{ m: 0, color: 'rgba(255,255,255,0.72)' }}>
                Période résolue: {resolvedLabel}
              </FormHelperText>
            </Stack>
          </Grid>

          <Grid item xs={12} md={12} lg={4}>
            <Stack spacing={1}>
              <Typography variant="caption" sx={{ letterSpacing: 1.5, color: 'rgba(255,255,255,0.58)' }}>
                Terminaux
              </Typography>
              <FormControl size="small" fullWidth>
                <InputLabel id="rapport-terminal-filter-label">Terminaux</InputLabel>
                <Select
                  labelId="rapport-terminal-filter-label"
                  multiple
                  label="Terminaux"
                  value={selectedTerminalIds}
                  onChange={(event) => {
                    const value = event.target.value
                    onSelectedTerminalIdsChange(typeof value === 'string' ? value.split(',') : value)
                  }}
                  disabled={loadingTerminals}
                  renderValue={(value) => {
                    if (!value || value.length === 0) {
                      return 'Tous les terminaux'
                    }

                    return selectedTerminalLabels.length > 0 ? selectedTerminalLabels.join(', ') : `${value.length} terminal(s)`
                  }}
                >
                  <MenuItem value="" disabled>
                    <em>Tous les terminaux</em>
                  </MenuItem>
                  {terminals.map((terminal) => {
                    const terminalId = String(terminal.terminal_id || terminal.id)
                    return (
                      <MenuItem key={terminalId} value={terminalId}>
                        <Checkbox checked={selectedTerminalIds.includes(terminalId)} />
                        <ListItemText primary={formatTerminalLabel(terminal)} secondary={terminal.actif === false ? 'Inactif' : undefined} />
                      </MenuItem>
                    )
                  })}
                </Select>
              </FormControl>
            </Stack>
          </Grid>

          <Grid item xs={12} lg={2}>
            <Stack spacing={1} alignItems="stretch" justifyContent="space-between" sx={{ height: '100%' }}>
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="contained"
                size="large"
                startIcon={<RefreshIcon />}
                onClick={onGenerate}
                disabled={generating}
                sx={{ minHeight: 48 }}
              >
                {generating ? 'Génération...' : 'Générer'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Stack>
    </Alert>
  )
}
