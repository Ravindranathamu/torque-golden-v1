import type { UserNotificationPreferences } from "../types";

/**
 * Voice alerts for the workshop floor.
 *
 * Browsers — especially Android Chrome and iOS Safari — only allow speech
 * after a user gesture. `primeVoice()` is called from a tap so later alerts
 * can speak while the phone is locked to the dashboard. A small watchdog
 * resumes Chrome's speech engine when it silently pauses mid-sentence.
 */

let primed = false;
let audioContext: AudioContext | null = null;
let watchdog: number | null = null;
let voices: SpeechSynthesisVoice[] = [];

export function speechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

function refreshVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  const next = window.speechSynthesis.getVoices();
  if (next.length) voices = next;
  return voices;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  if (voices.length) return voices;
  return refreshVoices();
}

export function onVoicesChanged(handler: () => void): () => void {
  if (!speechSupported()) return () => {};
  const synth = window.speechSynthesis;
  synth.addEventListener("voiceschanged", handler);
  refreshVoices();
  return () => synth.removeEventListener("voiceschanged", handler);
}

export function voicePrimed(): boolean {
  return primed;
}

/** Call from a click/tap handler. Unlocks speech and Web Audio on mobile. */
export function primeVoice(): void {
  if (!speechSupported()) return;
  primed = true;
  try {
    refreshVoices();
    const unlock = new SpeechSynthesisUtterance(" ");
    unlock.volume = 0;
    unlock.rate = 1;
    window.speechSynthesis.speak(unlock);
  } catch {
    /* The device will simply stay silent. */
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      audioContext = audioContext ?? new Ctx();
      if (audioContext.state === "suspended") void audioContext.resume();
    }
  } catch {
    /* Audio chime is optional. */
  }
}

function preferredVoice(name?: string): SpeechSynthesisVoice | undefined {
  const available = listVoices();
  if (!available.length) return undefined;
  if (name) {
    const exact = available.find((voice) => voice.name === name);
    if (exact) return exact;
  }
  const english = available.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const sinhala = available.find((voice) => voice.lang.toLowerCase().startsWith("si"));
  return (
    sinhala ??
    english.find((voice) => /female|samantha|zira|google uk english female/i.test(voice.name)) ??
    english[0] ??
    available[0]
  );
}

function stopWatchdog() {
  if (watchdog !== null) {
    window.clearInterval(watchdog);
    watchdog = null;
  }
}

function startWatchdog() {
  if (!speechSupported()) return;
  stopWatchdog();
  watchdog = window.setInterval(() => {
    const synth = window.speechSynthesis;
    if (!synth.speaking && !synth.pending) {
      stopWatchdog();
      return;
    }
    // Chrome pauses long utterances after roughly 15 seconds.
    if (synth.paused) synth.resume();
  }, 4000);
}

/** Two-note workshop chime played before the announcement. */
export async function playPreAlertChime(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioContext = audioContext ?? new Ctx();
    if (audioContext.state === "suspended") await audioContext.resume();
    const context = audioContext;
    const start = context.currentTime;
    [880, 1174.7].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.16, start + index * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.18 + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + index * 0.18);
      oscillator.stop(start + index * 0.18 + 0.18);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 420));
  } catch {
    /* Chime is best-effort; speech still follows. */
  }
}

/** Speak one short alert. Resolves when the utterance finishes or is cut off. */
export async function speakAlert(
  text: string,
  prefs: Pick<UserNotificationPreferences, "voiceName" | "voiceRate" | "voiceChime">,
): Promise<void> {
  if (!speechSupported() || !text.trim()) return;
  if (prefs.voiceChime) await playPreAlertChime();
  const synth = window.speechSynthesis;
  try {
    synth.cancel();
  } catch {
    /* Ignore. */
  }
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      stopWatchdog();
      resolve();
    };
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = preferredVoice(prefs.voiceName);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-LK";
    }
    utterance.rate = Math.min(1.3, Math.max(0.7, prefs.voiceRate ?? 1));
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = finish;
    utterance.onerror = finish;
    try {
      synth.speak(utterance);
      startWatchdog();
    } catch {
      finish();
      return;
    }
    // Safety net for engines that never fire onend.
    window.setTimeout(finish, Math.max(6000, text.length * 130));
  });
}

/** "CBB-1234" becomes "C B B 1 2 3 4" so plates are read clearly. */
export function spokenVehicle(vehicleNo: string): string {
  return vehicleNo
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => chunk.split("").join(" "))
    .join(" ");
}