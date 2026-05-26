import type { Map as MapboxMap } from 'mapbox-gl'
import type { MapTrio } from './create'
import type { HomeMetric } from './choroplethConfig'
import {
    CHOROPLETH_FILL_LAYER_IDS,
    getActiveMetric,
    getActiveValueField,
    onMetricChanged,
} from './choroplethConfig'
import { buildFillColorExpression, getLegendStopsForMetric } from './legendStops'
import {
    applyFiltersToAllMapsForce,
    applyMetricRange,
    refreshPoiGeographyFilter,
} from '../filters'
let choroplethMaps: MapboxMap[] = []

/**
 * Set fill-color ramps from the active metric field (MEDIAN_RENT or MEDIAN_MORTGAGE).
 */
function applyRuntimeChoroplethPaint(map: MapboxMap): void {
    if (!map.isStyleLoaded()) return

    const metric = getActiveMetric()
    const field = getActiveValueField()
    const { normal, hover } = getLegendStopsForMetric(metric)
    const expr = buildFillColorExpression(field, normal, hover)

    for (const layerId of CHOROPLETH_FILL_LAYER_IDS) {
        if (!map.getLayer(layerId)) continue
        try {
            map.setPaintProperty(layerId, 'fill-color', expr as never)
        } catch (err) {
            console.warn(`[choropleth] setPaintProperty failed on ${layerId}`, err)
        }
    }
}

/** Apply paint now and again after the map finishes rendering (Standard style can lag). */
function applyRuntimeChoroplethPaintWithRetry(map: MapboxMap): void {
    applyRuntimeChoroplethPaint(map)
    requestAnimationFrame(() => applyRuntimeChoroplethPaint(map))
    map.once('idle', () => applyRuntimeChoroplethPaint(map))
}

function applyRuntimePaintAllMaps(): void {
    for (const map of choroplethMaps) applyRuntimeChoroplethPaintWithRetry(map)
}

function reapplyFilters(): void {
    refreshPoiGeographyFilter()
    applyFiltersToAllMapsForce()
}

function onHomeMetricChanged(_metric: HomeMetric): void {
    // Clear price filter for the new metric (full min–max range) before re-applying POI geography.
    applyMetricRange({ min: null, max: null })
    applyRuntimePaintAllMaps()
    reapplyFilters()
}

/**
 * Call after `setActiveMetric` so fill-color uses MEDIAN_RENT or MEDIAN_MORTGAGE.
 * Safe to call from sidebar even though `onMetricChanged` also runs.
 */
export function refreshChoroplethPaint(): void {
    applyRuntimePaintAllMaps()
}

function onStyleReady(): void {
    applyRuntimePaintAllMaps()
    reapplyFilters()
}

/**
 * Metric changes update choropleth paint (rent vs mortgage field + stops).
 * Updates fill-color from MEDIAN_RENT / MEDIAN_MORTGAGE at runtime; re-applies POI/budget filters.
 */
export function initChoroplethPaint({ mainMap, hawaiiMap, alaskaMap }: MapTrio): void {
    choroplethMaps = [mainMap, hawaiiMap, alaskaMap]

    for (const map of choroplethMaps) {
        map.on('style.load', onStyleReady)
    }

    onMetricChanged((metric) => onHomeMetricChanged(metric))

    onStyleReady()
}
