"use client";

import { memo, useCallback, useState } from "react";
import { Undo2, Redo2, Keyboard } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";
import { ShortcutsModal } from "./ShortcutsModal";

/**
 * Floating bottom-left cluster: Undo, Redo, Keyboard shortcuts.
 * Mirrors krea's bottom-left placement.
 */
function BottomLeftToolbarInner() {
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const canUndo = useWorkflowStore((s) => s.canUndo);
  const canRedo = useWorkflowStore((s) => s.canRedo);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const handleUndo = useCallback(() => undo(), [undo]);
  const handleRedo = useCallback(() => redo(), [redo]);

  return (
    <>
      <div className="bottom-left-toolbar">
        <button
          className={`canvas-toolbar__btn ${!canUndo ? "canvas-toolbar__btn--disabled" : ""}`}
          onClick={handleUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={15} />
        </button>
        <button
          className={`canvas-toolbar__btn ${!canRedo ? "canvas-toolbar__btn--disabled" : ""}`}
          onClick={handleRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 size={15} />
        </button>
        <button
          className="canvas-toolbar__btn"
          onClick={() => setShortcutsOpen(true)}
          title="Keyboard Shortcuts"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard size={15} />
        </button>
      </div>

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}

export const BottomLeftToolbar = memo(BottomLeftToolbarInner);