"use client";

import { memo, useCallback } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import {
  MousePointer2,
  Hand,
  Scissors,
} from "lucide-react";
import toast from "react-hot-toast";

/**
 * Centered bottom canvas toolbar (krea-style):
 *  Select | Pan | Cut
 *
 * Undo / Redo / Keyboard-shortcuts now live in BottomLeftToolbar.
 */
function CanvasToolbarInner() {
  const edges = useWorkflowStore((s) => s.edges);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const pushSnapshot = useWorkflowStore((s) => s.pushSnapshot);

  const activeTool = useWorkflowStore((s) => s.activeTool);
  const setActiveTool = useWorkflowStore((s) => s.setActiveTool);

  const handleCut = useCallback(() => {
    const selectedEdges = edges.filter((e) => e.selected);
    if (selectedEdges.length > 0) {
      pushSnapshot();
      setEdges(edges.filter((e) => !e.selected));
      toast.success(
        `Cut ${selectedEdges.length} connection${selectedEdges.length > 1 ? "s" : ""}`,
        { duration: 2000 },
      );
      setActiveTool("select");
      return;
    }
    setActiveTool(activeTool === "cut" ? "select" : "cut");
  }, [activeTool, edges, setEdges, pushSnapshot, setActiveTool]);

  return (
    <div className="canvas-toolbar">
      <div className="canvas-toolbar__group">
        <button
          className={`canvas-toolbar__btn ${activeTool === "select" ? "canvas-toolbar__btn--active" : ""}`}
          onClick={() => setActiveTool("select")}
          title="Draw Selection"
        >
          <MousePointer2 size={15} />
        </button>
        <button
          className={`canvas-toolbar__btn ${activeTool === "pan" ? "canvas-toolbar__btn--active" : ""}`}
          onClick={() => setActiveTool("pan")}
          title="Pan (Space + Drag)"
        >
          <Hand size={15} />
        </button>
        <button
          className={`canvas-toolbar__btn ${activeTool === "cut" ? "canvas-toolbar__btn--active" : ""}`}
          onClick={handleCut}
          title="Cut Selected Connections"
        >
          <Scissors size={15} />
        </button>
      </div>
    </div>
  );
}

export const CanvasToolbar = memo(CanvasToolbarInner);