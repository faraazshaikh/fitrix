// The You screen (v1.5.1): always simple. It lists the few things a person needs and keeps the
// rest one tap away in search. There is no switch and no "All settings" row any more. Every page
// still exists, and the search finds any row on any of them.
//
// Pure: no imports, so the root and its test can share it.

/** The groups (settings-pages.js HUBS) the root lists. */
export const SIMPLE_HUBS = ['appearance', 'data-backup']

/**
 * The root's layout. `order` is HUB_ORDER.
 *   `hubs`       the groups to list, in order
 *   `reminders`  a Reminders row of its own (it sits inside Workouts, which the root leaves out)
 */
export function rootLayout(order) {
  return { hubs: order.filter(h => SIMPLE_HUBS.includes(h)), reminders: true }
}
