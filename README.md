<div align="center">
  <br>
  <h1>FLOWFORGE</h1>

  <p>
    <sub>
      A canvas-based visual AI workflow engine for multimodal LLMs and media processing.
    </sub>
  </p>
  <br>
  <p>
    <img src="https://img.shields.io/badge/Next.js-111111?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js">
    <img src="https://img.shields.io/badge/Trigger.dev-111111?style=for-the-badge&logo=react&logoColor=white" alt="Trigger.dev">
    <img src="https://img.shields.io/badge/React_Flow-111111?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React Flow">
    <img src="https://img.shields.io/badge/PostgreSQL-111111?style=for-the-badge&logo=postgresql&logoColor=336791" alt="PostgreSQL">
  </p>

  <br>
  <a href="#-project-overview">Project Overview</a> ✦
  <a href="#-key-features">Key Features</a> ✦
  <a href="#-node-library">Node Library</a> ✦
  <a href="#-system-architecture">Architecture</a> ✦
  <a href="#-installation">Installation</a> ✦
  <a href="#-tech-stack">Tech Stack</a>
  <br>
</div>

<hr>

## ◈ Project Overview

FlowForge is a drag-and-drop visual workflow builder for chaining Large Language Models and processing media files.

**For Creators, Marketers, and Product Teams (The Vision):**
Building AI applications usually requires complex code to coordinate different models. FlowForge removes this friction. You can visually connect text, multiple images, and video feeds directly into advanced AI models (like Google Gemini and Stability AI) to generate rich, multimodal content—like marketing copy, product descriptions, and brand images—without writing a single line of code. Supporting tools for image cropping and video frame extraction are built right into the canvas to perfectly format your media before the AI analyzes it.

**For Engineers (The Engine):**
Under the hood, FlowForge is a highly-scalable workflow execution engine. When a user initiates a run, the system translates their visual canvas into a mathematical graph (DAG). It automatically identifies independent generative AI tasks and media processing steps, executing them entirely in parallel across a distributed serverless worker fleet. This architecture guarantees high throughput, automatic retries for flaky AI APIs, and perfect state persistence for every single run.

FlowForge is the bridge between creative AI exploration and enterprise-grade infrastructure.

<br>

## ◈ Key Features

FlowForge is built to be accessible to product builders while maintaining rigorous technical standards for engineers. Everything runs through **Trigger.dev** for automatic retries, execution persistence, and enterprise-grade error resilience, while **Clerk** ensures total authentication security.

### Core Capabilities

| <kbd>01</kbd> Parallel Execution                                                                                                                                  | <kbd>02</kbd> Multimodal Convergence                                                                                                                 |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| The engine automatically finds tasks that don't depend on each other and runs them at the exact same time, making workflows incredibly fast.<br><br>_**Technical Details:** The orchestrator performs DAG (Directed Acyclic Graph) traversal. It batches independent node tasks and dispatches them to Trigger.dev serverless workers for parallel computation._ | Combine text, multiple images, and video into a single AI pipeline effortlessly.<br><br>_**Technical Details:** Passes CDN-hosted image arrays and video frame URLs directly to the Google Gemini Vision API, handling complex multimodal prompt formatting natively._ |

| <kbd>03</kbd> Selected Run Execution                                                                                                                                 | <kbd>04</kbd> Workflow Versions                                                                                                                        |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| Save time and AI credits by running only the specific parts of the workflow you want to test, without running the whole thing.<br><br>_**Technical Details:** Dynamically builds a scoped execution graph based on selected nodes. Injects previously cached downstream outputs for unselected parent nodes to maintain state._ | Never lose your work. Every time you make a major change or run the pipeline, the system safely saves a snapshot of your canvas.<br><br>_**Technical Details:** Implements immutable `WorkflowVersion` snapshots in PostgreSQL. Graph node and edge arrays are serialized and locked for perfect state rollback._ |

<br>

### Telemetry & History

| <kbd>05</kbd> Complete Run History                                                                                                                                 | 
| :--------------------------------------------------------------------------------------------------------------------------------------------------------- | 
| A detailed right-hand dashboard showing exactly what happened, when it happened, and how long each step took. Active nodes physically glow on the canvas while processing.<br><br>_**Technical Details:** Persists node-level `NodeExecution` logs to Prisma. The UI uses polling to fetch real-time node states, driving React Flow class updates for pulsating UI effects and status badging._ | 

<br>

## ◈ Node Library

At the heart of FlowForge are 6 specialized primitives, broken down into two distinct categories: Inputs and Processing.

### 1. Input Nodes
The foundational blocks that inject your raw materials into the workflow.

| Node               | Function                                                                                                 |
| :----------------- | :------------------------------------------------------------------------------------------------------- |
| **Text**           | A multiline text block. Used to write instructions, system prompts, or context for the AI.                     |
| **Upload Image**   | Securely upload images from your computer. Previews the image directly on the canvas. _(Backed by Transloadit CDN)_    |
| **Upload Video**   | Safely ingest and store heavy video files (MP4, WEBM). Provides a playable video preview on the canvas. _(Backed by Transloadit CDN)_           |

<br>

### 2. Processing Nodes
The engines that manipulate, crop, and "think" about your data.

| Node               | Function                                                                                                 |
| :----------------- | :------------------------------------------------------------------------------------------------------- |
| **Run Any LLM**    | The intelligence layer. It accepts multiple images, system prompts, and user text via Google Gemini. **Crucially, it generates both Text and Image outputs.** _(Text uses Gemini. Image generation is powered by Stability AI, which returns base64 data that FlowForge automatically converts and uploads into CDN URLs via Transloadit)._ |
| **Crop Image**     | Mathematically crops your uploaded images to precise coordinate dimensions before passing them to the AI. _(Powered by headless FFmpeg running entirely inside Trigger.dev)_     |
| **Extract Frame**  | Plucks a specific moment (by exact seconds or percentage timestamp) out of a video file and converts it into a single image frame. _(Powered by headless FFmpeg running entirely inside Trigger.dev)_      |

<br>

## ◈ System Architecture

Requests flow from the visual interface to the execution layer. The orchestrator ensures state consistency, respects DAG logic, and mitigates single-node failures from breaking unassociated branches.

```mermaid
flowchart LR
    UI([React Flow Canvas]) --> API{Next.js API Layer}

    API -->|Save Snapshot| DB[(Neon PostgreSQL)]
    API -->|Dispatch Run| TD[Trigger.dev Engine]

    TD --> Batch((DAG Batching))

    Batch -->|Branch A| Node1[Crop Image]
    Batch -->|Branch B| Node2[Extract Frame]
    Batch -->|Independent| Node3[Text Node]

    Node1 -.->|FFmpeg Worker| CDN[(Transloadit)]
    Node2 -.->|FFmpeg Worker| CDN

    Node1 & Node2 & Node3 ===>|Confluence| LLM[Google Gemini / Stability AI]

    LLM -.->|Stream Output| Stream(((Server Sent Events)))
    Stream -.->|Live Updates| UI
```

When a user initiates an execution, the current graph state is locked into a **WorkflowVersion**. The Next.js API delegates the heavy lifting to the **Trigger.dev Engine**. 

**Crucially, all media and AI task execution runs within Trigger.dev.** This means the background worker natively handles automatic retries, execution persistence, and error resilience without blocking the Vercel edge. The task runner parses the nodes, fires off independent FFmpeg processing queries concurrently, and coordinates the **Gemini API** and **Stability AI** calls only once the prerequisites resolve. 

<br>

## ◈ Project Structure

```text
/
├── app/
│   ├── api/            — Vercel serverless route handlers (Exec, Auth, Realtime)
│   ├── workflow/       — Main React Flow editor interface
│   └── page.tsx        — Landing page and workflow dashboard
├── components/
│   ├── dashboard/      — UI components for the main projects view
│   ├── nodes/          — Custom React Flow node architectures
│   └── workflow/       — Canvas, toolbars, and sidebar panels
├── lib/
│   ├── prisma.ts       — ORM database configuration
│   └── validations.ts  — Shared Zod schema validations
├── store/              — Zustand state management (Canvas, History)
└── src/trigger/        — Background execution tasks (workflow.run, node.execute)
```

<br>

## ◈ Installation

**Prerequisites:** Node.js v18+, PostgreSQL.

<details>
<summary><b>Initial Setup</b></summary>

<br>

**1. Clone the repository**
```bash
git clone https://github.com/abhiiiiiii-21/flowforge.git
cd flowforge
npm install
```

**2. Configure Environment**
Create a `.env` file at the root.

```bash
# Database (Neon)
DATABASE_URL="postgresql://user:password@localhost:5432/flowforge"

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="..."
CLERK_SECRET_KEY="..."
CLERK_WEBHOOK_SECRET="..."

# Orchestration (Trigger.dev)
TRIGGER_SECRET_KEY="..."
TRIGGER_PROJECT_ID="..."

# API Services
GOOGLE_GENERATIVE_AI_API_KEY="..."
STABILITY_API_KEY="..."
TRANSLOADIT_AUTH_KEY="..."
TRANSLOADIT_SECRET="..."
```

**3. Initialize Database**
```bash
npx prisma generate
npx prisma db push
```

**4. Start the Application**
You will require two terminal instances to run the Next.js frontend and the Trigger.dev backend worker concurrently.

**Terminal 1 (Next.js Application):**
```bash
npm run dev
```

**Terminal 2 (Trigger.dev Background Worker):**
```bash
npx trigger.dev@latest dev
```

> _Tip: Once both services are running, navigate to `localhost:3000` to interact with the FlowForge canvas._

</details>

<br>

## ◈ Tech Stack

| Domain          | Technology          | Implementation Objective                                             |
| :-------------- | :------------------ | :------------------------------------------------------------------- |
| **Frontend**    | Next.js & React     | High-performance app router delivery and complex UI management.      |
| **Visuals**     | React Flow          | Math and physics calculations for the infinite drag-and-drop canvas. |
| **Execution**   | Trigger.dev         | Defeating Vercel timeouts via long-running parallel background jobs. |
| **Database**    | PostgreSQL & Prisma | Relational data persistence for node traces, history, and users.     |
| **Auth**        | Clerk               | Ensuring user-isolated workflows and protected API routes.           |
| **Media Auth**  | Transloadit         | Direct-to-CDN ingestion and fast URL generation for AI images.       |

<br>

---
