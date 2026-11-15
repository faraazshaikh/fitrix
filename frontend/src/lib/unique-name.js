// A name that does not clash with the ones already there: "New routine", then "New routine 2",
// "New routine 3". Pure, so a test can hold it.
export function uniqueName(base, taken) {
  const have = new Set((taken || []).map(n => String(n || '').trim().toLowerCase()))
  if (!have.has(base.trim().toLowerCase())) return base
  for (let i = 2; ; i++) {
    const c = base + ' ' + i
    if (!have.has(c.toLowerCase())) return c
  }
}
