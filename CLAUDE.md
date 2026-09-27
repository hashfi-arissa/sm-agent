# Social Media Agent

Local-first app to draft, structure and schedule **Instagram Reels**, plus an Astro landing page.
Full scope, IA, data model and milestone checklists: **[docs/PLAN.md](docs/PLAN.md)** — read it
before starting work, and tick its checklists / update the milestone Status when work lands.

## Hard constraints
- **AI = the user's Codex subscription via the local `codex app-server`, never the OpenAI API.**
  The app must run on the user's machine. Do not add API-key calls or a hosted AI backend.
- All AI access goes through the `AIProvider` interface in `packages/ai`; UI and routes never
  talk to Codex directly.
- Drafting threads run Codex with a **read-only sandbox, no approvals, in an empty scratch cwd** —
  it must never edit files or run commands on the user's machine.
- A draft session's `model` and `effort` are locked after the first message.
- Only content with `status = saved` can be placed on the calendar. Scheduling state lives on
  `ScheduleEntry`, not on `Content`.
- Out of scope until asked: thumbnail placement, non-Reels platforms, auto-posting, multi-user.

## Stack
pnpm + Turborepo · Next.js 16 (App Router) · Astro 7 · TypeScript · Tailwind 4 + shadcn/ui ·
SQLite (`better-sqlite3`) + Drizzle · zod 4 · FullCalendar 7 · @dnd-kit · Electron (M5).

## Layout
- `apps/app` — Next.js app (localhost)
- `apps/landing` — Astro landing page
- `packages/ai` — `AIProvider` + `codex/` app-server bridge
- `packages/db` — Drizzle schema, migrations, queries
- `packages/types` — shared zod schemas
- `packages/ui` — shared components
- `data/` — local SQLite db (gitignored)

## Commands
_Filled in once the monorepo is scaffolded (M0)._

## Conventions
- Platform: Windows dev machine; keep scripts cross-platform (no bash-only npm scripts).
- Line endings are LF (`.gitattributes`).
- Validate every API route input with the shared zod schemas from `packages/types`.
- Schedule dates are stored as local `date` (`YYYY-MM-DD`) + optional `time` (`HH:mm`), not UTC timestamps.
