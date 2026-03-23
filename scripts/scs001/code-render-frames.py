#!/usr/bin/env python3
"""
Code Demo Frame Renderer — Pillow-based syntax-highlighted typing animation.

Reads config from JSON file (passed as sys.argv[1]).
Outputs numbered PNG frames (f_000000.png ... f_NNNNNN.png).

Sprint 900
"""

import os, sys, json
from PIL import Image, ImageDraw, ImageFont

config = json.load(open(sys.argv[1]))
code_lines = config["code_lines"]
language = config["language"]
step_title = config["step_title"]
step_idx = config["step_idx"]
total_steps = config["total_steps"]
highlight_lines = config["highlight_lines"]
out_dir = config["out_dir"]
fps = config["fps"]
duration_s = config["duration_s"]

W, H = 1080, 1920
BG = (15, 15, 25)
GUTTER_COLOR = (80, 80, 100)
HIGHLIGHT_BG = (45, 45, 94)
TITLE_BG = (25, 25, 40)
CURSOR_COLOR = (255, 255, 255)
total_frames = int(duration_s * fps)
total_chars = sum(len(line) for line in code_lines)

# ── Fonts ──
code_font = None
title_font = None
bold_font = None

for fp in ["/System/Library/Fonts/Menlo.ttc",
           "/System/Library/Fonts/SFMono-Regular.otf",
           "/System/Library/Fonts/Helvetica.ttc"]:
    if os.path.exists(fp):
        try:
            code_font = ImageFont.truetype(fp, 28)
            title_font = ImageFont.truetype(fp, 22)
            break
        except:
            pass

for fp in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf",
           "/System/Library/Fonts/Helvetica.ttc"]:
    if os.path.exists(fp):
        try:
            bold_font = ImageFont.truetype(fp, 32)
            break
        except:
            pass

if code_font is None:
    code_font = ImageFont.load_default()
    title_font = code_font
if bold_font is None:
    bold_font = code_font

# ── Keyword-based syntax coloring (Dracula theme) ──
KW = {
    "import", "from", "def", "class", "return", "if", "else", "elif",
    "for", "while", "in", "not", "and", "or", "try", "except", "with",
    "as", "async", "await", "const", "let", "var", "function", "export",
    "type", "interface", "fn", "pub", "use", "mut", "match", "struct",
    "impl", "enum", "func", "package", "go", "defer", "range", "print",
    "println", "fmt", "None", "True", "False", "true", "false", "null",
    "undefined", "self", "this", "new", "throw", "catch", "finally",
}


def tok_color(word):
    clean = word.strip("(){}[].,;:=<>!&|+-*/")
    if clean in KW:
        return (255, 121, 198)   # pink — keywords
    if word.startswith(("#", "//")):
        return (98, 114, 164)    # gray-blue — comments
    if word.startswith(('"', "'", 'f"', "f'")):
        return (241, 250, 140)   # yellow — strings
    if word.replace("-", "", 1).isdigit():
        return (189, 147, 249)   # purple — numbers
    if "(" in word and not word.startswith("("):
        return (80, 250, 123)    # green — function calls
    return (248, 248, 242)       # white — default


# ── Layout constants ──
LINE_H = 38
CODE_X = 80
CODE_Y_START = 140
GUTTER_X = 15

# Characters revealed per frame (reserve last 1s as static hold)
chars_per_frame = max(0.5, total_chars / max(total_frames - fps, 1))

# ── Render frames ──
cache = {}

for frame_num in range(total_frames):
    chars_so_far = min(int(frame_num * chars_per_frame), total_chars)
    dst = os.path.join(out_dir, f"f_{frame_num:06d}.png")

    if chars_so_far in cache:
        os.link(cache[chars_so_far], dst)
        continue

    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Title bar
    draw.rectangle([0, 0, W, 100], fill=TITLE_BG)
    draw.text((40, 20), step_title, fill=(255, 255, 255), font=bold_font)
    progress = f"Step {step_idx + 1}/{total_steps}"
    pbb = draw.textbbox((0, 0), progress, font=title_font)
    draw.text((W - (pbb[2] - pbb[0]) - 40, 60), progress,
              fill=(0, 200, 200), font=title_font)

    # Render code lines
    char_count = 0
    cursor_drawn = False

    for li, line in enumerate(code_lines):
        ls = char_count
        le = char_count + len(line)
        y = CODE_Y_START + li * LINE_H

        if y > H - 300:
            break

        # Highlight bar for marked lines
        if (li + 1) in highlight_lines:
            draw.rectangle([CODE_X - 10, y - 4, W - 30, y + LINE_H - 8],
                           fill=HIGHLIGHT_BG)

        # Line number gutter
        ln_text = str(li + 1).rjust(3)
        draw.text((GUTTER_X, y), ln_text, fill=GUTTER_COLOR, font=code_font)

        if chars_so_far <= ls:
            # Line not yet visible — show cursor
            if not cursor_drawn:
                if frame_num % 20 < 14:
                    draw.rectangle([CODE_X, y, CODE_X + 12, y + LINE_H - 10],
                                   fill=CURSOR_COLOR)
                cursor_drawn = True
            char_count = le
            continue

        # Partially or fully visible line
        visible_chars = min(len(line), chars_so_far - ls)
        visible_text = line[:visible_chars]

        # Tokenize and draw with colors
        x = CODE_X
        parts = []
        cur = ""
        for ch in visible_text:
            if ch == " ":
                if cur:
                    parts.append(cur)
                parts.append(" ")
                cur = ""
            elif ch == "\t":
                if cur:
                    parts.append(cur)
                parts.append("    ")
                cur = ""
            else:
                cur += ch
        if cur:
            parts.append(cur)

        for part in parts:
            if part.strip() == "":
                sbb = draw.textbbox((0, 0), part, font=code_font)
                x += sbb[2] - sbb[0]
            else:
                color = tok_color(part)
                draw.text((x, y), part, fill=color, font=code_font)
                wbb = draw.textbbox((0, 0), part, font=code_font)
                x += wbb[2] - wbb[0]

        # Cursor at end of partially revealed line
        if visible_chars < len(line) and not cursor_drawn:
            if frame_num % 20 < 14:
                draw.rectangle([x + 2, y, x + 14, y + LINE_H - 10],
                               fill=CURSOR_COLOR)
            cursor_drawn = True

        char_count = le

    img.save(dst, "PNG")
    cache[chars_so_far] = dst

print(f"OK frames={total_frames} unique={len(cache)}")
