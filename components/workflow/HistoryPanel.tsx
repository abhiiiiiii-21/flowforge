'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useHistoryStore, type RunRecord } from '@/store/historyStore'
import { useWorkflowStore } from '@/store/workflowStore'
import {
  X,
  CheckCircle,
  XCircle,
  Loader,
  Circle,
  History,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Maximize2,
} from 'lucide-react'
import { shortenError } from '@/lib/errorFormat'
import { labelForNodeType } from '@/lib/nodeLabels'

/* ─── Helpers ─────────────────────────────────────────── */

function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start: number, end?: number): string {
  if (!end) return ''
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainingSeconds}s`
}

function scopeLabel(scope: RunRecord['scope']): string {
  if (scope === 'single') return 'Single Node'
  if (scope === 'partial') return 'Partial'
  return 'Full Workflow'
}

function previewOutput(output: unknown, max = 80): string {
  if (output == null) return ''
  if (typeof output === 'string') {
    return output.length > max ? output.slice(0, max - 1) + '…' : output
  }
  try {
    const s = JSON.stringify(output)
    return s.length > max ? s.slice(0, max - 1) + '…' : s
  } catch {
    return ''
  }
}

function formatFull(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isTruncated(value: unknown, max = 80): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.length > max
  try {
    return JSON.stringify(value).length > max
  } catch {
    return false
  }
}

function StatusIcon({
  status,
  size = 14,
}: {
  status: string
  size?: number
}) {
  switch (status) {
    case 'running':
      return (
        <Loader
          size={size}
          style={{ color: 'var(--accent-llm)', animation: 'spin 1s linear infinite' }}
        />
      )
    case 'completed':
    case 'success':
      return <CheckCircle size={size} style={{ color: 'var(--success)' }} />
    case 'failed':
      return <XCircle size={size} style={{ color: 'var(--error)' }} />
    default:
      return <Circle size={size} style={{ color: 'var(--text-muted)' }} />
  }
}

function StatusBadge({ status }: { status: RunRecord['status'] }) {
  const label =
    status === 'running'
      ? 'Running'
      : status === 'completed'
        ? 'Completed'
        : status === 'failed'
          ? 'Failed'
          : 'Pending'
  return (
    <span className={`history-run__badge history-run__badge--${status}`}>
      <StatusIcon status={status} size={11} />
      <span>{label}</span>
    </span>
  )
}

/* ─── Component ───────────────────────────────────────── */

/* ─── Full Preview Modal ──────────────────────────────── */

interface FullPreviewData {
  title: string
  kind: 'Input' | 'Output' | 'Error'
  content: string
}

function FullPreviewModal({
  data,
  onClose,
}: {
  data: FullPreviewData
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(data.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [data.content])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="history-preview-overlay" onClick={onClose}>
      <div
        className="history-preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="history-preview-modal__header">
          <div className="history-preview-modal__title">
            <span className={`history-preview-modal__kind history-preview-modal__kind--${data.kind.toLowerCase()}`}>
              {data.kind}
            </span>
            <span>{data.title}</span>
          </div>
          <div className="history-preview-modal__actions">
            <button
              className="history-preview-modal__btn"
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              className="history-preview-modal__btn history-preview-modal__btn--close"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="history-preview-modal__body">
          <pre className="history-preview-modal__content">{data.content}</pre>
        </div>
      </div>
    </div>
  )
}

/* ─── Component ───────────────────────────────────────── */

function HistoryPanelInner({ onClose }: { onClose: () => void }) {
  const { runs, selectedRunId, selectRun, refetchKey } = useHistoryStore()
  const workflowId = useWorkflowStore((s) => s.currentWorkflowId)
  const [fullPreview, setFullPreview] = useState<FullPreviewData | null>(null)
  const [serverRuns, setServerRuns] = useState<RunRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!workflowId) {
      queueMicrotask(() => setServerRuns([]))
      return
    }
    const controller = new AbortController()
    queueMicrotask(() => setIsLoading(true))
    ;(async () => {
      const res = await fetch(`/api/workflows/${workflowId}/runs`, {
        signal: controller.signal,
      })
      if (!res.ok) return
      const data = await res.json()
      type ApiNodeExecution = {
        nodeId: string
        status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'
        input: unknown
        output: unknown
        error: string | null
        startedAt: string | null
        finishedAt: string | null
      }
      type ApiGraphNode = { id: string; type?: string }
      type ApiRun = {
        id: string
        status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
        scope: 'FULL' | 'PARTIAL' | 'SINGLE'
        triggerRunId: string | null
        graph?: { nodes?: ApiGraphNode[] } | null
        createdAt: string
        updatedAt: string
        nodeExecutions: ApiNodeExecution[]
      }

      const mapped: RunRecord[] = ((data.runs ?? []) as ApiRun[]).map((r) => {
        const nodeTypes: Record<string, string> = {}
        for (const n of r.graph?.nodes ?? []) {
          if (n.type) nodeTypes[n.id] = n.type
        }
        return {
          runId: r.id,
          triggerRunId: r.triggerRunId ?? '',
          status:
            r.status === 'COMPLETED'
              ? 'completed'
              : r.status === 'FAILED'
                ? 'failed'
                : r.status === 'RUNNING'
                  ? 'running'
                  : 'pending',
          scope:
            r.scope === 'SINGLE'
              ? 'single'
              : r.scope === 'PARTIAL'
                ? 'partial'
                : 'full',
          startedAt: new Date(r.createdAt).getTime(),
          finishedAt:
            r.status === 'COMPLETED' || r.status === 'FAILED'
              ? new Date(r.updatedAt).getTime()
              : undefined,
          nodeTypes,
          nodeExecutions: (r.nodeExecutions ?? []).map((e) => ({
            nodeId: e.nodeId,
            nodeType: nodeTypes[e.nodeId],
            status:
              e.status === 'SUCCESS'
                ? 'success'
                : e.status === 'FAILED'
                  ? 'failed'
                  : e.status === 'RUNNING'
                    ? 'running'
                    : 'pending',
            input: e.input,
            output: e.output,
            error: e.error ?? undefined,
            startedAt: e.startedAt ? new Date(e.startedAt).getTime() : undefined,
            finishedAt: e.finishedAt ? new Date(e.finishedAt).getTime() : undefined,
          })),
        }
      })
      if (controller.signal.aborted) return
      queueMicrotask(() => {
        setServerRuns(mapped)
        setIsLoading(false)
      })
    })().catch(() => {
      if (!controller.signal.aborted) setIsLoading(false)
    })
    return () => controller.abort()
    // refetchKey: re-fetch from DB whenever a run reaches terminal state
  }, [workflowId, refetchKey])

  const mergedRuns = useMemo(() => {
    const byId = new Map<string, RunRecord>()
    // Server runs go in first as the base
    for (const r of serverRuns) byId.set(r.runId, r)
    // In-memory runs OVERRIDE server data — they have live updates
    // from polling and realtime streams
    for (const r of runs) byId.set(r.runId, r)
    return Array.from(byId.values()).sort((a, b) => b.startedAt - a.startedAt)
  }, [runs, serverRuns])

  return (
    <aside className="side-panel history-panel">
      <div className="side-panel__header">
        <div className="side-panel__title">Run History</div>
        <button
          className="side-panel__close"
          onClick={onClose}
          aria-label="Close history panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="history-panel__list">
        {isLoading && mergedRuns.length === 0 ? (
          <div className="history-panel__empty">
            <Loader size={24} style={{ opacity: 0.3, animation: 'spin 1s linear infinite' }} />
            <span>Loading runs…</span>
          </div>
        ) : mergedRuns.length === 0 ? (
          <div className="history-panel__empty">
            <History size={24} style={{ opacity: 0.3 }} />
            <span>No runs yet</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Run a workflow to see history
            </span>
          </div>
        ) : (
          mergedRuns.map((run) => (
            <RunItem
              key={run.runId}
              run={run}
              isSelected={run.runId === selectedRunId}
              onViewFull={setFullPreview}
              onSelect={() =>
                selectRun(run.runId === selectedRunId ? null : run.runId)
              }
            />
          ))
        )}
      </div>

      {fullPreview && (
        <FullPreviewModal
          data={fullPreview}
          onClose={() => setFullPreview(null)}
        />
      )}
    </aside>
  )
}

/* ─── Run Item ────────────────────────────────────────── */

function RunItem({
  run,
  isSelected,
  onSelect,
  onViewFull,
}: {
  run: RunRecord
  isSelected: boolean
  onSelect: () => void
  onViewFull: (data: FullPreviewData) => void
}) {
  const duration = formatDuration(run.startedAt, run.finishedAt)
  const isExpanded = isSelected

  return (
    <div
      className={`history-run ${isSelected ? 'history-run--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="history-run__header">
        <div className="history-run__expand-icon">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
        <StatusBadge status={run.status} />
        <span className="history-run__scope-chip">
          {scopeLabel(run.scope)}
        </span>
        <span className="history-run__duration">{duration}</span>
      </div>

      <div className="history-run__time">{formatDate(run.startedAt)}</div>

      {isExpanded && run.nodeExecutions.length > 0 && (
        <div
          className="history-run__detail"
          onClick={(e) => e.stopPropagation()}
        >
          {orderedExecutions(run).map((exec, i) => (
            <NodeExecutionRow
              key={exec.nodeId}
              exec={exec}
              sequence={i + 1}
              fallbackType={run.nodeTypes?.[exec.nodeId]}
              onViewFull={onViewFull}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function orderedExecutions(run: RunRecord) {
  return [...run.nodeExecutions].sort((a, b) => {
    const at = a.startedAt ?? Number.POSITIVE_INFINITY
    const bt = b.startedAt ?? Number.POSITIVE_INFINITY
    if (at !== bt) return at - bt
    return a.nodeId.localeCompare(b.nodeId)
  })
}

function NodeExecutionRow({
  exec,
  sequence,
  fallbackType,
  onViewFull,
}: {
  exec: RunRecord['nodeExecutions'][number]
  sequence: number
  fallbackType?: string
  onViewFull: (data: FullPreviewData) => void
}) {
  const label = labelForNodeType(exec.nodeType ?? fallbackType)
  const dur =
    exec.startedAt && exec.finishedAt
      ? formatDuration(exec.startedAt, exec.finishedAt)
      : ''

  const inputPreview =
    exec.input && Object.keys(exec.input as object).length > 0
      ? previewOutput(exec.input)
      : ''
  const outputPreview = previewOutput(exec.output)
  const inputIsTruncated = exec.input != null && isTruncated(exec.input)
  const outputIsTruncated = exec.output != null && isTruncated(exec.output)
  const errorIsTruncated = exec.error != null && exec.error.length > 80

  return (
    <div className="history-run__node-block">
      <div className="history-run__node">
        <StatusIcon status={exec.status} size={12} />
        <span className="history-run__node-label">{label}</span>
        <span className="history-run__node-id-mono">(node-{sequence})</span>
        {dur && <span className="history-run__node-duration">{dur}</span>}
      </div>

      {inputPreview && (
        <div className="history-run__node-line">
          <span className="history-run__node-line-key">Input:</span>{' '}
          <span title={typeof exec.input === 'string' ? exec.input : undefined}>
            {inputPreview}
          </span>
          {inputIsTruncated && (
            <button
              className="history-run__view-btn"
              onClick={() =>
                onViewFull({
                  title: label,
                  kind: 'Input',
                  content: formatFull(exec.input),
                })
              }
            >
              <Maximize2 size={10} />
              View
            </button>
          )}
        </div>
      )}

      {outputPreview && (
        <div className="history-run__node-line">
          <span className="history-run__node-line-key">Output:</span>{' '}
          <span
            title={typeof exec.output === 'string' ? exec.output : undefined}
          >
            {outputPreview}
          </span>
          {outputIsTruncated && (
            <button
              className="history-run__view-btn"
              onClick={() =>
                onViewFull({
                  title: label,
                  kind: 'Output',
                  content: formatFull(exec.output),
                })
              }
            >
              <Maximize2 size={10} />
              View
            </button>
          )}
        </div>
      )}

      {exec.error && (
        <div className="history-run__node-line history-run__node-line--error">
          <span className="history-run__node-line-key">Error:</span>{' '}
          <span title={exec.error}>{shortenError(exec.error)}</span>
          {errorIsTruncated && (
            <button
              className="history-run__view-btn history-run__view-btn--error"
              onClick={() =>
                onViewFull({
                  title: label,
                  kind: 'Error',
                  content: exec.error!,
                })
              }
            >
              <Maximize2 size={10} />
              View
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export const HistoryPanel = memo(HistoryPanelInner)