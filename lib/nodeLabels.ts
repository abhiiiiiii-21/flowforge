export const NODE_LABELS: Record<string, string> = {
  text: 'Text Node',
  upload_image: 'Image Node',
  upload_video: 'Video Node',
  llm: 'LLM Node',
  crop_image: 'Crop Image',
  extract_frame: 'Extract Frame',
}

export function labelForNodeType(type: string | undefined | null): string {
  if (!type) return 'Node'
  return NODE_LABELS[type] ?? type
}