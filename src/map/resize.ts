import type { MapTrio } from './create'

/**
 * Wire automatic `map.resize()` calls when the drawer toggles or the window
 * resizes. The drawer change fires twice (immediately and after Daisy's
 * follow-up sizing settles ~220ms later).
 */
export function wireMapResize({ mainMap, hawaiiMap, alaskaMap }: MapTrio): void {
    const resizeMaps = (): void => {
        mainMap.resize()
        hawaiiMap.resize()
        alaskaMap.resize()
    }

    const drawerToggle = document.querySelector<HTMLInputElement>('#app-drawer')
    drawerToggle?.addEventListener('change', () => {
        resizeMaps()
        window.setTimeout(resizeMaps, 220)
    })

    window.addEventListener('resize', resizeMaps)
}
