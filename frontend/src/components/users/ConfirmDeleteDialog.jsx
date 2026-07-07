import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'

export default function ConfirmDeleteDialog({ open, user, onClose, onConfirm, loading }) {
  const [confirmation, setConfirmation] = useState('')
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!open) {
      setConfirmation('')
      setSubmitError('')
    }
  }, [open])

  const expectedValue = user?.login || ''
  const canDelete = confirmation.trim() === expectedValue

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')

    if (!canDelete) {
      return
    }

    try {
      await onConfirm()
      onClose()
    } catch (error) {
      setSubmitError(error.response?.data?.message || error.response?.data?.detail || error.message || 'Impossible de supprimer l’utilisateur')
    }
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Supprimer l’utilisateur</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Typography sx={{ mb: 2 }}>
            Cette action est irréversible. Pour confirmer la suppression de l’utilisateur <strong>{user?.login}</strong>, saisissez son login ci-dessous.
          </Typography>

          {submitError ? <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert> : null}

          <TextField
            label="Saisir le login de confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            fullWidth
            autoFocus
            helperText="La suppression ne sera possible que si la valeur correspond exactement au login."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button type="submit" color="error" variant="contained" disabled={!canDelete || loading}>
            {loading ? 'Suppression...' : 'Confirmer la suppression'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}