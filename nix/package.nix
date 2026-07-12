{
  lib,
  stdenvNoCC,
  deno,
  makeWrapper,
  version ? "0.1.0",
  denoDepsHashes ? {
    aarch64-darwin = "sha256-M+04/5t+8p+euVgqrCaGYLmN/88ZzxCwRgZ6V2EH59g=";
    x86_64-darwin = "sha256-bbNpUOYCQUPGNsmxEphncHWcYqoSgzEXEZ6Cy9Et3Pc=";
    aarch64-linux = "sha256-GUSQ2ZSJ4JvGy6gQzGatiUpHGA8wiGpAa2Q4B6VvrRY=";
    x86_64-linux = "sha256-J6LBGuq/Rgc/dZKFfGzpOHjlGz/AoZ8j/dnar/pw/ts=";
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
      ../vendor
    ];
  };

  projectSource = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../deno.json
      ../deno.lock
      ../frontend/index.html
      ../frontend/src
      ../frontend/svelte.config.js
      ../frontend/tsconfig.json
      ../frontend/vite.config.ts
      ../shared
      ../src
      ../vendor
    ];
  };

  denoNodeModules = stdenvNoCC.mkDerivation {
    pname = "arr-cal-proxy-deno-dependencies";
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
      cp -a node_modules/. $out/
      runHook postInstall
    '';

    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = denoDepsHashes.${system};
  };

  frontend = stdenvNoCC.mkDerivation {
    pname = "arr-cal-proxy-frontend";
    inherit version;
    src = projectSource;

    nativeBuildInputs = [ deno ];
    dontConfigure = true;

    buildPhase = ''
      runHook preBuild
      ln -s ${denoNodeModules} node_modules
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
  pname = "arr-cal-proxy";
  inherit version;
  src = projectSource;

  nativeBuildInputs = [ makeWrapper ];
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    app=$out/share/arr-cal-proxy
    mkdir -p $app $out/bin
    cp -r deno.json deno.lock shared src vendor $app/
    ln -s ${denoNodeModules} $app/node_modules
    cp -r ${frontend} $app/frontend

    makeWrapper ${deno}/bin/deno $out/bin/arr-cal-proxy \
      --add-flags "run --cached-only --frozen --no-prompt --config $app/deno.json --node-modules-dir=manual --allow-env --allow-net --allow-read $app/src/main.ts" \
      --set ARR_CAL_PROXY_STATIC_DIR "$app/frontend"

    runHook postInstall
  '';

  passthru = { inherit frontend; };

  meta = {
    description = "Merged Radarr/Sonarr calendar feed with a web UI";
    homepage = "https://github.com/zekurio/arr-cal-proxy";
    mainProgram = "arr-cal-proxy";
  };
}
