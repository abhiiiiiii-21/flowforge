"use client";

import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Toaster } from "react-hot-toast";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { Sidebar } from "./Sidebar";
import { HistoryPanel } from "./HistoryPanel";
import { VersionSidebar } from "./VersionSidebar";
import { AssetsSidebar } from "./AssetsSidebar";
import { Toolbar } from "./Toolbar";
import { useWorkflowExecution } from "@/hooks/useWorkflowExecution";
import { RealtimeStreamHandler } from "./RealtimeStreamHandler";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useTheme } from "@/hooks/useTheme";
import { useRightSidebarStore } from "@/store/rightSidebarStore";
import "./workflow.css";

export default function WorkflowEditor() {
  useTheme();

  return (
    <ReactFlowProvider>
      <WorkflowEditorInner />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
            fontSize: "13px",
            borderRadius: "8px",
            padding: "8px 14px",
          },
        }}
      />
    </ReactFlowProvider>
  );
}

function WorkflowEditorInner() {
  const {
    executeWorkflow,
    stopWorkflow,
    processEvent,
    currentTriggerRunId,
    publicAccessToken,
  } = useWorkflowExecution();
  const panel = useRightSidebarStore((s) => s.panel);
  const setPanel = useRightSidebarStore((s) => s.setPanel);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Collapse sidebar by default on smaller screens.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setSidebarOpen(!mq.matches ? false : false);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const { isLoading } = useAutoSave();

  return (
    <div className="workflow-editor">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />

      <div className="workflow-editor__main">
        <div className="workflow-editor__topbar">
          <Toolbar onRun={executeWorkflow} onStop={stopWorkflow} />
        </div>

        <div className="workflow-editor__body">
          <WorkflowCanvas isLoading={isLoading} />
          {panel === "runHistory" && (
            <HistoryPanel onClose={() => setPanel("none")} />
          )}
          {panel === "workflowHistory" && (
            <VersionSidebar onClose={() => setPanel("none")} />
          )}
          {panel === "assets" && (
            <AssetsSidebar onClose={() => setPanel("none")} />
          )}
        </div>
      </div>

      {/* Headless: subscribes to Trigger.dev realtime stream while a run is active */}
      {currentTriggerRunId && publicAccessToken && (
        <RealtimeStreamHandler
          triggerRunId={currentTriggerRunId}
          accessToken={publicAccessToken}
          onEvent={processEvent}
        />
      )}
    </div>
  );
}