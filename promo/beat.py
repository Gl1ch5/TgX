#!/usr/bin/env python3
"""Original background track for the TeleX trailers (our own synthesis, no samples, no copyright issues).

Modern punchy house / pop-dance feel, 124 bpm, A minor (Am - F - C - G).
Builds with the scenes: soft intro, drop when the phone appears (4 s), full groove, breakdown-free finish.

python3 promo/beat.py v|h  ->  promo/build/beat-v.wav | beat-h.wav
"""
import os
import sys
import wave

import numpy as np

FMT = sys.argv[1] if len(sys.argv) > 1 else 'v'
END = 31 if FMT == 'v' else 35
DROP = 4
SR = 44100
BPM = 124
BEAT = 60 / BPM
N = int(END * SR)
rng = np.random.default_rng(11)
L = np.zeros(N)
R = np.zeros(N)


def put(buf, t, x, g=1.0):
    i = int(t * SR)
    if i >= N or i < 0:
        return
    x = x[: N - i]
    buf[i:i + len(x)] += x * g


def stereo(t, x, g=1.0, pan=0.0):
    put(L, t, x, g * (1 - max(0, pan)))
    put(R, t, x, g * (1 + min(0, pan)))


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


def lowpass(x, a):
    # one-pole low-pass, a in (0..1)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):  # short buffers only
        acc += (v - acc) * a
        y[i] = acc
    return y


def kick():
    t = np.arange(int(0.35 * SR)) / SR
    ph = 2 * np.pi * np.cumsum(46 + 120 * np.exp(-t * 30)) / SR
    return np.tanh(1.7 * np.sin(ph)) * np.exp(-t * 9) + 0.25 * np.exp(-t * 400) * rng.uniform(-1, 1, len(t))


def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    x = rng.uniform(-1, 1, n)
    x = np.diff(x, prepend=0)  # crude high-pass
    return x * np.exp(-t * (18 if open_ else 90))


def clap():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    x = np.diff(rng.uniform(-1, 1, n), prepend=0) * np.exp(-t * 22)
    for k in (0.010, 0.021):
        o = int(k * SR)
        x[o:] += x[:-o] * 0.55
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


def riser(dur):
    t = np.arange(int(dur * SR)) / SR
    x = np.diff(rng.uniform(-1, 1, len(t)), prepend=0)
    return x * (t / dur) ** 2 * 0.5


CH = [(33, [57, 60, 64]), (29, [53, 57, 60]), (36, [55, 60, 64]), (31, [55, 59, 62])]  # root(bass), chord  Am F C G
BAR = 4 * BEAT
nbars = int(END / BAR) + 1
K, C, H, B = kick(), clap(), hat(), bass(0, 0)
OH = hat(True)

# intro: filtered pad + riser into the drop
for bar in range(nbars):
    t0 = bar * BAR
    if t0 >= END:
        break
    root, ch = CH[bar % 4]
    full = t0 >= DROP
    # pad all the way, quieter before the drop
    p = pad(ch, BAR)
    stereo(t0, p, 0.30 if full else 0.22)
    if not full:
        continue
    for b in range(4):
        t = t0 + b * BEAT
        stereo(t, K, 0.95)                          # four on the floor
        stereo(t + BEAT / 2, OH, 0.16, pan=0.15)    # off-beat open hat
        if b in (1, 3):
            stereo(t, C, 0.5)
        # rolling bass between kicks
        stereo(t + BEAT / 2, bass(root + 12 if b % 2 else root, BEAT / 2), 0.38)
        for s in range(4):
            stereo(t + s * BEAT / 4, H, 0.10 if s % 2 else 0.16, pan=-0.2)
        # 8th-note arp on the chord
        for s in range(2):
            n = ch[(b * 2 + s) % 3] + 12
            stereo(t + s * BEAT / 2, pluck(n), 0.20, pan=0.35 if s else -0.35)

# riser into the drop and an impact
stereo(DROP - 2.0, riser(2.0), 0.6)
stereo(DROP, K, 1.0)

# last 1.2 s fade, soft limiter
fade = np.ones(N)
f0 = int((END - 1.2) * SR)
fade[f0:] = np.linspace(1, 0, N - f0)
L *= fade
R *= fade
peak = max(np.abs(L).max(), np.abs(R).max()) or 1
out = np.stack([L, R], axis=1)
out = np.tanh(1.2 * out / peak) * 0.85
pcm = (out * 32767).astype('<i2')
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build', f'beat-{FMT}.wav')
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(path)
