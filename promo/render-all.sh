#!/bin/sh
# Renders the 4 trailers (vertical/YouTube × en/ru) in parallel and adds the sound effects (no music).
cd "$(dirname "$0")/.."
export PLAYWRIGHT=${PLAYWRIGHT:-playwright}
python3 promo/music.py v >/dev/null; python3 promo/music.py h >/dev/null
for l in en ru; do node promo/render.cjs v $l & node promo/render.cjs h $l & done
wait
for l in en ru; do
  ffmpeg -loglevel error -y -i promo/build/video-vertical-$l.mp4 -i promo/build/sfx-v.wav -c:v copy -c:a aac -b:a 192k -shortest promo/build/TeleX-trailer-vertical-$l.mp4
  ffmpeg -loglevel error -y -i promo/build/video-youtube-$l.mp4 -i promo/build/sfx-h.wav -c:v copy -c:a aac -b:a 192k -shortest promo/build/TeleX-trailer-youtube-$l.mp4
done
echo ALLDONE > promo/build/render.done
