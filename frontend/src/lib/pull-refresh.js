// Pull down to refresh (v1.4.13): the gesture's numbers, kept apart from the component that draws
// it. A phone has no browser pull-to-refresh in the app (index.css switches the overscroll off),
// so this is the one way to ask "is there anything new?" without leaving the screen.
//
// Pure: no imports.

export const PULL_THRESHOLD = 72   // px of drawn pull that counts as "refresh"
export const PULL_MAX = 120        // the indicator stops following the finger here
const START_SLOP = 8               // a finger has to travel this far down before anything shows

// The screens it works on: the ones you read, not the ones you do something on. Never the workout
// (a drag there is a set being moved), the chat (its composer owns the bottom, its list scrolls
// inside itself) or the editors.
const PULLABLE = /^\/(home|plan|stats|history|settings|library|muscles)(\/|$)/
const NOT = /^\/plan\/(r|prog)\//
export const pullAllowed = path => PULLABLE.test(path || '') && !NOT.test(path || '')

/** How far the indicator is drawn for a finger that has moved `dy` px down: it resists. */
export function pullDistance(dy) {
  if (!(dy > START_SLOP)) return 0
  return Math.min(PULL_MAX, Math.round((dy - START_SLOP) * 0.55))
}

/** 'idle' (nothing), 'pulling' (keep going), 'ready' (let go to refresh). */
export function pullPhase(dist) {
  if (!(dist > 0)) return 'idle'
  return dist >= PULL_THRESHOLD ? 'ready' : 'pulling'
}

/**
 * Whether a touch may begin a pull.
 *   scrollY   the page is at its very top
 *   sheets    how many sheets or dialogs are open
 *   target    the element touched (anything that scrolls or is typed into keeps its own gesture)
 */
export function pullMayStart({ scrollY, sheets, target }) {
  if (scrollY > 0 || sheets > 0) return false
  if (target?.closest?.('input, textarea, select, [contenteditable], .chips, .hm-wrap, .fv-strip, .seg-scroll, [data-no-pull]')) return false
  return true
}

/** A drag that goes more sideways than down is a swipe (back, a strip), not a pull. */
export const mostlyDown = (dx, dy) => dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2
