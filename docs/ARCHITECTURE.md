# Architecture Guide

## 1. Overview

**Teacher-AI-Reports** is a full-stack analytics dashboard that evaluates classroom teaching quality for Noon Academy. It ingests 7 CSV files from a classroom session (transcripts, chats, polls, reactions, activities, user sessions, and course metadata), processes them through a PostgreSQL database, and renders an interactive Arabic-language (RTL) dashboard with detailed analytics on:

- Student performance and comprehension
- Teacher effectiveness and communication quality
- Activity-by-activity breakdowns with question-level insights
- A 9-criteria QA evaluation scored 1–5

**Who uses it:** Education quality analysts and instructional coaches reviewing recorded Noon Academy sessions.

---

## 2. Tech Stack

| Layer       | Technology                                                    |
|-------------|---------------------------------------------------------------|
| Frontend    | React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui         |
| Routing     | Wouter                                                        |
| Data fetch  | TanStack React Query                                          |
| Charts      | Recharts                                                      |
| Animations  | Framer Motion                                                 |
| Backend     | Express 5 (TypeScript, run via `tsx`)                         |
| Database    | PostgreSQL 16                                                 |
| ORM         | Drizzle ORM + Zod validation                                  |
| CSV parsing | csv-parse, xlsx, iconv-lite (Arabic encoding)                 |
| Hosting     | Replit (Node.js 20, port 5000)                                |

---

## 3. Key Files

### Server

| File | Purpose |
|------|---------|
| `server/index.ts` | Express app setup, logging middleware, port binding |
| `server/routes.ts` | API route definitions (5 endpoints) |
| `server/storage.ts` | **Core analytics engine** (~2800 lines). Computes all dashboard data: feedback generation, activity analysis, QA scoring, transcript evaluation, confusion detection |
| `server/db.ts` | Drizzle ORM connection pool |
| `server/import-data.ts` | CSV/XLSX import pipeline — auto-imports on first startup |
| `server/vite.ts` | Vite dev server integration |
| `server/static.ts` | Static file serving in production |

### Client

| File | Purpose |
|------|---------|
| `client/src/main.tsx` | React entry point |
| `client/src/App.tsx` | Route definitions |
| `client/src/pages/dashboard.tsx` | **Main dashboard** (~900 lines). All UI sections: session header, summary metrics, activity tables, QA evaluation accordion, transcript analysis |
| `client/src/lib/queryClient.ts` | React Query configuration |
| `client/src/components/ui/` | 49 shadcn/ui components (Card, Badge, Collapsible, etc.) |

### Shared

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Drizzle table definitions, Zod insert schemas, TypeScript types for all 7 tables |

### Config

| File | Purpose |
|------|---------|
| `drizzle.config.ts` | Drizzle ORM config (PostgreSQL connection) |
| `vite.config.ts` | Vite build config with path aliases (`@/` → client, `@shared/` → shared) |
| `script/build.ts` | Production build script (esbuild → `dist/index.cjs`) |

### Data

| File | Purpose |
|------|---------|
| `attached_assets/*.csv` | 7 CSV files per session, auto-detected by session ID pattern in filename |

---

## 4. Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CSV FILES (attached_assets/)                  │
│  course_Session_*, namra_transcript_*, chats_*, classroom_activity_* │
│  f_user_poll_*, f_user_reaction_*, user_session_*                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    server/import-data.ts
                    (auto-import on first startup)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PostgreSQL (7 tables)                            │
│  course_sessions, session_transcripts, session_chats,               │
│  classroom_activities, user_polls, user_reactions, user_sessions     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    server/storage.ts
                    DatabaseStorage.getDashboardData()
                    (9 parallel DB queries → compute analytics)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Express API (server/routes.ts)                      │
│           GET /api/dashboard/:sessionId → JSON response              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    React Query (cached, staleTime: Infinity)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  React Dashboard (Arabic RTL)                        │
│  Session Header → Summary → Activities → Activity Analysis →        │
│  QA Evaluation (9 criteria) → Transcript Analysis                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Key insight:** All computation happens server-side in `storage.ts`. The frontend is purely presentational — it receives a single large JSON object and renders it.

---

## 5. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dashboard/:sessionId` | Returns the complete analytics payload for a session: metadata, activities, polls, reactions, feedback, QA scores, transcript analysis. **This is the primary endpoint.** |
| `GET` | `/api/sessions` | Lists all available course sessions |
| `GET` | `/api/detected-session` | Auto-detects session ID from CSV filenames in `attached_assets/` |
| `GET` | `/api/transcripts/:sessionId` | Returns teacher speech transcript segments (ordered by lineOrder) |
| `GET` | `/api/chats/:sessionId` | Returns chat messages for the session (first 200) |

The dashboard endpoint (`/api/dashboard/:sessionId`) returns a `DashboardData` object containing:
- Session metadata (teacher, topic, level, times)
- Activity list with correctness metrics
- Poll statistics and question-level breakdowns
- Reaction/sentiment data
- Feedback (what went well / needs improvement)
- Per-activity-type analysis (SECTION_CHECK, TEAM_EXERCISE, EXIT_TICKET)
- QA evaluation (9 criteria, each with score, evidence, recommendations)
- Teacher communication insights (clarity, tone, questioning patterns)

---

## 6. Database Tables & Relationships

All tables use `courseSessionId` as the join key.

```
┌──────────────────────┐
│   course_sessions     │  (1 row per session)
│──────────────────────│
│ id (PK)              │
│ courseSessionId (UQ)  │◄──────────────────────────────────────┐
│ courseId              │                                        │
│ courseSessionName     │     ┌──────────────────────┐          │
│ teacherId            │     │  session_transcripts  │          │
│ scheduledStart/End   │     │──────────────────────│          │
│ teacherStart/End     │     │ id (PK)              │          │
│ teachingTime         │     │ courseSessionId (FK)──┤──────────┤
│ sessionTime          │     │ startTime / endTime   │          │
│ engagementEvents (J) │     │ text                  │          │
│ engagementDurations(J│     │ lineOrder             │          │
│ positive/negative/   │     └──────────────────────┘          │
│   neutralUsers       │                                        │
│ sessionTemperature   │     ┌──────────────────────┐          │
└──────────────────────┘     │    session_chats      │          │
                              │──────────────────────│          │
                              │ id (PK)              │          │
                              │ courseSessionId (FK)──┤──────────┤
                              │ messageText           │          │
                              │ creatorName           │          │
                              │ userType (STUDENT/    │          │
                              │   TEACHER)            │          │
                              │ createdAtTs           │          │
                              └──────────────────────┘          │
                                                                 │
┌──────────────────────┐     ┌──────────────────────┐          │
│  classroom_activities │     │     user_polls        │          │
│──────────────────────│     │──────────────────────│          │
│ id (PK)              │◄────│ classroomActivityId   │          │
│ activityId           │     │ id (PK)              │          │
│ courseSessionId (FK)──┤─────│ courseSessionId (FK)──┤──────────┤
│ activityType         │     │ userId               │          │
│ startTime / endTime  │     │ questionId/Text      │          │
│ activityHappened     │     │ isCorrectAnswer      │          │
│ duration             │     │ pollAnswered/Seen    │          │
│ totalMcqs            │     │ pollDuration         │          │
└──────────────────────┘     └──────────────────────┘          │
                                                                 │
┌──────────────────────┐     ┌──────────────────────┐          │
│   user_reactions      │     │    user_sessions      │          │
│──────────────────────│     │──────────────────────│          │
│ id (PK)              │     │ id (PK)              │          │
│ courseSessionId (FK)──┤─────│ courseSessionId (FK)──┤──────────┘
│ userId               │     │ userId / userName     │
│ emotion              │     │ userType              │
│ eventDatetime        │     │ teachingTime          │
│ partOfActivity       │     │ activeTime            │
│ totalReactions       │     │ totalPollsSeen        │
└──────────────────────┘     │ totalPollsResponded   │
                              │ totalMessages         │
                              │ platforms             │
                              └──────────────────────┘
```

### Table Summary

| Table | Rows per session | Purpose |
|-------|-----------------|---------|
| `course_sessions` | 1 | Session metadata: times, engagement, sentiment, temperature |
| `session_transcripts` | ~100–500 | Teacher speech segments with timestamps |
| `session_chats` | ~50–300 | Student & teacher chat messages |
| `classroom_activities` | 3–8 | Activities (SECTION_CHECK, EXIT_TICKET, TEAM_EXERCISE) |
| `user_polls` | ~200–1000 | Per-student poll responses with correctness |
| `user_reactions` | ~50–200 | Student emoji reactions with timestamps |
| `user_sessions` | ~20–50 | Per-student attendance and engagement metrics |

### Activity Type Classification

The system normalizes raw activity types to 3 canonical categories:

| Raw Type | Canonical Type |
|----------|---------------|
| `SECTION_CHECK` | SECTION_CHECK |
| `SQUID_GAMES`, `SQUID_GAME` | EXIT_TICKET |
| `EXIT_TICKET` | EXIT_TICKET |
| `BETTER_CALL_SAUL` | TEAM_EXERCISE |
| `TEAM_EXERCISE` | TEAM_EXERCISE |
| Fallback (has MCQs) | SECTION_CHECK |

---

## Quick Start

```bash
# Development
npm run dev          # Starts Vite + Express on port 5000

# Production
npm run build        # Bundles to dist/index.cjs + dist/public/
npm start            # Serves production build

# Environment
DATABASE_URL=...     # PostgreSQL connection string (required)
PORT=5000            # Server port (default)
```

On first startup, `import-data.ts` auto-detects CSV files in `attached_assets/` and imports them into PostgreSQL. Subsequent startups skip import if data already exists.
