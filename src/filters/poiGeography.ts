import {
    clearFilterContributions,
    setFilterContributions,
    type LayerContribution,
} from './filterStore'
import { getVisiblePoiGeography, hasSavedPoi } from '../poi'
import {
    COUNTY_NAME_FIELDS,
    COUNTY_STATE_FIELD,
    STATE_NAME_FIELD,
    countyLabelVariants,
    isUnknownCountyLabel,
    stateLabelVariants,
} from '../geo/countyMatch'
import {
    CHOROPLETH_COUNTY_FILL_LAYER_ID,
    CHOROPLETH_COUNTY_LINE_LAYER_ID,
    CHOROPLETH_STATE_FILL_LAYER_ID,
    CHOROPLETH_STATE_LINE_LAYER_ID,
} from '../map/choroplethConfig'

const SOURCE_ID = 'poiGeography'

function buildStateExpr(states: string[]): unknown | null {
    if (states.length === 0) return ['==', ['literal', 1], 0]

    const labels = new Set<string>()
    for (const state of states) {
        for (const v of stateLabelVariants(state)) labels.add(v)
    }

    return ['in', ['get', STATE_NAME_FIELD], ['literal', [...labels]]]
}

function countyFieldEqualsAnyVariant(field: string, variants: string[]): unknown[] {
    return variants.map((label) => ['==', ['get', field], label] as unknown)
}

function buildPairClause(state: string, county: string): unknown {
    const stateVariants = stateLabelVariants(state)
    const stateMatch =
        stateVariants.length === 1
            ? (['==', ['get', COUNTY_STATE_FIELD], stateVariants[0]] as unknown)
            : (['in', ['get', COUNTY_STATE_FIELD], ['literal', stateVariants]] as unknown)

    if (isUnknownCountyLabel(county)) {
        return stateMatch
    }

    const countyVariants = countyLabelVariants(county)
    const countyMatchPerField = COUNTY_NAME_FIELDS.map((field) => [
        'any',
        ...countyFieldEqualsAnyVariant(field, countyVariants),
    ])

    return ['all', stateMatch, ['any', ...countyMatchPerField]]
}

function buildCountyExpr(pairs: ReadonlyArray<{ state: string; county: string }>): unknown | null {
    if (pairs.length === 0) return ['==', ['literal', 1], 0]

    const clauses = pairs.map(({ state, county }) => buildPairClause(state, county))
    return ['any', ...clauses]
}

function applyGeographyFilter(): void {
    if (!hasSavedPoi()) {
        clearFilterContributions(SOURCE_ID)
        return
    }

    const geo = getVisiblePoiGeography()

    if (geo.states.length === 0) {
        // No visible POI geography — remove POI filter so the full map shows.
        clearFilterContributions(SOURCE_ID)
        return
    }

    const stateExpr = buildStateExpr(geo.states)
    const countyExpr = buildCountyExpr(geo.pairs)

    const contributions: LayerContribution[] = [
        { layerId: CHOROPLETH_STATE_FILL_LAYER_ID, expr: stateExpr },
        { layerId: CHOROPLETH_STATE_LINE_LAYER_ID, expr: stateExpr },
        { layerId: CHOROPLETH_COUNTY_FILL_LAYER_ID, expr: countyExpr },
        { layerId: CHOROPLETH_COUNTY_LINE_LAYER_ID, expr: countyExpr },
    ]

    setFilterContributions(SOURCE_ID, contributions)
}

/** Re-apply POI state/county visibility filter (e.g. after a style swap). */
export function refreshPoiGeographyFilter(): void {
    applyGeographyFilter()
}

/** Register POI geography filtering. Per-map style reload is handled by `filterStore`. */
export function initPoiGeographyFilter(): void {
    const refresh = (): void => applyGeographyFilter()

    window.addEventListener('poi-counts-changed', refresh)
    window.addEventListener('poi-visibility-changed', refresh)
    refresh()
}
