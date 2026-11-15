import type { NotificationEventType, UserNotificationPreferences } from "../types";

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  "job",
  "inventory",
  "payment",
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
  voiceRate: 1,
  voiceChime: true,
};

export function mergeNotificationPreferences(
  preferences?: Partial<UserNotificationPreferences> | null,
): UserNotificationPreferences {
  const merged = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(preferences ?? {}),
  };
  return {
    ...merged,
    voiceEvents:
      preferences?.voiceEvents ??
      (DEFAULT_NOTIFICATION_PREFERENCES.voiceEvents ?? []),
    voiceRate: Math.min(1.3, Math.max(0.7, merged.voiceRate ?? 1)),
  };
}