#!/usr/bin/env python3
"""Generate RedisLens app icon in all required Tauri sizes."""

from PIL import Image, ImageDraw, ImageFont
import math
import os

SIZE = 1024  # Master icon size


def draw_icon(size: int) -> Image.Image:
    """Draw the RedisLens icon: a stylized lens/magnifier over a Redis diamond."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")
    s = size  # shorthand
    cx, cy = s // 2, s // 2

    # --- Background: rounded square ---
    pad = int(s * 0.06)
    radius = int(s * 0.22)
    # Dark slate background
    draw.rounded_rectangle(
        [pad, pad, s - pad, s - pad],
        radius=radius,
        fill=(24, 24, 32, 255),
    )

    # --- Redis diamond shape (rotated square) in center-left ---
    diamond_cx = int(s * 0.42)
    diamond_cy = int(s * 0.44)
    diamond_r = int(s * 0.22)

    # Diamond vertices (rotated 45 degrees)
    diamond = [
        (diamond_cx, diamond_cy - diamond_r),  # top
        (diamond_cx + diamond_r, diamond_cy),   # right
        (diamond_cx, diamond_cy + diamond_r),   # bottom
        (diamond_cx - diamond_r, diamond_cy),   # left
    ]

    # Redis red color
    redis_red = (220, 60, 50, 255)
    redis_red_light = (240, 90, 75, 255)

    # Draw diamond with slight gradient effect (two overlapping shapes)
    draw.polygon(diamond, fill=redis_red)

    # Inner highlight on diamond (top-left face)
    inner_r = int(diamond_r * 0.6)
    inner_diamond = [
        (diamond_cx, diamond_cy - inner_r),
        (diamond_cx + inner_r, diamond_cy),
        (diamond_cx, diamond_cy + inner_r),
        (diamond_cx - inner_r, diamond_cy),
    ]
    draw.polygon(inner_diamond, fill=redis_red_light)

    # --- Horizontal lines on diamond (Redis logo style) ---
    line_color = (255, 255, 255, 80)
    line_w = max(2, int(s * 0.012))
    for offset in [-diamond_r // 3, 0, diamond_r // 3]:
        y = diamond_cy + offset
        # Calculate x bounds at this y within diamond
        dy = abs(offset)
        half_width = diamond_r - dy
        if half_width > 0:
            draw.line(
                [(diamond_cx - half_width + line_w, y),
                 (diamond_cx + half_width - line_w, y)],
                fill=line_color,
                width=line_w,
            )

    # --- Magnifying glass (lens) ---
    lens_cx = int(s * 0.52)
    lens_cy = int(s * 0.42)
    lens_r = int(s * 0.20)

    # Glass circle - outline
    lens_color = (140, 200, 255, 255)
    lens_outline_w = max(4, int(s * 0.04))

    # Draw glass circle outline
    draw.ellipse(
        [lens_cx - lens_r, lens_cy - lens_r,
         lens_cx + lens_r, lens_cy + lens_r],
        outline=lens_color,
        width=lens_outline_w,
    )

    # Glass fill (semi-transparent blue tint)
    draw.ellipse(
        [lens_cx - lens_r + lens_outline_w,
         lens_cy - lens_r + lens_outline_w,
         lens_cx + lens_r - lens_outline_w,
         lens_cy + lens_r - lens_outline_w],
        fill=(140, 200, 255, 35),
    )

    # Lens reflection arc (shine)
    shine_r = int(lens_r * 0.65)
    shine_w = max(2, int(s * 0.018))
    draw.arc(
        [lens_cx - shine_r, lens_cy - shine_r,
         lens_cx + shine_r, lens_cy + shine_r],
        start=200,
        end=260,
        fill=(255, 255, 255, 120),
        width=shine_w,
    )

    # --- Handle of magnifying glass ---
    handle_start_x = lens_cx + int(lens_r * 0.7)
    handle_start_y = lens_cy + int(lens_r * 0.7)
    handle_end_x = int(s * 0.78)
    handle_end_y = int(s * 0.78)
    handle_w = max(6, int(s * 0.055))

    # Handle body
    draw.line(
        [(handle_start_x, handle_start_y), (handle_end_x, handle_end_y)],
        fill=(180, 190, 210, 255),
        width=handle_w,
    )
    # Handle cap
    cap_r = int(handle_w * 0.6)
    draw.ellipse(
        [handle_end_x - cap_r, handle_end_y - cap_r,
         handle_end_x + cap_r, handle_end_y + cap_r],
        fill=(160, 170, 190, 255),
    )

    return img


def main():
    icon_dir = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")
    os.makedirs(icon_dir, exist_ok=True)

    # Generate master icon
    master = draw_icon(SIZE)

    # Save PNG sizes required by Tauri
    sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
    }

    for filename, sz in sizes.items():
        resized = master.resize((sz, sz), Image.LANCZOS)
        path = os.path.join(icon_dir, filename)
        resized.save(path, "PNG")
        print(f"  Saved {filename} ({sz}x{sz})")

    # Save ICO (Windows) - multiple sizes embedded
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images = [master.resize((sz, sz), Image.LANCZOS) for sz in ico_sizes]
    ico_path = os.path.join(icon_dir, "icon.ico")
    ico_images[0].save(ico_path, format="ICO", sizes=[(sz, sz) for sz in ico_sizes], append_images=ico_images[1:])
    print(f"  Saved icon.ico ({len(ico_sizes)} sizes)")

    # Save ICNS (macOS)
    icns_path = os.path.join(icon_dir, "icon.icns")
    # macOS .icns needs specific sizes - save as 256x256 PNG first, then use iconutil if available
    # Pillow can save .icns directly
    icns_img = master.resize((512, 512), Image.LANCZOS)
    icns_img.save(icns_path, format="ICNS")
    print(f"  Saved icon.icns")

    # Also save a 512x512 for web/README use
    master.resize((512, 512), Image.LANCZOS).save(
        os.path.join(icon_dir, "icon.png"), "PNG"
    )
    print(f"  Saved icon.png (512x512)")

    print("\nAll icons generated!")


if __name__ == "__main__":
    main()
