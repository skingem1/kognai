name: elevenlabs-music
description: Generate music and sound effects using ElevenLabs API, then preview them in a web-based player. Use when asked to generate background music, sound effects, audio tracks, or songs for videos or projects. Triggers on "generate music", "make me some songs", "background music", "sound effects", "music for video", "audio tracks", "ElevenLabs music".

# ElevenLabs Audio Generator
Generate music, sound effects, and voice clips via ElevenLabs, preview in a grouped browser player.

## Setup
`ELEVENLABS_API_KEY` must be set in `.env`

## Audio Types

### Music
```bash
bash skills/elevenlabs-music/scripts/generate.sh <output_dir>/music "<prompt>" [duration_seconds] [prompt_influence]
```
- `duration_seconds`: 0.5 to 30 (optional)
- `prompt_influence`: 0 to 1, default 0.3 (higher = closer to prompt)
- Be specific: genre, mood, tempo, instruments, "no vocals"

### Sound Effects
```bash
bash skills/elevenlabs-music/scripts/generate.sh <output_dir>/sfx "<prompt>" [duration_seconds]
```

### Voice
```bash
bash skills/elevenlabs-music/scripts/generate_voice.sh <output_dir>/voice "<text>" [voice_id] [model_id]
```
Default voice: Sarah (`EXAVITQu4vr4xnSDxMaL`)
Default model: `eleven_flash_v2_5`

Common voices:
- Roger: `CwhRBWXzGAHq8TQ4Fs17`
- Charlie: `IKne3meq5aSn9XLyUdCD`
- George: `JBFqnCBsd6RMkjVDRZzb`
- River: `SAz9YHcvj6GT2YYXdXww`

## Player
Build the grouped player (music/sfx/voice sections):
```bash
bash skills/elevenlabs-music/scripts/player.sh <base_dir> <output_html>
```
Expected structure: `<base_dir>/music/*.mp3`, `sfx/*.mp3`, `voice/*.mp3`

## Workflow
1. Generate tracks in parallel (one call per track, run with `&` and `wait`)
2. Organize into `music/`, `sfx/`, `voice/` subdirs
3. Build the player: `bash skills/elevenlabs-music/scripts/player.sh <base_dir> <output_html>`
4. Serve: `cd <base_dir> && nohup python3 -m http.server <port> > /dev/null 2>&1 &`
5. Expose: `bash skills/cloudflare-tunnel/scripts/tunnel.sh start <port>`
6. Send tunnel URL. User previews, selects favorites.

## Use for Invoica X Content
- Upbeat fintech background music for promotional videos
- "Payment confirmed" sound effect for demo videos
- Professional voiceover narrating the x402 payment flow
