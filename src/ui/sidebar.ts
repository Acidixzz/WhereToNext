import { applyMetricRange } from '../filters'
import { refreshChoroplethPaint } from '../map'
import {
    getActiveMetric,
    onMetricChanged,
    setActiveMetric,
    type HomeMetric,
} from '../map/choroplethConfig'
import { wireCurrencyMinMax, type CurrencyMinMaxHandle } from './currencyMinMax'

/**
 * Sidebar / drawer interactions:
 *   - Home-type radio (rent vs mortgage)
 *   - Drawer open/close + summary expand
 *   - Rent / mortgage min-max currency widgets wired to `applyMetricRange`
 *
 * Idempotent: safe to call once after the DOM is ready.
 */

const HomeType = {
    RENT: 'rent',
    MORTGAGE: 'mortgage',
} as const

const RENT_FLOOR = 0
const RENT_CEILING = 3000

const MORTGAGE_FLOOR = 0
const MORTGAGE_CEILING = 4000
const MORTGAGE_DEFAULT_MAX = 4000

let rentBudget: CurrencyMinMaxHandle | null = null
let mortgageBudget: CurrencyMinMaxHandle | null = null

function metricRangeFromSliders(
    min: number,
    max: number,
    floor: number,
    ceiling: number,
): { min: number | null; max: number | null } {
    return {
        min: min > floor ? min : null,
        max: max < ceiling ? max : null,
    }
}

function syncBudgetPanels(metric: HomeMetric): void {
    const rentPanel = document.getElementById('rent-budget-panel')
    const mortgagePanel = document.getElementById('mortgage-budget-panel')
    const isRent = metric === 'rent'
    rentPanel?.classList.toggle('hidden', !isRent)
    mortgagePanel?.classList.toggle('hidden', isRent)
}

function resetBudgetSlidersForMetric(metric: HomeMetric): void {
    if (metric === 'rent') rentBudget?.resetToDefaults()
    else mortgageBudget?.resetToDefaults()
}

export function initSidebar(): void {
    rentBudget = wireRentBudget()
    mortgageBudget = wireMortgageBudget()
    wireHomeTypeRadio()
    wireDrawer()
    wireDrawerSectionTooltips()
    syncBudgetPanels(getActiveMetric())

    onMetricChanged((metric) => {
        syncBudgetPanels(metric)
        resetBudgetSlidersForMetric(metric)
    })
}

function wireHomeTypeRadio(): void {
    const radios = document.querySelectorAll<HTMLInputElement>('input[name="HomeType"]')

    radios.forEach((radio) => {
        radio.addEventListener('change', () => {
            const selected = document.querySelector<HTMLInputElement>(
                'input[name="HomeType"]:checked',
            )
            if (!selected) return

            if (selected.id === HomeType.RENT) {
                setActiveMetric('rent')
                refreshChoroplethPaint()
                return
            }

            if (selected.id === HomeType.MORTGAGE) {
                setActiveMetric('mortgage')
                refreshChoroplethPaint()
            }
        })
    })
}

function wireDrawer(): void {
    const drawer = document.getElementById('app-drawer') as HTMLInputElement | null

    drawer?.addEventListener('change', () => {
        document.querySelectorAll<HTMLDetailsElement>('details').forEach((e) => {
            if (drawer) e.classList.toggle('collapse-arrow', drawer.checked)
        })
        document.getElementById('drawer-section-tooltip')?.classList.add('hidden')
    })

    document.querySelectorAll('summary').forEach((summary) => {
        summary.addEventListener('click', (e) => {
            const details = summary.closest('details')
            if (details && drawer && !drawer.checked) {
                e.preventDefault()
                drawer.checked = true
                drawer.dispatchEvent(new Event('change', { bubbles: true }))
                details.open = true
            }
        })
    })
}

function wireRentBudget(): CurrencyMinMaxHandle | null {
    return wireCurrencyMinMax('#rent-min-display', '#rent-max-display', {
        floor: RENT_FLOOR,
        ceiling: RENT_CEILING,
        step: 50,
        defaultMin: RENT_FLOOR,
        defaultMax: RENT_CEILING,
        onChange: (min, max) => {
            if (getActiveMetric() !== 'rent') return
            applyMetricRange(metricRangeFromSliders(min, max, RENT_FLOOR, RENT_CEILING))
        },
    })
}

function isDrawerIconRail(): boolean {
    const drawer = document.querySelector('.drawer')
    if (drawer?.classList.contains('is-drawer-close')) return true
    const panel = document.querySelector<HTMLElement>('.drawer-side > div')
    if (!panel) return false
    return panel.getBoundingClientRect().width < 120
}

function wireDrawerSectionTooltips(): void {
    const tooltip = document.getElementById('drawer-section-tooltip')
    const tips = document.querySelectorAll<HTMLElement>('.drawer-section-tip')
    if (!tooltip || tips.length === 0) return

    let activeTip: HTMLElement | null = null

    const hide = (): void => {
        activeTip = null
        tooltip.classList.add('hidden')
        tooltip.textContent = ''
    }

    const position = (anchor: HTMLElement): void => {
        const rect = anchor.getBoundingClientRect()
        tooltip.style.top = `${rect.top + rect.height / 2}px`
        tooltip.style.left = `${rect.right + 8}px`
        tooltip.style.transform = 'translateY(-50%)'
    }

    tips.forEach((tip) => {
        tip.addEventListener('mouseenter', () => {
            if (!isDrawerIconRail()) return
            activeTip = tip
            tooltip.textContent = tip.dataset.tip ?? ''
            tooltip.classList.remove('hidden')
            position(tip)
        })
        tip.addEventListener('mouseleave', hide)
        tip.addEventListener('focus', () => {
            if (!isDrawerIconRail()) return
            activeTip = tip
            tooltip.textContent = tip.dataset.tip ?? ''
            tooltip.classList.remove('hidden')
            position(tip)
        })
        tip.addEventListener('blur', hide)
    })

    window.addEventListener('resize', () => {
        if (activeTip && isDrawerIconRail()) position(activeTip)
        else hide()
    })

    window.addEventListener('scroll', () => {
        if (activeTip) position(activeTip)
    }, true)

    document.getElementById('app-drawer')?.addEventListener('change', hide)
}

function wireMortgageBudget(): CurrencyMinMaxHandle | null {
    return wireCurrencyMinMax('#mortgage-min-display', '#mortgage-max-display', {
        floor: MORTGAGE_FLOOR,
        ceiling: MORTGAGE_CEILING,
        step: 50,
        defaultMin: MORTGAGE_FLOOR,
        defaultMax: MORTGAGE_DEFAULT_MAX,
        onChange: (min, max) => {
            if (getActiveMetric() !== 'mortgage') return
            applyMetricRange(
                metricRangeFromSliders(min, max, MORTGAGE_FLOOR, MORTGAGE_CEILING),
            )
        },
    })
}
