import { diffLines, diffWords } from 'diff'

export interface WordChange {
  value: string
  type: 'added' | 'removed' | 'common'
}

export interface DiffLine {
  type: 'added' | 'removed' | 'context'
  text: string
  lineNo: string
  words?: WordChange[]
}

/**
 * Compute a line-level diff with optional word-level highlighting
 * for paired removed→added line changes.
 *
 * Uses `diffLines` for structural hunks, then `diffWords` on adjacent
 * removed/added line pairs to produce fine-grained change spans.
 */
export function computeLineDiffWithWordHighlights(oldStr: string, newStr: string): DiffLine[] {
  const hunks = diffLines(oldStr, newStr)

  // First pass: build raw line entries
  const rawLines: Array<{ type: 'added' | 'removed' | 'context'; text: string }> = []

  for (const hunk of hunks) {
    const hunkLines = hunk.value.replace(/\n$/, '').split('\n')
    for (const line of hunkLines) {
      if (hunk.removed) {
        rawLines.push({ type: 'removed', text: line })
      } else if (hunk.added) {
        rawLines.push({ type: 'added', text: line })
      } else {
        rawLines.push({ type: 'context', text: line })
      }
    }
  }

  // Second pass: pair adjacent removed→added runs and compute word-level diffs
  const lines: DiffLine[] = []
  let oldLine = 1
  let newLine = 1
  let i = 0

  while (i < rawLines.length) {
    const raw = rawLines[i]

    if (raw.type === 'context') {
      lines.push({ type: 'context', text: raw.text, lineNo: String(newLine) })
      oldLine++
      newLine++
      i++
      continue
    }

    // Collect a run of removals followed by additions
    const removals: string[] = []
    while (i < rawLines.length && rawLines[i].type === 'removed') {
      removals.push(rawLines[i].text)
      i++
    }

    const additions: string[] = []
    while (i < rawLines.length && rawLines[i].type === 'added') {
      additions.push(rawLines[i].text)
      i++
    }

    // For paired lines, compute word-level diffs
    const pairedCount = Math.min(removals.length, additions.length)

    for (let p = 0; p < pairedCount; p++) {
      const wordChanges = diffWords(removals[p], additions[p])

      const removedWords: WordChange[] = []
      const addedWords: WordChange[] = []

      for (const wc of wordChanges) {
        if (wc.removed) {
          removedWords.push({ value: wc.value, type: 'removed' })
          // In the added line, this word is gone (represented by added words)
        } else if (wc.added) {
          addedWords.push({ value: wc.value, type: 'added' })
        } else {
          removedWords.push({ value: wc.value, type: 'common' })
          addedWords.push({ value: wc.value, type: 'common' })
        }
      }

      lines.push({
        type: 'removed',
        text: removals[p],
        lineNo: String(oldLine++),
        words: removedWords,
      })
      lines.push({
        type: 'added',
        text: additions[p],
        lineNo: String(newLine++),
        words: addedWords,
      })
    }

    // Unpaired removals (no corresponding addition)
    for (let p = pairedCount; p < removals.length; p++) {
      lines.push({ type: 'removed', text: removals[p], lineNo: String(oldLine++) })
    }

    // Unpaired additions (no corresponding removal)
    for (let p = pairedCount; p < additions.length; p++) {
      lines.push({ type: 'added', text: additions[p], lineNo: String(newLine++) })
    }
  }

  return lines
}

/**
 * Safely extract Edit tool arguments from an unknown input.
 * Handles both parsed objects and JSON string formats.
 */
export function extractEditToolArgs(
  args: unknown
): { oldStr: string; newStr: string; filePath?: string } | null {
  let obj: Record<string, unknown>

  if (typeof args === 'string') {
    try {
      obj = JSON.parse(args) as Record<string, unknown>
    } catch {
      return null
    }
  } else if (args && typeof args === 'object' && !Array.isArray(args)) {
    obj = args as Record<string, unknown>
  } else {
    return null
  }

  const oldStr = obj.old_string
  const newStr = obj.new_string

  if (typeof oldStr !== 'string' || typeof newStr !== 'string') {
    return null
  }

  return {
    oldStr,
    newStr,
    filePath: typeof obj.file_path === 'string' ? obj.file_path : undefined,
  }
}

/**
 * Safely extract Write tool arguments from an unknown input.
 * Handles both parsed objects and JSON string formats.
 */
export function extractWriteToolContent(
  args: unknown
): { content: string; filePath?: string } | null {
  let obj: Record<string, unknown>

  if (typeof args === 'string') {
    try {
      obj = JSON.parse(args) as Record<string, unknown>
    } catch {
      return null
    }
  } else if (args && typeof args === 'object' && !Array.isArray(args)) {
    obj = args as Record<string, unknown>
  } else {
    return null
  }

  const content = obj.content

  if (typeof content !== 'string') {
    return null
  }

  return {
    content,
    filePath: typeof obj.file_path === 'string' ? obj.file_path : undefined,
  }
}
