import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
} from '@mui/material'

import { createDab, updateDab } from '../../api/endpoints/dabs'

function createInitialFormValues(dab) {
  return {
    terminal_id: dab?.terminal_id ?? '',
    nom: dab?.nom ?? '',
    adresse: dab?.adresse ?? '',
    ip_address: dab?.ip_address ?? '',
    ssh_port: dab?.ssh_port ?? 22,
    ssh_login: dab?.ssh_login ?? '',
    ssh_password: '',
    chemin_remote: dab?.chemin_remote ?? '',
    cardless_pan: dab?.cardless_pan ?? '9999999999999999',
    notes: dab?.notes ?? '',
    actif: dab?.actif ?? true,
  }
}

function toNullableString(value) {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

const TERMINAL_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const SSH_LOGIN_PATTERN = /^[A-Za-z0-9._-]+$/
const CARDLESS_PAN_PATTERN = /^[0-9]+$/
const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
const HOSTNAME_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/

const FIELD_LIMITS = {
  terminal_id: 20,
  nom: 100,
  adresse: 500,
  ip_address: 45,
  ssh_login: 100,
  ssh_password: 255,
  chemin_remote: 255,
  cardless_pan: 20,
  notes: 1000,
}

function buildCreatePayload(formValues) {
  return {
    terminal_id: formValues.terminal_id.trim(),
    nom: formValues.nom.trim(),
    adresse: toNullableString(formValues.adresse),
    ip_address: toNullableString(formValues.ip_address),
    ssh_port: formValues.ssh_port === '' ? null : Number(formValues.ssh_port),
    ssh_login: toNullableString(formValues.ssh_login),
    ssh_password: toNullableString(formValues.ssh_password),
    chemin_remote: toNullableString(formValues.chemin_remote),
    cardless_pan: toNullableString(formValues.cardless_pan),
    notes: toNullableString(formValues.notes),
    actif: Boolean(formValues.actif),
  }
}

function buildUpdatePayload(formValues, initialValues) {
  const payload = {}

  if (formValues.nom.trim() !== initialValues.nom.trim()) {
    payload.nom = formValues.nom.trim()
  }
  if (toNullableString(formValues.adresse) !== toNullableString(initialValues.adresse)) {
    payload.adresse = toNullableString(formValues.adresse)
  }
  if (toNullableString(formValues.ip_address) !== toNullableString(initialValues.ip_address)) {
    payload.ip_address = toNullableString(formValues.ip_address)
  }
  if (String(formValues.ssh_port ?? '') !== String(initialValues.ssh_port ?? '')) {
    payload.ssh_port = formValues.ssh_port === '' ? null : Number(formValues.ssh_port)
  }
  if (toNullableString(formValues.ssh_login) !== toNullableString(initialValues.ssh_login)) {
    payload.ssh_login = toNullableString(formValues.ssh_login)
  }
  if (formValues.ssh_password.trim() !== '') {
    payload.ssh_password = formValues.ssh_password
  }
  if (toNullableString(formValues.chemin_remote) !== toNullableString(initialValues.chemin_remote)) {
    payload.chemin_remote = toNullableString(formValues.chemin_remote)
  }
  if (toNullableString(formValues.cardless_pan) !== toNullableString(initialValues.cardless_pan)) {
    payload.cardless_pan = toNullableString(formValues.cardless_pan)
  }
  if (toNullableString(formValues.notes) !== toNullableString(initialValues.notes)) {
    payload.notes = toNullableString(formValues.notes)
  }
  if (Boolean(formValues.actif) !== Boolean(initialValues.actif)) {
    payload.actif = Boolean(formValues.actif)
  }

  return payload
}

async function extractErrorDetails(error) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg).filter(Boolean)
    if (messages.length > 0) {
      return messages.join(' · ')
    }
  }

  const responseData = error.response?.data
  if (responseData instanceof Blob) {
    try {
      const text = await responseData.text()
      if (!text) return error.message || 'Une erreur est survenue'

      try {
        const parsed = JSON.parse(text)
        return parsed.detail || parsed.message || text || error.message || 'Une erreur est survenue'
      } catch {
        return text || error.message || 'Une erreur est survenue'
      }
    } catch {
      return error.message || 'Une erreur est survenue'
    }
  }

  return error.message || 'Une erreur est survenue'
}

export default function DabFormDialog({ open, mode, dab, onClose, onSaved }) {
  const initialValues = useMemo(() => createInitialFormValues(dab), [dab])
  const [formValues, setFormValues] = useState(initialValues)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (open) {
      setFormValues(createInitialFormValues(dab))
      setError('')
      setFieldErrors({})
      setSubmitting(false)
    }
  }, [open, dab])

  const handleChange = (field) => (event) => {
    const value = event.target.value
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }))
    setFieldErrors((current) => ({
      ...current,
      [field]: '',
    }))
  }

  const validate = () => {
    const nextErrors = {}

    const terminalId = formValues.terminal_id.trim()
    if (mode === 'create') {
      if (!terminalId) {
        nextErrors.terminal_id = 'Le terminal_id est obligatoire'
      } else if (terminalId.length > FIELD_LIMITS.terminal_id) {
        nextErrors.terminal_id = `Maximum ${FIELD_LIMITS.terminal_id} caractères`
      } else if (!TERMINAL_ID_PATTERN.test(terminalId)) {
        nextErrors.terminal_id = 'Lettres, chiffres, "-" et "_" uniquement'
      }
    }

    const nom = formValues.nom.trim()
    if (!nom) {
      nextErrors.nom = 'Le nom est obligatoire'
    } else if (nom.length > FIELD_LIMITS.nom) {
      nextErrors.nom = `Maximum ${FIELD_LIMITS.nom} caractères`
    }

    const adresse = formValues.adresse.trim()
    if (!adresse) {
      nextErrors.adresse = "L'adresse est obligatoire"
    } else if (adresse.length > FIELD_LIMITS.adresse) {
      nextErrors.adresse = `Maximum ${FIELD_LIMITS.adresse} caractères`
    }

    const ipAddress = formValues.ip_address.trim()
    if (!ipAddress) {
      nextErrors.ip_address = "L'adresse IP est obligatoire"
    } else if (ipAddress.length > FIELD_LIMITS.ip_address) {
      nextErrors.ip_address = `Maximum ${FIELD_LIMITS.ip_address} caractères`
    } else if (!IPV4_PATTERN.test(ipAddress) && !HOSTNAME_PATTERN.test(ipAddress)) {
      nextErrors.ip_address = 'Adresse IP ou nom d’hôte invalide'
    }

    const sshPort = formValues.ssh_port
    if (sshPort === '' || sshPort === null || sshPort === undefined) {
      nextErrors.ssh_port = 'Le port SSH est obligatoire'
    } else {
      const portNumber = Number(sshPort)
      if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
        nextErrors.ssh_port = 'Port entre 1 et 65535'
      }
    }

    const sshLogin = formValues.ssh_login.trim()
    if (!sshLogin) {
      nextErrors.ssh_login = 'Le login SSH est obligatoire'
    } else if (sshLogin.length > FIELD_LIMITS.ssh_login) {
      nextErrors.ssh_login = `Maximum ${FIELD_LIMITS.ssh_login} caractères`
    } else if (!SSH_LOGIN_PATTERN.test(sshLogin)) {
      nextErrors.ssh_login = 'Lettres, chiffres, ".", "-" et "_" uniquement'
    }

    const sshPassword = formValues.ssh_password
    if (mode === 'create' && !sshPassword.trim()) {
      nextErrors.ssh_password = 'Le mot de passe SSH est obligatoire'
    } else if (sshPassword.length > FIELD_LIMITS.ssh_password) {
      nextErrors.ssh_password = `Maximum ${FIELD_LIMITS.ssh_password} caractères`
    }

    const cheminRemote = formValues.chemin_remote.trim()
    if (!cheminRemote) {
      nextErrors.chemin_remote = 'Le chemin remote est obligatoire'
    } else if (cheminRemote.length > FIELD_LIMITS.chemin_remote) {
      nextErrors.chemin_remote = `Maximum ${FIELD_LIMITS.chemin_remote} caractères`
    }

    const cardlessPan = formValues.cardless_pan.trim()
    if (!cardlessPan) {
      nextErrors.cardless_pan = 'Le cardless PAN est obligatoire'
    } else if (!CARDLESS_PAN_PATTERN.test(cardlessPan)) {
      nextErrors.cardless_pan = 'Chiffres uniquement'
    } else if (cardlessPan.length < 12 || cardlessPan.length > FIELD_LIMITS.cardless_pan) {
      nextErrors.cardless_pan = `Entre 12 et ${FIELD_LIMITS.cardless_pan} chiffres`
    }

    const notes = formValues.notes.trim()
    if (!notes) {
      nextErrors.notes = 'Les notes sont obligatoires'
    } else if (notes.length > FIELD_LIMITS.notes) {
      nextErrors.notes = `Maximum ${FIELD_LIMITS.notes} caractères`
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) {
      return
    }

    setSubmitting(true)
    setError('')
    setFieldErrors((current) => ({ ...current, terminal_id: '' }))

    try {
      if (mode === 'create') {
        await createDab(buildCreatePayload(formValues))
      } else {
        const payload = buildUpdatePayload(formValues, initialValues)
        await updateDab(dab.id, payload)
      }

      onSaved?.()
    } catch (errorResponse) {
      const status = errorResponse.response?.status
      const detail = await extractErrorDetails(errorResponse)

      if (status === 409) {
        setFieldErrors({ terminal_id: detail || 'Ce terminal_id est déjà utilisé' })
      } else {
        setError(detail)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{mode === 'create' ? 'Nouveau terminal' : 'Modifier le terminal'}</DialogTitle>
      <DialogContent dividers>
        {error ? <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert> : null}

        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              label="terminal_id"
              value={formValues.terminal_id}
              onChange={handleChange('terminal_id')}
              disabled={mode === 'edit'}
              error={Boolean(fieldErrors.terminal_id)}
              helperText={fieldErrors.terminal_id || 'Identifiant technique du terminal'}
              inputProps={{ maxLength: FIELD_LIMITS.terminal_id }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              label="Nom"
              value={formValues.nom}
              onChange={handleChange('nom')}
              error={Boolean(fieldErrors.nom)}
              helperText={fieldErrors.nom}
              inputProps={{ maxLength: FIELD_LIMITS.nom }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label="Adresse"
              value={formValues.adresse}
              onChange={handleChange('adresse')}
              error={Boolean(fieldErrors.adresse)}
              helperText={fieldErrors.adresse}
              inputProps={{ maxLength: FIELD_LIMITS.adresse }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              label="IP address"
              value={formValues.ip_address}
              onChange={handleChange('ip_address')}
              error={Boolean(fieldErrors.ip_address)}
              helperText={fieldErrors.ip_address || 'Ex: 192.168.1.10'}
              inputProps={{ maxLength: FIELD_LIMITS.ip_address }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              type="number"
              label="SSH port"
              value={formValues.ssh_port}
              onChange={handleChange('ssh_port')}
              error={Boolean(fieldErrors.ssh_port)}
              helperText={fieldErrors.ssh_port}
              inputProps={{ min: 1, max: 65535 }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              label="SSH login"
              value={formValues.ssh_login}
              onChange={handleChange('ssh_login')}
              error={Boolean(fieldErrors.ssh_login)}
              helperText={fieldErrors.ssh_login}
              inputProps={{ maxLength: FIELD_LIMITS.ssh_login }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required={mode === 'create'}
              type="password"
              label="SSH password"
              value={formValues.ssh_password}
              onChange={handleChange('ssh_password')}
              error={Boolean(fieldErrors.ssh_password)}
              helperText={fieldErrors.ssh_password || (mode === 'edit' ? 'Laisser vide si vous ne souhaitez pas le modifier' : undefined)}
              autoComplete="new-password"
              inputProps={{ maxLength: FIELD_LIMITS.ssh_password }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              label="Chemin remote"
              value={formValues.chemin_remote}
              onChange={handleChange('chemin_remote')}
              error={Boolean(fieldErrors.chemin_remote)}
              helperText={fieldErrors.chemin_remote}
              inputProps={{ maxLength: FIELD_LIMITS.chemin_remote }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              label="Cardless PAN"
              value={formValues.cardless_pan}
              onChange={handleChange('cardless_pan')}
              error={Boolean(fieldErrors.cardless_pan)}
              helperText={fieldErrors.cardless_pan || '12 à 20 chiffres'}
              inputProps={{ maxLength: FIELD_LIMITS.cardless_pan }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              multiline
              minRows={3}
              label="Notes"
              value={formValues.notes}
              onChange={handleChange('notes')}
              error={Boolean(fieldErrors.notes)}
              helperText={fieldErrors.notes}
              inputProps={{ maxLength: FIELD_LIMITS.notes }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              select
              label="Statut"
              value={String(formValues.actif)}
              onChange={(event) => {
                const nextValue = event.target.value === 'true'
                setFormValues((current) => ({ ...current, actif: nextValue }))
              }}
            >
              <MenuItem value="true">Actif</MenuItem>
              <MenuItem value="false">Inactif</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Annuler</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
          {mode === 'create' ? 'Créer' : 'Enregistrer'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}