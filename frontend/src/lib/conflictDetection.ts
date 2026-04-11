/**
 * Client-side conflict detection between UserProfile, POI metadata, and Schedule.
 *
 * Pure functions — no side effects, no D3, no React.
 */

import type { TravelPlan } from "../types/trace";

/* ── Node & Edge types ── */

export type NodeClass = "profile" | "poi" | "schedule";

export type ConflictType =
  | "pace_violation"
  | "hours_mismatch"
  | "dietary_conflict"
  | "comment_violation"
  | "consecutive_dining";

export interface ConflictNode {
  id: string;
  class: NodeClass;
  label: string;
  detail: string;
  field: string;
}

export interface ConflictEdge {
  id: string;
  source: string; // node ID
  target: string; // node ID
  type: ConflictType;
  description: string;
  relatedClaimId?: string;
}

export interface ConflictGraph {
  nodes: ConflictNode[];
  edges: ConflictEdge[];
}

export const CONFLICT_COLORS: Record<ConflictType, string> = {
  pace_violation: "#ef4444",
  hours_mismatch: "#f97316",
  dietary_conflict: "#8b5cf6",
  comment_violation: "#dc2626",
  consecutive_dining: "#f59e0b",
};

export const CONFLICT_LABELS: Record<ConflictType, string> = {
  pace_violation: "Pace Violation",
  hours_mismatch: "Hours Mismatch",
  dietary_conflict: "Dietary Conflict",
  comment_violation: "Comment Violation",
  consecutive_dining: "Consecutive Dining",
};

/* ── Pace limits (mirrored from Python PACE_LIMITS) ── */

const PACE_LIMITS: Record<string, number> = {
  slow: 3,
  moderate: 5,
  fast: 7,
};

/* ── Helpers ── */

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function parseHoursRange(range: string): { open: number; close: number } | null {
  // Format: "09:00-17:00" or "11:30-15:00,17:00-21:00"
  const parts = range.split(",");
  if (parts.length === 0) return null;
  const first = parts[0].trim().split("-");
  const last = parts[parts.length - 1].trim().split("-");
  if (first.length < 2 || last.length < 2) return null;
  const open = timeToMinutes(first[0]);
  let close = timeToMinutes(last[1]);
  // Treat "00:00" closing as midnight (end of day)
  if (close === 0) close = 1440;
  return { open, close };
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][d.getDay()];
}

/* ── Main detection function ── */

export function detectConflicts(plan: TravelPlan): ConflictGraph {
  const nodes: ConflictNode[] = [];
  const edges: ConflictEdge[] = [];
  const nodeIds = new Set<string>();

  function addNode(node: ConflictNode) {
    if (!nodeIds.has(node.id)) {
      nodes.push(node);
      nodeIds.add(node.id);
    }
  }

  const profile = plan.user_profile;
  const paceLimit = PACE_LIMITS[profile.travel_pace] ?? 5;

  // ── 1. Pace violations ──
  const paceNodeId = `profile-pace`;
  for (const day of plan.daily_schedules) {
    const count = day.entries.length;
    if (count > paceLimit) {
      addNode({
        id: paceNodeId,
        class: "profile",
        label: `Pace: ${profile.travel_pace}`,
        detail: `Max ${paceLimit} POIs/day`,
        field: "travel_pace",
      });
      const dayNum = day.entries[0]?.day ?? 0;
      const schedNodeId = `schedule-day${dayNum}`;
      addNode({
        id: schedNodeId,
        class: "schedule",
        label: `Day ${dayNum}: ${count} entries`,
        detail: `${count} entries (exceeds ${paceLimit})`,
        field: "day_summary",
      });
      edges.push({
        id: `edge-pace-day${dayNum}`,
        source: paceNodeId,
        target: schedNodeId,
        type: "pace_violation",
        description: `Day ${dayNum} has ${count} entries but ${profile.travel_pace} pace allows max ${paceLimit}`,
        relatedClaimId: "c4",
      });
    }
  }

  // ── 2. Hours mismatches ──
  // Sample data stores opening_hours with a single day key (e.g. {"friday": "08:00-17:00"}).
  // Try computed day-of-week first, fall back to any available hours entry.
  for (const day of plan.daily_schedules) {
    const dow = getDayOfWeek(day.date);
    for (const entry of day.entries) {
      const hoursEntries = Object.entries(entry.poi.opening_hours);
      if (hoursEntries.length === 0) continue;

      // Prefer the computed day; fall back to the first available hours entry
      const hoursStr = entry.poi.opening_hours[dow] ?? hoursEntries[0]?.[1];
      const hoursDay = entry.poi.opening_hours[dow] ? dow : hoursEntries[0]?.[0] ?? dow;
      if (!hoursStr) continue;
      const hours = parseHoursRange(hoursStr);
      if (!hours) continue;

      const entryStart = timeToMinutes(entry.start_time.slice(0, 5));
      const entryEnd = timeToMinutes(entry.end_time.slice(0, 5));

      if (entryStart < hours.open || entryEnd > hours.close) {
        const poiNodeId = `poi-${entry.poi.name.replace(/\s+/g, "-").toLowerCase()}`;
        addNode({
          id: poiNodeId,
          class: "poi",
          label: entry.poi.name,
          detail: `Hours: ${hoursStr} (${hoursDay})`,
          field: "opening_hours",
        });
        const schedNodeId = `schedule-day${entry.day}-${entry.poi.name.replace(/\s+/g, "-").toLowerCase()}`;
        addNode({
          id: schedNodeId,
          class: "schedule",
          label: `Day${entry.day} ${entry.start_time.slice(0, 5)}`,
          detail: `${entry.poi.name} ${entry.start_time.slice(0, 5)}-${entry.end_time.slice(0, 5)}`,
          field: "schedule_entry",
        });
        edges.push({
          id: `edge-hours-${poiNodeId}-${schedNodeId}`,
          source: poiNodeId,
          target: schedNodeId,
          type: "hours_mismatch",
          description: `${entry.poi.name} is open ${hoursStr} but scheduled ${entry.start_time.slice(0, 5)}-${entry.end_time.slice(0, 5)}`,
        });
      }
    }
  }

  // ── 3. Consecutive dining ──
  for (const day of plan.daily_schedules) {
    const restaurants = day.entries.filter((e) => e.poi.category === "restaurant");
    for (let i = 0; i < restaurants.length - 1; i++) {
      const a = restaurants[i];
      const b = restaurants[i + 1];
      const aEnd = timeToMinutes(a.end_time.slice(0, 5));
      const bStart = timeToMinutes(b.start_time.slice(0, 5));
      // Back-to-back if gap <= 0 minutes
      if (bStart <= aEnd) {
        const aId = `schedule-day${a.day}-${a.poi.name.replace(/\s+/g, "-").toLowerCase()}`;
        const bId = `schedule-day${b.day}-${b.poi.name.replace(/\s+/g, "-").toLowerCase()}`;
        addNode({
          id: aId,
          class: "schedule",
          label: `Day${a.day} ${a.poi.name}`,
          detail: `${a.start_time.slice(0, 5)}-${a.end_time.slice(0, 5)} (restaurant)`,
          field: "schedule_entry",
        });
        addNode({
          id: bId,
          class: "schedule",
          label: `Day${b.day} ${b.poi.name}`,
          detail: `${b.start_time.slice(0, 5)}-${b.end_time.slice(0, 5)} (restaurant)`,
          field: "schedule_entry",
        });
        edges.push({
          id: `edge-dining-${aId}-${bId}`,
          source: aId,
          target: bId,
          type: "consecutive_dining",
          description: `${a.poi.name} and ${b.poi.name} are back-to-back restaurants on Day ${a.day}`,
          relatedClaimId: "c5",
        });
      }
    }
  }

  // ── 4. Special comment violations ──
  const comments = profile.special_comments ?? [];
  for (const comment of comments) {
    // Parse "rest day after day N" pattern
    const restMatch = comment.match(/rest.*(?:day|after)\s+day\s*(\d+)/i);
    if (restMatch) {
      const afterDay = parseInt(restMatch[1], 10);
      const commentNodeId = `profile-comment-${afterDay}`;

      // Check if any day after afterDay has entries — only add nodes when violation found
      for (const day of plan.daily_schedules) {
        const dayNum = day.entries[0]?.day ?? 0;
        if (dayNum > afterDay && day.entries.length > 0) {
          addNode({
            id: commentNodeId,
            class: "profile",
            label: "Special Comment",
            detail: comment,
            field: "special_comments",
          });
          const schedNodeId = `schedule-day${dayNum}`;
          addNode({
            id: schedNodeId,
            class: "schedule",
            label: `Day ${dayNum}: ${day.entries.length} entries`,
            detail: `${day.entries.length} entries scheduled`,
            field: "day_summary",
          });
          edges.push({
            id: `edge-comment-day${dayNum}`,
            source: commentNodeId,
            target: schedNodeId,
            type: "comment_violation",
            description: `User requested "${comment}" but Day ${dayNum} has ${day.entries.length} entries`,
          });
        }
      }
    }
  }

  return { nodes, edges };
}
