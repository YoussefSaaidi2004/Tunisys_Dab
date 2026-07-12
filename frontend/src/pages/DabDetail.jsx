import { useParams } from 'react-router-dom'
import { Box, Typography } from '@mui/material'

import AppShell from '../components/layout/AppShell'
import CassetteEventsPanel from '../components/cassettes/CassetteEventsPanel'
import CassetteStateCards from '../components/cassettes/CassetteStateCards'

export default function DabDetail() {
  const { id } = useParams()
  const atmId = Number(id)

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          DAB #{id}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.68)' }}>
          Consultation des événements cassettes du terminal.
        </Typography>
      </Box>

      <CassetteStateCards atmId={atmId} />
      <CassetteEventsPanel atmId={atmId} />
    </AppShell>
  )
}