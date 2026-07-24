# NixOS module: services.calthing
# Imported from the flake as `nixosModules.default`.
{ self }:

{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.calthing;
  settingsFormat = pkgs.formats.yaml { };
  configFile = settingsFormat.generate "calthing.yaml" cfg.settings;
in
{
  options.services.calthing = {
    enable = lib.mkEnableOption "calthing, a merged Radarr/Sonarr calendar feed";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.calthing;
      defaultText = lib.literalExpression "calthing from its flake";
      description = "The calthing package to use.";
    };

    settings = lib.mkOption {
      type = settingsFormat.type;
      default = { };
      example = lib.literalExpression ''
        {
          listen = ":8080";
          instances = [
            {
              name = "movies";
              type = "radarr";
              url = "http://127.0.0.1:7878";
              api_key = "\''${RADARR_API_KEY}";
            }
          ];
        }
      '';
      description = ''
        calthing configuration, serialized to YAML. See
        config.example.yaml in the source repository for all options.
        Reference secrets as ''${VAR} and provide them via environmentFile.
      '';
    };

    environmentFile = lib.mkOption {
      type = with lib.types; nullOr path;
      default = null;
      example = "/run/secrets/calthing.env";
      description = ''
        systemd EnvironmentFile providing the variables referenced as
        ''${VAR} in settings (API keys), e.g. from agenix or sops-nix.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.calthing = {
      description = "Merged Radarr/Sonarr calendar feed";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];

      serviceConfig = {
        ExecStart = "${lib.getExe cfg.package} -config ${configFile}";
        EnvironmentFile = lib.optional (cfg.environmentFile != null) cfg.environmentFile;
        Environment = "DENO_DIR=%C/calthing";
        CacheDirectory = "calthing";
        Restart = "on-failure";
        DynamicUser = true;

        # Hardening
        CapabilityBoundingSet = "";
        LockPersonality = true;
        NoNewPrivileges = true;
        PrivateDevices = true;
        PrivateTmp = true;
        ProtectClock = true;
        ProtectControlGroups = true;
        ProtectHome = true;
        ProtectHostname = true;
        ProtectKernelLogs = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectProc = "invisible";
        ProtectSystem = "strict";
        RestrictAddressFamilies = [
          "AF_INET"
          "AF_INET6"
          "AF_UNIX"
        ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;
        SystemCallArchitectures = "native";
        SystemCallFilter = [
          "@system-service"
          "~@privileged"
          # Deno/V8 uses memory protection keys during startup. These are part
          # of systemd's @privileged group, so allow them back explicitly.
          "pkey_alloc"
          "pkey_free"
          "pkey_mprotect"
        ];
      };
    };
  };
}
