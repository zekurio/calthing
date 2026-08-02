# calthing

One calendar for your whole \*arr stack. calthing queries the calendar APIs of any number of Radarr
and Sonarr instances and serves them as a single merged iCal feed (`/calendar.ics`) plus a web
calendar with month, week, and agenda views, posters, episode numbers, release-type badges, and
downloaded status.

Episodes are timed events at their air time (shifted by `availability_delay`); movie releases are
all-day events, one per release date. Event UIDs are stable, so subscribed calendars update in place
instead of duplicating on refresh. One instance being down never kills the feed: its error is
reported per instance while the rest keep serving.

Optionally, Jellyfin can gate access and deep-link available episodes to their Jellyfin item.

### Deployment

The NixOS module is the preferred deployment path. calthing's listener serves HTTP; keep it on a
private interface and put an HTTPS reverse proxy in front when Jellyfin auth is enabled (the session
cookie is intentionally `Secure`). Add calthing to your flake inputs:

```nix
inputs.calthing.url = "github:zekurio/calthing";
```

Then import and configure the module:

```nix
{
  imports = [ inputs.calthing.nixosModules.default ];

  services.calthing = {
    enable = true;
    environmentFile = "/run/secrets/calthing.env"; # RADARR_API_KEY=..., CALTHING_FEED_SECRET=...
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

`settings` is serialized to YAML and passed as `-config`; the service runs hardened under
`DynamicUser`. You can also build and run it directly with `nix build` and
`nix run . -- -config config.yaml`, or from source with Deno 2:

```sh
deno task frontend:build
deno task start -config config.yaml
```

### Configuration

Copy [`config.example.yaml`](config.example.yaml) and adjust:

```yaml
listen: ':8080'

cache:
  ttl: 10m # reuse upstream responses this long

calendar:
  past_days: 30 # default window: today-30d .. today+90d (370 days maximum)
  future_days: 90
  availability_delay: 1h # show episodes after download/transcode time
  name: 'Media Calendar' # calendar name shown by clients
  feed_secret: ${CALTHING_FEED_SECRET} # signs per-user feed tokens; required with Jellyfin login

instances:
  - name: movies # unique and stable — part of event UIDs
    type: radarr
    url: http://127.0.0.1:7878
    api_key: ${RADARR_API_KEY}
    include_unmonitored: false
  - name: tv
    type: sonarr
    url: http://127.0.0.1:8989
    api_key: ${SONARR_API_KEY}

branding: # shown above the web calendar
  name: Our Jellyfin
  icon_url: https://example.com/mark.svg # optional; built-in ticket icon otherwise
  page_title: 'Our Jellyfin · What is on'
  description: 'The shared movie and TV schedule.'

jellyfin: # optional; `url` enables login, `public_url` + `api_key` enable event links
  url: http://127.0.0.1:8096
  public_url: https://jellyfin.example.com
  api_key: ${JELLYFIN_API_KEY}
```

`${VAR}` references are expanded from the environment at startup and fail loudly when unset — pair
them with a systemd `EnvironmentFile` for secrets. `CALTHING_CONFIG` and `CALTHING_LISTEN` override
their config counterparts; `CALTHING_STATIC_DIR` overrides the frontend asset directory (packaged
installs set it automatically).

Renaming an instance changes its event UIDs, which re-creates those events in subscribed calendars.

### Auth

Setting `jellyfin.url` turns on Jellyfin-backed auth, which also requires `calendar.feed_secret` — a
long random string, e.g. `nix shell nixpkgs#openssl --command openssl rand -hex 32`.

- **Web UI** — visitors sign in with their Jellyfin username and password. The access token is kept
  in an HttpOnly, Secure session cookie and re-validated against Jellyfin, so revoking the session
  there signs the visitor out here. Authenticated deployments must be exposed to browsers over HTTPS
  (normally by terminating TLS at a reverse proxy in front of calthing's HTTP listener).
- **Calendar feed** — calendar clients cannot log in, so each user gets a personal
  `/calendar.ics?token=…` URL (behind the copy-link button). The token is
  `<userId>.<HMAC-SHA256(secret, userId)>` and grants access to the feed only. Rotating
  `calendar.feed_secret` invalidates every feed URL at once.

Without `jellyfin.url`, the calendar and feed are public — put them behind your reverse proxy's auth
if they should not be reachable.

| Route               | Description                                                                        |
| ------------------- | ---------------------------------------------------------------------------------- |
| `GET /calendar.ics` | Merged iCal feed; optional `?start=YYYY-MM-DD&end=YYYY-MM-DD`, `?token=` with auth |
| `GET /api/events`   | JSON events, branding, and per-instance status; same `start`/`end` parameters      |
| `POST /api/auth`    | Jellyfin login; sets the session cookie                                            |
| `GET /api/me`       | Current session and personal feed token                                            |
| `POST /api/logout`  | Ends the session                                                                   |
| `GET /api/health`   | Liveness probe                                                                     |
| `GET /`             | Web calendar                                                                       |

### Development

With [devenv](https://devenv.sh) and direnv (provides Deno):

```sh
direnv allow
devenv up          # Deno API on :8080, Vite on :5173 proxying /api and /calendar.ics
```

Without Nix, install Deno 2 and run `deno task dev`. Other tasks:

```sh
deno task test              # backend tests
deno task check             # deno check + svelte-check
deno task frontend:build    # production frontend bundle
nix build                   # reproducible package build
```

Run `deno fmt`, `deno lint`, `deno task check`, and `deno task test` before opening a pull request.
[AGENTS.md](AGENTS.md) covers branch, commit, and code conventions.

Dependencies are pinned by `deno.json` and `deno.lock`; `vendor/` (jsr) and `node_modules/` (npm)
are regenerated by `deno install` and not checked in. After a dependency change, run `deno install`,
commit both files, regenerate the per-target hashes in `nix/package.nix` with
[`nix/update-deps-hashes.sh`](nix/update-deps-hashes.sh), and confirm with `nix build`.

### Contributing

Found a bug or have an idea? [Open an issue](https://github.com/zekurio/calthing/issues/new).

### License

[MIT](LICENSE)
