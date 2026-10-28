"use client";

import { memo } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { useRightSidebarStore } from "@/store/rightSidebarStore";
import { useTheme } from "@/hooks/useTheme";
import {
  Play,
  Square,
  Sun,
  Moon,
  History,
  Layers,
  Clock,
} from "lucide-react";
// import { WorkflowNamePill } from "./WorkflowNamePill";
import { WorkflowNamePill } from "./WorkflowNamePill";

function ToolbarInner({
  onRun,
  onStop,
}: {
  onRun: () => void;
  onStop: () => void;
}) {
  const isRunning = useWorkflowStore((s) => s.isRunning);
  const nodes = useWorkflowStore((s) => s.nodes);
  const { theme, toggleTheme } = useTheme();
  const rightPanel = useRightSidebarStore((s) => s.panel);
  const toggleRightPanel = useRightSidebarStore((s) => s.toggle);

  const selectedCount = nodes.filter((n) => n.selected).length;

  return (
    <div className="toolbar">
      <div className="toolbar__left">
        <WorkflowNamePill />
      </div>

      <div className="toolbar__right">
        <button
          className={`toolbar__btn toolbar__btn--icon ${rightPanel === "assets" ? "toolbar__btn--active" : ""}`}
          onClick={() => toggleRightPanel("assets")}
          title="Assets"
          aria-label="Toggle assets panel"
        >
          <Layers size={15} />
        </button>

        <button
          className={`toolbar__btn toolbar__btn--icon ${rightPanel === "runHistory" ? "toolbar__btn--active" : ""}`}
          onClick={() => toggleRightPanel("runHistory")}
          title="Run History"
          aria-label="Toggle run history panel"
        >
          <History size={15} />
        </button>

        <button
          className={`toolbar__btn toolbar__btn--icon ${rightPanel === "workflowHistory" ? "toolbar__btn--active" : ""}`}
          onClick={() => toggleRightPanel("workflowHistory")}
          title="Version History"
          aria-label="Toggle version history panel"
        >
          <Clock size={15} />
        </button>

        <button
          className="toolbar__btn toolbar__btn--icon"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {isRunning ? (
          <button
            className="toolbar__btn toolbar__btn--danger"
            onClick={onStop}
          >
            <Square size={13} />
            Stop
          </button>
        ) : (
          <button
            className="toolbar__btn toolbar__btn--primary"
            onClick={onRun}
          >
            <Play size={13} />
            {selectedCount > 0 ? `Run ${selectedCount} Selected` : "Run"}
          </button>
        )}
      </div>
    </div>
  );
}

export const Toolbar = memo(ToolbarInner);