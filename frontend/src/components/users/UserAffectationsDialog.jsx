import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'

import { addAffectation, getAffectations, listDabs, removeAffectation } from '../../services/utilisateursService'

export default function UserAffectationsDialog({ open, user, onClose }) {
  const [dabs, setDabs] = useState([])
  const [affectations, setAffectations] = useState([])
  const [selectedAtmId, setSelectedAtmId] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingAtmId, setSavingAtmId] = useState('')
  const [error, setError] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  useEffect(() => {
    if (!open || !user?.id) {
      return
    }

    let mounted = true
    setLoading(true)
    setError('')

    Promise.all([listDabs(), getAffectations(user.id)])
      .then(([dabsResponse, affectationsResponse]) => {
        if (!mounted) return

        const dabsPayload = dabsResponse.data?.data
        const affectationsPayload = affectationsResponse.data?.data

        setDabs(Array.isArray(dabsPayload) ? dabsPayload : [])
        setAffectations(Array.isArray(affectationsPayload?.items) ? affectationsPayload.items : [])
      })
      .catch((err) => {
        if (!mounted) return
        setError(err.response?.data?.message || err.response?.data?.detail || err.message || 'Impossible de charger les affectations')
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [open, user?.id])

  const assignedIds = useMemo(() => new Set(affectations.map((item) => Number(item.atm_id))), [affectations])
  const availableDabs = useMemo(() => dabs.filter((item) => !assignedIds.has(Number(item.id))), [dabs, assignedIds])

  useEffect(() => {
    if (!selectedAtmId) {
      return
    }

    if (!availableDabs.some((item) => String(item.id) === String(selectedAtmId))) {
      setSelectedAtmId('')
    }
  }, [availableDabs, selectedAtmId])

  const showFeedback = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity })
  }

  const refreshAffectations = async () => {
    const response = await getAffectations(user.id)
    const payload = response.data?.data
    setAffectations(Array.isArray(payload?.items) ? payload.items : [])
  }

  const handleAdd = async () => {
    if (!selectedAtmId) {
      return
    }

    setSavingAtmId(String(selectedAtmId))
    try {
      await addAffectation(user.id, Number(selectedAtmId))
      await refreshAffectations()
      setSelectedAtmId('')
      showFeedback('Affectation ajoutée avec succès', 'success')
    } catch (err) {
      showFeedback(err.response?.data?.message || err.response?.data?.detail || err.message || 'Impossible d’ajouter l’affectation', 'error')
    } finally {
      setSavingAtmId('')
    }
  }

  const handleRemove = async (atmId) => {
    setSavingAtmId(String(atmId))
    try {
      await removeAffectation(user.id, atmId)
      await refreshAffectations()
      showFeedback('Affectation retirée avec succès', 'success')
    } catch (err) {
      showFeedback(err.response?.data?.message || err.response?.data?.detail || err.message || 'Impossible de retirer l’affectation', 'error')
    } finally {
      setSavingAtmId('')
    }
  }

  const closeSnackbar = () => {
    setSnackbar((current) => ({ ...current, open: false }))
  }

  return (
    <>
      <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Affectations DAB - {user?.login}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}

            <Typography variant="body2" color="text.secondary">
              Cette gestion s’applique uniquement aux utilisateurs de rôle AGENT.
            </Typography>

            <FormControl fullWidth disabled={loading || availableDabs.length === 0}>
              <InputLabel id="dab-select-label">Ajouter un DAB</InputLabel>
              <Select
                labelId="dab-select-label"
                label="Ajouter un DAB"
                value={selectedAtmId}
                onChange={(event) => setSelectedAtmId(event.target.value)}
              >
                {availableDabs.length === 0 ? <MenuItem value="">Aucun DAB disponible</MenuItem> : null}
                {availableDabs.map((dab) => (
                  <MenuItem key={dab.id} value={String(dab.id)}>
                    {dab.terminal_id} - {dab.nom}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button variant="contained" onClick={handleAdd} disabled={!selectedAtmId || loading || Boolean(savingAtmId)}>
              {savingAtmId ? 'Traitement...' : 'Ajouter l’affectation'}
            </Button>

            <Divider />

            <Box>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                DAB actuellement affectés
              </Typography>

              {loading ? <Typography color="text.secondary">Chargement...</Typography> : null}

              {!loading && affectations.length === 0 ? (
                <Typography color="text.secondary">Aucune affectation pour cet utilisateur.</Typography>
              ) : null}

              <Stack spacing={1}>
                {affectations.map((item) => (
                  <Box
                    key={item.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                      p: 1.5,
                      borderRadius: 2,
                      backgroundColor: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <Box>
                      <Typography variant="body2">{item.atm_terminal_id || `DAB ${item.atm_id}`}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.atm_nom || 'DAB'}
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={() => handleRemove(item.atm_id)}
                      disabled={Boolean(savingAtmId)}
                    >
                      Retirer
                    </Button>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={closeSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={closeSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}