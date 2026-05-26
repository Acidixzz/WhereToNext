import type { GeoJSONFeature, Map as MapboxMap } from 'mapbox-gl'
import type { MapTrio } from './create'
import {
    CHOROPLETH_COUNTY_FILL_LAYER_ID,
    CHOROPLETH_STATE_FILL_LAYER_ID,
    STATE_NAME_FIELD,
    getActiveMetric,
    getActiveValueField,
} from './choroplethConfig'
import { getPoiCountsSnapshot } from '../poi'
import { US_STATE_FLY_ANCHORS } from '../geo/stateAnchors'

type FeatureStateTarget = { source: string; sourceLayer?: string; id: string | number }

function featureStateTarget(feature: GeoJSONFeature): FeatureStateTarget | null {
    const source = feature.source
    if (typeof source !== 'string') return null

    const sourceLayer = feature.sourceLayer ?? undefined
    if (feature.id !== undefined && feature.id !== null) {
        return { source, sourceLayer, id: feature.id }
    }
    const props = feature.properties as { OBJECTID?: string | number; GEOID?: string | number } | null | undefined
    const geo = props?.OBJECTID ?? props?.GEOID
    if (geo !== undefined && geo !== null && String(geo).length > 0) {
        return { source, sourceLayer, id: String(geo) }
    }
    return null
}

function sameTarget(a: FeatureStateTarget | null, b: FeatureStateTarget): boolean {
    if (!a) return false
    return a.source === b.source && a.sourceLayer === b.sourceLayer && a.id === b.id
}

let warnedMissingFeatureId = false

function isPhoneLike(): boolean {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 700px), (pointer: coarse)').matches
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function formatMetricValue(raw: unknown): string[] {
    const n = Number(raw)
    const label =
        getActiveMetric() === 'mortgage'
            ? 'Median mortgage payment'
            : 'Median gross rent (ACS)'
    if (!Number.isFinite(n) || n <= 0) return [`${label} not available for this polygon.`]
    return [
        `${label}: `,
        new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
        }).format(n),
    ]
}

function resolveStateKeyForPoiCounts(stateName: string, byState: Record<string, number>): string | null {
    const raw = (stateName ?? '').trim()
    if (!raw) return null

    // Fast path: exact key
    if (byState[raw] !== undefined) return raw

    // Normalize common variants
    const cleaned = raw
        .replace(/^state of\s+/i, '')
        .replace(/\s+state$/i, '')
        .trim()
    if (byState[cleaned] !== undefined) return cleaned

    const lower = cleaned.toLowerCase()

    // Common two-letter abbreviations (covers the most likely mismatch case).
    const ABBR_TO_NAME: Record<string, string> = {
        AL: 'Alabama',
        AK: 'Alaska',
        AZ: 'Arizona',
        AR: 'Arkansas',
        CA: 'California',
        CO: 'Colorado',
        CT: 'Connecticut',
        DE: 'Delaware',
        FL: 'Florida',
        GA: 'Georgia',
        HI: 'Hawaii',
        ID: 'Idaho',
        IL: 'Illinois',
        IN: 'Indiana',
        IA: 'Iowa',
        KS: 'Kansas',
        KY: 'Kentucky',
        LA: 'Louisiana',
        ME: 'Maine',
        MD: 'Maryland',
        MA: 'Massachusetts',
        MI: 'Michigan',
        MN: 'Minnesota',
        MS: 'Mississippi',
        MO: 'Missouri',
        MT: 'Montana',
        NE: 'Nebraska',
        NV: 'Nevada',
        NH: 'New Hampshire',
        NJ: 'New Jersey',
        NM: 'New Mexico',
        NY: 'New York',
        NC: 'North Carolina',
        ND: 'North Dakota',
        OH: 'Ohio',
        OK: 'Oklahoma',
        OR: 'Oregon',
        PA: 'Pennsylvania',
        RI: 'Rhode Island',
        SC: 'South Carolina',
        SD: 'South Dakota',
        TN: 'Tennessee',
        TX: 'Texas',
        UT: 'Utah',
        VT: 'Vermont',
        VA: 'Virginia',
        WA: 'Washington',
        WV: 'West Virginia',
        WI: 'Wisconsin',
        WY: 'Wyoming',
    }

    const upper = cleaned.toUpperCase()
    if (upper.length === 2 && ABBR_TO_NAME[upper]) {
        const expanded = ABBR_TO_NAME[upper]
        if (byState[expanded] !== undefined) return expanded
    }

    // Case-insensitive equality on existing keys
    const keys = Object.keys(byState)
    const eq = keys.find((k) => k.toLowerCase() === lower)
    if (eq) return eq

    // Fuzzy: prefer exact word match, then substring.
    const word = new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i')
    const wordHit = keys.find((k) => word.test(k))
    if (wordHit) return wordHit

    const subHit = keys.find((k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()))
    return subHit ?? null
}

function markerRowsHtml(stateName: string): string {
    const snap = getPoiCountsSnapshot()
    // Resolve using the aggregate snapshot, but each query may still need its own resolution.
    const keyAll = resolveStateKeyForPoiCounts(stateName, snap.byState)
    const totalInState = keyAll ? snap.byState[keyAll] ?? 0 : 0

    const rows: string[] = []
    for (const [queryLabel, q] of Object.entries(snap.byQuery)) {
        const keyForQuery =
            resolveStateKeyForPoiCounts(stateName, q.byState) ??
            (keyAll && q.byState[keyAll] !== undefined ? keyAll : null)
        if (!keyForQuery) continue

        const n = q.byState[keyForQuery]
        if (!n || n < 1) continue
        const pillStyle = q.pillStyle
            ? `background-color:${q.pillStyle.bg};color:${q.pillStyle.fg};border-color:${q.pillStyle.border};`
            : ''
        rows.push(
            `<li class="flex flex-wrap items-center justify-between gap-2 border-b border-base-200/80 py-1 last:border-0"><span class="badge inline-flex min-w-0 max-w-[13rem] items-center border border-solid py-1 pl-2 pr-2 font-medium" style="${pillStyle}"><span class="truncate">${escapeHtml(queryLabel)}</span></span><span class="shrink-0 tabular-nums font-bold">${n}</span></li>`,
        )
    }

    if (rows.length === 0) {
        return `<li class="opacity-70">${totalInState > 0 ? `${totalInState} saved marker${totalInState === 1 ? '' : 's'} in this state (no per-search breakdown).` : 'No saved markers in this state yet.'}</li>`
    }
    return rows.join('')
}

function fillSharedStateContent(stateName: string, props: GeoJSONFeature['properties']): void {
    const field = getActiveValueField()
    const rentText = formatMetricValue(
        props && typeof props === 'object' ? (props as Record<string, unknown>)[field] : undefined,
    )
    const markersHtml = markerRowsHtml(stateName)

    const titleEl = document.getElementById('state-hover-card-title')
    const rentEl = document.getElementById('state-hover-card-rent')
    const rentNumberEl = document.getElementById('state-hover-card-rent-number')
    const listEl = document.getElementById('state-hover-card-markers')
    const mTitle = document.getElementById('state-hover-modal-title')
    const mRent = document.getElementById('state-hover-modal-rent')
    const mRentNumber = document.getElementById('state-hover-modal-rent-number')
    const mList = document.getElementById('state-hover-modal-markers')

    const title = stateName
    if (titleEl) titleEl.textContent = title
    if (rentEl) rentEl.textContent = rentText[0]
    if (rentNumberEl) rentNumberEl.textContent = rentText.length > 1 ? rentText[1] : null
    if (listEl) listEl.innerHTML = markersHtml
    if (mTitle) mTitle.textContent = title
    if (mRent) mRent.textContent = rentText[0]
    if (mRentNumber) mRentNumber.textContent = rentText.length > 1 ? rentText[1] : null
    if (mList) mList.innerHTML = markersHtml
}

function countyNameFromProps(props: GeoJSONFeature['properties']): string {
    if (!props || typeof props !== 'object') return 'County'
    const o = props as Record<string, unknown>
    const pick =
        o.NAMELSAD ??
        o.NAME ??
        o.county ??
        o.COUNTY ??
        o.county_name ??
        o.COUNTY_NAME ??
        o.name
    return typeof pick === 'string' && pick.trim().length > 0 ? pick.trim() : 'County'
}

function stateNameFromCountyProps(props: GeoJSONFeature['properties']): string {
    if (!props || typeof props !== 'object') return 'State'
    const o = props as Record<string, unknown>
    const pick =
        o.STATE_NAME ??
        o.state ??
        o.STATE ??
        o.state_name ??
        o.STATE_ABBR ??
        o.STUSPS
    return typeof pick === 'string' && pick.trim().length > 0 ? pick.trim() : 'State'
}

function countyMarkerRowsHtml(stateName: string, countyName: string): string {
    const snap = getPoiCountsSnapshot()
    const stateKeyAll = resolveStateKeyForPoiCounts(
        stateName,
        snap.byStateCounty as unknown as Record<string, number>,
    )
    const countyTotal =
        stateKeyAll && snap.byStateCounty[stateKeyAll] ? snap.byStateCounty[stateKeyAll][countyName] ?? 0 : 0

    const rows: string[] = []
    for (const [queryLabel, q] of Object.entries(snap.byQuery)) {
        // Resolve the state key for this query's byStateCounty map.
        const stateKey =
            resolveStateKeyForPoiCounts(
                stateName,
                q.byStateCounty as unknown as Record<string, number>,
            ) ??
            (stateKeyAll && q.byStateCounty[stateKeyAll] ? stateKeyAll : null)
        if (!stateKey) continue
        const byCounty = q.byStateCounty[stateKey]
        if (!byCounty) continue
        const n = byCounty[countyName]
        if (!n || n < 1) continue

        const pillStyle = q.pillStyle
            ? `background-color:${q.pillStyle.bg};color:${q.pillStyle.fg};border-color:${q.pillStyle.border};`
            : ''
        rows.push(
            `<li class="flex flex-wrap items-center justify-between gap-2 border-b border-base-200/80 py-1 last:border-0"><span class="badge inline-flex min-w-0 max-w-[13rem] items-center border border-solid py-1 pl-2 pr-2 font-medium" style="${pillStyle}"><span class="truncate">${escapeHtml(queryLabel)}</span></span><span class="shrink-0 tabular-nums font-bold">${n}</span></li>`,
        )
    }

    if (rows.length === 0) {
        return `<li class="opacity-70">${countyTotal > 0
            ? `${countyTotal} saved marker${countyTotal === 1 ? '' : 's'} in this county (no per-search breakdown).`
            : 'No saved markers in this county yet.'
            }</li>`
    }
    return rows.join('')
}

function fillSharedCountyContent(
    stateName: string,
    countyName: string,
    props: GeoJSONFeature['properties'],
): void {
    const field = getActiveValueField()
    const rentText = formatMetricValue(
        props && typeof props === 'object' ? (props as Record<string, unknown>)[field] : undefined,
    )

    const markersHtml = countyMarkerRowsHtml(stateName, countyName)

    const titleEl = document.getElementById('state-hover-card-title')
    const rentEl = document.getElementById('state-hover-card-rent')
    const rentNumberEl = document.getElementById('state-hover-card-rent-number')
    const listEl = document.getElementById('state-hover-card-markers')
    const mTitle = document.getElementById('state-hover-modal-title')
    const mRent = document.getElementById('state-hover-modal-rent')
    const mRentNumber = document.getElementById('state-hover-modal-rent-number')
    const mList = document.getElementById('state-hover-modal-markers')

    const title = `${countyName}, ${stateName}`
    if (titleEl) titleEl.textContent = title
    if (rentEl) rentEl.textContent = rentText[0]
    if (rentNumberEl) rentNumberEl.textContent = rentText.length > 1 ? rentText[1] : null
    if (listEl) listEl.innerHTML = markersHtml
    if (mTitle) mTitle.textContent = title
    if (mRent) mRent.textContent = rentText[0]
    if (mRentNumber) mRentNumber.textContent = rentText.length > 1 ? rentText[1] : null
    if (mList) mList.innerHTML = markersHtml
}

function showFeaturePanel(): void {
    if (isPhoneLike()) return
    document.getElementById('map-feature-panel')?.classList.remove('is-empty')
}

function resetFeaturePanel(): void {
    if (isPhoneLike()) return
    document.getElementById('map-feature-panel')?.classList.add('is-empty')
}

/** Cleared on dialog close so every map drops `hover` feature-state. */
const activeHoverByMap = new WeakMap<MapboxMap, FeatureStateTarget>()

function clearHoverFeatureOnAllMaps(allMaps: readonly MapboxMap[]): void {
    for (const m of allMaps) {
        const t = activeHoverByMap.get(m)
        if (t) {
            try {
                m.removeFeatureState(t, 'hover')
            } catch {
                /* ignore */
            }
        }
        activeHoverByMap.delete(m)
    }
}

function openStateModal(): void {
    const dlg = document.getElementById('state-hover-dialog') as HTMLDialogElement | null
    if (!dlg) return
    if (!dlg.open) dlg.showModal()
}

function closeStateModalAndClearPhoneHover(allMaps: readonly MapboxMap[]): void {
    clearHoverFeatureOnAllMaps(allMaps)
}

function wireStateHoverOnMap(map: MapboxMap, allMaps: readonly MapboxMap[]): void {
    let hovered: FeatureStateTarget | null = null

    const clearHover = (): void => {
        if (hovered) {
            map.removeFeatureState(hovered, 'hover')
            activeHoverByMap.delete(map)
            hovered = null
        }
        map.getCanvas().style.cursor = ''
        resetFeaturePanel()
    }

    const applyHover = (feature: GeoJSONFeature): void => {
        const target = featureStateTarget(feature)
        if (!target) {
            if (!warnedMissingFeatureId) {
                warnedMissingFeatureId = true
                console.warn(
                    '[stateHover] State polygons need a tile `id` or `GEOID` for hover. Set vector source `promoteId` in Mapbox Studio (e.g. `GEOID`).',
                )
            }
            clearHover()
            return
        }
        if (!sameTarget(hovered, target)) {
            if (hovered) map.removeFeatureState(hovered, 'hover')
            hovered = target
        }
        map.setFeatureState(target, { hover: true })
        activeHoverByMap.set(map, target)
        map.getCanvas().style.cursor = 'pointer'
    }

    map.on('mousemove', CHOROPLETH_STATE_FILL_LAYER_ID, (e) => {
        if (isPhoneLike()) return
        const feature = e.features?.[0] as GeoJSONFeature | undefined
        if (!feature || map.getZoom() >= 6) {
            // Don't constantly reset the cursor unless we actually had a hovered state.
            if (hovered) clearHover()
            return
        }
        applyHover(feature)
        const props = feature.properties
        const stateName =
            props && typeof props === 'object'
                ? String((props as Record<string, unknown>)[STATE_NAME_FIELD] ?? 'State')
                : 'State'
        fillSharedStateContent(stateName, props)
        showFeaturePanel()
    })

    map.on('mouseleave', CHOROPLETH_STATE_FILL_LAYER_ID, () => {
        if (!isPhoneLike()) clearHover()
    })

    map.on('mouseout', () => {
        if (!isPhoneLike()) clearHover()
    })

    map.on('click', CHOROPLETH_STATE_FILL_LAYER_ID, (e) => {
        const feature = e.features?.[0] as GeoJSONFeature | undefined
        if (!feature) return
        if (!isPhoneLike()) {
            const props = feature.properties
            const stateName =
                props && typeof props === 'object'
                    ? String((props as Record<string, unknown>)[STATE_NAME_FIELD] ?? '')
                    : ''
            const anchor = US_STATE_FLY_ANCHORS.find((v) => v.state === stateName)
            if (anchor && map.getZoom() < 6) {
                map.flyTo({ center: [anchor.lng, anchor.lat], zoom: 6 })
            }
            return;
        }
        const target = featureStateTarget(feature)
        if (!target) return

        clearHoverFeatureOnAllMaps(allMaps)

        applyHover(feature)

        const props = feature.properties
        const stateName =
            props && typeof props === 'object'
                ? String((props as Record<string, unknown>)[STATE_NAME_FIELD] ?? 'State')
                : 'State'
        fillSharedStateContent(stateName, props)
        openStateModal()
    })
}

function wireCountyHoverOnMap(map: MapboxMap, allMaps: readonly MapboxMap[]): void {
    let hovered: FeatureStateTarget | null = null

    const clearHover = (): void => {
        if (hovered) {
            map.removeFeatureState(hovered, 'hover')
            activeHoverByMap.delete(map)
            hovered = null
        }
        map.getCanvas().style.cursor = ''
        resetFeaturePanel()
    }

    const applyHover = (feature: GeoJSONFeature): void => {
        const target = featureStateTarget(feature)
        if (!target) {
            if (!warnedMissingFeatureId) {
                warnedMissingFeatureId = true
                console.warn(
                    '[countyHover] County polygons need a tile `id` or `GEOID` for hover. Set vector source `promoteId` in Mapbox Studio (e.g. `GEOID`).',
                )
            }
            clearHover()
            return
        }
        if (!sameTarget(hovered, target)) {
            if (hovered) map.removeFeatureState(hovered, 'hover')
            hovered = target
        }
        map.setFeatureState(target, { hover: true })
        activeHoverByMap.set(map, target)
        map.getCanvas().style.cursor = 'pointer'
    }

    map.on('mousemove', CHOROPLETH_COUNTY_FILL_LAYER_ID, (e) => {
        if (isPhoneLike()) return

        const feature = e.features?.[0] as GeoJSONFeature | undefined
        // Opposite of the state condition: only show county hover at zoom 6+
        if (!feature || map.getZoom() < 6 || map.getZoom() >= 9) {
            // At low zoom, counties should not fight state hover for cursor state.
            if (hovered) clearHover()
            return
        }

        applyHover(feature)
        const props = feature.properties
        const countyName = countyNameFromProps(props)
        const stateName = stateNameFromCountyProps(props)
        fillSharedCountyContent(stateName, countyName, props)
        showFeaturePanel()
    })

    map.on('mouseleave', CHOROPLETH_COUNTY_FILL_LAYER_ID, () => {
        if (!isPhoneLike()) clearHover()
    })

    map.on('mouseout', () => {
        if (!isPhoneLike()) clearHover()
    })

    map.on('click', CHOROPLETH_COUNTY_FILL_LAYER_ID, (e) => {
        if (!isPhoneLike()) return
        const feature = e.features?.[0] as GeoJSONFeature | undefined
        if (!feature || map.getZoom() < 6 || map.getZoom() >= 9) return
        const target = featureStateTarget(feature)
        if (!target) return

        clearHoverFeatureOnAllMaps(allMaps)
        applyHover(feature)

        const props = feature.properties
        const countyName = countyNameFromProps(props)
        const stateName = stateNameFromCountyProps(props)
        fillSharedCountyContent(stateName, countyName, props)
        openStateModal()
    })
}

/** Call after `initPoiSearch` so marker counts are available. */
export function wireStateHoverMaps({ mainMap, hawaiiMap, alaskaMap }: MapTrio): void {
    const allMaps = [mainMap, hawaiiMap, alaskaMap] as const

    const dlg = document.getElementById('state-hover-dialog')
    if (dlg && !dlg.dataset.stateHoverCloseWired) {
        dlg.dataset.stateHoverCloseWired = '1'
        dlg.addEventListener('close', () => {
            closeStateModalAndClearPhoneHover(allMaps)
        })
    }

    wireStateHoverOnMap(mainMap, allMaps)
    wireStateHoverOnMap(hawaiiMap, allMaps)
    wireStateHoverOnMap(alaskaMap, allMaps)

    wireCountyHoverOnMap(mainMap, allMaps)
    wireCountyHoverOnMap(hawaiiMap, allMaps)
    wireCountyHoverOnMap(alaskaMap, allMaps)
}
