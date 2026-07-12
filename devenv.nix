{ lib, ... }:

{
  imports = lib.optional (builtins.pathExists ./devenv.local.nix) ./devenv.local.nix;

  # Avoid blocking shell startup on optional Cachix metadata checks. Nix's
  # configured substituters are still used for actual builds.
  cachix.enable = false;
  dotenv.disableHint = true;

  languages.deno.enable = true;

  # `devenv up` runs both dev servers; Vite proxies /api and /calendar.ics
  # to the Deno backend.
  processes = {
    backend.exec = "deno task backend:dev";
    frontend.exec = "deno task frontend:dev";
  };
}
