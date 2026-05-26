import type { Map as MapboxMap } from 'mapbox-gl'
import type { MapTrio } from './create'

export type InsetId = 'alaska' | 'hawaii'

const INSET_SELECTORS: Record<InsetId, string> = {
    alaska: '#inset-alaska',
    hawaii: '#inset-hawaii',
}

function insetEl(id: InsetId): HTMLElement | null {
    return document.querySelector<HTMLElement>(INSET_SELECTORS[id])
}

function emitInsetVisibility(id: InsetId, visible: boolean): void {
    window.dispatchEvent(
        new CustomEvent('inset-visibility-changed', { detail: { id, visible } }),
    )
}

export type SetInsetVisibleOptions = {
    /** When false, show/hide immediately (e.g. initial drawer sync). Default true. */
    animate?: boolean
}

export function isInsetVisible(id: InsetId): boolean {
    const el = insetEl(id)
    if (!el) return false
    return !el.classList.contains('is-hidden')
}

const isMobileFormFactor = (): boolean => {
    return window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
}

/**
 * Wires the Hawaii / Alaska inset overlays:
 *   - Close button (animates out + hides)
 *   - Drag (pointer-based, clamped to map shell)
 *   - Expand / shrink with a FLIP transition
 *
 * Requires the inset DOM nodes to exist when this runs. Safe to call once at
 * startup.
 */
export function wireInsets({ hawaiiMap, alaskaMap }: MapTrio): void {
    const alaskaInset = document.querySelector<HTMLElement>('#inset-alaska')
    const hawaiiInset = document.querySelector<HTMLElement>('#inset-hawaii')
    const alaskaClose = document.querySelector<HTMLButtonElement>('#close-alaska')
    const hawaiiClose = document.querySelector<HTMLButtonElement>('#close-hawaii')
    const alaskaExpand = document.querySelector<HTMLButtonElement>('#expand-alaska')
    const hawaiiExpand = document.querySelector<HTMLButtonElement>('#expand-hawaii')
    const alaskaHeader = document.querySelector<HTMLElement>('#inset-alaska .overlay-header')
    const hawaiiHeader = document.querySelector<HTMLElement>('#inset-hawaii .overlay-header')
    const mapShell = document.querySelector<HTMLElement>('.map-shell')

    wireInsetClose(hawaiiInset, hawaiiClose)
    wireInsetClose(alaskaInset, alaskaClose)
    wireInsetDrag(hawaiiInset, hawaiiHeader, hawaiiMap, mapShell)
    wireInsetDrag(alaskaInset, alaskaHeader, alaskaMap, mapShell)

    if (alaskaInset && alaskaExpand) {
        wireInsetExpandToggle({
            inset: alaskaInset,
            map: alaskaMap,
            expandButton: alaskaExpand,
            ariaExpandLabel: 'Expand Alaska inset',
            ariaShrinkLabel: 'Minimize Alaska inset',
        })
    }
    if (hawaiiInset && hawaiiExpand) {
        wireInsetExpandToggle({
            inset: hawaiiInset,
            map: hawaiiMap,
            expandButton: hawaiiExpand,
            ariaExpandLabel: 'Expand Hawaii inset',
            ariaShrinkLabel: 'Minimize Hawaii inset',
        })
    }
}

// ---------------------------------------------------------------------------
// Close button
// ---------------------------------------------------------------------------

function wireInsetClose(
    inset: HTMLElement | null,
    closeButton: HTMLButtonElement | null,
): void {
    if (!inset || !closeButton) return

    closeButton.addEventListener('click', () => {
        const id = insetIdFromEl(inset)
        if (!id) return
        void hideInsetAnimated(inset, id)
    })
}

// ---------------------------------------------------------------------------
// Drag
// ---------------------------------------------------------------------------

function wireInsetDrag(
    inset: HTMLElement | null,
    handle: HTMLElement | null,
    map: MapboxMap,
    boundsEl: HTMLElement | null,
): void {
    if (!inset || !handle || !boundsEl) return

    let isDragging = false
    let pointerId = -1
    let offsetX = 0
    let offsetY = 0
    /** Cached from pointerdown; avoids layout reads on every pointermove */
    let shellLeft = 0
    let shellTop = 0
    let maxLeft = 0
    let maxTop = 0
    let moveRaf = 0
    let pendingLeft = 0
    let pendingTop = 0

    const clamp = (value: number, min: number, max: number): number =>
        Math.min(Math.max(value, min), max)

    const flushPendingPosition = (): void => {
        inset.style.left = `${pendingLeft}px`
        inset.style.top = `${pendingTop}px`
    }

    handle.addEventListener('pointerdown', (event: PointerEvent) => {
        if (isMobileFormFactor()) return
        if (inset.classList.contains('expanded')) return
        if (inset.classList.contains('is-inset-flipping')) return

        const target = event.target as HTMLElement
        if (target.closest('.close-button')) return

        const shellRect = boundsEl.getBoundingClientRect()
        const rect = inset.getBoundingClientRect()

        inset.style.left = `${rect.left - shellRect.left}px`
        inset.style.top = `${rect.top - shellRect.top}px`
        inset.style.bottom = 'auto'

        shellLeft = shellRect.left
        shellTop = shellRect.top
        const iw = inset.offsetWidth
        const ih = inset.offsetHeight
        maxLeft = Math.max(shellRect.width - iw, 0)
        maxTop = Math.max(shellRect.height - ih, 0)
        pendingLeft = rect.left - shellRect.left
        pendingTop = rect.top - shellRect.top

        pointerId = event.pointerId
        offsetX = event.clientX - rect.left
        offsetY = event.clientY - rect.top
        isDragging = true
        inset.classList.add('is-dragging')
        handle.setPointerCapture(pointerId)
        event.preventDefault()
    })

    handle.addEventListener('pointermove', (event: PointerEvent) => {
        if (!isDragging || event.pointerId !== pointerId) return

        pendingLeft = clamp(event.clientX - offsetX - shellLeft, 0, maxLeft)
        pendingTop = clamp(event.clientY - offsetY - shellTop, 0, maxTop)

        if (moveRaf !== 0) return
        moveRaf = window.requestAnimationFrame(() => {
            moveRaf = 0
            flushPendingPosition()
        })
    })

    const stopDrag = (event: PointerEvent): void => {
        if (!isDragging || event.pointerId !== pointerId) return
        isDragging = false
        if (moveRaf !== 0) {
            window.cancelAnimationFrame(moveRaf)
            moveRaf = 0
            flushPendingPosition()
        }
        inset.classList.remove('is-dragging')
        handle.releasePointerCapture(pointerId)
        map.resize()
    }

    handle.addEventListener('pointerup', stopDrag)
    handle.addEventListener('pointercancel', stopDrag)
}

// ---------------------------------------------------------------------------
// Expand / shrink with FLIP
// ---------------------------------------------------------------------------

type InsetSavedLayout = Readonly<{
    left: string
    top: string
    bottom: string
    width: string
    height: string
}>

type InsetExpandMeta = Readonly<{
    inset: HTMLElement
    map: MapboxMap
    expandButton: HTMLButtonElement
    ariaExpandLabel: string
    ariaShrinkLabel: string
}>

type ExpandMode = Readonly<
    'expand' | 'shrink'
>

const insetExpandSavedLayout = new WeakMap<HTMLElement, InsetSavedLayout>()
const insetExpandRegistry: InsetExpandMeta[] = []

function captureInsetLayout(el: HTMLElement): InsetSavedLayout {
    const { style } = el
    return {
        left: style.left,
        top: style.top,
        bottom: style.bottom,
        width: style.width,
        height: style.height,
    }
}

function restoreInsetLayout(el: HTMLElement, snapshot: InsetSavedLayout): void {
    const { style } = el
    style.left = snapshot.left
    style.top = snapshot.top
    style.bottom = snapshot.bottom
    style.width = snapshot.width
    style.height = snapshot.height
}

const INSET_FLIP_MS = 380

/** Match FLIP settle + Daisy drawer follow-up sizing */
function scheduleInsetMapResize(map: MapboxMap): void {
    queueMicrotask(() => map.resize())
    window.setTimeout(() => map.resize(), INSET_FLIP_MS + 40)
}

/** In-flight FLIP teardown (abort transforms + listener/timer when starting a new transition) */
const insetFlipAbort = new WeakMap<HTMLElement, () => void>()

function abortInsetFlip(inset: HTMLElement): void {
    insetFlipAbort.get(inset)?.()
}

function prefersInsetFlipAnimation(): boolean {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function clearInsetFlipArtifacts(inset: HTMLElement): void {
    inset.style.removeProperty('transform')
    inset.style.removeProperty('transition')
    inset.style.removeProperty('will-change')
    inset.style.removeProperty('transform-origin')
    inset.classList.remove('is-inset-flipping')
}

/**
 * FLIP: layout jumps between small card and shell fill; animate with transform
 * between rects.
 */
function animateInsetFlip(
    inset: HTMLElement,
    map: MapboxMap,
    mode: ExpandMode,
    snap: InsetSavedLayout | undefined,
): Promise<void> {

    if (!prefersInsetFlipAnimation()) {
        if (mode === 'expand') {
            inset.classList.add('expanded')
        }
        else {
            inset.classList.remove('expanded')
            if (snap) restoreInsetLayout(inset, snap)
        }
        scheduleInsetMapResize(map)
        return Promise.resolve()
    }

    return new Promise((resolve) => {
        abortInsetFlip(inset)

        const firstRect = inset.getBoundingClientRect()

        if (mode === 'expand') {
            inset.classList.add('expanded')
        }
        else {
            inset.classList.remove('expanded')
            if (snap) restoreInsetLayout(inset, snap)
        }

        void inset.offsetWidth

        const lastRect = inset.getBoundingClientRect()
        const lw = Math.max(lastRect.width, 1e-3)
        const lh = Math.max(lastRect.height, 1e-3)
        const dx = firstRect.left - lastRect.left
        const dy = firstRect.top - lastRect.top
        const sx = firstRect.width / lw
        const sy = firstRect.height / lh

        let settled = false
        let fallbackTimer = 0

        const settle = (): void => {
            if (settled) return
            settled = true
            window.clearTimeout(fallbackTimer)
            inset.removeEventListener('transitionend', onTransitionEnd)
            insetFlipAbort.delete(inset)
            clearInsetFlipArtifacts(inset)
            resolve()
            scheduleInsetMapResize(map)
        }

        function onTransitionEnd(ev: TransitionEvent): void {
            if (ev.target !== inset || ev.propertyName !== 'transform') return
            settle()
        }

        fallbackTimer = window.setTimeout(settle, INSET_FLIP_MS + 120)

        insetFlipAbort.set(inset, () => {
            window.clearTimeout(fallbackTimer)
            inset.removeEventListener('transitionend', onTransitionEnd)
            if (!settled) {
                settled = true
                insetFlipAbort.delete(inset)
                clearInsetFlipArtifacts(inset)
                resolve()
                scheduleInsetMapResize(map)
            }
        })

        inset.classList.add('is-inset-flipping')
        inset.style.transformOrigin = '0 0'
        inset.style.willChange = 'transform'
        inset.style.transition = 'none'
        inset.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`

        inset.addEventListener('transitionend', onTransitionEnd)

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (settled) return
                inset.style.transition =
                    `transform ${INSET_FLIP_MS}ms cubic-bezier(0.22, 0.82, 0.22, 1)`
                inset.style.transform = ''
                inset.style.removeProperty('will-change')
            })
        })
    })
}

async function shrinkInsetByEl(inset: HTMLElement): Promise<void> {
    abortInsetFlip(inset)

    const meta = insetExpandRegistry.find((r) => r.inset === inset)
    if (!meta?.inset.classList.contains('expanded')) return

    const snap = insetExpandSavedLayout.get(inset)
    insetExpandSavedLayout.delete(inset)
    meta.expandButton.setAttribute('aria-expanded', 'false')
    meta.expandButton.setAttribute('aria-label', meta.ariaExpandLabel)

    await animateInsetFlip(inset, meta.map, 'shrink', snap)
}

const INSET_SHOW_HIDE_MS = 220

function insetIdFromEl(inset: HTMLElement): InsetId | null {
    if (inset.id === 'inset-alaska') return 'alaska'
    if (inset.id === 'inset-hawaii') return 'hawaii'
    return null
}

function prefersReducedInsetMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function resizeInsetMap(inset: HTMLElement): void {
    const meta = insetExpandRegistry.find((r) => r.inset === inset)
    if (!meta) return
    scheduleInsetMapResize(meta.map)
}

function setInsetVisibleInstant(inset: HTMLElement, id: InsetId, visible: boolean): void {
    inset.classList.remove('is-closing', 'is-opening')
    inset.classList.toggle('is-hidden', !visible)
    emitInsetVisibility(id, visible)
    if (visible) resizeInsetMap(inset)
}

function onInsetCardAnimationEnd(
    inset: HTMLElement,
    animationName: 'inset-close' | 'inset-open',
    done: () => void,
): (ev: AnimationEvent) => void {
    return (ev: AnimationEvent) => {
        const card = inset.querySelector('.overlay-map')
        if (ev.target !== card || ev.animationName !== animationName) return
        done()
    }
}

async function hideInsetAnimated(inset: HTMLElement, id: InsetId): Promise<void> {
    if (inset.classList.contains('is-hidden') || inset.classList.contains('is-closing')) return

    if (prefersReducedInsetMotion()) {
        await shrinkInsetByEl(inset)
        setInsetVisibleInstant(inset, id, false)
        return
    }

    await shrinkInsetByEl(inset)
    inset.classList.remove('is-opening')

    return new Promise((resolve) => {
        let settled = false
        const settle = (): void => {
            if (settled) return
            settled = true
            window.clearTimeout(fallback)
            inset.removeEventListener('animationend', onEnd)
            inset.classList.remove('is-closing')
            inset.classList.add('is-hidden')
            emitInsetVisibility(id, false)
            resolve()
        }

        const onEnd = onInsetCardAnimationEnd(inset, 'inset-close', settle)
        const fallback = window.setTimeout(settle, INSET_SHOW_HIDE_MS + 80)

        inset.classList.add('is-closing')
        inset.addEventListener('animationend', onEnd)
    })
}

async function showInsetAnimated(inset: HTMLElement, id: InsetId): Promise<void> {
    if (!inset.classList.contains('is-hidden')) return
    if (inset.classList.contains('is-opening')) return

    if (prefersReducedInsetMotion()) {
        setInsetVisibleInstant(inset, id, true)
        return
    }

    inset.classList.remove('is-closing', 'is-hidden')
    inset.classList.add('is-opening')
    void inset.offsetWidth

    return new Promise((resolve) => {
        let settled = false
        const settle = (): void => {
            if (settled) return
            settled = true
            window.clearTimeout(fallback)
            inset.removeEventListener('animationend', onEnd)
            inset.classList.remove('is-opening')
            emitInsetVisibility(id, true)
            resizeInsetMap(inset)
            resolve()
        }

        const onEnd = onInsetCardAnimationEnd(inset, 'inset-open', settle)
        const fallback = window.setTimeout(settle, INSET_SHOW_HIDE_MS + 80)

        inset.addEventListener('animationend', onEnd)
    })
}

/** Show or hide an inset card (does not remove the map instance). */
export function setInsetVisible(
    id: InsetId,
    visible: boolean,
    options?: SetInsetVisibleOptions,
): void {
    const el = insetEl(id)
    if (!el) return

    const animate = options?.animate !== false

    if (visible) {
        if (!el.classList.contains('is-hidden')) return
        if (animate) void showInsetAnimated(el, id)
        else setInsetVisibleInstant(el, id, true)
        return
    }

    if (el.classList.contains('is-hidden')) return
    if (animate) void hideInsetAnimated(el, id)
    else {
        void shrinkInsetByEl(el).then(() => setInsetVisibleInstant(el, id, false))
    }
}

async function collapseOtherInset(keepOpen: HTMLElement): Promise<void> {
    const expandedOthers = insetExpandRegistry.filter(
        ({ inset }) => inset !== keepOpen && inset.classList.contains('expanded'),
    )
    for (const { inset } of expandedOthers) {
        await shrinkInsetByEl(inset)
    }
}

/** Expand / shrink Alaska or Hawaii inset; restores drag offsets when shrinking */
function wireInsetExpandToggle(meta: InsetExpandMeta): void {
    insetExpandRegistry.push(meta)
    const { inset, expandButton, map, ariaShrinkLabel } = meta

    expandButton.addEventListener('click', () => {
        void (async () => {
            if (inset.classList.contains('expanded')) {
                await shrinkInsetByEl(inset)
                return
            }

            insetExpandSavedLayout.set(inset, captureInsetLayout(inset))

            await collapseOtherInset(inset)

            expandButton.setAttribute('aria-expanded', 'true')
            expandButton.setAttribute('aria-label', ariaShrinkLabel)
            await animateInsetFlip(inset, map, 'expand', undefined)
        })()
    })
}
