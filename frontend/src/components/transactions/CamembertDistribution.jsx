import { Box, Stack, Typography } from '@mui/material'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { CHART_SURFACE_COLOR } from '../../theme/categoricalPalette'
import { couleurPourDab } from '../../utils/couleursDab'

const CHART_HEIGHT = 320
// Prevoit jusqu'a 2 lignes de legende (8 DAB + libelles longs) sans clipper.
const LEGEND_HEIGHT = 56
const PLOT_HEIGHT = CHART_HEIGHT - LEGEND_HEIGHT
const LABEL_THRESHOLD_POURCENT = 5
const LEGEND_MAX_CHARS = 22

function formatMontant(value) {
  return `${Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} DT`
}

function formatPourcentage(value) {
  return `${Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

function truncateLabel(value) {
  const text = String(value || '')
  return text.length > LEGEND_MAX_CHARS ? `${text.slice(0, LEGEND_MAX_CHARS - 1)}…` : text
}

function renderSliceLabel(entry) {
  return entry.pourcentage >= LABEL_THRESHOLD_POURCENT ? formatPourcentage(entry.pourcentage) : null
}

function CamembertTooltip({ active, payload }) {
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
            {formatPourcentage(entry.pourcentage)}
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

export default function CamembertDistribution({ data, montantGlobal, couleurs }) {
  if (!data || data.length === 0) {
    return null
  }

  return (
    <Box sx={{ height: CHART_HEIGHT }}>
      <Box sx={{ position: 'relative', height: PLOT_HEIGHT }}>
        <ResponsiveContainer width="100%" height={PLOT_HEIGHT}>
          <PieChart>
            <Pie
              data={data}
              dataKey="montant_total"
              nameKey="nom"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={95}
              startAngle={90}
              endAngle={-270}
              label={renderSliceLabel}
              labelLine={false}
              isAnimationActive={false}
            >
              {data.map((entry) => (
                <Cell key={entry.atm_id} fill={couleurPourDab(couleurs, entry.atm_id)} stroke={CHART_SURFACE_COLOR} strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip content={<CamembertTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Total
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {formatMontant(montantGlobal)}
          </Typography>
        </Box>
      </Box>

      {/* Legende custom : construite depuis `data` (ordre serveur) plutot
          que la <Legend> Recharts par defaut, dont l'ordre de rendu ne
          suit pas toujours celui des tranches du camembert. */}
      <Stack
        direction="row"
        flexWrap="wrap"
        justifyContent="center"
        columnGap={2}
        rowGap={0.5}
        sx={{ maxHeight: LEGEND_HEIGHT, overflowY: 'auto', overflowX: 'hidden', px: 1 }}
      >
        {data.map((entry) => (
          <Stack key={entry.atm_id} direction="row" alignItems="center" spacing={0.75} title={entry.nom}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: couleurPourDab(couleurs, entry.atm_id), flexShrink: 0 }} />
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.68)', whiteSpace: 'nowrap' }}>
              {truncateLabel(entry.nom)}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}
