import { setInsetVisible, isInsetVisible, type InsetId } from '../map/insets'
import { isLegendVisible, setLegendVisible } from '../map/legend'

function syncToggle(id: string, checked: boolean): void {
    const el = document.getElementById(id) as HTMLInputElement | null
    if (el && el.checked !== checked) el.checked = checked
}

function wireLegendToggle(): void {
    const toggle = document.getElementById('toggle-legend') as HTMLInputElement | null
    if (!toggle) return

    toggle.addEventListener('change', () => {
        setLegendVisible(toggle.checked, { animate: true })
    })

    window.addEventListener('legend-visibility-changed', ((e: CustomEvent<{ visible: boolean }>) => {
        syncToggle('toggle-legend', e.detail?.visible ?? false)
    }) as EventListener)

    setLegendVisible(toggle.checked, { animate: false })
}

function wireInsetToggle(which: InsetId, toggleId: string): void {
    const toggle = document.getElementById(toggleId) as HTMLInputElement | null
    if (!toggle) return

    toggle.addEventListener('change', () => {
        setInsetVisible(which, toggle.checked)
    })

    window.addEventListener('inset-visibility-changed', ((e: CustomEvent<{ id: InsetId; visible: boolean }>) => {
        if (e.detail?.id === which) syncToggle(toggleId, e.detail.visible)
    }) as EventListener)

    setInsetVisible(which, toggle.checked, { animate: false })
}

/** Wire Map display drawer toggles to legend + inset visibility. */
export function initMapVisibility(): void {
    wireLegendToggle()
    wireInsetToggle('alaska', 'toggle-alaska')
    wireInsetToggle('hawaii', 'toggle-hawaii')
}

export function syncMapVisibilityTogglesFromDom(): void {
    syncToggle('toggle-legend', isLegendVisible())
    syncToggle('toggle-alaska', isInsetVisible('alaska'))
    syncToggle('toggle-hawaii', isInsetVisible('hawaii'))
}
