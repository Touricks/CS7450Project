/**
 * View 1: Pipeline Flow Visualization
 *
 * Left-to-right flow pipeline:
 *   Evidence Sources → Agent Claims → Generated Schedule → User Profile
 *                                                        → POI Metadata
 *
 * Schedule column uses a ConflictGraphView-style collapsed layout:
 *   - One day-summary node per day (shows entry count, day-level error)
 *   - Individual entry nodes only for entries with POI-specific claims or notes conflicts
 *   - Valid entries with no claims are absorbed into the day summary
 *
 * This means supported (green) claims correctly point to green individual
 * entry nodes (e.g. c1 → Golden Gate Bridge Welcome Center).
 *
 * React renders all SVG. D3 computes path geometry only.
 */

import { useMemo, useState, useEffect, useRef } from "react";
import type { Claim, TraceStep, TravelPlan, ScheduleEntry } from "../types/trace";
import type { Diagnosis } from "../types/diagnosis";
import { useSelection } from "../hooks/useSelectionContext";
import { cubicBezierPath } from "../lib/bezier";
import { getClaimColor } from "../lib/colors";
import { detectConflicts } from "../lib/conflictDetection";

interface Props {
  claims: Claim[];
  steps: TraceStep[];
  diagnoses: Diagnosis[];
  plan: TravelPlan | null;
}

// ── Layout constants ──
const PAD = 16;
const EV_W = 148;
const CL_W = 150;
const SC_W = 170;
const PROF_NODE_W = 108;   // profile nodes laid out horizontally
const PROF_GAP = 8;
const UP_W = 5 * PROF_NODE_W + 4 * PROF_GAP;  // 572 – total profile row width
const PM_W = 145;
const COL_GAP = 60;
const RIGHT_GAP = 52;
const RIGHT_COL_GAP = 28;

const EV_X = PAD;
const CL_X = EV_X + EV_W + COL_GAP;
const SC_X = CL_X + CL_W + COL_GAP;
const UP_X = SC_X + SC_W + RIGHT_GAP;
const PM_X = UP_X + UP_W + RIGHT_COL_GAP;
const TOTAL_W = PM_X + PM_W + PAD;

const HEADER_H = 16;
const CONTENT_TOP = PAD + HEADER_H + 10;
// Schedule and POI nodes start below the profile row (PR_H=40 + 14px gap)
const SCHED_TOP = CONTENT_TOP + 54;

// Node heights + gaps
const EV_TOOL_H = 44;
const EV_THOUGHT_H = 28;
const EV_GAP = 4;
const CL_H = 48;
const CL_GAP = 4;

// Schedule: day-summary nodes vs. individual entry nodes
// Colors mirror ConflictGraphView's schedule lane
const SCHED_VALID = { bg: "#ecfdf5", border: "#10b981", text: "#065f46", badge: "#10b981" };
const SCHED_ERROR = { bg: "#fef2f2", border: "#ef4444", text: "#991b1b", badge: "#ef4444" };
// POI metadata colors mirror ConflictGraphView's poi lane
const POI_COLORS  = { bg: "#f0f9ff", border: "#0ea5e9", text: "#0369a1", badge: "#0ea5e9" };

const DAY_H = 64;
const DAY_GAP = 6;
const SC_H = 60;
const SC_GAP = 4;
const ENTRY_INDENT = 0;
const INTER_DAY_GAP = 10;

const PR_H = 40;
const PR_GAP = 0;  // profile nodes are horizontal — no vertical gap needed
const PM_H = 40;          // matches ConflictGraphView NODE_HEIGHT
const PM_GAP = 6;

// ── SVG icon helpers for schedule nodes ──
function CalendarIcon({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <>
      <rect x={cx - 9} y={cy - 8} width={18} height={16} rx={2} fill="none" stroke={color} strokeWidth={1.5} />
      <line x1={cx - 9} y1={cy - 3} x2={cx + 9} y2={cy - 3} stroke={color} strokeWidth={1} />
      <line x1={cx - 3} y1={cy - 11} x2={cx - 3} y2={cy - 8} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={cx + 3} y1={cy - 11} x2={cx + 3} y2={cy - 8} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={cx - 4} cy={cy + 4} r={1.5} fill={color} />
      <circle cx={cx} cy={cy + 4} r={1.5} fill={color} />
      <circle cx={cx + 4} cy={cy + 4} r={1.5} fill={color} />
    </>
  );
}
function LocationIcon({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <>
      <circle cx={cx} cy={cy - 3} r={6} fill="none" stroke={color} strokeWidth={1.5} />
      <circle cx={cx} cy={cy - 3} r={2} fill={color} />
      <line x1={cx} y1={cy + 3} x2={cx} y2={cy + 8} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </>
  );
}
function ForkIcon({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <>
      <line x1={cx - 4} y1={cy - 9} x2={cx - 4} y2={cy + 9} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <path d={`M${cx - 6},${cy - 9} a6,5 0 0 1 12,0`} fill="none" stroke={color} strokeWidth={1.5} />
      <line x1={cx + 4} y1={cy - 9} x2={cx + 4} y2={cy + 9} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </>
  );
}
function ClockIcon({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={9} fill="none" stroke={color} strokeWidth={1.5} />
      <line x1={cx} y1={cy} x2={cx} y2={cy - 5} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx + 4} y2={cy + 2} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </>
  );
}
function CategoryIcon({ category, cx, cy, color }: { category: string; cx: number; cy: number; color: string }) {
  if (category === "restaurant") return <ForkIcon cx={cx} cy={cy} color={color} />;
  if (category === "nature" || category === "landmark" || category === "attraction") return <LocationIcon cx={cx} cy={cy} color={color} />;
  return <ClockIcon cx={cx} cy={cy} color={color} />;
}

// ── ID helpers ──
function dayNodeId(day: number): string {
  return `day-${day}`;
}
function schedEntryId(entry: ScheduleEntry): string {
  return `s${entry.day}-${entry.poi.name.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 20)}`;
}
function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "\u2026" : s;
}

export function ProvenanceAlignmentView({ claims, steps, diagnoses, plan }: Props) {
  const { selectedClaimId, selectClaim, selectDiagnosis, clearSelection } = useSelection();
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const skipNextClaimEffect = useRef(false);

  // ── Diagnosis lookups ──
  const diagnosedClaimIds = useMemo(
    () => new Set(diagnoses.map((d) => d.claim.claim_id)),
    [diagnoses]
  );
  const mechanismMap = useMemo(
    () => new Map<string, string>(diagnoses.map((d) => [d.claim.claim_id, d.mechanism])),
    [diagnoses]
  );
  const diagByClaim = useMemo(
    () => new Map(diagnoses.map((d) => [d.claim.claim_id, d])),
    [diagnoses]
  );

  // ── Day groups ──
  const dayGroups = useMemo(() => {
    if (!plan) return [];
    return plan.daily_schedules.map((ds) => ({
      day: ds.entries[0]?.day ?? 0,
      date: ds.date,
      entries: ds.entries,
    }));
  }, [plan]);

  const allEntries = useMemo(
    () => dayGroups.flatMap((dg) => dg.entries),
    [dayGroups]
  );

  // ── Schedule→Claims mapping ──
  // Day-level claims (c4 pattern: entities.day but no poi_name) → day summary node
  // Entry-level claims (poi_name, entry_a/b, missing) → individual entry node
  const scheduleToClaimsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dg of dayGroups) {
      map.set(dayNodeId(dg.day), []);
      for (const e of dg.entries) map.set(schedEntryId(e), []);
    }

    for (const claim of claims) {
      const ents = claim.extracted_entities;
      const matched = new Set<string>();

      // Day-level: has day, no poi_name → maps to day summary
      if (typeof ents.day === "number" && !ents.poi_name) {
        matched.add(dayNodeId(ents.day as number));
      }

      // Entry-level: poi_name direct match
      if (typeof ents.poi_name === "string") {
        for (const e of allEntries) {
          if (e.poi.name === ents.poi_name) matched.add(schedEntryId(e));
        }
      }

      // entry_a.poi + entry_b.poi (schedule_time claims, e.g. c5)
      const ea = ents.entry_a as Record<string, unknown> | undefined;
      const eb = ents.entry_b as Record<string, unknown> | undefined;
      if (ea && typeof ea.poi === "string") {
        for (const e of allEntries) {
          if (e.poi.name === ea.poi) matched.add(schedEntryId(e));
        }
      }
      if (eb && typeof eb.poi === "string") {
        for (const e of allEntries) {
          if (e.poi.name === eb.poi) matched.add(schedEntryId(e));
        }
      }

      // missing POI (c7 pattern)
      if (typeof ents.missing === "string") {
        for (const e of allEntries) {
          if (e.poi.name === ents.missing) matched.add(schedEntryId(e));
        }
      }

      for (const id of matched) map.get(id)?.push(claim.claim_id);
    }
    return map;
  }, [dayGroups, allEntries, claims]);

  // ── Claim → Schedule (reverse) ──
  const claimToScheduleMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [sid, cids] of scheduleToClaimsMap) {
      for (const cid of cids) {
        if (!map.has(cid)) map.set(cid, []);
        map.get(cid)!.push(sid);
      }
    }
    return map;
  }, [scheduleToClaimsMap]);

  // ── Individual entry error: entry-specific issues only (not day-level c4) ──
  const isEntryError = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const e of allEntries) {
      const id = schedEntryId(e);
      const linked = scheduleToClaimsMap.get(id) ?? [];
      const hasNote =
        e.notes.includes("HALLUCINATION") ||
        e.notes.toLowerCase().includes("exceeds");
      const hasDiag = linked.some((cid) => diagnosedClaimIds.has(cid));
      map.set(id, hasNote || hasDiag);
    }
    return map;
  }, [allEntries, scheduleToClaimsMap, diagnosedClaimIds]);

  // ── Which entries are "flagged" (have claims or notes issues) ──
  const shouldShowEntry = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const e of allEntries) {
      const id = schedEntryId(e);
      const linked = scheduleToClaimsMap.get(id) ?? [];
      const hasNote =
        e.notes.includes("HALLUCINATION") ||
        e.notes.toLowerCase().includes("exceeds");
      map.set(id, linked.length > 0 || hasNote);
    }
    return map;
  }, [allEntries, scheduleToClaimsMap]);

  // ── Day error: red if ANY entry is flagged OR day has diagnosed day-level claims ──
  const isDayError = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const dg of dayGroups) {
      const dayLinked = scheduleToClaimsMap.get(dayNodeId(dg.day)) ?? [];
      const hasDayDiag = dayLinked.some((cid) => diagnosedClaimIds.has(cid));
      const hasEntryIssue = dg.entries.some(
        (e) => isEntryError.get(schedEntryId(e)) || shouldShowEntry.get(schedEntryId(e))
      );
      map.set(dg.day, hasDayDiag || hasEntryIssue);
    }
    return map;
  }, [dayGroups, scheduleToClaimsMap, diagnosedClaimIds, isEntryError, shouldShowEntry]);

  type SchedNode =
    | { kind: "day"; id: string; day: number; count: number; isError: boolean }
    | { kind: "entry"; id: string; day: number; entry: ScheduleEntry; isError: boolean };

  // Count of flagged entries per day (for day summary subtitle)
  const dayFlaggedCount = useMemo(() => {
    const map = new Map<number, number>();
    for (const dg of dayGroups) {
      const n = dg.entries.filter((e) => shouldShowEntry.get(schedEntryId(e))).length;
      map.set(dg.day, n);
    }
    return map;
  }, [dayGroups, shouldShowEntry]);

  // ── Visible schedule nodes ──
  // All day summaries always show. When a day is expanded, ALL entries appear below it.
  const visibleScheduleNodes = useMemo((): SchedNode[] => {
    const nodes: SchedNode[] = [];
    for (const dg of dayGroups) {
      const isError = isDayError.get(dg.day) ?? false;
      nodes.push({ kind: "day", id: dayNodeId(dg.day), day: dg.day, count: dg.entries.length, isError });
      if (expandedDays.has(dg.day)) {
        const sorted = [...dg.entries].sort((a, b) => a.start_time.localeCompare(b.start_time));
        for (const e of sorted) {
          nodes.push({
            kind: "entry",
            id: schedEntryId(e),
            day: dg.day,
            entry: e,
            isError: isEntryError.get(schedEntryId(e)) ?? false,
          });
        }
      }
    }
    return nodes;
  }, [dayGroups, isDayError, isEntryError, expandedDays]);

  // ── Visible claims: derived from visible schedule nodes ──
  const visibleClaimIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of visibleScheduleNodes) {
      (scheduleToClaimsMap.get(n.id) ?? []).forEach((cid) => ids.add(cid));
    }
    return ids;
  }, [visibleScheduleNodes, scheduleToClaimsMap]);

  const visibleClaims = useMemo(
    () => claims.filter((c) => visibleClaimIds.has(c.claim_id)),
    [claims, visibleClaimIds]
  );

  // ── Evidence nodes ──
  const evidenceNodes = useMemo(() => {
    type ENode = {
      id: string;
      type: "tool" | "thought";
      label: string;
      detail: string;
      stepIds: number[];
    };
    const nodes: ENode[] = [];
    let i = 0;
    while (i < steps.length) {
      const s = steps[i];
      if (s.step_type === "thought") {
        nodes.push({
          id: `ev-t${s.step_id}`,
          type: "thought",
          label: "Thought",
          detail: trunc(s.content, 52),
          stepIds: [s.step_id],
        });
        i++;
      } else if (s.step_type === "action" && s.tool_name) {
        const obs =
          i + 1 < steps.length && steps[i + 1].step_type === "observation"
            ? steps[i + 1]
            : null;
        nodes.push({
          id: `ev-${s.tool_name}`,
          type: "tool",
          label: s.tool_name,
          detail: `conf: ${(obs ?? s).confidence.toFixed(2)}`,
          stepIds: obs ? [s.step_id, obs.step_id] : [s.step_id],
        });
        i += obs ? 2 : 1;
      } else {
        i++;
      }
    }
    return nodes;
  }, [steps]);

  // ── Profile nodes ──
  const profileNodes = useMemo(() => {
    if (!plan) return [];
    const p = plan.user_profile;
    const paceMax =
      ({ slow: 3, moderate: 5, fast: 7 } as Record<string, number>)[p.travel_pace] ?? 5;
    const nodes = [
      { id: "prof-pace", label: `Pace: ${p.travel_pace}`, detail: `Max ${paceMax} POIs/day` },
      { id: "prof-interests", label: "Interests", detail: trunc(p.interests.join(", "), 24) },
      { id: "prof-dietary", label: "Dietary", detail: trunc(p.dietary_preferences.join(", "), 24) },
      { id: "prof-wishlist", label: "Wishlist POIs", detail: `${p.wishlist_pois.length} must-see places` },
    ];
    if (p.special_comments.length > 0) {
      nodes.push({ id: "prof-comment", label: "Comment", detail: trunc(p.special_comments[0], 26) });
    }
    return nodes;
  }, [plan]);

  // ── Schedule → Profile mapping ──
  const scheduleToProfileMap = useMemo(() => {
    if (!plan) return new Map<string, string[]>();
    const p = plan.user_profile;
    const paceMax =
      ({ slow: 3, moderate: 5, fast: 7 } as Record<string, number>)[p.travel_pace] ?? 5;
    const wishSet = new Set(p.wishlist_pois);
    const dayCount = new Map<number, number>();
    for (const dg of dayGroups) dayCount.set(dg.day, dg.entries.length);

    const map = new Map<string, string[]>();

    // Day summary nodes
    for (const dg of dayGroups) {
      const profIds: string[] = [];
      if ((dayCount.get(dg.day) ?? 0) > paceMax) profIds.push("prof-pace");
      map.set(dayNodeId(dg.day), profIds);
    }

    // Individual entry nodes
    for (const e of allEntries) {
      const profIds: string[] = [];
      const cat = e.poi.category;
      if (
        (cat === "nature" && p.interests.includes("nature")) ||
        (cat === "restaurant" && p.interests.includes("food")) ||
        ((cat === "museum" || cat === "attraction") && p.interests.includes("history"))
      )
        profIds.push("prof-interests");
      if (cat === "restaurant") profIds.push("prof-dietary");
      if (wishSet.has(e.poi.name)) profIds.push("prof-wishlist");
      if (p.special_comments.length > 0 && e.day >= 3) profIds.push("prof-comment");
      map.set(schedEntryId(e), profIds);
    }
    return map;
  }, [dayGroups, allEntries, plan]);

  // ── Y positions ──
  const evidenceYMap = useMemo(() => {
    const map = new Map<string, number>();
    let y = SCHED_TOP;
    for (const n of evidenceNodes) {
      map.set(n.id, y);
      y += (n.type === "tool" ? EV_TOOL_H : EV_THOUGHT_H) + EV_GAP;
    }
    return map;
  }, [evidenceNodes]);

  const stepToEvY = useMemo(() => {
    const map = new Map<number, number>();
    for (const n of evidenceNodes) {
      const y = evidenceYMap.get(n.id);
      if (y === undefined) continue;
      const h = n.type === "tool" ? EV_TOOL_H : EV_THOUGHT_H;
      for (const sid of n.stepIds) map.set(sid, y + h / 2);
    }
    return map;
  }, [evidenceNodes, evidenceYMap]);

  const claimYMap = useMemo(() => {
    const map = new Map<string, number>();
    let y = SCHED_TOP;
    for (const c of visibleClaims) {
      map.set(c.claim_id, y + CL_H / 2);
      y += CL_H + CL_GAP;
    }
    return map;
  }, [visibleClaims]);

  // Schedule Y positions — start below the profile row
  const scheduleYMap = useMemo(() => {
    const map = new Map<string, number>();
    let y = SCHED_TOP;
    let lastDay = -1;

    for (const n of visibleScheduleNodes) {
      if (n.kind === "day") {
        if (lastDay !== -1) y += INTER_DAY_GAP;
        map.set(n.id, y);
        y += DAY_H + DAY_GAP;
        lastDay = n.day;
      } else {
        map.set(n.id, y);
        y += SC_H + SC_GAP;
      }
    }
    return map;
  }, [visibleScheduleNodes]);

  // Helper: center Y of a schedule node (accounts for day vs entry height)
  function schedCenterY(id: string): number {
    const y = scheduleYMap.get(id) ?? 0;
    return id.startsWith("day-") ? y + DAY_H / 2 : y + SC_H / 2;
  }

  // Profile nodes spread horizontally — all at the same Y (CONTENT_TOP), varying X
  const profileXMap = useMemo(() => {
    const map = new Map<string, number>();
    profileNodes.forEach((n, i) => {
      map.set(n.id, UP_X + i * (PROF_NODE_W + PROF_GAP));
    });
    return map;
  }, [profileNodes]);

  // ── Conflict graph: POI metadata nodes from detectConflicts ──
  const conflictGraph = useMemo(() => detectConflicts(plan), [plan]);

  const poiMetaNodes = useMemo(
    () => conflictGraph.nodes.filter((n) => n.class === "poi"),
    [conflictGraph]
  );

  const poiMetaYMap = useMemo(() => {
    const map = new Map<string, number>();
    let y = SCHED_TOP;
    for (const n of poiMetaNodes) {
      map.set(n.id, y);
      y += PM_H + PM_GAP;
    }
    return map;
  }, [poiMetaNodes]);

  // Map our schedEntryId → conflict POI node id (via hours_mismatch edges)
  const ourEntryToConflictPOI = useMemo(() => {
    const map = new Map<string, string>();
    const poiById = new Map(poiMetaNodes.map((n) => [n.id, n]));
    for (const edge of conflictGraph.edges) {
      if (edge.type !== "hours_mismatch") continue;
      const poiNode = poiById.get(edge.source);
      if (!poiNode) continue;
      for (const e of allEntries) {
        if (e.poi.name === poiNode.label) {
          map.set(schedEntryId(e), poiNode.id);
        }
      }
    }
    return map;
  }, [conflictGraph, poiMetaNodes, allEntries]);

  // ── Highlight state ──
  const highlighted = useMemo(() => {
    if (!selectedScheduleId) return null;
    const claimIds = new Set(scheduleToClaimsMap.get(selectedScheduleId) ?? []);
    const profileIds = new Set(scheduleToProfileMap.get(selectedScheduleId) ?? []);
    const stepIds = new Set<number>();
    for (const cid of claimIds) {
      const c = claims.find((x) => x.claim_id === cid);
      if (c) c.source_step_ids.forEach((sid) => stepIds.add(sid));
    }
    const evIds = new Set<string>();
    for (const n of evidenceNodes) {
      if (n.stepIds.some((sid) => stepIds.has(sid))) evIds.add(n.id);
    }
    return {
      claimIds,
      profileIds,
      evIds,
      poiMetaId: ourEntryToConflictPOI.get(selectedScheduleId) ?? null,
    };
  }, [selectedScheduleId, scheduleToClaimsMap, scheduleToProfileMap, claims, evidenceNodes]);

  // ── Click handlers ──
  function handleDayClick(day: number) {
    const isCollapsing = expandedDays.has(day);
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
    // Deselect any child entry that was selected when collapsing
    if (isCollapsing && selectedScheduleId?.startsWith(`s${day}-`)) {
      setSelectedScheduleId(null);
      skipNextClaimEffect.current = true;
      clearSelection();
    }
  }

  function handleEntryClick(id: string) {
    skipNextClaimEffect.current = true;
    if (selectedScheduleId === id) {
      setSelectedScheduleId(null);
      clearSelection();
      return;
    }
    setSelectedScheduleId(id);
    const claimIds = scheduleToClaimsMap.get(id) ?? [];
    let primary: string | null = null;
    let best = 4;
    for (const cid of claimIds) {
      const diag = diagByClaim.get(cid);
      if (diag) {
        const sev = ({ high: 0, medium: 1, low: 2 } as Record<string, number>)[diag.severity] ?? 3;
        if (sev < best) { best = sev; primary = cid; }
      }
    }
    if (primary) {
      selectClaim(primary);
      const d = diagByClaim.get(primary);
      if (d) selectDiagnosis(d.diagnosis_id, d.causal_chain);
    } else {
      clearSelection();
    }
  }

  // ── Bidirectional: react to external selectedClaimId changes (from DiagnosticSummaryPanel) ──
  useEffect(() => {
    if (skipNextClaimEffect.current) {
      skipNextClaimEffect.current = false;
      return;
    }
    if (!selectedClaimId) {
      setSelectedScheduleId(null);
      return;
    }
    const schedIds = claimToScheduleMap.get(selectedClaimId) ?? [];
    // Prefer an entry node over a day node
    const targetId = schedIds.find((id) => !id.startsWith("day-")) ?? schedIds[0] ?? null;
    if (!targetId) return;
    // Expand the containing day if needed
    const match = targetId.match(/^s(\d+)-/);
    if (match) {
      const day = parseInt(match[1], 10);
      setExpandedDays((prev) => {
        if (prev.has(day)) return prev;
        const next = new Set(prev);
        next.add(day);
        return next;
      });
    }
    setSelectedScheduleId(targetId);
  }, [selectedClaimId, claimToScheduleMap]);

  // ── SVG dimensions ──
  const evColH = evidenceNodes.reduce(
    (s, n) => s + (n.type === "tool" ? EV_TOOL_H : EV_THOUGHT_H) + EV_GAP,
    0
  );
  const clColH = visibleClaims.length * (CL_H + CL_GAP);
  const scColBottom =
    visibleScheduleNodes.length > 0
      ? (() => {
          const last = visibleScheduleNodes[visibleScheduleNodes.length - 1];
          const y = scheduleYMap.get(last.id) ?? SCHED_TOP;
          return y + (last.kind === "day" ? DAY_H : SC_H);
        })()
      : SCHED_TOP + 80;
  const pmColH = poiMetaNodes.length * (PM_H + PM_GAP);
  const totalHeight =
    Math.max(SCHED_TOP + evColH, SCHED_TOP + clColH, scColBottom, CONTENT_TOP + PR_H, SCHED_TOP + pmColH) + PAD;

  if (!plan) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: "#94a3b8", fontSize: "14px" }}>
        No travel plan available
      </div>
    );
  }

  return (
    <div>
      {/* ── Legend ── */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "8px", fontSize: "10px", color: "#64748b", flexWrap: "wrap", alignItems: "center" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#22c55e", marginRight: 3, verticalAlign: "middle" }} />Valid</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#ef4444", marginRight: 3, verticalAlign: "middle" }} />Error</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#8b5cf6", marginRight: 3, verticalAlign: "middle" }} />User Profile</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#0ea5e9", marginRight: 3, verticalAlign: "middle" }} />POI Metadata</span>
        <span style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
          <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="#94a3b8" strokeWidth="1.5" /></svg>
          Provenance
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,2" /></svg>
          Constraint
        </span>
        <span style={{ color: "#94a3b8", marginLeft: "4px" }}>Click a schedule item to explore</span>
      </div>

      {/* ── Visualization ── */}
      <div style={{ overflowX: "auto" }}>
        <svg width={TOTAL_W} height={totalHeight} style={{ display: "block" }}>
          <defs>
            <marker id="arrow-claim-sched" markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 z" fill="context-stroke" />
            </marker>
          </defs>

          {/* ── Column headers ── */}
          {/* User Profile label sits above its row at the very top */}
          <text x={UP_X + UP_W / 2} y={PAD + 13} textAnchor="middle" fontSize={11} fontWeight={600} fill="#7c3aed">User Profile</text>
          {/* Content-column labels all align just above SCHED_TOP */}
          <text x={EV_X + EV_W / 2} y={SCHED_TOP - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="#64748b">Evidence Sources</text>
          <text x={CL_X + CL_W / 2} y={SCHED_TOP - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="#64748b">Agent Claims</text>
          <text x={SC_X + SC_W / 2} y={SCHED_TOP - 8} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1e293b">Generated Schedule</text>
          <text x={PM_X + PM_W / 2} y={SCHED_TOP - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0369a1">POI Metadata</text>

          {/* ── Edges: Evidence → Claims (solid) ── */}
          {visibleClaims.map((claim) => {
            const cy = claimYMap.get(claim.claim_id);
            if (cy === undefined) return null;
            const color = getClaimColor(claim.claim_id, diagnosedClaimIds, mechanismMap);
            const isHl = highlighted?.claimIds.has(claim.claim_id) ?? false;
            const dimmed = highlighted !== null && !isHl;
            return claim.source_step_ids.map((sid) => {
              const ey = stepToEvY.get(sid);
              if (ey === undefined) return null;
              return (
                <path key={`ev-cl-${claim.claim_id}-${sid}`}
                  d={cubicBezierPath(EV_X + EV_W, ey, CL_X, cy)}
                  fill="none" stroke={color}
                  strokeWidth={isHl ? 2 : 1.5}
                  strokeOpacity={dimmed ? 0.06 : isHl ? 0.85 : 0.45}
                  style={{ transition: "stroke-opacity 0.2s" }}
                />
              );
            });
          })}

          {/* ── Edges: Claims → Schedule (solid + arrow) ── */}
          {visibleClaims.map((claim) => {
            const cy = claimYMap.get(claim.claim_id);
            if (cy === undefined) return null;
            const schedIds = (claimToScheduleMap.get(claim.claim_id) ?? []).filter(
              (sid) => scheduleYMap.has(sid)
            );
            const color = getClaimColor(claim.claim_id, diagnosedClaimIds, mechanismMap);
            const isHl = highlighted?.claimIds.has(claim.claim_id) ?? false;
            const dimmed = highlighted !== null && !isHl;
            return schedIds.map((sid) => (
              <path key={`cl-sc-${claim.claim_id}-${sid}`}
                d={cubicBezierPath(CL_X + CL_W, cy, SC_X - 6, schedCenterY(sid))}
                fill="none" stroke={color}
                strokeWidth={isHl ? 2 : 1.5}
                strokeOpacity={dimmed ? 0.06 : isHl ? 0.85 : 0.45}
                markerEnd="url(#arrow-claim-sched)"
                style={{ transition: "stroke-opacity 0.2s" }}
              />
            ));
          })}

          {/* ── Edges: Schedule → User Profile (dashed, fan to horizontal row) ── */}
          {visibleScheduleNodes.map((n) => {
            const sy = schedCenterY(n.id);
            const profIds = scheduleToProfileMap.get(n.id) ?? [];
            const isSelected = selectedScheduleId === n.id;
            const dimmed = highlighted !== null && !isSelected;
            return profIds.map((pid) => {
              const px = (profileXMap.get(pid) ?? 0) + PROF_NODE_W / 2;
              const py = CONTENT_TOP + PR_H / 2;
              return (
                <path key={`sc-pr-${n.id}-${pid}`}
                  d={cubicBezierPath(SC_X + SC_W, sy, px, py)}
                  fill="none" stroke="#8b5cf6"
                  strokeWidth={isSelected ? 1.5 : 1}
                  strokeDasharray="5,3"
                  strokeOpacity={dimmed ? 0.04 : isSelected ? 0.7 : 0.15}
                  style={{ transition: "stroke-opacity 0.2s" }}
                />
              );
            });
          })}

          {/* ── Edges: Schedule entry → POI Metadata (dashed, conflict-matched entries only) ── */}
          {visibleScheduleNodes.filter((n) => n.kind === "entry" && ourEntryToConflictPOI.has(n.id)).map((n) => {
            const sy = schedCenterY(n.id);
            const poiId = ourEntryToConflictPOI.get(n.id)!;
            const py = (poiMetaYMap.get(poiId) ?? 0) + PM_H / 2;
            const isSelected = selectedScheduleId === n.id;
            const dimmed = highlighted !== null && !isSelected;
            return (
              <path key={`sc-pm-${n.id}`}
                d={cubicBezierPath(SC_X + SC_W, sy, PM_X, py)}
                fill="none" stroke={POI_COLORS.border}
                strokeWidth={isSelected ? 1.5 : 1}
                strokeDasharray="5,3"
                strokeOpacity={dimmed ? 0.04 : isSelected ? 0.7 : 0.15}
                style={{ transition: "stroke-opacity 0.2s" }}
              />
            );
          })}

          {/* ── Evidence Nodes ── */}
          {evidenceNodes.map((node) => {
            const y = evidenceYMap.get(node.id);
            if (y === undefined) return null;
            const h = node.type === "tool" ? EV_TOOL_H : EV_THOUGHT_H;
            const isHl = highlighted?.evIds.has(node.id) ?? false;
            const dimmed = highlighted !== null && !isHl;
            const isTool = node.type === "tool";
            const accent = isTool ? "#6366f1" : "#94a3b8";
            return (
              <g key={node.id} transform={`translate(${EV_X}, ${y})`}
                opacity={dimmed ? 0.2 : 1} style={{ transition: "opacity 0.2s" }}>
                <rect x={0} y={0} width={EV_W} height={h} rx={5}
                  fill={isHl ? (isTool ? "#eef2ff" : "#f8fafc") : "#fafafa"}
                  stroke={isHl ? accent : "#e2e8f0"} strokeWidth={isHl ? 1.5 : 1} />
                <rect x={0} y={0} width={4} height={h} rx={2} fill={accent} />
                {isTool ? (
                  <>
                    <text x={10} y={17} fontSize={11} fontWeight={700} fill={accent}>{trunc(node.label, 19)}</text>
                    <text x={10} y={33} fontSize={9} fill="#64748b">{node.detail}</text>
                  </>
                ) : (
                  <text x={10} y={18} fontSize={9} fontStyle="italic" fill={accent}>{trunc(node.detail, 26)}</text>
                )}
              </g>
            );
          })}

          {/* ── Claim Nodes (not clickable) ── */}
          {visibleClaims.map((claim) => {
            const cy = claimYMap.get(claim.claim_id);
            if (cy === undefined) return null;
            const y = cy - CL_H / 2;
            const color = getClaimColor(claim.claim_id, diagnosedClaimIds, mechanismMap);
            const isHl = highlighted?.claimIds.has(claim.claim_id) ?? false;
            const dimmed = highlighted !== null && !isHl;
            return (
              <g key={claim.claim_id} transform={`translate(${CL_X}, ${y})`}
                opacity={dimmed ? 0.2 : 1} style={{ transition: "opacity 0.2s" }}>
                <rect x={0} y={0} width={CL_W} height={CL_H} rx={5}
                  fill={isHl ? "#f0f9ff" : "#fafafa"}
                  stroke={isHl ? color : "#e2e8f0"} strokeWidth={isHl ? 1.5 : 1} />
                <rect x={0} y={0} width={4} height={CL_H} rx={2} fill={color} />
                <text x={10} y={16} fontSize={10} fontWeight={700} fill={color}>{claim.claim_id.toUpperCase()}</text>
                <text x={10} y={30} fontSize={9} fill="#334155">{trunc(claim.text, 24)}</text>
                <text x={10} y={43} fontSize={8} fill="#94a3b8">{claim.claim_type}</text>
              </g>
            );
          })}

          {/* ── Schedule Nodes (clickable) ── */}
          {visibleScheduleNodes.map((n) => {
            const y = scheduleYMap.get(n.id);
            if (y === undefined) return null;
            const isSelected = selectedScheduleId === n.id;
            const dimmed = highlighted !== null && !isSelected;
            const colors = n.isError ? SCHED_ERROR : SCHED_VALID;
            const borderColor = isSelected ? "#3b82f6" : colors.border;

            if (n.kind === "day") {
              // Day summary node — calendar icon + "Day X: N entries" + flagged count + chevron
              const iCx = 22; const iCy = DAY_H / 2;
              const isExpanded = expandedDays.has(n.day);
              const flagged = dayFlaggedCount.get(n.day) ?? 0;
              const subtitle = n.isError
                ? flagged > 0 ? `pace issue · ${flagged} flagged` : "exceeds pace cap"
                : flagged > 0 ? `${flagged} flagged entr${flagged === 1 ? "y" : "ies"}` : "all clear";
              return (
                <g key={n.id} transform={`translate(${SC_X}, ${y})`}
                  style={{ cursor: "pointer" }}
                  opacity={dimmed ? 0.2 : 1}
                  onClick={() => handleDayClick(n.day)}>
                  <rect x={0} y={0} width={SC_W} height={DAY_H} rx={6}
                    fill={isExpanded ? (n.isError ? "#fee2e2" : "#dcfce7") : colors.bg}
                    stroke={borderColor} strokeWidth={isExpanded ? 2 : 1} />
                  <rect x={0} y={0} width={5} height={DAY_H} rx={3} fill={colors.badge} />
                  <CalendarIcon cx={iCx} cy={iCy} color={colors.badge} />
                  <text x={42} y={DAY_H / 2 - 5} fontSize={12} fontWeight={700} fill={colors.text}>
                    Day {n.day}: {n.count} entries
                  </text>
                  <text x={42} y={DAY_H / 2 + 11} fontSize={9} fill={colors.text} opacity={0.75}>
                    {subtitle}
                  </text>
                  {/* Expand/collapse chevron */}
                  <text x={SC_W - 16} y={DAY_H / 2 + 5} fontSize={13} fill={colors.badge} textAnchor="middle">
                    {isExpanded ? "▾" : "▸"}
                  </text>
                </g>
              );
            } else {
              // Individual entry node — category icon + "DayX HH:MM" + POI name
              const iCx = 22; const iCy = SC_H / 2;
              return (
                <g key={n.id} transform={`translate(${SC_X + ENTRY_INDENT}, ${y})`}
                  style={{ cursor: "pointer" }}
                  opacity={dimmed ? 0.2 : 1}
                  onClick={() => handleEntryClick(n.id)}>
                  <rect x={0} y={0} width={SC_W - ENTRY_INDENT} height={SC_H} rx={6}
                    fill={isSelected ? (n.isError ? "#fee2e2" : "#dcfce7") : colors.bg}
                    stroke={borderColor} strokeWidth={isSelected ? 2 : 1} />
                  <rect x={0} y={0} width={5} height={SC_H} rx={3} fill={colors.badge} />
                  <CategoryIcon category={n.entry.poi.category} cx={iCx} cy={iCy} color={colors.badge} />
                  <text x={42} y={SC_H / 2 - 4} fontSize={12} fontWeight={700} fill={colors.text}>
                    Day{n.day} {n.entry.start_time.slice(0, 5)}
                  </text>
                  <text x={42} y={SC_H / 2 + 12} fontSize={9} fill="#64748b">
                    {trunc(n.entry.poi.name, 20)}
                  </text>
                </g>
              );
            }
          })}

          {/* ── User Profile Nodes (horizontal row, not clickable) ── */}
          {profileNodes.map((node) => {
            const x = profileXMap.get(node.id);
            if (x === undefined) return null;
            const isHl = highlighted?.profileIds.has(node.id) ?? false;
            const dimmed = highlighted !== null && !isHl;
            return (
              <g key={node.id} transform={`translate(${x}, ${CONTENT_TOP})`}
                opacity={dimmed ? 0.2 : 1} style={{ transition: "opacity 0.2s" }}>
                <rect x={0} y={0} width={PROF_NODE_W} height={PR_H} rx={5}
                  fill={isHl ? "#f5f3ff" : "#fdf4ff"}
                  stroke={isHl ? "#7c3aed" : "#d8b4fe"} strokeWidth={isHl ? 1.5 : 1} />
                <rect x={0} y={0} width={4} height={PR_H} rx={2} fill="#8b5cf6" />
                <text x={10} y={16} fontSize={9} fontWeight={600} fill="#7c3aed">{trunc(node.label, 14)}</text>
                <text x={10} y={29} fontSize={8} fill="#64748b">{trunc(node.detail, 16)}</text>
              </g>
            );
          })}

          {/* ── POI Metadata Nodes (conflict-detected, not clickable) ── */}
          {poiMetaNodes.map((poiNode) => {
            const y = poiMetaYMap.get(poiNode.id);
            if (y === undefined) return null;
            const isHl = highlighted?.poiMetaId === poiNode.id;
            const dimmed = highlighted !== null && !isHl;
            return (
              <g key={poiNode.id} transform={`translate(${PM_X}, ${y})`}
                opacity={dimmed ? 0.2 : 1} style={{ transition: "opacity 0.2s" }}>
                <rect x={0} y={0} width={PM_W} height={PM_H} rx={4}
                  fill={isHl ? POI_COLORS.bg : "#f0f9ff"}
                  stroke={isHl ? POI_COLORS.border : "#bae6fd"} strokeWidth={isHl ? 1.5 : 1} />
                <rect x={0} y={0} width={4} height={PM_H} rx={2} fill={POI_COLORS.badge} />
                <text x={10} y={17} fontSize={10} fontWeight={600} fill={POI_COLORS.text}>{trunc(poiNode.label, 17)}</text>
                <text x={10} y={30} fontSize={8} fill="#64748b">{trunc(poiNode.detail, 22)}</text>
              </g>
            );
          })}
        </svg>
      </div>

    </div>
  );
}
