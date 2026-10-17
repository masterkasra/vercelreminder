"""Original soundtracks for the Thaler videos, synthesized from scratch (no samples, no licensing issues).

120 BPM, D major (D-A-Bm-G, one chord per 2 s bar) so every scene cut lands on a downbeat.
Sound effects are placed on the exact moments the animation hits.

    python3 music.py          -> out/music.wav        (promo, 32 s)
    python3 music.py guide    -> out/guide-music.wav  (tutorial, 60 s; taps read from out/guide-cues.json)
"""
import json
import os
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
BEAT, BAR = 0.5, 2.0
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(2025)


def T(n):
    return np.arange(n) / SR


def pan_gains(p):
    a = (p + 1) * np.pi / 4
    return np.cos(a), np.sin(a)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def swept_bp(x, f0, f1, q=1.2, chunks=60):
    """Band-pass noise whose centre glides from f0 to f1 (exponentially)."""
    out = np.zeros_like(x)
    edges = np.linspace(0, len(x), chunks + 1).astype(int)
    zi = None
    for k in range(chunks):
        fc = f0 * (f1 / f0) ** (k / max(1, chunks - 1))
        lo, hi = fc / (1 + 1 / (2 * q)), min(fc * (1 + 1 / (2 * q)), SR / 2 - 100)
        sos = butter(2, [lo, hi], 'band', fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[edges[k]:edges[k + 1]], zi = sosfilt(sos, x[edges[k]:edges[k + 1]], zi=zi)
    return out


def saw(f, n, phase=0.0):
    return 2 * ((phase + f * T(n)) % 1.0) - 1


def env_adsr(n, a, r, hold=None):
    t = T(n)
    e = np.minimum(1, t / max(a, 1e-4))
    if hold is not None:
        e *= np.where(t > hold, np.exp(-(t - hold) / r), 1)
    return e


CHORDS = {
    'D': dict(pad=[146.83, 220.00, 293.66, 369.99, 440.00], bass=73.42, arp=[587.33, 739.99, 880.00, 1174.66]),
    'A': dict(pad=[164.81, 220.00, 277.18, 329.63, 440.00], bass=55.00, arp=[554.37, 659.26, 880.00, 1108.73]),
    'Bm': dict(pad=[185.00, 246.94, 293.66, 369.99, 493.88], bass=61.74, arp=[493.88, 587.33, 739.99, 987.77]),
    'G': dict(pad=[196.00, 246.94, 293.66, 392.00, 493.88], bass=49.00, arp=[493.88, 587.33, 783.99, 987.77]),
}
PROG = ['D', 'A', 'Bm', 'G']
chord_at = lambda bar: CHORDS[PROG[bar % 4]]
ARP_PATTERN = [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 2, 1, 0, 1]


class Mix:
    def __init__(self, dur):
        self.dur = dur
        self.n = int(SR * (dur + 1))
        self.bus = {k: np.zeros((2, self.n)) for k in ('music', 'drums', 'sfx', 'verb')}

    def add(self, name, sig, t, gain=1.0, pan=0.0, verb=0.0):
        i = int(round(t * SR))
        if i >= self.n:
            return
        sig = sig[: self.n - i] * gain
        gl, gr = pan_gains(pan)
        self.bus[name][0, i:i + len(sig)] += sig * gl
        self.bus[name][1, i:i + len(sig)] += sig * gr
        if verb:
            self.bus['verb'][0, i:i + len(sig)] += sig * gl * verb
            self.bus['verb'][1, i:i + len(sig)] += sig * gr * verb

    # -------------------------------------------------------------- the musical bed
    def bed(self, groove, end, bright, arp_gain, dense_hats_from, bass_gap=(), roll_to=None, kick_gain=0.62):
        """Pad, bass, arp and drums. `groove(t)` says where drums and bass play; the arp runs 2 s → `end`."""
        bars = int(np.ceil(self.dur / BAR))
        for bar in range(bars):
            t0 = bar * BAR
            n = int((BAR + 1.2) * SR)
            sig = np.zeros(n)
            for f in chord_at(bar)['pad']:
                for d in (-0.006, 0.0, 0.0065):
                    sig += saw(f * (1 + d), n, rng.random())
                sig += 0.6 * np.sin(2 * np.pi * f / 2 * T(n))
            sig = lp(sig, bright(t0)) * env_adsr(n, 0.35, 0.45, hold=BAR)
            g = 0.030 * (0.55 + 0.45 * min(1, t0 / 4)) * (1.2 if t0 >= end else 1)
            self.add('music', sig, t0, g, verb=0.5)

        n = int(3.0 * SR)  # final chord rings out
        sig = sum(saw(f * (1 + d), n) for f in CHORDS['D']['pad'] for d in (-0.006, 0.006))
        self.add('music', lp(sig, 2400) * np.exp(-T(n) / 1.1) * env_adsr(n, 0.02, 1), end, 0.03, verb=0.8)

        for k in range(int(self.dur / 0.25)):  # bass: pulsing eighths with a sub
            t0 = k * 0.25
            if not groove(t0) or any(a <= t0 < b for a, b in bass_gap):
                continue
            f = chord_at(int(t0 // BAR))['bass']
            n = int(0.26 * SR)
            s = lp(saw(f, n) + saw(f * 2.002, n) * 0.5, 650) + 0.8 * np.sin(2 * np.pi * f * T(n))
            self.add('music', s * env_adsr(n, 0.005, 0.09, hold=0.02), t0, 0.16)

        arp = np.zeros((2, self.n))  # sixteenth-note plucks with ping-pong delay
        for k in range(int(self.dur / 0.125)):
            t0 = k * 0.125
            if t0 < 2.0 or t0 >= end:
                continue
            f = chord_at(int(t0 // BAR))['arp'][ARP_PATTERN[k % 16]]
            n = int(0.35 * SR)
            s = (np.sin(2 * np.pi * f * T(n)) + 0.25 * np.sin(2 * np.pi * 2 * f * T(n)) + 0.1 * saw(f, n)) * np.exp(-T(n) / 0.09)
            i = int(t0 * SR)
            gl, gr = pan_gains(0.35 if k % 2 else -0.35)
            arp[0, i:i + n] += s[: self.n - i] * arp_gain(t0) * gl
            arp[1, i:i + n] += s[: self.n - i] * arp_gain(t0) * gr
        d = int(0.375 * SR)
        for _ in range(4):
            arp[0, d:] += arp[1, :-d] * 0.33
            arp[1, d:] += arp[0, :-d] * 0.33
        self.bus['music'] += arp
        self.bus['verb'] += arp * 0.35

        kicks = []
        for b in range(int(self.dur / BEAT)):
            t0 = b * BEAT
            if not groove(t0):
                continue
            self.add('drums', kick(), t0, kick_gain)
            kicks.append(t0)
            if b % 2 == 1:
                self.add('drums', clap(), t0, 0.22, pan=0.05, verb=0.35)
        for k in range(int(self.dur / 0.125)):
            t0 = k * 0.125
            if not groove(t0):
                continue
            if k % 4 == 2:
                self.add('drums', hat(0.06), t0, 0.13, pan=0.25)
            elif t0 >= dense_hats_from or k % 2 == 0:
                self.add('drums', hat(0.022), t0, 0.085 if k % 2 else 0.06, pan=-0.2)
        if roll_to is not None:  # clap roll that speeds up and swells into the call to action
            for k in range(8):
                self.add('drums', clap(), roll_to - 2.0 + k * 0.125, 0.07 + 0.02 * k, verb=0.3)
            for k in range(16):
                self.add('drums', clap(), roll_to - 1.0 + k * 0.0625, 0.12 + 0.012 * k, verb=0.3)

        sc = np.ones(self.n)  # sidechain the music bus to the kick for the modern "pump"
        tt = T(self.n)
        for t0 in kicks:
            i = int(t0 * SR)
            seg = tt[: min(self.n - i, int(0.45 * SR))]
            sc[i:i + len(seg)] = np.minimum(sc[i:i + len(seg)], 1 - 0.55 * np.exp(-seg / 0.11))
        self.bus['music'] *= sc

    # -------------------------------------------------------------- sound effects
    def whoosh(self, t_peak, length=0.6, gain=0.14, lo=250, hi=5000):
        n = int(length * SR)
        s = swept_bp(rng.standard_normal(n), lo, hi)
        t = T(n)
        e = np.where(t < length * 0.75, (t / (length * 0.75)) ** 2.2, np.exp(-(t - length * 0.75) / 0.06))
        self.add('sfx', s * e, t_peak - length * 0.75, gain, verb=0.3)

    def riser(self, t_end, length):
        n = int(length * SR)
        t = T(n)
        s = swept_bp(rng.standard_normal(n), 300, 9000, q=2, chunks=90) * 0.8
        f = 180 * (6 ** (t / length))
        s += 0.25 * lp(2 * ((np.cumsum(f) / SR) % 1) - 1, 4000)
        self.add('sfx', s * (t / length) ** 2.5, t_end - length, 0.16, verb=0.4)

    def impact(self, t0, gain=0.5):
        n = int(2.2 * SR)
        t = T(n)
        f = 32 + 70 * np.exp(-t / 0.18)
        boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.75)
        body = lp(rng.standard_normal(n), 1800) * np.exp(-t / 0.18) * 0.5
        crash = hp(rng.standard_normal(n), 5000) * np.exp(-t / 0.9) * 0.18
        self.add('sfx', np.tanh(1.4 * (boom + body)) + crash, t0, gain, verb=0.5)

    def bell(self, t0, f, gain=0.08, pan=0.0, decay=0.7):
        n = int(decay * 5 * SR)
        t = T(n)
        s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (decay * dk)) for r, a, dk in ((1, 1, 1), (2.76, .35, .5), (5.4, .15, .3), (8.93, .06, .2)))
        self.add('sfx', s, t0, gain, pan=pan, verb=0.6)

    def pop(self, t0, f=900, gain=0.12, pan=0.0):
        n = int(0.12 * SR)
        t = T(n)
        ff = f * (0.6 + 0.4 * np.exp(-t / 0.02))
        self.add('sfx', np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.035), t0, gain, pan=pan, verb=0.15)

    def tick(self, t0, gain=0.06, pan=0.0):
        n = int(0.03 * SR)
        self.add('sfx', bp(rng.standard_normal(n), 2500, 7000) * np.exp(-T(n) / 0.005), t0, gain, pan=pan)

    def coin_intro(self):
        """Coin spin shimmer, landing impact at 1 s, sparkle chimes and a riser into the 4 s drop."""
        n = int(1.0 * SR)
        self.add('sfx', swept_bp(rng.standard_normal(n), 2000, 9000) * np.linspace(0, 1, n) ** 2, 0.1, 0.05, verb=0.5)
        self.impact(1.0, 0.32)
        for k, f in enumerate([1174.66, 1479.98, 1760.00, 2349.32, 1760.00, 2959.96]):
            self.bell(1.3 + k * 0.11, f, 0.05, pan=-0.4 + 0.16 * k)
        self.riser(4.0, 1.6)
        self.whoosh(3.95, 0.7, 0.12)
        self.impact(4.0, 0.17)

    def outro(self, t_land, t_end):
        """Riser and impact as the coin lands on the call to action, then a closing chime."""
        self.riser(t_land, 2.0)
        self.impact(t_land, 0.36)
        self.impact(t_end, 0.14)
        for k, f in enumerate([2349.32, 1760.0, 1479.98, 1174.66, 880.0]):
            self.bell(t_end + 0.05 + k * 0.1, f, 0.035, pan=0.4 - 0.2 * k, decay=0.9)

    # -------------------------------------------------------------- reverb + master
    def write(self, path):
        ir_n = int(2.8 * SR)
        ir = np.stack([lp(rng.standard_normal(ir_n), 6000) * np.exp(-T(ir_n) / 0.55) for _ in range(2)])
        ir[:, : int(0.02 * SR)] = 0
        verb = np.stack([fftconvolve(self.bus['verb'][c], ir[c])[:self.n] for c in range(2)]) * 0.14
        mix = self.bus['music'] + self.bus['drums'] + self.bus['sfx'] + verb
        mix = hp(mix, 28)[:, : int(self.dur * SR)]
        t = T(mix.shape[1])
        mix *= np.clip(t / 0.02, 0, 1) * np.clip((self.dur - t) / 1.4, 0, 1) ** 1.5
        mix /= np.max(np.abs(mix)) + 1e-9
        mix = np.tanh(1.3 * mix) / np.tanh(1.3) * 0.89
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = (mix.T * 32767).astype('<i2').tobytes()
        with open(path, 'wb') as fh:
            fh.write(b'RIFF' + (36 + len(data)).to_bytes(4, 'little') + b'WAVEfmt ' + (16).to_bytes(4, 'little'))
            fh.write((1).to_bytes(2, 'little') + (2).to_bytes(2, 'little') + SR.to_bytes(4, 'little') + (SR * 4).to_bytes(4, 'little'))
            fh.write((4).to_bytes(2, 'little') + (16).to_bytes(2, 'little') + b'data' + len(data).to_bytes(4, 'little') + data)
        print('wrote', path)


def kick():
    n = int(0.5 * SR)
    t = T(n)
    f = 46 + 120 * np.exp(-t / 0.032)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
    s[: int(0.004 * SR)] += rng.standard_normal(int(0.004 * SR)) * 0.4
    return np.tanh(1.6 * s)


def clap():
    n = int(0.35 * SR)
    t = T(n)
    e = sum(np.where(t >= o, np.exp(-(t - o) / 0.007), 0) for o in (0, 0.011, 0.022)) + 0.6 * np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.11), 0)
    return bp(rng.standard_normal(n), 900, 2600) * e


def hat(decay):
    n = int((decay * 6) * SR)
    return hp(rng.standard_normal(n), 7500) * np.exp(-T(n) / decay)


# ------------------------------------------------------------------ the promo (index.html, 32 s)
def promo():
    m = Mix(32.0)
    m.bed(groove=lambda t: (4.0 <= t < 27.0) or (28.0 <= t < 30.0), end=30.0,
          bright=lambda t: 900 if t < 4 else (1600 if t < 22 else 2300),
          arp_gain=lambda t: 0.045 if t < 4 else (0.06 if t < 22 else 0.075),
          dense_hats_from=22, bass_gap=[(27.5, 28.0)], roll_to=28.0)
    m.coin_intro()
    # spaced repetition: cards dealt, one flips, the word counter runs up
    for i in range(3):
        m.pop(4.45 + i * 0.12, 600 + 90 * i, 0.10, pan=(-0.35, 0.35, 0.0)[i])
    m.whoosh(5.6, 0.45, 0.07, 800, 7000)
    for k in range(18):
        m.tick(6.0 + k * 0.06 * (1 + k / 12), 0.025 + 0.002 * k, pan=0.1)
    m.bell(7.1, 1760.0, 0.06)
    m.bell(7.1, 2637.02, 0.03)
    m.whoosh(8.0, 0.6)
    # features: six cards pop in, then pairs light up
    for i in range(6):
        m.pop(8.5 + i * 0.08, 650 + 80 * i, 0.08, pan=(-0.3 if i % 2 else 0.3))
    for t0, f in ((9.1, 1174.66), (10.1, 1318.51), (12.1, 1479.98)):
        m.bell(t0, f, 0.035, pan=-0.2, decay=0.35)
        m.bell(t0 + 0.05, f * 1.5, 0.025, pan=0.2, decay=0.35)
    m.whoosh(14.0, 0.6)
    # dictionary bot on Telegram, then Bale
    for t0 in (14.0, 18.02):
        m.pop(t0 + 0.72, 1100, 0.11, pan=-0.3)
        m.tick(t0 + 1.02, 0.04)
        m.pop(t0 + 1.52, 800, 0.12, pan=0.3)
        for i in range(6):
            m.tick(t0 + 1.72 + i * 0.1, 0.035, pan=0.25 - 0.08 * i)
        m.pop(t0 + 2.52, 1300, 0.08)
        m.bell(t0 + 2.87, 1567.98, 0.03, pan=0.3, decay=0.3)
    m.whoosh(18.0, 0.45, 0.12, 400, 7000)
    m.whoosh(22.0, 0.6)
    # plans
    for i in range(4):
        m.whoosh(22.55 + i * 0.16, 0.35, 0.06, 600, 6000)
    for f, d in ((1318.51, 0), (1760.0, 0.09), (2637.02, 0.18)):  # "cha-ching" on the featured plan
        m.bell(25.0 + d, f, 0.07, pan=0.2)
    m.pop(25.18, 1200, 0.1)
    # call to action
    m.outro(28.0, 30.0)
    for k in range(13):
        m.tick(28.9 + k * 0.8 / 13, 0.05 + 0.01 * (k % 3), pan=0.1)
    m.pop(29.3, 900, 0.1, pan=0.25)
    m.pop(29.45, 1000, 0.1, pan=-0.25)
    m.write(os.path.join(HERE, 'out', 'music.wav'))


# ------------------------------------------------------------------ the tutorial (guide.html, 60 s)
def guide():
    """Effects come from the cue list guide.html exports (render.mjs --cues), so taps and swishes stay in sync."""
    with open(os.path.join(HERE, 'out', 'guide-cues.json')) as fh:
        cues = json.load(fh)
    dur, land = cues['duration'], cues['outro']
    m = Mix(dur)
    # Lighter groove than the promo so the steps read like a walkthrough; full drums only after the first step.
    m.bed(groove=lambda t: (4.0 <= t < land - 1.0) or (land <= t < dur - 2.0), end=dur - 2.0,
          bright=lambda t: 900 if t < 4 else (1500 if t < land else 2300),
          arp_gain=lambda t: 0.045 if t < 4 else (0.055 if t < land else 0.075),
          dense_hats_from=land, bass_gap=[(land - 0.5, land)], roll_to=land, kick_gain=0.5)
    m.coin_intro()
    for c in cues['cues']:
        t, kind = c['t'], c['kind']
        if kind == 'step':
            m.whoosh(t, 0.6, 0.11)
        elif kind == 'tap':
            m.pop(t, 1050, 0.10, pan=0.15)
            m.tick(t, 0.05)
        elif kind == 'drawer':
            m.whoosh(t + 0.2, 0.3, 0.05, 900, 7000)
        elif kind == 'pop':
            m.pop(t, 700 + 300 * (hash(round(t, 2)) % 3), 0.07, pan=-0.2)
        elif kind == 'type':
            m.tick(t, 0.035, pan=0.1)
        elif kind == 'ding':
            m.bell(t, 1760.0, 0.05, pan=0.2, decay=0.5)
            m.bell(t + 0.06, 2637.02, 0.025, pan=-0.2, decay=0.5)
    m.outro(land, dur - 2.0)
    m.write(os.path.join(HERE, 'out', 'guide-music.wav'))


if __name__ == '__main__':
    {'promo': promo, 'guide': guide}[sys.argv[1] if len(sys.argv) > 1 else 'promo']()
