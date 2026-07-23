import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

import { getAffectations, getDabSelecteur, setAffectations } from '../../services/utilisateursService'

const LIST_HEIGHT = 340

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function extractErrorMessage(error, fallback) {
  return error.response?.data?.message || error.response?.data?.detail || error.message || fallback
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function TransferColumn({
  titre,
  items,
  coches,
  onToggleCoche,
  onToggleTout,
  onDoubleClickItem,
  ariaLabelledBy,
  rechercheActive,
  rechercheValeur,
  enfant,
}) {
  const total = items.length
  const nbCoches = items.filter((item) => coches.has(item.atm_id)).length
  const tousCoches = total > 0 && nbCoches === total
  const partiel = nbCoches > 0 && nbCoches < total

  return (
    <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }} role="region" aria-labelledby={ariaLabelledBy}>
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography id={ariaLabelledBy} variant="subtitle1" sx={{ fontWeight: 600 }}>
          {titre} ({total})
        </Typography>
      </Box>

      {enfant}

      <Divider />

      <FormControlLabel
        sx={{ mx: 0, px: 1, py: 0.25 }}
        control={
          <Checkbox
            size="small"
            checked={tousCoches}
            indeterminate={partiel}
            disabled={total === 0}
            onChange={(event) => onToggleTout(event.target.checked)}
          />
        }
        label={
          <Typography variant="body2" color="text.secondary">
            Tout sélectionner
          </Typography>
        }
      />

      <Divider />

      <List dense sx={{ height: LIST_HEIGHT, overflow: 'auto' }}>
        {total === 0 ? (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {rechercheActive ? `Aucun résultat pour "${rechercheValeur}"` : `Aucun ${titre.toLowerCase()}`}
            </Typography>
          </Box>
        ) : (
          items.map((item) => {
            const coche = coches.has(item.atm_id)
            return (
              <ListItemButton
                key={item.atm_id}
                dense
                onClick={() => onToggleCoche(item.atm_id)}
                onDoubleClick={() => onDoubleClickItem(item.atm_id)}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox edge="start" checked={coche} tabIndex={-1} disableRipple size="small" />
                </ListItemIcon>
                <ListItemText
                  primary={`${item.terminal_id} — ${item.nom}`}
                  secondary={item.adresse || undefined}
                />
                {item.actif === false ? <Chip size="small" color="warning" label="Inactif" sx={{ ml: 1 }} /> : null}
              </ListItemButton>
            )
          })
        )}
      </List>
    </Paper>
  )
}

const AffectationDabTransferList = forwardRef(function AffectationDabTransferList(
  { utilisateurId, role, onSaved, disabled },
  ref,
) {
  const [tousLesDab, setTousLesDab] = useState([])
  const [affectesIds, setAffectesIds] = useState(new Set())
  const [initialIds, setInitialIds] = useState(new Set())
  const [cochesDisponibles, setCochesDisponibles] = useState(new Set())
  const [cochesAffectes, setCochesAffectes] = useState(new Set())
  const [recherche, setRecherche] = useState('')
  const [chargement, setChargement] = useState(true)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })
  const [confirmationOuverte, setConfirmationOuverte] = useState(false)

  const pendingCloseRef = useRef(null)
  const estAgent = role === 'AGENT'

  useEffect(() => {
    if (!utilisateurId || !estAgent) {
      setChargement(false)
      return
    }

    let monte = true
    setChargement(true)
    setErreur('')

    Promise.all([getDabSelecteur(), getAffectations(utilisateurId)])
      .then(([dabResponse, affectationsResponse]) => {
        if (!monte) return
        const dabs = dabResponse.data?.data || []
        const affectations = affectationsResponse.data?.data || []
        const ids = new Set(affectations.map((item) => item.atm_id))

        setTousLesDab(dabs)
        setAffectesIds(ids)
        setInitialIds(new Set(ids))
        setCochesDisponibles(new Set())
        setCochesAffectes(new Set())
      })
      .catch((err) => {
        if (!monte) return
        setErreur(extractErrorMessage(err, 'Impossible de charger les affectations'))
      })
      .finally(() => {
        if (monte) setChargement(false)
      })

    return () => {
      monte = false
    }
  }, [utilisateurId, estAgent])

  const disponibles = useMemo(
    () => tousLesDab.filter((dab) => !affectesIds.has(dab.atm_id)),
    [tousLesDab, affectesIds],
  )
  const affectes = useMemo(
    () => tousLesDab.filter((dab) => affectesIds.has(dab.atm_id)),
    [tousLesDab, affectesIds],
  )

  const rechercheNormalisee = normalizeText(recherche)
  const disponiblesFiltres = useMemo(() => {
    if (!rechercheNormalisee) return disponibles
    return disponibles.filter(
      (dab) => normalizeText(dab.terminal_id).includes(rechercheNormalisee) || normalizeText(dab.nom).includes(rechercheNormalisee),
    )
  }, [disponibles, rechercheNormalisee])

  const estModifie = !setsEqual(affectesIds, initialIds)

  const showSnackbar = (message, severity = 'success') => setSnackbar({ open: true, message, severity })
  const closeSnackbar = () => setSnackbar((current) => ({ ...current, open: false }))

  const toggleCocheDisponible = (atmId) => {
    setCochesDisponibles((current) => {
      const next = new Set(current)
      if (next.has(atmId)) next.delete(atmId)
      else next.add(atmId)
      return next
    })
  }

  const toggleCocheAffecte = (atmId) => {
    setCochesAffectes((current) => {
      const next = new Set(current)
      if (next.has(atmId)) next.delete(atmId)
      else next.add(atmId)
      return next
    })
  }

  const toggleToutDisponible = (checked) => {
    setCochesDisponibles(checked ? new Set(disponiblesFiltres.map((d) => d.atm_id)) : new Set())
  }

  const toggleToutAffecte = (checked) => {
    setCochesAffectes(checked ? new Set(affectes.map((d) => d.atm_id)) : new Set())
  }

  const deplacerVersAffectes = (atmIds) => {
    setAffectesIds((current) => {
      const next = new Set(current)
      atmIds.forEach((id) => next.add(id))
      return next
    })
    setCochesDisponibles((current) => {
      const next = new Set(current)
      atmIds.forEach((id) => next.delete(id))
      return next
    })
  }

  const deplacerVersDisponibles = (atmIds) => {
    setAffectesIds((current) => {
      const next = new Set(current)
      atmIds.forEach((id) => next.delete(id))
      return next
    })
    setCochesAffectes((current) => {
      const next = new Set(current)
      atmIds.forEach((id) => next.delete(id))
      return next
    })
  }

  const handleAjouter = () => deplacerVersAffectes([...cochesDisponibles])
  const handleRetirer = () => deplacerVersDisponibles([...cochesAffectes])
  const handleDoubleClickDisponible = (atmId) => deplacerVersAffectes([atmId])
  const handleDoubleClickAffecte = (atmId) => deplacerVersDisponibles([atmId])

  const handleAnnuler = () => {
    setAffectesIds(new Set(initialIds))
    setCochesDisponibles(new Set())
    setCochesAffectes(new Set())
  }

  const handleEnregistrer = async () => {
    setEnregistrement(true)
    setErreur('')

    try {
      const response = await setAffectations(utilisateurId, [...affectesIds])
      const resultat = response.data?.data || {}
      const nbAjoutes = resultat.ajoutes?.length ?? 0
      const nbRetires = resultat.retires?.length ?? 0

      setInitialIds(new Set(affectesIds))
      showSnackbar(`Affectations enregistrées — ${nbAjoutes} ajout(s), ${nbRetires} retrait(s)`, 'success')
      onSaved?.(resultat)
    } catch (err) {
      showSnackbar(extractErrorMessage(err, 'Impossible d’enregistrer les affectations'), 'error')
    } finally {
      setEnregistrement(false)
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      requestClose: (onConfirmedClose) => {
        if (estModifie) {
          pendingCloseRef.current = onConfirmedClose
          setConfirmationOuverte(true)
          return false
        }
        onConfirmedClose()
        return true
      },
    }),
    [estModifie],
  )

  if (!estAgent) {
    return (
      <Alert severity="info">
        Les affectations de DAB ne s’appliquent qu’au rôle AGENT. Les autres rôles disposent d’un accès à l’ensemble des terminaux.
      </Alert>
    )
  }

  return (
    <Box>
      {erreur ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {erreur}
        </Alert>
      ) : null}

      {chargement ? (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Skeleton variant="rounded" height={LIST_HEIGHT + 88} />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }} />
          <Grid size={{ xs: 12, md: 5 }}>
            <Skeleton variant="rounded" height={LIST_HEIGHT + 88} />
          </Grid>
        </Grid>
      ) : (
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, md: 5 }}>
            <TransferColumn
              titre="DAB disponibles"
              items={disponiblesFiltres}
              coches={cochesDisponibles}
              onToggleCoche={toggleCocheDisponible}
              onToggleTout={toggleToutDisponible}
              onDoubleClickItem={handleDoubleClickDisponible}
              ariaLabelledBy="affectation-dab-disponibles-titre"
              rechercheActive={Boolean(rechercheNormalisee)}
              rechercheValeur={recherche}
              enfant={
                <Box sx={{ px: 1.5, pb: 1 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Rechercher par ID ou nom…"
                    value={recherche}
                    onChange={(event) => setRecherche(event.target.value)}
                    disabled={disabled}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                        ),
                        endAdornment: recherche ? (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setRecherche('')} aria-label="Effacer la recherche">
                              <ClearIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        ) : null,
                      },
                    }}
                  />
                </Box>
              }
            />
          </Grid>

          <Grid size={{ xs: 12, md: 2 }}>
            <Stack
              direction={{ xs: 'row', md: 'column' }}
              spacing={1.5}
              alignItems="center"
              justifyContent="center"
              sx={{ height: '100%' }}
            >
              <Button
                variant="outlined"
                size="small"
                onClick={handleAjouter}
                disabled={disabled || cochesDisponibles.size === 0}
                startIcon={<ArrowForwardIcon sx={{ display: { xs: 'none', md: 'inline-flex' } }} />}
                aria-label="Ajouter les DAB sélectionnés"
                sx={{ minWidth: 140 }}
              >
                Ajouter → ({cochesDisponibles.size})
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleRetirer}
                disabled={disabled || cochesAffectes.size === 0}
                startIcon={<ArrowBackIcon sx={{ display: { xs: 'none', md: 'inline-flex' } }} />}
                aria-label="Retirer les DAB sélectionnés"
                sx={{ minWidth: 140 }}
              >
                ← Retirer ({cochesAffectes.size})
              </Button>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <TransferColumn
              titre="DAB affectés"
              items={affectes}
              coches={cochesAffectes}
              onToggleCoche={toggleCocheAffecte}
              onToggleTout={toggleToutAffecte}
              onDoubleClickItem={handleDoubleClickAffecte}
              ariaLabelledBy="affectation-dab-affectes-titre"
              rechercheActive={false}
              rechercheValeur=""
              enfant={null}
            />
          </Grid>
        </Grid>
      )}

      <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button onClick={handleAnnuler} disabled={disabled || chargement || enregistrement || !estModifie}>
          Annuler
        </Button>
        <Button
          variant="contained"
          onClick={handleEnregistrer}
          disabled={disabled || chargement || enregistrement || !estModifie}
          startIcon={enregistrement ? <CircularProgress size={20} color="inherit" /> : null}
        >
          Enregistrer
        </Button>
      </Stack>

      <Dialog open={confirmationOuverte} onClose={() => setConfirmationOuverte(false)}>
        <DialogTitle>Modifications non enregistrées</DialogTitle>
        <DialogContent>
          <Typography>Des modifications n’ont pas été enregistrées. Quitter quand même ?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmationOuverte(false)}>Annuler</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setConfirmationOuverte(false)
              pendingCloseRef.current?.()
            }}
          >
            Quitter quand même
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={closeSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={closeSnackbar} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
})

export default AffectationDabTransferList
