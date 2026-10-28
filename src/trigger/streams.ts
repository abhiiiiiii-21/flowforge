import { streams } from "@trigger.dev/sdk/v3"
import type { WorkflowEvent } from "./engine/types"

/**
 * Typed stream for workflow execution events.
 *
 * This single stream carries all event types (node_start, node_complete,
 * node_failed, workflow_done) as a discriminated union. The frontend
 * subscribes via `useRealtimeStream(workflowEvents, runId, { ... })`.
 *
 * Defined here (shared location) so both the Trigger.dev tasks and
 * the frontend import the same type-safe stream definition.
 */
export const workflowEvents = streams.define<WorkflowEvent>({
  id: "workflow-events",
})
