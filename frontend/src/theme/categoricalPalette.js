// Palette catégorielle validée (dataviz skill) pour la surface sombre de
// l'app (fond paper #0d1728, cf. main.jsx). Ordre fixe = mécanisme de
// sécurité CVD (daltonisme) : ne jamais réordonner ni cycler ces valeurs.
// Validé via scripts/validate_palette.js --mode dark --surface "#0d1728".
export const CATEGORICAL_PALETTE_DARK = [
  '#3987e5', // 1 blue
  '#199e70', // 2 aqua
  '#c98500', // 3 yellow
  '#008300', // 4 green
  '#9085e9', // 5 violet
  '#e66767', // 6 red
  '#d55181', // 7 magenta
  '#d95926', // 8 orange
]

// Bucket neutre pour les séries au-delà des 8 emplacements catégoriels
// (jamais une teinte générée — cf. règle "9th series = Autres").
export const OTHER_SERIES_COLOR = '#898781'

export const CHART_SURFACE_COLOR = '#0d1728'
