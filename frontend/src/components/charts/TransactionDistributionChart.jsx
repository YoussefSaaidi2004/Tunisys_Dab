import { Card, CardContent, Typography, Box } from '@mui/material'
import { BarChart, Bar, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from 'recharts'

export default function TransactionDistributionChart({ data = [] }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Distribution des montants
        </Typography>
        <Box sx={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="terminal" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="montant" fill="#1f7aec" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  )
}
