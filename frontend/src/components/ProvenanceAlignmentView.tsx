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

import { useMemo, useState, useEffect, useRef, useId } from "react";
import type { Claim, TraceStep, TravelPlan, ScheduleEntry } from "../types/trace";
import type { Diagnosis } from "../types/diagnosis";
import { useSelection } from "../hooks/useSelectionContext";
import { cubicBezierPath } from "../lib/bezier";
import { getClaimColor, PROVENANCE_COLORS } from "../lib/colors";
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
const PM_H = 40;          // matches ConflictGraphView NODE_HEIGHT
const PM_GAP = 6;
const DETAIL_POPOVER_W = 280;
const DETAIL_POPOVER_H = 136;

// ── ID helpers ──
function dayNodeId(day: number): string {
  return `day-${day}`;
}
function schedEntryId(entry: ScheduleEntry): string {
  return `s${entry.day}-${entry.poi.name.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 20)}`;
}
function conflictSchedEntryId(entry: ScheduleEntry): string {
  return `schedule-day${entry.day}-${entry.poi.name.replace(/\s+/g, "-").toLowerCase()}`;
}
function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "\u2026" : s;
}

export function ProvenanceAlignmentView({ claims, steps, diagnoses, plan }: Props) {
  const { selectedClaimId, selectClaim, selectDiagnosis, clearSelection } = useSelection();
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [expandedNode, setExpandedNode] = useState<{
    id: string;
    title: string;
    subtitle: string;
    detail: string;
    accent: string;
    x: number;
    y: number;
  } | null>(null);
  const skipNextClaimEffect = useRef(false);
  const markerSeed = useId().replace(/:/g, "");

  // ── Diagnosis lookups ──
  const diagnosedClaimIds = useMemo(
    () => new Set(diagnoses.map((d) => d.claim.claim_id)),
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
  const dayInfoByNum = useMemo(
    () => new Map(dayGroups.map((dg) => [dg.day, dg])),
    [dayGroups]
  );
  const conflictGraph = useMemo(
    () => (plan ? detectConflicts(plan) : { nodes: [], edges: [] }),
    [plan]
  );
  const conflictScheduleEntryToOurId = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of allEntries) {
      map.set(conflictSchedEntryId(entry), schedEntryId(entry));
    }
    return map;
  }, [allEntries]);
  const conflictScheduleEntryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const edge of conflictGraph.edges) {
      const endpoints = [edge.source, edge.target];
      for (const endpoint of endpoints) {
        if (!endpoint.startsWith("schedule-day") || /^schedule-day\d+$/.test(endpoint)) continue;
        const ourId = conflictScheduleEntryToOurId.get(endpoint);
        if (ourId) ids.add(ourId);
      }
    }
    return ids;
  }, [conflictGraph, conflictScheduleEntryToOurId]);
  const conflictDayIds = useMemo(() => {
    const ids = new Set<number>();
    for (const edge of conflictGraph.edges) {
      const endpoints = [edge.source, edge.target];
      for (const endpoint of endpoints) {
        const m = endpoint.match(/^schedule-day(\d+)$/);
        if (m) ids.add(Number(m[1]));
      }
    }
    return ids;
  }, [conflictGraph]);

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
  const conflictDerivedClaimIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [claimId, scheduleIds] of claimToScheduleMap) {
      if (scheduleIds.some((sid) => conflictScheduleEntryIds.has(sid) || conflictDayIds.has(Number(sid.replace("day-", ""))))) {
        ids.add(claimId);
      }
    }
    return ids;
  }, [claimToScheduleMap, conflictScheduleEntryIds, conflictDayIds]);
  const claimColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const claim of claims) {
      const cid = claim.claim_id;
      if (diagnosedClaimIds.has(cid)) {
        map.set(cid, getClaimColor(cid, diagnosedClaimIds));
      } else if (conflictDerivedClaimIds.has(cid)) {
        map.set(cid, PROVENANCE_COLORS.fabricated);
      } else {
        map.set(cid, PROVENANCE_COLORS.supported);
      }
    }
    return map;
  }, [claims, diagnosedClaimIds, conflictDerivedClaimIds]);

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
      const hasConflict = conflictScheduleEntryIds.has(id);
      map.set(id, hasNote || hasDiag || hasConflict);
    }
    return map;
  }, [allEntries, scheduleToClaimsMap, diagnosedClaimIds, conflictScheduleEntryIds]);

  // ── Which entries are "flagged" (have claims or notes issues) ──
  const shouldShowEntry = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const e of allEntries) {
      const id = schedEntryId(e);
      const linked = scheduleToClaimsMap.get(id) ?? [];
      const hasNote =
        e.notes.includes("HALLUCINATION") ||
        e.notes.toLowerCase().includes("exceeds");
      const hasConflict = conflictScheduleEntryIds.has(id);
      map.set(id, linked.length > 0 || hasNote || hasConflict);
    }
    return map;
  }, [allEntries, scheduleToClaimsMap, conflictScheduleEntryIds]);

  // ── Day error: red if ANY entry is flagged OR day has diagnosed day-level claims ──
  const isDayError = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const dg of dayGroups) {
      const dayLinked = scheduleToClaimsMap.get(dayNodeId(dg.day)) ?? [];
      const hasDayDiag = dayLinked.some((cid) => diagnosedClaimIds.has(cid));
      const hasDayConflict = conflictDayIds.has(dg.day);
      const hasEntryIssue = dg.entries.some(
        (e) => isEntryError.get(schedEntryId(e)) || shouldShowEntry.get(schedEntryId(e))
      );
      map.set(dg.day, hasDayDiag || hasDayConflict || hasEntryIssue);
    }
    return map;
  }, [dayGroups, scheduleToClaimsMap, diagnosedClaimIds, isEntryError, shouldShowEntry, conflictDayIds]);

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
  const claimArrowMarkerByColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const claim of visibleClaims) {
      const color = claimColorMap.get(claim.claim_id) ?? PROVENANCE_COLORS.supported;
      if (!map.has(color)) {
        map.set(color, `${markerSeed}-arrow-claim-sched-${map.size}`);
      }
    }
    return map;
  }, [visibleClaims, claimColorMap, markerSeed]);

  // ── Evidence nodes ──
  const evidenceNodes = useMemo(() => {
    type ENode = {
      id: string;
      type: "tool" | "thought";
      label: string;
      detail: string;
      fullDetail: string;
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
          fullDetail: s.content,
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
          fullDetail: obs?.content ?? s.content,
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
  const profileDetailById = useMemo(() => {
    if (!plan) return new Map<string, string>();
    const p = plan.user_profile;
    return new Map<string, string>([
      ["prof-pace", `Travel pace: ${p.travel_pace}`],
      ["prof-interests", `Interests: ${p.interests.join(", ") || "None"}`],
      ["prof-dietary", `Dietary: ${p.dietary_preferences.join(", ") || "None"}`],
      ["prof-wishlist", `Wishlist POIs: ${p.wishlist_pois.join(", ") || "None"}`],
      ["prof-comment", `Special comments: ${p.special_comments.join(" | ") || "None"}`],
    ]);
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

  // Map our schedEntryId → conflict POI node id (via schedule↔poi conflict edges)
  const ourEntryToConflictPOI = useMemo(() => {
    const map = new Map<string, string>();
    const poiIds = new Set(poiMetaNodes.map((n) => n.id));
    for (const edge of conflictGraph.edges) {
      const endpoints = [edge.source, edge.target];
      const scheduleEndpoint = endpoints.find(
        (id) => id.startsWith("schedule-day") && !/^schedule-day\d+$/.test(id)
      );
      const poiEndpoint = endpoints.find((id) => poiIds.has(id));
      if (!scheduleEndpoint || !poiEndpoint) continue;
      const ourId = conflictScheduleEntryToOurId.get(scheduleEndpoint);
      if (ourId) map.set(ourId, poiEndpoint);
    }
    return map;
  }, [conflictGraph, poiMetaNodes, conflictScheduleEntryToOurId]);

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

  function showNodeDetail(next: {
    id: string;
    title: string;
    subtitle: string;
    detail: string;
    accent: string;
    x: number;
    y: number;
  }) {
    const x = Math.max(8, Math.min(next.x + 12, TOTAL_W - DETAIL_POPOVER_W - 8));
    const y = Math.max(8, Math.min(next.y - 12, totalHeight - DETAIL_POPOVER_H - 8));
    setExpandedNode({ ...next, x, y });
  }

  function hideNodeDetail(id: string) {
    setExpandedNode((prev) => (prev?.id === id ? null : prev));
  }

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
    const primary = claimIds.find((cid) => diagByClaim.has(cid)) ?? null;
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
          Non-conflict Constraint
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <svg width="22" height="12">
            <line x1="0" y1="6" x2="14" y2="6" stroke="#ef4444" strokeWidth="1.5" />
            <line x1="16" y1="3" x2="21" y2="8" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="21" y1="3" x2="16" y2="8" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Conflict
        </span>
        <span style={{ color: "#94a3b8", marginLeft: "4px" }}>Hover any node for details</span>
      </div>

      {/* ── Visualization ── */}
      <div style={{ overflowX: "auto", position: "relative" }}>
        <svg width={TOTAL_W} height={totalHeight} style={{ display: "block" }}>
          <defs>
            {[...claimArrowMarkerByColor.entries()].map(([color, markerId]) => (
              <marker
                key={markerId}
                id={markerId}
                markerWidth="8"
                markerHeight="8"
                refX="7.2"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path
                  d="M0.8,0.8 L7.2,4 L0.8,7.2 L2.4,4 Z"
                  fill={color}
                  stroke={color}
                  strokeWidth={0.5}
                  strokeLinejoin="round"
                />
              </marker>
            ))}
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
            const color = claimColorMap.get(claim.claim_id) ?? PROVENANCE_COLORS.supported;
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
            const visibleSchedIds = selectedScheduleId
              ? schedIds.filter((sid) => sid === selectedScheduleId)
              : schedIds;
            if (visibleSchedIds.length === 0) return null;
            const color = claimColorMap.get(claim.claim_id) ?? PROVENANCE_COLORS.supported;
            const markerId = claimArrowMarkerByColor.get(color);
            const isHl = highlighted?.claimIds.has(claim.claim_id) ?? false;
            const dimmed = highlighted !== null && !isHl;
            return visibleSchedIds.map((sid) => (
              <path key={`cl-sc-${claim.claim_id}-${sid}`}
                d={cubicBezierPath(CL_X + CL_W, cy, SC_X - 6, schedCenterY(sid))}
                fill="none" stroke={color}
                strokeWidth={isHl ? 2 : 1.5}
                opacity={dimmed ? 0.06 : isHl ? 0.85 : 0.45}
                markerEnd={markerId ? `url(#${markerId})` : undefined}
                style={{ transition: "opacity 0.2s" }}
              />
            ));
          })}

          {/* ── Edges: Schedule → User Profile (dashed, fan to horizontal row) ── */}
          {visibleScheduleNodes.map((n) => {
            const sy = schedCenterY(n.id);
            const profIds = scheduleToProfileMap.get(n.id) ?? [];
            const isSelected = selectedScheduleId === n.id;
            const dimmed = highlighted !== null && !isSelected;
            const isConflict = n.isError;
            if (selectedScheduleId && n.id !== selectedScheduleId) return null;
            return profIds.map((pid) => {
              const px = (profileXMap.get(pid) ?? 0) + PROF_NODE_W / 2;
              const py = CONTENT_TOP + PR_H / 2;
              const cx = (SC_X + SC_W + px) / 2;
              const cy = (sy + py) / 2;
              return (
                <g key={`sc-pr-${n.id}-${pid}`}>
                  <path
                    d={cubicBezierPath(SC_X + SC_W, sy, px, py)}
                    fill="none" stroke="#8b5cf6"
                    strokeWidth={isSelected ? 1.5 : 1}
                    strokeDasharray={isConflict ? undefined : "5,3"}
                    strokeOpacity={dimmed ? 0.04 : isSelected ? 0.7 : 0.15}
                    style={{ transition: "stroke-opacity 0.2s" }}
                  />
                  {isConflict && (
                    <g transform={`translate(${cx}, ${cy})`} opacity={dimmed ? 0.04 : isSelected ? 0.7 : 0.4}>
                      <circle cx={0} cy={0} r={6} fill="#ef4444" />
                      <line x1={-2.6} y1={-2.6} x2={2.6} y2={2.6} stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" />
                      <line x1={2.6} y1={-2.6} x2={-2.6} y2={2.6} stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" />
                    </g>
                  )}
                </g>
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
            const cx = (SC_X + SC_W + PM_X) / 2;
            const cy = (sy + py) / 2;
            if (selectedScheduleId && n.id !== selectedScheduleId) return null;
            return (
              <g key={`sc-pm-${n.id}`}>
                <path
                  d={cubicBezierPath(SC_X + SC_W, sy, PM_X, py)}
                  fill="none" stroke={POI_COLORS.border}
                  strokeWidth={isSelected ? 1.5 : 1}
                  strokeOpacity={dimmed ? 0.04 : isSelected ? 0.7 : 0.15}
                  style={{ transition: "stroke-opacity 0.2s" }}
                />
                <g transform={`translate(${cx}, ${cy})`} opacity={dimmed ? 0.04 : isSelected ? 0.7 : 0.4}>
                  <circle cx={0} cy={0} r={6} fill="#ef4444" />
                  <line x1={-2.6} y1={-2.6} x2={2.6} y2={2.6} stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" />
                  <line x1={2.6} y1={-2.6} x2={-2.6} y2={2.6} stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" />
                </g>
              </g>
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
                opacity={dimmed ? 0.2 : 1}
                style={{ transition: "opacity 0.2s", cursor: "pointer" }}
                onMouseEnter={() =>
                  showNodeDetail({
                    id: `ev-${node.id}`,
                    title: `${node.type === "tool" ? "Tool" : "Thought"} Evidence`,
                    subtitle: node.label,
                    detail: node.fullDetail,
                    accent: accent,
                    x: EV_X + EV_W,
                    y: y + h / 2,
                  })
                }
                onMouseLeave={() => hideNodeDetail(`ev-${node.id}`)}>
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
            const color = claimColorMap.get(claim.claim_id) ?? PROVENANCE_COLORS.supported;
            const isHl = highlighted?.claimIds.has(claim.claim_id) ?? false;
            const dimmed = highlighted !== null && !isHl;
            return (
              <g key={claim.claim_id} transform={`translate(${CL_X}, ${y})`}
                opacity={dimmed ? 0.2 : 1}
                style={{ transition: "opacity 0.2s", cursor: "pointer" }}
                onMouseEnter={() =>
                  showNodeDetail({
                    id: `claim-${claim.claim_id}`,
                    title: `Claim ${claim.claim_id.toUpperCase()}`,
                    subtitle: claim.claim_type,
                    detail: claim.text,
                    accent: color,
                    x: CL_X + CL_W,
                    y: y + CL_H / 2,
                  })
                }
                onMouseLeave={() => hideNodeDetail(`claim-${claim.claim_id}`)}>
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
              // Day summary node — "Day X: N entries" + flagged count + chevron
              const isExpanded = expandedDays.has(n.day);
              const flagged = dayFlaggedCount.get(n.day) ?? 0;
              const subtitle = n.isError
                ? flagged > 0 ? `pace issue · ${flagged} flagged` : "conflict detected"
                : flagged > 0 ? `${flagged} flagged entr${flagged === 1 ? "y" : "ies"}` : "all clear";
              return (
                <g key={n.id} transform={`translate(${SC_X}, ${y})`}
                  style={{ cursor: "pointer" }}
                  opacity={dimmed ? 0.2 : 1}
                  onClick={() => handleDayClick(n.day)}
                  onMouseEnter={() => {
                    const info = dayInfoByNum.get(n.day);
                    showNodeDetail({
                      id: `sched-${n.id}`,
                      title: `Day ${n.day} Summary`,
                      subtitle: n.isError ? "Conflict detected" : "No conflict",
                      detail: `Date: ${info?.date ?? "Unknown"}\nEntries: ${n.count}\nFlagged items: ${dayFlaggedCount.get(n.day) ?? 0}`,
                      accent: n.isError ? SCHED_ERROR.border : SCHED_VALID.border,
                      x: SC_X + SC_W,
                      y: y + DAY_H / 2,
                    });
                  }}
                  onMouseLeave={() => hideNodeDetail(`sched-${n.id}`)}>
                  <rect x={0} y={0} width={SC_W} height={DAY_H} rx={6}
                    fill={isExpanded ? (n.isError ? "#fee2e2" : "#dcfce7") : colors.bg}
                    stroke={borderColor} strokeWidth={isExpanded ? 2 : 1} />
                  <rect x={0} y={0} width={5} height={DAY_H} rx={3} fill={colors.badge} />
                  <text x={12} y={DAY_H / 2 - 5} fontSize={12} fontWeight={700} fill={colors.text}>
                    Day {n.day}: {n.count} entries
                  </text>
                  <text x={12} y={DAY_H / 2 + 11} fontSize={9} fill={colors.text} opacity={0.75}>
                    {subtitle}
                  </text>
                  {/* Expand/collapse chevron */}
                  <text x={SC_W - 16} y={DAY_H / 2 + 5} fontSize={13} fill={colors.badge} textAnchor="middle">
                    {isExpanded ? "▾" : "▸"}
                  </text>
                </g>
              );
            } else {
              // Individual entry node — "DayX HH:MM" + POI name
              return (
                <g key={n.id} transform={`translate(${SC_X + ENTRY_INDENT}, ${y})`}
                  style={{ cursor: "pointer" }}
                  opacity={dimmed ? 0.2 : 1}
                  onClick={() => handleEntryClick(n.id)}
                  onMouseEnter={() => {
                    showNodeDetail({
                      id: `sched-${n.id}`,
                      title: n.entry.poi.name,
                      subtitle: `Day ${n.day} ${n.entry.start_time.slice(0, 5)}-${n.entry.end_time.slice(0, 5)}`,
                      detail: `Category: ${n.entry.poi.category}\nAddress: ${n.entry.poi.address}\nNotes: ${n.entry.notes || "None"}`,
                      accent: n.isError ? SCHED_ERROR.border : SCHED_VALID.border,
                      x: SC_X + SC_W - ENTRY_INDENT,
                      y: y + SC_H / 2,
                    });
                  }}
                  onMouseLeave={() => hideNodeDetail(`sched-${n.id}`)}>
                  <rect x={0} y={0} width={SC_W - ENTRY_INDENT} height={SC_H} rx={6}
                    fill={isSelected ? (n.isError ? "#fee2e2" : "#dcfce7") : colors.bg}
                    stroke={borderColor} strokeWidth={isSelected ? 2 : 1} />
                  <rect x={0} y={0} width={5} height={SC_H} rx={3} fill={colors.badge} />
                  <text x={12} y={SC_H / 2 - 4} fontSize={12} fontWeight={700} fill={colors.text}>
                    Day{n.day} {n.entry.start_time.slice(0, 5)}
                  </text>
                  <text x={12} y={SC_H / 2 + 12} fontSize={9} fill="#64748b">
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
                opacity={dimmed ? 0.2 : 1}
                style={{ transition: "opacity 0.2s", cursor: "pointer" }}
                onMouseEnter={() =>
                  showNodeDetail({
                    id: `profile-${node.id}`,
                    title: node.label,
                    subtitle: "User Profile",
                    detail: profileDetailById.get(node.id) ?? node.detail,
                    accent: "#8b5cf6",
                    x: x + PROF_NODE_W,
                    y: CONTENT_TOP + PR_H / 2,
                  })
                }
                onMouseLeave={() => hideNodeDetail(`profile-${node.id}`)}>
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
                opacity={dimmed ? 0.2 : 1}
                style={{ transition: "opacity 0.2s", cursor: "pointer" }}
                onMouseEnter={() =>
                  showNodeDetail({
                    id: `poi-${poiNode.id}`,
                    title: poiNode.label,
                    subtitle: "POI Metadata",
                    detail: poiNode.detail,
                    accent: POI_COLORS.border,
                    x: PM_X + PM_W,
                    y: y + PM_H / 2,
                  })
                }
                onMouseLeave={() => hideNodeDetail(`poi-${poiNode.id}`)}>
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
        {expandedNode && (
          <div
            style={{
              position: "absolute",
              left: `${expandedNode.x}px`,
              top: `${expandedNode.y}px`,
              width: `${DETAIL_POPOVER_W}px`,
              border: `1px solid ${expandedNode.accent}`,
              borderLeftWidth: "4px",
              borderRadius: "8px",
              background: "#f8fafc",
              padding: "10px 12px",
              zIndex: 10,
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.16)",
              pointerEvents: "none",
            }}
          >
            <div>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>{expandedNode.title}</div>
                <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>{expandedNode.subtitle}</div>
              </div>
            </div>
            <div style={{ marginTop: "6px", fontSize: "11px", color: "#334155", whiteSpace: "pre-wrap" }}>
              {expandedNode.detail}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
