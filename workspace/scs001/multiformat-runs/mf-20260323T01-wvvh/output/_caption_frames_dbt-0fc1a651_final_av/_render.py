
import sys
from PIL import Image, ImageDraw, ImageFont
import os, json

entries = json.loads(sys.argv[1])
width = int(sys.argv[2])
height = int(sys.argv[3])
fps = int(sys.argv[4])
duration = float(sys.argv[5])
frames_dir = sys.argv[6]

# Try to find a good font
font_paths = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/SFCompact.ttf',
    '/Library/Fonts/Arial Bold.ttf',
]
font = None
for fp in font_paths:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, 42)
            break
        except:
            pass
if font is None:
    font = ImageFont.load_default()

total_frames = int(duration * fps)
caption_y = int(height * 0.78)
max_text_width = int(width * 0.85)

# Only render frames that have captions (optimization)
frame_map = {}
for e in entries:
    start_f = int(e['start_s'] * fps)
    end_f = int(e['end_s'] * fps)
    for f in range(start_f, min(end_f, total_frames)):
        frame_map[f] = e['text']

# Render unique texts
text_cache = {}
for frame_num in sorted(frame_map.keys()):
    text = frame_map[frame_num]
    if text in text_cache:
        # Symlink or copy
        src = text_cache[text]
        dst = os.path.join(frames_dir, f'frame_{frame_num:06d}.png')
        os.link(src, dst)
        continue

    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Word wrap
    words = text.split()
    lines_out = []
    current = ''
    for w in words:
        test = (current + ' ' + w).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] > max_text_width and current:
            lines_out.append(current)
            current = w
        else:
            current = test
    if current:
        lines_out.append(current)

    # Draw with shadow
    line_height = 50
    total_text_height = len(lines_out) * line_height
    y_start = caption_y - total_text_height // 2

    for i, line in enumerate(lines_out):
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (width - tw) // 2
        y = y_start + i * line_height
        # Shadow
        draw.text((x + 2, y + 2), line, fill=(0, 0, 0, 200), font=font)
        # Main text
        draw.text((x, y), line, fill=(255, 255, 255, 255), font=font)

    out_path = os.path.join(frames_dir, f'frame_{frame_num:06d}.png')
    img.save(out_path)
    text_cache[text] = out_path

print(f'Rendered {len(text_cache)} unique frames, {len(frame_map)} total via hardlinks')
