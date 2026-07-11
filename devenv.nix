{ pkgs, lib, ... }:

{
  imports = lib.optional (builtins.pathExists ./devenv.local.nix) ./devenv.local.nix;

  # Avoid blocking shell startup on optional Cachix metadata checks. Nix's
  # configured substituters are still used for actual builds.
  cachix.enable = false;

  languages.go.enable = true;

  # Node/pnpm come from the same nixpkgs channel nix/package.nix builds with
  # (pinned in devenv.yaml), so dev and packaging stay aligned by construction.
  languages.javascript = {
    enable = true;
    pnpm.enable = true;
  };

  packages = with pkgs; [
    gopls
    gotools
    typescript-language-server
  ];

  # `devenv up` runs both dev servers; Vite proxies /api and /calendar.ics
  # to the Go backend.
  processes = {
    backend.exec = "go run ./cmd/arr-cal-proxy -config config.yaml";
    frontend.exec = "cd frontend && pnpm dev";
  };
}
