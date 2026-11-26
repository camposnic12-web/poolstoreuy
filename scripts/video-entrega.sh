#!/usr/bin/env bash
# Convierte un video de entrega para la web: MP4 H.264 (y WebM VP9 con WEBM=1), sin audio, ~720 px de alto.
# Con el primer video (2026-11-25) el WebM salía peor que el MP4 al mismo peso (SSIM 0,914 vs 0,944): por eso es opcional.
# El bitrate se calcula con la duración para que cada archivo pese ≤ MAX_KB (por defecto 1.400 KB),
# con dos pasadas para clavar el tamaño. Requiere ffmpeg (npx ffmpeg-static o brew install ffmpeg).
#
# Uso:  scripts/video-entrega.sh ~/Downloads/video-entrega.mov entrega
#       → videos/entrega.mp4   (WEBM=1 … también videos/entrega.webm: sumá data-video-formatos="webm mp4" en el HTML)
#       POSTER=1 scripts/video-entrega.sh …   también genera videos/entrega-poster.{jpg,webp} (primer cuadro)
#
# Después, en index.html, al <div class="phone"> del hero sumale data-video="/videos/entrega"
# (ver docs/PENDIENTES.md, "Video del hero").
set -euo pipefail
export LC_ALL=C   # awk con locale en español lee "18.77" como 18
IN="$1"; NOMBRE="${2:-entrega}"; FFMPEG="${FFMPEG:-ffmpeg}"; MAX_KB="${MAX_KB:-1400}"
cd "$(dirname "$0")/.."
mkdir -p videos
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Duración en segundos (de la salida de ffmpeg -i)
DUR=$({ "$FFMPEG" -hide_banner -i "$IN" 2>&1 || true; } | sed -n 's/.*Duration: \([0-9:.]*\).*/\1/p' | awk -F: '{print $1*3600+$2*60+$3}')
# kbps de video = tamaño máximo / duración, con 8 % de margen para el contenedor
KBPS=$(awk -v kb="$MAX_KB" -v d="$DUR" 'BEGIN{v=int(kb*8/d*0.92); if(v>1100)v=1100; print v}')
echo "Duración ${DUR}s → ${KBPS} kbps (tope ${MAX_KB} KB por archivo)"

VF="scale=-2:'min(720,ih)':flags=lanczos,fps=30"
# MP4 H.264 (Safari/iPhone y todos): perfil high, yuv420p, faststart para que arranque antes de bajar todo
"$FFMPEG" -hide_banner -loglevel error -y -i "$IN" -an -vf "$VF" -c:v libx264 -profile:v high -level 4.0 -preset slow -b:v "${KBPS}k" -pass 1 -passlogfile "$TMP/x264" -f mp4 /dev/null
"$FFMPEG" -hide_banner -loglevel error -y -i "$IN" -an -vf "$VF" -c:v libx264 -profile:v high -level 4.0 -preset slow -b:v "${KBPS}k" -pass 2 -passlogfile "$TMP/x264" -pix_fmt yuv420p -movflags +faststart "videos/$NOMBRE.mp4"
# WebM VP9 (opcional)
if [ "${WEBM:-0}" = "1" ]; then
"$FFMPEG" -hide_banner -loglevel error -y -i "$IN" -an -vf "$VF" -c:v libvpx-vp9 -b:v "${KBPS}k" -row-mt 1 -deadline good -cpu-used 2 -pass 1 -passlogfile "$TMP/vp9" -f webm /dev/null
"$FFMPEG" -hide_banner -loglevel error -y -i "$IN" -an -vf "$VF" -c:v libvpx-vp9 -b:v "${KBPS}k" -row-mt 1 -deadline good -cpu-used 2 -pass 2 -passlogfile "$TMP/vp9" "videos/$NOMBRE.webm"
fi

if [ "${POSTER:-0}" = "1" ]; then
  "$FFMPEG" -hide_banner -loglevel error -y -i "$IN" -vf "scale=-2:960:flags=lanczos" -frames:v 1 -q:v 4 "videos/$NOMBRE-poster.jpg"
  "$FFMPEG" -hide_banner -loglevel error -y -i "videos/$NOMBRE-poster.jpg" -vf "scale=540:-2" -quality 68 "videos/$NOMBRE-poster.webp"
fi
ls -la videos/"$NOMBRE"*
for f in videos/"$NOMBRE".mp4 $( [ "${WEBM:-0}" = "1" ] && echo videos/"$NOMBRE".webm ); do
  kb=$(( $(wc -c < "$f") / 1024 )); [ "$kb" -le "$MAX_KB" ] || { echo "⚠️  $f pesa ${kb} KB (> ${MAX_KB} KB)"; exit 1; }
done
