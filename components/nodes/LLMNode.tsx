"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { useNodeConnections } from "@/hooks/useNodeConnections";
import { ImageLightbox } from "@/components/workflow/ImageLightbox";
import {
  getDefaultLLMModel,
  getLLMModelsForOutputType,
  getLLMOutputHandleId,
  normalizeLLMModel,
  normalizeLLMOutputType,
} from "@/lib/llmModels";
import { Link, Copy, Check, Download, Maximize2, ChevronDown, ChevronRight } from "lucide-react";

function extractUpstreamTextValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return null;

  if ("text" in value && typeof (value as { text: unknown }).text === "string") {
    return (value as { text: string }).text;
  }

  if ("result" in value && typeof (value as { result: unknown }).result === "string") {
    return (value as { result: string }).result;
  }

  if ("output" in value) {
    return extractUpstreamTextValue((value as { output: unknown }).output);
  }

  return null;
}

function extractImageUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? value : null;
  }
  if (!value || typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;
  if (typeof obj.url === "string") return obj.url;
  if (typeof obj.previewUrl === "string") return obj.previewUrl;
  if (typeof obj.fileUrl === "string") return obj.fileUrl;
  if (typeof obj.resultUrl === "string") return obj.resultUrl;
  if ("output" in obj) return extractImageUrl(obj.output);
  return null;
}

function extractImageCaption(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  return typeof obj.text === "string" && obj.text.trim().length > 0 ? obj.text : null;
}

/**
 * Look up the upstream node connected to a given target handle on this LLM
 * node, then read either its authored text (`data.text`) or its live runtime
 * output (`nodeOutputs[sourceId]`). This keeps Text -> LLM and LLM -> LLM
 * previews in sync with what will actually flow into the run.
 */
function useUpstreamText(targetId: string, targetHandle: string): string | null {
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const edge = edges.find(
    (e) => e.target === targetId && e.targetHandle === targetHandle,
  );
  if (!edge) return null;
  const src = nodes.find((n) => n.id === edge.source);
  if (!src) return null;
  const data = src.data as Record<string, unknown>;
  if (typeof data.text === "string") return data.text;
  return extractUpstreamTextValue(nodeOutputs[edge.source]);
}

function LLMNodeInner(props: NodeProps) {
  const { id, data } = props;
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const nodeOutput = useWorkflowStore((s) => s.nodeOutputs[id]);
  const setNodeOutput = useWorkflowStore((s) => s.setNodeOutput);
  const setNodeExecutionState = useWorkflowStore((s) => s.setNodeExecutionState);
  const executionState = useWorkflowStore(
    (s) => s.executionStates[id] ?? "idle",
  );
  const edges = useWorkflowStore((s) => s.edges);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const pushSnapshot = useWorkflowStore((s) => s.pushSnapshot);
  const { isConnected } = useNodeConnections(id);

  const [copied, setCopied] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const outputType = normalizeLLMOutputType(data.outputType);
  const modelOptions = useMemo(
    () => getLLMModelsForOutputType(outputType),
    [outputType],
  );
  const selectedModel = normalizeLLMModel(data.model, outputType);
  const activeOutputHandleId = getLLMOutputHandleId(outputType);

  const systemPromptConnected = isConnected("system-prompt-in");
  const userMessageConnected = isConnected("user-message-in");

  const upstreamSystem = useUpstreamText(id, "system-prompt-in");
  const upstreamUser = useUpstreamText(id, "user-message-in");

  const imageEdges = edges.filter(
    (e) => e.target === id && e.targetHandle === "images-in",
  );

  const outputText = extractUpstreamTextValue(nodeOutput);
  const outputImageUrl = extractImageUrl(nodeOutput);
  const outputImageCaption = extractImageCaption(nodeOutput);
  const showTextOutput = outputType === "text" && (executionState === "success" || !!outputText);
  const showImageOutput = outputType === "image" && !!outputImageUrl;

  useEffect(() => {
    const nextPatch: Record<string, unknown> = {};
    if (data.outputType !== outputType) nextPatch.outputType = outputType;
    if ((data.model as string | undefined) !== selectedModel) nextPatch.model = selectedModel;
    if (Object.keys(nextPatch).length > 0) {
      updateNodeData(id, nextPatch);
    }
  }, [data.model, data.outputType, id, outputType, selectedModel, updateNodeData]);

  const handleSystemChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { systemPrompt: e.target.value });
    },
    [id, updateNodeData],
  );

  const handleUserChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { userMessage: e.target.value });
    },
    [id, updateNodeData],
  );

  const handleOutputTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const nextOutputType = normalizeLLMOutputType(e.target.value);
      if (nextOutputType === outputType) return;

      pushSnapshot();
      setEdges(edges.filter((edge) => edge.source !== id));
      setNodeOutput(id, undefined);
      setNodeExecutionState(id, "idle");
      updateNodeData(id, {
        outputType: nextOutputType,
        model: getDefaultLLMModel(nextOutputType),
      });
    },
    [
      edges,
      id,
      outputType,
      pushSnapshot,
      setEdges,
      setNodeExecutionState,
      setNodeOutput,
      updateNodeData,
    ],
  );

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { model: e.target.value });
    },
    [id, updateNodeData],
  );

  const handleCopy = useCallback(() => {
    const valueToCopy = outputType === "image" ? outputImageUrl : outputText;
    if (!valueToCopy) return;
    navigator.clipboard.writeText(valueToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [outputImageUrl, outputText, outputType]);

  const handleDownload = useCallback(() => {
    if (!outputImageUrl) return;
    const a = document.createElement("a");
    a.href = outputImageUrl;
    a.download = "llm-output";
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  }, [outputImageUrl]);

  const topSection = showImageOutput ? (
    <div className="node-result">
      <div className="node-result__header">
        <span className="node-result__header-label">
          <span className="node-result__header-dot" />
          Output
        </span>
        <span style={{ color: "var(--text-muted)", textTransform: "none", letterSpacing: 0 }}>
          Generated image
        </span>
      </div>
      <div className="node-result__media-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={outputImageUrl!}
          alt="LLM generated"
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
              handleCopy();
            }}
            title="Copy URL"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            type="button"
            className="wf-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            title="Download"
          >
            <Download size={14} />
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
      {outputImageCaption && (
        <div className="llm-node__image-caption">{outputImageCaption}</div>
      )}
      {lightboxOpen && (
        <ImageLightbox
          src={outputImageUrl!}
          alt="LLM generated"
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  ) : showTextOutput ? (
    <div className="llm-node__output">
      <div
        className="workflow-node__label"
        style={{
          color: "var(--node-accent)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
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
        Output
      </div>
      <div className="llm-node__output-text">
        {outputText ?? <span className="llm-node__output-empty">No output</span>}
      </div>
      {outputText && (
        <button
          type="button"
          className="wf-icon-btn wf-icon-btn--ghost llm-node__output-copy"
          onClick={handleCopy}
          title="Copy"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </div>
  ) : null;

  return (
    <BaseNode
      {...props}
      topSection={topSection}
      skipInputHandles
      skipOutputHandles
      floatingHandles={(
        <Handle
          key={activeOutputHandleId}
          type="source"
          position={Position.Right}
          id={activeOutputHandleId}
          className={`react-flow__handle--${outputType === "image" ? "image" : "text"} llm-node__output-handle`}
          style={{ top: "50%" }}
        />
      )}
    >
      <div className="workflow-node__field workflow-node__field--inline">
        <label className="workflow-node__label">Output Type</label>
        <select
          className="workflow-node__select--sleek"
          value={outputType}
          onChange={handleOutputTypeChange}
        >
          <option value="text">Text</option>
          <option value="image">Image</option>
        </select>
      </div>

      <div className="workflow-node__field workflow-node__field--inline">
        <label className="workflow-node__label">Model</label>
        <select
          className="workflow-node__select--sleek"
          value={selectedModel}
          onChange={handleModelChange}
        >
          {modelOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="workflow-node__field llm-node__row">
        <Handle
          type="target"
          position={Position.Left}
          id="user-message-in"
          className="react-flow__handle--text llm-node__row-handle"
        />
        <label className="workflow-node__label">
          {outputType === "image" ? "Image Prompt" : "Prompt"}
        </label>
        {userMessageConnected ? (
          <div className="llm-node__upstream">

            <div className="llm-node__upstream-text">
              {upstreamUser && upstreamUser.length > 0
                ? upstreamUser
                : <span className="llm-node__upstream-empty">(empty prompt)</span>}
            </div>
          </div>
        ) : (
          <input
            type="text"
            className="workflow-node__input"
            placeholder={outputType === "image" ? "Describe the image to generate" : "Required user message"}
            value={(data.userMessage as string) ?? ""}
            onChange={handleUserChange}
          />
        )}
      </div>

      <div className="workflow-node__accordion">
        <button 
          className="workflow-node__accordion-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
          type="button"
        >
          {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Settings
        </button>
        {showAdvanced && (
          <div className="workflow-node__accordion-content">
            <div className="workflow-node__field llm-node__row">
              <Handle
                type="target"
                position={Position.Left}
                id="system-prompt-in"
                className="react-flow__handle--text llm-node__row-handle"
              />
              <label className="workflow-node__label">System Prompt</label>
              {systemPromptConnected ? (
                <div className="llm-node__upstream">
     
                  <div className="llm-node__upstream-text">
                    {upstreamSystem && upstreamSystem.length > 0
                      ? upstreamSystem
                      : <span className="llm-node__upstream-empty">(empty text)</span>}
                  </div>
                </div>
              ) : (
                <input
                  type="text"
                  className="workflow-node__input"
                  placeholder="Optional system prompt"
                  value={(data.systemPrompt as string) ?? ""}
                  onChange={handleSystemChange}
                />
              )}
            </div>

            <div className="workflow-node__field llm-node__row">
              <Handle
                type="target"
                position={Position.Left}
                id="images-in"
                className="react-flow__handle--image llm-node__row-handle"
              />
              <label className="workflow-node__label">
                {outputType === "image" ? "Reference Images (optional)" : "Images (optional)"}
              </label>
              {imageEdges.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    padding: "6px 0",
                  }}
                >
                  Connect one or more image sources
                </div>
              ) : (
                <div className="llm-node__images-stack">
                  {imageEdges.map((edge) => (
                    <div key={edge.id} className="workflow-node__connected-badge">
                      <Link size={12} />
                      {edge.source}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const LLMNode = memo(LLMNodeInner);