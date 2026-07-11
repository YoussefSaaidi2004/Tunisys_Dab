import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import ToggleOffIcon from '@mui/icons-material/ToggleOff'
import ToggleOnIcon from '@mui/icons-material/ToggleOn'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'

import ShuffleIcon from '@mui/icons-material/Shuffle'

import { useAuth } from '../auth/AuthContext'
import AppShell from '../components/layout/AppShell'

import UserAffectationsDialog from '../components/users/UserAffectationsDialog'
import UserFormDialog from '../components/users/UserFormDialog'
import { createUser, listUsers, updateUser } from '../services/utilisateursService'
const ROLE_OPTIONS = ['ADMIN', 'SUPERVISOR', 'AGENT', 'AUDITOR']
const STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'true', label: 'Actifs' },
  { value: 'false', label: 'Inactifs' },
]
const ROWS_PER_PAGE_OPTIONS = [10, 20, 50]

function formatDateTime(value) {
  if (!value) {
    return 'Jamais'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getRoleChipColor(role) {
  switch (role) {
    case 'ADMIN':
      return 'error'
    case 'SUPERVISOR':
      return 'primary'
    case 'AGENT':
      return 'secondary'
    case 'AUDITOR':
      return 'default'
    default:
      return 'default'
  }
}

function getStatusChipColor(active) {
  return active ? 'success' : 'default'
}

export default function GestionUtilisateurs() {
  const { logout } = useAuth()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[0])
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [actif, setActif] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [affectationsOpen, setAffectationsOpen] = useState(false)
  const [affectationsUser, setAffectationsUser] = useState(null)
  
  const [mutatingUserId, setMutatingUserId] = useState(null)
  

  const pageParams = useMemo(
    () => ({
      page: page + 1,
      page_size: rowsPerPage,
      search,
      role,
      actif,
    }),
    [page, rowsPerPage, search, role, actif],
  )

  const handleSessionExpired = useCallback(async () => {
    await logout()
  }, [logout])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await listUsers(pageParams)
      const payload = response.data?.data
      const nextItems = Array.isArray(payload?.items) ? payload.items : []
      setItems(nextItems)
      setTotal(Number(payload?.total ?? response.data?.meta?.total ?? nextItems.length))
    } catch (err) {
      const status = err.response?.status
      if (status === 401 || status === 403) {
        await handleSessionExpired()
        window.location.assign('/login')
        return
      }

      const message = err.response?.data?.message || err.response?.data?.detail || err.message || 'Impossible de charger les utilisateurs'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [handleSessionExpired, pageParams])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity })
  }

  const closeSnackbar = () => {
    setSnackbar((current) => ({ ...current, open: false }))
  }

  const openCreateDialog = () => {
    setEditingUser(null)
    setFormOpen(true)
  }

  const openEditDialog = (user) => {
    setEditingUser(user)
    setFormOpen(true)
  }

  const handleSaveUser = async (payload) => {
    try {
      if (editingUser) {
        await updateUser(editingUser.id, payload)
        showSnackbar('Utilisateur modifié avec succès', 'success')
      } else {
        await createUser(payload)
        showSnackbar('Utilisateur créé avec succès', 'success')
      }

      setFormOpen(false)
      setEditingUser(null)
      await loadUsers()
    } catch (err) {
      const status = err.response?.status
      if (status === 401 || status === 403) {
        await handleSessionExpired()
        window.location.assign('/login')
        throw err
      }

      const message = err.response?.data?.message || err.response?.data?.detail || err.message || 'Impossible d’enregistrer l’utilisateur'
      showSnackbar(message, 'error')
      throw err
    }
  }

  const handleToggleActive = async (user) => {
    setMutatingUserId(user.id)
    try {
      await updateUser(user.id, { actif: !user.actif })
      showSnackbar(user.actif ? 'Utilisateur désactivé' : 'Utilisateur activé', 'success')
      await loadUsers()
    } catch (err) {
      const status = err.response?.status
      if (status === 401 || status === 403) {
        await handleSessionExpired()
        window.location.assign('/login')
        return
      }

      showSnackbar(err.response?.data?.message || err.response?.data?.detail || err.message || 'Impossible de modifier le statut', 'error')
    } finally {
      setMutatingUserId(null)
    }
  }

  

  const handleRetry = () => {
    void loadUsers()
  }

  const handleSearchChange = (event) => {
    setSearch(event.target.value)
    setPage(0)
  }

  const handleRoleChange = (event) => {
    setRole(event.target.value)
    setPage(0)
  }

  const handleStatusChange = (event) => {
    setActif(event.target.value)
    setPage(0)
  }

  const handleChangePage = (_event, nextPage) => {
    setPage(nextPage)
  }

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(Number(event.target.value))
    setPage(0)
  }

  const openAffectations = (user) => {
    setAffectationsUser(user)
    setAffectationsOpen(true)
  }

  

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Gestion des utilisateurs
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
          Administration des comptes, des rôles et des affectations DAB des agents.
        </Typography>
      </Box>

      <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent sx={{ display: 'grid', gap: 2 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between">
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ flex: 1 }}>
              <TextField label="Rechercher" value={search} onChange={handleSearchChange} fullWidth size="small" placeholder="Login, nom ou email" />

              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="role-filter-label">Rôle</InputLabel>
                <Select labelId="role-filter-label" label="Rôle" value={role} onChange={handleRoleChange}>
                  <MenuItem value="">Tous</MenuItem>
                  {ROLE_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="status-filter-label">Statut</InputLabel>
                <Select labelId="status-filter-label" label="Statut" value={actif} onChange={handleStatusChange}>
                  {STATUS_OPTIONS.map((option) => (
                    <MenuItem key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog} sx={{ alignSelf: { xs: 'stretch', lg: 'flex-start' } }}>
              Nouvel utilisateur
            </Button>
          </Stack>

          {error ? (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={handleRetry}>Réessayer</Button>}>
              {error}
            </Alert>
          ) : null}

          {loading ? (
            <Box sx={{ py: 4, display: 'grid', placeItems: 'center' }}>
              <CircularProgress />
            </Box>
          ) : null}

          {!loading && items.length === 0 && !error ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Aucun utilisateur
              </Typography>
              <Typography color="text.secondary">Aucun compte ne correspond aux filtres appliqués.</Typography>
            </Box>
          ) : null}

          {!loading && items.length > 0 ? (
            <Box sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Login</TableCell>
                    <TableCell>Nom</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Rôle</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell>Dernière connexion</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((user) => (
                    <TableRow key={user.id} hover>
                      <TableCell>{user.login}</TableCell>
                      <TableCell>{user.nom}</TableCell>
                      <TableCell>{user.email || '-'}</TableCell>
                      <TableCell>
                        <Chip size="small" color={getRoleChipColor(user.role)} icon={user.role === 'ADMIN' ? <AdminPanelSettingsIcon /> : <AccountCircleIcon />} label={user.role} />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" color={getStatusChipColor(user.actif)} label={user.actif ? 'Actif' : 'Inactif'} />
                      </TableCell>
                      <TableCell>{formatDateTime(user.derniere_connexion)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap">
                          <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => openEditDialog(user)}>
                            Modifier
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color={user.actif ? 'warning' : 'success'}
                            startIcon={user.actif ? <ToggleOffIcon /> : <ToggleOnIcon />}
                            onClick={() => handleToggleActive(user)}
                            disabled={mutatingUserId === user.id}
                          >
                            {user.actif ? 'Désactiver' : 'Activer'}
                          </Button>
                          {user.role === 'AGENT' ? (
                            <Button size="small" variant="outlined" startIcon={<ShuffleIcon />} onClick={() => openAffectations(user)}>
                              Affectations
                            </Button>
                          ) : null}
                          
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ) : null}

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
          />
        </CardContent>
      </Card>

      <UserFormDialog
        open={formOpen}
        mode={editingUser ? 'edit' : 'create'}
        user={editingUser}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSaveUser}
      />

      <UserAffectationsDialog
        open={affectationsOpen}
        user={affectationsUser}
        onClose={() => setAffectationsOpen(false)}
      />

      

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={closeSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={closeSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AppShell>
  )
}