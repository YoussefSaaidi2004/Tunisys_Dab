const DEFAULT_ROUTE_BY_ROLE = {
  ADMIN: '/',
  SUPERVISOR: '/',
  AGENT: '/transactions',
  AUDITOR: '/cycles',
}

export function getDefaultRouteForRole(role) {
  return DEFAULT_ROUTE_BY_ROLE[role] || '/login'
}
