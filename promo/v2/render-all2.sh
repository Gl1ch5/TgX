#!/bin/sh
# Renders trailer v2 (vertical + YouTube × ru + en) from the recorded clips, then adds the soundtrack.
#   node promo/v2/record.cjs all ru; node promo/v2/record.cjs all en   (clips of the real app, once)
cd "$(dirname "$0")/.."
python3 -m pip install -q numpy 2>/dev/null
python3 v2/audio.py
for l in ru en; do
  node v2/render2.cjs v $l & node v2/render2.cjs h $l &
done
wait
for l in ru en; do
  ffmpeg -loglevel error -y -i v2/build/video2-vertical-$l.mp4 -i v2/build/audio2.wav -c:v copy -c:a aac -b:a 192k -shortest v2/build/TeleX-trailer2-vertical-$l.mp4
  ffmpeg -loglevel error -y -i v2/build/video2-youtube-$l.mp4 -i v2/build/audio2.wav -c:v copy -c:a aac -b:a 192k -shortest v2/build/TeleX-trailer2-youtube-$l.mp4
done
echo ALLDONE > v2/build/render2.done
