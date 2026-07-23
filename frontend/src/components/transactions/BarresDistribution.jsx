import { Box, Stack, Typography } from '@mui/material'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { CHART_SURFACE_COLOR } from '../../theme/categoricalPalette'
import { couleurPourDab } from '../../utils/couleursDab'

const CHART_HEIGHT = 320
const MAX_BAR_SIZE = 60
const ANGLE_THRESHOLD_COUNT = 6

function formatMontant(value) {
  return `${Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} DT`
}

function formatMontantCompact(value) {
  const amount = Number(value || 0)
  const abs = Math.abs(amount)

  if (abs >= 1_000_000) {
    return `${(amount / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`
  }
  if (abs >= 1_000) {
    return `${(amount / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k`
  }
  return amount.toLocaleString('fr-FR')
}

function BarresTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null

  const entry = payload[0].payload

  return (
    <Box
      sx={{
        bgcolor: CHART_SURFACE_COLOR,
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 1.5,
        p: 1.5,
        minWidth: 220,
      }}
    >
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.68)' }}>
        {entry.nom} ({entry.terminal_id})
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.75 }}>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.68)' }}>
            Montant
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {formatMontant(entry.montant_total)}
          </Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.68)' }}>
            Part
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {Number(entry.pourcentage || 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
          </Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.68)' }}>
            Transactions
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {Number(entry.nb_transactions || 0).toLocaleString('fr-FR')}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  )
}

export default function BarresDistribution({ data, couleurs }) {
  if (!data || data.length === 0) {
    return null
  }

  const useAngledTicks = data.length > ANGLE_THRESHOLD_COUNT

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: useAngledTicks ? 24 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
        <XAxis
          dataKey="terminal_id"
          interval={0}
          angle={useAngledTicks ? -35 : 0}
          textAnchor={useAngledTicks ? 'end' : 'middle'}
        />
        <YAxis tickFormatter={formatMontantCompact} width={64} />
        <Tooltip content={<BarresTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="montant_total" name="Montant distribué" radius={[4, 4, 0, 0]} maxBarSize={MAX_BAR_SIZE} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell key={entry.atm_id} fill={couleurPourDab(couleurs, entry.atm_id)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
