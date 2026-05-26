import mapboxgl from 'mapbox-gl'
import {
  ALASKA_BOUNDS,
  HAWAII_BOUNDS,
  lngLatInBounds,
  US_MAINLAND_BOUNDS,
  US_MAINLAND_SEARCH_BBOX,
} from '../geo/bounds'
import { pickCountyStateFromTileProps } from '../geo/countyMatch'
import { US_STATE_SEARCH_ANCHORS } from '../geo/stateAnchors'
import { CHOROPLETH_COUNTY_FILL_LAYER_ID } from '../map/choroplethConfig'

const SEARCH_BOX_FORWARD = 'https://api.mapbox.com/search/searchbox/v1/forward'
const SEARCH_BOX_SUGGEST = 'https://api.mapbox.com/search/searchbox/v1/suggest'

/** Space out Search Box calls to reduce 429 rate-limit risk (~50 per Add). */
const REQUEST_GAP_MS = 90

/** Debounce Mapbox `/suggest` while typing (separate from forward anchor batching). */
const SUGGEST_DEBOUNCE_MS = 280

/** Bias suggest results toward the continental US (lng, lat). */
const US_SUGGEST_PROXIMITY = '-98,39'

type SearchBoxProperties = {
  name?: string
  address?: string
  full_address?: string
  mapbox_id?: string
  feature_type?: string
  place_formatted?: string
  context?: {
    region?: { name?: string }
    district?: { name?: string }
  }
  brand?: string[]
  brand_id?: string[]
  poi_category_ids?: string[]
}

/** From `/suggest` — used to narrow nationwide `/forward` results to a chain or category. */
type SearchBoxSuggestion = {
  name: string
  name_preferred?: string
  mapbox_id: string
  feature_type: string
  place_formatted: string
  brand?: string[]
  brand_id?: string[]
  poi_category_ids?: string[]
}

/**
 * When the user picks an autocomplete row, forward hits are filtered to features
 * that share the same brand IDs, brand names, or POI category IDs when present.
 */
type PoiSelectionFilter = {
  /** Human-readable label (e.g. brand or category name). */
  label: string
  brandNames: string[]
  brandIds: string[]
  poiCategoryIds: string[]
}

type SavedPoi = {
  id: string
  name: string
  marker: mapboxgl.Marker
  map: mapboxgl.Map
}

type PoiAdminArea = {
  state: string
  county: string
}

export type PoiCountsSnapshot = {
  total: number
  byState: Record<string, number>
  byStateCounty: Record<string, Record<string, number>>
  byQuery: Record<
    string,
    {
      total: number
      byState: Record<string, number>
      byStateCounty: Record<string, Record<string, number>>
      pillStyle: {
        bg: string
        fg: string
        border: string
        markerFill: string
      } | null
    }
  >
}

const UNKNOWN_STATE = 'Unknown state'
const UNKNOWN_COUNTY = 'Unknown county'

/** County choropleth is visible from this zoom; tile query is most reliable here. */
const COUNTY_TILE_MIN_ZOOM = 6
const poiAdminById = new Map<string, PoiAdminArea>()
const poiQueryById = new Map<string, string>()
const poiPillStyleByQuery = new Map<
  string,
  {
    bg: string
    fg: string
    border: string
    markerFill: string
  }
>()

type QueryBatch = {
  queryLabel: string
  ids: string[]
  hue: number
  visible: boolean
}

const saved = new Map<string, SavedPoi>()
const queryBatches = new Map<string, QueryBatch>()
const countyByLngLatKey = new Map<string, string>()

function lngLatKey(lng: number, lat: number): string {
  return `${lng.toFixed(5)},${lat.toFixed(5)}`
}

function cleanLabel(v: string | undefined): string | undefined {
  if (!v) return undefined
  const out = v.trim()
  return out.length > 0 ? out : undefined
}

function parseStateCountyFromPlaceFormatted(
  placeFormatted: string | undefined,
): PoiAdminArea {
  const parts = (placeFormatted ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (parts.length === 0) {
    return { state: UNKNOWN_STATE, county: UNKNOWN_COUNTY }
  }

  const countryLike = /^(united states|usa|us)$/i
  const lastIdx = countryLike.test(parts[parts.length - 1]) ? parts.length - 2 : parts.length - 1
  const state = parts[lastIdx] ?? UNKNOWN_STATE

  const county =
    parts.find((p) =>
      /(county|borough|parish|census area|municipality)$/i.test(p),
    ) ?? UNKNOWN_COUNTY

  return { state, county }
}

function poiAdminArea(props: SearchBoxProperties | undefined): PoiAdminArea {
  const stateFromContext = cleanLabel(props?.context?.region?.name)
  const countyFromContext = cleanLabel(props?.context?.district?.name)

  if (stateFromContext && countyFromContext) {
    return { state: stateFromContext, county: countyFromContext }
  }

  const fallback = parseStateCountyFromPlaceFormatted(props?.place_formatted)
  return {
    state: stateFromContext ?? fallback.state,
    county: countyFromContext ?? fallback.county,
  }
}

function adminAreaFromCountyTiles(
  map: mapboxgl.Map,
  lng: number,
  lat: number,
): PoiAdminArea | null {
  if (!map.isStyleLoaded() || !map.getLayer(CHOROPLETH_COUNTY_FILL_LAYER_ID)) return null
  const pt = map.project([lng, lat])
  const feats = map.queryRenderedFeatures([pt.x, pt.y], {
    layers: [CHOROPLETH_COUNTY_FILL_LAYER_ID],
  })
  const props = feats[0]?.properties as Record<string, unknown> | undefined
  return pickCountyStateFromTileProps(props)
}

/** Align POI admin labels with county tile names (fixes geocode vs NAMELSAD mismatches). */
function refreshPoiAdminFromCountyTiles(map: mapboxgl.Map, ids: string[]): Promise<void> {
    const relevant = ids.filter((id) => saved.get(id)?.map === map)
    if (relevant.length === 0) return Promise.resolve()

    const apply = (): boolean => {
        if (map.getZoom() < COUNTY_TILE_MIN_ZOOM) return false
        let changed = false
        for (const id of relevant) {
            const poi = saved.get(id)
            if (!poi) continue
            const { lng, lat } = poi.marker.getLngLat()
            const hit = adminAreaFromCountyTiles(map, lng, lat)
            if (!hit) continue
            const cur = poiAdminById.get(id)
            if (!cur) continue
            if (cur.state === hit.state && cur.county === hit.county) continue
            poiAdminById.set(id, hit)
            changed = true
        }
        return changed
    }

    return new Promise((resolve) => {
        const finish = (): void => {
            resolve()
        }

        if (apply()) {
            finish()
            return
        }

        const onZoom = (): void => {
            if (map.getZoom() < COUNTY_TILE_MIN_ZOOM) return
            if (apply()) {
                map.off('zoomend', onZoom)
                finish()
            }
        }
        map.on('zoomend', onZoom)
        map.once('idle', () => {
            apply()
            map.off('zoomend', onZoom)
            finish()
        })
    })
}

function emitPoiCountsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('poi-counts-changed'))
}

function emitPoiVisibilityChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('poi-visibility-changed'))
}

/** Call at the end of legend POI row rendering (for tests or future hooks). */
export function notifyPoiLegendUpdated(): void {
  if (typeof window === 'undefined') return
  queueMicrotask(() => {
    window.dispatchEvent(new Event('poi-legend-updated'))
  })
}

function isPoiIdVisible(id: string): boolean {
  for (const batch of queryBatches.values()) {
    if (batch.ids.includes(id)) return batch.visible
  }
  return true
}

function setBatchMarkersVisible(batch: QueryBatch, visible: boolean): void {
  for (const id of batch.ids) {
    const poi = saved.get(id)
    if (!poi) continue
    const el = poi.marker.getElement()
    el.style.display = visible ? '' : 'none'
    el.style.pointerEvents = visible ? '' : 'none'
  }
}

export type PoiGeography = {
  states: string[]
  pairs: Array<{ state: string; county: string }>
}

export type PoiLegendRow = {
  runId: string
  label: string
  markerFill: string
  count: number
  visible: boolean
}

/** States / counties that have at least one marker from a visible search batch. */
export function getVisiblePoiGeography(): PoiGeography {
  const states = new Set<string>()
  const pairKeys = new Set<string>()
  const pairs: Array<{ state: string; county: string }> = []

  for (const batch of queryBatches.values()) {
    if (!batch.visible) continue
    for (const id of batch.ids) {
      const area = poiAdminById.get(id)
      if (!area) continue
      states.add(area.state)
      const key = `${area.state}\u0000${area.county}`
      if (!pairKeys.has(key)) {
        pairKeys.add(key)
        pairs.push({ state: area.state, county: area.county })
      }
    }
  }

  return { states: [...states], pairs }
}

export function hasSavedPoi(): boolean {
  return poiAdminById.size > 0
}

/** One legend row per saved search batch (includes hidden batches). */
export function getPoiLegendRows(): PoiLegendRow[] {
  const rows: PoiLegendRow[] = []
  for (const [runId, batch] of queryBatches.entries()) {
    const style = poiPillStyleByQuery.get(batch.queryLabel)
    if (!style) continue
    rows.push({
      runId,
      label: batch.queryLabel,
      markerFill: style.markerFill,
      count: batch.ids.length,
      visible: batch.visible,
    })
  }
  return rows
}

/** Show or hide a search batch: markers, legend row, and geography filter. */
export function setPoiBatchVisible(runId: string, visible: boolean): void {
  const batch = queryBatches.get(runId)
  if (!batch || batch.visible === visible) return
  batch.visible = visible
  setBatchMarkersVisible(batch, visible)
  emitPoiVisibilityChanged()
}

async function reverseGeocodeCounty(
  lng: number,
  lat: number,
  accessToken: string,
): Promise<string | null> {
  const key = lngLatKey(lng, lat)
  const cached = countyByLngLatKey.get(key)
  if (cached) return cached

  // Mapbox Geocoding: `district` is generally county-equivalent in the US.
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?types=district&limit=1&access_token=${encodeURIComponent(accessToken)}`

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as {
      features?: Array<{ text?: string; place_name?: string }>
    }
    const f = data.features?.[0]
    const county =
      (typeof f?.text === 'string' && f.text.trim().length > 0 ? f.text.trim() : null) ??
      (typeof f?.place_name === 'string' && f.place_name.trim().length > 0
        ? f.place_name.split(',')[0]?.trim()
        : null)
    if (!county) return null
    countyByLngLatKey.set(key, county)
    return county
  } catch {
    return null
  }
}

export function getPoiCountsSnapshot(): PoiCountsSnapshot {
  const byState: Record<string, number> = {}
  const byStateCounty: Record<string, Record<string, number>> = {}
  const byQuery: PoiCountsSnapshot['byQuery'] = {}

  for (const [id, area] of poiAdminById.entries()) {
    if (!isPoiIdVisible(id)) continue
    byState[area.state] = (byState[area.state] ?? 0) + 1
    const countyMap = (byStateCounty[area.state] ??= {})
    countyMap[area.county] = (countyMap[area.county] ?? 0) + 1

    const queryLabel = poiQueryById.get(id)
    if (!queryLabel) continue

    const queryCounts =
      (byQuery[queryLabel] ??= {
        total: 0,
        byState: {},
        byStateCounty: {},
        pillStyle: poiPillStyleByQuery.get(queryLabel) ?? null,
      })
    queryCounts.total += 1
    queryCounts.byState[area.state] = (queryCounts.byState[area.state] ?? 0) + 1
    const queryCountyMap = (queryCounts.byStateCounty[area.state] ??= {})
    queryCountyMap[area.county] = (queryCountyMap[area.county] ?? 0) + 1
  }

  let total = 0
  for (const id of poiAdminById.keys()) {
    if (isPoiIdVisible(id)) total += 1
  }

  return {
    total,
    byState,
    byStateCounty,
    byQuery,
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function circularHueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

function minHueSeparation(candidate: number, usedHues: number[]): number {
  return Math.min(...usedHues.map((h) => circularHueDistance(candidate, h)))
}

/** Midpoint of the widest empty arc between hues already on the wheel. */
function hueAtLargestGap(usedHues: number[]): number {
  const sorted = [...usedHues].sort((a, b) => a - b)
  let maxGap = 0
  let mid = sorted[0]
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    const end = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360
    const gap = end - start
    if (gap > maxGap) {
      maxGap = gap
      mid = (start + gap / 2) % 360
    }
  }
  return mid
}

/**
 * Picks a hue as far as possible from every hue already used by visible batches
 * (many random candidates + largest-gap fallback when the wheel is crowded).
 */
function pickDistinctHue(usedHues: number[]): number {
  if (usedHues.length === 0) return Math.random() * 360

  let bestRandom = 0
  let bestScore = -1
  for (let t = 0; t < 160; t++) {
    const candidate = Math.random() * 360
    const score = minHueSeparation(candidate, usedHues)
    if (score > bestScore) {
      bestScore = score
      bestRandom = candidate
    }
  }

  const gapHue = hueAtLargestGap(usedHues)
  const candidates = [bestRandom, gapHue]
  return candidates.reduce((a, b) =>
    minHueSeparation(a, usedHues) >= minHueSeparation(b, usedHues) ? a : b,
  )
}

/** One hue family per search batch so pills and map dots stay visually matched. */
function poiBatchStylesForHue(h: number): {
  markerFill: string
  pillBg: string
  pillFg: string
  pillBorder: string
} {
  const s = 52 + Math.random() * 28
  const markerL = 40 + Math.random() * 22
  return {
    markerFill: `hsl(${h} ${s}% ${markerL}%)`,
    pillBg: `hsl(${h} ${Math.min(s + 10, 82)}% 92%)`,
    pillFg: `hsl(${h} ${Math.min(s + 6, 78)}% 30%)`,
    pillBorder: `hsl(${h} ${s * 0.75}% 78%)`,
  }
}

function displayName(query: string, props: SearchBoxProperties | undefined): string {
  if (!props) return query
  if (props.full_address) return props.full_address
  const tail = props.place_formatted ? `, ${props.place_formatted}` : ''
  return `${props.name ?? query}${tail}`
}

function poiPopupPlaceTitle(query: string, props: SearchBoxProperties | undefined): string {
  const n = props?.name?.trim()
  return n && n.length > 0 ? n : query.trim()
}

/**
 * Street/locality line for the popup. Strips a leading POI name from `full_address` when Mapbox
 * returns "Name, street, city…" so the second line is not a duplicate of the title.
 */
function poiPopupAddressLine(
  props: SearchBoxProperties | undefined,
  placeTitle: string,
): string {
  if (!props) return ''

  const title = placeTitle.trim()
  const fa = props.full_address?.trim()
  if (fa) {
    const lowerFa = fa.toLowerCase()
    const lowerTitle = title.toLowerCase()
    const prefixed = `${title}, `
    if (lowerFa.startsWith(prefixed.toLowerCase())) {
      return fa.slice(prefixed.length).trim()
    }
    if (lowerTitle && lowerFa.startsWith(lowerTitle)) {
      return fa.slice(title.length).replace(/^[, ]\s*/, '').trim()
    }
    if (!lowerTitle || lowerFa === lowerTitle) {
      /* full_address is only the name — fall through */
    } else {
      return fa
    }
  }

  const parts: string[] = []
  if (props.address?.trim()) parts.push(props.address.trim())
  if (props.place_formatted?.trim()) parts.push(props.place_formatted.trim())
  return parts.join(', ')
}

function createPoiPopupElement(title: string, addressLine: string): HTMLElement {
  const root = document.createElement('div')
  root.style.maxWidth = '260px'

  const head = document.createElement('div')
  head.textContent = title
  head.style.fontWeight = '600'
  head.style.fontSize = '13px'
  head.style.lineHeight = '1.3'
  root.appendChild(head)

  if (addressLine.trim().length > 0) {
    const addr = document.createElement('div')
    addr.textContent = addressLine
    addr.style.marginTop = '6px'
    addr.style.fontSize = '12px'
    addr.style.lineHeight = '1.4'
    addr.style.opacity = '0.88'
    root.appendChild(addr)
  }

  return root
}

function isPoiFeature(props: SearchBoxProperties | undefined): boolean {
  return props?.feature_type === 'poi'
}

function targetMapForLngLat(
  lng: number,
  lat: number,
  mainMap: mapboxgl.Map,
  hawaiiMap: mapboxgl.Map,
  alaskaMap: mapboxgl.Map,
): mapboxgl.Map | null {
  if (lngLatInBounds(lng, lat, HAWAII_BOUNDS)) return hawaiiMap
  if (lngLatInBounds(lng, lat, ALASKA_BOUNDS)) return alaskaMap
  if (lngLatInBounds(lng, lat, US_MAINLAND_BOUNDS)) return mainMap
  return null
}

function featureDedupeKey(
  feature: GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties>,
): string {
  const props = feature.properties
  if (props?.mapbox_id && props.mapbox_id.length > 0) return props.mapbox_id
  const [lng, lat] = feature.geometry.coordinates
  return `${lng.toFixed(5)},${lat.toFixed(5)}`
}

function normStr(s: string): string {
  return s.trim().toLowerCase()
}

function brandsMatch(forwardBrand: string, wanted: string): boolean {
  const a = normStr(forwardBrand)
  const b = normStr(wanted)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

/**
 * Keeps forward results that align with the autocomplete row (brand / category / name).
 */
function forwardFeatureMatchesSelection(
  props: SearchBoxProperties | undefined,
  sel: PoiSelectionFilter,
): boolean {
  const ids = props?.brand_id ?? []
  const names = props?.brand ?? []
  const catIds = props?.poi_category_ids ?? []
  const poiName = normStr(props?.name ?? '')

  const checks: boolean[] = []

  if (sel.brandIds.length > 0)
    checks.push(sel.brandIds.some((id) => ids.includes(id)))

  if (sel.brandNames.length > 0) {
    checks.push(
      sel.brandNames.some((want) => names.some((b) => brandsMatch(b, want))) ||
      sel.brandNames.some((want) => poiName.includes(normStr(want))),
    )
  }

  if (sel.poiCategoryIds.length > 0)
    checks.push(sel.poiCategoryIds.some((id) => catIds.includes(id)))

  if (checks.length === 0) return true
  return checks.some(Boolean)
}

function poiFilterFromSuggestion(s: SearchBoxSuggestion): PoiSelectionFilter | null {
  const brands =
    s.brand?.filter((b): b is string => typeof b === 'string' && b.trim().length > 0) ?? []
  const ids =
    s.brand_id?.filter((b): b is string => typeof b === 'string' && b.length > 0) ?? []
  const cats =
    s.poi_category_ids?.filter((c): c is string => typeof c === 'string' && c.length > 0) ??
    []

  if (s.feature_type === 'category' && cats.length > 0) {
    return {
      label: s.name_preferred ?? s.name,
      brandNames: [],
      brandIds: [],
      poiCategoryIds: cats,
    }
  }

  if (s.feature_type === 'poi' && (ids.length > 0 || brands.length > 0)) {
    return {
      label: brands[0] ?? s.name_preferred ?? s.name,
      brandNames: brands.length > 0 ? brands : [s.name_preferred ?? s.name],
      brandIds: ids,
      poiCategoryIds: cats,
    }
  }

  if (s.feature_type === 'poi') {
    const anchor = normStr(s.name_preferred ?? s.name)
    if (anchor.length < 3) return null
    return {
      label: s.name_preferred ?? s.name,
      brandNames: [s.name_preferred ?? s.name],
      brandIds: [],
      poiCategoryIds: cats,
    }
  }

  return null
}

async function fetchSearchBoxSuggest(
  query: string,
  accessToken: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<SearchBoxSuggestion[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const params = new URLSearchParams({
    access_token: accessToken,
    q: trimmed,
    session_token: sessionToken,
    language: 'en',
    limit: '8',
    country: 'US',
    proximity: US_SUGGEST_PROXIMITY,
    bbox: US_MAINLAND_SEARCH_BBOX,
    types: 'poi,category',
  })

  const url = `${SEARCH_BOX_SUGGEST}?${params}`
  const res = await fetch(url, { signal })
  const text = await res.text()

  if (!res.ok) {
    let detail = text.slice(0, 240)
    try {
      const parsed = JSON.parse(text) as { message?: string }
      if (typeof parsed.message === 'string' && parsed.message.length > 0)
        detail = parsed.message
    } catch {
      /* ignore */
    }
    throw new Error(`Search Box suggest ${res.status}: ${detail}`)
  }

  let data: { suggestions?: SearchBoxSuggestion[] }
  try {
    data = JSON.parse(text) as { suggestions?: SearchBoxSuggestion[] }
  } catch {
    throw new Error('Search Box suggest returned invalid JSON.')
  }

  //remove duplicates since we only care about the business name
  const seen = new Set<string>();
  const filtered: SearchBoxSuggestion[] = [];

  for (const item of data.suggestions ?? []) {
    if (seen.has(item.name)) {
      continue;
    } else {
      seen.add(item.name);
      filtered.push(item);
    }
  }

  return filtered ?? []
}

async function fetchForwardRaw(
  query: string,
  accessToken: string,
  proximityLng: number,
  proximityLat: number,
  bbox: string,
  includeTypesPoi: boolean,
): Promise<GeoJSON.Feature[]> {
  const proximity = `${proximityLng},${proximityLat}`
  const params = new URLSearchParams({
    access_token: accessToken,
    q: query,
    limit: '10',
    country: 'US',
    bbox,
    proximity,
    language: 'en',
  })
  if (includeTypesPoi) params.set('types', 'poi')

  const url = `${SEARCH_BOX_FORWARD}?${params}`
  const res = await fetch(url)
  const text = await res.text()

  if (!res.ok) {
    let detail = text.slice(0, 240)
    try {
      const parsed = JSON.parse(text) as { message?: string }
      if (typeof parsed.message === 'string' && parsed.message.length > 0) {
        detail = parsed.message
      }
    } catch {
      /* keep raw snippet */
    }
    throw new Error(`Search Box ${res.status}: ${detail}`)
  }

  let data: GeoJSON.FeatureCollection
  try {
    data = JSON.parse(text) as GeoJSON.FeatureCollection
  } catch {
    throw new Error('Search Box returned invalid JSON.')
  }

  return data.features ?? []
}

async function searchBoxForwardAtProximity(
  query: string,
  accessToken: string,
  proximityLng: number,
  proximityLat: number,
  bbox: string,
): Promise<GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties>[]> {
  let raw = await fetchForwardRaw(
    query,
    accessToken,
    proximityLng,
    proximityLat,
    bbox,
    true,
  )
  let features = raw.filter(
    (f): f is GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties> =>
      f.geometry?.type === 'Point' && isPoiFeature(f.properties as SearchBoxProperties),
  )

  if (features.length === 0) {
    raw = await fetchForwardRaw(
      query,
      accessToken,
      proximityLng,
      proximityLat,
      bbox,
      false,
    )
    features = raw.filter(
      (f): f is GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties> =>
        f.geometry?.type === 'Point' && isPoiFeature(f.properties as SearchBoxProperties),
    )
  }

  return features
}

type NationwideSearchResult = {
  features: GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties>[]
  failedRequests: number
  firstError: string | undefined
}

async function searchAllStateAnchors(
  query: string,
  accessToken: string,
  onProgress: (completed: number, total: number) => void,
): Promise<NationwideSearchResult> {
  const merged = new Map<
    string,
    GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties>
  >()
  const total = US_STATE_SEARCH_ANCHORS.length
  let failedRequests = 0
  let firstError: string | undefined

  for (let i = 0; i < total; i++) {
    const anchor = US_STATE_SEARCH_ANCHORS[i]
    onProgress(i + 1, total)

    try {
      const batch = await searchBoxForwardAtProximity(
        query,
        accessToken,
        anchor.lng,
        anchor.lat,
        anchor.searchBbox,
      )

      for (const f of batch) {
        const key = featureDedupeKey(f)
        if (!merged.has(key)) merged.set(key, f)
      }
    } catch (e) {
      failedRequests += 1
      const msg = e instanceof Error ? e.message : String(e)
      if (!firstError) firstError = msg
      console.warn(`[POI search] ${anchor.state}:`, msg)
    }

    if (i < total - 1) {
      await new Promise((r) => window.setTimeout(r, REQUEST_GAP_MS))
    }
  }

  return {
    features: [...merged.values()],
    failedRequests,
    firstError,
  }
}

function formatSuggestionSubtitle(s: SearchBoxSuggestion): string {
  const parts: string[] = []
  if (s.feature_type === 'category') parts.push('Category')
  else if (s.feature_type === 'poi') parts.push('Place')

  const brandJoined = (s.brand ?? [])
    .filter((b): b is string => typeof b === 'string' && b.length > 0)
    .slice(0, 1)
    .join(' · ')
  if (brandJoined) parts.push(brandJoined)

  return parts.join(' · ')
}

export function initPoiSearch(
  mainMap: mapboxgl.Map,
  hawaiiMap: mapboxgl.Map,
  alaskaMap: mapboxgl.Map,
  accessToken: string,
): void {
  const input = document.querySelector<HTMLInputElement>('#poi-search-input')
  const addBtn = document.querySelector<HTMLButtonElement>('#poi-add-button')
  const status = document.querySelector<HTMLElement>('#poi-search-status')
  const list = document.querySelector<HTMLUListElement>('#poi-saved-list')
  const wrap = document.querySelector<HTMLElement>('#poi-search-wrap')
  const suggestList = document.querySelector<HTMLUListElement>('#poi-suggest-list')
  const filterHint = document.querySelector<HTMLElement>('#poi-brand-filter-hint')
  const filterText = document.querySelector<HTMLElement>('#poi-brand-filter-text')
  const stateProgress =
    document.querySelector<HTMLProgressElement>('#poi-state-progress')
  const clearFilterBtn =
    document.querySelector<HTMLButtonElement>('#poi-clear-suggest-filter')

  if (
    !input ||
    !addBtn ||
    !status ||
    !list ||
    !wrap ||
    !suggestList ||
    !filterHint ||
    !filterText ||
    !stateProgress ||
    !clearFilterBtn
  ) {
    return
  }

  const poiInput = input
  const poiAddBtn = addBtn
  const poiStatus = status
  const poiSavedList = list
  const poiSuggestList = suggestList
  const poiFilterHint = filterHint
  const poiFilterText = filterText
  const poiStateProgress = stateProgress
  const poiClearFilterBtn = clearFilterBtn
  const poiWrap = wrap

  let poiSelectionFilter: PoiSelectionFilter | null = null
  let suggestSessionToken = crypto.randomUUID()
  let suggestDebounce: ReturnType<typeof window.setTimeout> | undefined
  let suggestAbort: AbortController | null = null
  let lastSuggestions: SearchBoxSuggestion[] = []
  let activeSuggestIndex = -1

  /** `requestAnimationFrame` id for syncing popover geometry while scrolling/resizing */
  let syncSuggestRafId = 0

  function syncSuggestPopoverPosition(): void {
    if (poiSuggestList.classList.contains('hidden')) return

    const anchor = poiWrap.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8
    const gap = 4

    let left = anchor.left
    let width = anchor.width

    if (left < margin) {
      width -= margin - left
      left = margin
    }
    const maxRight = vw - margin
    if (left + width > maxRight) width = Math.max(120, maxRight - left)

    const top = anchor.bottom + gap
    const maxBottom = vh - margin
    const maxHeight = Math.min(13 * 16, Math.max(96, maxBottom - top))

    Object.assign(poiSuggestList.style, {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      maxHeight: `${maxHeight}px`,
      zIndex: '9999',
    })
  }

  function scheduleSuggestPopoverSync(): void {
    if (poiSuggestList.classList.contains('hidden')) return
    if (syncSuggestRafId !== 0) cancelAnimationFrame(syncSuggestRafId)
    syncSuggestRafId = requestAnimationFrame(() => {
      syncSuggestRafId = 0
      syncSuggestPopoverPosition()
    })
  }

  function refreshFilterHint(): void {
    if (!poiSelectionFilter) {
      poiFilterHint.classList.add('hidden')
      poiFilterText.textContent = ''
      return
    }

    poiFilterHint.classList.remove('hidden')
    poiFilterText.textContent = `Autocomplete filter: ${poiSelectionFilter.label}. Only POIs matching this choice are added.`
  }

  function clearPoiSelectionFilter(): void {
    poiSelectionFilter = null
    refreshFilterHint()
    suggestSessionToken = crypto.randomUUID()
  }

  function closeSuggestUi(): void {
    if (suggestDebounce !== undefined) {
      window.clearTimeout(suggestDebounce)
      suggestDebounce = undefined
    }

    suggestAbort?.abort()
    suggestAbort = null

    if (syncSuggestRafId !== 0) {
      cancelAnimationFrame(syncSuggestRafId)
      syncSuggestRafId = 0
    }

    poiSuggestList.replaceChildren()
    poiSuggestList.classList.add('hidden')
    poiInput.setAttribute('aria-expanded', 'false')

    lastSuggestions = []
    activeSuggestIndex = -1
  }

  function updateSuggestHighlight(): void {
    const buttons = poiSuggestList.querySelectorAll<HTMLButtonElement>('button[role="option"]')
    buttons.forEach((btn, idx) => {
      btn.classList.toggle('bg-base-200', idx === activeSuggestIndex)
      btn.toggleAttribute('aria-selected', idx === activeSuggestIndex)
    })
    const cur = buttons[activeSuggestIndex]
    cur?.scrollIntoView({ block: 'nearest' })
  }

  function renderSuggestions(items: SearchBoxSuggestion[]): void {
    poiSuggestList.replaceChildren()
    lastSuggestions = items

    activeSuggestIndex = items.length ? 0 : -1

    for (let idx = 0; idx < items.length; idx += 1) {
      const s = items[idx]
      const li = document.createElement('li')
      li.setAttribute('role', 'none')

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.setAttribute('role', 'option')
      btn.setAttribute(
        'aria-selected',
        idx === activeSuggestIndex ? 'true' : 'false',
      )
      btn.className =
        'flex w-full cursor-pointer flex-col gap-0.5 rounded px-2 py-1.5 text-left text-[13px] hover:bg-base-200'
      if (idx === activeSuggestIndex) btn.classList.add('bg-base-200')

      const title = s.name_preferred ?? s.name
      const line1 = document.createElement('span')
      line1.className = 'truncate font-medium text-base-content'
      line1.textContent = title

      const line2 = document.createElement('span')
      line2.className = 'truncate text-[10px] leading-tight text-base-content/60'
      line2.textContent = formatSuggestionSubtitle(s)

      btn.append(line1, line2)

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
      })
      btn.addEventListener('click', () => {
        applySuggestion(s)
      })

      li.appendChild(btn)
      poiSuggestList.appendChild(li)
    }
  }

  function applySuggestion(s: SearchBoxSuggestion): void {
    poiInput.value = s.name_preferred ?? s.name
    poiSelectionFilter = poiFilterFromSuggestion(s)
    refreshFilterHint()
    closeSuggestUi()
    suggestSessionToken = crypto.randomUUID()
  }

  function scheduleSuggest(): void {
    if (suggestDebounce !== undefined) window.clearTimeout(suggestDebounce)

    suggestDebounce = window.setTimeout(() => {
      suggestDebounce = undefined
      void loadSuggestions()
    }, SUGGEST_DEBOUNCE_MS)
  }

  async function loadSuggestions(): Promise<void> {
    const q = poiInput.value.trim()
    if (q.length < 2) {
      closeSuggestUi()
      return
    }

    suggestAbort?.abort()
    suggestAbort = new AbortController()
    const { signal } = suggestAbort

    try {
      const items = await fetchSearchBoxSuggest(
        q,
        accessToken,
        suggestSessionToken,
        signal,
      )

      if (signal.aborted || poiInput.value.trim() !== q) return

      if (items.length === 0) {
        closeSuggestUi()
        return
      }

      renderSuggestions(items)
      poiSuggestList.classList.remove('hidden')
      poiInput.setAttribute('aria-expanded', 'true')
      syncSuggestPopoverPosition()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      if (e instanceof Error && e.name === 'AbortError') return
      console.warn('[POI suggest]', e)
      closeSuggestUi()
    }
  }

  function clearQueryBatch(runId: string, pillLi: HTMLLIElement): void {
    const batch = queryBatches.get(runId)
    if (!batch) return

    let removedAny = false
    let touchedMain = false
    let touchedHawaii = false
    let touchedAlaska = false

    for (const id of batch.ids) {
      const poi = saved.get(id)
      if (!poi) continue
      poi.marker.remove()
      saved.delete(id)
      poiAdminById.delete(id)
      poiQueryById.delete(id)
      removedAny = true
      if (poi.map === mainMap) touchedMain = true
      else if (poi.map === hawaiiMap) touchedHawaii = true
      else if (poi.map === alaskaMap) touchedAlaska = true
    }

    queryBatches.delete(runId)
    if (!Array.from(queryBatches.values()).some((b) => b.queryLabel === batch.queryLabel)) {
      poiPillStyleByQuery.delete(batch.queryLabel)
    }
    pillLi.remove()

    if (touchedMain) mainMap.resize()
    if (touchedHawaii) hawaiiMap.resize()
    if (touchedAlaska) alaskaMap.resize()

    if (saved.size === 0) poiStatus.textContent = ''
    if (removedAny) {
      emitPoiCountsChanged()
      emitPoiVisibilityChanged()
    }
  }

  async function searchAndAdd(): Promise<void> {
    closeSuggestUi()

    const q = poiInput.value.trim()
    if (!q) {
      poiStatus.textContent = 'Enter a place to search.'
      return
    }

    poiAddBtn.disabled = true
    poiInput.disabled = true
    poiInput.setAttribute('aria-disabled', 'true')
    poiStatus.textContent = `Searching ${US_STATE_SEARCH_ANCHORS.length} state anchors… 0/${US_STATE_SEARCH_ANCHORS.length}`
    poiClearFilterBtn.classList.add('hidden')
    poiStateProgress.classList.remove('hidden')
    poiStateProgress.max = US_STATE_SEARCH_ANCHORS.length
    poiStateProgress.value = 0

    try {
      const {
        features: mergedFeatures,
        failedRequests,
        firstError,
      } = await searchAllStateAnchors(q, accessToken, (done, total) => {
        poiStatus.textContent = `Searching state anchors… ${done}/${total}`
        poiStateProgress.max = total
        poiStateProgress.value = done
      })

      const narrowedFilter = poiSelectionFilter

      const totalMerged = mergedFeatures.length
      const features =
        narrowedFilter === null
          ? mergedFeatures
          : mergedFeatures.filter((f) =>
            forwardFeatureMatchesSelection(
              f.properties as SearchBoxProperties,
              narrowedFilter,
            ),
          )

      const excludedByFilter = totalMerged - features.length

      if (features.length === 0) {
        if (totalMerged > 0 && narrowedFilter !== null) {
          poiStatus.textContent =
            'Every nationwide match was filtered out by your autocomplete choice. Clear the filter or pick a different suggestion.'
        } else {
          poiStatus.textContent =
            failedRequests > 0 && firstError
              ? `Search failed: ${firstError}`
              : 'No points of interest found. Try a different search.'
        }
        return
      }

      let added = 0
      let skippedDup = 0
      let skippedOutOfRegion = 0
      let touchedMain = false
      let touchedHawaii = false
      let touchedAlaska = false
      const runId = crypto.randomUUID()
      const batchIds: string[] = []
      const usedHues = Array.from(queryBatches.values(), (b) => b.hue)
      const batchHue = pickDistinctHue(usedHues)
      const batchStyles = poiBatchStylesForHue(batchHue)

      for (const feature of features) {
        const coords = feature.geometry.coordinates
        const [lng, lat] = coords
        const props = feature.properties
        const popupTitle = poiPopupPlaceTitle(q, props)
        const popupAddress = poiPopupAddressLine(props, popupTitle)
        const name = displayName(q, props)
        const adminArea = poiAdminArea(props)
        const stableId =
          props?.mapbox_id && props.mapbox_id.length > 0
            ? props.mapbox_id
            : `${lng.toFixed(5)},${lat.toFixed(5)}`

        if (saved.has(stableId)) {
          skippedDup += 1
          continue
        }

        const targetMap = targetMapForLngLat(lng, lat, mainMap, hawaiiMap, alaskaMap)
        if (!targetMap) {
          skippedOutOfRegion += 1
          continue
        }

        const el = document.createElement('div')
        el.className = 'poi-marker'
        el.style.backgroundColor = batchStyles.markerFill

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 14 }).setDOMContent(
              createPoiPopupElement(popupTitle, popupAddress),
            ),
          )
          .addTo(targetMap)

        // make it so that the markers don't pop up if the zoom level is so far away and if the zoom is closer, we want to query for each county.
        //once the search is complete, we want to highlight each state on the map that has all of the POIs inside.

        saved.set(stableId, { id: stableId, name, marker, map: targetMap })
        poiAdminById.set(stableId, adminArea)
        poiQueryById.set(stableId, q)
        batchIds.push(stableId)

        // Fill in missing county via reverse geocoding (cached).
        if (adminArea.county === UNKNOWN_COUNTY) {
          void reverseGeocodeCounty(lng, lat, accessToken).then((county) => {
            if (!county) return
            const cur = poiAdminById.get(stableId)
            if (!cur) return
            if (cur.county !== UNKNOWN_COUNTY) return
            poiAdminById.set(stableId, { ...cur, county })
            emitPoiCountsChanged()
          })
        }

        if (targetMap === mainMap) touchedMain = true
        else if (targetMap === hawaiiMap) touchedHawaii = true
        else if (targetMap === alaskaMap) touchedAlaska = true

        added += 1
      }

      if (touchedMain) mainMap.resize()
      if (touchedHawaii) hawaiiMap.resize()
      if (touchedAlaska) alaskaMap.resize()

      if (added === 0) {
        poiStatus.textContent =
          skippedDup > 0
            ? 'Those locations are already on the map.'
            : 'No new places to add.'
        return
      }

      const dupHint = skippedDup > 0 ? ` (${skippedDup} already on the map.)` : ''
      const skipHint =
        skippedOutOfRegion > 0 ? ` (${skippedOutOfRegion} outside US map regions.)` : ''
      const failHint =
        failedRequests > 0
          ? ` (${failedRequests} state request${failedRequests === 1 ? '' : 's'} failed — results may be incomplete.)`
          : ''

      const autocompleteHint =
        excludedByFilter > 0
          ? ` (${excludedByFilter} excluded by autocomplete filter.)`
          : ''

      poiStatus.textContent =
        `Added ${added} place${added === 1 ? '' : 's'} (${features.length} unique matches).${dupHint}${skipHint}${autocompleteHint}${failHint}`

      if (batchIds.length > 0) {
        queryBatches.set(runId, { queryLabel: q, ids: batchIds, hue: batchHue, visible: true })
        poiPillStyleByQuery.set(q, {
          bg: batchStyles.pillBg,
          fg: batchStyles.pillFg,
          border: batchStyles.pillBorder,
          markerFill: batchStyles.markerFill,
        })

        const li = document.createElement('li')
        li.className = 'flex w-fit max-w-full items-center gap-0.5'

        const pillStyle = [
          `background-color:${batchStyles.pillBg}`,
          `color:${batchStyles.pillFg}`,
          `border-color:${batchStyles.pillBorder}`,
        ].join(';')

        li.dataset.runId = runId
        li.innerHTML = `
          <span class="badge inline-flex min-w-0 items-center gap-1 border border-solid py-2 pl-3 pr-1" style="${pillStyle}">
            <span class="flex min-h-6 min-w-[4rem] max-w-[10rem] flex-1 items-center justify-center">
              <span class="w-full truncate text-center leading-none">${escapeHtml(q)}</span>
            </span>
            <button type="button" class="poi-batch-clear inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-lg leading-none text-current hover:bg-transparent" aria-label="Remove markers for this search" title="Clear these points">×</button>
          </span>
        `

        const clearBtn = li.querySelector('.poi-batch-clear')
        clearBtn?.addEventListener('click', (e) => {
          e.stopPropagation()
          clearQueryBatch(runId, li)
        })

        poiSavedList.appendChild(li)
        await Promise.all([
          refreshPoiAdminFromCountyTiles(mainMap, batchIds),
          refreshPoiAdminFromCountyTiles(hawaiiMap, batchIds),
          refreshPoiAdminFromCountyTiles(alaskaMap, batchIds),
        ])
        emitPoiCountsChanged()
        emitPoiVisibilityChanged()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      poiStatus.textContent =
        msg.length > 0 ? `Search failed: ${msg}` : 'Search failed. Check your connection and try again.'
      console.error(e)
    } finally {
      poiAddBtn.disabled = false;
      poiInput.disabled = false
      poiInput.removeAttribute('aria-disabled')
      poiStateProgress.classList.add('hidden')
      poiStateProgress.value = 0
      poiClearFilterBtn.classList.remove('hidden')
      clearPoiSelectionFilter();
      setTimeout(() => {
        poiStatus.textContent = ''
      }, 2000)
    }
  }

  poiAddBtn.addEventListener('click', () => void searchAndAdd())

  poiClearFilterBtn.addEventListener('click', () => {
    clearPoiSelectionFilter()
  })

  poiInput.addEventListener('input', () => {
    if (poiInput.disabled) return
    scheduleSuggest()
  })

  /** Keep focus on the search field while interacting with floating suggestions (popover is outside the wrap). */
  poiSuggestList.addEventListener('mousedown', (e) => {
    if (!poiSuggestList.classList.contains('hidden')) e.preventDefault()
  })

  window.addEventListener('resize', () => {
    scheduleSuggestPopoverSync()
  })
  document.addEventListener(
    'scroll',
    () => {
      scheduleSuggestPopoverSync()
    },
    true,
  )

  poiInput.addEventListener('keydown', (e) => {
    const listOpen =
      !poiSuggestList.classList.contains('hidden') && lastSuggestions.length > 0

    if (listOpen && e.key === 'ArrowDown') {
      e.preventDefault()
      activeSuggestIndex = Math.min(
        activeSuggestIndex + 1,
        lastSuggestions.length - 1,
      )
      updateSuggestHighlight()
      return
    }

    if (listOpen && e.key === 'ArrowUp') {
      e.preventDefault()
      activeSuggestIndex = Math.max(activeSuggestIndex - 1, 0)
      updateSuggestHighlight()
      return
    }

    if (listOpen && e.key === 'Escape') {
      e.preventDefault()
      closeSuggestUi()
      return
    }

    if (e.key === 'Enter') {
      if (listOpen && activeSuggestIndex >= 0) {
        const pick = lastSuggestions[activeSuggestIndex]
        if (pick) {
          e.preventDefault()
          applySuggestion(pick)
          return
        }
      }
      void searchAndAdd()
      return
    }
  })

  poiInput.addEventListener('blur', () => {
    window.setTimeout(() => closeSuggestUi(), 120)
  })

  document.addEventListener('pointerdown', (e) => {
    const t = e.target
    if (!(t instanceof Node)) return
    if (!(poiWrap.contains(t) || poiSuggestList.contains(t))) closeSuggestUi()
  })
}
