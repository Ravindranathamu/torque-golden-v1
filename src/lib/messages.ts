import type { JobCard, MarketingReminder, WorkshopSettings } from "../types";
import { money, shortDate } from "./utils";

export function acceptanceMessage(job: JobCard, settings: WorkshopSettings): string {
  return `Hello ${job.customerName}! 👋\n\nWe have safely received your vehicle ${job.vehicleNo} at ${settings.companyName}.\n\nJob Card: ${job.id}\nRepair type: ${job.repairType}\n\nOur team is inspecting it now and we will keep you updated. Thank you for trusting us with your vehicle.`;
}

export function checkoutMessage(
  job: JobCard,
  total: number,
  settings: WorkshopSettings,
  creditDue?: string,
): string {
  const base =
    job.paymentMethod === "Credit"
      ? `Thank you for choosing ${settings.companyName}! 🚗\n\nYour vehicle ${job.vehicleNo} has been repaired and released on credit terms.\n\nInvoice: ${job.id}\nInvoice amount: ${money(total)}\nPayment due: ${creditDue ? shortDate(creditDue) : "as agreed"}\n\nPlease find your invoice attached.`
      : `Thank you for choosing ${settings.companyName}! 🚗✨\n\nYour vehicle ${job.vehicleNo} has been serviced and is ready for handover.\n\nInvoice: ${job.id}\nAmount paid: ${money(total)}\n\nPlease find your digital receipt attached.`;
  const review = settings.googleReviewUrl
    ? `\n\nWe would really appreciate a 5-star review on Google:\n${settings.googleReviewUrl}`
    : "";
  return `${base}${review}`;
}

export function creditReminderMessage(
  customerName: string,
  vehicleNo: string,
  remaining: number,
  dueDate: string,
  settings: WorkshopSettings,
): string {
  return `Hello ${customerName},\n\nThis is a friendly payment reminder from ${settings.companyName}.\n\nYour outstanding balance of ${money(remaining)} for vehicle ${vehicleNo} is due on ${shortDate(dueDate)}.\n\nKindly arrange the settlement at your earliest convenience. If you have already paid, please ignore this message.\n\nThank you!`;
}

export function creditSettledMessage(
  customerName: string,
  vehicleNo: string,
  remaining: number,
  settings: WorkshopSettings,
): string {
  return remaining <= 0
    ? `Thank you ${customerName}! ✅\n\nYour account for vehicle ${vehicleNo} is now fully settled with ${settings.companyName}.\n\nWe truly appreciate your business and look forward to serving you again.`
    : `Thank you ${customerName}! ✅\n\nWe have received your payment for vehicle ${vehicleNo}.\n\nRemaining outstanding balance: ${money(remaining)}\n\nPlease arrange settlement of the balance within the agreed credit period. Thank you!`;
}

export function marketingMessage(
  reminder: MarketingReminder,
  settings: WorkshopSettings,
): string {
  if (reminder.triggerType === "Periodic Cycle") {
    const cycle = reminder.avgCycleDays ?? 90;
    return `Hello ${reminder.customerName}! 🚗\n\nWe noticed it has been about ${cycle} days since your last periodic service for ${reminder.vehicleNo} at ${settings.companyName}.\n\nBased on your vehicle's regular driving cycle, your next maintenance is approaching on ${shortDate(reminder.targetDate)}.\n\nScan our entrance QR code or reply to this message to reserve an early slot. See you soon! ✨`;
  }
  return `Hello ${reminder.customerName}! 🚗\n\nTwo days ago our team repaired your vehicle ${reminder.vehicleNo} at ${settings.companyName}. We hope it is driving perfectly.\n\nOur system noticed your odometer is approaching a major service interval — your vehicle is close to its ${reminder.targetMileage?.toLocaleString()} km periodic service.\n\nWe welcome you back to book an early slot and keep your engine healthy and your parts warranty secure. See you soon!`;
}

export function afterServiceFollowUpMessage(
  reminder: MarketingReminder,
  settings: WorkshopSettings,
): string {
  const review = settings.googleReviewUrl
    ? `\n\nIf you are happy with our service, please take 10 seconds to leave us a review:\n${settings.googleReviewUrl}`
    : "";
  return `Hello ${reminder.customerName}! 👋\n\nIt has been 2 days since we handed over your vehicle ${reminder.vehicleNo} at ${settings.companyName}. We want to make sure it is driving beautifully and performing to your complete satisfaction.${review}`;
}

export function handoverMessage(job: JobCard, settings: WorkshopSettings): string {
  return `Dear ${job.customerName},\n\nYour vehicle ${job.vehicleNo} has been handed over from ${settings.companyName}. Thank you for trusting us with your repair.\n\nDrive safely and see you at the next service!`;
}

export function ownerIntakeMessage(job: JobCard, settings: WorkshopSettings): string {
  return `Owner alert · ${settings.companyName}\n\nNew intake: ${job.vehicleNo} (${job.make} ${job.model})\nCustomer: ${job.customerName}\nRepair type: ${job.repairType}\nIntake: ${job.intakeType}\nJob card: ${job.id}\n\nOpen the job card to review photos, tasks and the estimate.`;
}

export function appointmentConfirmedMessage(
  customerName: string,
  vehicleNo: string,
  scheduledAt: string,
  settings: WorkshopSettings,
): string {
  return `Hello ${customerName}, your appointment at ${settings.companyName} is confirmed for ${formatAppointment(scheduledAt)}. Vehicle: ${vehicleNo}. Please call us if you need to change it.`;
}

export function appointmentRescheduledMessage(
  customerName: string,
  vehicleNo: string,
  scheduledAt: string,
  settings: WorkshopSettings,
): string {
  return `Hello ${customerName}, your appointment at ${settings.companyName} has been moved to ${formatAppointment(scheduledAt)}. Vehicle: ${vehicleNo}. Reply here if this is not convenient.`;
}

export function appointmentCancelledMessage(
  customerName: string,
  vehicleNo: string,
  scheduledAt: string,
  reason: string,
  settings: WorkshopSettings,
): string {
  return `Hello ${customerName}, your appointment with ${settings.companyName} for ${vehicleNo} on ${formatAppointment(scheduledAt)} has been cancelled.${reason ? ` Reason: ${reason}.` : ""} Please contact us to book another slot.`;
}

function formatAppointment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
