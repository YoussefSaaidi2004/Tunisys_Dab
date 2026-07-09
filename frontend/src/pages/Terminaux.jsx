import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import ToggleOnIcon from '@mui/icons-material/ToggleOn'
import ToggleOffIcon from '@mui/icons-material/ToggleOff'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'

import { deactivateDab, deleteDab, fetchDabList, updateDab } from '../api/endpoints/dabs'
import AppShell from '../components/layout/AppShell'
import DabFormDialog from '../components/dab/DabFormDialog'

function statusChipSx(actif) {
  if (actif) {
    return {
      color: '#4caf50',
      borderColor: 'rgba(76,175,80,0.45)',
      backgroundColor: 'rgba(76,175,80,0.12)',
    }
  }

  return {
    color: 'rgba(255,255,255,0.66)',
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  }
}

async function extractErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') {
    return detail
  }

  return error.message || fallback
}

export default function Terminaux() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState('create')
  const [selectedDab, setSelectedDab] = useState(null)
  const [actionBusyId, setActionBusyId] = useState(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [dabToDelete, setDabToDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const orderedRows = useMemo(() => rows.slice().sort((left, right) => String(left.terminal_id).localeCompare(String(right.terminal_id))), [rows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()

    return orderedRows.filter((dab) => {
      if (statusFilter === 'active' && !dab.actif) return false
      if (statusFilter === 'inactive' && dab.actif) return false

      if (!query) return true

      return [dab.terminal_id, dab.nom, dab.adresse]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [orderedRows, search, statusFilter])

  const handleResetFilters = () => {
    setSearch('')
    setStatusFilter('all')
  }

  const loadDabs = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetchDabList()
      setRows(response.data?.data || [])
    } catch (err) {
      setRows([])
      setError(err.response?.data?.detail || err.message || 'Impossible de charger les terminaux')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDabs()
  }, [])

  const handleOpenCreate = () => {
    setSelectedDab(null)
    setDialogMode('create')
    setDialogOpen(true)
  }

  const handleOpenEdit = (dab) => {
    setSelectedDab(dab)
    setDialogMode('edit')
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setSelectedDab(null)
  }

  const handleOpenDeleteDialog = (dab) => {
    setDabToDelete(dab)
    setDeleteDialogOpen(true)
  }

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setDabToDelete(null)
  }

  const handleSaved = async () => {
    setDialogOpen(false)
    setSelectedDab(null)
    await loadDabs()
  }

  const handleToggleStatus = async (dab) => {
    setActionBusyId(dab.id)
    setError('')

    try {
      if (dab.actif) {
        await deactivateDab(dab.id)
      } else {
        await updateDab(dab.id, { actif: true })
      }
      await loadDabs()
    } catch (err) {
      setError(await extractErrorMessage(err, 'Impossible de modifier le statut du terminal'))
    } finally {
      setActionBusyId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!dabToDelete) {
      return
    }

    setActionBusyId(dabToDelete.id)
    setError('')

    try {
      await deleteDab(dabToDelete.id)
      handleCloseDeleteDialog()
      await loadDabs()
    } catch (err) {
      setError(await extractErrorMessage(err, 'Impossible de supprimer le terminal'))
    } finally {
      setActionBusyId(null)
    }
  }

  return (
    <AppShell>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 1 }}>
            Gestion des terminaux DAB
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
            Création, édition et activation des terminaux de test.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
          Nouveau terminal
        </Button>
      </Box>

      {error ? <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert> : null}

      <Card sx={{ mb: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Rechercher"
                placeholder="ID terminal, nom ou adresse"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                select
                label="Statut"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <MenuItem value="all">Tous les statuts</MenuItem>
                <MenuItem value="active">Actif</MenuItem>
                <MenuItem value="inactive">Inactif</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={3} sx={{ display: 'flex', alignItems: 'center' }}>
              <Button variant="outlined" onClick={handleResetFilters}>
                Réinitialiser
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <TableContainer component={Paper} sx={{ background: 'transparent', boxShadow: 'none', borderRadius: 0, overflowX: 'auto' }}>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Terminal ID</TableCell>
                  <TableCell>Nom</TableCell>
                  <TableCell>Adresse</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={`terminal-skeleton-${index}`}>
                    {Array.from({ length: 5 }).map((__unused, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton variant="text" width={cellIndex === 1 ? 180 : 120} />
                      </TableCell>
                    ))}
                  </TableRow>
                )) : null}

                {!loading && filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ py: 8, textAlign: 'center' }}>
                      <Typography variant="body1" color="text.secondary">
                        {rows.length === 0 ? 'Aucun terminal n’est disponible' : 'Aucun terminal ne correspond à ces critères'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null}

                {!loading && filteredRows.map((dab) => (
                  <TableRow key={dab.id} hover>
                    <TableCell>{dab.terminal_id}</TableCell>
                    <TableCell>{dab.nom}</TableCell>
                    <TableCell>{dab.adresse || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={dab.actif ? 'Actif' : 'Inactif'}
                        size="small"
                        variant="outlined"
                        sx={statusChipSx(dab.actif)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <IconButton
                          color="inherit"
                          onClick={() => navigate(`/dab/${dab.id}`)}
                          aria-label="Voir les cassettes du terminal"
                        >
                          <VisibilityOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          color="inherit"
                          onClick={() => handleOpenEdit(dab)}
                          aria-label="Modifier le terminal"
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          color="inherit"
                          onClick={() => handleOpenDeleteDialog(dab)}
                          disabled={actionBusyId === dab.id}
                          aria-label="Supprimer le terminal"
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          color="inherit"
                          onClick={() => handleToggleStatus(dab)}
                          disabled={actionBusyId === dab.id}
                          aria-label={dab.actif ? 'Désactiver le terminal' : 'Réactiver le terminal'}
                        >
                          {dab.actif ? <ToggleOffIcon fontSize="small" /> : <ToggleOnIcon fontSize="small" />}
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <DabFormDialog
        open={dialogOpen}
        mode={dialogMode}
        dab={selectedDab}
        onClose={handleCloseDialog}
        onSaved={handleSaved}
      />

      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Supprimer le terminal</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {dabToDelete
              ? `Le terminal ${dabToDelete.terminal_id} - ${dabToDelete.nom} sera supprimé définitivement de la base, ainsi que toutes ses données liées (transactions, cassettes, cycles de trésorerie, affectations). Cette action est irréversible.`
              : 'Cette action supprime définitivement le terminal et toutes ses données liées.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={actionBusyId === dabToDelete?.id}>
            Annuler
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={actionBusyId === dabToDelete?.id}
          >
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  )
}