import { Box, Typography } from '@mui/material'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function formatAmount(value) {
  return Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

export default function DistributionByTerminalChart({ data, series }) {
  if (!data || data.length === 0) {
    return (
      <Box sx={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Aucune distribution sur cette période
        </Typography>
      </Box>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip
          formatter={(value, name) => [`${formatAmount(value)} DT`, name]}
          labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate || label}
        />
        <Legend />
        {series.map((item) => (
          <Bar key={item.key} dataKey={item.key} name={item.name} fill={item.color} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
