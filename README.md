# arr-cal-proxy

One calendar for your whole \*arr stack. arr-cal-proxy queries the calendar APIs of any number of
Radarr and Sonarr instances and serves:

- **`/calendar.ics`** — a single merged iCal feed you can subscribe to from Google Calendar, Apple
  Calendar, or anything else that speaks iCal.
- **A web calendar** — a month grid and agenda view with posters, episode numbers, release-type
  badges (cinema / digital / physical), and downloaded status, served by the same process.

The backend runs on Deno with Elysia. The Svelte frontend uses Eden Treaty for end-to-end typed API
calls and TanStack Svelte Query for cancellation, caching, and request-state management.

Episodes appear as timed events at their air time; movie releases appear as all-day events, one per
release date. Event UIDs are stable, so subscribed calendars update in place instead of duplicating
on refresh.

## Running

```sh
arr-cal-proxy -config config.yaml
```

For a local source run, build the frontend first and start Deno:

```sh
deno task frontend:build
deno task start -config config.yaml
```

## Configuration

Copy [`config.example.yaml`](config.example.yaml) and adjust:

```yaml
listen: ':8080'

cache:
  ttl: 10m # reuse upstream responses this long

calendar:
  past_days: 30 # default window: today-30d .. today+90d
  future_days: 90
  availability_delay: 1h # show episodes after download/transcode time
  name: 'Media Calendar' # calendar name shown by clients

auth:
  token: '' # if set, /calendar.ics requires ?token=<value>

instances:
  - name: movies # unique, stable — part of event UIDs
    type: radarr
    url: http://127.0.0.1:7878
    api_key: ${RADARR_API_KEY}
    include_unmonitored: false
  - name: tv
    type: sonarr
    url: http://127.0.0.1:8989
    api_key: ${SONARR_API_KEY}
```

The web calendar branding and optional Jellyfin linking are configured separately:

```yaml
branding:
  name: Our Jellyfin
  icon_url: https://example.com/mark.svg # optional; built-in ticket icon otherwise
  page_title: 'Our Jellyfin · What is on'
  description: 'The shared movie and TV schedule.'

jellyfin:
  url: http://127.0.0.1:8096             # private API address
  public_url: https://jellyfin.example.com # links shown to visitors
  api_key: ${JELLYFIN_API_KEY}
```

When configured, arr-cal-proxy matches Sonarr episodes to Jellyfin by TVDB episode ID. Available
episodes get a direct Jellyfin link in their event details. The API key and private URL stay on the
server and are never returned to the browser.

`${VAR}` references are expanded from the environment at startup and fail loudly when unset — pair
them with a systemd `EnvironmentFile` for secrets. `ARR_CAL_PROXY_LISTEN`, `ARR_CAL_PROXY_TOKEN`,
and `ARR_CAL_PROXY_CONFIG` override their config counterparts. `ARR_CAL_PROXY_STATIC_DIR` can
override the frontend asset directory; packaged installations set it automatically.

**Auth model:** the optional token guards only `/calendar.ics` (calendar clients cannot send
headers, so it rides along as a query parameter). The web UI and `/api/*` are unauthenticated — put
them behind your reverse proxy's auth if they should not be reachable. Renaming an instance changes
its event UIDs, which re-creates those events in subscribed calendars; treat instance names as
stable.

## Endpoints

| Route               | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `GET /calendar.ics` | Merged iCal feed. Optional `?start=YYYY-MM-DD&end=YYYY-MM-DD`, `?token=`    |
| `GET /api/events`   | JSON events and per-instance status, with the same `start`/`end` parameters |
| `GET /api/health`   | Liveness probe                                                              |
| `GET /`             | Web calendar                                                                |

One instance being down never kills the feed: its error is reported in `/api/events` and shown in
the UI while the remaining instances serve.

## Nix

Build and run directly:

```sh
nix build
nix run . -- -config config.yaml
```

The package builds the Vite frontend separately, installs the Deno source and locked dependencies
into the Nix store, and exposes the same `arr-cal-proxy -config ...` executable contract.

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

### Updating dependencies

Dependencies are pinned by `deno.json` and `deno.lock`; the lockfile is the single source of truth.
The local `vendor/` (jsr modules, via `"vendor": true`) and `node_modules/` (npm packages)
directories are generated artifacts — `deno install` recreates both from the lockfile, and neither
is checked in. After changing dependency versions (`deno outdated --update` or editing `deno.json`),
run `deno install` and commit the updated `deno.json` and `deno.lock`.

Nix resolves the lockfile in a fixed-output derivation that emits both directories, with
target-specific hashes in `denoDepsHashes` in [`nix/package.nix`](nix/package.nix). After a
dependency change, regenerate all four hashes from any machine with
[`nix/update-deps-hashes.sh`](nix/update-deps-hashes.sh) (it replays the derivation's
`deno install --os/--arch` cross-install for every target and hashes the result), then paste its
output into `denoDepsHashes` and confirm with `nix build`.

## Development

The repository ships a [devenv](https://devenv.sh) and direnv setup. After `direnv allow`:

```sh
devenv up                         # Deno API :8080 and Vite :5173
deno task test                    # backend tests
deno task check                   # backend and frontend checks
deno task frontend:build          # production frontend
nix build                         # reproducible Deno-only package
```

The Vite development server proxies `/api` and `/calendar.ics` to the Deno backend.
`src/http/app.ts` is the Elysia API contract imported type-only by the Eden client; `shared/api.ts`
contains browser-safe DTOs. TanStack Query keys event requests by date window and passes its
`AbortSignal` through Eden.

The iCalendar serializer is covered by the byte-for-byte golden fixture at
`tests/fixtures/expected.ics`. Change that fixture only for intentional rendering changes, then run:

```sh
deno test --allow-read tests/ical.test.ts
```
