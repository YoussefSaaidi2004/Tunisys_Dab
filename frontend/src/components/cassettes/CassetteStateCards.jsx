import { useEffect, useState } from 'react'
import { Alert, Box, Card, CardContent, Chip, Grid, Skeleton, Stack, Typography } from '@mui/material'

import { fetchLatestCassetteState } from '../../api/endpoints/cassettes'

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

export default function CassetteStateCards({ atmId }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!Number.isFinite(atmId) || atmId <= 0) return undefined

    let mounted = true
    setLoading(true)
    setError('')

    fetchLatestCassetteState(atmId)
      .then((response) => {
        if (!mounted) return
        setState(response.data?.data || null)
      })
      .catch((err) => {
        if (!mounted) return
        setState(null)
        setError(err.response?.data?.detail || err.message || 'Impossible de charger l’état des cassettes')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [atmId])

  if (loading) {
    return (
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Skeleton variant="rounded" height={120} />
          </Grid>
        ))}
      </Grid>
    )
  }

  if (error) {
    return (
      <Alert severity="warning" sx={{ mb: 3 }}>
        {error}
      </Alert>
    )
  }

  if (!state) {
    return (
      <Alert severity="info" sx={{ mb: 3 }}>
        Aucun état de cassette disponible pour ce terminal (aucun événement CH/DE importé).
      </Alert>
    )
  }

  const caisses = state.caisses || []
  const totalBillets = caisses.reduce((sum, caisse) => sum + Number(caisse.nb_billets || 0), 0)
  const totalMontant = caisses.reduce((sum, caisse) => sum + Number(caisse.montant || 0), 0)

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        État le plus récent du DAB
      </Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', mb: 2 }}>
        D’après le dernier événement {state.type_evenement === 'CH' ? 'de chargement (CH)' : 'de déchargement (DE)'} du{' '}
        {formatDateTime(state.datetime_evenement)}.
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ border: '1px solid rgba(255,255,255,0.08)', height: '100%' }}>
            <CardContent>
              <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.58)' }}>
                Cassettes
              </Typography>
              <Typography variant="h4" sx={{ mt: 0.5 }}>
                {state.nb_cassettes ?? caisses.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {totalBillets.toLocaleString('fr-TN')} billets · {formatAmount(totalMontant)} DT
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {caisses.map((caisse) => (
          <Grid item xs={12} sm={6} md={3} key={caisse.numero_caisse}>
            <Card sx={{ border: '1px solid rgba(255,255,255,0.08)', height: '100%' }}>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.58)' }}>
                    Caisse {caisse.numero_caisse}
                  </Typography>
                  <Chip label={`${caisse.denomination} DT`} size="small" variant="outlined" />
                </Stack>
                <Typography variant="h5" sx={{ mt: 0.5 }}>
                  {caisse.nb_billets.toLocaleString('fr-TN')} billets
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatAmount(caisse.montant)} DT chargés
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}

        {caisses.length === 0 ? (
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">
              Aucune caisse associée à ce dernier événement.
            </Typography>
          </Grid>
        ) : null}
      </Grid>
    </Box>
  )
}
