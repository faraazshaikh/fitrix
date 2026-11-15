// Simple settings (v1.4.13): the You screen shows the few things a person needs and keeps the rest
// one tap away. It only changes what the Settings root lists. Every page still exists, and the
// search still finds any row on any of them, so nothing is lost by turning it on.
//
//   S.simple === true   simple, the root lists the basics
//   anything else       the full root, as before (every profile from before 1.4.13)
//
// Pure: no imports, so the root and its test can share it.

/** The groups (settings-pages.js HUBS) a simple root still lists. */
export const SIMPLE_HUBS = ['appearance', 'data-backup']

/** Whether this profile has simple settings on. */
export const isSimple = S => S?.simple === true

/**
 * The root's layout for this profile.
 *   `hubs`       the groups to list, in order
 *   `reminders`  a Reminders row of its own (it sits inside Workouts, which a simple root hides)
 *   `more`       an "All settings" row that opens the rest, until it has been opened
 * `order` is HUB_ORDER, `expanded` whether "All settings" has been tapped on this visit.
 */
export function rootLayout(order, S, expanded) {
  if (!isSimple(S) || expanded) return { hubs: order, reminders: false, more: false }
  return { hubs: order.filter(h => SIMPLE_HUBS.includes(h)), reminders: true, more: true }
}
