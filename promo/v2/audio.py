#!/usr/bin/env python3
"""Original soundtrack for the TeleX trailer v2: our own synthesis (no samples), 124 bpm, A minor.
Structure follows trailer2.html (cut points in beats): tension (0-8) -> impact + drop at the logo (8) -> groove, whooshes on every cut,
breakdown before the call to action (100-110), full finish (110-126).
python3 promo/v2/audio.py -> promo/v2/build/audio2.wav"""
import os, wave
import numpy as np

SR = 44100
BPM = 124
B = 60 / BPM
TOTAL = 126
END = TOTAL * B
N = int((END + 1.0) * SR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
CUTS = [8, 14, 26, 36, 46, 56, 64, 72, 82, 100, 110]


def put(buf, t, x, g=1.0):
    i = int(t * SR)
    if i >= N or i < 0:
        return
    x = x[: N - i]
    buf[i:i + len(x)] += x * g


def st(t, x, g=1.0, pan=0.0):
    put(L, t, x, g * (1 - max(0, pan)))
    put(R, t, x, g * (1 + min(0, pan)))


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


def kick():
    t = np.arange(int(0.38 * SR)) / SR
    ph = 2 * np.pi * np.cumsum(46 + 130 * np.exp(-t * 30)) / SR
    return np.tanh(1.8 * np.sin(ph)) * np.exp(-t * 8.5) + 0.25 * np.exp(-t * 400) * rng.uniform(-1, 1, len(t))


def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    x = np.diff(rng.uniform(-1, 1, n), prepend=0)
    return x * np.exp(-t * (18 if open_ else 90))


def clap():
    n = int(0.25 * SR); t = np.arange(n) / SR
    x = np.diff(rng.uniform(-1, 1, n), prepend=0) * np.exp(-t * 22)
    for k in (0.010, 0.021):
        o = int(k * SR); x[o:] += x[:-o] * 0.55
    return x * 0.6


def bass(note, dur):
    t = np.arange(int(dur * SR)) / SR
    ph = 2 * np.pi * midi(note) * t
    env = np.minimum(1, t / 0.01) * np.exp(-t * 3.2)
    return np.tanh(2.0 * (np.sin(ph) + 0.35 * np.sin(2 * ph))) * env


def pluck(note, dur=0.3):
    t = np.arange(int(dur * SR)) / SR
    ph = 2 * np.pi * midi(note) * t
    x = np.sin(ph) + 0.4 * np.sin(2 * ph) * np.exp(-t * 14) + 0.2 * np.sin(3 * ph) * np.exp(-t * 20)
    return x * np.exp(-t * 11) * np.minimum(1, t / 0.003)


def pad(notes, dur):
    t = np.arange(int((dur + 0.4) * SR)) / SR
    x = np.zeros_like(t)
    for n in notes:
        f = midi(n)
        for d in (0.997, 1.003):
            ph = 2 * np.pi * f * d * t
            x += sum(np.sin(ph * h) / h for h in (1, 2, 3))
    env = np.minimum(1, t / 0.25) * np.where(t < dur, 1, np.exp(-(t - dur) * 8))
    return x * env / (len(notes) * 2.5)


def sweep(dur, up=True, gain=0.5):
    """filtered noise that rises (riser) or falls (whoosh): crude band-pass by mixing a moving low-pass."""
    n = int(dur * SR); t = np.arange(n) / SR
    x = rng.uniform(-1, 1, n)
    a = (0.02 + 0.5 * (t / dur) ** 2) if up else (0.5 - 0.48 * (t / dur) ** 0.5)
    y = np.empty(n); acc = 0.0
    for i in range(n):
        acc += (x[i] - acc) * a[i]; y[i] = acc
    env = (t / dur) ** 1.5 if up else np.sin(np.pi * np.minimum(1, t / dur)) ** 1.2
    return (y - np.mean(y)) * env * gain * 3


def impact():
    t = np.arange(int(1.6 * SR)) / SR
    boom = np.sin(2 * np.pi * (38 + 90 * np.exp(-t * 6)) * t) * np.exp(-t * 2.4)
    crash = np.diff(rng.uniform(-1, 1, len(t)), prepend=0) * np.exp(-t * 3.2) * 0.6
    return np.tanh(1.6 * boom) + crash


def ping(freq):
    t = np.arange(int(0.35 * SR)) / SR
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 14) * 0.5


CH = [(33, [57, 60, 64]), (29, [53, 57, 60]), (36, [55, 60, 64]), (31, [55, 59, 62])]
K, C, H, OH = kick(), clap(), hat(), hat(True)
BAR = 4 * B
DROP = 8 * B
BREAK = (100 * B, 110 * B)
bars = int(END / BAR) + 2

# intro: dark pad, heartbeat, notification pings, riser into the logo
for k in range(0, 8):
    st(k * B, K, 0.35 if k % 2 == 0 else 0.22)
for i in range(14):
    st(0.15 + i * 0.27 + rng.uniform(0, 0.05), ping(rng.choice([880, 1175, 1568, 988])), 0.12 + 0.012 * i, pan=rng.uniform(-.7, .7))
st(0, pad([45, 52, 57], 8 * B), 0.22)
st(DROP - 4 * B, sweep(4 * B, True, 0.7), 0.8)
st(DROP, impact(), 0.9)

for bar in range(bars):
    t0 = bar * BAR
    if t0 >= END:
        break
    root, ch = CH[bar % 4]
    if t0 < DROP:
        continue
    in_break = BREAK[0] <= t0 < BREAK[1]
    st(t0, pad(ch, BAR), 0.30 if not in_break else 0.40)
    early = t0 < 14 * B
    for b in range(4):
        t = t0 + b * B
        if not in_break:
            st(t, K, 0.95)
            if not early:
                st(t + B / 2, OH, 0.16, pan=0.15)
                if b in (1, 3):
                    st(t, C, 0.5)
                for s in range(4):
                    st(t + s * B / 4, H, 0.10 if s % 2 else 0.16, pan=-0.2)
            st(t + B / 2, bass(root + 12 if b % 2 else root, B / 2), 0.38)
        for s in range(2):
            n = ch[(b * 2 + s) % 3] + 12
            if not early or in_break:
                st(t + s * B / 2, pluck(n), 0.20 if not in_break else 0.26, pan=0.35 if s else -0.35)

# every cut: a short whoosh that peaks on the cut + a tick
for c in CUTS:
    tc = c * B
    st(tc - 0.35, sweep(0.45, False, 0.5), 0.55, pan=0.2)
    st(tc, hat(True), 0.25)
# riser into the final drop (after the breakdown)
st(BREAK[1] - 2 * B, sweep(2 * B, True, 0.6), 0.7)
st(BREAK[1], impact(), 0.7)

# end: tail fade
fade = np.ones(N)
f0 = int((END - 0.4) * SR)
fade[f0:] = np.linspace(1, 0, N - f0) ** 1.5
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max()) or 1
out = np.tanh(1.25 * np.stack([L, R], axis=1) / peak) * 0.88
pcm = (out * 32767).astype('<i2')
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build', 'audio2.wav')
os.makedirs(os.path.dirname(path), exist_ok=True)
with wave.open(path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(path, round(END, 2), 's')
