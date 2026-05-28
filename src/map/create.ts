import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ALASKA_BOUNDS, HAWAII_BOUNDS, US_MAINLAND_BOUNDS } from '../geo/bounds'
import { loadInitialMapStyle } from './mapStyle'

/** The three Mapbox map instances plus the access token used to create them. */
export type MapTrio = {
    mainMap: mapboxgl.Map
    hawaiiMap: mapboxgl.Map
    alaskaMap: mapboxgl.Map
    mapboxAccessToken: string
}

/**
 * Create the mainland, Hawaii, and Alaska maps. Reads `VITE_MAPBOX_ACCESS_TOKEN`
 * from the environment and throws if it isn't set.
 */
export async function createMaps(): Promise<MapTrio> {
    const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? ''
    if (!mapboxAccessToken) {
        throw new Error(
            'Set VITE_MAPBOX_ACCESS_TOKEN in a .env file (see .env.example). For GitHub Pages, add the MAPBOX_ACCESS_TOKEN repository secret and use the deploy workflow.',
        )
    }
    mapboxgl.accessToken = mapboxAccessToken

    const style = await loadInitialMapStyle()

    const mainMap = new mapboxgl.Map({
        container: 'map-main',
        style,
        logoPosition: 'top-right',
        center: [-98.58, 39.82],
        zoom: 4,
        minZoom: 4,
        maxBounds: US_MAINLAND_BOUNDS,
        dragRotate: false,
        touchZoomRotate: false,
    })

    mainMap.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        'bottom-right',
    )

    const hawaiiMap = new mapboxgl.Map({
        container: 'map-hawaii',
        style,
        bounds: HAWAII_BOUNDS,
        fitBoundsOptions: { padding: 8 },
        maxBounds: HAWAII_BOUNDS,
        minZoom: 4,
        dragRotate: false,
        touchZoomRotate: false,
    })

    const alaskaMap = new mapboxgl.Map({
        container: 'map-alaska',
        style,
        bounds: ALASKA_BOUNDS,
        fitBoundsOptions: { padding: 8 },
        maxBounds: ALASKA_BOUNDS,
        minZoom: 0,
        dragRotate: false,
        touchZoomRotate: false,
    })

    return { mainMap, hawaiiMap, alaskaMap, mapboxAccessToken }
}
