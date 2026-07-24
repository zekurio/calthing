{
  description = "calthing — merged Radarr/Sonarr calendar feed with a web UI";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      # The dev environment lives in devenv.nix (https://devenv.sh); this flake
      # is the packaging/NixOS entrypoint only.
      packages = forAllSystems (pkgs: rec {
        calthing = pkgs.callPackage ./nix/package.nix { };
        frontend = calthing.frontend;
        default = calthing;
      });

      checks = nixpkgs.lib.genAttrs systems (system: {
        default = self.packages.${system}.default;
      });

      nixosModules.default = import ./nix/module.nix { inherit self; };
    };
}
