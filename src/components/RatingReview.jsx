import { useState } from 'react'
import { motion } from 'framer-motion'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
}

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent']

export default function RatingReview({ matchId, peerName, onSubmitted }) {
  const [rating, setRating] = useState(0)
  const [hover,  setHover]  = useState(0)
  const [review, setReview] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmitted?.({ matchId, rating, review })
  }

  const displayed = hover || rating

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-5 py-7"
    >
      {/* Section header */}
      <div className="mb-7">
        <p className="text-[10px] tracking-[0.28em] font-semibold uppercase mb-1" style={{ color: C.gold }}>
          Feedback
        </p>
        <h2 className="font-display text-[24px] font-semibold" style={{ color: C.text }}>
          Rate & review
        </h2>
        <p className="text-sm mt-1 leading-relaxed" style={{ color: C.textSub }}>
          How did it go with {peerName || 'your match'}?{' '}
          <span style={{ color: C.textMuted }}>Your review is anonymous.</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Star rating card */}
        <div
          className="rounded-[20px] px-6 py-6 text-center"
          style={{
            background: C.white,
            border: `1px solid`,
            borderColor: displayed ? C.goldLight : '#F0ECE4',
            boxShadow: displayed ? '0 4px 20px rgba(200,169,106,0.12)' : '0 2px 10px rgba(0,0,0,0.04)',
            transition: 'all 0.2s',
          }}
        >
          {/* Star row */}
          <div className="flex justify-center gap-2 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(star)}
                className="text-[36px] leading-none transition-all duration-150 active:scale-90"
                style={{
                  color: displayed >= star ? C.gold : '#E5E7EB',
                  filter: displayed >= star ? 'drop-shadow(0 2px 6px rgba(200,169,106,0.4))' : 'none',
                  transform: `scale(${displayed === star ? 1.2 : displayed >= star ? 1.05 : 1})`,
                  transition: 'all 0.15s',
                }}
                aria-label={`${star} star${star !== 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
          </div>

          {/* Label */}
          <p
            className="text-sm font-semibold tracking-wide transition-all duration-200"
            style={{
              color: displayed ? C.goldDark : C.textMuted,
              opacity: displayed ? 1 : 0.5,
              height: 20,
            }}
          >
            {LABELS[displayed] || 'Tap to rate'}
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

        {/* Text area */}
        <div>
          <label
            htmlFor="review-text"
            className="block text-[11px] tracking-[0.16em] uppercase font-semibold mb-3"
            style={{ color: C.textSub }}
          >
            Written review <span style={{ color: C.textMuted, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
          </label>
          <textarea
            id="review-text"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="e.g. Incredibly helpful — great industry insights and very generous with their time."
            rows={4}
            className="w-full rounded-[16px] px-5 py-4 text-sm resize-none transition-all duration-200"
            style={{
              background: C.white,
              border: `1.5px solid ${C.border}`,
              color: C.text,
              lineHeight: 1.6,
            }}
            onFocus={(e)  => { e.target.style.borderColor = C.gold; e.target.style.boxShadow = '0 0 0 3px rgba(200,169,106,0.12)' }}
            onBlur={(e)   => { e.target.style.borderColor = C.border; e.target.style.boxShadow = 'none' }}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full py-4 rounded-[16px] text-sm font-semibold tracking-[0.12em] uppercase transition-all duration-200 active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldDark} 100%)`,
            color: '#fff',
            boxShadow: '0 8px 24px rgba(200,169,106,0.35)',
          }}
        >
          Submit review
        </button>

        <p className="text-center text-[11px]" style={{ color: C.textMuted }}>
          Reviews are anonymous and help build community trust.
        </p>
      </form>
    </motion.div>
  )
}
