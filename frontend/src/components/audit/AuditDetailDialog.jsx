import { Box, Chip, Dialog, DialogContent, DialogTitle, Divider, Grid, Stack, Typography } from '@mui/material'

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'Oui' : 'Non'
  }

  if (typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'string') {
    return value
  }

  return null
}

function formatLabel(label) {
  return String(label || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function ObjectView({ value, depth = 0 }) {
  if (value === null || value === undefined) {
    return <Typography variant="body2" color="text.secondary">—</Typography>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <Typography variant="body2" color="text.secondary">Liste vide</Typography>
    }

    return (
      <Stack spacing={1}>
        {value.map((item, index) => (
          <Box key={index} sx={{ p: 1.2, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <ObjectView value={item} depth={depth + 1} />
          </Box>
        ))}
      </Stack>
    )
  }

  if (!isPlainObject(value)) {
    const rendered = formatValue(value)
    return <Typography variant="body2">{rendered ?? String(value)}</Typography>
  }

  const entries = Object.entries(value)
  if (entries.length === 0) {
    return <Typography variant="body2" color="text.secondary">Objet vide</Typography>
  }

  return (
    <Stack spacing={1}>
      {entries.map(([key, nestedValue]) => {
        const primitive = formatValue(nestedValue)
        return (
          <Box key={key} sx={{ display: 'grid', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)', letterSpacing: 0.3 }}>
              {formatLabel(key)}
            </Typography>
            {primitive !== null ? (
              <Typography variant="body2">{primitive}</Typography>
            ) : (
              <Box sx={{ pl: depth > 0 ? 1.5 : 0, borderLeft: depth > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                <ObjectView value={nestedValue} depth={depth + 1} />
              </Box>
            )}
          </Box>
        )
      })}
    </Stack>
  )
}

function BeforeAfterBlock({ title, value }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <ObjectView value={value} />
    </Box>
  )
}

export default function AuditDetailDialog({ open, auditEntry, onClose }) {
  const details = auditEntry?.details ?? null
  const avant = details?.avant ?? details?.before ?? null
  const apres = details?.apres ?? details?.after ?? null
  const hasBeforeAfter = avant !== null || apres !== null

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        <Stack spacing={0.5}>
          <Typography variant="h6">Détail de l’entrée d’audit</Typography>
          <Typography variant="body2" color="text.secondary">
            {auditEntry?.utilisateur_nom || 'Utilisateur inconnu'} · {auditEntry?.utilisateur_login ? `@${auditEntry.utilisateur_login}` : 'Login indisponible'}
          </Typography>
        </Stack>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2.5 }}>
        <Stack spacing={2.5}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>Horodatage</Typography>
              <Typography variant="body2">
                {auditEntry?.horodatage
                  ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(auditEntry.horodatage))
                  : '—'}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>Action</Typography>
              <Typography variant="body2">{auditEntry?.action || '—'}</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>Résultat</Typography>
              <Box sx={{ mt: 0.5 }}>
                <Chip size="small" color={String(auditEntry?.resultat || '').toUpperCase() === 'ECHEC' ? 'error' : 'success'} label={auditEntry?.resultat === 'ECHEC' ? 'Échec' : 'Succès'} />
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>Adresse IP</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{auditEntry?.adresse_ip || '—'}</Typography>
            </Grid>
          </Grid>

          <Divider />

          {details === null || details === undefined ? (
            <Typography variant="body2" color="text.secondary">
              Aucun détail supplémentaire n’est disponible pour cette entrée.
            </Typography>
          ) : hasBeforeAfter ? (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <BeforeAfterBlock title="Avant" value={avant} />
              </Grid>
              <Grid item xs={12} md={6}>
                <BeforeAfterBlock title="Après" value={apres} />
              </Grid>
              {Object.entries(details)
                .filter(([key]) => key !== 'avant' && key !== 'apres' && key !== 'before' && key !== 'after')
                .map(([key, value]) => (
                  <Grid item xs={12} key={key}>
                    <Box sx={{ p: 2, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        {formatLabel(key)}
                      </Typography>
                      <ObjectView value={value} />
                    </Box>
                  </Grid>
                ))}
            </Grid>
          ) : (
            <Box sx={{ p: 2, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <ObjectView value={details} />
            </Box>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  )
}