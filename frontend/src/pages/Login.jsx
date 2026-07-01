import { useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Container, TextField, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ login: '', motDePasse: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(form.login, form.motDePasse)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Échec de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', py: 4 }}>
      <Card sx={{ width: '100%', background: 'linear-gradient(180deg, rgba(13,23,40,.92), rgba(7,17,31,.96))', border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="overline" sx={{ letterSpacing: 3, color: 'rgba(255,255,255,0.62)' }}>
              Solution centralisée DAB
            </Typography>
            <Typography variant="h4" sx={{ mt: 1 }}>
              Connexion
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.68)', mt: 1 }}>
              Accès sécurisé au portail de supervision bancaire.
            </Typography>
          </Box>

          {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

          <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
            <TextField
              label="Login"
              value={form.login}
              onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Mot de passe"
              type="password"
              value={form.motDePasse}
              onChange={(event) => setForm((current) => ({ ...current, motDePasse: event.target.value }))}
              fullWidth
            />
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  )
}
