"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import {
  Upload,
  ImagePlus,
  Trash2,
  Copy,
  Pencil,
  Download,
  Maximize2,
  Check,
  AlertCircle,
} from "lucide-react";
import { useUppyUpload } from "@/hooks/useUppyUpload";
import { ImageLightbox } from "@/components/workflow/ImageLightbox";

function UploadImageNodeInner(props: NodeProps) {
  const { id, data } = props;
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const rawPreviewUrl = data.previewUrl as string | undefined;
  // Drop any stale blob:/data:/localhost URL persisted from older runs.
  const previewUrl =
    rawPreviewUrl &&
    !rawPreviewUrl.startsWith("blob:") &&
    !rawPreviewUrl.startsWith("data:") &&
    !/^https?:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(rawPreviewUrl)
      ? rawPreviewUrl
      : undefined;
  const pendingFile = data.pendingFile as File | undefined;
  const fileName = data.fileName as string | undefined;

  // One-shot cleanup of stale blob URLs from prior bug.
  useEffect(() => {
    if (rawPreviewUrl && !previewUrl) {
      updateNodeData(id, { previewUrl: undefined });
    }
  }, [rawPreviewUrl, previewUrl, id, updateNodeData]);

  const { state, error, addFile } = useUppyUpload({
    allowedFileTypes: ["image/*"],
    onSuccess: (url, name) => {
      updateNodeData(id, {
        fileName: name,
        previewUrl: url,
        pendingFile: undefined,
      });
    },
  });

  // If a file was dropped onto the canvas, kick off the upload here.
  useEffect(() => {
    if (pendingFile && state === "idle") {
      addFile(pendingFile);
      updateNodeData(id, { pendingFile: undefined });
    }
  }, [pendingFile, state, addFile, id, updateNodeData]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      e.target.value = "";
      updateNodeData(id, { fileName: file.name, previewUrl: undefined });
      addFile(file);
    },
    [id, updateNodeData, addFile],
  );

  const openPicker = useCallback(() => fileInputRef.current?.click(), []);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      updateNodeData(id, { fileName: undefined, previewUrl: undefined });
    },
    [id, updateNodeData],
  );

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!previewUrl) return;
      navigator.clipboard
        .writeText(previewUrl)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {
          // Clipboard can fail in restricted browser contexts.
        });
    },
    [previewUrl],
  );

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!previewUrl) return;
      const filename = fileName ?? "image";
      void fetch(previewUrl)
        .then((res) => {
          if (!res.ok) throw new Error("fetch failed");
          return res.blob();
        })
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(blobUrl);
        })
        .catch(() => {
          const a = document.createElement("a");
          a.href = previewUrl;
          a.download = filename;
          a.target = "_blank";
          a.rel = "noreferrer";
          a.click();
        });
    },
    [previewUrl, fileName],
  );

  const isUploading = state === "uploading" || !!pendingFile;
  const hasImage = !!previewUrl && !isUploading;

  return (
    <BaseNode
      {...props}
      uploading={isUploading}
      bodyless={hasImage}
  
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {isUploading && (
        <div className="upload-node__uploading">Adding image…</div>
      )}

      {state === "error" && !hasImage && (
        <div className="workflow-node__error-text" style={{ padding: 12 }}>
          <AlertCircle size={14} />
          <span>{error || "Upload failed"}</span>
        </div>
      )}

      {!isUploading && !hasImage && state !== "error" && (
        <div className="upload-node__choices">
          <button
            type="button"
            className="upload-node__choice "
            onClick={openPicker}
          >
            <Upload size={20} />
            <span>Upload</span>
          </button>
          <button
            type="button"
            className="upload-node__choice"
            onClick={openPicker}
          >
            <ImagePlus size={20} />
            <span>Select asset</span>
          </button>
        </div>
      )}

      {hasImage && (
        <div className="upload-node__media-wrap">
          <img
            src={previewUrl!}
            alt={fileName ?? "uploaded"}
            className="upload-node__media-img"
          />
          <div className="upload-node__hover-toolbar">
            <button
              className="wf-icon-btn"
              onClick={handleDelete}
              title="Delete image"
            >
              <Trash2 size={14} />
            </button>
            <button
              className="wf-icon-btn"
              onClick={handleCopy}
              title="Copy URL"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button
              className="wf-icon-btn"
              onClick={openPicker}
              title="Replace"
            >
              <Pencil size={14} />
            </button>
            <button
              className="wf-icon-btn"
              onClick={handleDownload}
              title="Download"
            >
              <Download size={14} />
            </button>
            <button
              className="wf-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
              }}
              title="Expand"
            >
              <Maximize2 size={14} />
            </button>
          </div>
          {lightboxOpen && (
            <ImageLightbox
              src={previewUrl!}
              alt={fileName ?? "preview"}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </div>
      )}
    </BaseNode>
  );
}

export const UploadImageNode = memo(UploadImageNodeInner);