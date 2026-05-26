/**
 * POI search subsystem.
 *
 * `poiSearch.ts` owns:
 *   - The Mapbox Search Box client (suggest + forward calls)
 *   - In-memory state for saved POIs and per-query batches
 *   - The `poi-counts-changed` event used by the filter store
 *   - All UI wiring for the search input, suggestion list, and pills
 *
 * Public surface stays in this barrel so callers don't reach into the file.
 */
export {
  initPoiSearch,
  getPoiCountsSnapshot,
  getVisiblePoiGeography,
  getPoiLegendRows,
  setPoiBatchVisible,
  notifyPoiLegendUpdated,
  hasSavedPoi,
  type PoiCountsSnapshot,
  type PoiGeography,
  type PoiLegendRow,
} from './poiSearch'
