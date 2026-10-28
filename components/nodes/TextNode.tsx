'use client'

import { memo, useCallback, useState } from 'react'
import { type NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import { useWorkflowStore } from '@/store/workflowStore'
import { Pencil, Copy, Check } from 'lucide-react'

function TextNodeInner(props: NodeProps) {
  const { id, data } = props
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)

  const value = (data.text as string) ?? ''
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(true)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { text: e.target.value })
    },
    [id, updateNodeData],
  )

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [value])

  return (
    <BaseNode {...props}>
      {/* <div className="flex w-full justify-between ">
        <div className="text-neutral-400">Input</div>
        <div className="text-neutral-400">Output</div>
      </div> */}
      <div className="text-node__action-row mt-2">
        <button
          type="button"
          className="wf-icon-btn wf-icon-btn--ghost"
          onClick={() => setEditing((v) => !v)}
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="wf-icon-btn wf-icon-btn--ghost"
          onClick={handleCopy}
          title="Copy"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <textarea
        className="workflow-node__input workflow-node__input--textarea bg-[#171717]"
        placeholder="Write something..."
        value={value}
        onChange={handleChange}
        readOnly={!editing}
      />
    </BaseNode>
  )
}

export const TextNode = memo(TextNodeInner)