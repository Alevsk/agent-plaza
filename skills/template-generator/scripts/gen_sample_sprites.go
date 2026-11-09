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
	// 1. Hi-Bit Saguaro Desert Cactus with Sel-Out, Rib Highlights & Desert Flower (16x16)
	cactusGrid := []string{
		"......PPOO......",
		".....OSSSSO.....",
		".....OSLLGO..OO.",
		".OO..OSLLGO.OSLO",
		"OSLO.OSLLGO.OSLO",
		"OSLO.OSLLGO.OSLO",
		"OSLOOOSLLGOOOSLO",
		".OSSSSSLLGGGGGO.",
		"..OOOOOLLGGGOO..",
		".....OSLLGO.....",
		".....OSLLGO.....",
		"...OOOOOOOOOO...",
		"...OTTTTTDDDO...",
		"....OOOOOOOO....",
		"....OTTTTDDO....",
		".....OOOOOO.....",
	}
	_ = saveGridPNG("templates/cowboys/sprites/cactus.png", cactusGrid, map[byte]string{
		'O': "#0d1f14", // sel-out dark forest outline
		'S': "#86efac", // sunlit specular rib
		'L': "#22c55e", // mid saguaro green
		'G': "#15803d", // shaded rib
		'P': "#f472b6", // desert cactus blossom
		'T': "#d97706", // terracotta pot highlight
		'D': "#78350f", // terracotta pot shadow
	})

	// 2. Hi-Bit Sheriff Gold Star Badge with Sel-Out & Specular Facets (16x16)
	starGrid := []string{
		".......OO.......",
		"......OWYO......",
		"......OYYO......",
		".OOOOOOGGOOOOOO.",
		".OWYYYYGGDDDDYO.",
		"..OYYYGGGGDDYO..",
		"...OYGGWWGGDO...",
		"..OYYYGGGGDDYO..",
		".OWYYYYGGDDDDYO.",
		".OOOOOOGGOOOOOO.",
		"......OGDO......",
		"......ODDO......",
		".......OO.......",
		"................",
		"................",
		"................",
	}
	_ = saveGridPNG("templates/cowboys/sprites/sheriff_star.png", starGrid, map[byte]string{
		'O': "#291805", // sel-out bronze contour
		'W': "#ffffff", // specular gleam
		'Y': "#fef08a", // bright gold facet
		'G': "#eab308", // mid gold
		'D': "#a16207", // deep gold bevel
	})

	// 3. Hi-Bit 4-Frame Ranger Character Sprite Sheet (64x20 = 4 frames of 16x20)
	// with sel-out contour, sclera eyes, bandana, duster coat & walk stride
	frameIdle := []string{
		"...OOOOOOOOOO...",
		"..OLLLLHHHHHDO..",
		".OOOOOOOOOOOOOO.",
		"...OYYYYYYYYO...",
		"..OOSSSSSSSSOO..",
		"..OSWKSSSWKSSO..",
		"..OSSSSSSSSSSO..",
		"..OORRRRRRRROO..",
		".OOLLCCCCCCDDDO.",
		".OLLCCRRRRCCDDDO",
		".OLLCCRYYRCCDDDO",
		".OSSCCCCCCCCSSO.",
		"..OOCCCCCCCCOO..",
		"..OOBBBYYBBBOO..",
		"...OOPP..PPOO...",
		"...OOPP..PPOO...",
		"...OODD..DDOO...",
		"................",
		"................",
		"................",
	}
	frameWalk1 := []string{
		"...OOOOOOOOOO...",
		"..OLLLLHHHHHDO..",
		".OOOOOOOOOOOOOO.",
		"...OYYYYYYYYO...",
		"..OOSSSSSSSSOO..",
		"..OSWKSSSWKSSO..",
		"..OSSSSSSSSSSO..",
		"..OORRRRRRRROO..",
		".OOLLCCCCCCDDDO.",
		".OLLCCRRRRCCDDDO",
		".OSSCCRYYRCCSSO.",
		"..OOCCCCCCCCOO..",
		"..OOBBBYYBBBOO..",
		"...OOPP..PPOO...",
		"...OODD..PPOO...",
		".........OODO...",
		"................",
		"................",
		"................",
		"................",
	}
	frameWalk2 := []string{
		"...OOOOOOOOOO...",
		"..OLLLLHHHHHDO..",
		".OOOOOOOOOOOOOO.",
		"...OYYYYYYYYO...",
		"..OOSSSSSSSSOO..",
		"..OSWKSSSWKSSO..",
		"..OSSSSSSSSSSO..",
		"..OORRRRRRRROO..",
		".OOLLCCCCCCDDDO.",
		".OLLCCRRRRCCDDDO",
		".OSSCCRYYRCCSSO.",
		"..OOCCCCCCCCOO..",
		"..OOBBBYYBBBOO..",
		"...OOPP..PPOO...",
		"...OOPP..DDOO...",
		"...ODOO.........",
		"................",
		"................",
		"................",
		"................",
	}
	sheet := make([]string, 20)
	for r := 0; r < 20; r++ {
		sheet[r] = frameIdle[r] + frameWalk1[r] + frameIdle[r] + frameWalk2[r]
	}
	_ = saveGridPNG("templates/cowboys/sprites/ranger_claude.png", sheet, map[byte]string{
		'O': "#160d08", // sel-out dark espresso outline
		'L': "#b45309", // sunlit Stetson/duster highlight
		'H': "#78350f", // Stetson crown base
		'D': "#451a03", // deep leather shadow
		'Y': "#facc15", // gold buckle & sheriff star
		'S': "#fed7aa", // skin tone
		'W': "#ffffff", // eye sclera
		'K': "#090d16", // eye pupil
		'R': "#ef4444", // crimson frontier bandana
		'C': "#92400e", // duster coat base
		'B': "#291809", // gunbelt
		'P': "#1e293b", // denim jeans
	})

	// 4. Hi-Bit WW2 Tactical War Map Table (48x16) with Sel-Out, Beveled Oak Frame & Illuminated Grid
	warMap := []string{
		".OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.",
		"OLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLO",
		"OLBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBLO",
		"OLBGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGBLO",
		"OLBGCCCCCCCCCCCCGGGGGGGGCCCCCCCCCCCCCCCCCCCCGBLO",
		"OLBGCCRRRRCCCCCCGGGGGGGGCCCCCCYYYYCCCCCCCCCCGBLO",
		"OLBGCCRRRRRRRRCCGGGGGGGGCCCCCCYYYYCCCCCCCCCCGBLO",
		"OLBGCCCCCCCCRRRRGGGGGGGGCCCCCCCCCCCCRRCCCCCCGBLO",
		"OLBGCCCCCCCCCCCCGGGGGGGGCCCCCCCCCCRRRRRRCCCCGBLO",
		"OLBGCCCCCCCCCCCCGGGGGGGGCCCCCCCCCCCCRRCCCCCCGBLO",
		"OLBGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGBLO",
		"OLBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBLO",
		".OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.",
		"...OBBO..................................OBBO...",
		"...OBBO..................................OBBO...",
		"...OOOO..................................OOOO...",
	}
	_ = saveGridPNG("templates/ww2/sprites/war_map.png", warMap, map[byte]string{
		'O': "#090d0a", // sel-out bunker outline
		'L': "#4d7c0f", // sunlit rim bevel
		'B': "#263028", // steel table frame
		'G': "#052e16", // deep radar grid trench
		'C': "#15803d", // illuminated sector map
		'R': "#ef4444", // axis front markers
		'Y': "#fef08a", // allied convoy pins
	})
}
