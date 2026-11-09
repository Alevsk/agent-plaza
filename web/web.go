package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// DistFS returns an fs.FS rooted at the dist directory.
func DistFS() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}
