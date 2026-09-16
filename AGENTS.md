# AGENTS.md

## Scope

These instructions apply to the entire repository. Preserve user-authored changes and keep the application deployable as a static GitHub Pages site.

## Product

RPS OBE Studio is an end-to-end academic workspace for Rencana Pembelajaran Semester and Outcome-Based Education workflows at Universitas Diponegoro, FSM Informatics. The repository deliberately supports two runtimes:

- Platform mode uses Fastify, PostgreSQL, Drizzle, Better Auth, server-side AI SDK/OpenRouter, and role-scoped academic workflows.
- Portable mode remains a browser-only editor with IndexedDB persistence and single-file export for GitHub Pages/offline use.

Production site: https://myudak.github.io/rps-obe-studio/
Repository: https://github.com/myudak/rps-obe-studio

## Active application

- `src/main.tsx` mounts `src/RootApp.tsx`. RootApp selects platform mode when the API is available and portable mode when explicitly requested with `?portable=1` or when a production API is unavailable.
- `src/platform/Workspace.tsx` owns the authenticated shell and hash-based routing. Platform pages live in `src/platform/`.
- `src/platform/Editor.tsx` wraps the five-step editor with server autosave, optimistic concurrency, submission, preview/export, and AI chat.
- `src/platform/EditorChat.tsx` owns the collapsed, docked/resizable, and fullscreen server-backed chat UI.
- `src/platform/AdminStudio.tsx` is the SUPERADMIN operational console for account/role management, guarded impersonation, health checks, audit, demo scenarios, and the schema-driven record browser.
- `src/platform/OutcomeWorkspaces.tsx` owns course/curriculum workspaces, normalized outcomes, I/R/M mapping, actual-vs-target radar, coverage heatmap, longitudinal attainment/CQI, governance proposals, and RPS carry-forward.
- `src/AppV2.tsx` is the preserved portable implementation. `src/App.tsx` is legacy and is not active.
- `src/components/rps/editor-sections.tsx` contains the five-step editor.
- `src/components/ai/chat-panel.tsx` contains streaming chat, structured drafts, retries, stale-draft protection, and quality-check navigation.
- `src/lib/editor-targets.ts` is the canonical registry for trusted editor destinations, labels, steps, and value types. UI fields use matching `data-editor-target` attributes.
- `src/lib/ai-tools.ts` defines the OpenRouter chat tools and validates review-before-apply field changes. Never let a model write directly to the RPS store.
- `src/lib/openrouter-chat.ts` assembles streamed tool calls and falls back to text chat when a provider rejects tools.
- `src/stores/rps-store.ts` and `src/stores/chat-store.ts` own application state.
- `src/hooks/use-app-persistence.ts` coordinates IndexedDB hydration and autosave.
- `src/lib/export.ts` and `src/lib/html-export.ts` generate downloadable documents.
- `src/assets/logo-undip.png` is the canonical UNDIP logo used by the app and favicon. Preserve its aspect ratio and transparency.
- `server/app.ts` builds the Fastify application; `server/index.ts` only starts and stops it.
- `server/db/schema.ts` is the Drizzle source of truth. Commit generated SQL migrations under `drizzle/`; do not replace migrations with ad-hoc schema mutation.
- `server/routes/` enforces authorization. Hiding controls in React is never sufficient access control.
- `server/routes/data-browser-routes.ts` exposes the Drizzle table catalog, typed columns, record details, and bidirectional foreign-key navigation to non-impersonating SUPERADMIN only. Never expose credential values or raw SQL. Master-field edits require an explicit allowlist, validation, optimistic revision checks, and audit; deletion rejects referenced records. Workflow/auth/derived fields stay under their dedicated controllers.
- `src/components/app-sidebar.tsx` uses the official shadcn sidebar-02 structure. Use actual shadcn Drawer/Dialog primitives for admin overlays.
- `server/routes/full-demo-routes.ts` builds isolated synthetic academic data and invokes real assessment sync/calculation. Preserve its idempotency and manifest-based reset; never reset unrelated data.
- `server/routes/outcome-system-routes.ts` owns the normalized curriculum/course outcome model and object-centric workspace contracts.
- `.data/cqi-evidence/` is non-public runtime storage and must not be committed.

## Commands

```sh
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm lint
pnpm build
```

Node.js 20.19 or newer is required; Node.js 22 is recommended. Use the pinned pnpm version from `packageManager`. A successful build type-checks both runtimes and produces the portable single-file application at `dist/index.html`.

Before handing off a change, run at minimum:

```sh
pnpm lint
pnpm build
```

## Architecture and constraints

- Platform features require the Fastify API and PostgreSQL. Keep portable mode functional and statically deployable unless the task explicitly removes it.
- Vite uses `base: "./"` and `vite-plugin-singlefile`; preserve relative-path compatibility for GitHub Pages and local `file://` use.
- `publicDir` is disabled. Runtime assets must be imported from `src` or referenced through Vite-managed HTML paths so they are included in the single-file build.
- Persisted workspace data lives in IndexedDB. The portable file location and deployed origin determine browser storage identity.
- RPS data and chat may be backed up, but credentials must never be included in exports or backups.
- OpenRouter keys support memory, session storage, or an encrypted local vault. Never hardcode, log, commit, or transmit a real API key outside the existing request flow.
- AI-generated structured drafts require explicit user approval before modifying form data. Preserve stale-draft detection and cancellation behavior.
- AI field changes are persisted as proposal cards and require explicit approval. Navigation actions may change the active step and focus a field, but must not mutate RPS data.
- Keep editor target IDs stable because saved chat actions and proposals may reference them after reload.
- Keep validation deterministic and separate from model output.
- Never let AI output mutate RPS fields directly. Both runtimes require an explicit, non-stale proposal approval.
- Preserve numeric RPS revisions and `If-Match` conflict handling. Submitted and verified documents are read-only; edits require a revision/new version.
- Approval order is GPM then Kaprodi. Preserve atomic decisions, audit history, program scope, and the self-approval prohibition.
- Grade import is preview-then-commit and atomic. Never overwrite released grades; draft overwrite requires explicit confirmation.
- CQI evidence is PDF/PNG/JPEG up to 10 MB and is served only through authenticated endpoints.
- Better Auth impersonation is restricted to domain SUPERADMIN users, requires a reason, cannot target SUPERADMIN or ADMIN_PRODI, expires after 30 minutes, and must retain a visible banner. Audit writes during impersonation include the original administrator profile.
- Demo reset is manifest-based: delete only the exact IDs created by that scenario. It is not a general database reset facility.
- Curriculum outcomes, course outcomes, sub-outcomes, and their mappings are normalized records. Preserve calculation-run history; charts must use stored achievements and must render an honest empty state rather than mock values.
- CPL calculation formula v1 is recorded in run parameters. Do not silently change the formula; a future formula change needs explicit versioning and migration/communication.
- RPS collection limits are flexible within the schema bounds. Keep editor target IDs stable when allowing row add/remove, and clean dependent mappings when a row is removed.

## Design direction

- The shared shadcn preset is `bJysiAn4S`: Base Nova, neutral base, sky theme, Geist body, Inter headings, bold menu accent. Keep `components.json`, shared UI components, and CSS tokens aligned; do not reintroduce separate hardcoded workspace colors.
- `src/platform/WorkspaceHeader.tsx` owns breadcrumbs, program/period filters, and the account menu. Login adapts shadcn login-02 through `src/components/login-form.tsx`; the supplied Unsplash image is decorative and externally loaded, with a solid-blue fallback. Authentication must work if that image is unavailable.

The interface is an academic production workbench, not a generic SaaS landing page.

- Use neutral surfaces and UNDIP blue only for action, selection, progress, links, and meaningful status.
- Prefer typography, spacing, tables, and dividers over decorative containers.
- Avoid ornamental eyebrow labels, gradients, glow, glassmorphism, oversized radii, excessive pills, floating cards, sparkle icons, fake statistics, and decorative animation.
- Icons must improve recognition or communicate state; do not add icon tiles merely as decoration.
- Keep long-form editing compact and keyboard accessible.
- Mobile layouts should prioritize the current task rather than merely stack desktop panels.
- Preserve complete loading, empty, error, retry, disabled, saving, and stale-draft states.

## Deployment

`.github/workflows/deploy-pages.yml` runs on pushes to `main` and manual dispatch. It installs dependencies with pnpm, lints, builds, uploads `dist`, and deploys the portable runtime through GitHub Pages. It does not deploy Fastify, PostgreSQL, or uploaded CQI evidence.

- Do not commit `node_modules`, `dist`, or `release/RPS-OBE-Studio.html`.
- The source of truth is committed source plus `pnpm-lock.yaml`; do not recreate or commit `package-lock.json`.
- After pushing deployment changes, monitor the Actions run to completion and verify the live URL returns HTTP 200.
- GitHub Pages uses HTTPS and the repository is public.

## Handoff checklist

1. Explain the user-visible result.
2. List material files changed.
3. Report lint and build results.
4. State whether the change was pushed and deployed.
5. Include the commit hash, Actions run, and live URL when deployment was requested.
6. Call out any verification that could not be performed.
