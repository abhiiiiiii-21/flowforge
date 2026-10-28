const MAX_SHORT_LENGTH = 120

export function shortenError(input: string): string {
  if (!input) return ''
  let msg = input.trim()

  const jsonStart = msg.indexOf('{')
  if (jsonStart > 0 && msg.endsWith('}')) {
    const head = msg.slice(0, jsonStart).trim().replace(/[:\-]\s*$/, '')
    if (head) msg = head
  }

  const firstLine = msg.split(/\r?\n/, 1)[0].trim()
  if (firstLine) msg = firstLine

  msg = msg.replace(/^(Error|TypeError|RangeError|SyntaxError):\s*/i, '')

  if (msg.length > MAX_SHORT_LENGTH) {
    msg = msg.slice(0, MAX_SHORT_LENGTH - 1).trimEnd() + '…'
  }
  return msg
}