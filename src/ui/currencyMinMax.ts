/**
 * Reusable min / max currency input pair.
 *
 * Snaps to step, keeps `min <= max`, formats as USD when blurred, shows raw
 * digits while focused, and fires `onChange` when the snapped values settle.
 */

const usdWhole = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
})

function clampLoHi(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi)
}

function snapToStep(raw: number, lo: number, hi: number, step: number): number {
    let v = clampLoHi(raw, lo, hi)
    const st = Number(step)
    const s = Number.isFinite(st) && st > 0 ? st : 1
    v = lo + Math.round((v - lo) / s) * s
    return clampLoHi(v, lo, hi)
}

export type CurrencyMinMaxOpts = {
    floor: number
    ceiling: number
    step: number
    defaultMin: number
    defaultMax: number
    /** Fires whenever the snapped min / max settle to a new value. */
    onChange?: (min: number, max: number) => void
}

export type CurrencyMinMaxHandle = {
    resetToDefaults: () => void
}

export function wireCurrencyMinMax(
    minSel: string,
    maxSel: string,
    { floor, ceiling, step, defaultMin, defaultMax, onChange }: CurrencyMinMaxOpts,
): CurrencyMinMaxHandle | null {
    const minInp = document.querySelector<HTMLInputElement>(minSel)
    const maxInp = document.querySelector<HTMLInputElement>(maxSel)
    if (!(minInp && maxInp)) return null

    let mn = snapToStep(defaultMin, floor, ceiling, step)
    let mx = snapToStep(defaultMax, floor, ceiling, step)
    if (mx < mn) {
        mn = mx
        mx = snapToStep(mx, mn, ceiling, step)
    }

    let editingMin = false
    let editingMax = false
    let lastEmittedMin: number | undefined
    let lastEmittedMax: number | undefined

    function coerce(): void {
        mn = clampLoHi(mn, floor, mx)
        mx = clampLoHi(mx, mn, ceiling)
        mn = snapToStep(mn, floor, ceiling, step)
        mx = snapToStep(mx, floor, ceiling, step)
        if (mx < mn) mx = mn
        mn = clampLoHi(mn, floor, mx)
        mx = clampLoHi(mx, mn, ceiling)
    }

    function emitIfChanged(): void {
        if (!onChange) return
        if (mn === lastEmittedMin && mx === lastEmittedMax) return
        lastEmittedMin = mn
        lastEmittedMax = mx
        onChange(mn, mx)
    }

    function pushDisplays(): void {
        coerce()
        if (!minInp || !maxInp) return
        if (!editingMin) minInp.value = usdWhole.format(mn)
        if (!editingMax) maxInp.value = usdWhole.format(mx)
        emitIfChanged()
    }

    function digitsFrom(inp: HTMLInputElement): number | undefined {
        const d = inp.value.replace(/\D/g, '')
        if (d === '') return undefined
        return Number(d)
    }

    minInp.addEventListener('focus', () => {
        editingMin = true
        coerce()
        minInp.value = String(mn)
        minInp.select()
    })

    maxInp.addEventListener('focus', () => {
        editingMax = true
        coerce()
        maxInp.value = String(mx)
        maxInp.select()
    })

    minInp.addEventListener('blur', () => {
        editingMin = false
        const v = digitsFrom(minInp)
        if (v !== undefined) {
            mn = snapToStep(v, floor, ceiling, step)
            mn = clampLoHi(mn, floor, mx)
        }
        pushDisplays()
    })

    maxInp.addEventListener('blur', () => {
        editingMax = false
        const v = digitsFrom(maxInp)
        if (v !== undefined) {
            mx = snapToStep(v, floor, ceiling, step)
            mx = clampLoHi(mx, mn, ceiling)
        }
        pushDisplays()
    })

    minInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') minInp.blur()
        if (e.key === 'Escape') {
            pushDisplays()
            minInp.blur()
        }
    })

    maxInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') maxInp.blur()
        if (e.key === 'Escape') {
            pushDisplays()
            maxInp.blur()
        }
    })

    function resetToDefaults(): void {
        editingMin = false
        editingMax = false
        mn = snapToStep(defaultMin, floor, ceiling, step)
        mx = snapToStep(defaultMax, floor, ceiling, step)
        if (mx < mn) mx = mn
        lastEmittedMin = undefined
        lastEmittedMax = undefined
        pushDisplays()
    }

    pushDisplays()

    return { resetToDefaults }
}
