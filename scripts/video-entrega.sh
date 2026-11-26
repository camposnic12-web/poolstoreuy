#!/usr/bin/env bash
# Convierte un video de entrega para la web: MP4 H.264 + WebM VP9, sin audio, ~720 px de alto,
# y un poster (primer cuadro) en WebP y JPG. Requiere ffmpeg (por ejemplo: npx ffmpeg-static, o brew install ffmpeg).
#
# Uso:  scripts/video-entrega.sh ~/Downloads/video-entrega.mov entrega
#       → videos/entrega.mp4, videos/entrega.webm, videos/entrega-poster.webp, videos/entrega-poster.jpg
#
# Después, en index.html, al <div class="phone"> del hero sumale data-video="/videos/entrega"
# y cambiá la foto de adentro por el poster (ver docs/PENDIENTES.md, "Video del hero").
set -euo pipefail
IN="$1"; NOMBRE="${2:-entrega}"; FFMPEG="${FFMPEG:-ffmpeg}"
cd "$(dirname "$0")/.."
mkdir -p videos
# 720 px de alto (vertical: 405×720). Sin audio (-an). Objetivo ≤ 1,5 MB: si se pasa, bajá -b:v o recortá con -t 10.
"$FFMPEG" -y -i "$IN" -an -vf "scale=-2:720:flags=lanczos,fps=30" -c:v libx264 -profile:v high -preset slow -b:v 900k -maxrate 1100k -bufsize 2000k -pix_fmt yuv420p -movflags +faststart "videos/$NOMBRE.mp4"
"$FFMPEG" -y -i "$IN" -an -vf "scale=-2:720:flags=lanczos,fps=30" -c:v libvpx-vp9 -b:v 700k -row-mt 1 -deadline good "videos/$NOMBRE.webm"
"$FFMPEG" -y -i "$IN" -vf "scale=-2:960:flags=lanczos" -frames:v 1 -q:v 4 "videos/$NOMBRE-poster.jpg"
"$FFMPEG" -y -i "videos/$NOMBRE-poster.jpg" -vf "scale=540:-2" -quality 68 "videos/$NOMBRE-poster.webp"
ls -la videos/"$NOMBRE"*
