/** Tile attribute used for rent choropleth and filtering. */
export const METRIC_RENT_FIELD = 'MEDIAN_RENT'

/** Tile attribute used for mortgage choropleth and filtering. */
export const METRIC_MORTGAGE_FIELD = 'MEDIAN_MORTGAGE'

/** State name on USAStates / USACounties tiles (POI geography + hover titles). */
export const STATE_NAME_FIELD = 'STATE_NAME'

export const STATE_SOURCE_LAYER = 'USAStates-9wvuu8'
export const COUNTY_SOURCE_LAYER = 'USACounties-dd49p2'

/** Vector source ids in rent-style.json. */
export const CHOROPLETH_STATE_SOURCE_ID = 'rent-states'
export const CHOROPLETH_COUNTY_SOURCE_ID = 'rent-counties'

export const CHOROPLETH_STATE_FILL_LAYER_ID = 'rent-state-fill'
export const CHOROPLETH_COUNTY_FILL_LAYER_ID = 'rent-county-fill'
export const CHOROPLETH_STATE_LINE_LAYER_ID = 'rent-state-14x3h1'
export const CHOROPLETH_COUNTY_LINE_LAYER_ID = 'rent-county-4255ie'

export const CHOROPLETH_FILL_LAYER_IDS = [
    CHOROPLETH_STATE_FILL_LAYER_ID,
    CHOROPLETH_COUNTY_FILL_LAYER_ID,
] as const

/** Layers that receive price / POI filter contributions from the filter store. */
export const CHOROPLETH_FILTER_LAYER_IDS = [
    CHOROPLETH_STATE_FILL_LAYER_ID,
    CHOROPLETH_COUNTY_FILL_LAYER_ID,
    CHOROPLETH_STATE_LINE_LAYER_ID,
    CHOROPLETH_COUNTY_LINE_LAYER_ID,
] as const

export type HomeMetric = 'rent' | 'mortgage'

const METRIC_CHANGED = 'metric-changed'

let activeMetric: HomeMetric = 'rent'

export function getActiveMetric(): HomeMetric {
    return activeMetric
}

export function getActiveValueField(): string {
    return activeMetric === 'rent' ? METRIC_RENT_FIELD : METRIC_MORTGAGE_FIELD
}

export function setActiveMetric(metric: HomeMetric): void {
    if (activeMetric === metric) return
    activeMetric = metric
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(METRIC_CHANGED, { detail: { metric } }))
    }
}

export function onMetricChanged(handler: (metric: HomeMetric) => void): () => void {
    if (typeof window === 'undefined') return () => {}
    const listener = (e: Event): void => {
        const metric = (e as CustomEvent<{ metric?: HomeMetric }>).detail?.metric
        handler(metric === 'mortgage' ? 'mortgage' : 'rent')
    }
    window.addEventListener(METRIC_CHANGED, listener)
    return () => window.removeEventListener(METRIC_CHANGED, listener)
}
