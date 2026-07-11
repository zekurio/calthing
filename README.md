# arr-cal-proxy

One calendar for your whole \*arr stack. arr-cal-proxy queries the calendar
APIs of any number of Radarr and Sonarr instances and serves:

- **`/calendar.ics`** — a single merged iCal feed you can subscribe to from
  Google Calendar, Apple Calendar, or anything else that speaks iCal.
- **A web calendar** — a month grid and agenda view with posters, episode
  numbers, release-type badges (cinema / digital / physical), and
  downloaded-status, embedded in the binary.

Episodes appear as timed events at their air time; movie releases appear as
all-day events, one per release date. Event UIDs are stable, so subscribed
calendars update in place instead of duplicating on refresh.

## Running

```sh
arr-cal-proxy -config config.yaml
```

## Configuration

Copy [`config.example.yaml`](config.example.yaml) and adjust:

```yaml
listen: ":8080"

cache:
  ttl: 10m               # reuse upstream responses this long

calendar:
  past_days: 30          # default window: today-30d .. today+90d
  future_days: 90
  name: "Media Calendar" # calendar name shown by clients

auth:
  token: ""              # if set, /calendar.ics requires ?token=<value>

instances:
  - name: movies         # unique, stable — part of event UIDs
    type: radarr
    url: http://127.0.0.1:7878
    api_key: ${RADARR_API_KEY}
    include_unmonitored: false
  - name: tv
    type: sonarr
    url: http://127.0.0.1:8989
    api_key: ${SONARR_API_KEY}
```

`${VAR}` references are expanded from the environment at startup and fail
loudly when unset — pair them with a systemd `EnvironmentFile` for secrets.
`ARR_CAL_PROXY_LISTEN`, `ARR_CAL_PROXY_TOKEN`, and `ARR_CAL_PROXY_CONFIG`
override their config counterparts.

**Auth model:** the optional token guards only `/calendar.ics` (calendar
clients can't send headers, so it rides along as a query parameter). The web
UI and `/api/*` are unauthenticated — put them behind your reverse proxy's
auth if they shouldn't be reachable. Renaming an instance changes its event
UIDs, which re-creates those events in subscribed calendars; treat instance
names as stable.

## Endpoints

| Route | Description |
| --- | --- |
| `GET /calendar.ics` | Merged iCal feed. Optional `?start=YYYY-MM-DD&end=YYYY-MM-DD`, `?token=` |
| `GET /api/events` | JSON events + per-instance status, same `start`/`end` params |
| `GET /api/health` | Liveness probe |
| `GET /` | Web calendar |

One instance being down never kills the feed: its error is reported in
`/api/events` (and shown in the UI) while the remaining instances serve.

## Nix

Build and run directly:

```sh
nix build   # or: nix run . -- -config config.yaml
```

NixOS module:

```nix
{
  inputs.arr-cal-proxy.url = "github:zekurio/arr-cal-proxy";

  # in a nixosConfiguration:
  imports = [ inputs.arr-cal-proxy.nixosModules.default ];

  services.arr-cal-proxy = {
    enable = true;
    environmentFile = "/run/secrets/arr-cal-proxy.env"; # RADARR_API_KEY=...
    settings = {
      listen = ":8080";
      instances = [
        {
          name = "movies";
          type = "radarr";
          url = "http://127.0.0.1:7878";
          api_key = "\${RADARR_API_KEY}";
        }
      ];
    };
  };
}
```

### Updating dependency hashes

[`nix/package.nix`](nix/package.nix) pins two fixed-output hashes. When
`frontend/pnpm-lock.yaml` changes, update `pnpmDepsHash`; when `go.mod`
changes, update `vendorHash`: set the stale hash to `lib.fakeHash`, run
`nix build`, and copy the `got:` hash from the error message.
`pnpm-lock.yaml` must stay committed — `fetchPnpmDeps` requires it.

## Development

The repo ships a [devenv](https://devenv.sh) + direnv setup: `direnv allow`
gives you Go, Node, and the language servers.

```sh
devenv up        # runs the Go backend (:8080) and Vite dev server (:5173)
go test ./...    # backend tests
cd frontend && pnpm check   # svelte-check
```

The Vite dev server proxies `/api` and `/calendar.ics` to the Go backend.
For a production-style run, `cd frontend && pnpm build`, then
`go run ./cmd/arr-cal-proxy` — the built SPA is embedded via `go:embed`.

The iCal golden test regenerates with
`go test ./internal/ical/ -update -run TestGenerateGolden`.
