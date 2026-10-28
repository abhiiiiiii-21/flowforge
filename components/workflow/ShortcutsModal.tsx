'use client'

import { memo } from 'react'
import { X } from 'lucide-react'

interface ShortcutsModalProps {
  open: boolean
  onClose: () => void
}

function ShortcutsModalInner({ open, onClose }: ShortcutsModalProps) {
  if (!open) return null

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal__header">
          <h2 className="shortcuts-modal__title">Keyboard Shortcuts</h2>
          <p className="shortcuts-modal__subtitle">
            Quickly navigate and create with these shortcuts.
          </p>
          <button className="shortcuts-modal__close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="shortcuts-modal__body">
          {/* General */}
          <div className="shortcuts-section">
            <div className="shortcuts-section__title">General</div>
            <ShortcutRow label="Undo" keys={['Ctrl', 'Z']} />
            <ShortcutRow label="Redo" keys={['Ctrl', 'Shift', 'Z']} />
            <ShortcutRow label="Select all" keys={['Ctrl', 'A']} />
            <ShortcutRow label="Deselect all" keys={['Esc']} />
            <ShortcutRow label="Delete selected" keys={['Del']} />
            <ShortcutRow label="Pan canvas" keys={['Space', 'Drag']} />
          </div>

          {/* Node Creation */}
          <div className="shortcuts-section">
            <div className="shortcuts-section__title">Node Creation</div>
            <ShortcutRow label="Text node" keys={['N']} />
            <ShortcutRow label="Image node" keys={['I']} />
            <ShortcutRow label="Video node" keys={['V']} />
            <ShortcutRow label="LLM node" keys={['L']} />
          </div>

          {/* Node Operations */}
          <div className="shortcuts-section">
            <div className="shortcuts-section__title">Node Operations</div>
            <ShortcutRow label="Duplicate" keys={['Ctrl', 'D']} />
          </div>

          {/* Execution */}
          <div className="shortcuts-section">
            <div className="shortcuts-section__title">Execution</div>
            <ShortcutRow label="Run workflow" keys={['Ctrl', 'Enter']} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="shortcut-row">
      <span className="shortcut-row__label">{label}</span>
      <div className="shortcut-row__keys">
        {keys.map((key, i) => (
          <kbd key={i} className="shortcut-key">{key}</kbd>
        ))}
      </div>
    </div>
  )
}

export const ShortcutsModal = memo(ShortcutsModalInner)
