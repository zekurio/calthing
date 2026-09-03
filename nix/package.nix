{
  lib,
  stdenvNoCC,
  deno,
  makeWrapper,
  version ? "0.1.0",
  denoDepsHashes ? {
    aarch64-darwin = "sha256-2RkuSFVUGV/fIfUqr8DSHUeXn3YnMizQV9Ikk8ZCHZc=";
    x86_64-darwin = "sha256-9/4pxo1rX1xmC1akdBuiNGjGPh0NyMWvmVz4gII6WUQ=";
    aarch64-linux = "sha256-fmdgbEn1sMqbu7loBuqLEqjkpVonLQV3yel2piOX/n8=";
    x86_64-linux = "sha256-cbJiltdZxg0TMbGjy+6ayP5ceFgxgq+n1J3fP0Z7X5M=";
  },
}:

let
  system = stdenvNoCC.hostPlatform.system;
  targetOS = if stdenvNoCC.hostPlatform.isDarwin then "darwin" else "linux";
  targetArch = if stdenvNoCC.hostPlatform.isAarch64 then "arm64" else "x64";

  dependencySource = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../deno.json
      ../deno.lock
    ];
  };

  projectSource = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../deno.json
      ../deno.lock
      ../frontend/index.html
      ../frontend/public
      ../frontend/src
      ../frontend/svelte.config.js
      ../frontend/tsconfig.json
      ../frontend/vite.config.ts
      ../shared
      ../src
    ];
  };

  # Fixed-output derivation resolving deno.lock into the two artifact
  # directories Deno uses at run time: node_modules (npm packages) and
  # vendor (jsr modules, via `"vendor": true` in deno.json).
  denoDeps = stdenvNoCC.mkDerivation {
    pname = "calthing-deno-dependencies";
    inherit version;
    src = dependencySource;

    nativeBuildInputs = [ deno ];
    dontConfigure = true;

    buildPhase = ''
      runHook preBuild
      export DENO_DIR=$TMPDIR/deno-cache
      deno install --os ${targetOS} --arch ${targetArch} --frozen
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out
      rm -f node_modules/.deno/.setup-cache.bin node_modules/.deno/.deno.lock
      cp -a node_modules $out/node_modules
      cp -a vendor $out/vendor
      runHook postInstall
    '';

    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = denoDepsHashes.${system};
  };

  frontend = stdenvNoCC.mkDerivation {
    pname = "calthing-frontend";
    inherit version;
    src = projectSource;

    nativeBuildInputs = [ deno ];
    dontConfigure = true;

    buildPhase = ''
      runHook preBuild
      ln -s ${denoDeps}/node_modules node_modules
      ln -s ${denoDeps}/vendor vendor
      export DENO_DIR=$TMPDIR/deno-cache
      deno run --cached-only --node-modules-dir=manual -A vite build frontend
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      cp -r frontend/dist $out
      runHook postInstall
    '';
  };
in
stdenvNoCC.mkDerivation {
  pname = "calthing";
  inherit version;
  src = projectSource;

  nativeBuildInputs = [ makeWrapper ];
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    app=$out/share/calthing
    mkdir -p $app $out/bin
    cp -r deno.json deno.lock shared src $app/
    ln -s ${denoDeps}/node_modules $app/node_modules
    ln -s ${denoDeps}/vendor $app/vendor
    cp -r ${frontend} $app/frontend

    makeWrapper ${deno}/bin/deno $out/bin/calthing \
      --add-flags "run --cached-only --frozen --no-prompt --config $app/deno.json --node-modules-dir=manual --allow-env --allow-net --allow-read $app/src/main.ts" \
      --set CALTHING_STATIC_DIR "$app/frontend"

    runHook postInstall
  '';

  passthru = { inherit frontend; };

  meta = {
    description = "Merged Radarr/Sonarr calendar feed with a web UI";
    homepage = "https://github.com/zekurio/calthing";
    license = lib.licenses.mit;
    mainProgram = "calthing";
  };
}
