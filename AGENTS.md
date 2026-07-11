# Repository Guidelines

## Project Structure & Module Organization

The Go service starts in `cmd/arr-cal-proxy/main.go`. Keep application logic in
packages under `internal/`: `arr` calls Radarr/Sonarr, `fetch` manages
upstream retrieval and caching, `ical` renders feeds, `config` parses YAML, and
`server` owns HTTP handlers. Shared event types live in `internal/event`.

The Svelte frontend is in `frontend/src/`; reusable UI belongs in
`frontend/src/components/`, while API, date, and type helpers belong in
`frontend/src/lib/`. `frontend/embed.go` embeds the production `dist/` output.
Put Go fixture files beside their package in `testdata/`. Use
`config.example.yaml` as the configuration template. Nix
packaging and the NixOS module are in `nix/`.

## Build, Test, and Development Commands

- `devenv up` starts the Go API on `:8080` and Vite on `:5173`; Vite proxies API
  and calendar requests to the backend.
- `go test ./...` runs all Go unit and handler tests.
- `cd frontend && pnpm check` runs Svelte and TypeScript checks.
- `cd frontend && pnpm build` creates the embedded frontend.
- `go run ./cmd/arr-cal-proxy -config config.yaml` runs a production-style local
  server after the frontend build.
- `nix build` verifies the reproducible package build.

Regenerate the iCal golden fixture only for intentional rendering changes:
`go test ./internal/ical/ -update -run TestGenerateGolden`.

## Coding Style & Naming Conventions

Format Go with `gofmt`; use idiomatic package names and exported `PascalCase`
identifiers. Keep errors contextual (`fmt.Errorf("parse config: %w", err)`).
Follow the existing frontend style: TypeScript with single quotes, no
semicolons, and two-space indentation in `.ts` and `.svelte` files. Name
components in `PascalCase` (for example, `EventChip.svelte`) and helpers in
lower camel case.

## Testing Guidelines

Add `*_test.go` tests in the package being changed. Name tests
`TestBehavior` and use table-driven cases where several inputs share an
expectation. Exercise endpoint status, response content, and invalid input;
use static fixtures rather than live ARR services. Run both `go test ./...` and
`pnpm check` for changes that affect the web experience.

## Commit & Pull Request Guidelines

This repository has no commits yet, so no established commit convention can be
inferred. Use concise, imperative subjects such as `Add Radarr retry handling`.
Keep commits scoped. Pull requests should explain the user-visible effect,
describe configuration or API changes, link relevant issues, and include UI
screenshots when frontend behavior changes.

## Security & Configuration

Never commit `config.yaml`, API keys, or tokens. Use `${VAR}` references in
configuration and document settings in `config.example.yaml` and the
README. Treat instance names as stable because they form calendar event UIDs.
