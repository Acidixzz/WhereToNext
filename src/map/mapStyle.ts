import type { StyleSpecification } from 'mapbox-gl'

/** Published Studio style — set `VITE_MAPBOX_STYLE=remote` to use this instead of local JSON. */
export const REMOTE_STYLE_URL = 'mapbox://styles/owenwilson80/cmomgmhvc000l01pz68bngoth'

const LOCAL_STYLE_PATH = `${import.meta.env.BASE_URL}rent-style.json`

let localStyle: StyleSpecification | null = null

function usesRemoteStyle(): boolean {
    return import.meta.env.VITE_MAPBOX_STYLE?.trim().toLowerCase() === 'remote'
}

async function fetchLocalStyle(): Promise<StyleSpecification> {
    const res = await fetch(LOCAL_STYLE_PATH)
    if (!res.ok) {
        throw new Error(`Failed to load ${LOCAL_STYLE_PATH} (${res.status}).`)
    }
    return (await res.json()) as StyleSpecification
}

/**
 * Style for map creation. Local mode loads rent-style.json once; rent vs mortgage
 * choropleth colors are switched at runtime via setPaintProperty in choroplethPaint.ts.
 */
export async function loadInitialMapStyle(): Promise<string | StyleSpecification> {
    if (usesRemoteStyle()) return REMOTE_STYLE_URL
    if (!localStyle) localStyle = await fetchLocalStyle()
    return localStyle
}
