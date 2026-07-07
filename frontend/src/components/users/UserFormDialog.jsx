import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
} from '@mui/material'

const ROLE_OPTIONS = ['ADMIN', 'SUPERVISOR', 'AGENT', 'AUDITOR']

function validateEmail(value) {
  if (!value) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validatePassword(value) {
  if (!value) return false
  if (value.length < 10) return false
  if (!/[A-Za-z]/.test(value)) return false
  if (!/\d/.test(value)) return false
  return true
}

export default function UserFormDialog({ open, mode, user, onClose, onSubmit }) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState({
    login: '',
    nom: '',
    email: '',
    role: 'AGENT',
    mot_de_passe: '',
    actif: true,
  })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setForm({
      login: user?.login || '',
      nom: user?.nom || '',
      email: user?.email || '',
      role: user?.role || 'AGENT',
      mot_de_passe: '',
      actif: user?.actif ?? true,
    })
    setErrors({})
    setSubmitError('')
    setSaving(false)
  }, [open, user])

  const validation = useMemo(() => {
    const nextErrors = {}

    if (!isEdit && !form.login.trim()) {
      nextErrors.login = 'Le login est requis'
    }

    if (!form.nom.trim()) {
      nextErrors.nom = 'Le nom est requis'
    }

    if (form.email && !validateEmail(form.email.trim())) {
      nextErrors.email = 'Format email invalide'
    }

    if (!form.role) {
      nextErrors.role = 'Le rôle est requis'
    }

    if (!isEdit && !form.mot_de_passe) {
      nextErrors.mot_de_passe = 'Le mot de passe est requis'
    } else if (form.mot_de_passe && !validatePassword(form.mot_de_passe)) {
      nextErrors.mot_de_passe = 'Au moins 10 caractères, avec une lettre et un chiffre'
    }

    return nextErrors
  }, [form, isEdit])

  const canSave = Object.keys(validation).length === 0

  const handleChange = (field) => (event) => {
    const value = field === 'actif' ? event.target.checked : event.target.value
    setForm((current) => ({ ...current, [field]: value }))
    setSubmitError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrors(validation)

    if (!canSave) {
      return
    }

    setSaving(true)
    setSubmitError('')

    try {
      const payload = {
        nom: form.nom.trim(),
        email: form.email.trim() || null,
        role: form.role,
        actif: form.actif,
      }

      if (!isEdit) {
        payload.login = form.login.trim()
        payload.mot_de_passe = form.mot_de_passe
      } else if (form.mot_de_passe) {
        payload.mot_de_passe = form.mot_de_passe
      }

      await onSubmit(payload)
      onClose()
    } catch (error) {
      setSubmitError(error.response?.data?.message || error.response?.data?.detail || error.message || 'Impossible d’enregistrer l’utilisateur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Modifier un utilisateur' : 'Nouvel utilisateur'}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Stack spacing={2}>
            {submitError ? <Alert severity="error">{submitError}</Alert> : null}

            <TextField
              label="Login"
              value={form.login}
              onChange={handleChange('login')}
              error={Boolean(errors.login)}
              helperText={isEdit ? 'Login verrouillé après création' : errors.login}
              fullWidth
              required={!isEdit}
              disabled={isEdit}
            />

            <TextField
              label="Nom"
              value={form.nom}
              onChange={handleChange('nom')}
              error={Boolean(errors.nom)}
              helperText={errors.nom}
              fullWidth
              required
            />

            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              error={Boolean(errors.email)}
              helperText={errors.email || 'Optionnel'}
              fullWidth
            />

            <FormControl fullWidth error={Boolean(errors.role)}>
              <InputLabel id="user-role-label">Rôle</InputLabel>
              <Select
                labelId="user-role-label"
                label="Rôle"
                value={form.role}
                onChange={handleChange('role')}
              >
                {ROLE_OPTIONS.map((role) => (
                  <MenuItem key={role} value={role}>
                    {role}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>{errors.role || (form.role === 'AGENT' ? 'Les DAB accessibles se gèrent via l’action Affectations.' : 'Rôle métier de l’utilisateur')}</FormHelperText>
            </FormControl>

            <TextField
              label="Mot de passe"
              type="password"
              value={form.mot_de_passe}
              onChange={handleChange('mot_de_passe')}
              error={Boolean(errors.mot_de_passe)}
              helperText={errors.mot_de_passe || (isEdit ? 'Laisser vide pour conserver le mot de passe actuel' : 'Requis à la création, minimum 10 caractères avec une lettre et un chiffre')}
              fullWidth
              required={!isEdit}
            />

            <FormControlLabel
              control={<Switch checked={form.actif} onChange={handleChange('actif')} />}
              label="Compte actif"
            />

            {form.role === 'AGENT' ? (
              <Alert severity="info">Les DAB accessibles se gèrent via l’action Affectations.</Alert>
            ) : null}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" variant="contained" disabled={saving || !canSave}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}