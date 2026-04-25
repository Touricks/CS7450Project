/**
 * Bezier curve path generation for the Provenance Alignment View.
 *
 * Uses D3 as a pure math library — computes path strings that React
 * renders via <path d={...} />. No DOM manipulation.
 */

/** Generate a cubic Bezier SVG path string between two points. */
export function cubicBezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}
