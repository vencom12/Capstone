/**
 * Shop Audio Chime Utility (Web Audio API)
 * Generates an instant, pleasant 2-tone boutique counter chime.
 * Requires zero external audio files, zero network requests, and works offline.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export const CHIME_STORAGE_KEY = 'stitch_employee_chime_enabled';

export function isChimeEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(CHIME_STORAGE_KEY);
  return stored !== 'false'; // default to true
}

export function setChimeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CHIME_STORAGE_KEY, enabled ? 'true' : 'false');
}

/**
 * Plays a pleasant boutique 2-tone chime (D5 -> A5)
 * Soft bell envelope with natural decay
 */
export function playOrderChime(): void {
  if (!isChimeEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    // Tone 2: 880.00 Hz (A5) — slightly delayed for a friendly doorbell harmony
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.14);
    gain2.gain.setValueAtTime(0, now + 0.14);
    gain2.gain.linearRampToValueAtTime(0.3, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.14);
    osc2.stop(now + 0.9);
  } catch (err) {
    console.warn('Audio chime playback failed:', err);
  }
}
