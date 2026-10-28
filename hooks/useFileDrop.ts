'use client'

import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '@/store/workflowStore'

/**
 * Handles file drag-and-drop onto the canvas.
 * Creates upload_image or upload_video nodes at the drop position.
 * Per design.md §16.
 */
export function useFileDrop() {
  const reactFlowInstance = useReactFlow()
  const addNode = useWorkflowStore((s) => s.addNode)

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const files = Array.from(event.dataTransfer.files)
      if (files.length === 0) {
        // This might be a node palette drag, not a file drop
        return
      }

      // Convert screen position to canvas position
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileType = file.type

        let nodeType: string | null = null

        if (fileType.startsWith('image/')) {
          nodeType = 'upload_image'
        } else if (fileType.startsWith('video/')) {
          nodeType = 'upload_video'
        }

        if (!nodeType) continue

        // No blob URLs — Transloadit's response is the single source of truth
        // for previewUrl. The node consumes pendingFile and uploads it.
        const offsetPosition = {
          x: position.x + i * 20,
          y: position.y + i * 20,
        }

        addNode(nodeType, offsetPosition, {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          pendingFile: file,
        })
      }
    },
    [reactFlowInstance, addNode]
  )

  return { onDragOver, onDrop }
}