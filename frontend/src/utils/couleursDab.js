import { CATEGORICAL_PALETTE_DARK, OTHER_SERIES_COLOR } from '../theme/categoricalPalette'

const MAX_COLORED_DAB = CATEGORICAL_PALETTE_DARK.length

// Couleur déterministe par DAB, alignée sur la règle déjà utilisée par
// DailyDistributionChart (page Transactions) : le rang d'un DAB dans la
// liste complète des DAB triée par id fixe sa couleur, indépendamment du
// sous-ensemble affiché sur un graphique donné. Deux graphiques montrant le
// même DAB sur la même page affichent donc toujours la même couleur, et un
// DAB qui sort du top 8 catégoriel bascule sur la teinte "Autres" neutre.
export function buildCouleursParDab(dabs) {
  const ordered = [...(dabs || [])].sort((a, b) => a.id - b.id)
  const couleurs = new Map()

  ordered.forEach((dab, index) => {
    couleurs.set(dab.id, index < MAX_COLORED_DAB ? CATEGORICAL_PALETTE_DARK[index] : OTHER_SERIES_COLOR)
  })

  return couleurs
}

export function couleurPourDab(couleurs, atmId) {
  return couleurs?.get(atmId) || OTHER_SERIES_COLOR
}
