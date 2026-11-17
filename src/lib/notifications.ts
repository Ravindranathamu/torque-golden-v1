import type { NotificationEventType, UserNotificationPreferences } from "../types";

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  "job",
  "inventory",
  "payment",
  "credit",
  "cheque",
  "appointment",
];

export const NOTIFICATION_EVENT_LABELS: Record<
  NotificationEventType,
  { label: string; hint: string }
> = {
  job: {
    label: "Jobs & gate",
    hint: "Gate arrivals, intake, estimates, repair completion and handover.",
  },
  inventory: {
    label: "Stores & inventory",
    hint: "Parts requests, low stock, exchanges, returns and warranty claims.",
  },
  payment: {
    label: "Payments & payroll",
    hint: "Advance payments, payouts, petty cash and credit reminders.",
  },
  credit: {
    label: "Credit approvals",
    hint: "Part-payment release requests, owner/accounting approvals and credit settlements.",
  },
  cheque: {
    label: "Cheques",
    hint: "Customer and supplier cheques received, cleared, bounced or taken back.",
  },
  appointment: {
    label: "Reservations",
    hint: "Booking-link requests, supervisor confirmation and arrivals.",
  },
};

export const DEFAULT_NOTIFICATION_PREFERENCES: UserNotificationPreferences = {
  voiceEnabled: false,
  jobUpdates: true,
  inventoryAlerts: true,
  paymentAlerts: true,
  chequeAlerts: true,
  appointmentAlerts: true,
  voiceEvents: [...NOTIFICATION_EVENT_TYPES],
  voiceEventsVersion: 2,
  voiceRate: 1,
  voiceChime: true,
};

/** New event types are enabled once on upgrade, then the staff choice wins. */
const VOICE_EVENTS_VERSION = 2;

export function mergeNotificationPreferences(
  preferences?: Partial<UserNotificationPreferences> | null,
): UserNotificationPreferences {
  const merged = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(preferences ?? {}),
  };
  const storedEvents = preferences?.voiceEvents;
  const storedVersion = preferences?.voiceEventsVersion ?? 1;
  const voiceEvents =
    storedEvents && storedVersion < VOICE_EVENTS_VERSION
      ? Array.from(new Set<NotificationEventType>([...storedEvents, "credit"]))
      : storedEvents ?? (DEFAULT_NOTIFICATION_PREFERENCES.voiceEvents ?? []);
  return {
    ...merged,
    voiceEvents,
    voiceEventsVersion: VOICE_EVENTS_VERSION,
    voiceRate: Math.min(1.3, Math.max(0.7, merged.voiceRate ?? 1)),
  };
}