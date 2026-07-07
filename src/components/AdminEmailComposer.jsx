import { forwardRef, useRef, useState } from 'react'

const C = {
  gold:     '#C8A96A',
  goldDark: '#A88245',
  goldBg:   '#FBF6EC',
  text:     '#111111',
  textSub:  '#6B7280',
  textMuted:'#9CA3AF',
  border:   '#E5E7EB',
  divider:  '#F0ECE4',
  bgInput:  '#FAFAFA',
  bgCard:   '#FFFFFF',
}

// Palette of block types the admin can insert. Kept in sync with
// src/lib/emailBlocks.js — server-side whitelist rejects anything
// outside this set.
const BLOCK_MENU = [
  { type: 'title',     label: 'Title',            icon: 'T'  },
  { type: 'heading',   label: 'Section heading',  icon: 'H'  },
  { type: 'paragraph', label: 'Paragraph',        icon: '¶'  },
  { type: 'bullets',   label: 'Bullet list',      icon: '•'  },
  { type: 'numbers',   label: 'Numbered list',    icon: '1.' },
  { type: 'quote',     label: 'Highlight card',   icon: '❝'  },
  { type: 'divider',   label: 'Divider',          icon: '—'  },
  { type: 'cta',       label: 'CTA button',       icon: '→'  },
]

// New block factory. Defaults are neutral so the newly-added block
// doesn't ship placeholder text if the admin forgets to fill it in.
function newBlock(type) {
  switch (type) {
    case 'bullets':
    case 'numbers': return { type, items: [''] }
    case 'divider': return { type }
    case 'cta':     return { type, text: '', url: '' }
    default:        return { type, text: '' }
  }
}

/**
 * AdminEmailComposer — block-based email editor.
 *
 * Owns nothing about sending; parent (AdminEmailTest) holds the block
 * list in its own state and passes it back down. This keeps the
 * composer reusable and lets the preview panel read the same source
 * of truth without prop drilling through the composer.
 *
 * Props:
 *   blocks    — Block[] current value
 *   onChange  — (Block[]) => void, called on every edit
 */
export default function AdminEmailComposer({ blocks, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  function update(i, patch) {
    const next = blocks.slice()
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  function remove(i) {
    const next = blocks.slice()
    next.splice(i, 1)
    onChange(next)
  }
  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= blocks.length) return
    const next = blocks.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function insert(type) {
    onChange([...blocks, newBlock(type)])
    setPickerOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {blocks.length === 0 && (
        <div style={{
          padding: '20px 16px',
          borderRadius: 12,
          border: `1.5px dashed ${C.border}`,
          background: '#FAFAFA',
          textAlign: 'center',
          fontSize: 13,
          color: C.textSub,
          fontFamily: 'Inter, system-ui, sans-serif',
          lineHeight: 1.5,
        }}>
          Start by adding a title, then paragraphs and lists below.
        </div>
      )}

      {blocks.map((b, i) => (
        <BlockRow
          key={i}
          block={b}
          isFirst={i === 0}
          isLast={i === blocks.length - 1}
          onUpdate={(patch) => update(i, patch)}
          onRemove={() => remove(i)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, +1)}
        />
      ))}

      {/* Add block */}
      {pickerOpen ? (
        <div style={{
          padding: 12, borderRadius: 12,
          background: C.goldBg, border: `1.5px solid ${C.gold}`,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 10,
          }}>
            <p style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: C.goldDark, margin: 0,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              Pick a block
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              style={{ background: 'none', border: 'none', color: C.textSub, fontSize: 12, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 6,
          }}>
            {BLOCK_MENU.map(opt => (
              <button
                key={opt.type}
                type="button"
                onClick={() => insert(opt.type)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  background: C.bgCard, border: `1px solid ${C.border}`,
                  borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 12, color: C.text,
                  textAlign: 'left',
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: C.goldBg, color: C.goldDark,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, fontFamily: 'ui-monospace, monospace',
                  flexShrink: 0,
                }}>
                  {opt.icon}
                </span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          style={{
            padding: '10px 14px',
            border: `1.5px dashed ${C.border}`, background: 'transparent',
            borderRadius: 12, cursor: 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13, color: C.goldDark, fontWeight: 600,
          }}
        >
          + Add block
        </button>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// BlockRow — single block with its controls + type-specific editor
// ────────────────────────────────────────────────────────────────

function BlockRow({ block, isFirst, isLast, onUpdate, onRemove, onMoveUp, onMoveDown }) {
  return (
    <div style={{
      padding: 12, borderRadius: 12,
      background: C.bgCard, border: `1px solid ${C.border}`,
    }}>
      {/* Toolbar strip */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 8,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: C.textMuted,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          {block.type}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <IconButton onClick={onMoveUp}    disabled={isFirst} title="Move up">↑</IconButton>
          <IconButton onClick={onMoveDown}  disabled={isLast}  title="Move down">↓</IconButton>
          <IconButton onClick={onRemove}    title="Delete" danger>×</IconButton>
        </div>
      </div>

      <BlockEditor block={block} onUpdate={onUpdate} />
    </div>
  )
}

function IconButton({ children, onClick, disabled, danger, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 26, height: 26,
        border: `1px solid ${C.border}`,
        borderRadius: 7,
        background: disabled ? '#F5F5F5' : C.bgCard,
        color: disabled ? C.textMuted : (danger ? '#DC2626' : C.textSub),
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 14, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

// Per-type editor. Kept together so the block schema stays local to
// this file — future block types add a case here and one in the menu.
function BlockEditor({ block, onUpdate }) {
  const textAreaRef = useRef(null)

  switch (block.type) {
    case 'title':
      return (
        <TextField
          value={block.text || ''}
          onChange={v => onUpdate({ text: v })}
          placeholder="Email title"
          fontSize={17}
          maxLength={140}
        />
      )

    case 'heading':
      return (
        <TextField
          value={block.text || ''}
          onChange={v => onUpdate({ text: v })}
          placeholder="Section heading"
          fontSize={14}
          maxLength={120}
        />
      )

    case 'paragraph':
      return (
        <div>
          <InlineToolbar textAreaRef={textAreaRef} value={block.text || ''} onChange={v => onUpdate({ text: v })} />
          <TextArea
            ref={textAreaRef}
            value={block.text || ''}
            onChange={v => onUpdate({ text: v })}
            placeholder="Write the paragraph. Use **bold**, *italic*, [link](https://…)."
            rows={4}
          />
        </div>
      )

    case 'bullets':
    case 'numbers':
      return (
        <ListEditor
          items={Array.isArray(block.items) ? block.items : ['']}
          numbered={block.type === 'numbers'}
          onChange={items => onUpdate({ items })}
        />
      )

    case 'divider':
      return (
        <div style={{
          height: 1, background: C.divider, marginTop: 4, marginBottom: 2,
        }} />
      )

    case 'quote':
      return (
        <div>
          <InlineToolbar textAreaRef={textAreaRef} value={block.text || ''} onChange={v => onUpdate({ text: v })} />
          <TextArea
            ref={textAreaRef}
            value={block.text || ''}
            onChange={v => onUpdate({ text: v })}
            placeholder="Short highlighted note or callout."
            rows={2}
          />
        </div>
      )

    case 'cta':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <TextField
            value={block.text || ''}
            onChange={v => onUpdate({ text: v })}
            placeholder="Button label (e.g. Open Mutu)"
            maxLength={40}
          />
          <TextField
            value={block.url || ''}
            onChange={v => onUpdate({ url: v })}
            placeholder="https://reciring.com/…"
            mono
          />
        </div>
      )

    default:
      return null
  }
}

// ────────────────────────────────────────────────────────────────
// Primitives
// ────────────────────────────────────────────────────────────────

function TextField({ value, onChange, placeholder, fontSize = 13.5, maxLength, mono }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '9px 12px',
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        background: C.bgInput,
        outline: 'none',
        fontSize,
        fontFamily: mono
          ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
          : 'Inter, system-ui, sans-serif',
        color: C.text,
      }}
    />
  )
}

// forwardRef so InlineToolbar can focus + insert markers into the same
// textarea. React 19's ref-as-prop shape would let us skip this, but
// staying with forwardRef keeps compatibility with 18.
const TextArea = forwardRef(function TextArea({ value, onChange, placeholder, rows }, ref) {
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%',
        padding: '9px 12px',
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        background: C.bgInput,
        outline: 'none',
        fontSize: 13.5,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: C.text,
        lineHeight: 1.55,
        resize: 'vertical',
      }}
    />
  )
})

function InlineToolbar({ textAreaRef, value, onChange }) {
  function wrap(before, after) {
    const el = textAreaRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end   = el.selectionEnd ?? 0
    const selected = value.slice(start, end)
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(next)
    // Restore selection just inside the markers so the user can keep typing.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  function insertLink() {
    const el = textAreaRef.current
    const url = window.prompt('Link URL (https://…)')
    if (!url) return
    const start = el?.selectionStart ?? 0
    const end   = el?.selectionEnd   ?? 0
    const selected = value.slice(start, end) || 'link text'
    const next = value.slice(0, start) + `[${selected}](${url})` + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + 1, start + 1 + selected.length)
    })
  }

  const buttons = [
    { label: 'B',  title: 'Bold',   onClick: () => wrap('**', '**'), bold: true },
    { label: 'I',  title: 'Italic', onClick: () => wrap('*',  '*'),  italic: true },
    { label: '🔗', title: 'Link',   onClick: insertLink },
  ]

  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
      {buttons.map(b => (
        <button
          key={b.label}
          type="button"
          onClick={b.onClick}
          title={b.title}
          style={{
            padding: '3px 10px',
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.bgCard,
            fontSize: 12,
            fontWeight: b.bold ? 700 : 500,
            fontStyle: b.italic ? 'italic' : 'normal',
            color: C.textSub,
            cursor: 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

function ListEditor({ items, onChange, numbered }) {
  function setItem(i, v) {
    const next = items.slice()
    next[i] = v
    onChange(next)
  }
  function addItem() { onChange([...items, '']) }
  function removeItem(i) {
    if (items.length <= 1) { onChange(['']); return }
    const next = items.slice(); next.splice(i, 1)
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 20, textAlign: 'right', fontSize: 12,
            color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif',
            flexShrink: 0,
          }}>
            {numbered ? `${i + 1}.` : '•'}
          </span>
          <input
            type="text"
            value={item}
            onChange={e => setItem(i, e.target.value)}
            placeholder="List item — supports **bold** and [link](url)"
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.bgInput,
              outline: 'none',
              fontSize: 13,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: C.text,
            }}
          />
          <button
            type="button"
            onClick={() => removeItem(i)}
            title="Remove item"
            style={{
              width: 22, height: 22, padding: 0,
              border: `1px solid ${C.border}`, borderRadius: 6,
              background: C.bgCard, color: '#DC2626',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        style={{
          alignSelf: 'flex-start',
          padding: '5px 10px',
          border: `1px dashed ${C.border}`, background: 'transparent',
          borderRadius: 8, color: C.goldDark, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        + item
      </button>
    </div>
  )
}
