# NixOS module: services.arr-cal-proxy
# Imported from the flake as `nixosModules.default`.
{ self }:

{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.arr-cal-proxy;
  settingsFormat = pkgs.formats.yaml { };
  configFile = settingsFormat.generate "arr-cal-proxy.yaml" cfg.settings;
in
{
  options.services.arr-cal-proxy = {
    enable = lib.mkEnableOption "arr-cal-proxy, a merged Radarr/Sonarr calendar feed";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.arr-cal-proxy;
      defaultText = lib.literalExpression "arr-cal-proxy from its flake";
      description = "The arr-cal-proxy package to use.";
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
        arr-cal-proxy configuration, serialized to YAML. See
        config.example.yaml in the source repository for all options.
        Reference secrets as ''${VAR} and provide them via environmentFile.
      '';
    };

    environmentFile = lib.mkOption {
      type = with lib.types; nullOr path;
      default = null;
      example = "/run/secrets/arr-cal-proxy.env";
      description = ''
        systemd EnvironmentFile providing the variables referenced as
        ''${VAR} in settings (API keys), e.g. from agenix or sops-nix.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.arr-cal-proxy = {
      description = "Merged Radarr/Sonarr calendar feed";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];

      serviceConfig = {
        ExecStart = "${lib.getExe cfg.package} -config ${configFile}";
        EnvironmentFile = lib.optional (cfg.environmentFile != null) cfg.environmentFile;
        Restart = "on-failure";
        DynamicUser = true;

        # Hardening
        CapabilityBoundingSet = "";
        LockPersonality = true;
        MemoryDenyWriteExecute = true;
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
        ];
      };
    };
  };
}
