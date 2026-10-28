import type { Metadata } from 'next'
import WorkflowEditor from '@/components/workflow/WorkflowEditor'

export const metadata: Metadata = {
  title: 'FlowForge — Workflow Editor',
  description: 'Visual AI workflow execution engine with real-time DAG processing',
}

export default function WorkflowPage() {
  return <WorkflowEditor />
}
