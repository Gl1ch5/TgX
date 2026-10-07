# Trailer v2

A kinetic 3D trailer made of **recordings of the real app**: real scrolling, taps, menus, stories, the mods store.

1. `node promo/v2/record.cjs all ru` / `en` — drives the app (demo data from `demo.cjs`: real photos from picsum/Unsplash and real face photos from pravatar.cc, no illustrations) frame by frame:
   the browser runs on virtual time and renders a frame on request (`HeadlessExperimental.beginFrame`), so every animation is captured at exactly 30 fps. Output: `build/clips-<lang>/<scene>/00000.jpg …`
2. `python3 promo/v2/audio.py` — original soundtrack (own synthesis, 124 bpm), cut points follow the timeline in `trailer2.html`.
3. `sh promo/v2/render-all2.sh` — renders vertical 1080×1920 and YouTube 1920×1080 in ru and en and adds the audio.

`trailer2.html` is frame-exact: `render(t)` draws the frame at `t` seconds. Scene times are in beats (see `BEATS`).
