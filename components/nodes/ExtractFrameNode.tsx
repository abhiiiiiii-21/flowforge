"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { type NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { useNodeConnections } from "@/hooks/useNodeConnections";
import { RotateCcw, Maximize2, Pencil, X } from "lucide-react";
import { ImageLightbox } from "@/components/workflow/ImageLightbox";

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

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

type TimestampMode = "seconds" | "percent";

function readFiniteNumber(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function getInitialTimestampMode(data: Record<string, unknown>): TimestampMode {
  if (data.timestampMode === "percent") return "percent";
  if (typeof data.timestamp === "string" && data.timestamp.trim().endsWith("%")) {
    return "percent";
  }
  return "seconds";
}

function getInitialFramePercent(data: Record<string, unknown>): number {
  const explicit = readFiniteNumber(data.framePercent);
  if (explicit !== null) return clampPercent(explicit);

  if (typeof data.timestamp === "string" && data.timestamp.trim().endsWith("%")) {
    const percent = readFiniteNumber(data.timestamp.trim().slice(0, -1));
    if (percent !== null) return clampPercent(percent);
  }

  return 0;
}

function ExtractFrameNodeInner(props: NodeProps) {
  const { id, data } = props;
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const setNodeOutput = useWorkflowStore((s) => s.setNodeOutput);
  const setNodeExecutionState = useWorkflowStore(
    (s) => s.setNodeExecutionState,
  );
  const { getUpstreamValue } = useNodeConnections(id);

  const upstream = getUpstreamValue("video-in");
  const sourceUrl = extractUrl(upstream);
  const resultUrl = extractUrl(nodeOutputs[id]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const [duration, setDuration] = useState<number>(0);
  const [timestampMode, setTimestampMode] = useState<TimestampMode>(
    getInitialTimestampMode(data),
  );
  const [timestamp, setTimestamp] = useState<number>(
    readFiniteNumber(data.timestamp) ?? 0,
  );
  const [framePercent, setFramePercent] = useState<number>(
    getInitialFramePercent(data),
  );
  const [thumbs, setThumbs] = useState<string[]>([]);

  // Persist timestamp to node data for the FFmpeg task.
  useEffect(() => {
    updateNodeData(id, { timestamp, timestampMode, framePercent });
  }, [framePercent, id, timestamp, timestampMode, updateNodeData]);

  // Generate ~6 filmstrip thumbs using a hidden offscreen canvas.
  const generateThumbs = useCallback(async (v: HTMLVideoElement) => {
    if (!v.duration || !isFinite(v.duration)) return;
    const COUNT = 6;
    const canvas = document.createElement("canvas");
    const W = 80;
    const H = 56;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const out: string[] = [];
    const orig = v.currentTime;
    for (let i = 0; i < COUNT; i++) {
      const t = (v.duration * (i + 0.5)) / COUNT;
      await new Promise<void>((resolve) => {
        const handler = () => {
          v.removeEventListener("seeked", handler);
          ctx.drawImage(v, 0, 0, W, H);
          try {
            out.push(canvas.toDataURL("image/jpeg", 0.6));
          } catch {
            // CORS: skip thumb if tainted
          }
          resolve();
        };
        v.addEventListener("seeked", handler);
        v.currentTime = t;
      });
    }
    v.currentTime = orig;
    setThumbs(out);
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const nextDuration = v.duration;
    setDuration(nextDuration);

    const nextTimestamp =
      timestampMode === "percent"
        ? (nextDuration * framePercent) / 100
        : timestamp > nextDuration
          ? 0
          : timestamp;

    setTimestamp(nextTimestamp);
    setFramePercent(nextDuration ? clampPercent((nextTimestamp / nextDuration) * 100) : framePercent);
    v.currentTime = Math.min(nextTimestamp, nextDuration);
    void generateThumbs(v);
  }, [framePercent, generateThumbs, timestamp, timestampMode]);

  const updateFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      const v = videoRef.current;
      if (!track || !v || !duration) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      const t = ratio * duration;
      setTimestampMode("seconds");
      setTimestamp(t);
      setFramePercent(clampPercent(ratio * 100));
      v.currentTime = t;
    },
    [duration],
  );

  const onTrackPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.stopPropagation();
      draggingRef.current = true;
      updateFromPointer(e.clientX);

      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        updateFromPointer(ev.clientX);
      };
      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [updateFromPointer],
  );

  const handleReset = useCallback(() => {
    setTimestampMode("seconds");
    setTimestamp(0);
    setFramePercent(0);
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, []);

  const playheadPct = duration ? (timestamp / duration) * 100 : 0;

  const handlePercentChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = clampPercent(Number.parseFloat(event.target.value) || 0);
      const nextTimestamp = duration ? (duration * next) / 100 : timestamp;

      setTimestampMode("percent");
      setFramePercent(next);
      setTimestamp(nextTimestamp);
      if (videoRef.current && duration) {
        videoRef.current.currentTime = nextTimestamp;
      }
    },
    [duration, timestamp],
  );

  const renderPercentControl = () => (
    <label className="frame-node__percent" title="Extract by percent">
      <span>%</span>
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={Number(framePercent.toFixed(1))}
        onChange={handlePercentChange}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
    </label>
  );

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
        <span
          style={{
            color: "var(--text-muted)",
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          Extracted frame
        </span>
      </div>
      <div className="node-result__media-wrap">
        <img
          src={resultUrl}
          alt="Extracted frame"
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
            title="Edit frame selection"
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
          alt="Extracted frame"
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
                <span>Edit frame selection</span>
                <button
                  type="button"
                  className="wf-icon-btn"
                  onClick={closeEditorModal}
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="frame-node__display frame-node__display--modal">
                {!sourceUrl ? (
                  <div
                    className="frame-node__display frame-node__display-empty"
                    style={{ position: "absolute", inset: 0 }}
                  >
                    Connect a video source
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    src={sourceUrl}
                    className="frame-node__video"
                    muted
                    playsInline
                    preload="metadata"
                    crossOrigin="anonymous"
                    onLoadedMetadata={onLoadedMetadata}
                  />
                )}
              </div>
              {sourceUrl && (
                <>
                  <div
                    className="frame-node__scrubber"
                    ref={trackRef}
                    onPointerDown={onTrackPointerDown}
                  >
                    <div className="frame-node__filmstrip">
                      {(thumbs.length ? thumbs : Array.from({ length: 6 })).map(
                        (t, i) => (
                          <div
                            key={i}
                            className="frame-node__filmstrip-cell"
                            style={
                              typeof t === "string"
                                ? { backgroundImage: `url(${t})` }
                                : { background: "var(--bg-button)" }
                            }
                          />
                        ),
                      )}
                    </div>
                    <div
                      className="frame-node__playhead"
                      style={{ left: `${playheadPct}%` }}
                    >
                      <div className="frame-node__playhead-handle" />
                    </div>
                    <div className="frame-node__time">
                      {formatTime(timestamp)}
                    </div>
                  </div>
                  <div className="frame-node__controls">
                    {renderPercentControl()}
                    <button
                      type="button"
                      className="wf-icon-btn"
                      onClick={handleReset}
                      title="Reset to 0:00"
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
                </>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <BaseNode {...props} bodyless topSection={topSection}>
      {showInlineEditor && sourceUrl && (
        <div
          className="workflow-node__divider-label"
          style={{
            borderTop: topSection ? "1px solid var(--border-subtle)" : "none",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--node-accent)",
            }}
          />
          Input
        </div>
      )}

      {showInlineEditor && (
        <>
          <div className="frame-node__display">
            {!sourceUrl ? (
              <div
                className="frame-node__display frame-node__display-empty"
                style={{ position: "absolute", inset: 0 }}
              >
                Connect a video source
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={sourceUrl}
                  className="frame-node__video"
                  muted
                  playsInline
                  preload="metadata"
                  crossOrigin="anonymous"
                  onLoadedMetadata={onLoadedMetadata}
                />
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
              </>
            )}
          </div>

          {sourceUrl && (
              <div
                className="frame-node__scrubber"
                ref={trackRef}
                onPointerDown={onTrackPointerDown}
              >
                <div className="frame-node__filmstrip">
                  {(thumbs.length ? thumbs : Array.from({ length: 6 })).map(
                    (t, i) => (
                      <div
                        key={i}
                        className="frame-node__filmstrip-cell"
                        style={
                          typeof t === "string"
                            ? { backgroundImage: `url(${t})` }
                            : { background: "var(--bg-button)" }
                        }
                      />
                    ),
                  )}
                </div>
                <div
                  className="frame-node__playhead"
                  style={{ left: `${playheadPct}%` }}
                >
                  <div className="frame-node__playhead-handle" />
                </div>
                <div className="frame-node__time">{formatTime(timestamp)}</div>
              </div>
          )}

          {/* Timestamp control — always visible */}
          <div className="crop-node__params">
            <label className="crop-node__param">
              <span className="crop-node__param-label">Timestamp (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={Number(framePercent.toFixed(1))}
                onChange={(e) => {
                  const val = clampPercent(parseFloat(e.target.value) || 0);
                  const nextTimestamp = duration ? (duration * val) / 100 : timestamp;
                  setTimestampMode("percent");
                  setFramePercent(val);
                  setTimestamp(nextTimestamp);
                  if (videoRef.current && duration) {
                    videoRef.current.currentTime = nextTimestamp;
                  }
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

export const ExtractFrameNode = memo(ExtractFrameNodeInner);
