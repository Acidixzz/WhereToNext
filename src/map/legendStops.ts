import type { HomeMetric } from './choroplethConfig'

export type LegendStop = {
    value: number
    color: string
}

const RENT_COLORS = ['#f3e79b', '#f8a07e', '#ce6693', '#5c53a5'] as const
const RENT_HOVER_COLORS = ['#e0cf84', '#e28769', '#b5547d', '#4a4387'] as const

/** Normal rent choropleth stops ($800–$2,200). */
export const MEDIAN_RENT_LEGEND_STOPS: readonly LegendStop[] = [
    { value: 800, color: RENT_COLORS[0] },
    { value: 1200, color: RENT_COLORS[1] },
    { value: 1600, color: RENT_COLORS[2] },
    { value: 2200, color: RENT_COLORS[3] },
] as const

/** Darker rent stops used when feature-state hover is true. */
export const MEDIAN_RENT_HOVER_STOPS: readonly LegendStop[] = [
    { value: 800, color: RENT_HOVER_COLORS[0] },
    { value: 1200, color: RENT_HOVER_COLORS[1] },
    { value: 1600, color: RENT_HOVER_COLORS[2] },
    { value: 2200, color: RENT_HOVER_COLORS[3] },
] as const

/** Mortgage stops ($1,000–$3,000), same color ramp spacing as rent. */
export const MEDIAN_MORTGAGE_LEGEND_STOPS: readonly LegendStop[] = [
    { value: 1000, color: RENT_COLORS[0] },
    { value: 1571, color: RENT_COLORS[1] },
    { value: 2143, color: RENT_COLORS[2] },
    { value: 3000, color: RENT_COLORS[3] },
] as const

export const MEDIAN_MORTGAGE_HOVER_STOPS: readonly LegendStop[] = [
    { value: 1000, color: RENT_HOVER_COLORS[0] },
    { value: 1571, color: RENT_HOVER_COLORS[1] },
    { value: 2143, color: RENT_HOVER_COLORS[2] },
    { value: 3000, color: RENT_HOVER_COLORS[3] },
] as const

export function getLegendStopsForMetric(metric: HomeMetric): {
    normal: readonly LegendStop[]
    hover: readonly LegendStop[]
} {
    return metric === 'mortgage'
        ? { normal: MEDIAN_MORTGAGE_LEGEND_STOPS, hover: MEDIAN_MORTGAGE_HOVER_STOPS }
        : { normal: MEDIAN_RENT_LEGEND_STOPS, hover: MEDIAN_RENT_HOVER_STOPS }
}

/** Mapbox interpolate: index 2 is the input; stops after that must be literal numbers. */
function stopsToInterpolate(stops: readonly LegendStop[], field: string): unknown[] {
    const flat: unknown[] = ['interpolate', ['linear'], ['get', field]]
    for (const s of stops) {
        flat.push(s.value, s.color)
    }
    return flat
}

/** Mapbox `fill-color` expression with hover branch for a numeric tile field. */
export function buildFillColorExpression(
    field: string,
    normalStops: readonly LegendStop[],
    hoverStops: readonly LegendStop[],
): unknown {
    return [
        'case',
        ['to-boolean', ['feature-state', 'hover']],
        stopsToInterpolate(hoverStops, field),
        stopsToInterpolate(normalStops, field),
    ]
}

/** Build a left-to-right CSS gradient matching Mapbox stop positions. */
export function rampGradientCss(stops: readonly LegendStop[]): string {
    const sorted = [...stops].sort((a, b) => a.value - b.value)
    const min = sorted[0].value
    const max = sorted[sorted.length - 1].value
    const span = max - min || 1
    const parts = sorted.map((s) => {
        const pct = ((s.value - min) / span) * 100
        return `${s.color} ${pct}%`
    })
    return `linear-gradient(to right, ${parts.join(', ')})`
}

