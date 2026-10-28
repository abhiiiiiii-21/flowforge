import { z } from 'zod'

/* ─── Graph Validation ─────────────────────────────────── */

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
})

export const graphEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
})

export const graphSchema = z.object({
  nodes: z.array(graphNodeSchema).min(1, 'At least one node is required'),
  edges: z.array(graphEdgeSchema),
})

export const runWorkflowSchema = z.object({
  workflowVersionId: z.string().min(1, "workflowVersionId is required"),
  scope: z.enum(["full", "partial", "single"]).optional(),
  selectedNodeIds: z.array(z.string().min(1)).optional(),
})

/* ─── Workflow Persistence ─────────────────────────────── */

export const saveWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  graph: graphSchema,
})

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  graph: graphSchema.optional(),
})

/* ─── Node Data Validation ─────────────────────────────── */

export const textNodeDataSchema = z.object({
  text: z.string().optional(),
})

export const uploadImageNodeDataSchema = z.object({
  fileUrl: z.string().url().optional(),
  fileName: z.string().optional(),
})

export const uploadVideoNodeDataSchema = z.object({
  fileUrl: z.string().url().optional(),
  fileName: z.string().optional(),
})

export const llmNodeDataSchema = z.object({
  model: z.string().optional(),
  outputType: z.enum(["text", "image"]).optional(),
  systemPrompt: z.string().optional(),
  userMessage: z.string().optional(),
})

export const cropImageNodeDataSchema = z.object({
  xPercent: z.number().min(0).max(100).optional(),
  yPercent: z.number().min(0).max(100).optional(),
  widthPercent: z.number().min(0).max(100).optional(),
  heightPercent: z.number().min(0).max(100).optional(),
})

export const extractFrameNodeDataSchema = z.object({
  timestamp: z.union([z.string(), z.number()]).optional(),
  timestampMode: z.enum(["seconds", "percent"]).optional(),
  framePercent: z.number().min(0).max(100).optional(),
})

/* ─── Type Exports ─────────────────────────────────────── */

export type GraphInput = z.infer<typeof graphSchema>
export type RunWorkflowInput = z.infer<typeof runWorkflowSchema>
export type SaveWorkflowInput = z.infer<typeof saveWorkflowSchema>
