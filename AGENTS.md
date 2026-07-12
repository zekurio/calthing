# Repository Guidelines

## Project Structure & Module Organization

The Deno service starts in `src/main.ts`. Keep application logic under `src/`: `upstream` calls
Radarr/Sonarr, `services` owns fetching, caching, and iCalendar rendering, `config.ts` parses YAML,
`domain` defines normalized events, and `http` owns the Elysia application and static-file handling.
Browser-safe API DTOs live in `shared/api.ts`; keep that module free of Deno and server-runtime
imports.

The Svelte frontend is in `frontend/src/`; reusable UI belongs in `frontend/src/components/`, while
client, date, and query helpers belong in `frontend/src/lib/`. The Eden client imports the Elysia
`App` type only; never bundle server values into the frontend. Backend tests live in `tests/`, with
static fixtures under `tests/fixtures/`. Use `config.example.yaml` as the configuration template.
Nix packaging and the NixOS module are in `nix/`.

## Build, Test, and Development Commands

- `devenv up` starts the Deno API on `:8080` and Vite on `:5173`; Vite proxies API and calendar
  requests to the backend.
- `deno task test` runs backend unit and handler tests.
- `deno task check` type-checks backend and shared contracts, then runs Svelte and TypeScript
  checks.
- `deno task frontend:build` creates the production frontend.
- `deno task start -config config.yaml` runs a production-style local server after the frontend
  build.
- `nix build` verifies the reproducible package build.

The iCalendar golden fixture is `tests/fixtures/expected.ics`. Update it only for intentional
rendering changes, then run `deno test --allow-read tests/ical.test.ts`.

## Coding Style & Naming Conventions

Use TypeScript with single quotes, no semicolons, and two-space indentation in `.ts` and `.svelte`
files. Keep Deno and browser boundaries explicit, prefer Web `Request`, `Response`, and
`AbortSignal`, and keep errors contextual. Name components in `PascalCase` (for example,
`EventChip.svelte`) and helpers in lower camel case. Format backend code with `deno fmt`.

## Testing Guidelines

Add `*.test.ts` tests under `tests/` for backend changes. Use table-driven cases where several
inputs share an expectation. Exercise endpoint status, response content, invalid input,
cancellation, cache boundaries, and partial upstream failures. Use static fixtures rather than live
ARR services. Run both `deno task test` and `deno task check` for changes that affect the web
experience.

## Commit & Pull Request Guidelines

Use conventional commit-style messages and pull request titles: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes are optional; use the
affected area when helpful, for example `frontend`, `server`, `config`, or `nix`.

Examples: `fix(frontend): preserve calendar view`, `docs: update configuration guide`,
`chore(nix): refresh dependency hashes`.

Keep commits scoped. Pull requests should explain the user-visible effect, describe configuration or
API changes, link relevant issues, and include UI screenshots when frontend behavior changes.

## Security & Configuration

Never commit `config.yaml`, API keys, or tokens. Use `${VAR}` references in configuration and
document settings in `config.example.yaml` and the README. Treat instance names as stable because
they form calendar event UIDs.
