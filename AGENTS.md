# AGENTS.md

## Scope

These instructions apply to the entire repository. Preserve user-authored changes and keep the application deployable as a static GitHub Pages site.

## Product

RPS OBE Studio is a browser-only editor for Rencana Pembelajaran Semester using Outcome-Based Education conventions for Universitas Diponegoro, FSM Informatics. It supports deterministic quality checks, optional OpenRouter-assisted drafting, local persistence, and HTML, JSON, DOCX, and Print/PDF export.

Production site: https://myudak.github.io/rps-obe-studio/
Repository: https://github.com/myudak/rps-obe-studio

## Active application

- `src/main.tsx` mounts `src/AppV2.tsx`. `src/App.tsx` is a legacy implementation and is not the active entrypoint.
- `src/components/rps/editor-sections.tsx` contains the five-step editor.
- `src/components/ai/chat-panel.tsx` contains streaming chat, structured drafts, retries, stale-draft protection, and quality-check navigation.
- `src/stores/rps-store.ts` and `src/stores/chat-store.ts` own application state.
- `src/hooks/use-app-persistence.ts` coordinates IndexedDB hydration and autosave.
- `src/lib/export.ts` and `src/lib/html-export.ts` generate downloadable documents.
- `src/assets/logo-undip.png` is the canonical UNDIP logo used by the app and favicon. Preserve its aspect ratio and transparency.

## Commands

```sh
npm install
npm run dev
npm run lint
npm run build
```

Node.js 20.19 or newer is required. GitHub Actions builds with Node.js 22. A successful build produces the portable single-file application at `dist/index.html`.

Before handing off a change, run at minimum:

```sh
npm run lint
npm run build
```

## Architecture and constraints

- The application is fully static. Do not introduce a required server unless the task explicitly changes the deployment architecture.
- Vite uses `base: "./"` and `vite-plugin-singlefile`; preserve relative-path compatibility for GitHub Pages and local `file://` use.
- `publicDir` is disabled. Runtime assets must be imported from `src` or referenced through Vite-managed HTML paths so they are included in the single-file build.
- Persisted workspace data lives in IndexedDB. The portable file location and deployed origin determine browser storage identity.
- RPS data and chat may be backed up, but credentials must never be included in exports or backups.
- OpenRouter keys support memory, session storage, or an encrypted local vault. Never hardcode, log, commit, or transmit a real API key outside the existing request flow.
- AI-generated structured drafts require explicit user approval before modifying form data. Preserve stale-draft detection and cancellation behavior.
- Keep validation deterministic and separate from model output.

## Design direction

The interface is an academic production workbench, not a generic SaaS landing page.

- Use neutral surfaces and UNDIP blue only for action, selection, progress, links, and meaningful status.
- Prefer typography, spacing, tables, and dividers over decorative containers.
- Avoid ornamental eyebrow labels, gradients, glow, glassmorphism, oversized radii, excessive pills, floating cards, sparkle icons, fake statistics, and decorative animation.
- Icons must improve recognition or communicate state; do not add icon tiles merely as decoration.
- Keep long-form editing compact and keyboard accessible.
- Mobile layouts should prioritize the current task rather than merely stack desktop panels.
- Preserve complete loading, empty, error, retry, disabled, saving, and stale-draft states.

## Deployment

`.github/workflows/deploy-pages.yml` runs on pushes to `main` and manual dispatch. It installs dependencies, lints, builds, uploads `dist`, and deploys through GitHub Pages.

- Do not commit `node_modules`, `dist`, or `release/RPS-OBE-Studio.html`.
- The source of truth is committed source plus `package-lock.json`.
- After pushing deployment changes, monitor the Actions run to completion and verify the live URL returns HTTP 200.
- GitHub Pages uses HTTPS and the repository is public.

## Handoff checklist

1. Explain the user-visible result.
2. List material files changed.
3. Report lint and build results.
4. State whether the change was pushed and deployed.
5. Include the commit hash, Actions run, and live URL when deployment was requested.
6. Call out any verification that could not be performed.
