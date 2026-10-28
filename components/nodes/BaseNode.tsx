'use client'

import { memo, useState, type ReactNode } from 'react'
import { type NodeProps, Handle, Position } from '@xyflow/react'
import { useWorkflowStore, type NodeExecutionState } from '@/store/workflowStore'
import { NODE_HANDLE_SPECS, type HandleDataType } from '@/lib/connectionRules'
import {
  Type,
  Image as ImageIcon,
  Video,
  Bot,
  Crop,
  Film,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
// import { shortenError } from '@/lib/errorFormat'
import { shortenError } from '@/lib/errorFormat'
const ICON_MAP: Record<string, typeof Type> = {
  text: Type,
  upload_image: ImageIcon,
  upload_video: Video,
  llm: Bot,
  crop_image: Crop,
  extract_frame: Film,
}

const LABEL_MAP: Record<string, string> = {
  text: 'Prompt',
  upload_image: 'Upload Image',
  upload_video: 'Upload Video',
  llm: 'LLM',
  crop_image: 'Crop Image',
  extract_frame: 'Extract Frame',
}

function getHandleClass(type: HandleDataType): string {
  return `react-flow__handle--${type}`
}

interface BaseNodeProps extends NodeProps {
  children?: ReactNode
  outputSection?: ReactNode
  /** When true (during file upload), apply running-style border + glow + pulse. */
  uploading?: boolean
  /** Render before children, after header (used for LLM output-at-top). */
  topSection?: ReactNode
  /** Custom body wrapper (e.g. for media that fills edge-to-edge). */
  bodyless?: boolean
  /** Optional custom header content (replaces default title row). */
  headerExtras?: ReactNode
  /**
   * When true, BaseNode does not auto-render input handles. The custom node
   * is responsible for placing them — used by LLMNode to align each handle
   * with its corresponding field row.
   */
  skipInputHandles?: boolean
  /** When true, BaseNode does not auto-render output handles. */
  skipOutputHandles?: boolean
  /** Optional custom handle layer rendered alongside the default handles. */
  floatingHandles?: ReactNode
}

function BaseNodeInner({
  id,
  type,
  selected,
  children,
  outputSection,
  uploading,
  topSection,
  bodyless,
  headerExtras,
  skipInputHandles,
  skipOutputHandles,
  floatingHandles,
}: BaseNodeProps) {
  const nodeType = type ?? 'text'
  const executionState = useWorkflowStore(
    (s) => s.executionStates[id] ?? 'idle'
  ) as NodeExecutionState
  const nodeError = useWorkflowStore((s) => s.nodeErrors[id])

  const Icon = ICON_MAP[nodeType] ?? Type
  const label = LABEL_MAP[nodeType] ?? nodeType
  const spec = NODE_HANDLE_SPECS[nodeType]

  const effectiveState: NodeExecutionState = uploading ? 'running' : executionState

  const stateClass =
    effectiveState === 'running'
      ? 'workflow-node--running'
      : effectiveState === 'pending'
        ? 'workflow-node--pending'
        : effectiveState === 'success'
          ? 'workflow-node--success'
          : effectiveState === 'failed'
            ? 'workflow-node--failed'
            : ''

  return (
    <div
      className={`workflow-node workflow-node--type-${nodeType} ${stateClass} ${selected ? 'selected' : ''}`}
      id={`node-${id}`}
    >
      {/* Detached Header — Title and Status dot above the box */}
      <div className="workflow-node__header">
        <div className="workflow-node__icon">
          <Icon size={18} />
        </div>
        <span className="workflow-node__title text-neutral-400">{label}</span>
        {headerExtras}
        <div
          className={`workflow-node__status workflow-node__status--${effectiveState}`}
        />
      </div>

      {/* Handles (Outer container to avoid clipping) */}
      {!skipInputHandles && spec?.inputs.map((handle, index) => (
        <Handle
          key={handle.id}
          type="target"
          position={Position.Left}
          id={handle.id}
          className={getHandleClass(handle.type)}
          style={{
            top: `${((index + 1) / (spec.inputs.length + 1)) * 100}%`,
          }}
        />
      ))}

      {!skipOutputHandles && spec?.outputs.map((handle, index) => (
        <Handle
          key={handle.id}
          type="source"
          position={Position.Right}
          id={handle.id}
          className={getHandleClass(handle.type)}
          style={{
            top: `${((index + 1) / (spec.outputs.length + 1)) * 100}%`,
          }}
        />
      ))}

      {floatingHandles}

      {/* Main Body Wrapper */}
      <div className="workflow-node__body-wrap">
        {topSection}

        {children && !bodyless ? (
          <div className="workflow-node__body">
            <div style={{ padding: 12 }}>
              {children}
            </div>
          </div>
        ) : (
          children
        )}

        {outputSection}

        {executionState === 'failed' && nodeError && (
          <NodeErrorDisplay error={nodeError} />
        )}
      </div>
    </div>
  )
}

export const BaseNode = memo(BaseNodeInner)

function NodeErrorDisplay({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false)
  const short = shortenError(error)
  const hasMore = short !== error

  return (
    <div className="workflow-node__error">
      <div className="workflow-node__error-text">
        <AlertCircle size={14} className="workflow-node__error-icon" />
        <span
          className={
            expanded
              ? 'workflow-node__error-msg workflow-node__error-msg--full'
              : 'workflow-node__error-msg'
          }
        >
          {expanded ? error : short}
        </span>
        {hasMore && (
          <button
            type="button"
            className="workflow-node__error-toggle"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            aria-label={expanded ? 'Show less' : 'Show full error'}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>{expanded ? 'less' : 'more'}</span>
          </button>
        )}
      </div>
    </div>
  )
}