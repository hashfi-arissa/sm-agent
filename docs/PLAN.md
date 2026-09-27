# Social Media Agent — Project Plan

> Source of truth for scope, architecture and milestones. Update the **Status** column
> and checklists as work lands. Last revised: 2026-09-27.

## 1. Product summary

A local-first app for planning, drafting and scheduling **Instagram Reels**, plus a public
landing page.

| Feature      | What it does                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Drafting** | Chat with Codex to write a draft. The user picks the **model** and **reasoning effort** before the chat starts (locked for that session). The draft is a document the user can save. |
| **Content**  | A saved piece of content = **topic + Reel script** (hook, beats, CTA, caption, hashtags, target length). Can be created from a draft or from scratch.                                |
| **Calendar** | Drag **saved** content onto dates (month/week views) to plan when it goes out. Planning only — no auto-posting.                                                                      |

**Audience:** personal use first, public release later. Build for one user, but don't make
choices that block distribution (see §3).

**Out of scope for now:** thumbnail placement, platforms other than Reels, auto-posting,
multi-user / cloud sync.

## 2. Key constraint — Codex _subscription_, not API

AI drafting uses the user's **ChatGPT plan through the Codex CLI** (`codex app-server`),
not the OpenAI API. Consequences:

- The app **must run on the user's machine**; the backend spawns their local `codex` process,
  which uses their own login (`~/.codex/auth.json`).
- A hosted backend proxying one subscription for many users is not allowed (OpenAI ToS) —
  the public release ships as a **desktop app** (Electron), where every user brings their own
  ChatGPT login.
- Usage counts against the user's ChatGPT plan limits → surface rate-limit errors clearly.
- Codex is a _coding agent_. For drafting it must not touch the filesystem or run commands:
  run threads with a **read-only sandbox, no approvals, in an empty scratch `cwd`**, and give it
  content-writing instructions.

### Codex app-server protocol (verified against docs 2026-09-27)

| Need                   | Method / event                                                                 |
| ---------------------- | ------------------------------------------------------------------------------ |
| Start server           | `codex app-server` (stdio, newline-delimited JSON-RPC)                         |
| Model + effort pickers | `model/list` → per model `supportedReasoningEfforts`, `defaultReasoningEffort` |
| New draft chat         | `thread/start` with `model`, `effort`                                          |
| Send message           | `turn/start` with `threadId`, `input` (returns immediately; output streams)    |
| Streamed reply         | notifications `item/agentMessage/delta`, `item/started`, `item/completed`      |
| Reopen chat            | `thread/resume` with `threadId`                                                |

**To verify in M0:** initialize handshake, account/auth methods (read login status,
start ChatGPT login), and the `thread/start` params for sandbox / approval policy / cwd /
instructions. Docs: https://learn.chatgpt.com/docs/app-server

## 3. Decisions

| Topic           | Decision                                                                    | Why                                                                          |
| --------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Repo            | pnpm + Turborepo monorepo                                                   | App, landing page and shared packages in one place                           |
| App             | Next.js 16 (App Router), runs on `localhost`                                | Route handlers can spawn `codex` and stream SSE                              |
| Desktop (M5)    | Electron                                                                    | Runs the Node backend + Codex bridge as-is (Tauri would need a Node sidecar) |
| Landing         | Astro 7, static                                                             | Fast marketing site; waitlist now, downloads later                           |
| DB              | SQLite (`better-sqlite3`) + Drizzle ORM                                     | Local file, zero setup; can move to Postgres/Turso later                     |
| UI              | Tailwind 4 + shadcn/ui                                                      | Shared across app and landing                                                |
| Calendar        | FullCalendar 7 (`daygrid`, `timegrid`, `interaction`)                       | Built-in external drag (tray → calendar) and event drag                      |
| Other DnD       | `@dnd-kit`                                                                  | Non-calendar drag lists                                                      |
| Validation      | zod 4                                                                       | Shared schemas between db, API and UI                                        |
| AI access       | `AIProvider` interface, Codex as the only implementation                    | Lets us add API-key / other providers for the public release                 |
| Schedule dates  | Store local `date` (`YYYY-MM-DD`) + optional `time` (`HH:mm`)               | Avoids time-zone drift for a personal planner                                |
| State placement | Content has only `draft`/`saved`; scheduling state lives on `ScheduleEntry` | One source of truth — "scheduled"/"posted" are derived                       |

Package versions at planning time: next 16.3, astro 7.3, turbo 2.11, drizzle-orm 0.45,
better-sqlite3 13.0, @fullcalendar/core 7.1, @dnd-kit/core 6.3, electron 44.4,
@openai/codex 0.157, tailwindcss 4.3, zod 4.6, typescript 5.9 (Next 16 targets TS 5 — not TS 7),
shadcn 4.21 (`base-nova` style on Base UI).

## 4. Repository layout

```
social-media-agent/
├─ apps/
│  ├─ app/          Next.js app (localhost; Electron wrapper in M5)
│  └─ landing/      Astro landing page
├─ packages/
│  ├─ ai/           AIProvider interface
│  │  └─ codex/     codex app-server bridge (JSON-RPC over stdio)
│  ├─ db/           Drizzle schema, migrations, queries
│  ├─ ui/           shared Tailwind theme + shadcn components
│  ├─ types/        zod schemas: Draft, Content, ScheduleEntry
│  ├─ typescript-config/  shared tsconfigs (base, library, nextjs)
│  └─ eslint-config/      shared ESLint configs (base, react)
├─ docs/            PLAN.md and other docs
└─ data/            local SQLite db (gitignored)
```

## 5. Information architecture

### Landing page

```
Landing (/)
├── Hero ─────────────── "Plan, draft & schedule your Reels with Codex" + [Join waitlist]
├── How it works ─────── 1 Chat → 2 Draft → 3 Content → 4 Calendar
├── Features
│   ├── Codex-powered drafting (your ChatGPT plan, no API key)
│   ├── Pick model & effort per chat
│   ├── Reel script builder (hook · beats · CTA · caption)
│   └── Drag-and-drop content calendar
├── Requirements ─────── Codex CLI + ChatGPT plan
├── FAQ
└── Footer ───────────── Privacy · Terms · Changelog
```

### App

```
App (localhost → Electron later)
│
├── Connect Codex (first run)
│   └── CLI found? ── signed in? ── [Sign in with ChatGPT]
│
├── Home
│   ├── This week ─────── mini calendar strip (scheduled Reels)
│   ├── Recent drafts
│   ├── Unscheduled contents
│   └── [+ New draft]  [+ New content]
│
├── Drafting  (/drafts)
│   ├── Draft list ────── title · model · effort · updated
│   └── Draft session
│       ├── Setup (locked once the chat starts)
│       │   ├── Model picker    ← model/list
│       │   └── Effort picker   ← supportedReasoningEfforts
│       └── Workspace (split view)
│           ├── Chat panel ──── streaming reply · stop · regenerate
│           ├── Draft doc ───── editable markdown · "Insert reply"
│           └── [Save draft]  [Convert to Content →]
│
├── Contents  (/contents)
│   ├── Library ─────────── search · filter: draft / saved / scheduled / posted
│   └── Content editor
│       ├── Topic
│       ├── Reel script
│       │   ├── Hook (first 3 s)
│       │   ├── Beats ─────── scene list: voiceover · on-screen text · ~sec
│       │   ├── CTA
│       │   └── Target length  (15 / 30 / 60 / 90 s)
│       ├── Caption + hashtags
│       └── [Save] [Duplicate] [Schedule…] [Open source draft]
│
├── Calendar  (/calendar)
│   ├── Side tray ────────── saved + unscheduled contents (draggable)
│   ├── Views: Month · Week (time slots)
│   ├── Drag tray → day       = schedule
│   ├── Drag day → day        = reschedule
│   ├── Drag day → tray       = unschedule
│   └── Click event ───────── quick peek · open content · mark posted
│
└── Settings
    ├── Codex connection · default model/effort
    └── Data (data folder, export/backup JSON)
```

### Data model

```
┌─────────────────┐ 1   n ┌────────────────┐
│ DraftSession    │──────▶│ ChatMessage    │
│ id              │       │ id, sessionId  │
│ codexThreadId   │       │ role, text     │
│ model  (locked) │       │ createdAt      │
│ effort (locked) │       └────────────────┘
│ createdAt       │
└──────┬──────────┘
       │ 1:1
       ▼
┌─────────────────┐ convert ┌──────────────────────────┐ 1  0..1 ┌──────────────────┐
│ DraftDocument   │───────▶│ Content                  │───────▶│ ScheduleEntry    │
│ id, sessionId   │         │ id, sourceDraftId?       │        │ id, contentId    │
│ title           │         │ topic                    │        │ platform: reels  │
│ body (md)       │         │ hook, beats[], cta       │        │ date (YYYY-MM-DD)│
│ saved: bool     │         │ caption, hashtags[]      │        │ time? (HH:mm)    │
│ updatedAt       │         │ targetLength             │        │ status: planned/ │
└─────────────────┘         │ status: draft / saved    │        │   posted/missed  │
                            │ createdAt, updatedAt     │        │ postedAt?        │
                            └──────────────────────────┘        └──────────────────┘

beats[] item: { voiceover, onScreenText, seconds }
```

Rules:

- Only `Content.status = saved` appears in the calendar tray and can be scheduled.
- Displayed status: `draft` → `saved` → `scheduled` (has entry) → `posted` (entry posted).
- `ScheduleEntry` is unique per (`contentId`, `platform`) for now; a separate table keeps
  multi-platform scheduling possible later.
- A draft session's `model` and `effort` cannot change after the first message.

### Runtime flow

```
Browser UI ─HTTP/SSE─▶ Next.js route handlers ─▶ AIProvider ─stdio JSON-RPC─▶ codex app-server
   │                         │                   (codex impl)                     │
   │                         ▼                                                    ▼
   │                   SQLite (drafts, contents, schedule)              user's ChatGPT plan
   └── FullCalendar drag events → PATCH /api/schedule
```

## 6. Milestones

| #   | Milestone                                         | Model · effort    | Status         |
| --- | ------------------------------------------------- | ----------------- | -------------- |
| M0  | Foundation                                        | Opus 5.5 · high   | 🟡 in progress |
| M1  | Drafting                                          | Opus 5.5 · medium | ⚪ not started |
| M2  | Content                                           | Sonnet 5 · high   | ⚪ not started |
| M3  | Calendar                                          | Opus 5.5 · medium | ⚪ not started |
| M4  | Daily-use polish                                  | Sonnet 5 · medium | ⚪ not started |
| L   | Landing page (waitlist) — any time, separate chat | Sonnet 5 · medium | ⚪ not started |
| M5  | Public release                                    | Opus 5.5 · high   | ⚪ not started |
| R   | Pre-release security/code review                  | Fable 5.1 · high  | ⚪ not started |

Start a **new chat per milestone**; point it at this file and `CLAUDE.md`. Small chores can
use Haiku 4.5. If stuck, raise effort before switching model.

### M0 — Foundation

- [x] `git init`, `.gitignore`, `.gitattributes`
- [x] `docs/PLAN.md`, `CLAUDE.md`
- [x] Install Codex CLI (`npm i -g @openai/codex`), confirm `codex login status`
      → codex-cli 0.157.1, logged in using ChatGPT
- [x] Turborepo + pnpm workspace scaffold; shared TS/ESLint/Prettier config
- [x] `apps/app` (Next.js 16 + Tailwind 4 + shadcn/ui), `apps/landing` (Astro 7) skeletons
      → both consume the shared theme from `@repo/ui/globals.css`; `types`/`db`/`ai` are empty stubs
- [ ] `packages/types`: zod schemas for DraftSession, ChatMessage, DraftDocument, Content, ScheduleEntry
- [ ] `packages/db`: Drizzle schema + first migration → `data/app.db`
- [ ] `packages/ai`: `AIProvider` interface + Codex implementation
      (spawn, initialize, `model/list`, `thread/start`, `turn/start` stream, `thread/resume`).
      Generate protocol types with `codex app-server generate-ts` instead of hand-writing them.
- [ ] Verify read-only sandbox / scratch cwd for drafting threads
- [ ] "Connect Codex" screen: CLI found? signed in? models listed?

**Done when:** `pnpm dev` runs the app, the Connect screen shows the Codex login state and the
model list with efforts, and a test prompt streams a reply end to end.

### M1 — Drafting

- [ ] New draft: model + effort pickers (from `model/list`), locked after first message
- [ ] Chat panel with streaming, stop, regenerate; persist messages
- [ ] Draft doc panel (markdown editor), "Insert reply into doc", Save draft
- [ ] Draft list; reopen a session (`thread/resume`)
- [ ] Error states: Codex missing, signed out, rate-limited

### M2 — Content

- [ ] Content editor: topic, hook, beats (add/reorder/remove), CTA, target length, caption, hashtags
- [ ] Save (draft → saved), duplicate, delete
- [ ] Convert draft → content (Codex-assisted structuring into hook/beats/CTA)
- [ ] Library with search and status filter

### M3 — Calendar

- [ ] Month + week views
- [ ] Tray of saved, unscheduled content; drag to schedule
- [ ] Drag to reschedule, drag back to tray to unschedule
- [ ] Event quick-peek, open content, mark posted / missed

### M4 — Daily-use polish

- [ ] Home dashboard (this week, recent drafts, unscheduled)
- [ ] Global search
- [ ] JSON export / import backup

### L — Landing page

- [ ] Copy (use `landing-page-copy` / `malecwiz-landing-page` skills)
- [ ] Astro build, waitlist form, deploy

### M5 — Public release

- [ ] Electron wrapper (spawns Next server + Codex bridge), Windows installer first
- [ ] First-run onboarding for users without Codex CLI / not signed in
- [ ] Auto-update, crash logging
- [ ] Privacy, Terms; landing switches from waitlist to downloads

## 7. Later / parking lot

- Thumbnail placement
- TikTok / YouTube Shorts (`ScheduleEntry.platform`)
- Auto-posting via Instagram Graph API
- Alternative AI providers (API key) via `AIProvider`
- Cloud sync / multi-device
