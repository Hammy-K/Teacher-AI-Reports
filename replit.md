# Overview

This is a **Classroom Session Analytics Dashboard** (English LTR version) — a full-stack web application that imports educational course session data from CSV files (or Excel) into a PostgreSQL database and presents it through an interactive dashboard. The app visualizes teaching metrics, student engagement, transcripts, chat logs, poll results, reactions, and activity timelines for course sessions.

The dashboard is **session-agnostic** — it auto-detects the session ID from CSV filenames in `attached_assets/` and works for any session data.

# Recent Changes

- **2026-02-12**: Deep Transcript Analysis (6 dimensions)
  - Concept Mastery Map: correlates concepts with teaching time, student results, confusion signals, effectiveness
  - Teaching Clarity Evaluation: scores 1-5 on clarity techniques (step-by-step, examples, verification, transitions)
  - Questioning Quality Analysis: counts open-ended vs closed questions, engagement prompts, rhetorical questions
  - Confusion Moment Detection: clusters student confusion in chat, checks teacher response, assigns risk level
  - Teaching Pattern Recognition: identifies recurring behaviors (over-explaining, under-explaining, ignoring confusion)
  - Micro-Moment Highlights: top 3 strong + top 3 risk moments with specific evidence
  - Removed ALL vague language ("may", "could", "might", "suggests") — every insight is definitive with data evidence
  - New frontend TranscriptAnalysisSection component with 6 collapsible subsections
  - transcriptAnalysis object added to qaEvaluation API response
- **2026-02-11**: Converted entire UI from Arabic RTL to English LTR
  - HTML lang="en" dir="ltr", fonts changed to Inter/Open Sans
  - All dashboard labels, headings, metrics in English
  - All backend analytics (insights, feedback, QA evidence, recommendations) in English
  - RTL margins/paddings swapped to LTR, ChevronLeft→ChevronRight for collapsed state
  - Session-agnostic import: auto-detects session ID from CSV filenames
  - Added Excel (.xlsx) import support
  - Added `/api/detected-session` endpoint for dynamic session detection
  - Dashboard auto-fetches detected session instead of hardcoded ID

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Overall Structure

The project follows a **monorepo pattern** with three top-level directories:

- **`client/`** — React single-page application (frontend)
- **`server/`** — Express.js API server (backend)
- **`shared/`** — Shared TypeScript types and database schema (used by both client and server)

## Frontend

- **Framework:** React with TypeScript
- **Routing:** Wouter (lightweight client-side router)
- **State/Data Fetching:** TanStack React Query for server state management
- **UI Components:** shadcn/ui component library built on Radix UI primitives
- **Styling:** Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Charts:** Recharts (AreaChart, BarChart) for data visualization
- **Build Tool:** Vite with React plugin
- **Path Aliases:** `@/` maps to `client/src/`, `@shared/` maps to `shared/`

The main page is a single Dashboard (`client/src/pages/dashboard.tsx`) that fetches all session data from the API and renders metrics cards, charts, transcript viewers, chat logs, poll stats, and engagement timelines.

## Backend

- **Framework:** Express.js running on Node.js
- **Language:** TypeScript, executed with `tsx`
- **API Pattern:** RESTful JSON endpoints under `/api/`
- **Data Import:** CSV files from `attached_assets/` are parsed with `csv-parse` and inserted into the database on first startup
- **Storage Layer:** A `DatabaseStorage` class implements the `IStorage` interface, providing a clean abstraction over database queries

Key server files:
- `server/index.ts` — Express app setup, middleware, logging
- `server/routes.ts` — API route registration + inline schema creation
- `server/storage.ts` — Database query layer (implements `IStorage` interface)
- `server/import-data.ts` — CSV data import logic
- `server/db.ts` — Database connection pool setup
- `server/vite.ts` — Vite dev server middleware for development
- `server/static.ts` — Static file serving for production

## Database

- **Database:** PostgreSQL
- **ORM:** Drizzle ORM with `drizzle-zod` for schema validation
- **Schema Location:** `shared/schema.ts`
- **Connection:** Uses `pg` (node-postgres) pool with `DATABASE_URL` environment variable
- **Schema Push:** `npm run db:push` uses drizzle-kit to push schema changes
- **Tables:**
  - `course_sessions` — Session metadata (times, engagement events/durations, teacher info)
  - `session_transcripts` — Timestamped transcript lines per session
  - `session_chats` — Chat messages from students/teachers
  - `classroom_activities` — Activities like polls, MCQs within sessions
  - `user_polls` — Individual student poll responses
  - `user_reactions` — Student emoji/reaction data
  - `user_sessions` — Per-student session attendance and activity metrics

The schema is also created inline in `server/routes.ts` via raw SQL `CREATE TABLE IF NOT EXISTS` statements as a fallback.

## Build Process

- **Development:** `npm run dev` runs the Express server with Vite middleware for HMR
- **Production Build:** `npm run build` runs `script/build.ts` which:
  1. Builds the client with Vite (output to `dist/public/`)
  2. Bundles the server with esbuild (output to `dist/index.cjs`)
  3. Selectively bundles certain dependencies to reduce cold start times
- **Production Start:** `npm start` runs the built `dist/index.cjs`

## Key Design Decisions

- **Shared schema between client and server:** The `shared/` directory contains Drizzle schema definitions and Zod validation schemas, ensuring type safety across the full stack.
- **CSV data import on startup:** Data is imported from CSV files only once (checked via `isDataImported()`), making the app self-initializing.
- **Storage interface pattern:** The `IStorage` interface decouples business logic from database implementation, making it easier to swap storage backends.
- **Inline schema creation:** Tables are created with raw SQL in the routes file as a safety net, complementing drizzle-kit's push mechanism.

# External Dependencies

- **PostgreSQL** — Primary database, connected via `DATABASE_URL` environment variable
- **Google Fonts** — DM Sans, Fira Code, Geist Mono, Architects Daughter (loaded via CDN in `index.html`)
- **Replit Plugins** — `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner` (development only)
- **No external auth or third-party APIs** — The app is a self-contained analytics viewer with no authentication system