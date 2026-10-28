"use client";

import React, { memo, useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  useReactFlow,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useWorkflowStore } from "@/store/workflowStore";
import { useThemeStore } from "@/store/themeStore";
import { useFileDrop } from "@/hooks/useFileDrop";
import { nodeTypes as nodeTypeRegistry } from "@/components/nodes/nodeTypes";
import { CustomEdge } from "./CustomEdge";
import { CanvasToolbar } from "./CanvasToolbar";
import { BottomLeftToolbar } from "./BottomLeftToolbar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import toast from "react-hot-toast";

/* ─── Edge Types ──────────────────────────────────────── */

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

/* ─── Component ───────────────────────────────────────── */

interface WorkflowCanvasProps {
  isLoading?: boolean;
}

function WorkflowCanvasInner({ isLoading = false }: WorkflowCanvasProps) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    addNode,
    setEdges,
    pushSnapshot,
  } = useWorkflowStore();

  const activeTool = useWorkflowStore((s) => s.activeTool);
  const theme = useThemeStore((s) => s.theme);
  const { onDrop: onFileDrop } = useFileDrop();
  const reactFlowInstance = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Register keyboard shortcuts
  useKeyboardShortcuts();

  /* ─── Connection handler ────────────────────────────── */

  const handleConnect = useCallback(
    (connection: Connection) => {
      const success = onConnect(connection);
      if (!success) {
        toast.error("Invalid connection", {
          duration: 2000,
          style: {
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--error)",
            fontSize: "13px",
          },
        });
      }
    },
    [onConnect],
  );

  /* ─── Cut tool: click an edge to delete it ──────────── */

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: { id: string }) => {
      if (activeTool !== "cut") return;
      pushSnapshot();
      setEdges(edges.filter((e) => e.id !== edge.id));
      toast.success("Connection cut", { duration: 1500 });
    },
    [activeTool, edges, setEdges, pushSnapshot],
  );

  /* ─── Drag & Drop on wrapper div (not ReactFlow) ────── */

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // A node-palette drag advertises "application/reactflow-type"; a file
    // drag advertises "Files". Pick the right effect for each so the
    // browser actually allows the drop.
    const types = event.dataTransfer.types;
    if (types.includes("application/reactflow-type")) {
      event.dataTransfer.dropEffect = "move";
    } else if (types.includes("Files")) {
      event.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    } else {
      event.dataTransfer.dropEffect = "none";
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (!wrapperRef.current?.contains(relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);

      // Check for node palette drop
      const nodeType = event.dataTransfer.getData("application/reactflow-type");
      if (nodeType) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addNode(nodeType, position);
        return;
      }

      // Otherwise, handle file drop
      onFileDrop(event);
    },
    [addNode, onFileDrop, reactFlowInstance],
  );

  return (
    <div
      className={`canvas-container canvas-container--tool-${activeTool}`}
      ref={wrapperRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onEdgeClick={handleEdgeClick}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypeRegistry as NodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.5, maxZoom: 1 }}
        defaultEdgeOptions={{ type: "custom" }}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode="Shift"
        selectionOnDrag={activeTool === "select"}
        selectionMode={SelectionMode.Partial}
        panOnDrag={activeTool === "pan" ? true : [1, 2]}
        snapToGrid
        snapGrid={[16, 16]}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        colorMode={theme}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.4}
          color={theme === "dark" ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.06)"}
          style={{ backgroundColor: '#101010' }}
        />
        <MiniMap
          nodeColor={() =>
            theme === 'dark'
              ? 'rgba(255, 255, 255, 0.15)'
              : 'rgba(0, 0, 0, 0.15)'
          }
          maskColor={
            theme === 'dark'
              ? 'rgba(0, 0, 0, 0.7)'
              : 'rgba(255, 255, 255, 0.7)'
          }
          position="bottom-right"
          pannable
          zoomable
          style={{ marginBottom: 60,marginRight: 60 }}
        />
        <Controls position="bottom-right" style={{ marginBottom: 60 }} />
      </ReactFlow>

      {/* Bottom Canvas Toolbar (Krea-style) */}
      <CanvasToolbar />
      <BottomLeftToolbar />

      {/* File Drop Overlay */}
      {isDragOver && (
        <div className="canvas-drop-overlay">
          <div className="canvas-drop-overlay__text">
            Drop files to create nodes
          </div>
        </div>
      )}

      {/* Initial DB-load overlay (scoped to the canvas only) */}
      {isLoading && (
        <div className="canvas-loading" role="status" aria-live="polite">
          <div className="canvas-loading__spinner" />
          <div className="canvas-loading__label">Loading workflow…</div>
        </div>
      )}
    </div>
  );
}

export const WorkflowCanvas = memo(WorkflowCanvasInner);