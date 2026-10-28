"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import {
  Upload,
  FilmIcon,
  Trash2,
  Download,
  Maximize2,
  AlertCircle,
} from "lucide-react";
import { useUppyUpload } from "@/hooks/useUppyUpload";
import { ImageLightbox } from "@/components/workflow/ImageLightbox";

function UploadVideoNodeInner(props: NodeProps) {
  const { id, data } = props;
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const rawPreviewUrl = data.previewUrl as string | undefined;
  const previewUrl =
    rawPreviewUrl &&
    !rawPreviewUrl.startsWith("blob:") &&
    !rawPreviewUrl.startsWith("data:") &&
    !/^https?:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(rawPreviewUrl)
      ? rawPreviewUrl
      : undefined;
  const pendingFile = data.pendingFile as File | undefined;
  const fileName = data.fileName as string | undefined;

  useEffect(() => {
    if (rawPreviewUrl && !previewUrl) {
      updateNodeData(id, { previewUrl: undefined });
    }
  }, [rawPreviewUrl, previewUrl, id, updateNodeData]);

  const { state, error, addFile } = useUppyUpload({
    allowedFileTypes: ["video/*"],
    onSuccess: (url, name) => {
      updateNodeData(id, {
        fileName: name,
        previewUrl: url,
        pendingFile: undefined,
      });
    },
  });

  useEffect(() => {
    if (pendingFile && state === "idle") {
      addFile(pendingFile);
      updateNodeData(id, { pendingFile: undefined });
    }
  }, [pendingFile, state, addFile, id, updateNodeData]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("video/")) return;
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

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!previewUrl) return;
      const filename = fileName ?? "video";
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

  const handleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewOpen(true);
  }, []);

  const isUploading = state === "uploading" || !!pendingFile;
  const hasVideo = !!previewUrl && !isUploading;

  return (
    <BaseNode
      {...props}
      uploading={isUploading}
      bodyless={hasVideo}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {isUploading && (
        <div className="upload-node__uploading">Adding video…</div>
      )}

      {state === "error" && !hasVideo && (
        <div className="workflow-node__error-text" style={{ padding: 12 }}>
          <AlertCircle size={14} />
          <span>{error || "Upload failed"}</span>
        </div>
      )}

      {!isUploading && !hasVideo && state !== "error" && (
        <div className="upload-node__choices">
          <button
            type="button"
            className="upload-node__choice"
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
            <FilmIcon size={20} />
            <span>Select asset</span>
          </button>
        </div>
      )}

      {hasVideo && (
        <div className="upload-node__media-wrap">
          <video
            src={previewUrl!}
            className="upload-node__media-video"
            controls
            playsInline
          />
          <div className="upload-node__hover-toolbar">
            <button
              className="wf-icon-btn"
              onClick={handleDelete}
              title="Delete video"
            >
              <Trash2 size={14} />
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
              onClick={handleExpand}
              title="Expand"
            >
              <Maximize2 size={14} />
            </button>
          </div>
          {previewOpen && (
            <ImageLightbox
              src={previewUrl!}
              alt={fileName ?? "video preview"}
              kind="video"
              fileName={fileName}
              onClose={() => setPreviewOpen(false)}
            />
          )}
        </div>
      )}
    </BaseNode>
  );
}

export const UploadVideoNode = memo(UploadVideoNodeInner);