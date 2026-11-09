#!/usr/bin/env python3
"""
Generates crisp, Hi-Bit pixel-art favicon assets for Agent Plaza:
- favicon.svg (crisp vector pixel art with crispEdges)
- favicon-32x32.png
- favicon-16x16.png
- apple-touch-icon.png (180x180)
- favicon.ico (multi-size: 16, 32, 48)
"""
import os
from PIL import Image

WIDTH = 32
HEIGHT = 32

# Palette definitions (Hi-Bit 4-Layer palette)
_ = None # Transparent
K = (9, 13, 22, 255)       # Contour / Outlines (#090d16)
D = (15, 23, 42, 255)      # Chassis deepest dark (#0f172a)
M = (30, 41, 59, 255)      # Chassis dark midtone (#1e293b)
L = (51, 65, 85, 255)      # Chassis midtone (#334155)
H = (71, 85, 105, 255)     # Chassis highlight (#475569)
B = (100, 116, 139, 255)   # Chassis top bevel / light (#64748b)
W = (148, 163, 184, 255)   # Specular glint (#94a3b8)

# Antenna Red Beacon
R1 = (159, 18, 57, 255)    # Rose dark (#9f1239)
R2 = (244, 63, 94, 255)    # Rose bright glow (#f43f5e)
R3 = (255, 228, 230, 255)  # Rose peak highlight (#ffe4e6)

# Screen & Face (Cyan Cyber terminal)
S0 = (4, 18, 27, 255)      # Screen deep background (#04121b)
S1 = (7, 29, 43, 255)      # Screen background mid (#071d2b)
S2 = (14, 58, 82, 255)     # Screen glass reflection diagonal (#0e3a52)
C1 = (8, 145, 178, 255)    # Cyan dark (#0891b2)
C2 = (6, 182, 212, 255)    # Cyan glow (#06b6d4)
C3 = (34, 211, 238, 255)   # Cyan bright (#22d3ee)
C4 = (165, 243, 252, 255)  # Cyan pastel (#a5f3fc)
WH = (255, 255, 255, 255)  # White eye shine (#ffffff)

# Power LED (Emerald)
G1 = (5, 150, 105, 255)    # Emerald (#059669)
G2 = (52, 211, 153, 255)   # Emerald glow (#34d399)

# Ground Shadow
SH = (5, 8, 15, 120)       # Drop shadow 47% alpha

# 32x32 pixel art matrix
PIXELS = [
    # 0
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    # 1
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    # 2 - Beacon top
    [_, _, _, _, _, _, _, _, _, _, _, _, _, K, R2, R3, R3, R2, K, _, _, _, _, _, _, _, _, _, _, _, _, _],
    # 3 - Beacon glow
    [_, _, _, _, _, _, _, _, _, _, _, _, _, K, R1, R2, R2, R1, K, _, _, _, _, _, _, _, _, _, _, _, _, _],
    # 4 - Beacon base
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, K, R1, R1, K, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    # 5 - Antenna stalk
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, K, B, H, K, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    # 6 - Antenna base
    [_, _, _, _, _, _, _, _, _, _, _, _, _, K, H, L, L, D, K, _, _, _, _, _, _, _, _, _, _, _, _, _],
    # 7 - Head top contour
    [_, _, _, _, _, _, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, _, _, _, _, _, _],
    # 8 - Head top bevel
    [_, _, _, _, _, K, W, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, H, D, K, _, _, _, _, _],
    # 9 - Casing top
    [_, _, _, _, K, W, B, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L, D, D, K, _, _, _, _],
    # 10 - Screen top bezel
    [_, _, _, _, K, B, L, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, L, D, D, K, _, _, _, _],
    # 11 - Screen row 1 (Glass reflection)
    [_, _, _, K, B, L, M, K, S2, S2, S1, S1, S0, S0, S0, S0, S0, S0, S0, S0, S0, S0, K, M, D, D, K, _, _, _, _, _],
    # 12 - Screen row 2 (Glass reflection diagonal)
    [_, _, _, K, B, L, M, K, S1, S2, S2, S1, S0, S0, S0, S0, S0, S0, S0, S0, S0, S0, K, M, D, D, K, _, _, _, _, _],
    # 13 - Screen row 3
    [_, _, K, K, B, L, M, K, S0, S1, S2, S2, S0, S0, S0, S0, S0, S0, S0, S0, S0, S0, K, M, D, D, K, K, _, _, _, _],
    # 14 - Eyes row 1 (Top eye glint)
    [_, K, H, K, B, L, M, K, S0, S0, C3, WH, S0, S0, S0, S0, S0, S0, C3, WH, S0, S0, K, M, D, D, K, H, K, _, _, _],
    # 15 - Eyes row 2 (Eye pupil & glow)
    [_, K, L, K, B, L, M, K, S0, C2, C4, WH, C2, S0, S0, S0, S0, C2, C4, WH, C2, S0, K, M, D, D, K, L, K, _, _, _],
    # 16 - Eyes row 3 (Eye lower)
    [_, K, D, K, B, L, M, K, S0, C1, C3, C3, C1, S0, S0, S0, S0, C1, C3, C3, C1, S0, K, M, D, D, K, D, K, _, _, _],
    # 17 - Cheeks / smile curves
    [_, _, K, K, B, L, M, K, S0, S0, C1, S0, S0, C2, S0, S0, C2, S0, S0, C1, S0, S0, K, M, D, D, K, K, _, _, _, _],
    # 18 - Smile mouth
    [_, _, _, K, B, L, M, K, S0, S0, S0, S0, S0, C3, C3, C3, C3, S0, S0, S0, S0, S0, K, M, D, D, K, _, _, _, _, _],
    # 19 - Smile bottom
    [_, _, _, K, B, L, M, K, S0, S0, S0, S0, S0, S0, C2, C2, S0, S0, S0, S0, S0, S0, K, M, D, D, K, _, _, _, _, _],
    # 20 - Screen bottom row
    [_, _, _, K, B, L, M, K, S0, S0, S0, S0, S0, S0, S0, S0, S0, S0, S0, S0, S0, S0, K, M, D, D, K, _, _, _, _, _],
    # 21 - Screen bottom bezel
    [_, _, _, _, K, B, L, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, L, D, D, K, _, _, _, _],
    # 22 - Casing lower
    [_, _, _, _, K, B, L, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, D, D, K, _, _, _, _],
    # 23 - Casing bottom bevel
    [_, _, _, _, K, L, M, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, K, _, _, _, _],
    # 24 - Casing bottom contour
    [_, _, _, _, _, K, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, K, _, _, _, _, _],
    # 25 - Neck joint
    [_, _, _, _, _, _, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, K, _, _, _, _, _, _],
    # 26 - Neck stand
    [_, _, _, _, _, _, _, _, _, _, _, _, K, H, L, L, L, D, K, _, _, _, _, _, _, _, _, _, _, _, _, _],
    # 27 - Power LED
    [_, _, _, _, _, _, _, _, _, _, _, _, K, L, G2, G2, M, D, K, _, _, _, _, _, _, _, _, _, _, _, _, _],
    # 28 - Base top
    [_, _, _, _, _, _, _, _, _, K, K, K, K, L, G1, G1, D, K, K, K, K, _, _, _, _, _, _, _, _, _, _, _],
    # 29 - Base rim
    [_, _, _, _, _, _, _, _, K, B, L, L, L, M, M, M, M, D, D, D, D, K, _, _, _, _, _, _, _, _, _, _],
    # 30 - Base bottom + shadow
    [_, _, _, _, _, _, _, K, D, D, D, D, D, D, D, D, D, D, D, D, D, D, K, _, _, _, _, _, _, _, _, _],
    # 31 - Ground shadow
    [_, _, _, _, _, _, SH, SH, K, K, K, K, K, K, K, K, K, K, K, K, K, K, SH, SH, _, _, _, _, _, _, _, _],
]

def make_image():
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    for y in range(HEIGHT):
        for x in range(WIDTH):
            c = PIXELS[y][x]
            if c is not None:
                img.putpixel((x, y), c)
    return img

def make_svg():
    rects = []
    for y in range(HEIGHT):
        for x in range(WIDTH):
            c = PIXELS[y][x]
            if c is not None:
                r, g, b, a = c
                if a == 255:
                    rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="rgb({r},{g},{b})" />')
                else:
                    opacity = round(a / 255.0, 2)
                    rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="rgb({r},{g},{b})" fill-opacity="{opacity}" />')
    
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">
  {''.join(rects)}
</svg>"""
    return svg

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root_dir, "web", "public")
    os.makedirs(out_dir, exist_ok=True)

    # 1. Base 32x32 image
    base = make_image()
    base.save(os.path.join(out_dir, "favicon-32x32.png"))
    print("Saved favicon-32x32.png")

    # 2. 16x16 image (Nearest neighbor so pixels stay crisp)
    img_16 = base.resize((16, 16), Image.Resampling.NEAREST)
    img_16.save(os.path.join(out_dir, "favicon-16x16.png"))
    print("Saved favicon-16x16.png")

    # 3. 180x180 Apple touch icon (Integer scaling 5x = 160x160 centered on 180x180 dark background)
    apple_icon = Image.new("RGBA", (180, 180), (8, 11, 17, 255))
    scaled = base.resize((160, 160), Image.Resampling.NEAREST)
    apple_icon.paste(scaled, (10, 10), scaled)
    apple_icon.save(os.path.join(out_dir, "apple-touch-icon.png"))
    print("Saved apple-touch-icon.png")

    # 4. Multi-size favicon.ico
    img_48 = base.resize((48, 48), Image.Resampling.NEAREST)
    base.save(
        os.path.join(out_dir, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print("Saved favicon.ico")

    # 5. Crisp SVG favicon
    svg = make_svg()
    with open(os.path.join(out_dir, "favicon.svg"), "w") as f:
        f.write(svg)
    print("Saved favicon.svg")

if __name__ == "__main__":
    main()
