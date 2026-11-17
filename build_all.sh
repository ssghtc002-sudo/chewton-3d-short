#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "  If The Apple Never Fell — The Chewton Theory (9:16 3D)"
echo "============================================================"

echo "[1/2] Generating voiceover, lip-sync manifest, BGM, and SFX..."
uv run --project "$ROOT_DIR" python3 "$ROOT_DIR/audio/generate_audio.py"

echo "[2/2] Rendering 900 deterministic 3D frames -> H.264/AAC MP4..."
node "$ROOT_DIR/render/render_frames.mjs" "$@"

echo "============================================================"
echo "  Build complete: $ROOT_DIR/output/chewton_theory_short.mp4"
echo "============================================================"
