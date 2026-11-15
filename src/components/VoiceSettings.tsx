import { useEffect, useState } from "react";
import { Play, Volume2 } from "lucide-react";
import { useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import {
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENT_TYPES,
  mergeNotificationPreferences,
} from "../lib/notifications";
import {
  listVoices,
  onVoicesChanged,
  primeVoice,
  speakAlert,
  speechSupported,
} from "../lib/voice";
import { Alert } from "./ui";
import { useToast } from "./Toast";
import type { NotificationEventType } from "../types";

export function VoiceSettingsPanel({ compact = false }: { compact?: boolean }) {
  const { state, currentUser, updateNotificationPreferences } = useApp();
  const { push } = useToast();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices());
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const stop = onVoicesChanged(() => setVoices(listVoices()));
    return stop;
  }, []);

  if (!currentUser) return null;
  const moduleEnabled = featureEnabled(state.settings, "enable_voice_notifications");
  const supported = speechSupported();
  const prefs = mergeNotificationPreferences(currentUser.notificationPreferences);
  const spokenEvents = prefs.voiceEvents ?? NOTIFICATION_EVENT_TYPES;

  function toggleEvent(type: NotificationEventType) {
    const next = spokenEvents.includes(type)
      ? spokenEvents.filter((entry) => entry !== type)
      : [...spokenEvents, type];
    updateNotificationPreferences({ voiceEvents: next });
  }

  async function testVoice() {
    if (!supported) {
      push("This browser has no speech engine. Use Chrome or Safari for voice alerts.", "error");
      return;
    }
    primeVoice();
    setTesting(true);
    try {
      await speakAlert("Voice alert test. Vehicle C B B 1 2 3 4 is ready for collection.", prefs);
      push("Test announcement spoken.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="stack">
      {!moduleEnabled && (
        <Alert tone="warn" title="Voice notifications are switched off">
          Enable the voice notification module in Settings → Modules to use spoken alerts.
        </Alert>
      )}
      {!supported && (
        <Alert tone="warn" title="Speech is not available in this browser">
          Android Chrome and iOS Safari support spoken alerts. Keep the screen open on the
          dashboard and tap once to unlock audio.
        </Alert>
      )}

      <label className="toggle-row">
        <div>
          <div className="small strong">Voice alerts</div>
          <div className="tiny muted">
            Speak short announcements through this device. The vehicle number is read, never the
            job number.
          </div>
        </div>
        <input
          type="checkbox"
          checked={prefs.voiceEnabled}
          disabled={!moduleEnabled}
          onChange={(event) => updateNotificationPreferences({ voiceEnabled: event.target.checked })}
        />
      </label>

      <div>
        <div className="small strong" style={{ marginBottom: 6 }}>
          Spoken event types
        </div>
        <div className={compact ? "stack" : "grid cols-2"} style={{ gap: 6 }}>
          {NOTIFICATION_EVENT_TYPES.map((type) => (
            <label key={type} className="toggle-row" style={{ padding: "8px 10px" }}>
              <div>
                <div className="small strong">{NOTIFICATION_EVENT_LABELS[type].label}</div>
                <div className="tiny muted">{NOTIFICATION_EVENT_LABELS[type].hint}</div>
              </div>
              <input
                type="checkbox"
                checked={spokenEvents.includes(type)}
                disabled={!moduleEnabled || !prefs.voiceEnabled}
                onChange={() => toggleEvent(type)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="grid cols-2" style={{ gap: 12 }}>
        <label className="field">
          <span className="field-label">Announcement voice</span>
          <select
            className="input"
            value={prefs.voiceName ?? ""}
            disabled={!moduleEnabled || !prefs.voiceEnabled}
            onChange={(event) =>
              updateNotificationPreferences({ voiceName: event.target.value || undefined })
            }
          >
            <option value="">Device default</option>
            {voices.map((voice) => (
              <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
          <span className="tiny muted">
            {voices.length
              ? `${voices.length} voices installed on this device.`
              : "Opening the list installs the device voices."}
          </span>
        </label>
        <label className="field">
          <span className="field-label">Speaking rate · {(prefs.voiceRate ?? 1).toFixed(2)}×</span>
          <input
            className="input"
            type="range"
            min={0.7}
            max={1.3}
            step={0.05}
            value={prefs.voiceRate ?? 1}
            disabled={!moduleEnabled || !prefs.voiceEnabled}
            onChange={(event) =>
              updateNotificationPreferences({ voiceRate: Number(event.target.value) })
            }
          />
          <span className="tiny muted">Slower rates are easier to follow on a noisy floor.</span>
        </label>
      </div>

      <label className="toggle-row">
        <div>
          <div className="small strong">Pre-alert chime</div>
          <div className="tiny muted">
            Two short notes before each announcement, so staff look at the screen.
          </div>
        </div>
        <input
          type="checkbox"
          checked={Boolean(prefs.voiceChime)}
          disabled={!moduleEnabled || !prefs.voiceEnabled}
          onChange={(event) => updateNotificationPreferences({ voiceChime: event.target.checked })}
        />
      </label>

      <div className="row wrap" style={{ gap: 8 }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={testVoice}
          disabled={!moduleEnabled || !prefs.voiceEnabled || testing}
        >
          <Play size={14} />
          {testing ? "Speaking…" : "Test voice & chime"}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            primeVoice();
            push("Audio unlocked on this device.");
          }}
          disabled={!supported}
        >
          <Volume2 size={14} />
          Unlock audio
        </button>
      </div>

      <div className="divider" />

      <div className="small strong">In-app notification categories</div>
      {(
        [
          ["jobUpdates", "Job updates", "Gate arrivals, intake and repair completions."],
          ["inventoryAlerts", "Inventory alerts", "Parts requests, low stock and supplier returns."],
          ["paymentAlerts", "Payment alerts", "Advances, payroll, petty cash and credit reminders."],
          ["chequeAlerts", "Cheque alerts", "Cheques received, cleared, bounced or taken back."],
          ["appointmentAlerts", "Reservation alerts", "Booking-link requests and arrivals."],
        ] as const
      ).map(([key, label, hint]) => (
        <label key={key} className="toggle-row">
          <div>
            <div className="small strong">{label}</div>
            <div className="tiny muted">{hint}</div>
          </div>
          <input
            type="checkbox"
            checked={Boolean(prefs[key])}
            onChange={(event) => updateNotificationPreferences({ [key]: event.target.checked })}
          />
        </label>
      ))}

      <Alert tone="info">
        Voice alerts follow the department filter for this account. On Android and iOS, tap
        <strong> Unlock audio </strong> once after signing in; the dashboard then keeps speaking
        while it stays open.
      </Alert>
    </div>
  );
}