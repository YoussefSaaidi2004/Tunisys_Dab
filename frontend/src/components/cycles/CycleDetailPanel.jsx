import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Collapse,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import { fetchCycleDetail } from '../../api/endpoints/cycles'

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

  return error.message || fallback
}

export default function CycleDetailPanel({ cycleId, open, colSpan }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!open || !cycleId) {
      return
    }

    let mounted = true
    setLoading(true)
    setError('')

    fetchCycleDetail(cycleId)
      .then((response) => {
        if (!mounted) return
        setDetail(response.data?.data || null)
      })
      .catch(async (err) => {
        if (!mounted) return
        setDetail(null)
        setError(await extractErrorMessage(err, 'Impossible de charger le détail du cycle'))
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [open, cycleId])

  const cassettes = detail?.cassettes || []
  const totalCharge = detail?.montant_charge

  return (
    <TableRow>
      <TableCell colSpan={colSpan} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <Box sx={{ my: 2 }}>
            {error ? <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert> : null}

            {loading ? <Skeleton variant="rounded" height={140} /> : null}

            {!loading && !error && cassettes.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Aucune cassette associée au chargement final de ce cycle.
              </Typography>
            ) : null}

            {!loading && cassettes.length > 0 ? (
              <TableContainer component={Paper} sx={{ background: 'transparent', boxShadow: 'none' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Caisse</TableCell>
                      <TableCell>Dénomination (DT)</TableCell>
                      <TableCell align="right">Nb billets</TableCell>
                      <TableCell align="right">Montant (DT)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cassettes.map((caisse) => (
                      <TableRow key={caisse.numero_caisse}>
                        <TableCell>{caisse.numero_caisse}</TableCell>
                        <TableCell>{formatAmount(caisse.denomination)}</TableCell>
                        <TableCell align="right">{caisse.nb_billets}</TableCell>
                        <TableCell align="right">{formatAmount(caisse.montant)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : null}

            {!loading && detail ? (
              <Typography variant="body2" sx={{ mt: 2, fontWeight: 600 }}>
                Total chargé : {formatAmount(totalCharge)} DT · Billets rejetés : {detail.nb_billets_rejet}
              </Typography>
            ) : null}
          </Box>
        </Collapse>
      </TableCell>
    </TableRow>
  )
}
