# Constraint Conflict Graph — Design Spec

## Problem

The current visualization shows claims linked to trace steps (provenance) and diagnosis details, but does not show **structural conflicts** between the three core data domains: UserProfile constraints, POI metadata, and Schedule entries. Users need a way to see at a glance which user preferences or POI attributes are violated by the generated schedule.

## Design Decisions

- **Graph layout**: Three-Lane Layered — three vertical columns, one per node class
- **Placement**: Tab in the left panel alongside Provenance Alignment View
- **Conflict detection**: Client-side, computed from the `TravelPlan` embedded in `ExecutionTrace`
- **Rendering**: React SVG with D3 math (consistent with project conventions)

## Node Classes

### UserProfile Nodes

Each relevant field from `UserProfile` becomes a node:

| Field | Node Label | Conflict Check |
|-------|-----------|----------------|
| `travel_pace` | "Pace: moderate (max 5/day)" | Compare pace limit vs daily entry count |
| `dietary_preferences` | "Diet: no-spicy" | Compare against POI category/notes |
| `special_comments[]` | "Comment: rest after day 3" | Parse for day references, check schedule |
| `interests[]` | "Interest: nature" | (informational, no conflict edge) |

### POI Metadata Nodes

Each POI referenced in the schedule becomes a node:

| Field | Node Label | Conflict Check |
|-------|-----------|----------------|
| `opening_hours` | "Tartine: closes 17:00" | Compare against schedule entry time |
| `category` | "Sotto Mare: restaurant" | Check consecutive same-category |
| `avg_visit_duration_min` | "Alcatraz: 180min" | Compare against scheduled duration |

Only POIs involved in a conflict are shown (non-conflicting POIs are omitted to reduce clutter).

### Schedule Nodes

Each `DaySchedule` or individual `ScheduleEntry` that participates in a conflict:

| Field | Node Label | Conflict Check |
|-------|-----------|----------------|
| Day summary | "Day 1: 7 entries" | Pace violation |
| Entry | "Day2 18:30 Tartine dinner" | Hours violation |
| Entry pair | "Day1 Swan+Sotto lunch" | Consecutive dining |

## Conflict Edge Types

| ID | From | To | Detection Rule | Color |
|----|------|----|---------------|-------|
| `pace_violation` | UserProfile.travel_pace | Schedule.DayN | `entries.length > PACE_LIMITS[pace]` | `#ef4444` (red) |
| `hours_mismatch` | POI.opening_hours | Schedule.entry | Entry time outside POI hours | `#f97316` (orange) |
| `dietary_conflict` | UserProfile.dietary_preferences | POI.category/notes | Preference mismatch | `#8b5cf6` (purple) |
| `comment_violation` | UserProfile.special_comments | Schedule.DayN | Comment constraint violated | `#dc2626` (dark red) |
| `consecutive_dining` | Schedule.entryA | Schedule.entryB | Two restaurants back-to-back | `#f59e0b` (amber) |

Edges are rendered as dashed lines with a conflict-type icon at the midpoint.

## Data Model Changes

### Python: `src/agent/models.py`

Add to `UserProfile`:

```python
special_comments: list[str] = Field(
    default_factory=list,
    description="Free-text constraints, e.g. 'rest day after day 3'",
)
```

### TypeScript: `frontend/src/types/trace.ts`

Add to `TravelPlan.user_profile`:

```typescript
special_comments: string[];
```

### Sample Data

Update `assets/data/sample_traces/sf_trip_hallucinated.json` to include:

```json
"special_comments": ["Take a rest day after day 3"]
```

Update `assets/data/sample_profiles/sf_traveler.yaml` to include:

```yaml
special_comments:
  - "Take a rest day after day 3"
```

## Frontend Components

### New: `ConflictGraphView.tsx`

- **Location**: `frontend/src/components/ConflictGraphView.tsx`
- **Props**: `plan: TravelPlan`, `diagnoses: Diagnosis[]`
- **Responsibilities**:
  - Run conflict detection logic on the plan
  - Render three-lane SVG with D3-computed positions
  - Draw dashed conflict edges between nodes
  - On click: propagate selection to `SelectionContext` (link to related diagnosis if one exists)

### New: `frontend/src/lib/conflictDetection.ts`

Pure function module:

```typescript
interface ConflictNode {
  id: string;
  class: "profile" | "poi" | "schedule";
  label: string;
  detail: string;
  field: string;
}

interface ConflictEdge {
  id: string;
  source: string;  // node ID
  target: string;  // node ID
  type: "pace_violation" | "hours_mismatch" | "dietary_conflict" | "comment_violation" | "consecutive_dining";
  description: string;
  relatedClaimId?: string;  // links to existing claim/diagnosis
}

interface ConflictGraph {
  nodes: ConflictNode[];
  edges: ConflictEdge[];
}

function detectConflicts(plan: TravelPlan): ConflictGraph;
```

### Modified: `Layout.tsx`

Add tab bar to the left panel:

```
┌──────────────────────┬──────────────────┐
│ [Provenance][Conflicts] │  Diagnostic      │
│                      │  Summary Panel   │
│  (active tab content)│                  │
└──────────────────────┴──────────────────┘
```

### Modified: `App.tsx`

Pass `plan` prop through to the left panel so `ConflictGraphView` can access it.

## Interaction Design

1. **Click a conflict edge** → highlights both connected nodes, populates Diagnostic Summary if a related diagnosis exists
2. **Hover a node** → tooltip showing full field value
3. **Cross-view coordination** → conflict edges link to existing diagnoses via `relatedClaimId` matching on `Diagnosis.claim.claim_id`

## Conflict-to-Diagnosis Mapping

The conflict detection runs client-side on the `TravelPlan` structure. Each detected conflict is matched to existing `Diagnosis` objects by comparing:
- Conflict type → `hallucination_type` (e.g., `pace_violation` → `poi_arrangement_error`)
- Involved entities → `claim.extracted_entities` (e.g., matching POI name or day number)

This mapping is best-effort — not all conflicts will have a corresponding diagnosis, and not all diagnoses correspond to structural conflicts.

## Visual Design

- Lane backgrounds: soft tinted rectangles (indigo for Profile, sky for POI, emerald for Schedule)
- Node shape: rounded rectangles with class-colored left border
- Edge style: dashed line, color per conflict type, midpoint dot
- Selected state: thicker stroke, light blue background
- Legend: below SVG, showing conflict type colors
