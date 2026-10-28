"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { ChevronUp, Download, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { useWorkflowStore } from "@/store/workflowStore";

/**
 * Workflow name pill with toggle around the icon and a small dropdown
 * containing Import / Export. The chevron flips when the menu is open
 * (krea-style — toggle is "around the icon", not next to the name).
 */
function WorkflowNamePillInner() {
  const currentWorkflowId = useWorkflowStore((s) => s.currentWorkflowId);
  const workflowName = useWorkflowStore((s) => s.currentWorkflowName);
  const setWorkflowName = useWorkflowStore((s) => s.setCurrentWorkflowName);
  const nodes = useWorkflowStore((s) => s.nodes);
  const serializeGraph = useWorkflowStore((s) => s.serializeGraph);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const setEdges = useWorkflowStore((s) => s.setEdges);

  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(workflowName);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNameDraft(workflowName);
  }, [workflowName]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const scheduleNameSave = useCallback(
    (next: string) => {
      setWorkflowName(next);
      if (!currentWorkflowId) return;
      if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
      nameTimerRef.current = setTimeout(async () => {
        try {
          await fetch(`/api/workflows/${currentWorkflowId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: next }),
          });
        } catch {
          // Best-effort
        }
      }, 800);
    },
    [currentWorkflowId, setWorkflowName],
  );

  const handleExport = useCallback(() => {
    if (nodes.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const graph = serializeGraph();
    const data = {
      name: workflowName || "FlowForge Export",
      graph,
      exportedAt: new Date().toISOString(),
      version: "1.0",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowforge-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Workflow exported");
    setOpen(false);
  }, [nodes, serializeGraph, workflowName]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
    setOpen(false);
  }, []);

  const onFileImport = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const toastId = toast.loading("Importing...");
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (!data.graph?.nodes || !data.graph?.edges) {
            throw new Error("Invalid format");
          }
          const importedNodes = data.graph.nodes.map(
            (
              n: {
                id: string;
                type: string;
                data: Record<string, unknown>;
                position?: { x: number; y: number };
              },
              i: number,
            ) => ({
              id: n.id,
              type: n.type,
              data: n.data,
              position: n.position ?? {
                x: 200 + (i % 3) * 250,
                y: 100 + Math.floor(i / 3) * 200,
              },
            }),
          );
          setNodes(importedNodes);
          setEdges(
            data.graph.edges.map(
              (edge: {
                source: string;
                target: string;
                sourceHandle?: string;
                targetHandle?: string;
              }) => ({
                id: `edge_${edge.source}_${edge.target}_${Date.now()}`,
                source: edge.source,
                target: edge.target,
                sourceHandle: edge.sourceHandle,
                targetHandle: edge.targetHandle,
                type: "custom",
              }),
            ),
          );
          toast.success(`Imported: ${data.name ?? "workflow"}`, { id: toastId });
        } catch {
          toast.error("Invalid workflow file", { id: toastId });
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [setNodes, setEdges],
  );

  return (
    <div className="name-pill-wrap" ref={wrapperRef}>
      <div className={`name-pill ${open ? "name-pill--open" : ""}`}>
        <button
          type="button"
          className="name-pill__icon-btn"
          onClick={() => setOpen((v) => !v)}
          aria-label="Workflow menu"
        >
          <span className="name-pill__icon">N</span>
          <ChevronUp size={11} className="name-pill__chevron" />
        </button>
        <input
          className="name-pill__input"
          value={nameDraft}
          onChange={(e) => {
            setNameDraft(e.target.value);
            scheduleNameSave(e.target.value);
          }}
          placeholder="Untitled"
        />
      </div>

      {open && (
        <div className="name-pill__menu">
          <button
            type="button"
            className="name-pill__menu-item"
            onClick={handleImport}
          >
            <Upload size={14} /> Import
          </button>
          <button
            type="button"
            className="name-pill__menu-item"
            onClick={handleExport}
          >
            <Download size={14} /> Export
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={onFileImport}
      />
    </div>
  );
}

export const WorkflowNamePill = memo(WorkflowNamePillInner);