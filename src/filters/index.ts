/**
 * Public API for the map filter system.
 *
 * Add a new filter:
 *   1. Create `./<name>.ts` exporting setter/clearer functions that call
 *      `setFilterContributions(sourceId, [...])` from `./filterStore`.
 *   2. Re-export its public surface from this barrel.
 *   3. Wire the UI to those functions.
 */

export { applyFiltersToAllMapsForce, registerFilterMaps } from './filterStore'
export { initPoiGeographyFilter, refreshPoiGeographyFilter } from './poiGeography'
export {
    applyMetricRange,
    clearMetricRange,
    type MetricRange,
} from './rent'
