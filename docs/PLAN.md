# Social Media Agent — Project Plan

> Source of truth for scope, architecture and milestones. Update the **Status** column
> and checklists as work lands. Last revised: 2026-09-28 (M5 code done; first release pending).

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

### Codex app-server protocol (verified live against codex-cli 0.157.1 in M0)

| Need                   | Method / event                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Start server           | `codex app-server` (stdio, newline-delimited JSON-RPC, no `"jsonrpc"` field)                         |
| Handshake              | `initialize` {clientInfo, capabilities} → then `initialized` notification                            |
| Login state            | `account/read` → `{account: {type: "chatgpt", email, planType} \| null, requiresOpenaiAuth}`         |
| Sign in                | `account/login/start` {type: "chatgpt"} → `authUrl`; `account/login/completed` notification          |
| Model + effort pickers | `model/list` (paginated) → per model `supportedReasoningEfforts`, `defaultReasoningEffort`           |
| New draft chat         | `thread/start` with `model`, `cwd`, `sandbox`, `approvalPolicy`, `developerInstructions`             |
| Send message           | `turn/start` with `threadId`, `input`, **`model` + `effort`** (effort is per turn, not per thread)   |
| Streamed reply         | `item/started` (agentMessage `phase`), `item/agentMessage/delta`, `item/completed`, `turn/completed` |
| Stop                   | `turn/interrupt` {threadId, turnId} → `turn/completed` with status `interrupted`                     |
| Reopen chat            | `thread/resume` with `threadId` (needed after the app-server process restarts)                       |
| Regenerate             | `thread/revert` {threadId, beforeTurnId} drops that turn and later ones from Codex's history (M1)    |
| Delete chat            | `thread/delete` {threadId} — removes it from the user's Codex history too (M1)                       |

Full typed protocol: `packages/ai/src/codex/protocol/` (regenerate with `pnpm --filter @repo/ai codex:types`
after upgrading the CLI). Docs: https://learn.chatgpt.com/docs/app-server

**Known limitations (M0):**

- Drafting threads are persisted by Codex (needed for `thread/resume`), so they also appear in the
  user's own Codex session history until the draft is deleted in the app (M1 calls `thread/delete`).
- The read-only sandbox blocks writes and commands, but Codex can still read files outside the
  scratch dir; the drafting instructions tell it not to.
- The desktop app bundles a Codex CLI (M5) as a fallback; a system install on `PATH` wins. The
  bundled copy only moves forward with app updates, so bump `@openai/codex` in
  `apps/desktop/package.json` (and re-run `codex:types`) when cutting a release.

## 3. Decisions

| Topic           | Decision                                                                          | Why                                                                          |
| --------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Repo            | pnpm + Turborepo monorepo                                                         | App, landing page and shared packages in one place                           |
| App             | Next.js 16 (App Router), runs on `localhost`                                      | Route handlers can spawn `codex` and stream SSE                              |
| Desktop (M5)    | Electron                                                                          | Runs the Node backend + Codex bridge as-is (Tauri would need a Node sidecar) |
| Landing         | Astro 7, static                                                                   | Fast marketing site; waitlist now, downloads later                           |
| DB              | SQLite (`better-sqlite3`) + Drizzle ORM                                           | Local file, zero setup; can move to Postgres/Turso later                     |
| UI              | Tailwind 4 + shadcn/ui                                                            | Shared across app and landing                                                |
| Calendar        | FullCalendar 7 — `@fullcalendar/react` bundles `daygrid`/`timegrid`/`interaction` | Built-in external drag (tray → calendar) and event drag                      |
| Other DnD       | `@dnd-kit`                                                                        | Non-calendar drag lists                                                      |
| Validation      | zod 4                                                                             | Shared schemas between db, API and UI                                        |
| AI access       | `AIProvider` interface, Codex as the only implementation                          | Lets us add API-key / other providers for the public release                 |
| Schedule dates  | Store local `date` (`YYYY-MM-DD`) + optional `time` (`HH:mm`)                     | Avoids time-zone drift for a personal planner                                |
| State placement | Content has only `draft`/`saved`; scheduling state lives on `ScheduleEntry`       | One source of truth — "scheduled"/"posted" are derived                       |
| Packaging (M5)  | electron-builder, NSIS one-click per-user installer; Windows x64 first            | No admin prompt; lets electron-updater install silently                      |
| Updates (M5)    | electron-updater with the GitHub Releases provider                                | Free hosting for installers + `latest.yml` feed                              |
| Crash logs (M5) | Local only: `logs/main.log`, `logs/server.log`, Crashpad dumps; nothing uploaded  | Keeps the privacy story "nothing leaves your computer" (except Codex→OpenAI) |
| Codex (M5)      | Bundle `@openai/codex` in the installer as a fallback; system install wins        | Users only need to sign in — no Node/npm install step                        |
| Local API (M5)  | Desktop server on `127.0.0.1`, every request needs a per-launch `x-sma-token`     | Other local processes / web pages can't drive the API or burn Codex quota    |

Package versions at planning time: next 16.3, astro 7.3, turbo 2.11, drizzle-orm 0.45,
better-sqlite3 13.0, @fullcalendar/core 7.1, @dnd-kit/core 6.3, electron 44.4,
@openai/codex 0.157, tailwindcss 4.3, zod 4.6, typescript 5.9 (Next 16 targets TS 5 — not TS 7),
shadcn 4.21 (`base-nova` style on Base UI).

## 4. Repository layout

```
social-media-agent/
├─ apps/
│  ├─ app/          Next.js app (localhost; runs inside apps/desktop when installed)
│  ├─ desktop/      Electron shell + Windows installer (M5)
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
| M0  | Foundation                                        | Opus 5.5 · high   | ✅ done        |
| M1  | Drafting                                          | Opus 5.5 · medium | ✅ done        |
| M2  | Content                                           | Sonnet 5 · high   | ✅ done        |
| M3  | Calendar                                          | Opus 5.5 · medium | ✅ done        |
| M4  | Daily-use polish                                  | Sonnet 5 · medium | ✅ done        |
| L   | Landing page (waitlist) — any time, separate chat | Sonnet 5 · medium | ✅ done        |
| M5  | Public release                                    | Opus 5.5 · high   | 🟡 in progress |
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
- [x] `packages/types`: zod schemas for DraftSession, ChatMessage, DraftDocument, Content, ScheduleEntry
- [x] `packages/db`: Drizzle schema + first migration → `data/app.db`
- [x] `packages/ai`: `AIProvider` interface + Codex implementation
      (spawn, initialize, `model/list`, `thread/start`, `turn/start` stream, `thread/resume`).
      Generate protocol types with `codex app-server generate-ts` instead of hand-writing them.
- [x] Verify read-only sandbox / scratch cwd for drafting threads (asserted in provider tests)
- [x] "Connect Codex" screen (`/connect`): CLI found? signed in? models listed? + streamed test prompt with Stop

**Result:** verified in the browser 2026-09-27 — Plus account, 7 models, GPT-6-Luna @ low streamed
a reply in 5.7s; Stop interrupts the Codex turn server-side.

**Done when:** `pnpm dev` runs the app, the Connect screen shows the Codex login state and the
model list with efforts, and a test prompt streams a reply end to end.

### M1 — Drafting

- [x] New draft: model + effort pickers (from `model/list`), locked after first message
      → session is created on the first message (or first save); URL switches to `/drafts/[id]` in place.
      Before the first message `PATCH /api/drafts/[id]` may change them; after it the server returns 409.
- [x] Chat panel with streaming, stop, regenerate; persist messages
      → stopped replies are kept (flagged `interrupted`); Regenerate/Retry reverts the Codex turn
      (`thread/revert`) so the old reply leaves the model's context. One turn per draft at a time.
- [x] Draft doc panel (markdown editor), "Insert reply into doc", Save draft
      → Write/Preview tabs, inserts at the cursor, Ctrl/Cmd+S, unsaved-changes warning on tab close
- [x] Draft list; reopen a session (`thread/resume`); delete (also deletes the Codex thread)
- [x] Error states: Codex missing, signed out, rate-limited
      → page banner from `getStatus()`, per-turn errors carry an `AIErrorCode` mapped from
      `codexErrorInfo` (usage/rate limit, unauthorized, context full) with Retry where it helps

**Result:** verified in the browser 2026-09-27 on GPT-6-Astra @ low — new draft → streamed reply →
Regenerate (Codex then quoted the _regenerated_ hook, confirming the revert) → Insert into doc → Save →
reload; Stop keeps the partial reply; after a server restart a follow-up resumed the thread with context.
Signed-out / not-installed / rate-limited paths are covered by provider tests (fake app-server), not
reproduced live.

### M2 — Content

- [x] Content editor: topic, hook, beats (add/reorder/remove), CTA, target length, caption, hashtags
      → beats reorder via up/down buttons (no drag-and-drop yet — `@dnd-kit` is scoped to the
      calendar in M3); hashtags edited as one space/comma-separated field, parsed + deduped on save
- [x] Save (draft → saved), duplicate, delete
      → mirrors the drafting workspace: the row is created lazily on first Save and the URL
      switches to `/contents/[id]` in place; Duplicate copies fields as a fresh `draft`
- [x] Convert draft → content (Codex-assisted structuring into hook/beats/CTA)
      → `POST /api/drafts/[id]/convert` runs one turn on a fresh thread (the draft's own locked
      model/effort), asks Codex for a strict JSON reply, validates it against `contentSchema`,
      and creates the `Content` row; the editor links back to the source draft
- [x] Library with search and status filter
      → `/contents` filters via a plain GET form (`?q=&status=`), no client JS needed; status
      filters on the derived `DisplayStatus` (draft/saved/scheduled/posted/missed)

**Result:** verified in the browser 2026-09-27 — new content → filled topic/beat/hashtags → Save
(row created, URL switched in place) → reload confirmed persistence → Duplicate → Delete; library
search (`?q=`) and status filter both narrow correctly. Convert to Content run live against a real
saved draft (GPT-6-Astra): Codex returned well-formed hook/4 beats/CTA/caption/hashtags, the new
content linked back to "Open source draft" correctly (resolving `Content.sourceDraftId`, which
points at the draft _document_ id, to the session id used in `/drafts/[id]`).

### M3 — Calendar

- [x] Month + week views
      → `/calendar`, FullCalendar 7 (`@fullcalendar/react` + its `daygrid`/`timegrid`/`interaction`
      subpaths; there are no separate v7 plugin packages) with the `classic` theme recoloured from the
      shadcn tokens (`components/calendar/calendar.css`), so it follows dark mode. `?date=` opens on a day.
- [x] Tray of saved, unscheduled content; drag to schedule
      → `Draggable` with `create: false`; the `drop` handler `POST /api/schedule`s and the server
      refuses anything not `saved` (409). Month-view drops are all-day (`time = null`), week time-slot
      drops store `HH:mm`. The content editor also gets a keyboard-friendly **Schedule…** date/time form
- [x] Drag to reschedule, drag back to tray to unschedule
      → `eventDrop` → `PATCH /api/schedule/[id]` (reverts on error); an event released over the tray
      (`eventDragStop` hit-test) → `DELETE`. Durations aren't editable
- [x] Event quick-peek, open content, mark posted / missed
      → dialog with hook, date/time reschedule form, Mark posted / Mark missed / Back to scheduled,
      Unschedule, Open content. `postedAt` is stamped on → posted and cleared when leaving it.
      Colours: planned = primary, posted = green, missed = destructive

**Result:** verified in the browser 2026-09-27 — tray → month day (all-day) and tray → week 10:00
slot (stored `10:00`), event → tray unschedules, quick-peek Mark posted (green, timestamp shown),
reschedule via the dialog form kept `postedAt`, editor **Schedule…** → "Scheduled for Tue, Oct 6 ·
18:30" → "Open in calendar" lands on that month; library `?status=posted` picks up the derived
status. API: draft content → 409, bad date/time → 400. All entries are loaded at once (fine for a
personal planner; add a `from/to` range query if it grows).

**Known issue:** FullCalendar 7.1 renders `inert=""`, which React 19 logs as a dev-only console
warning on `/calendar`. Harmless; drop it once FullCalendar fixes it upstream.

### M4 — Daily-use polish

- [x] Home dashboard (this week, recent drafts, unscheduled)
      → `/` (replaces the placeholder): "This week" (a rolling 7-day `listEntriesInRange`),
      "Recent drafts" (top 5 of `listDrafts`), "Unscheduled contents" (top 5 of
      `listUnscheduledContents`), each linking to its full page
- [x] Global search
      → `/search?q=`, one query box over both contents (`listContents` search, already existed)
      and drafts (`listDrafts` gained a `search` filter matching title/body); grouped results,
      no separate index or fuzzy-search dependency — plain SQL `LIKE`, consistent with the library
- [x] JSON export / import backup
      → `/settings`: **Download backup** (`GET /api/export`, the whole db as one JSON file) and
      **Restore from backup…** (`POST /api/import`, behind a confirm dialog — it replaces every
      row). `packages/types` gained `backupSchema`; `packages/db` a `backup.ts` with
      `exportBackup`/`importBackup` (one transaction: delete children→parents, insert
      parents→children)

**Result:** verified in the browser 2026-09-28 — home dashboard shows the real coffee-Reel draft
and content from earlier milestones; `/search?q=coffee` matches both; `/api/export` returned all
5 tables' rows, and posting that export straight to `/api/import` round-tripped without losing
data (checked via the dashboard afterwards). Extracted the duplicated `timeAgo()` helper from
the contents/drafts list pages into `src/lib/time.ts` while touching those files.

### L — Landing page

- [x] Copy and full IA (hero, how it works, features, requirements, FAQ, footer)
      → `apps/landing/src/pages/index.astro`, single page, plain Astro/Tailwind (no React
      integration in this app) styled from the shared shadcn tokens; FAQ uses native
      `<details>`. Waitlist form is UI-only for now (submit disabled) — no backend chosen yet.
- [x] ~~Wire up the waitlist form to a real backend once one is chosen~~ → superseded in M5:
      the waitlist section was replaced by downloads
- [x] Astro build, deploy
      → `pnpm --filter landing build` verified clean (3 pages: `/`, `/privacy`, `/terms`) into
      `apps/landing/dist/`. Repo pushed to `github.com/hashfi-arissa/sm-agent`; `GITHUB_REPO` in
      `apps/landing/src/config.ts` points at it. Deployed to **Cloudflare Pages**, connected to
      that GitHub repo (auto-deploys on push to `main`) — build command
      `pnpm install --frozen-lockfile && pnpm --filter landing build`, output directory
      `apps/landing/dist`, root directory blank. Root `.nvmrc` (`22`) pins the Node version for
      Cloudflare's build image. Live at https://sm-agent-3of.pages.dev/ — verified in the browser
      2026-09-28: home page, `/privacy`, download links resolve to the real GitHub releases URL,
      no console errors. Custom subdomain on `hashfi.work` (via Hostinger DNS CNAME) not set up
      yet.

### M5 — Public release

- [x] Electron wrapper (spawns Next server + Codex bridge), Windows installer first
      → `apps/desktop`: esbuild-bundled main + preload (nothing from node_modules in app.asar).
      `scripts/stage.mjs` builds apps/app with `output: "standalone"` (`SMA_STANDALONE=1`),
      flattens pnpm's symlinks into real copies and hoists `.pnpm/node_modules` so Node can
      resolve everything, and stages migrations + this platform's Codex binary into `.stage/`;
      electron-builder ships them as `extraResources`. The server is forked from the Electron
      binary with `ELECTRON_RUN_AS_NODE=1` on `127.0.0.1:47831` (random port if taken; the fixed
      port keeps per-origin storage like the theme). Data lives in `%APPDATA%Social Media Agentdata`.
      `apps/app/src/proxy.ts` refuses requests without the per-launch `x-sma-token`, which the
      shell adds via `webRequest`. Single instance; external links and `window.open` go to the
      system browser; sandboxed renderer with a small `window.smaDesktop` bridge
      (`DesktopBridge` in `@repo/types`). Vendored Codex exes are excluded from our signing
      (`signExts`) so OpenAI's signatures stay; `licenses/` ships third-party notices + Apache-2.0
- [x] First-run onboarding for users without Codex CLI / not signed in
      → `/welcome`: Codex check ("built into the app" vs "installed on this computer",
      `ProviderStatus.bundled`), inline **Sign in with ChatGPT** that polls status and refreshes
      once signed in (shared `SignInButton`, also used on `/connect`). `/` redirects there until
      the `sma_onboarded` cookie is set by Start drafting / Go to Home / Skip for now
- [x] Auto-update, crash logging
      → `src/main/updater.ts`: checks 15 s after launch then every 6 h, downloads in the background,
      asks to restart (else installs on quit); Help menu + Settings → App show status and
      "Check for updates" / "Restart to update". Disabled when unpackaged or without
      `app-update.yml` (`--dir` builds). Logging: `main.log` (main + renderer console errors,
      uncaught errors, gone child/renderer processes), `server.log` (Next stdout/stderr), 5 MB
      rotation, Crashpad dumps with `uploadToServer: false`. Server crash → dialog with
      Restart / Open logs / Quit. Settings → App opens the data and logs folders
- [x] Privacy, Terms; landing switches from waitlist to downloads
      → `/privacy`, `/terms` (shared `LegalPage` layout), "Download for Windows" CTAs and a
      Download section pointing at `releases/latest`; FAQ covers bundled Codex, SmartScreen, updates.
      Plain-language drafts written from what the app actually does — get them reviewed before launch
- [x] Create the GitHub repo and replace the `OWNER/REPO` placeholders
      → `hashfi-arissa/sm-agent`, set in `apps/desktop/electron-builder.yml` `publish` and
      `apps/landing/src/config.ts`. Installer now installs to `Programssocial-media-agent`
      (`extraMetadata.name`; the workspace package is `desktop`)
- [ ] Make releases publicly reachable: the repo is **private**, so logged-out download links
      and the app's update check get 404 (seen in the installed app's log). Either make the repo
      public or publish releases to a separate public repo — never ship a token in the app
- [x] App icon → `apps/desktop/assets/icon.svg` is the source (9:16 Reel frame + play button +
      Codex sparkle on a dark tile); `icon.ico` (16–256 px, PNG-compressed) and `icon.png` (512 px,
      dev window) and both favicons are rendered from it by `pnpm --filter desktop icons`
- [ ] Code-signing certificate (`CSC_LINK`/`CSC_KEY_PASSWORD`) so SmartScreen stops warning
- [x] Publish v0.1.0 → https://github.com/hashfi-arissa/sm-agent/releases/tag/v0.1.0 (installer,
      `.blockmap`, `latest.yml`). Installed on the dev machine; the installed app's update check
      reports "up to date". **Known issue:** `pnpm --filter desktop release` started two GitHub
      publishers, both tried to create the release, and the second failed with `422 already_exists`
      before `latest.yml` was written — it and the blockmap were uploaded by hand via the API
      (installer verified byte-identical by SHA-256). Fixed: root cause is a race in electron-builder's
      `PublishManager.getOrCreatePublisher` (cache set after an `await`, so the installer and
      blockmap each create a publisher). `release` now builds with `--publish never` and
      `scripts/publish.mjs` uploads via the GitHub API into a draft, verifies GitHub's SHA-256,
      then publishes; `--dry-run` checks everything without touching GitHub
- [ ] Verify auto-update end to end: publish v0.1.1 and confirm the installed v0.1.0 updates
- [ ] Install on a clean Windows machine/VM (only tested on the dev machine so far)

**Result so far:** verified 2026-09-28 — `pnpm --filter desktop start` and the packaged
`release/win-unpacked` build both boot the server, create the db under `%APPDATA%`, and refuse
requests without the token (403). With Codex removed from `PATH` the bundled `codex.exe` ran and
`/welcome` showed "v0.157.1 · built into the app"; with an empty `CODEX_HOME` it showed the
signed-out step. A test prompt streamed through the packaged app (GPT-6-Astra @ low, 5.5 s).
Killing the server showed the crash dialog and Restart recovered; quitting leaves no `codex.exe`
or Electron processes. The NSIS installer builds (210 MB, most of it Codex) but hasn't been run
here, and auto-update needs two published releases to test. Next's file tracing doesn't copy
package LICENSE files — generating a complete license bundle is a good item for R.

## 7. Later / parking lot

- Thumbnail placement
- TikTok / YouTube Shorts (`ScheduleEntry.platform`)
- Auto-posting via Instagram Graph API
- Alternative AI providers (API key) via `AIProvider`
- Cloud sync / multi-device
