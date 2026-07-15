import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Skeleton,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'

import { useAuth } from '../auth/AuthContext'
import { fetchTxFiles, triggerCollecte } from '../api/endpoints/collecte'
import AppShell from '../components/layout/AppShell'

const DEFAULT_ROWS_PER_PAGE = 20

function getStatusChipColor(status) {
  const normalized = String(status || '').toUpperCase()
  if (normalized === 'SUCCES' || normalized === 'IMPORTE') return 'success'
  if (normalized === 'ECHEC') return 'error'
  return 'default'
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('fr-TN')
}

export default function ImportTX() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isTriggering, setIsTriggering] = useState(false)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })
  const refreshTimeoutRef = useRef(null)

  const skip = useMemo(() => page * rowsPerPage, [page, rowsPerPage])

  const loadTxFiles = useCallback(() => {
    setLoading(true)
    setError('')

    return fetchTxFiles(skip, rowsPerPage)
      .then((response) => {
        const payload = response.data?.data
        const nextItems = Array.isArray(payload) ? payload : []
        const metaTotal = response.data?.meta?.total
        setItems(nextItems)
        setCount(typeof metaTotal === 'number' ? metaTotal : nextItems.length)
      })
      .catch((err) => {
        setError(err.response?.data?.detail || err.message || 'Impossible de charger les imports TX')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [skip, rowsPerPage])

  useEffect(() => {
    loadTxFiles()
  }, [loadTxFiles])

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

  const handleTriggerCollecte = async () => {
    setIsTriggering(true)
    try {
      await triggerCollecte()
      setSnackbar({
        open: true,
        message: 'Collecte lancée en arrière-plan',
        severity: 'success',
      })

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
      refreshTimeoutRef.current = setTimeout(() => {
        loadTxFiles()
      }, 3000)
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.detail || err.message || 'Impossible de déclencher la collecte',
        severity: 'error',
      })
    } finally {
      setIsTriggering(false)
    }
  }

  const handleRefresh = () => {
    loadTxFiles()
  }

  const handleChangePage = (_event, nextPage) => {
    setPage(nextPage)
  }

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  const closeSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }))
  }

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Import des fichiers TX
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
          Déclenchement manuel de la collecte SSH et suivi du statut des imports.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {user?.role === 'ADMIN' ? (
          <Button
            variant="contained"
            onClick={handleTriggerCollecte}
            disabled={isTriggering}
            startIcon={isTriggering ? <CircularProgress color="inherit" size={16} /> : null}
          >
            {isTriggering ? 'Collecte en cours...' : 'Déclencher la collecte'}
          </Button>
        ) : <Box />}

        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefresh} disabled={loading || isTriggering}>
          Rafraîchir
        </Button>
      </Box>

      {error ? <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert> : null}

      <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ p: 2 }}>
              <Skeleton height={48} />
              <Skeleton height={42} />
              <Skeleton height={42} />
              <Skeleton height={42} />
            </Box>
          ) : (
            <>
              {items.length === 0 ? (
                <Typography sx={{ color: 'rgba(255,255,255,0.62)', p: 3, textAlign: 'center' }}>
                  Aucun fichier importé pour le moment
                </Typography>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Terminal</TableCell>
                        <TableCell>Nom du fichier</TableCell>
                        <TableCell>Statut</TableCell>
                        <TableCell>Disponibilité</TableCell>
                        <TableCell>Date d&apos;import</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id} hover>
                          <TableCell>{item.terminal_id || '-'}</TableCell>
                          <TableCell>{item.nom_fichier || '-'}</TableCell>
                          <TableCell>
                            <Chip size="small" color={getStatusChipColor(item.statut)} label={item.statut || 'INCONNU'} />
                          </TableCell>
                          <TableCell>{item.disponibilite || '-'}</TableCell>
                          <TableCell>{formatDate(item.date_import)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </>
          )}

          <TablePagination
            component="div"
            count={count}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </CardContent>
      </Card>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={closeSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={closeSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AppShell>
  )
}