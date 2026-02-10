import type { PaneNode } from '@/store/paneTypes'

/**
 * Compute the snapped position for a 1D divider drag.
 *
 * Algorithm:
 * 1. If shiftHeld or snapThreshold === 0, return currentPercent (bypass)
 * 2. Collect all snap targets: [originalPercent, ...collinearPositions]
 * 3. Find the closest target within snapThreshold
 * 4. If found, return that target; otherwise return currentPercent
 *
 * @param currentPercent - The divider's current position in %
 * @param originalPercent - Where the divider started before this drag
 * @param collinearPositions - Positions of other bars of the same orientation (in %)
 * @param snapThreshold - Snap distance in % of smallest container dimension
 * @param shiftHeld - If true, bypass all snapping
 * @returns The snapped position (same as currentPercent if no snap)
 */
export function snap1D(
  currentPercent: number,
  originalPercent: number,
  collinearPositions: number[],
  snapThreshold: number,
  shiftHeld: boolean,
): number {
  if (shiftHeld || snapThreshold === 0) {
    return currentPercent
  }

  const targets = [originalPercent, ...collinearPositions]

  let bestTarget: number | null = null
  let bestDistance = Infinity

  for (const target of targets) {
    const distance = Math.abs(currentPercent - target)
    if (distance <= snapThreshold && distance < bestDistance) {
      bestDistance = distance
      bestTarget = target
    }
  }

  return bestTarget !== null ? bestTarget : currentPercent
}

/**
 * Collect sizes[0] from all splits of the given orientation in the pane tree,
 * excluding the split being dragged. These serve as snap targets for 1D snapping.
 *
 * This traverses the entire tree and collects sizes[0] from every split node
 * whose direction matches the given orientation, except for the excluded split.
 * This means a horizontal bar at 60% will snap to ANY other horizontal bar
 * also near 60%, regardless of nesting depth - which is desirable behavior
 * for aligning bars across the layout.
 *
 * @param root - The root pane node of the layout tree
 * @param orientation - The orientation to match ('horizontal' or 'vertical')
 * @param excludeSplitId - The id of the split being dragged (to exclude from results)
 * @returns Array of sizes[0] values from matching splits
 */
export function collectSameOrientationSizes(
  root: PaneNode,
  orientation: 'horizontal' | 'vertical',
  excludeSplitId: string,
): number[] {
  const results: number[] = []
  collectRecursive(root, orientation, excludeSplitId, results)
  return results
}

function collectRecursive(
  node: PaneNode,
  orientation: 'horizontal' | 'vertical',
  excludeSplitId: string,
  results: number[],
): void {
  if (node.type === 'leaf') return

  if (node.direction === orientation && node.id !== excludeSplitId) {
    results.push(node.sizes[0])
  }

  collectRecursive(node.children[0], orientation, excludeSplitId, results)
  collectRecursive(node.children[1], orientation, excludeSplitId, results)
}

// ── 2D Intersection Snapping ──────────────────────────────────────────

/**
 * Compute the snapped position for a 2D intersection drag.
 *
 * Each axis is independently snapped to its original coordinate when
 * within the snap threshold. This allows the user to constrain movement
 * to a single axis while dragging freely on the other.
 *
 * @param currentX - Current X position (pixels)
 * @param currentY - Current Y position (pixels)
 * @param originalX - Original X position at drag start (pixels)
 * @param originalY - Original Y position at drag start (pixels)
 * @param snapThreshold - Snap distance in pixels
 * @param shiftHeld - If true, bypass all snapping
 * @returns The snapped {x, y} position
 */
export function snap2D(
  currentX: number,
  currentY: number,
  originalX: number,
  originalY: number,
  snapThreshold: number,
  shiftHeld: boolean,
): { x: number; y: number } {
  if (shiftHeld || snapThreshold === 0) return { x: currentX, y: currentY }
  return {
    x: Math.abs(currentX - originalX) <= snapThreshold ? originalX : currentX,
    y: Math.abs(currentY - originalY) <= snapThreshold ? originalY : currentY,
  }
}

/**
 * A divider bar segment with absolute pixel coordinates within the container.
 *
 * For a **horizontal** split (left|right children), the divider bar runs
 * vertically. Its `position` is the X coordinate, and `start`/`end` are
 * Y coordinates.
 *
 * For a **vertical** split (top|bottom children), the divider bar runs
 * horizontally. Its `position` is the Y coordinate, and `start`/`end` are
 * X coordinates.
 */
export interface DividerSegment {
  splitId: string
  direction: 'horizontal' | 'vertical'
  /** Absolute pixel position along the perpendicular axis */
  position: number
  /** Start pixel along the bar's own axis */
  start: number
  /** End pixel along the bar's own axis */
  end: number
}

/**
 * A point where two or more divider bars cross or meet.
 */
export interface Intersection {
  /** Pixel X within the container */
  x: number
  /** Pixel Y within the container */
  y: number
  /** Split IDs that meet at this intersection */
  splitIds: string[]
}

/**
 * Traverse the pane tree and compute the absolute pixel position of every
 * divider bar segment.
 *
 * @param root - Root node of the pane layout tree
 * @param containerWidth - Container width in pixels
 * @param containerHeight - Container height in pixels
 * @returns Array of DividerSegment with absolute pixel positions
 */
export function computeDividerSegments(
  root: PaneNode,
  containerWidth: number,
  containerHeight: number,
): DividerSegment[] {
  const segments: DividerSegment[] = []
  computeSegmentsRecursive(root, 0, 0, containerWidth, containerHeight, segments)
  return segments
}

function computeSegmentsRecursive(
  node: PaneNode,
  left: number,
  top: number,
  width: number,
  height: number,
  segments: DividerSegment[],
): void {
  if (node.type === 'leaf') return

  if (node.direction === 'horizontal') {
    // Horizontal split: left|right children, vertical divider bar
    const dividerX = left + (node.sizes[0] / 100) * width
    segments.push({
      splitId: node.id,
      direction: 'horizontal',
      position: dividerX,
      start: top,
      end: top + height,
    })

    // Left child bounds
    const leftWidth = (node.sizes[0] / 100) * width
    computeSegmentsRecursive(node.children[0], left, top, leftWidth, height, segments)

    // Right child bounds
    const rightWidth = (node.sizes[1] / 100) * width
    computeSegmentsRecursive(node.children[1], dividerX, top, rightWidth, height, segments)
  } else {
    // Vertical split: top|bottom children, horizontal divider bar
    const dividerY = top + (node.sizes[0] / 100) * height
    segments.push({
      splitId: node.id,
      direction: 'vertical',
      position: dividerY,
      start: left,
      end: left + width,
    })

    // Top child bounds
    const topHeight = (node.sizes[0] / 100) * height
    computeSegmentsRecursive(node.children[0], left, top, width, topHeight, segments)

    // Bottom child bounds
    const bottomHeight = (node.sizes[1] / 100) * height
    computeSegmentsRecursive(node.children[1], left, dividerY, width, bottomHeight, segments)
  }
}

/**
 * Find all points where divider bar segments cross or meet.
 *
 * Two segments of **different** directions intersect when:
 * - The horizontal-split segment's X position falls within the vertical-split
 *   segment's X range (start..end)
 * - The vertical-split segment's Y position falls within the horizontal-split
 *   segment's Y range (start..end)
 *
 * When multiple pairs produce the same intersection point, they are merged
 * into a single Intersection with all involved splitIds.
 *
 * @param segments - Array of DividerSegment to check for crossings
 * @returns Array of Intersection points
 */
export function findIntersections(segments: DividerSegment[]): Intersection[] {
  const intersectionMap = new Map<string, Intersection>()

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i]
      const b = segments[j]

      // Only different directions can intersect
      if (a.direction === b.direction) continue

      // Determine which is the horizontal-split (vertical bar) and vertical-split (horizontal bar)
      const hSeg = a.direction === 'horizontal' ? a : b // vertical bar, position is X
      const vSeg = a.direction === 'vertical' ? a : b   // horizontal bar, position is Y

      // hSeg: vertical bar at X = hSeg.position, spanning Y = hSeg.start..hSeg.end
      // vSeg: horizontal bar at Y = vSeg.position, spanning X = vSeg.start..vSeg.end

      const x = hSeg.position
      const y = vSeg.position

      // Check if x falls within vSeg's X range and y falls within hSeg's Y range
      if (
        x >= vSeg.start && x <= vSeg.end &&
        y >= hSeg.start && y <= hSeg.end
      ) {
        const key = `${x},${y}`
        const existing = intersectionMap.get(key)
        if (existing) {
          // Merge splitIds
          if (!existing.splitIds.includes(hSeg.splitId)) {
            existing.splitIds.push(hSeg.splitId)
          }
          if (!existing.splitIds.includes(vSeg.splitId)) {
            existing.splitIds.push(vSeg.splitId)
          }
        } else {
          intersectionMap.set(key, {
            x,
            y,
            splitIds: [hSeg.splitId, vSeg.splitId],
          })
        }
      }
    }
  }

  return Array.from(intersectionMap.values())
}
