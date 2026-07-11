import { Box, Stack, Typography } from '@mui/material'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { CATEGORICAL_PALETTE_DARK, CHART_SURFACE_COLOR, OTHER_SERIES_COLOR } from '../../theme/categoricalPalette'

const MAX_COLORED_SERIES = CATEGORICAL_PALETTE_DARK.length
const OTHER_KEY = 'autres'

function formatAmount(value) {
  return Number(value || 0).toLocaleString('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

function formatDateLabel(value) {
  if (!value) return ''
  const text = String(value)
  if (!text.includes('-')) return text
  const [year, month, day] = text.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

// Assigne une couleur fixe par DAB à partir de la liste complète (triée par
// id), indépendamment du sous-ensemble actuellement sélectionné : un DAB
// garde toujours la même couleur, un filtre qui change la sélection ne
// "repeint" jamais les séries déjà affichées.
function buildSeriesMeta(dabs) {
  const ordered = [...(dabs || [])].sort((a, b) => a.id - b.id)
  const meta = new Map()
  ordered.forEach((dab, index) => {
    if (index >= MAX_COLORED_SERIES) return
    meta.set(dab.id, {
      key: `atm_${dab.id}`,
      name: `${dab.nom} (${dab.terminal_id})`,
      color: CATEGORICAL_PALETTE_DARK[index],
    })
  })
  return meta
}

function pivotByDate(rows, seriesMeta) {
  const byDate = new Map()

  rows.forEach((row) => {
    const dateKey = row.date_operation
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { dateKey, label: formatDateLabel(dateKey), total: 0 })
    }
    const entry = byDate.get(dateKey)
    const meta = seriesMeta.get(row.atm_id)
    const seriesKey = meta ? meta.key : OTHER_KEY
    entry[seriesKey] = (entry[seriesKey] || 0) + Number(row.montant_total || 0)
    entry.total += Number(row.montant_total || 0)
  })

  return Array.from(byDate.values()).sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1))
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null

  const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0)
  const rows = [...payload].reverse()

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
        {label}
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.75 }}>
        {rows.map((entry) => (
          <Stack key={entry.dataKey} direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 10, height: 2, bgcolor: entry.color, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.68)' }}>
                {entry.name}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {formatAmount(entry.value)} DT
            </Typography>
          </Stack>
        ))}
        {rows.length > 1 ? (
          <Stack
            direction="row"
            justifyContent="space-between"
            sx={{ mt: 0.5, pt: 0.75, borderTop: '1px solid rgba(255,255,255,0.12)' }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Total
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {formatAmount(total)} DT
            </Typography>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  )
}

export default function DailyDistributionChart({ data, dabs }) {
  const seriesMeta = buildSeriesMeta(dabs)
  const chartData = pivotByDate(data || [], seriesMeta)

  if (chartData.length === 0) {
    return (
      <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Aucune donnée à afficher sur la période
        </Typography>
      </Box>
    )
  }

  const presentAtmIds = new Set((data || []).map((row) => row.atm_id))
  const hasOverflow = (data || []).some((row) => !seriesMeta.has(row.atm_id))

  const series = Array.from(seriesMeta.entries())
    .filter(([atmId]) => presentAtmIds.has(atmId))
    .map(([, meta]) => meta)

  if (hasOverflow) {
    series.push({ key: OTHER_KEY, name: 'Autres DAB', color: OTHER_SERIES_COLOR })
  }

  const isSingleSeries = series.length <= 1

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        {!isSingleSeries ? <Legend wrapperStyle={{ paddingTop: 12 }} /> : null}
        {isSingleSeries ? (
          <Bar
            dataKey={series[0]?.key || 'total'}
            name={series[0]?.name || 'Montant distribué'}
            fill={series[0]?.color || CATEGORICAL_PALETTE_DARK[0]}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
          />
        ) : (
          series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.name}
              stackId="jour"
              fill={item.color}
              stroke={CHART_SURFACE_COLOR}
              strokeWidth={2}
              radius={index === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={24}
            />
          ))
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}
