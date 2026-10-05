#!/usr/bin/env python3
"""Sound effects only for the TeleX trailers (no music: it is added on TikTok / YouTube).

120 bpm, A minor (Am - F - C - G). Intro riser, drop when the phone appears,
whooshes on every scene cut, drums out for the final title.

python3 promo/music.py v|h  ->  promo/build/music-v.wav | music-h.wav
"""
import array
import math
import os
import random
import sys
import wave

FMT = sys.argv[1] if len(sys.argv) > 1 else 'v'
SR = 44100
BPM = 120
BEAT = 60 / BPM
# Scene starts, same as T in trailer.html.
if FMT == 'v':
    CUTS = [2, 4, 10, 14, 17, 20, 23, 26]
    DROP, CTA, END = 4, 26, 31
else:
    CUTS = [2, 4, 10, 14, 17, 20, 23, 26, 30]
    DROP, CTA, END = 4, 30, 35

N = int(END * SR)
rnd = random.Random(7)
L = array.array('f', bytes(4 * N))
R = array.array('f', bytes(4 * N))


def add(buf, start, samples, gain=1.0):
    i0 = int(start * SR)
    for i, v in enumerate(samples):
        j = i0 + i
        if 0 <= j < N:
            buf[j] += v * gain


def both(start, samples, gain=1.0, pan=0.0):
    add(L, start, samples, gain * (1 - max(0, pan)))
    add(R, start, samples, gain * (1 + min(0, pan)))


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


# ---------------------------------------------------------------- instruments
def kick(dur=0.45):
    out, ph = [], 0.0
    for i in range(int(dur * SR)):
        t = i / SR
        f = 48 + 110 * math.exp(-t * 28)
        ph += 2 * math.pi * f / SR
        env = math.exp(-t * 7)
        click = math.exp(-t * 300) * 0.4
        out.append(math.tanh(1.8 * math.sin(ph)) * env + click * (rnd.random() * 2 - 1))
    return out


def noise_hit(dur, decay, tone=0.0, hp=0.85):
    out, prev, lp = [], 0.0, 0.0
    for i in range(int(dur * SR)):
        t = i / SR
        n = rnd.random() * 2 - 1
        hpv = n - prev  # crude high-pass
        prev = n
        lp += (hpv - lp) * hp
        out.append((lp + tone * math.sin(2 * math.pi * 190 * t)) * math.exp(-t * decay))
    return out


def clap():
    s = noise_hit(0.3, 18, tone=0.3, hp=0.5)
    for k in (0.011, 0.022):  # a few quick re-hits, like hands
        o = int(k * SR)
        for i in range(o, len(s)):
            s[i] += s[i - o] * 0.5
    return s


def saw(ph, harmonics=6):
    return sum(math.sin(ph * h) / h for h in range(1, harmonics + 1)) * 0.6


def pad(notes, dur, attack=0.25, release=0.6, bright=0.12):
    out, lp = [], 0.0
    phs = [[0.0, 0.0] for _ in notes]
    for i in range(int((dur + release) * SR)):
        t = i / SR
        env = min(1, t / attack) * (1 if t < dur else math.exp(-(t - dur) / release * 3))
        v = 0.0
        for k, n in enumerate(notes):
            f = midi(n)
            phs[k][0] += 2 * math.pi * f * 1.003 / SR
            phs[k][1] += 2 * math.pi * f * 0.997 / SR
            v += saw(phs[k][0], 4) + saw(phs[k][1], 4)
        lp += (v - lp) * bright
        out.append(lp * env / len(notes))
    return out


def bass(note, dur):
    out, ph = [], 0.0
    f = midi(note)
    for i in range(int(dur * SR)):
        t = i / SR
        ph += 2 * math.pi * f / SR
        env = min(1, t / 0.01) * math.exp(-t * 1.8)
        out.append(math.tanh(2.2 * (math.sin(ph) + 0.3 * math.sin(2 * ph))) * env)
    return out


def pluck(note, dur=0.5):
    out, ph = [], 0.0
    f = midi(note)
    for i in range(int(dur * SR)):
        t = i / SR
        ph += 2 * math.pi * f / SR
        out.append((math.sin(ph) + 0.35 * math.sin(3 * ph) * math.exp(-t * 12)) * math.exp(-t * 6))
    return out


def whoosh(dur=0.6, up=True):
    out, lp = [], 0.0
    for i in range(int(dur * SR)):
        t = i / SR
        x = t / dur
        env = math.sin(math.pi * x) ** 2
        cutoff = 0.02 + 0.5 * (x if up else 1 - x)
        lp += ((rnd.random() * 2 - 1) - lp) * cutoff
        out.append(lp * env)
    return out


def riser(dur):
    out, lp, ph = [], 0.0, 0.0
    for i in range(int(dur * SR)):
        t = i / SR
        x = t / dur
        lp += ((rnd.random() * 2 - 1) - lp) * (0.01 + 0.4 * x * x)
        ph += 2 * math.pi * (200 + 900 * x * x) / SR
        out.append((lp * 0.8 + 0.15 * math.sin(ph)) * x * x)
    return out


# ---------------------------------------------------------------- arrangement
CHORDS = [(57, [57, 60, 64, 69]), (53, [53, 57, 60, 65]), (48, [48, 52, 55, 60]), (55, [55, 59, 62, 67])]  # Am F C G
BAR = 4 * BEAT
print('synthesizing', FMT, END, 's')


# intro: ticking hats + riser into the drop
both(DROP - 2.0, riser(2.0), 0.5)
both(DROP, kick(0.9), 0.9)           # one impact when the phone arrives

# cuts
for c in CUTS:
    both(c - 0.35, whoosh(0.6, up=True), 0.5)

# title: impact + bell chord
both(CTA, kick(0.9), 1.0)
both(CTA, noise_hit(1.2, 3, hp=0.3), 0.25)
for k, n in enumerate([81, 84, 88, 93]):
    both(CTA + 0.4 + k * 0.12, pluck(n, 2.5), 0.12, pan=(k - 1.5) * 0.3)

# fade out the last second
for i in range(int((END - 1.2) * SR), N):
    g = max(0.0, (N - i) / (1.2 * SR))
    L[i] *= g
    R[i] *= g

peak = max(max(abs(v) for v in L), max(abs(v) for v in R)) or 1
out = array.array('h', (int(32000 * math.tanh(1.1 * v / peak)) for pair in zip(L, R) for v in pair))
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build', f'sfx-{FMT}.wav')
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(out.tobytes())
print(path)
