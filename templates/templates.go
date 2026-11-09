package templates

import (
	"embed"
)

// EmbeddedFS embeds the default bundled pixel-art scene templates.
//
//go:embed cowboys cyberpunk japanese medieval office ww2
var EmbeddedFS embed.FS
