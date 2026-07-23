import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, CardHeader, Divider, Grid, Skeleton, Stack, Typography } from '@mui/material'

import { fetchDistributionParDab } from '../../api/endpoints/transactions'
import { buildCouleursParDab } from '../../utils/couleursDab'
import CamembertDistribution from './CamembertDistribution'
import BarresDistribution from './BarresDistribution'

const CHART_HEIGHT = 320

function formatMontant(value) {
  return `${Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} DT`
}

function formatDateFr(value) {
  if (!value) return ''
  const text = String(value)
  if (!text.includes('-')) return text
  const [year, month, day] = text.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

// Traduit le state de filtres de la page Transactions (celui déjà utilisé
// par buildRequestParams) vers le contrat exact du nouvel endpoint
// d'agrégation : atm_ids en CSV, pas de skip/limit/tri_reste_coffre.
function buildDistributionParams(filtres) {
  return {
    date_debut: filtres.date_debut || undefined,
    date_fin: filtres.date_fin || undefined,
    atm_ids: filtres.atm_id && filtres.atm_id.length > 0 ? filtres.atm_id.join(',') : undefined,
    montant_min: filtres.montant_min === '' ? undefined : filtres.montant_min,
    montant_max: filtres.montant_max === '' ? undefined : filtres.montant_max,
    reste_coffre_max: filtres.reste_coffre_max === '' ? undefined : filtres.reste_coffre_max,
    search: filtres.search && filtres.search.trim() !== '' ? filtres.search.trim() : undefined,
  }
}

function isCancelError(err) {
  return err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED'
}

export default function CarteDistributionParDab({ filtres, dabs }) {
  const [data, setData] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryToken, setRetryToken] = useState(0)

  const requestParams = useMemo(() => buildDistributionParams(filtres), [filtres])
  const requestKey = useMemo(() => JSON.stringify(requestParams), [requestParams])
  const couleurs = useMemo(() => buildCouleursParDab(dabs), [dabs])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    fetchDistributionParDab(requestParams, { signal: controller.signal })
      .then((response) => {
        setData(response.data?.data || [])
        setMeta(response.data?.meta || null)
      })
      .catch((err) => {
        if (isCancelError(err)) return
        setData([])
        setMeta(null)
        setError(err.response?.data?.message || err.response?.data?.detail || err.message || 'Impossible de charger la distribution par DAB')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, retryToken])

  const handleRetry = () => {
    setRetryToken((token) => token + 1)
  }

  const periodLabel = meta
    ? `Période du ${formatDateFr(meta.date_debut)} au ${formatDateFr(meta.date_fin)} · ${meta.nb_dab} DAB · ${Number(
        meta.nb_transactions_global || 0,
      ).toLocaleString('fr-FR')} transactions`
    : null

  return (
    <Card sx={{ mb: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
      <CardHeader
        title={
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={2} flexWrap="wrap">
            <Typography variant="h6">Distribution par distributeur</Typography>
            {meta ? (
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Total : {formatMontant(meta.montant_global)}
              </Typography>
            ) : null}
          </Stack>
        }
        subheader={periodLabel}
      />
      <Divider />
      <CardContent>
        {error ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={handleRetry}>
                Réessayer
              </Button>
            }
          >
            {error}
          </Alert>
        ) : null}

        {!error && loading ? (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ height: CHART_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Skeleton variant="circular" width={220} height={220} />
                <Skeleton variant="text" width="50%" />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Skeleton variant="rectangular" height={CHART_HEIGHT} />
            </Grid>
          </Grid>
        ) : null}

        {!error && !loading && data.length === 0 ? (
          <Alert severity="info">Aucune transaction sur la période et les filtres sélectionnés.</Alert>
        ) : null}

        {!error && !loading && data.length > 0 ? (
          <Grid container spacing={2} sx={{ position: 'relative' }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Répartition (%)
              </Typography>
              <CamembertDistribution data={data} montantGlobal={meta?.montant_global} couleurs={couleurs} />
            </Grid>

            <Divider
              orientation="vertical"
              flexItem
              sx={{
                display: { xs: 'none', md: 'block' },
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
              }}
            />

            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Montant distribué (DT) — tri ↓
              </Typography>
              <BarresDistribution data={data} couleurs={couleurs} />
            </Grid>
          </Grid>
        ) : null}
      </CardContent>
    </Card>
  )
}
