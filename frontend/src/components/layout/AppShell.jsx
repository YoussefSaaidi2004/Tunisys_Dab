import { useMemo, useState } from 'react'
import { AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, Button, Divider } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import SecurityIcon from '@mui/icons-material/Security'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import AssessmentIcon from '@mui/icons-material/Assessment'
import MenuIcon from '@mui/icons-material/Menu'
import { NavLink } from 'react-router-dom'

import { useAuth } from '../../auth/AuthContext'

const drawerWidth = 280

const navigationByRole = {
  ADMIN: [
    { label: 'Dashboard', to: '/', icon: <DashboardIcon /> },
    { label: 'Import TX', to: '/import', icon: <CloudUploadIcon /> },
    { label: 'Terminaux', to: '/terminaux', icon: <AccountTreeIcon /> },
    { label: 'Transactions', to: '/transactions', icon: <ReceiptLongIcon /> },
    { label: 'Rapports', to: '/rapports', icon: <AssessmentIcon /> },
    { label: 'Gestion des utilisateurs', to: '/utilisateurs', icon: <ManageAccountsIcon /> },
    { label: 'Journal d’audit', to: '/audit', icon: <SecurityIcon /> },
  ],
  SUPERVISOR: [
    { label: 'Dashboard', to: '/', icon: <DashboardIcon /> },
    { label: 'Import TX', to: '/import', icon: <CloudUploadIcon /> },
    { label: 'Transactions', to: '/transactions', icon: <ReceiptLongIcon /> },
    { label: 'Rapports', to: '/rapports', icon: <AssessmentIcon /> },
    { label: 'Cycles', to: '/cycles', icon: <AccountTreeIcon /> },
  ],
  AGENT: [
    { label: 'Dashboard', to: '/', icon: <DashboardIcon /> },
    { label: 'Transactions', to: '/transactions', icon: <ReceiptLongIcon /> },
  ],
  AUDITOR: [
    { label: 'Dashboard', to: '/', icon: <DashboardIcon /> },
    { label: 'Rapports', to: '/rapports', icon: <AssessmentIcon /> },
    { label: 'Journal d’audit', to: '/audit', icon: <SecurityIcon /> },
  ],
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navigation = useMemo(() => navigationByRole[user?.role] || [], [user?.role])

  const drawerContent = (
    <Box sx={{ p: 2, height: '100%', background: 'linear-gradient(180deg, rgba(13,23,40,.96), rgba(7,17,31,.96))' }}>
      <Typography variant="overline" sx={{ letterSpacing: 3, color: 'rgba(255,255,255,0.58)' }}>
        Tunisys DAB
      </Typography>
      <Typography variant="h5" sx={{ mt: 0.5, mb: 2 }}>
        Contrôle centralisé
      </Typography>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
      <List disablePadding>
        {navigation.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            sx={{
              mb: 1,
              borderRadius: 2,
              '&.active': { backgroundColor: 'rgba(31,122,236,0.18)' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0} sx={{ background: 'rgba(7,17,31,0.9)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen((value) => !value)} sx={{ mr: 2, display: { md: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Tableau de bord DAB</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.68)' }}>
              Connecté en tant que {user?.login} · {user?.role}
            </Typography>
          </Box>
          <Button variant="outlined" color="inherit" onClick={logout}>
            Déconnexion
          </Button>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth } }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', borderRight: '1px solid rgba(255,255,255,0.08)' } }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, p: 3, pt: 10 }}>
        {children}
      </Box>
    </Box>
  )
}
