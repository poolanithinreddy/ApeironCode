#!/usr/bin/env python3
"""Render a sanitized terminal transcript as a compact looping GIF."""

from __future__ import annotations

from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont


WIDTH = 960
HEIGHT = 540
PADDING = 32
HEADER_HEIGHT = 44
LINE_HEIGHT = 22
VISIBLE_LINES = 19
BACKGROUND = "#0b1220"
TERMINAL = "#111827"
FOREGROUND = "#d1d5db"
MUTED = "#94a3b8"
GREEN = "#4ade80"
RED = "#fb7185"
YELLOW = "#facc15"


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Monaco.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def line_color(line: str) -> str:
    if "Tests passed" in line or "All tests passing" in line or line.startswith("+ "):
        return GREEN
    if "Tests failed" in line or line.startswith("- "):
        return RED
    if line.startswith("Approve") or "Approve?" in line:
        return YELLOW
    if line.startswith("[apeironcode]"):
        return MUTED
    return FOREGROUND


def render_frame(lines: list[str], font: ImageFont.ImageFont) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (16, 16, WIDTH - 16, HEIGHT - 16),
        radius=14,
        fill=TERMINAL,
        outline="#263244",
        width=2,
    )
    draw.ellipse((36, 31, 48, 43), fill="#fb7185")
    draw.ellipse((56, 31, 68, 43), fill="#facc15")
    draw.ellipse((76, 31, 88, 43), fill="#4ade80")
    draw.text((WIDTH // 2 - 72, 28), "ApeironCode demo", font=font, fill=MUTED)

    visible = lines[-VISIBLE_LINES:]
    for index, line in enumerate(visible):
        draw.text(
            (PADDING, HEADER_HEIGHT + 22 + index * LINE_HEIGHT),
            line[:104],
            font=font,
            fill=line_color(line),
        )
    return image


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: render-terminal-gif.py <transcript.txt> <output.gif>")
        return 2

    transcript_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    lines = transcript_path.read_text(encoding="utf-8").splitlines()
    font = load_font(16)

    reveal_points = list(range(1, len(lines) + 1, 2))
    if reveal_points[-1] != len(lines):
        reveal_points.append(len(lines))
    frames = [render_frame(lines[:point], font) for point in reveal_points]

    total_duration_ms = 26_000
    frame_duration = max(250, total_duration_ms // len(frames))
    durations = [frame_duration] * len(frames)
    durations[-1] += 2_000

    output_path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        output_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
