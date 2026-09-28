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
- In the desktop app the server listens on 127.0.0.1 and `apps/app/src/proxy.ts` rejects any request
  without the per-launch `x-sma-token` header. Don't add routes or assets that bypass it.
- Only content with `status = saved` can be placed on the calendar. Scheduling state lives on
  `ScheduleEntry`, not on `Content`.
- Out of scope until asked: thumbnail placement, non-Reels platforms, auto-posting, multi-user.

## Stack

pnpm + Turborepo · Next.js 16 (App Router) · Astro 7 · TypeScript · Tailwind 4 + shadcn/ui ·
SQLite (`better-sqlite3`) + Drizzle · zod 4 · FullCalendar 7 · @dnd-kit · Electron 44 + electron-builder/electron-updater.

## Layout

- `apps/app` — Next.js app (localhost)
- `apps/desktop` — Electron shell: forks the app's standalone server, bundles Codex, updater, logs
- `apps/landing` — Astro landing page
- `packages/ai` — `AIProvider` + `codex/` app-server bridge
- `packages/db` — Drizzle schema, migrations, queries
- `packages/types` — shared zod schemas
- `packages/ui` — shared Tailwind theme (`globals.css`) + shadcn components
- `packages/typescript-config`, `packages/eslint-config` — shared configs
- `data/` — local SQLite db (gitignored)

Internal packages are consumed as TypeScript source (no build step); import them as `@repo/<name>`.

## Commands

Run from the repo root:

- `pnpm dev` — app on http://localhost:3000 + landing on http://localhost:4321
- `pnpm dev:app` / `pnpm dev:landing` — just one of them
- `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` — all via Turborepo (tests: vitest)
- `pnpm format` / `pnpm format:check` — Prettier (with Astro + Tailwind plugins)
- Add a shadcn component (lands in `packages/ui`): `pnpm dlx shadcn@latest add <name> -c apps/app`
- DB: edit `packages/db/src/schema.ts`, then `pnpm --filter @repo/db db:generate` (migrations
  apply automatically when the app opens the db)
- Codex protocol types after a CLI upgrade: `pnpm --filter @repo/ai codex:types`
- Live Codex check (uses real ChatGPT quota, so opt-in): `CODEX_LIVE=1 pnpm --filter @repo/ai test`
- Icons: edit `apps/desktop/assets/icon.svg`, then `pnpm --filter desktop icons` (app icon + both favicons)
- Desktop: `pnpm --filter desktop stage` (standalone app build + Codex into `.stage/`; re-run after
  app changes), then `pnpm --filter desktop start`. Set `SMA_APP_URL=http://localhost:3000` to run
  the shell against `pnpm dev` instead. Installer: `pnpm --filter desktop dist` → `apps/desktop/release/`
  `pnpm --filter desktop release` builds and publishes to GitHub via `scripts/publish.mjs`
  (needs `GH_TOKEN` in the env or `apps/desktop/electron-builder.env`; bump `version` first;
  `release:upload --dry-run` checks everything without publishing)

Before calling work done: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass.
For UI changes, also check it in the browser (`/connect` exercises Codex end to end).

## Conventions

- Platform: Windows dev machine; keep scripts cross-platform (no bash-only npm scripts).
- Line endings are LF (`.gitattributes`).
- TypeScript 5.9 everywhere — create-next-app 16 targets TS 5; don't bump to TS 7 without
  confirming Next.js supports it.
- `apps/app` and `apps/landing` each have their own `AGENTS.md` with framework-specific notes
  (Next 16 / Astro 7 differ from older versions) — read it before working in that app.
- Validate every API route input with the shared zod schemas from `packages/types`.
- Server code gets singletons from `getAIProvider()` (`@repo/ai`) and `getDb()` (`@repo/db`);
  both survive Next dev reloads. Pages that call them must be dynamic (`await connection()`),
  so `next build` never starts Codex.
- AI replies stream to the browser as NDJSON `ChatEvent`s (see `/api/codex/test`); pass
  `request.signal` through so closing the request interrupts the Codex turn.
- Codex model ids and effort values come from `model/list` at runtime — never hardcode them.
- Schedule dates are stored as local `date` (`YYYY-MM-DD`) + optional `time` (`HH:mm`), not UTC timestamps.
- Desktop-only UI talks to Electron through `getDesktop()` (`src/lib/desktop.ts`, typed by
  `DesktopBridge` in `@repo/types`) and must render nothing when it returns null (`pnpm dev`).
- FullCalendar 7 has no separate plugin packages: import them from `@fullcalendar/react/<plugin>`
  (`daygrid`, `timegrid`, `interaction`, `themes/classic`); the theme is recoloured in
  `apps/app/src/components/calendar/calendar.css`.
