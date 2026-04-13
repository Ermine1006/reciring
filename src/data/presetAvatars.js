/**
 * 15 curated preset avatars for profile selection.
 *
 * Each seed produces a unique palette + accessory combination
 * via the AnonymousAvatar component's deterministic hash.
 *
 * Usage: store `avatar_url = 'preset:peach'` in the profile,
 *        then render <AnonymousAvatar seed={avatar.seed} />.
 */

const PRESET_AVATARS = [
  { key: 'peach',           label: 'Peach',          seed: 'av-16' },
  { key: 'peach-bow',       label: 'Peach Bow',      seed: 'av-25' },
  { key: 'sky',             label: 'Sky',            seed: 'av-17' },
  { key: 'sky-glasses',     label: 'Sky Glasses',    seed: 'av-8'  },
  { key: 'lavender',        label: 'Lavender',       seed: 'av-10' },
  { key: 'lavender-bloom',  label: 'Lavender Bloom', seed: 'av-45' },
  { key: 'mint',            label: 'Mint',           seed: 'av-11' },
  { key: 'mint-star',       label: 'Mint Star',      seed: 'av-2'  },
  { key: 'rose',            label: 'Rose',           seed: 'av-12' },
  { key: 'rose-bow',        label: 'Rose Bow',       seed: 'av-21' },
  { key: 'honey',           label: 'Honey',          seed: 'av-13' },
  { key: 'honey-star',      label: 'Honey Star',     seed: 'av-4'  },
  { key: 'ocean',           label: 'Ocean',          seed: 'av-14' },
  { key: 'ocean-glasses',   label: 'Ocean Glasses',  seed: 'av-85' },
  { key: 'orchid-bloom',    label: 'Orchid Bloom',   seed: 'av-42' },
]

export default PRESET_AVATARS
