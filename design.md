
# `design.md` (FINAL — System + UI + Behavior Spec)

This is your **single source of truth**.
Everything in my app must follow this.

---

# 🧩 FlowForge — Design System & Execution Spec

---

# 1. Core Principle

> This is a **visual workflow execution engine**, not just a UI.

Every visual element must reflect:

* Data flow
* Execution state
* System correctness

---

# 2. Design Philosophy

* Minimal but **information-rich**
* Canvas-first architecture
* Zero ambiguity in execution
* Immediate feedback for every action

---

# 3. Theme System

## Dark Theme (Default)

```css
--bg-primary: #101010;
--bg-secondary: #161616;
--bg-tertiary: #1E1E1E;

--border-subtle: rgba(255,255,255,0.06);
--border-strong: rgba(255,255,255,0.12);

--text-primary: #FFFFFF;
--text-secondary: rgba(255,255,255,0.7);
--text-muted: rgba(255,255,255,0.4);

--accent: #4F8CFF;
--accent-soft: rgba(79,140,255,0.15);

--success: #22c55e;
--error: #ef4444;
--warning: #f59e0b;
```

---

## Light Theme

```css
--bg-primary: #F8F8F8;
--bg-secondary: #FFFFFF;

--text-primary: #0A0A0A;
--text-secondary: rgba(0,0,0,0.7);
```

---

## Theme Behavior

* Toggle via button (top-right)
* Persist in `localStorage`
* Apply using:

```html
<html data-theme="dark">
```

---

# 4. Typography

* Font: Suisse Intl / system-ui
* Clean, neutral

| Type    | Size    |
| ------- | ------- |
| Heading | 18–20px |
| Body    | 14–16px |
| Label   | 12px    |

---

# 5. Layout

```
[ Left Sidebar ] [ Canvas ] [ Right Sidebar ]
```

---

## Left Sidebar

* Node types
* Search
* Drag support

---

## Right Sidebar (History)

* Workflow runs
* Node-level breakdown

---

## Canvas (Primary)

* Infinite grid
* Zoom + pan
* Always visible

---

# 6. Canvas Behavior

## Background

Dot grid (dark/light variants)

---

## Controls

* Scroll → zoom
* Drag → pan
* Space + drag → pan

---

# 7. Node System

## Node Types (Fixed)

* text
* upload_image
* upload_video
* llm
* crop_image
* extract_frame

---

## Node Structure

Each node includes:

* Title
* Inputs
* Outputs
* Config UI
* Execution state

---

# 8. Node Lifecycle (MANDATORY)

```
idle → running → success | failed
```

---

## UI Reaction

| State   | UI                 |
| ------- | ------------------ |
| Idle    | neutral            |
| Running | glow + pulse       |
| Success | green border       |
| Failed  | red border + error |

---

# 9. DAG System (CRITICAL)

## Rules

1. No cycles allowed
2. Directed graph only
3. Node executes only after dependencies complete

---

## UX

* Invalid connection → blocked + red highlight
* Valid → smooth edge

---

# 10. Data Flow System

## Rule

```
output → edge → input
```

---

## Input Priority

```
IF connected:
  disable manual input
ELSE:
  allow manual input
```

---

# 11. Type-Safe Connections

| Source | Allowed Targets |
| ------ | --------------- |
| Text   | LLM             |
| Image  | Crop, LLM       |
| Video  | Extract         |
| Crop   | LLM             |

Invalid → disallowed visually

---

# 12. Execution System (CRITICAL)

## Modes

* Full workflow run
* Single node run
* Selected nodes run

---

## Trigger Flow

1. POST `/api/run-workflow`
2. Receive `runId`
3. Get token
4. Subscribe to stream

---

## Realtime Events

```
node_start
node_complete
node_failed
workflow_done
```

---

## UI Reaction

| Event         | Action      |
| ------------- | ----------- |
| node_start    | animate     |
| node_complete | show output |
| node_failed   | show error  |
| workflow_done | stop all    |

---

# 13. Parallel Execution

* Independent branches run simultaneously
* Nodes wait only for dependencies
* Convergence node waits for ALL parents

---

# 14. History System

## Right Sidebar

Each run shows:

* timestamp
* status
* duration

---

## Expanded View

* Node tree
* Status per node
* Outputs
* Errors

---

# 15. Node Output Behavior

## LLM Node

* Output shown inline
* Expandable
* Copyable

❌ No separate output node

---

# 16. File Drop Behavior (IMPORTANT)

## Drag into Canvas

| File  | Action            |
| ----- | ----------------- |
| Image | Create image node |
| Video | Create video node |

Auto:

* Position at drop
* Upload
* Show preview

---

# 17. Animations

* Fast (150–250ms)
* Subtle
* Smooth easing

---

# 18. Error Handling

* API errors → toast
* Node errors → inline
* Partial failures allowed

---

# 19. Performance Rules

* Memoized nodes
* Minimal rerenders
* Efficient state updates

---

# 20. UX Constraints

❌ No clutter
❌ No blocking UI
❌ No lag
❌ No unnecessary panels

---

# 21. Final Principle

> UI must **reflect execution truth at all times**

---
