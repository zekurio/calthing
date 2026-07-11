{
  lib,
  stdenvNoCC,
  buildGoModule,
  fetchPnpmDeps,
  pnpmConfigHook,
  pnpm,
  nodejs,
  version ? "0.1.0",
  # Update on frontend/pnpm-lock.yaml changes: set to lib.fakeHash, run
  # `nix build .#frontend`, copy the "got:" hash from the error.
  pnpmDepsHash ? "sha256-4zFYAkl9aEi4FBiegMYMx1LHrJNQDJy2jiZQVpbVcfs=",
  # Update on go.mod changes, same fakeHash workflow via `nix build`.
  vendorHash ? "sha256-TTWi9Ul3snmNNg74tOiHS45WZd6eu0hiDYnX2vdu9FY=",
}:

let
  frontend = stdenvNoCC.mkDerivation (finalAttrs: {
    pname = "arr-cal-proxy-frontend";
    inherit version;
    src = ../frontend;

    pnpmDeps = fetchPnpmDeps {
      inherit (finalAttrs) pname version src;
      inherit pnpm;
      fetcherVersion = 4;
      hash = pnpmDepsHash;
    };

    nativeBuildInputs = [
      nodejs
      pnpm
      pnpmConfigHook
    ];

    buildPhase = ''
      runHook preBuild
      pnpm build
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      cp -r dist $out
      runHook postInstall
    '';
  });
in
buildGoModule {
  pname = "arr-cal-proxy";
  inherit version vendorHash;
  src = ../.;

  # The binary embeds the built SPA (frontend/embed.go).
  preBuild = ''
    rm -rf frontend/dist
    cp -r ${frontend} frontend/dist
  '';

  subPackages = [ "cmd/arr-cal-proxy" ];
  ldflags = [
    "-s"
    "-w"
  ];

  passthru = { inherit frontend; };

  meta = {
    description = "Merged Radarr/Sonarr calendar feed with a web UI";
    homepage = "https://github.com/zekurio/arr-cal-proxy";
    mainProgram = "arr-cal-proxy";
  };
}
