/* The Fitrix mark: stacked plates with a dot on top. Draws in the text colour and scales with the
   font size, like Icon, so it can stand where the old dumbbell stood. The same shapes are in
   resources/icon.svg (the app icon) and in the boot screen in index.html. */
export default function Logo({ size = '1em' }) {
  return (
    <svg width={size} height={size} viewBox="16 14 64 68" fill="currentColor" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="16" y="68" width="64" height="14" rx="7" />
      <rect x="26" y="50" width="44" height="14" rx="7" />
      <rect x="36" y="32" width="24" height="14" rx="7" />
      <circle cx="48" cy="20" r="6" />
    </svg>
  )
}
