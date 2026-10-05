# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa", "scikit-learn", "numpy"]
# ///
"""Derive the film's note cues from the Dueling Banjos mp3.

Usage: uv run analysis/make_cues.py ../audio/<song>.mp3 src/cues.json

1. Onsets, split into two instruments by timbre (k-means on mel spectra), grouped into
   call/response phrases. In each exchange the second phrase is the teacher, the next one
   the learner's echo.
2. Notes with pitch (pYIN, chroma fallback), octave-folded; the echo is aligned to the
   teacher phrase note by note.
"""
import json
import sys

import librosa
import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA

SR, HOP = 22050, 256
OFFSET, END = 11.8, 206.5  # video starts/ends at these song times
CR_START, FAST_START, FAST_FROM = 22.0, 126.6, 127.6
ACCEL_END, EXIT = 144.0, 182.0

src, dst = sys.argv[1], sys.argv[2]
y, sr = librosa.load(src, sr=SR, mono=True)
oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)

# --- 1. call/response phrases ---
on = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=HOP, units='time', delta=0.04, wait=2)
on = on[(on > 10.5) & (on < 128)]
L = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=sr, hop_length=HOP, n_mels=40))
frames = librosa.time_to_frames(on, sr=sr, hop_length=HOP)
X = np.stack([L[:, f:f + 6].mean(1) for f in frames])
X = X - X.mean(1, keepdims=True)
lab = KMeans(2, n_init=20, random_state=0).fit_predict(PCA(4).fit_transform(X))
cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=HOP)[0]
c = np.array([cent[f:f + 6].mean() for f in frames])
lab = (lab == (1 if c[lab == 1].mean() > c[lab == 0].mean() else 0)).astype(int)  # 1 = brighter instrument

call_response = [{"call": [12.78], "resp": [15.93, 16.13]}, {"call": [17.09], "resp": [18.37, 18.49]}]
idx = [i for i, t in enumerate(on) if CR_START <= t < FAST_START]
phrases = [[idx[0]]]
for i in idx[1:]:
    (phrases[-1].append(i) if on[i] - on[phrases[-1][-1]] < 0.45 else phrases.append([i]))
runs = []
for p in phrases:
    l = int(round(lab[p].mean()))
    ts = [float(on[i]) for i in p]
    if runs and runs[-1][0] == l:
        runs[-1][1].extend(ts)
    else:
        runs.append([l, ts])
for i in range(0, len(runs) - 1, 2):
    call_response.append({"call": [round(t, 3) for t in runs[i][1]], "resp": [round(t, 3) for t in runs[i + 1][1]]})

# --- 2. pitched notes ---
f0, _, _ = librosa.pyin(y, fmin=70, fmax=1400, sr=sr, hop_length=HOP, frame_length=2048)
non = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=HOP, units='frames', delta=0.03, wait=2)
ft = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=HOP)
chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP)
fold = lambda pc: 54 + ((pc - 54) % 12)

notes = []
for i, f in enumerate(non):
    nxt = non[i + 1] if i + 1 < len(non) else f + 20
    seg = f0[f + 2:min(nxt, f + 14)]
    seg = seg[~np.isnan(seg)]
    midi = int(round(np.median(librosa.hz_to_midi(seg)))) if len(seg) >= 2 else None
    t = round(float(ft[f]), 3)
    if notes and t - notes[-1]['t'] < 0.09:  # merge double-triggered onsets
        if notes[-1]['midi'] is None:
            notes[-1]['midi'] = midi
        continue
    notes.append({'t': t, 'midi': midi})
for n in notes:
    if n['midi'] is not None:
        n['p'] = fold(n['midi'])
    else:
        f = librosa.time_to_frames(n['t'], sr=sr, hop_length=HOP)
        n['p'] = fold(int(np.argmax(chroma[:, f + 2:f + 12].mean(1))))
    del n['midi']


def window(ts):
    return [n for n in notes if ts[0] - 0.06 <= n['t'] <= ts[-1] + 0.06]


def align(a, b):
    """Needleman-Wunsch on pitch: pairs of (teacher index, echo index), None for gaps."""
    A, B = [x['p'] for x in a], [x['p'] for x in b]
    n, m = len(A), len(B)
    D = np.zeros((n + 1, m + 1))
    D[:, 0] = -np.arange(n + 1)
    D[0, :] = -np.arange(m + 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            D[i, j] = max(D[i - 1, j - 1] + (2 if A[i - 1] == B[j - 1] else -1), D[i - 1, j] - 1, D[i, j - 1] - 1)
    i, j, pairs = n, m, []
    while i > 0 or j > 0:
        if i > 0 and j > 0 and D[i, j] == D[i - 1, j - 1] + (2 if A[i - 1] == B[j - 1] else -1):
            pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif i > 0 and D[i, j] == D[i - 1, j] - 1:
            pairs.append((i - 1, None))
            i -= 1
        else:
            pairs.append((None, j - 1))
            j -= 1
    return pairs[::-1]


rounds = []
for k, r in enumerate(call_response):
    teach = window(r['resp'])
    echo = window(call_response[k + 1]['call']) if k + 1 < len(call_response) else [n for n in notes if FAST_START <= n['t'] < FAST_FROM]
    rounds.append({"teach": teach, "echo": echo, "align": [list(p) for p in align(teach, echo)]})

fast = [n for n in notes if FAST_FROM <= n['t'] < 204]
out = {"offset": OFFSET, "end": END, "learnerSolo": [n['t'] for n in window(call_response[0]['call'])], "rounds": rounds, "fast": fast,
       "fastFrom": FAST_FROM, "accelEnd": ACCEL_END, "exit": EXIT, "lastNote": fast[-1]['t']}
json.dump(out, open(dst, 'w'))
print(f"{len(rounds)} exchanges, {len(fast)} fast notes -> {dst}")
