'use client'

import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '@/store/workflowStore'

/**
 * Global keyboard shortcuts for the workflow canvas.
 * Matches Krea.ai-style shortcuts.
 */
export function useKeyboardShortcuts() {
  const { undo, redo } = useWorkflowStore()
  const reactFlowInstance = useReactFlow()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Don't intercept when typing in inputs/textareas
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      const ctrl = e.ctrlKey || e.metaKey

      // ── General ──
      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (ctrl && e.shiftKey && e.key === 'Z') {
        e.preventDefault()
        redo()
        return
      }
      // Ctrl+Z on some keyboards sends key='z' with shift
      if (ctrl && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        redo()
        return
      }

      if (ctrl && e.key === 'a') {
        e.preventDefault()
        // Select all nodes
        const { nodes, setNodes } = useWorkflowStore.getState()
        setNodes(nodes.map((n) => ({ ...n, selected: true })))
        return
      }

      if (e.key === 'Escape') {
        // Deselect all
        const { nodes, edges, setNodes, setEdges } = useWorkflowStore.getState()
        setNodes(nodes.map((n) => ({ ...n, selected: false })))
        setEdges(edges.map((edge) => ({ ...edge, selected: false })))
        return
      }

      // ── Node creation shortcuts ──
      if (!ctrl && !e.shiftKey) {
        const { x, y, zoom } = reactFlowInstance.getViewport()
        const centerX = (-x + window.innerWidth / 2) / zoom
        const centerY = (-y + window.innerHeight / 2) / zoom
        const offset = () => Math.floor(Math.random() * 40) - 20

        switch (e.key.toLowerCase()) {
          case 'n': {
            e.preventDefault()
            const { addNode: add } = useWorkflowStore.getState()
            add('text', { x: centerX + offset(), y: centerY + offset() })
            return
          }
          case 'i': {
            e.preventDefault()
            const { addNode: add } = useWorkflowStore.getState()
            add('upload_image', { x: centerX + offset(), y: centerY + offset() })
            return
          }
          case 'v': {
            e.preventDefault()
            const { addNode: add } = useWorkflowStore.getState()
            add('upload_video', { x: centerX + offset(), y: centerY + offset() })
            return
          }
          case 'l': {
            e.preventDefault()
            const { addNode: add } = useWorkflowStore.getState()
            add('llm', { x: centerX + offset(), y: centerY + offset() })
            return
          }
        }
      }

      // ── Duplicate (Ctrl+D) ──
      if (ctrl && e.key === 'd') {
        e.preventDefault()
        const { nodes } = useWorkflowStore.getState()
        const selected = nodes.filter((n) => n.selected)
        selected.forEach((n) => {
          const { addNode: add } = useWorkflowStore.getState()
          add(n.type ?? 'text', {
            x: n.position.x + 30,
            y: n.position.y + 30,
          }, n.data as Record<string, unknown>)
        })
        return
      }

      // ── Run workflow (Ctrl+Enter) ──
      if (ctrl && e.key === 'Enter') {
        e.preventDefault()
        // Trigger run button click
        const runBtn = document.querySelector('.toolbar__btn--primary') as HTMLButtonElement | null
        runBtn?.click()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, reactFlowInstance])
}
