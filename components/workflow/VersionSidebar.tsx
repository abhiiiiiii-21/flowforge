"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";

type VersionMeta = {
  id: string;
  version: number;
  isPublished: boolean;
  createdAt: string;
};

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - d);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

function VersionSidebarInner({ onClose }: { onClose: () => void }) {
  const currentWorkflowId = useWorkflowStore((s) => s.currentWorkflowId);
  const currentWorkflowVersionId = useWorkflowStore((s) => s.currentWorkflowVersionId);
  const setCurrentWorkflowVersionId = useWorkflowStore((s) => s.setCurrentWorkflowVersionId);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const setNodeOutput = useWorkflowStore((s) => s.setNodeOutput);
  const setNodeExecutionState = useWorkflowStore((s) => s.setNodeExecutionState);

  const [versions, setVersions] = useState<VersionMeta[]>([]);

  useEffect(() => {
    if (!currentWorkflowId) {
      return;
    }
    const controller = new AbortController();
    (async () => {
      const res = await fetch(`/api/workflows/${currentWorkflowId}/versions`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      const next = (data.versions ?? []) as VersionMeta[];
      queueMicrotask(() => setVersions(next));
    })().catch(() => {});
    return () => controller.abort();
  }, [currentWorkflowId]);

  const selectVersion = useCallback(
    async (versionId: string) => {
      setCurrentWorkflowVersionId(versionId);
      const res = await fetch(`/api/workflow-versions/${versionId}`);
      if (!res.ok) return;
      const data = await res.json();
      const graph = data?.version?.graph as
        | {
            nodes: Array<{
              id: string;
              type: string;
              data: Record<string, unknown>;
              position?: { x: number; y: number };
            }>;
            edges: Array<{
              source: string;
              target: string;
              sourceHandle?: string;
              targetHandle?: string;
            }>;
          }
        | undefined;
      if (!graph) return;

      const loadedNodes = (graph.nodes ?? []).map((n, i: number) => ({
        id: n.id,
        type: n.type,
        data: n.data,
        position:
          n.position ?? {
            x: 200 + (i % 3) * 250,
            y: 100 + Math.floor(i / 3) * 200,
          },
      }));
      setNodes(loadedNodes);
      setEdges(
        (graph.edges ?? []).map((e) => ({
          id: `edge_${e.source}_${e.target}`,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          type: "custom",
        })),
      );

      // Reset in-canvas execution state for the selected version load.
      for (const n of loadedNodes) {
        setNodeOutput(n.id, undefined);
        setNodeExecutionState(n.id, "idle");
      }
    },
    [setCurrentWorkflowVersionId, setEdges, setNodeExecutionState, setNodeOutput, setNodes],
  );

  // Default selection: latest published OR latest.
  useEffect(() => {
    if (!currentWorkflowId) return;
    if (currentWorkflowVersionId) return;
    if (versions.length === 0) return;
    const published = versions.find((v) => v.isPublished);
    const pick = published ?? versions[0];
    void selectVersion(pick.id);
  }, [currentWorkflowId, currentWorkflowVersionId, selectVersion, versions]);

  return (
    <aside className="side-panel version-sidebar">
      <div className="side-panel__header">
        <div className="side-panel__title">Version History</div>
        <button
          type="button"
          className="side-panel__close"
          onClick={onClose}
          aria-label="Close version history"
        >
          <X size={14} />
        </button>
      </div>

      <div className="version-sidebar__list">
        {versions.map((v) => {
          const selected = v.id === currentWorkflowVersionId;
          return (
            <button
              key={v.id}
              type="button"
              className={`version-card ${selected ? "version-card--selected" : ""}`}
              onClick={() => selectVersion(v.id)}
            >
              <div className="version-card__header">
                <span className="version-card__time">{formatRelative(v.createdAt)}</span>
                {selected && <span className="version-card__badge">CURRENT</span>}
              </div>
              <div className="version-card__thumb" />
              <div className="version-card__meta">
                v{v.version}
                {v.isPublished ? " • published" : ""}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export const VersionSidebar = memo(VersionSidebarInner);