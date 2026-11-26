package templates

import (
	"embed"
)

// EmbeddedFS embeds the default bundled pixel-art scene templates.
//
//go:embed arctic cowboys cyberpunk egypt forest japanese medieval office pirates space steampunk ww2
var EmbeddedFS embed.FS
