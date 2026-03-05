#!/usr/bin/env bash
# Build an HTML player page from categorized audio directories
# Usage: player.sh <base_dir> <output_html>
# Expected structure: <base_dir>/music/*.mp3, <base_dir>/sfx/*.mp3, <base_dir>/voice/*.mp3

set -euo pipefail

BASE_DIR="${1:?Usage: player.sh <base_dir> <output_html>}"
OUTPUT_HTML="${2:?Output HTML path required}"

TRACKS_JSON="{"
FIRST_CAT=true

for CATEGORY in music sfx voice; do
  DIR="$BASE_DIR/$CATEGORY"
  [[ -d "$DIR" ]] || continue

  MP3_FILES=()
  while IFS= read -r -d '' f; do
    MP3_FILES+=("$f")
  done < <(find "$DIR" -maxdepth 1 -name "*.mp3" -print0 | sort -z)

  [[ ${#MP3_FILES[@]} -eq 0 ]] && continue

  if $FIRST_CAT; then FIRST_CAT=false; else TRACKS_JSON+=","; fi
  TRACKS_JSON+="\"$CATEGORY\":["
  FIRST=true
  for f in "${MP3_FILES[@]}"; do
    BASENAME=$(basename "$f")
    DISPLAY=$(echo "$BASENAME" | sed 's/-[0-9]*\.mp3$//' | sed 's/-/ /g' | sed 's/\b\(.\)/\u\1/g')
    REL_PATH=$(python3 -c "import os,sys; print(os.path.relpath(sys.argv[1], os.path.dirname(sys.argv[2])))" "$f" "$OUTPUT_HTML")
    if $FIRST; then FIRST=false; else TRACKS_JSON+=","; fi
    TRACKS_JSON+="{\"name\":\"$DISPLAY\",\"file\":\"$REL_PATH\"}"
  done
  TRACKS_JSON+="]"
done
TRACKS_JSON+="}"

mkdir -p "$(dirname "$OUTPUT_HTML")"

cat > "$OUTPUT_HTML" << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Audio Preview</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0f0f; color: #e0e0e0; font-family: system-ui, -apple-system, sans-serif; padding: 24px; }
    h1 { font-size: 1.4rem; margin-bottom: 24px; color: #fff; }
    .category { margin-bottom: 32px; }
    .category-title { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; padding: 4px 8px; border-radius: 4px; display: inline-block; }
    .music .category-title { background: #14532d; color: #86efac; }
    .sfx .category-title { background: #713f12; color: #fde68a; }
    .voice .category-title { background: #1e3a5f; color: #93c5fd; }
    .track { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: #1a1a1a; border-radius: 8px; margin-bottom: 8px; }
    .track-name { flex: 1; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .play-btn { background: #333; border: none; color: #fff; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .play-btn:hover { background: #555; }
    .play-btn.playing { background: #2563eb; }
    .progress-bar { flex: 2; height: 4px; background: #333; border-radius: 2px; cursor: pointer; position: relative; }
    .progress-fill { height: 100%; background: #2563eb; border-radius: 2px; width: 0%; transition: width 0.1s linear; }
    .copy-btn { background: none; border: 1px solid #333; color: #888; border-radius: 4px; padding: 2px 8px; font-size: 0.75rem; cursor: pointer; flex-shrink: 0; }
    .copy-btn:hover { border-color: #555; color: #ccc; }
    .copy-btn.copied { border-color: #22c55e; color: #22c55e; }
  </style>
</head>
<body>
  <h1>🎵 Audio Preview</h1>
  <div id="categories"></div>
  <script>
HTMLEOF

echo "const trackData = $TRACKS_JSON;" >> "$OUTPUT_HTML"

cat >> "$OUTPUT_HTML" << 'HTMLEOF2'
    let currentAudio = null;
    let currentBtn = null;

    const COLORS = { music: 'music', sfx: 'sfx', voice: 'voice' };

    const container = document.getElementById('categories');

    for (const [cat, tracks] of Object.entries(trackData)) {
      if (!tracks.length) continue;
      const section = document.createElement('div');
      section.className = `category ${cat}`;
      section.innerHTML = `<div class="category-title">${cat.toUpperCase()} (${tracks.length})</div>`;

      tracks.forEach(track => {
        const row = document.createElement('div');
        row.className = 'track';

        const btn = document.createElement('button');
        btn.className = 'play-btn';
        btn.textContent = '▶';

        const nameEl = document.createElement('div');
        nameEl.className = 'track-name';
        nameEl.title = track.name;
        nameEl.textContent = track.name;

        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        const fill = document.createElement('div');
        fill.className = 'progress-fill';
        progressBar.appendChild(fill);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = 'copy';
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(track.name);
          copyBtn.textContent = '✓';
          copyBtn.classList.add('copied');
          setTimeout(() => { copyBtn.textContent = 'copy'; copyBtn.classList.remove('copied'); }, 1500);
        };

        let audio = null;

        btn.onclick = () => {
          if (currentAudio && currentAudio !== audio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentBtn.textContent = '▶';
            currentBtn.classList.remove('playing');
            currentBtn._fill.style.width = '0%';
          }
          if (!audio) {
            audio = new Audio(track.file);
            audio.addEventListener('timeupdate', () => {
              if (audio.duration) fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
            });
            audio.addEventListener('ended', () => {
              btn.textContent = '▶';
              btn.classList.remove('playing');
              fill.style.width = '0%';
            });
            btn._fill = fill;
          }
          if (audio.paused) {
            audio.play();
            btn.textContent = '⏸';
            btn.classList.add('playing');
            currentAudio = audio;
            currentBtn = btn;
          } else {
            audio.pause();
            btn.textContent = '▶';
            btn.classList.remove('playing');
          }
        };

        progressBar.onclick = (e) => {
          if (!audio) return;
          const rect = progressBar.getBoundingClientRect();
          audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
        };

        row.appendChild(btn);
        row.appendChild(nameEl);
        row.appendChild(progressBar);
        row.appendChild(copyBtn);
        section.appendChild(row);
      });

      container.appendChild(section);
    }
  </script>
</body>
</html>
HTMLEOF2

TOTAL=0
for cat in music sfx voice; do
  d="$BASE_DIR/$cat"
  [[ -d "$d" ]] && TOTAL=$((TOTAL + $(find "$d" -maxdepth 1 -name "*.mp3" | wc -l)))
done

echo "Player built: $OUTPUT_HTML ($TOTAL tracks)" >&2
echo "$OUTPUT_HTML"
