"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { type NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { useNodeConnections } from "@/hooks/useNodeConnections";
import { RotateCcw, Maximize2, Pencil, X } from "lucide-react";
import { ImageLightbox } from "@/components/workflow/ImageLightbox";

type AspectRatio = "free" | "1:1" | "4:3" | "16:9";

const RATIO_VALUES: Record<AspectRatio, number | null> = {
  free: null,
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
};

function extractUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.previewUrl === "string") return obj.previewUrl;
    if (typeof obj.fileUrl === "string") return obj.fileUrl;
    if (typeof obj.url === "string") return obj.url;
    if (typeof obj.output === "string") return obj.output;
  }
  return null;
}

type Box = { x: number; y: number; w: number; h: number };

interface DragState {
  mode: "move" | "resize";
  handle?: string;
  startBox: Box;
  startX: number;
  startY: number;
}

function CropImageNodeInner(props: NodeProps) {
  const { id, data } = props;
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const setNodeOutput = useWorkflowStore((s) => s.setNodeOutput);
  const setNodeExecutionState = useWorkflowStore((s) => s.setNodeExecutionState);
  const { getUpstreamValue } = useNodeConnections(id);

  const upstream = getUpstreamValue("image-in");
  const sourceUrl = extractUrl(upstream);
  const resultUrl = extractUrl(nodeOutputs[id]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [box, setBox] = useState<Box>({
    x: (data.xPercent as number) ?? 10,
    y: (data.yPercent as number) ?? 10,
    w: (data.widthPercent as number) ?? 80,
    h: (data.heightPercent as number) ?? 80,
  });
  const [aspect, setAspect] = useState<AspectRatio>(
    (data.aspectRatio as AspectRatio) ?? "free",
  );
  const [active, setActive] = useState(false);

  // Persist crop percentages to node data so the FFmpeg task receives them.
  useEffect(() => {
    updateNodeData(id, {
      xPercent: box.x,
      yPercent: box.y,
      widthPercent: box.w,
      heightPercent: box.h,
      aspectRatio: aspect,
    });
  }, [id, box.x, box.y, box.w, box.h, aspect, updateNodeData]);

  const clampBox = useCallback(
    (b: Box, ratio: number | null): Box => {
      let { x, y, w, h } = b;
      w = Math.max(5, Math.min(100, w));
      h = Math.max(5, Math.min(100, h));
      if (ratio) {
        // Maintain ratio against container's display area aspect, treated as 1.
        // We constrain h based on w using the ratio (purely percentage-based).
        h = w / ratio;
        if (h > 100) {
          h = 100;
          w = h * ratio;
        }
      }
      x = Math.max(0, Math.min(100 - w, x));
      y = Math.max(0, Math.min(100 - h, y));
      return { x, y, w, h };
    },
    [],
  );

  const startDrag = useCallback(
    (
      e: ReactPointerEvent,
      mode: "move" | "resize",
      handle?: string,
    ) => {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = {
        mode,
        handle,
        startBox: box,
        startX: e.clientX,
        startY: e.clientY,
      };
      setActive(true);

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        const container = containerRef.current;
        if (!drag || !container) return;
        const rect = container.getBoundingClientRect();
        const dxPct = ((ev.clientX - drag.startX) / rect.width) * 100;
        const dyPct = ((ev.clientY - drag.startY) / rect.height) * 100;
        const ratio = RATIO_VALUES[aspect];

        const next: Box = { ...drag.startBox };

        if (drag.mode === "move") {
          next.x = drag.startBox.x + dxPct;
          next.y = drag.startBox.y + dyPct;
        } else {
          const h = drag.handle ?? "";
          if (h.includes("e")) next.w = drag.startBox.w + dxPct;
          if (h.includes("w")) {
            next.w = drag.startBox.w - dxPct;
            next.x = drag.startBox.x + dxPct;
          }
          if (h.includes("s")) next.h = drag.startBox.h + dyPct;
          if (h.includes("n")) {
            next.h = drag.startBox.h - dyPct;
            next.y = drag.startBox.y + dyPct;
          }
        }

        setBox(clampBox(next, ratio));
      };

      const onUp = () => {
        dragRef.current = null;
        setActive(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [aspect, box, clampBox],
  );

  const handleAspectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value as AspectRatio;
      setAspect(next);
      setBox((b) => clampBox(b, RATIO_VALUES[next]));
    },
    [clampBox],
  );

  const handleReset = useCallback(() => {
    setBox({ x: 0, y: 0, w: 100, h: 100 });
    setAspect("free");
  }, []);

  const editorImageUrl = resultUrl ?? sourceUrl;
  const showInlineEditor = !resultUrl && !isEditorModalOpen;
  const closeEditorModal = useCallback(() => {
    setIsEditorModalOpen(false);
    if (resultUrl) {
      // Existing output is now stale after edits; force inline editor preview until re-run.
      setNodeOutput(id, undefined);
      setNodeExecutionState(id, "idle");
    }
  }, [id, resultUrl, setNodeExecutionState, setNodeOutput]);

  const topSection = resultUrl ? (
    <div className="node-result">
      <div className="node-result__header">
        <span className="node-result__header-label">
          <span className="node-result__header-dot" />
          Output
        </span>
        <span style={{ color: "var(--text-muted)", textTransform: "none", letterSpacing: 0 }}>
          Cropped image
        </span>
      </div>
      <div className="node-result__media-wrap">
        <img
          src={resultUrl}
          alt="Cropped result"
          className="node-result__img"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxOpen(true);
          }}
        />
        <div className="node-result__hover-toolbar">
          <button
            type="button"
            className="wf-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditorModalOpen(true);
            }}
            title="Edit crop"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="wf-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(true);
            }}
            title="Preview"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      {lightboxOpen && (
        <ImageLightbox
          src={resultUrl}
          alt="Cropped"
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  ) : null;

  const editorModal =
    isEditorModalOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="node-editor-modal"
            onClick={(e) => {
              e.stopPropagation();
              closeEditorModal();
            }}
          >
            <div
              className="node-editor-modal__panel"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="node-editor-modal__header">
                <span>Edit crop</span>
                <button
                  type="button"
                  className="wf-icon-btn"
                  onClick={closeEditorModal}
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="crop-node__display crop-node__display--modal" ref={containerRef}>
                {!editorImageUrl ? (
                  <div
                    className="crop-node__display crop-node__display-empty"
                    style={{ position: "absolute", inset: 0 }}
                  >
                    Connect an image source
                  </div>
                ) : (
                  <>
                    <img src={editorImageUrl} alt="To crop" className="crop-node__img" />
                    <div className="crop-node__overlay">
                      <svg className="crop-node__svg">
                        <defs>
                          <mask id={`crop-mask-modal-${id}`}>
                            <rect width="100%" height="100%" fill="white" />
                            <rect
                              x={`${box.x}%`}
                              y={`${box.y}%`}
                              width={`${box.w}%`}
                              height={`${box.h}%`}
                              fill="black"
                            />
                          </mask>
                        </defs>
                        <rect
                          width="100%"
                          height="100%"
                          fill="rgba(0,0,0,0.55)"
                          mask={`url(#crop-mask-modal-${id})`}
                        />
                      </svg>
                      <div
                        className={`crop-node__box ${active ? "dragging" : ""}`}
                        style={{
                          left: `${box.x}%`,
                          top: `${box.y}%`,
                          width: `${box.w}%`,
                          height: `${box.h}%`,
                        }}
                        onPointerDown={(e) => startDrag(e, "move")}
                      >
                        {active && (
                          <div className="crop-node__grid">
                            <div className="crop-node__grid-line" style={{ left: "33.33%", top: 0, bottom: 0, width: 1 }} />
                            <div className="crop-node__grid-line" style={{ left: "66.66%", top: 0, bottom: 0, width: 1 }} />
                            <div className="crop-node__grid-line" style={{ top: "33.33%", left: 0, right: 0, height: 1 }} />
                            <div className="crop-node__grid-line" style={{ top: "66.66%", left: 0, right: 0, height: 1 }} />
                          </div>
                        )}

                        <div
                          className="crop-node__handle crop-node__handle--corner"
                          style={{ left: -4, top: -4, cursor: "nwse-resize" }}
                          onPointerDown={(e) => startDrag(e, "resize", "nw")}
                        />
                        <div
                          className="crop-node__handle crop-node__handle--corner"
                          style={{ right: -4, top: -4, cursor: "nesw-resize" }}
                          onPointerDown={(e) => startDrag(e, "resize", "ne")}
                        />
                        <div
                          className="crop-node__handle crop-node__handle--corner"
                          style={{ left: -4, bottom: -4, cursor: "nesw-resize" }}
                          onPointerDown={(e) => startDrag(e, "resize", "sw")}
                        />
                        <div
                          className="crop-node__handle crop-node__handle--corner"
                          style={{ right: -4, bottom: -4, cursor: "nwse-resize" }}
                          onPointerDown={(e) => startDrag(e, "resize", "se")}
                        />

                        <div
                          className="crop-node__handle crop-node__handle--edge-h"
                          style={{ left: "50%", top: -2, transform: "translateX(-50%)", cursor: "ns-resize" }}
                          onPointerDown={(e) => startDrag(e, "resize", "n")}
                        />
                        <div
                          className="crop-node__handle crop-node__handle--edge-h"
                          style={{ left: "50%", bottom: -2, transform: "translateX(-50%)", cursor: "ns-resize" }}
                          onPointerDown={(e) => startDrag(e, "resize", "s")}
                        />
                        <div
                          className="crop-node__handle crop-node__handle--edge-v"
                          style={{ top: "50%", left: -2, transform: "translateY(-50%)", cursor: "ew-resize" }}
                          onPointerDown={(e) => startDrag(e, "resize", "w")}
                        />
                        <div
                          className="crop-node__handle crop-node__handle--edge-v"
                          style={{ top: "50%", right: -2, transform: "translateY(-50%)", cursor: "ew-resize" }}
                          onPointerDown={(e) => startDrag(e, "resize", "e")}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="crop-node__controls">
                <select
                  className="workflow-node__select"
                  style={{ flex: 1 }}
                  value={aspect}
                  onChange={handleAspectChange}
                >
                  <option value="free">Free</option>
                  <option value="1:1">1:1</option>
                  <option value="4:3">4:3</option>
                  <option value="16:9">16:9</option>
                </select>
                <button
                  type="button"
                  className="wf-icon-btn"
                  onClick={handleReset}
                  title="Reset crop"
                >
                  <RotateCcw size={14} />
                </button>
              <button
                type="button"
                className="node-editor-modal__done"
                onClick={closeEditorModal}
              >
                Done
              </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <BaseNode {...props} bodyless topSection={topSection}>
      {showInlineEditor && editorImageUrl && (
        <div className="workflow-node__divider-label" style={{ borderTop: topSection ? '1px solid var(--border-subtle)' : 'none' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--node-accent)' }} />
          Input
        </div>
      )}

      {showInlineEditor && (
        <>
      <div className="crop-node__display" ref={containerRef}>
        {!editorImageUrl ? (
          <div
            className="crop-node__display crop-node__display-empty"
            style={{ position: "absolute", inset: 0 }}
          >
            Connect an image source
          </div>
        ) : (
          <>
            <img src={editorImageUrl} alt="To crop" className="crop-node__img" />
            <button
              type="button"
              className="wf-icon-btn node-editor-launch-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditorModalOpen(true);
              }}
              title="Open larger editor"
            >
              <Maximize2 size={14} />
            </button>
            <div className="crop-node__overlay">
              <svg className="crop-node__svg">
                <defs>
                  <mask id={`crop-mask-${id}`}>
                    <rect width="100%" height="100%" fill="white" />
                    <rect
                      x={`${box.x}%`}
                      y={`${box.y}%`}
                      width={`${box.w}%`}
                      height={`${box.h}%`}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill="rgba(0,0,0,0.55)"
                  mask={`url(#crop-mask-${id})`}
                />
              </svg>
              <div
                className={`crop-node__box ${active ? "dragging" : ""}`}
                style={{
                  left: `${box.x}%`,
                  top: `${box.y}%`,
                  width: `${box.w}%`,
                  height: `${box.h}%`,
                }}
                onPointerDown={(e) => startDrag(e, "move")}
              >
                {active && (
                  <div className="crop-node__grid">
                    <div className="crop-node__grid-line" style={{ left: "33.33%", top: 0, bottom: 0, width: 1 }} />
                    <div className="crop-node__grid-line" style={{ left: "66.66%", top: 0, bottom: 0, width: 1 }} />
                    <div className="crop-node__grid-line" style={{ top: "33.33%", left: 0, right: 0, height: 1 }} />
                    <div className="crop-node__grid-line" style={{ top: "66.66%", left: 0, right: 0, height: 1 }} />
                  </div>
                )}

                {/* Corner handles */}
                <div
                  className="crop-node__handle crop-node__handle--corner"
                  style={{ left: -4, top: -4, cursor: "nwse-resize" }}
                  onPointerDown={(e) => startDrag(e, "resize", "nw")}
                />
                <div
                  className="crop-node__handle crop-node__handle--corner"
                  style={{ right: -4, top: -4, cursor: "nesw-resize" }}
                  onPointerDown={(e) => startDrag(e, "resize", "ne")}
                />
                <div
                  className="crop-node__handle crop-node__handle--corner"
                  style={{ left: -4, bottom: -4, cursor: "nesw-resize" }}
                  onPointerDown={(e) => startDrag(e, "resize", "sw")}
                />
                <div
                  className="crop-node__handle crop-node__handle--corner"
                  style={{ right: -4, bottom: -4, cursor: "nwse-resize" }}
                  onPointerDown={(e) => startDrag(e, "resize", "se")}
                />

                {/* Edge handles */}
                <div
                  className="crop-node__handle crop-node__handle--edge-h"
                  style={{ left: "50%", top: -2, transform: "translateX(-50%)", cursor: "ns-resize" }}
                  onPointerDown={(e) => startDrag(e, "resize", "n")}
                />
                <div
                  className="crop-node__handle crop-node__handle--edge-h"
                  style={{ left: "50%", bottom: -2, transform: "translateX(-50%)", cursor: "ns-resize" }}
                  onPointerDown={(e) => startDrag(e, "resize", "s")}
                />
                <div
                  className="crop-node__handle crop-node__handle--edge-v"
                  style={{ top: "50%", left: -2, transform: "translateY(-50%)", cursor: "ew-resize" }}
                  onPointerDown={(e) => startDrag(e, "resize", "w")}
                />
                <div
                  className="crop-node__handle crop-node__handle--edge-v"
                  style={{ top: "50%", right: -2, transform: "translateY(-50%)", cursor: "ew-resize" }}
                  onPointerDown={(e) => startDrag(e, "resize", "e")}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Crop percentage fields */}
      <div className="crop-node__params">
        <label className="crop-node__param">
          <span className="crop-node__param-label">X (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={Number(box.x.toFixed(1))}
            onChange={(e) => {
              const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
              setBox((b) => clampBox({ ...b, x: val }, null));
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        </label>
        <label className="crop-node__param">
          <span className="crop-node__param-label">Y (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={Number(box.y.toFixed(1))}
            onChange={(e) => {
              const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
              setBox((b) => clampBox({ ...b, y: val }, null));
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        </label>
        <label className="crop-node__param">
          <span className="crop-node__param-label">Width (%)</span>
          <input
            type="number"
            min={5}
            max={100}
            step={0.1}
            value={Number(box.w.toFixed(1))}
            onChange={(e) => {
              const val = Math.max(5, Math.min(100, parseFloat(e.target.value) || 5));
              setBox((b) => clampBox({ ...b, w: val }, null));
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        </label>
        <label className="crop-node__param">
          <span className="crop-node__param-label">Height (%)</span>
          <input
            type="number"
            min={5}
            max={100}
            step={0.1}
            value={Number(box.h.toFixed(1))}
            onChange={(e) => {
              const val = Math.max(5, Math.min(100, parseFloat(e.target.value) || 5));
              setBox((b) => clampBox({ ...b, h: val }, null));
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        </label>
      </div>
        </>
      )}

      {editorModal}
    </BaseNode>
  );
}

export const CropImageNode = memo(CropImageNodeInner);