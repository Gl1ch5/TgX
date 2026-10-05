#!/bin/sh
# Renders the 4 trailers (vertical/YouTube × en/ru) in parallel and adds our own original beat + sound effects.
cd "$(dirname "$0")/.."
export PLAYWRIGHT=${PLAYWRIGHT:-playwright}
python3 -m pip install -q numpy 2>/dev/null
mkdir -p promo/build
for f in v h; do
  python3 promo/music.py $f >/dev/null; python3 promo/beat.py $f >/dev/null
  ffmpeg -loglevel error -y -i promo/build/beat-$f.wav -i promo/build/sfx-$f.wav -filter_complex "[0:a]volume=0.8[m];[1:a]volume=1.0[s];[m][s]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]" -map "[a]" promo/build/mix-$f.wav
done
for l in en ru; do node promo/render.cjs v $l & node promo/render.cjs h $l & done
wait
for l in en ru; do
  ffmpeg -loglevel error -y -i promo/build/video-vertical-$l.mp4 -i promo/build/mix-v.wav -c:v copy -c:a aac -b:a 192k -shortest promo/build/TeleX-trailer-vertical-$l.mp4
  ffmpeg -loglevel error -y -i promo/build/video-youtube-$l.mp4 -i promo/build/mix-h.wav -c:v copy -c:a aac -b:a 192k -shortest promo/build/TeleX-trailer-youtube-$l.mp4
done
echo ALLDONE > promo/build/render.done
