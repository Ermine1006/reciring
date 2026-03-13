const mergeClasses = (base, extra) => (extra ? `${base} ${extra}` : base)

export function Card({ className = '', hover = true, ...props }) {
  const base =
    'rounded-2xl bg-[#14141A] border border-white/8 shadow-[0_24px_60px_rgba(0,0,0,0.85)] ' +
    'transition transform ' +
    (hover ? 'hover:-translate-y-0.5 hover:shadow-[0_28px_70px_rgba(0,0,0,0.9)]' : '')

  return <div className={mergeClasses(base, className)} {...props} />
}

export function Button({
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center rounded-full font-semibold tracking-wide ' +
    'transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black'

  const variants = {
    primary:
      'bg-[#C8A45D] text-black hover:bg-[#D2B06A] active:bg-[#B8914C] focus-visible:ring-[#C8A45D]',
    secondary:
      'bg-[#14141A] text-[#E5E5E5] border border-white/10 hover:border-[#C8A45D]/60 hover:bg-white/5 active:bg-white/[0.08] focus-visible:ring-[#C8A45D]',
    ghost:
      'bg-transparent text-[#E5E5E5] hover:bg-white/5 active:bg-white/[0.08] focus-visible:ring-[#C8A45D]',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-sm',
  }

  const finalClass = mergeClasses(
    `${base} ${variants[variant] ?? variants.primary} ${sizes[size] ?? sizes.md}`,
    className,
  )

  return <button className={finalClass} {...props} />
}

export function Chip({ className = '', active = false, ...props }) {
  const base =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium tracking-wide ' +
    'border transition'

  const activeClasses =
    'bg-[#C8A45D] text-black border-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.5)]'
  const inactiveClasses =
    'bg-[#14141A] text-[#A1A1AA] border-white/10 hover:border-[#C8A45D]/60 hover:text-[#E5E5E5]'

  return (
    <button
      className={mergeClasses(
        `${base} ${active ? activeClasses : inactiveClasses}`,
        className,
      )}
      {...props}
    />
  )
}

export function Input({ className = '', ...props }) {
  const base =
    'w-full rounded-2xl bg-[#09090F] border border-white/10 px-4 py-3 text-sm ' +
    'text-[#E5E5E5] placeholder:text-[#52525B] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A45D] focus-visible:border-transparent'

  return <input className={mergeClasses(base, className)} {...props} />
}

export function TextArea({ className = '', ...props }) {
  const base =
    'w-full rounded-2xl bg-[#09090F] border border-white/10 px-4 py-3 text-sm ' +
    'text-[#E5E5E5] placeholder:text-[#52525B] resize-none ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A45D] focus-visible:border-transparent'

  return <textarea className={mergeClasses(base, className)} {...props} />
}

