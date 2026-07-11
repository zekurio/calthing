// Package frontend embeds the built SPA. Run `npm run build` in this
// directory (or let the Nix build copy the dist in) before building the
// binary; a fresh checkout compiles thanks to dist/.gitkeep.
package frontend

import "embed"

//go:embed all:dist
var Dist embed.FS
