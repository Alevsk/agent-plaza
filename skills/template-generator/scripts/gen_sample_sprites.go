package main

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
)

func parseHex(s string) color.RGBA {
	if len(s) != 7 || s[0] != '#' {
		return color.RGBA{0, 0, 0, 0}
	}
	hex := func(b byte) uint8 {
		switch {
		case b >= '0' && b <= '9':
			return b - '0'
		case b >= 'a' && b <= 'f':
			return b - 'a' + 10
		case b >= 'A' && b <= 'F':
			return b - 'A' + 10
		}
		return 0
	}
	return color.RGBA{
		R: (hex(s[1]) << 4) | hex(s[2]),
		G: (hex(s[3]) << 4) | hex(s[4]),
		B: (hex(s[5]) << 4) | hex(s[6]),
		A: 255,
	}
}

func saveGridPNG(path string, grid []string, palette map[byte]string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	h := len(grid)
	w := len(grid[0])
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y, row := range grid {
		for x := 0; x < len(row); x++ {
			ch := row[x]
			if hexStr, ok := palette[ch]; ok {
				img.SetRGBA(x, y, parseHex(hexStr))
			}
		}
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, img)
}

func main() {
	// 1. Saguaro Desert Cactus (16x16) for templates/cowboys/sprites/cactus.png
	cactusGrid := []string{
		"......GGGG......",
		".....GLLLLG.....",
		".....GLLLLG..GG.",
		".GG..GLLLLG.GLLG",
		"GLLG.GLLLLG.GLLG",
		"GLLG.GLLLLG.GLLG",
		"GLLGGGLLLLGGGLLG",
		".GLLLLLLLLLLLLG.",
		"..GGGLLLLLLGGG..",
		".....GLLLLG.....",
		".....GLLLLG.....",
		"....BBBBBBBB....",
		"....BDDDDDDB....",
		".....BBBBBB.....",
		".....BDDDDB.....",
		"......BBBB......",
	}
	_ = saveGridPNG("templates/cowboys/sprites/cactus.png", cactusGrid, map[byte]string{
		'G': "#15803d",
		'L': "#22c55e",
		'B': "#92400e",
		'D': "#b45309",
	})

	// 2. Sheriff Gold Star Badge (16x16) for templates/cowboys/sprites/sheriff_star.png
	starGrid := []string{
		".......YY.......",
		"......YYYY......",
		"......YGGY......",
		".YYYYYYGGYYYYYY.",
		"..YYYYGGGGYYYY..",
		"...YYGGGGGGYY...",
		"....YGGWWGGY....",
		"...YYGGGGGGYY...",
		"..YYYYGGGGYYYY..",
		".YYYYYYGGYYYYYY.",
		"......YGGY......",
		"......YYYY......",
		".......YY.......",
		"................",
		"................",
		"................",
	}
	_ = saveGridPNG("templates/cowboys/sprites/sheriff_star.png", starGrid, map[byte]string{
		'Y': "#facc15",
		'G': "#eab308",
		'W': "#fef08a",
	})

	// 3. Multi-frame Character Sprite Sheet (64x20 = 4 frames of 16x20: idle, walk1, walk2, type)
	// for templates/cowboys/sprites/ranger_claude.png
	frame0 := []string{
		"....HHHHHHHH....",
		"..HHHHHHHHHHHH..",
		"....YYYYYYYY....",
		"....SSSSSSSS....",
		"....SKS..SKS....",
		"....SSSSSSSS....",
		"....RRRRRRRR....",
		"...CCCCCCCCCC...",
		"..CCCRRRRRRCCC..",
		"..CCCRYYRYYCCC..",
		"..SSCCCCCCCCSS..",
		"....CCCCCCCC....",
		"....BBBBBBBB....",
		"....PPP..PPP....",
		"....PPP..PPP....",
		"....PPP..PPP....",
		"....DDD..DDD....",
		"................",
		"................",
		"................",
	}
	// Build 64x20 sprite sheet with 4 frames horizontally
	sheet := make([]string, 20)
	for r := 0; r < 20; r++ {
		sheet[r] = frame0[r] + frame0[r] + frame0[r] + frame0[r]
	}
	_ = saveGridPNG("templates/cowboys/sprites/ranger_claude.png", sheet, map[byte]string{
		'H': "#78350f",
		'Y': "#facc15",
		'S': "#fdba74",
		'K': "#0f172a",
		'R': "#dc2626",
		'C': "#b45309",
		'B': "#451a03",
		'P': "#1e293b",
		'D': "#090d16",
	})

	// 4. WW2 Tactical War Map Table (48x16) for templates/ww2/sprites/war_map.png
	warMap := []string{
		"..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB..",
		".BDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDB.",
		".BDGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGDB.",
		".BDGLLLLLLLLLLLLBBBBBBBBLLLLLLLLLLLLLLLLLLLLGDB.",
		".BDGLLRRRRLLLLLLBBBBBBBBLLLLLLYYYYLLLLLLLLLLGDB.",
		".BDGLLRRRRRRRRLLBBBBBBBBLLLLLLYYYYLLLLLLLLLLGDB.",
		".BDGLLLLLLLLRRRRBBBBBBBBLLLLLLLLLLLLRRLLLLLLGDB.",
		".BDGLLLLLLLLLLLLBBBBBBBBLLLLLLLLLLRRRRRRLLLLGDB.",
		".BDGLLLLLLLLLLLLBBBBBBBBLLLLLLLLLLLLRRLLLLLLGDB.",
		".BDGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGDB.",
		".BDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDB.",
		"..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB..",
		"...BBBB..................................BBBB...",
		"...BBBB..................................BBBB...",
		"...BBBB..................................BBBB...",
		"................................................",
	}
	_ = saveGridPNG("templates/ww2/sprites/war_map.png", warMap, map[byte]string{
		'B': "#263028",
		'D': "#3f6212",
		'G': "#14532d",
		'L': "#15803d",
		'R': "#ef4444",
		'Y': "#facc15",
	})
}
