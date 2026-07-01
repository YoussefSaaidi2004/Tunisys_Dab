import { useEffect, useState } from 'react'
import { Alert, Box, Card, CardContent, Grid, Skeleton, Typography } from '@mui/material'

import { fetchDashboardStatistics } from '../api/endpoints/statistiques'
import AppShell from '../components/layout/AppShell'
import TransactionDistributionChart from '../components/charts/TransactionDistributionChart'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    fetchDashboardStatistics()
      .then((response) => {
        if (!mounted) return
        setData(response.data?.data || response.data || null)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err.response?.data?.detail || err.message || 'Impossible de charger les statistiques')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const formatCurrency = (value) => {
    if (value === undefined || value === null) return '0 TND'
    return `${Number(value).toLocaleString('fr-TN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TND`
  }

  const kpis = [
    { label: 'Transactions du jour', value: data?.kpis?.transactions_du_jour ?? 0 },
    { label: 'Montant distribué', value: formatCurrency(data?.kpis?.montant_distribue) },
    { label: 'Terminaux actifs', value: data?.kpis?.terminaux_actifs ?? 0 },
    { label: 'Terminaux inactifs', value: data?.kpis?.terminaux_inactifs ?? 0 },
  ]

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Dashboard
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
          Vue consolidée de l’activité des DAB et des imports TX.
        </Typography>
      </Box>

      {error ? <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert> : null}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        {kpis.map((item) => (
          <Grid item xs={12} sm={6} md={3} key={item.label}>
            <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.08)' }}>
              <CardContent>
                <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                  {item.label}
                </Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {loading ? <Skeleton width={100} /> : item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          {(!data?.distribution || data.distribution.length === 0) && !loading ? (
            <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
              <Typography variant="body1" color="text.secondary">Aucune donnée disponible</Typography>
            </Card>
          ) : (
            <TransactionDistributionChart data={data?.distribution || []} />
          )}
        </Grid>
        <Grid item xs={12} lg={4}>
          <Card sx={{ height: '100%', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Derniers imports
              </Typography>
              {loading ? <Skeleton height={180} /> : null}
              {!loading && (!data?.derniers_imports || data.derniers_imports.length === 0) ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>Aucun import récent</Typography>
              ) : null}
              {!loading && (data?.derniers_imports || []).map((item) => (
                <Box key={item.nom_fichier} sx={{ py: 1.2, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <Typography variant="body2">{item.nom_fichier}</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                    {item.statut} · {item.disponibilite}
                  </Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </AppShell>
  )
}
