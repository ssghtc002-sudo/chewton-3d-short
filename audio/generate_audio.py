#!/usr/bin/env python3
"""
Audio, Voice Synthesis, Lip-Sync, Procedural BGM/SFX & Subtitles Generator
for "If The Apple Never Fell — The Chewton Theory" (30.00s, 9:16 3D Short).
"""

from __future__ import annotations

import json
import math
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from scipy import signal

# ---------------------------------------------------------------------------
# Paths & Constants
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent.parent
TIMELINE_PATH = ROOT_DIR / "config" / "timeline.json"
AUDIO_OUT_DIR = ROOT_DIR / "audio" / "output"
SUBTITLES_PATH = ROOT_DIR / "output" / "subtitles.srt"
MASTER_WAV_PATH = AUDIO_OUT_DIR / "master_audio.wav"
MANIFEST_PATH = AUDIO_OUT_DIR / "voice_manifest.json"

KOKORO_MODEL_PATH = Path("/home/antigravity/.cache/kokoro-onnx/kokoro-v1.0.int8.onnx")
KOKORO_VOICES_PATH = Path("/home/antigravity/.cache/kokoro-onnx/voices-v1.0.bin")

SAMPLE_RATE = 44100
KOKORO_SR = 24000
DURATION = 30.0
FPS = 30
TOTAL_FRAMES = int(round(DURATION * FPS))  # 900
TOTAL_SAMPLES = int(round(DURATION * SAMPLE_RATE))  # 1,323,000


# ---------------------------------------------------------------------------
# DSP Utility Helpers
# ---------------------------------------------------------------------------
def resample_to_44k(audio_24k: np.ndarray) -> np.ndarray:
    """Exact rational resampling from 24000 Hz to 44100 Hz (147 / 80)."""
    y = signal.resample_poly(audio_24k.astype(np.float64), 147, 80)
    return y.astype(np.float32)


def apply_fade(audio: np.ndarray, fade_in_s: float = 0.012, fade_out_s: float = 0.018) -> np.ndarray:
    out = audio.copy()
    n_in = min(len(out) // 3, int(fade_in_s * SAMPLE_RATE))
    n_out = min(len(out) // 3, int(fade_out_s * SAMPLE_RATE))
    if n_in > 1:
        ramp = 0.5 * (1.0 - np.cos(np.linspace(0.0, np.pi, n_in, dtype=np.float32)))
        if out.ndim == 2:
            out[:n_in] *= ramp[:, None]
        else:
            out[:n_in] *= ramp
    if n_out > 1:
        ramp = 0.5 * (1.0 + np.cos(np.linspace(0.0, np.pi, n_out, dtype=np.float32)))
        if out.ndim == 2:
            out[-n_out:] *= ramp[:, None]
        else:
            out[-n_out:] *= ramp
    return out


def trim_and_tighten_silences(
    audio: np.ndarray,
    sr: int = SAMPLE_RATE,
    edge_thresh: float = 0.012,
    internal_min_gap_s: float = 0.135,
    internal_target_gap_s: float = 0.075,
) -> np.ndarray:
    """Trim leading/trailing silence and gently tighten long internal dead-air pauses."""
    if len(audio) == 0:
        return audio

    # RMS envelope with 10ms window
    win = max(1, int(0.010 * sr))
    kernel = np.ones(win, dtype=np.float32) / win
    env = np.sqrt(np.convolve(audio.astype(np.float32) ** 2, kernel, mode="same") + 1e-12)

    active = np.where(env > edge_thresh)[0]
    if len(active) == 0:
        return audio

    pad_pre = int(0.015 * sr)
    pad_post = int(0.025 * sr)
    start_idx = max(0, int(active[0]) - pad_pre)
    end_idx = min(len(audio), int(active[-1]) + pad_post)
    trimmed = audio[start_idx:end_idx].copy()

    # Tighten oversized internal silence gaps (> internal_min_gap_s) down to internal_target_gap_s
    env_t = np.sqrt(np.convolve(trimmed ** 2, kernel, mode="same") + 1e-12)
    is_silent = env_t < (edge_thresh * 0.95)

    # Run-length encode silent regions
    padded = np.concatenate([[False], is_silent, [False]])
    diffs = np.diff(padded.astype(np.int8))
    sil_starts = np.where(diffs == 1)[0]
    sil_ends = np.where(diffs == -1)[0]

    min_gap_samples = int(internal_min_gap_s * sr)
    target_gap_samples = int(internal_target_gap_s * sr)
    xfade = int(0.008 * sr)

    chunks = []
    cursor = 0
    for s_start, s_end in zip(sil_starts, sil_ends):
        # Skip leading/trailing silences (already trimmed)
        if s_start <= pad_pre or s_end >= len(trimmed) - pad_post:
            continue
        gap_len = s_end - s_start
        if gap_len > min_gap_samples:
            keep_pre = target_gap_samples // 2
            keep_post = target_gap_samples - keep_pre
            cut_start = s_start + keep_pre
            cut_end = s_end - keep_post
            if cut_end > cut_start + 2 * xfade:
                chunks.append(trimmed[cursor : cut_start + xfade])
                # Smooth crossfade across cut
                fade_out = np.linspace(1.0, 0.0, xfade, dtype=np.float32)
                fade_in = np.linspace(0.0, 1.0, xfade, dtype=np.float32)
                tail = chunks[-1][-xfade:] * fade_out
                head = trimmed[cut_end - xfade : cut_end] * fade_in
                chunks[-1] = chunks[-1][:-xfade]
                chunks.append(tail + head)
                cursor = cut_end

    if cursor < len(trimmed):
        chunks.append(trimmed[cursor:])

    out = np.concatenate(chunks) if chunks else trimmed
    return apply_fade(out, fade_in_s=0.010, fade_out_s=0.015)


def ffmpeg_atempo(audio: np.ndarray, tempo: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Clean pitch-preserving time stretch via ffmpeg atempo filter."""
    if abs(tempo - 1.0) < 0.005:
        return audio

    filters = []
    t = tempo
    while t > 2.0:
        filters.append("atempo=2.0")
        t /= 2.0
    while t < 0.5:
        filters.append("atempo=0.5")
        t /= 0.5
    filters.append(f"atempo={t:.5f}")
    filter_str = ",".join(filters)

    with tempfile.TemporaryDirectory() as tmpdir:
        in_wav = os.path.join(tmpdir, "in.wav")
        out_wav = os.path.join(tmpdir, "out.wav")
        sf.write(in_wav, audio, sr, subtype="FLOAT")
        cmd = [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            in_wav,
            "-filter:a",
            filter_str,
            "-ar",
            str(sr),
            "-ac",
            "1",
            out_wav,
        ]
        subprocess.run(cmd, check=True)
        stretched, _ = sf.read(out_wav, dtype="float32")
    return apply_fade(stretched, fade_in_s=0.008, fade_out_s=0.012)


def process_dialogue_voice(audio: np.ndarray, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Apply broadcast polish to synthesized voice: 85Hz HPF, 3kHz presence, soft compression."""
    y = audio.astype(np.float64)

    # 85 Hz 2nd-order Butterworth high-pass filter
    sos_hp = signal.butter(2, 85.0, btype="highpass", fs=sr, output="sos")
    y = signal.sosfilt(sos_hp, y)

    # 3.1 kHz presence boost (+2.4 dB peaking EQ)
    f0 = 3100.0
    q = 1.1
    gain_db = 2.4
    A = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * f0 / sr
    alpha = math.sin(w0) / (2.0 * q)
    b0 = 1.0 + alpha * A
    b1 = -2.0 * math.cos(w0)
    b2 = 1.0 - alpha * A
    a0 = 1.0 + alpha / A
    a1 = -2.0 * math.cos(w0)
    a2 = 1.0 - alpha / A
    y = signal.lfilter([b0 / a0, b1 / a0, b2 / a0], [1.0, a1 / a0, a2 / a0], y)

    # Gentle warm soft-knee compression
    win = int(0.015 * sr)
    kernel = np.ones(win, dtype=np.float64) / win
    env = np.sqrt(np.convolve(y ** 2, kernel, mode="same") + 1e-10)
    thresh = 0.14
    ratio = 2.4
    gain = np.ones_like(env)
    over = env > thresh
    gain[over] = (thresh * (env[over] / thresh) ** (1.0 / ratio)) / env[over]
    # Smooth gain envelope
    sos_env = signal.butter(1, 35.0, btype="lowpass", fs=sr, output="sos")
    gain = signal.sosfilt(sos_env, gain)
    y = y * gain * 1.25

    # Peak safety per clip
    pk = float(np.max(np.abs(y)))
    if pk > 0.88:
        y *= 0.88 / pk
    return y.astype(np.float32)


def pan_mono_to_stereo(mono: np.ndarray, pan: float = 0.0) -> np.ndarray:
    """Constant-power stereo panning (-1.0 left .. +1.0 right)."""
    p = max(-1.0, min(1.0, pan))
    theta = (p + 1.0) * (math.pi / 4.0)
    left = mono * math.cos(theta)
    right = mono * math.sin(theta)
    return np.stack([left, right], axis=1).astype(np.float32)


def butter_bandpass(audio: np.ndarray, low_hz: float, high_hz: float, sr: int = SAMPLE_RATE, order: int = 2) -> np.ndarray:
    nyq = 0.5 * sr
    lo = max(20.0, min(low_hz, nyq * 0.95))
    hi = max(lo + 20.0, min(high_hz, nyq * 0.98))
    sos = signal.butter(order, [lo, hi], btype="bandpass", fs=sr, output="sos")
    return signal.sosfilt(sos, audio).astype(np.float32)


def butter_lowpass(audio: np.ndarray, cutoff_hz: float, sr: int = SAMPLE_RATE, order: int = 2) -> np.ndarray:
    nyq = 0.5 * sr
    fc = max(25.0, min(cutoff_hz, nyq * 0.98))
    sos = signal.butter(order, fc, btype="lowpass", fs=sr, output="sos")
    return signal.sosfilt(sos, audio).astype(np.float32)


# ---------------------------------------------------------------------------
# Energy-Aligned Word Timestamp Estimation
# ---------------------------------------------------------------------------
def estimate_word_syllables(word: str) -> float:
    clean = re.sub(r"[^a-zA-Z0-9]", "", word).lower()
    if not clean:
        return 1.0
    if clean == "1666":
        return 5.5  # "sixteen sixty-six"
    if clean.isdigit():
        return max(1.5, len(clean) * 1.4)
    # Count vowel clusters
    groups = re.findall(r"[aeiouy]+", clean)
    syl = len(groups)
    if clean.endswith("e") and not clean.endswith(("le", "ee", "ye")) and syl > 1:
        syl -= 1
    # Boost stressed/long words slightly
    if word.isupper() and len(clean) >= 2:
        syl += 0.35
    return float(max(1.0, syl))


def compute_word_timestamps(
    clip_mono: np.ndarray,
    text: str,
    line_start: float,
    sr: int = SAMPLE_RATE,
) -> list[dict[str, Any]]:
    """
    Align word-level timestamps to non-silent active speech energy islands
    inside the synthesized audio clip so word highlights match actual acoustics.
    """
    tokens = re.findall(r"[^\s—]+—?", text)
    if not tokens:
        return []

    dur = len(clip_mono) / sr
    hop = int(0.005 * sr)  # 5ms hop
    win = int(0.012 * sr)  # 12ms window
    n_frames = max(1, len(clip_mono) // hop)
    rms = np.zeros(n_frames, dtype=np.float64)
    for i in range(n_frames):
        s = i * hop
        e = min(len(clip_mono), s + win)
        seg = clip_mono[s:e]
        rms[i] = float(np.sqrt(np.mean(seg ** 2))) if len(seg) else 0.0

    peak_rms = float(np.max(rms)) if len(rms) else 0.1
    thresh = max(0.010, 0.055 * peak_rms)
    active_mask = rms > thresh

    # Bridge tiny consonant closures < 55ms (11 frames)
    bridge_len = 11
    idx = 0
    while idx < n_frames:
        if not active_mask[idx]:
            j = idx
            while j < n_frames and not active_mask[j]:
                j += 1
            if idx > 0 and j < n_frames and (j - idx) <= bridge_len:
                active_mask[idx:j] = True
            idx = j
        else:
            idx += 1

    # Active speech energy density (zero in silent gaps so boundaries avoid dead air)
    activity = np.where(active_mask, np.maximum(rms, thresh) ** 0.45 + 0.18, 0.0)
    total_act = float(np.sum(activity))
    if total_act <= 1e-8:
        activity = np.ones(n_frames, dtype=np.float64)
        total_act = float(n_frames)

    cum_act = np.cumsum(activity) / total_act
    times = (np.arange(n_frames) + 0.5) * (hop / sr)

    weights = np.array([estimate_word_syllables(tok) for tok in tokens], dtype=np.float64)
    cum_weights = np.cumsum(weights) / float(np.sum(weights))

    words_out: list[dict[str, Any]] = []
    prev_end_rel = 0.0

    for i, tok in enumerate(tokens):
        w_frac_start = 0.0 if i == 0 else cum_weights[i - 1]
        w_frac_end = cum_weights[i]

        # Map fraction to time frame via cumulative active energy
        idx_s = int(np.searchsorted(cum_act, w_frac_start, side="left"))
        idx_e = int(np.searchsorted(cum_act, w_frac_end, side="right"))
        idx_s = min(max(0, idx_s), n_frames - 1)
        idx_e = min(max(idx_s + 1, idx_e), n_frames - 1)

        # Snap start/end inward onto active speech frames
        span_active = np.where(active_mask[idx_s : idx_e + 1])[0]
        if len(span_active) > 0:
            rel_s = float(times[idx_s + span_active[0]]) - 0.010
            rel_e = float(times[idx_s + span_active[-1]]) + 0.015
        else:
            rel_s = float(times[idx_s])
            rel_e = float(times[idx_e])

        rel_s = max(prev_end_rel, min(rel_s, dur - 0.04))
        rel_e = max(rel_s + 0.045, min(rel_e, dur))
        if i == len(tokens) - 1:
            # Snap final word end cleanly to last active frame
            all_act = np.where(active_mask)[0]
            if len(all_act):
                rel_e = max(rel_s + 0.05, min(dur, float(times[all_act[-1]]) + 0.025))

        prev_end_rel = rel_e
        abs_s = round(line_start + rel_s, 3)
        abs_e = round(line_start + rel_e, 3)
        words_out.append(
            {
                "word": tok,
                "start": abs_s,
                "end": abs_e,
                "startFrame": int(round(abs_s * FPS)),
                "endFrame": int(round(abs_e * FPS)),
            }
        )

    return words_out


# ---------------------------------------------------------------------------
# Procedural Comedy BGM (44100 Hz Stereo, 30.00s)
# ---------------------------------------------------------------------------
def midi_to_hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69.0) / 12.0))


def synth_plucked_harpsichord(freq: float, dur: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    n = max(1, int(dur * sr))
    t = np.arange(n, dtype=np.float64) / sr
    # Bright baroque plucked harmonic series with fast high-harmonic decay
    sig = np.zeros(n, dtype=np.float64)
    for k, amp in [(1, 1.0), (2, 0.72), (3, 0.45), (4, 0.30), (5, 0.18), (6, 0.10)]:
        decay = math.exp(-1.0)  # placeholder
        sig += amp * np.sin(2.0 * math.pi * freq * k * t) * np.exp(-t * (5.5 + 3.2 * k))
    env = (1.0 - np.exp(-t / 0.004)) * np.exp(-t * 4.8)
    out = (sig * env * 0.28).astype(np.float32)
    return apply_fade(out, 0.003, 0.015)


def synth_pizz_bass(freq: float, dur: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    n = max(1, int(dur * sr))
    t = np.arange(n, dtype=np.float64) / sr
    sig = (
        0.90 * np.sin(2.0 * math.pi * freq * t)
        + 0.42 * np.sin(2.0 * math.pi * freq * 2.0 * t) * np.exp(-t * 9.0)
        + 0.18 * np.sin(2.0 * math.pi * freq * 3.0 * t) * np.exp(-t * 14.0)
    )
    env = (1.0 - np.exp(-t / 0.006)) * np.exp(-t * 5.2)
    return apply_fade((sig * env * 0.45).astype(np.float32), 0.003, 0.020)


def synth_kick(dur: float = 0.24, sr: int = SAMPLE_RATE) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n, dtype=np.float64) / sr
    f_sweep = 48.0 + 135.0 * np.exp(-t * 42.0)
    phase = 2.0 * math.pi * np.cumsum(f_sweep) / sr
    body = np.sin(phase) * np.exp(-t * 11.5)
    click = np.sin(2.0 * math.pi * 1400.0 * t) * np.exp(-t * 180.0) * 0.22
    out = np.tanh((body + click) * 1.4) * (1.0 - np.exp(-t / 0.0015))
    return apply_fade(out.astype(np.float32), 0.001, 0.025)


def synth_clap_snare(rng: np.random.Generator, dur: float = 0.18, sr: int = SAMPLE_RATE) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n, dtype=np.float64) / sr
    noise = rng.standard_normal(n).astype(np.float32)
    band = butter_bandpass(noise, 950.0, 5200.0, sr, order=2)
    # Multi-burst clap transient + tail
    env = (
        np.exp(-((t - 0.002) ** 2) / (2 * 0.002 ** 2)) * 0.8
        + np.exp(-((t - 0.012) ** 2) / (2 * 0.002 ** 2)) * 0.9
        + np.exp(-t * 22.0) * 0.65
    )
    tone = np.sin(2.0 * math.pi * 195.0 * t) * np.exp(-t * 36.0) * 0.35
    return apply_fade((band * env + tone).astype(np.float32) * 0.60, 0.001, 0.020)


def synth_hihat(rng: np.random.Generator, open_hat: bool = False, sr: int = SAMPLE_RATE) -> np.ndarray:
    dur = 0.16 if open_hat else 0.055
    n = int(dur * sr)
    t = np.arange(n, dtype=np.float64) / sr
    noise = rng.standard_normal(n).astype(np.float32)
    hi = butter_bandpass(noise, 6500.0, 14500.0, sr, order=2)
    decay = 18.0 if open_hat else 78.0
    env = (1.0 - np.exp(-t / 0.001)) * np.exp(-t * decay)
    return apply_fade((hi * env * 0.35).astype(np.float32), 0.001, 0.010)


def synth_trap_bass(freq: float, dur: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    n = max(1, int(dur * sr))
    t = np.arange(n, dtype=np.float64) / sr
    # Punchy 808 + warm odd harmonics
    sub = np.sin(2.0 * math.pi * freq * t)
    harm = 0.35 * np.sin(2.0 * math.pi * freq * 2.0 * t) + 0.18 * np.sin(2.0 * math.pi * freq * 3.0 * t)
    sig = np.tanh((sub + harm * np.exp(-t * 6.0)) * 1.4)
    env = (1.0 - np.exp(-t / 0.008)) * np.exp(-t * 3.0)
    return apply_fade((sig * env * 0.45).astype(np.float32), 0.003, 0.025)


def synth_brass_chord(freqs: list[float], dur: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Rich stereo saw-stack brassy synth chord with punchy low-pass envelope."""
    n = max(1, int(dur * sr))
    t = np.arange(n, dtype=np.float64) / sr
    left = np.zeros(n, dtype=np.float64)
    right = np.zeros(n, dtype=np.float64)
    detunes = [-0.005, 0.0, +0.005]
    for idx, f in enumerate(freqs):
        for d_idx, det in enumerate(detunes):
            fd = f * (1.0 + det)
            # Band-limited saw approx (first 7 harmonics)
            voice = np.zeros(n, dtype=np.float64)
            for k in range(1, 8):
                voice += ((-1.0) ** (k + 1)) * (1.0 / k) * np.sin(2.0 * math.pi * fd * k * t) * np.exp(-t * 0.25 * k)
            pan = -0.35 if (idx + d_idx) % 2 == 0 else +0.35
            left += voice * (0.5 - pan * 0.4)
            right += voice * (0.5 + pan * 0.4)

    env = (1.0 - np.exp(-t / 0.022)) * np.exp(-t * 1.2)
    stereo = np.stack([left * env, right * env], axis=1).astype(np.float32) * 0.14
    stereo[:, 0] = butter_lowpass(stereo[:, 0], 3200.0, sr)
    stereo[:, 1] = butter_lowpass(stereo[:, 1], 3200.0, sr)
    return apply_fade(stereo, 0.010, 0.045)


def place_stereo(bus: np.ndarray, clip: np.ndarray, time_s: float, gain: float = 1.0, pan: float = 0.0) -> None:
    idx = int(round(time_s * SAMPLE_RATE))
    if idx >= len(bus) or idx + len(clip) <= 0:
        return
    stereo = clip if clip.ndim == 2 else pan_mono_to_stereo(clip, pan)
    src_start = max(0, -idx)
    dst_start = max(0, idx)
    copy_len = min(len(stereo) - src_start, len(bus) - dst_start)
    if copy_len > 0:
        bus[dst_start : dst_start + copy_len] += stereo[src_start : src_start + copy_len] * gain


def generate_bgm(rng: np.random.Generator) -> np.ndarray:
    """Synthesize dynamic 4-movement 30.00s stereo comedy BGM."""
    bgm = np.zeros((TOTAL_SAMPLES, 2), dtype=np.float32)

    # --- MOVEMENT 1 (0.00 .. 7.36s): 1666 Baroque Pizzicato Comedy (116 BPM) ---
    beat_116 = 60.0 / 116.0
    eighth = beat_116 / 2.0
    motif_notes = [72, 76, 79, 81, 79, 76, 74, 71, 72, 76, 79, 84, 79, 76, 74, 79]
    bass_notes = [48, 43, 45, 43, 41, 43, 48, 43]
    t_cur = 0.05
    step = 0
    while t_cur < 7.22:
        note = motif_notes[step % len(motif_notes)]
        pan = -0.25 if step % 2 == 0 else 0.25
        pluck = synth_plucked_harpsichord(midi_to_hz(note), 0.32)
        place_stereo(bgm, pluck, t_cur, gain=0.58, pan=pan)
        if step % 2 == 0:
            b_note = bass_notes[(step // 2) % len(bass_notes)]
            place_stereo(bgm, synth_pizz_bass(midi_to_hz(b_note), 0.36), t_cur, gain=0.72, pan=0.0)
        if step % 2 == 1:
            # Light crisp Baroque wood tap
            tap_t = np.arange(int(0.04 * SAMPLE_RATE), dtype=np.float64) / SAMPLE_RATE
            tap = (np.sin(2.0 * math.pi * 1180.0 * tap_t) * np.exp(-tap_t * 95.0)).astype(np.float32)
            place_stereo(bgm, tap, t_cur, gain=0.14, pan=-0.18)
        t_cur += eighth
        step += 1

    # Hard tape-stop gap at 7.36s..7.60s
    cut_idx = int(7.36 * SAMPLE_RATE)
    end_gap_idx = int(7.60 * SAMPLE_RATE)
    bgm[cut_idx - int(0.02 * SAMPLE_RATE) : cut_idx] *= np.linspace(1.0, 0.0, int(0.02 * SAMPLE_RATE))[:, None]
    bgm[cut_idx:end_gap_idx] = 0.0

    # --- MOVEMENT 2 (7.60 .. 19.80s): Bouncy Zero-G Comedy Trap Groove (124 BPM) ---
    beat_124 = 60.0 / 124.0
    sixteenth = beat_124 / 4.0
    kick_wav = synth_kick()
    clap_wav = synth_clap_snare(rng)
    hat_c = synth_hihat(rng, open_hat=False)
    hat_o = synth_hihat(rng, open_hat=True)
    bass_pattern = [36, 36, 39, 41, 43, 46, 43, 39]  # C2, Eb2, F2, G2, Bb2...
    kalimba_notes = [72, 75, 79, 82, 84, 79, 75, 74]

    t_cur = 7.62
    step16 = 0
    while t_cur < 19.65:
        bar_step = step16 % 16
        # Kick on 0, 6, 10
        if bar_step in (0, 6, 10):
            place_stereo(bgm, kick_wav, t_cur, gain=0.68, pan=0.0)
        # Clap on 4 and 12
        if bar_step in (4, 12):
            place_stereo(bgm, clap_wav, t_cur, gain=0.52, pan=0.05)
        # Hats every 2 sixteenths, ramping to 16th-note rolls before Beat 4 & Beat 5
        if bar_step % 2 == 0 or (12.2 <= t_cur <= 13.2) or (18.6 <= t_cur <= 19.65):
            hat = hat_o if bar_step == 14 else hat_c
            place_stereo(bgm, hat, t_cur, gain=0.38 if bar_step % 2 == 0 else 0.25, pan=0.18 if bar_step % 4 == 0 else -0.18)
        # Bouncy 808 bass on quarter/offbeats
        if bar_step in (0, 3, 6, 10, 14):
            bn = bass_pattern[(step16 // 2) % len(bass_pattern)]
            place_stereo(bgm, synth_trap_bass(midi_to_hz(bn), 0.34), t_cur, gain=0.72, pan=0.0)
        # Airy zero-G kalimba sparkles during upside_down_montage (13.2 .. 19.7s)
        if t_cur >= 13.20 and bar_step % 2 == 0:
            kn = kalimba_notes[(step16 // 2) % len(kalimba_notes)]
            kt = np.arange(int(0.28 * SAMPLE_RATE), dtype=np.float64) / SAMPLE_RATE
            kal = (
                (np.sin(2.0 * math.pi * midi_to_hz(kn) * kt) + 0.25 * np.sin(2.0 * math.pi * midi_to_hz(kn) * 4.0 * kt))
                * np.exp(-kt * 11.0)
            ).astype(np.float32)
            place_stereo(bgm, apply_fade(kal, 0.002, 0.015), t_cur, gain=0.22, pan=-0.32 if bar_step % 4 == 0 else 0.32)

        t_cur += sixteenth
        step16 += 1

    # --- MOVEMENT 3 (19.80 .. 25.78s): Epic Cool Thug-Life Synth Bass & Brass Drop ---
    chords = [
        [48, 55, 60, 63, 67, 70],  # Cm7
        [44, 51, 56, 60, 63, 67],  # Abmaj7
        [46, 53, 58, 62, 65, 70],  # Bb
        [43, 50, 55, 60, 62, 67],  # G7sus4
    ]
    bar_dur = beat_124 * 2.0  # ~0.968s half-bar chord hits
    t_cur = 19.82
    c_idx = 0
    while t_cur < 25.45:
        ch = chords[c_idx % len(chords)]
        chord_wav = synth_brass_chord([midi_to_hz(m) for m in ch], min(bar_dur, 25.75 - t_cur))
        place_stereo(bgm, chord_wav, t_cur, gain=0.85)
        place_stereo(bgm, synth_trap_bass(midi_to_hz(ch[0] - 12), 0.72), t_cur, gain=0.82)
        t_cur += bar_dur
        c_idx += 1

    # Driving hip-hop groove over Movement 3
    t_cur = 19.82
    step16 = 0
    while t_cur < 25.72:
        bar_step = step16 % 16
        if bar_step in (0, 6, 8, 10):
            place_stereo(bgm, kick_wav, t_cur, gain=0.80, pan=0.0)
        if bar_step in (4, 12):
            place_stereo(bgm, clap_wav, t_cur, gain=0.68, pan=0.0)
        if bar_step % 2 == 0:
            place_stereo(bgm, hat_c, t_cur, gain=0.42, pan=-0.22 if bar_step % 4 == 0 else 0.22)
        t_cur += sixteenth
        step16 += 1

    # Hard comedic cutoff right before BONK (25.78s..26.25s silent for maximum slap!)
    bonk_cut = int(25.78 * SAMPLE_RATE)
    outro_resume = int(26.25 * SAMPLE_RATE)
    bgm[bonk_cut - int(0.02 * SAMPLE_RATE) : bonk_cut] *= np.linspace(1.0, 0.0, int(0.02 * SAMPLE_RATE))[:, None]
    bgm[bonk_cut:outro_resume] = 0.0

    # --- MOVEMENT 4 (26.25 .. 29.96s): Comedic Outro Pizzicato Sting ---
    outro_notes = [
        (26.30, 43, 0.35, 0.60),
        (26.75, 48, 0.35, 0.65),
        (27.20, 46, 0.30, 0.55),
        (27.65, 43, 0.35, 0.55),
        (28.15, 48, 0.45, 0.52),
        (29.68, 72, 0.24, 0.42),  # Cheeky high final plink!
    ]
    for t_n, midi_n, dur_n, g_n in outro_notes:
        if midi_n >= 65:
            place_stereo(bgm, synth_plucked_harpsichord(midi_to_hz(midi_n), dur_n), t_n, gain=g_n, pan=0.10)
        else:
            place_stereo(bgm, synth_pizz_bass(midi_to_hz(midi_n), dur_n), t_n, gain=g_n, pan=0.0)

    # Smooth fade-out before 30.00s
    bgm = apply_fade(bgm, fade_in_s=0.02, fade_out_s=0.06)
    return bgm


# ---------------------------------------------------------------------------
# Procedural High-Impact Stereo Comedy SFX
# ---------------------------------------------------------------------------
def synth_sfx(sfx_type: str, rng: np.random.Generator) -> np.ndarray:
    sr = SAMPLE_RATE

    if sfx_type == "vine_boom":
        dur = 0.85
        n = int(dur * sr)
        t = np.arange(n, dtype=np.float64) / sr
        freq = 36.0 + 95.0 * np.exp(-t * 14.0)
        phase = 2.0 * math.pi * np.cumsum(freq) / sr
        sub = np.tanh(np.sin(phase) * 1.75) * np.exp(-t * 4.2)
        thump = np.sin(2.0 * math.pi * 165.0 * t) * np.exp(-t * 45.0) * 0.45
        noise = butter_lowpass(rng.standard_normal(n).astype(np.float32), 450.0, sr) * np.exp(-t * 18.0) * 0.25
        mono = apply_fade((sub + thump + noise).astype(np.float32) * 0.85, 0.002, 0.08)
        # Subtle stereo spread on boom tail
        return np.stack([mono, np.roll(mono, 18) * 0.96], axis=1)

    if sfx_type == "boing":
        dur = 0.56
        n = int(dur * sr)
        t = np.arange(n, dtype=np.float64) / sr
        # Elastic cartoon FM pitch wobble
        wobble = np.sin(2.0 * math.pi * 16.5 * t) * np.exp(-t * 5.0)
        freq = 240.0 + 190.0 * (1.0 - np.exp(-t * 18.0)) + 150.0 * wobble
        phase = 2.0 * math.pi * np.cumsum(freq) / sr
        mod = np.sin(phase * 2.0) * 0.65 * np.exp(-t * 4.0)
        sig = np.sin(phase + mod) * np.exp(-t * 4.8)
        pluck = np.sin(2.0 * math.pi * 520.0 * t) * np.exp(-t * 85.0) * 0.35
        mono = apply_fade(((sig + pluck) * 0.72).astype(np.float32), 0.002, 0.04)
        return pan_mono_to_stereo(mono, 0.05)

    if sfx_type == "record_scratch":
        dur = 0.42
        n = int(dur * sr)
        t = np.arange(n, dtype=np.float64) / sr
        # Chirpy vinyl back-and-forth pitch scratch
        f_chirp = 750.0 + 1500.0 * np.sin(2.0 * math.pi * 9.0 * t) * np.exp(-t * 2.5)
        f_chirp = np.maximum(160.0, f_chirp)
        phase = 2.0 * math.pi * np.cumsum(f_chirp) / sr
        tonal = np.tanh(np.sin(phase) * 2.1 + 0.4 * np.sin(phase * 3.0))
        grit = butter_bandpass(rng.standard_normal(n).astype(np.float32), 800.0, 4800.0, sr)
        # Double scratch envelope
        env = (
            np.exp(-((t - 0.07) ** 2) / (2 * 0.045 ** 2))
            + 0.95 * np.exp(-((t - 0.22) ** 2) / (2 * 0.065 ** 2))
        )
        mono = apply_fade(((0.55 * tonal + 0.60 * grit) * env * 0.68).astype(np.float32), 0.002, 0.03)
        return np.stack([mono, np.roll(mono, 12)], axis=1)

    if sfx_type == "whoosh":
        dur = 0.44
        n = int(dur * sr)
        t = np.arange(n, dtype=np.float64) / sr
        noise_l = rng.standard_normal(n).astype(np.float32)
        noise_r = rng.standard_normal(n).astype(np.float32)
        # Swept-resonance approximation using low/mid/high crossfade
        low_l = butter_bandpass(noise_l, 180.0, 750.0, sr)
        high_l = butter_bandpass(noise_l, 800.0, 3200.0, sr)
        low_r = butter_bandpass(noise_r, 180.0, 750.0, sr)
        high_r = butter_bandpass(noise_r, 800.0, 3200.0, sr)
        sweep = np.sin(math.pi * (t / dur)) ** 1.4
        env = np.sin(math.pi * (t / dur)) ** 1.6
        l = ((1.0 - sweep) * low_l + sweep * high_l) * env * 0.90
        r = ((1.0 - sweep) * low_r + sweep * high_r) * env * 0.90
        return apply_fade(np.stack([l, r], axis=1).astype(np.float32), 0.01, 0.03)

    if sfx_type == "shimmer":
        dur = 1.15
        n = int(dur * sr)
        out = np.zeros((n, 2), dtype=np.float32)
        notes = [72, 75, 79, 82, 86, 91, 96]  # C5, Eb5, G5, Bb5, D6, G6, C7
        for i, m in enumerate(notes):
            t_off = i * 0.075
            hz = midi_to_hz(m)
            ln = int(0.55 * sr)
            tt = np.arange(ln, dtype=np.float64) / sr
            bell = (
                np.sin(2.0 * math.pi * hz * tt)
                + 0.35 * np.sin(2.0 * math.pi * hz * 2.0 * tt)
                + 0.15 * np.sin(2.0 * math.pi * hz * 3.01 * tt)
            ) * np.exp(-tt * 6.5) * (1.0 - np.exp(-tt / 0.004))
            pan = -0.55 + (i / max(1, len(notes) - 1)) * 1.10
            place_stereo(out, apply_fade((bell * 0.25).astype(np.float32), 0.002, 0.03), t_off, 1.0, pan)
        return apply_fade(out, 0.005, 0.08)

    if sfx_type == "bling":
        dur = 0.78
        n = int(dur * sr)
        t = np.arange(n, dtype=np.float64) / sr
        freqs = [2093.0, 2637.0, 3135.96, 4186.01]
        sig_l = np.zeros(n, dtype=np.float64)
        sig_r = np.zeros(n, dtype=np.float64)
        for idx, f in enumerate(freqs):
            delay = idx * 0.035
            mask = t >= delay
            td = np.maximum(0.0, t - delay)
            partial = np.sin(2.0 * math.pi * f * td) * np.exp(-td * 7.2) * mask
            trem = 0.78 + 0.22 * np.sin(2.0 * math.pi * 16.0 * td)
            sig_l += partial * trem * (0.65 if idx % 2 == 0 else 0.35)
            sig_r += partial * trem * (0.35 if idx % 2 == 0 else 0.65)
        out = np.stack([sig_l, sig_r], axis=1).astype(np.float32) * 0.30
        return apply_fade(out, 0.002, 0.08)

    if sfx_type == "bonk":
        dur = 0.85
        n = int(dur * sr)
        t = np.arange(n, dtype=np.float64) / sr
        # Layer 1: Hollow cartoon woody mallet pop (390 Hz -> 205 Hz)
        f_wood = 205.0 + 210.0 * np.exp(-t * 36.0)
        p_wood = 2.0 * math.pi * np.cumsum(f_wood) / sr
        wood = (np.sin(p_wood) + 0.45 * np.sin(p_wood * 2.45)) * np.exp(-t * 14.5)
        # Layer 2: Deep shockwave sub thud
        f_sub = 42.0 + 115.0 * np.exp(-t * 28.0)
        p_sub = 2.0 * math.pi * np.cumsum(f_sub) / sr
        sub = np.tanh(np.sin(p_sub) * 1.7) * np.exp(-t * 6.0)
        # Layer 3: Crisp slap transient + springy comic wobble
        snap = butter_bandpass(rng.standard_normal(n).astype(np.float32), 600.0, 4200.0, sr) * np.exp(-t * 85.0)
        spring = np.sin(2.0 * math.pi * (310.0 + 80.0 * np.sin(2.0 * math.pi * 19.0 * t)) * t) * np.exp(-t * 9.5) * 0.22
        mono = apply_fade(((0.62 * wood + 0.68 * sub + 0.45 * snap + spring) * 0.78).astype(np.float32), 0.001, 0.08)
        return np.stack([mono, np.roll(mono, 10)], axis=1)

    if sfx_type == "daze_chime":
        dur = 1.35
        n = int(dur * sr)
        t = np.arange(n, dtype=np.float64) / sr
        # Orbiting cartoon birdie/star bell flutter
        f_orbit = 1680.0 + 380.0 * np.sin(2.0 * math.pi * 6.2 * t)
        phase = 2.0 * math.pi * np.cumsum(f_orbit) / sr
        chime = (np.sin(phase) + 0.3 * np.sin(phase * 1.5)) * np.exp(-t * 2.1) * (1.0 - np.exp(-t / 0.015))
        pan_l = 0.5 + 0.45 * np.sin(2.0 * math.pi * 3.1 * t)
        pan_r = 1.0 - pan_l
        out = np.stack([chime * pan_l, chime * pan_r], axis=1).astype(np.float32) * 0.34
        return apply_fade(out, 0.01, 0.15)

    # Fallback pop
    n = int(0.2 * sr)
    t = np.arange(n, dtype=np.float64) / sr
    pop = (np.sin(2.0 * math.pi * 440.0 * t) * np.exp(-t * 24.0)).astype(np.float32)
    return pan_mono_to_stereo(pop, 0.0)


# ---------------------------------------------------------------------------
# Subtitles & Mastering
# ---------------------------------------------------------------------------
def format_srt_time(seconds: float) -> str:
    ms_total = max(0, int(round(seconds * 1000.0)))
    hrs = ms_total // 3600000
    ms_total %= 3600000
    mins = ms_total // 60000
    ms_total %= 60000
    secs = ms_total // 1000
    ms = ms_total % 1000
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def write_srt(lines: list[dict[str, Any]], path: Path) -> None:
    speaker_labels = {
        "narrator": "NARRATOR",
        "chewton": "CHEWTON",
        "apple": "APPLE",
    }
    blocks = []
    for idx, ln in enumerate(lines, start=1):
        t0 = format_srt_time(ln["start"])
        t1 = format_srt_time(ln["end"])
        label = speaker_labels.get(ln["speaker"], ln["speaker"].upper())
        blocks.append(f"{idx}\n{t0} --> {t1}\n[{label}] {ln['text']}\n")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(blocks), encoding="utf-8")


def compute_30fps_lip_sync(bus_mono: np.ndarray) -> list[float]:
    """Compute normalized 0.0..1.0 mouth openness for all 900 frames at 30 fps."""
    samples_per_frame = SAMPLE_RATE // FPS  # 1470
    raw = np.zeros(TOTAL_FRAMES, dtype=np.float64)
    for f in range(TOTAL_FRAMES):
        s = f * samples_per_frame
        e = min(len(bus_mono), s + samples_per_frame)
        seg = bus_mono[s:e]
        raw[f] = float(np.sqrt(np.mean(seg ** 2))) if len(seg) else 0.0

    active = raw[raw > 0.008]
    if len(active) == 0:
        return [0.0] * TOTAL_FRAMES

    p95 = float(np.percentile(active, 95))
    floor = 0.008
    denom = max(1e-4, p95 - floor)
    norm = np.clip((raw - floor) / denom, 0.0, 1.0) ** 0.72

    # Smooth jaw envelope (faster open, smoother close) while keeping silent frames 0
    smoothed = np.zeros(TOTAL_FRAMES, dtype=np.float64)
    prev = 0.0
    for f in range(TOTAL_FRAMES):
        target = float(norm[f])
        alpha = 0.75 if target >= prev else 0.55
        val = prev * (1.0 - alpha) + target * alpha
        if target == 0.0 and val < 0.03:
            val = 0.0
        smoothed[f] = val
        prev = val

    return [round(float(v), 4) for v in smoothed]


# ---------------------------------------------------------------------------
# Main Pipeline
# ---------------------------------------------------------------------------
def main() -> None:
    if not TIMELINE_PATH.exists():
        raise FileNotFoundError(f"Missing timeline config: {TIMELINE_PATH}")
    if not KOKORO_MODEL_PATH.exists() or not KOKORO_VOICES_PATH.exists():
        raise FileNotFoundError("Kokoro ONNX model/voices cache not found.")

    timeline = json.loads(TIMELINE_PATH.read_text(encoding="utf-8"))
    voices_cfg = timeline["voices"]
    dialogue_cfg = timeline["dialogue"]
    sfx_cfg = timeline["sfxEvents"]

    AUDIO_OUT_DIR.mkdir(parents=True, exist_ok=True)
    SUBTITLES_PATH.parent.mkdir(parents=True, exist_ok=True)

    print("Loading Kokoro ONNX...")
    kokoro = Kokoro(str(KOKORO_MODEL_PATH), str(KOKORO_VOICES_PATH))

    # Character dialogue mono buses for accurate per-character lip-sync
    char_buses = {
        "chewton": np.zeros(TOTAL_SAMPLES, dtype=np.float32),
        "apple": np.zeros(TOTAL_SAMPLES, dtype=np.float32),
        "narrator": np.zeros(TOTAL_SAMPLES, dtype=np.float32),
    }
    dialogue_stereo = np.zeros((TOTAL_SAMPLES, 2), dtype=np.float32)

    placed_lines: list[dict[str, Any]] = []
    prev_end = 0.0

    print("\nSynthesizing & aligning dialogue lines:")
    for item in dialogue_cfg:
        line_id = item["id"]
        speaker = item["speaker"]
        v_info = voices_cfg[speaker]
        voice_name = v_info["voice"]
        lang = v_info["lang"]
        pan = float(v_info.get("pan", 0.0))

        display_text = item["text"]
        tts_text = item.get("ttsText", display_text)
        w_start = float(item["windowStart"])
        w_end = float(item["windowEnd"])
        slot_dur = w_end - w_start

        speed = float(item.get("preferredSpeed", 1.08))
        atempo_used = 1.0

        # Step 1: Synthesize & iteratively raise Kokoro speed (up to 1.28) if needed
        clip_mono = np.zeros(0, dtype=np.float32)
        for attempt in range(5):
            raw_24k, _ = kokoro.create(tts_text, voice=voice_name, speed=speed, lang=lang)
            clip_44k = resample_to_44k(raw_24k)
            clip_mono = trim_and_tighten_silences(
                clip_44k,
                SAMPLE_RATE,
                internal_min_gap_s=0.11,
                internal_target_gap_s=0.06,
            )
            dur = len(clip_mono) / SAMPLE_RATE
            if dur <= slot_dur - 0.02 or speed >= 1.28:
                break
            ratio_needed = dur / max(0.3, slot_dur - 0.03)
            speed = min(1.28, round(speed * min(1.18, max(1.04, ratio_needed)), 3))

        # Step 2: Clean pitch-preserving ffmpeg atempo if clip still slightly exceeds slot
        dur = len(clip_mono) / SAMPLE_RATE
        if dur > slot_dur - 0.015:
            atempo_used = dur / max(0.25, slot_dur - 0.025)
            clip_mono = ffmpeg_atempo(clip_mono, atempo_used, SAMPLE_RATE)
            clip_mono = trim_and_tighten_silences(clip_mono, SAMPLE_RATE, internal_min_gap_s=0.18, internal_target_gap_s=0.09)
            dur = len(clip_mono) / SAMPLE_RATE

        # Polish voice EQ + dynamics
        clip_mono = process_dialogue_voice(clip_mono, SAMPLE_RATE)

        # Strict sequential placement inside [0.15s .. 29.75s] without overlap
        start_t = max(w_start, prev_end + 0.055, 0.15)
        end_t = start_t + dur
        if end_t > 29.75:
            # Final safeguard fit
            extra_tempo = dur / max(0.2, 29.73 - start_t)
            clip_mono = ffmpeg_atempo(clip_mono, extra_tempo, SAMPLE_RATE)
            atempo_used *= extra_tempo
            dur = len(clip_mono) / SAMPLE_RATE
            end_t = start_t + dur

        assert start_t > prev_end, f"Overlap detected on {line_id}: {start_t} <= {prev_end}"
        assert 0.15 <= start_t < end_t <= 29.75, f"Out of safe bounds on {line_id}: [{start_t}, {end_t}]"
        prev_end = end_t

        # Place onto character bus & stereo dialogue bus
        idx0 = int(round(start_t * SAMPLE_RATE))
        n_copy = min(len(clip_mono), TOTAL_SAMPLES - idx0)
        char_buses[speaker][idx0 : idx0 + n_copy] += clip_mono[:n_copy]
        place_stereo(dialogue_stereo, clip_mono, start_t, gain=1.0, pan=pan)

        words = compute_word_timestamps(clip_mono, display_text, start_t, SAMPLE_RATE)
        placed_lines.append(
            {
                "id": line_id,
                "beatId": item["beatId"],
                "cameraShot": item["cameraShot"],
                "speaker": speaker,
                "voice": voice_name,
                "text": display_text,
                "ttsText": tts_text,
                "start": round(start_t, 3),
                "end": round(end_t, 3),
                "duration": round(dur, 3),
                "startFrame": int(round(start_t * FPS)),
                "endFrame": int(round(end_t * FPS)),
                "speedUsed": round(speed, 3),
                "atempoApplied": round(atempo_used, 3),
                "words": words,
            }
        )
        print(
            f"  {line_id} [{speaker:8s}] {start_t:6.3f}s -> {end_t:6.3f}s "
            f"(dur={dur:.3f}s, spd={speed:.2f}, atempo={atempo_used:.2f}) | {display_text}"
        )

    # Compute 30fps lip-sync envelopes (exact 900 frames per character)
    lip_sync = {
        "fps": FPS,
        "totalFrames": TOTAL_FRAMES,
        "chewton": compute_30fps_lip_sync(char_buses["chewton"]),
        "apple": compute_30fps_lip_sync(char_buses["apple"]),
        "narrator": compute_30fps_lip_sync(char_buses["narrator"]),
    }

    # Synthesize procedural BGM & Stereo SFX
    rng = np.random.default_rng(1666)
    print("\nSynthesizing procedural 4-movement comedy BGM...")
    bgm_stereo = generate_bgm(rng)

    print("Synthesizing stereo comedy SFX...")
    sfx_stereo = np.zeros((TOTAL_SAMPLES, 2), dtype=np.float32)
    sfx_manifest: list[dict[str, Any]] = []
    sfx_cache: dict[str, np.ndarray] = {}
    for ev in sfx_cfg:
        stype = ev["type"]
        if stype not in sfx_cache:
            sfx_cache[stype] = synth_sfx(stype, rng)
        t_ev = float(ev["time"])
        gain_ev = float(ev.get("gain", 0.55))
        pan_ev = float(ev.get("pan", 0.0))
        clip_sfx = sfx_cache[stype]
        # Pan stereo SFX subtly
        if pan_ev != 0.0:
            left_scale = math.cos((pan_ev + 1.0) * math.pi / 4.0) * 1.414
            right_scale = math.sin((pan_ev + 1.0) * math.pi / 4.0) * 1.414
            clip_panned = np.stack([clip_sfx[:, 0] * left_scale, clip_sfx[:, 1] * right_scale], axis=1)
        else:
            clip_panned = clip_sfx
        place_stereo(sfx_stereo, clip_panned, t_ev, gain=gain_ev)
        sfx_manifest.append(
            {
                "type": stype,
                "time": round(t_ev, 3),
                "frame": int(round(t_ev * FPS)),
                "gain": gain_ev,
                "pan": pan_ev,
                "description": ev.get("description", ""),
            }
        )

    # Smooth sidechain ducking on BGM whenever dialogue is active
    print("Mixing dialogue + SFX + sidechain-ducked BGM...")
    dlg_mono_abs = np.max(np.abs(dialogue_stereo), axis=1).astype(np.float64)
    # Fast attack, smooth 220ms release envelope
    env = np.zeros(TOTAL_SAMPLES, dtype=np.float64)
    att = math.exp(-1.0 / (0.018 * SAMPLE_RATE))
    rel = math.exp(-1.0 / (0.210 * SAMPLE_RATE))
    cur = 0.0
    for i in range(TOTAL_SAMPLES):
        x = dlg_mono_abs[i]
        cur = att * cur + (1.0 - att) * x if x > cur else rel * cur + (1.0 - rel) * x
        env[i] = cur

    duck_amount = np.clip((env - 0.015) / 0.10, 0.0, 1.0)
    duck_gain = (1.0 - 0.65 * duck_amount).astype(np.float32)  # ducks BGM by ~9.1 dB during speech
    bgm_ducked = bgm_stereo * duck_gain[:, None]

    # Sum mix buses
    master = (dialogue_stereo * 0.96) + (sfx_stereo * 0.86) + (bgm_ducked * 0.40)

    # Mastering: transparent soft-knee limiter + target loudness (~ -14.0 LUFS, peak <= -1.0 dBTP)
    rms_cur = float(np.sqrt(np.mean(master ** 2)))
    target_rms = 10.0 ** (-15.75 / 20.0)
    makeup = min(2.4, target_rms / max(1e-6, rms_cur))
    master = master * makeup

    # Transparent soft-clip limiter so peaks stay cleanly <= 0.89 (~ -1.0 dBFS)
    threshold = 0.70
    over = np.abs(master) > threshold
    if np.any(over):
        sign = np.sign(master[over])
        excess = (np.abs(master[over]) - threshold) / (1.0 - threshold)
        master[over] = sign * (threshold + (1.0 - threshold) * np.tanh(excess * 0.82))

    max_amp = float(np.max(np.abs(master)))
    if max_amp > 0.89:
        master *= 0.89 / max_amp
        max_amp = float(np.max(np.abs(master)))

    master = apply_fade(master, fade_in_s=0.008, fade_out_s=0.030)
    assert len(master) == TOTAL_SAMPLES, f"Sample count mismatch: {len(master)} != {TOTAL_SAMPLES}"

    # Export master WAV (exact 44100Hz 16-bit PCM stereo)
    sf.write(str(MASTER_WAV_PATH), master, SAMPLE_RATE, subtype="PCM_16")

    # Compute final master metrics
    final_rms = float(np.sqrt(np.mean(master ** 2)))
    rms_db = round(20.0 * math.log10(max(1e-9, final_rms)), 2)
    peak_db = round(20.0 * math.log10(max(1e-9, max_amp)), 2)

    # Export SRT subtitles
    write_srt(placed_lines, SUBTITLES_PATH)

    # Export voice_manifest.json
    manifest = {
        "title": timeline["title"],
        "fps": FPS,
        "duration": DURATION,
        "totalFrames": TOTAL_FRAMES,
        "sampleRate": SAMPLE_RATE,
        "channels": 2,
        "masterAudio": "audio/output/master_audio.wav",
        "subtitles": "output/subtitles.srt",
        "audioMetrics": {
            "duration": round(len(master) / SAMPLE_RATE, 4),
            "sampleCount": len(master),
            "sampleRate": SAMPLE_RATE,
            "channels": 2,
            "maxAmplitude": round(max_amp, 5),
            "peakDbfs": peak_db,
            "rmsDbfs": rms_db,
            "clipped": bool(max_amp > 0.98),
        },
        "lines": placed_lines,
        "lipSync": lip_sync,
        "sfxEvents": sfx_manifest,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("\n--- Export Summary ---")
    print(f"Master WAV   : {MASTER_WAV_PATH}")
    print(f"Duration     : {manifest['audioMetrics']['duration']:.4f}s ({len(master)} samples @ {SAMPLE_RATE} Hz stereo)")
    print(f"Max Amp      : {max_amp:.5f} ({peak_db:.2f} dBFS) | RMS: {rms_db:.2f} dBFS")
    print(f"Manifest JSON: {MANIFEST_PATH}")
    print(f"Subtitles SRT: {SUBTITLES_PATH}")
    print(
        "LipSync lens : "
        + ", ".join(f"{k}={len(v)}" for k, v in lip_sync.items() if isinstance(v, list))
    )


if __name__ == "__main__":
    main()
