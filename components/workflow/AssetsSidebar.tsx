"use client";

import { memo } from "react";
import { X, Layers } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";

/**
 * Right-side panel listing media assets produced or referenced by nodes
 * in the current workflow. Pulls from node outputs and upload nodes' data.
 */
function AssetsSidebarInner({ onClose }: { onClose: () => void }) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);

  const assets: Array<{ id: string; url: string; label: string }> = [];

  for (const n of nodes) {
    const data = n.data as Record<string, unknown>;
    if (typeof data?.fileUrl === "string") {
      assets.push({
        id: `${n.id}-input`,
        url: data.fileUrl,
        label: typeof data.fileName === "string" ? data.fileName : n.type ?? "asset",
      });
    }
    const out = nodeOutputs[n.id];
    if (out && typeof out === "object" && "url" in out && typeof (out as { url: unknown }).url === "string") {
      assets.push({
        id: `${n.id}-output`,
        url: (out as { url: string }).url,
        label: `${n.type ?? "node"} output`,
      });
    }
  }

  return (
    <aside className="side-panel">
      <div className="side-panel__header">
        <div className="side-panel__title">Assets</div>
        <button
          type="button"
          className="side-panel__close"
          onClick={onClose}
          aria-label="Close assets panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="side-panel__body">
        {assets.length === 0 ? (
          <div className="side-panel__empty">
            <Layers size={24} style={{ opacity: 0.3 }} />
            <span>No assets yet</span>
            <span className="side-panel__empty-hint">
              Upload media or run the workflow to populate assets
            </span>
          </div>
        ) : (
          <div className="assets-grid">
            {assets.map((a) => (
              <div key={a.id} className="asset-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.label} className="asset-card__thumb" />
                <div className="asset-card__label">{a.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export const AssetsSidebar = memo(AssetsSidebarInner);