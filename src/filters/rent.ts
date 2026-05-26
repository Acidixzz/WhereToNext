import { getActiveValueField } from '../map/choroplethConfig'
import { setFilterContributions, type LayerContribution } from './filterStore'
import {
    CHOROPLETH_COUNTY_FILL_LAYER_ID,
    CHOROPLETH_COUNTY_LINE_LAYER_ID,
    CHOROPLETH_STATE_FILL_LAYER_ID,
    CHOROPLETH_STATE_LINE_LAYER_ID,
    METRIC_MORTGAGE_FIELD,
    METRIC_RENT_FIELD,
} from '../map/choroplethConfig'

/**
 * Price-range filter for state and county polygon layers.
 * Uses the active home metric field (MEDIAN_RENT or MEDIAN_MORTGAGE).
 */

const SOURCE_ID = 'metricRange'

export const METRIC_RENT = METRIC_RENT_FIELD
export const METRIC_MORTGAGE = METRIC_MORTGAGE_FIELD

export type MetricRange = {
    min: number | null
    max: number | null
}


function buildPriceExpr(range: MetricRange, field: string): unknown | null {
    if (range.min === null && range.max === null) return null

    const inRange: unknown[] = ['all', ['has', field]]
    if (range.min !== null) {
        inRange.push(['>=', ['to-number', ['get', field], 0], range.min])
    }
    if (range.max !== null) {
        inRange.push(['<=', ['to-number', ['get', field], 0], range.max])
    }

    return ['any', ['!', ['has', field]], inRange]
}

export function applyMetricRange(range: MetricRange): void {
    const field = getActiveValueField()
    const expr = buildPriceExpr(range, field)

    const contributions: LayerContribution[] = [
        { layerId: CHOROPLETH_STATE_FILL_LAYER_ID, expr },
        { layerId: CHOROPLETH_STATE_LINE_LAYER_ID, expr },
        { layerId: CHOROPLETH_COUNTY_FILL_LAYER_ID, expr },
        { layerId: CHOROPLETH_COUNTY_LINE_LAYER_ID, expr },
    ]

    setFilterContributions(SOURCE_ID, contributions)
}

export function clearMetricRange(): void {
    applyMetricRange({ min: null, max: null })
}
