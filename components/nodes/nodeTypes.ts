import { TextNode } from './TextNode'
import { UploadImageNode } from './UploadImageNode'
import { UploadVideoNode } from './UploadVideoNode'
import { LLMNode } from './LLMNode'
import { CropImageNode } from './CropImageNode'
import { ExtractFrameNode } from './ExtractFrameNode'

/**
 * Node type registry for ReactFlow.
 * Maps node type strings to their React components.
 */
export const nodeTypes = {
  text: TextNode,
  upload_image: UploadImageNode,
  upload_video: UploadVideoNode,
  llm: LLMNode,
  crop_image: CropImageNode,
  extract_frame: ExtractFrameNode,
} as const
