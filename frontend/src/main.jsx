import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'

import App from './App'
import { AuthProvider } from './auth/AuthContext'
import './styles.css'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#1f7aec' },
    secondary: { main: '#15b8a6' },
    background: {
      default: '#07111f',
      paper: '#0d1728',
    },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h4: { fontWeight: 800 },
    h5: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 700 },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
