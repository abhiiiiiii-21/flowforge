"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Download, Check } from "lucide-react";

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  kind?: "image" | "video";
  fileName?: string;
  onClose: () => void;
}

function ImageLightboxInner({
  src,
  alt,
  kind = "image",
  fileName,
  onClose,
}: ImageLightboxProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Prevent background scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, onClose]);

  const handleCopy = useCallback(() => {
    if (!src) return;
    navigator.clipboard
      .writeText(src)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard may be blocked in some browser contexts.
      });
  }, [src]);

  const handleDownload = useCallback(() => {
    if (!src) return;
    const filename = fileName ?? (kind === "video" ? "video" : "image");
    // Prefer blob download for cross-origin URLs where `download` can be ignored.
    void fetch(src)
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
        // Fallback still lets users save/open media manually.
        const a = document.createElement("a");
        a.href = src;
        a.download = filename;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.click();
      });
  }, [fileName, kind, src]);

  if (!src || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="image-lightbox__panel" onClick={(e) => e.stopPropagation()}>
        <div className="image-lightbox__header">
          <span>Preview</span>
          <div className="image-lightbox__actions">
            <button
              type="button"
              className="wf-icon-btn"
              onClick={handleCopy}
              aria-label="Copy URL"
              title="Copy URL"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button
              type="button"
              className="wf-icon-btn"
              onClick={handleDownload}
              aria-label="Download"
              title="Download"
            >
              <Download size={14} />
            </button>
            <button
              className="wf-icon-btn"
              onClick={onClose}
              aria-label="Close preview"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="image-lightbox__body">
          {kind === "video" ? (
            <video
              src={src}
              className="image-lightbox__video"
              controls
              autoPlay
              playsInline
            />
          ) : (
            <img
              src={src}
              alt={alt ?? "Preview"}
              className="image-lightbox__img"
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const ImageLightbox = memo(ImageLightboxInner);