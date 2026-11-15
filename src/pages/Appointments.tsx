import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  MessageCircle,
  Phone,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { localDateKey } from "../lib/payroll";
import {
  appointmentCancelledMessage,
  appointmentConfirmedMessage,
  appointmentRescheduledMessage,
} from "../lib/messages";
import { autoWhatsAppEnabled, sendWhatsApp } from "../lib/whatsapp";
import { normalizePhone, waLink } from "../lib/utils";
import {
  Alert,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  StatCard,
  StatusBadge,
} from "../components/ui";
import { useToast } from "../components/Toast";
import type { Appointment } from "../types";

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function bookingWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tomorrowKey(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localDateKey(date);
}

function whatsAppLink(phone: string, message: string): string {
  return waLink(phone, message);
}

export function AppointmentsPage() {
  const {
    state,
    createStaffAppointment,
    confirmAppointment,
    rescheduleAppointment,
    cancelAppointment,
    fulfilAppointment,
    markAppointmentNoShow,
  } = useApp();
  const { push } = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [linkError, setLinkError] = useState("");
  const [copied, setCopied] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({
    customerName: "",
    phone: "",
    vehicleNo: "",
    vehicleModel: "",
    repairType: "Full service",
    scheduledAt: "",
    notes: "",
  });
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [filter, setFilter] = useState<"upcoming" | "today" | "all">("upcoming");
  const [reviewOpen, setReviewOpen] = useState(() => {
    const hour = new Date().getHours();
    return hour >= 16 && state.appointments.some(
      (entry) => entry.status === "Pending" && localDateKey(entry.scheduledAt) === tomorrowKey(),
    );
  });

  const bookingUrl = `${window.location.origin}/book?token=${encodeURIComponent(
    state.settings.bookingToken ?? "",
  )}`;
  const tomorrow = tomorrowKey();
  const today = localDateKey();

  const sorted = useMemo(
    () =>
      state.appointments
        .slice()
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [state.appointments],
  );
  const upcoming = sorted.filter(
    (entry) =>
      ["Pending", "Confirmed", "Rescheduled"].includes(entry.status) &&
      localDateKey(entry.scheduledAt) >= today,
  );
  const todayList = sorted.filter(
    (entry) => localDateKey(entry.scheduledAt) === today,
  );
  const tomorrowPending = sorted.filter(
    (entry) => entry.status === "Pending" && localDateKey(entry.scheduledAt) === tomorrow,
  );
  const visible = filter === "today" ? todayList : filter === "all" ? sorted : upcoming;
  const pendingCount = upcoming.filter((entry) => entry.status === "Pending").length;

  function copyLink() {
    void navigator.clipboard?.writeText(bookingUrl);
    setCopied(true);
    push("Reservation link copied.");
    window.setTimeout(() => setCopied(false), 1800);
  }

  function sendLink() {
    const normalized = normalizePhone(phone);
    if (!/^947\d{8}$/.test(normalized)) {
      setLinkError("Enter a valid Sri Lankan WhatsApp number, e.g. 77 123 4567.");
      return;
    }
    const message = `Hello from ${state.settings.companyName}. Please use this secure link to reserve a service appointment: ${bookingUrl}`;
    window.open(whatsAppLink(`+${normalized}`, message), "_blank", "noopener,noreferrer");
    setLinkOpen(false);
    setPhone("");
    setLinkError("");
    push("Reservation link prepared in WhatsApp.");
  }

  function openManual() {
    const base = new Date();
    base.setDate(base.getDate() + 1);
    base.setHours(9, 0, 0, 0);
    setManual({
      customerName: "",
      phone: "",
      vehicleNo: "",
      vehicleModel: "",
      repairType: "Full service",
      scheduledAt: toLocalInput(base.toISOString()),
      notes: "",
    });
    setManualOpen(true);
  }

  function saveManual() {
    const result = createStaffAppointment({
      ...manual,
      scheduledAt: manual.scheduledAt ? new Date(manual.scheduledAt).toISOString() : "",
    });
    if (!result.ok) {
      push(result.message ?? "Could not save the appointment.", "error");
      return;
    }
    push(`Appointment ${result.reference} added.`);
    setManualOpen(false);
  }

  function sendConfirmation(entry: Appointment, alreadyQueued = false) {
    const message = appointmentConfirmedMessage(
      entry.customerName,
      entry.vehicleNo,
      entry.scheduledAt,
      state.settings,
    );
    if (autoWhatsAppEnabled(state.settings)) {
      if (!alreadyQueued) {
        void sendWhatsApp(entry.phone, message, state.settings);
        push("Confirmation note queued on the workshop WhatsApp.");
      }
      return;
    }
    window.open(whatsAppLink(entry.phone, message), "_blank", "noopener,noreferrer");
  }

  function sendReschedule(entry: Appointment) {
    if (autoWhatsAppEnabled(state.settings)) return;
    window.open(
      whatsAppLink(
        entry.phone,
        appointmentRescheduledMessage(
          entry.customerName,
          entry.vehicleNo,
          entry.scheduledAt,
          state.settings,
        ),
      ),
      "_blank",
      "noopener,noreferrer",
    );
  }

  function sendCancellation(entry: Appointment, alreadyQueued = false) {
    const message = appointmentCancelledMessage(
      entry.customerName,
      entry.vehicleNo,
      entry.scheduledAt,
      entry.cancelReason ?? "",
      state.settings,
    );
    if (autoWhatsAppEnabled(state.settings)) {
      if (!alreadyQueued) {
        void sendWhatsApp(entry.phone, message, state.settings);
        push("Cancellation note queued on the workshop WhatsApp.");
      }
      return;
    }
    window.open(whatsAppLink(entry.phone, message), "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <PageHeader
        title="Service reservations"
        subtitle="Send a secure booking link, confirm appointments and check arriving vehicles in."
        actions={
          <>
            <button className="btn btn-secondary" onClick={openManual}>
              <CalendarPlus />
              Add by staff
            </button>
            <button className="btn btn-primary" onClick={() => setLinkOpen(true)}>
              <Send />
              Send booking link
            </button>
          </>
        }
      />

      <div className="grid cols-4">
        <StatCard
          label="Upcoming"
          value={upcoming.length}
          meta="Pending and confirmed appointments"
          icon={<CalendarClock />}
        />
        <StatCard
          label="Awaiting confirmation"
          value={pendingCount}
          meta="Supervisor call-back needed"
          icon={<Phone />}
          tone={pendingCount ? "amber" : "brand"}
        />
        <StatCard
          label="Today"
          value={todayList.length}
          meta={`${todayList.filter((entry) => entry.status === "Fulfilled").length} already arrived`}
          icon={<ClipboardCheck />}
          tone="blue"
        />
        <StatCard
          label="Tomorrow"
          value={sorted.filter((entry) => localDateKey(entry.scheduledAt) === tomorrow).length}
          meta="Supervisor review at 4:30 p.m."
          icon={<CalendarPlus />}
          tone="purple"
        />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div>
            <h3>Reservation link</h3>
            <p>
              Anyone can send this link. The customer chooses the vehicle, repair type, date
              and time, and the request appears here as pending.
            </p>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={copyLink}>
              <Copy size={13} />
              {copied ? "Copied" : "Copy link"}
            </button>
            <button className="btn btn-soft btn-sm" onClick={() => setLinkOpen(true)}>
              <MessageCircle size={13} />
              WhatsApp to customer
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="row-between wrap" style={{ gap: 12 }}>
            <code
              className="tiny"
              style={{
                display: "block",
                padding: "10px 12px",
                borderRadius: 8,
                background: "#f8fafc",
                border: "1px solid var(--line)",
                wordBreak: "break-all",
                flex: 1,
                minWidth: 240,
              }}
            >
              {bookingUrl}
            </code>
            <span className="badge badge-green">{state.settings.companyName}</span>
          </div>
          {tomorrowPending.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Alert tone="warn" title={`${tomorrowPending.length} appointment${tomorrowPending.length === 1 ? "" : "s"} need a confirmation call`}>
                Review tomorrow's list before 5:00 p.m. and confirm each customer on
                WhatsApp.{" "}
                <button className="btn btn-ghost btn-sm" onClick={() => setReviewOpen(true)}>
                  Review tomorrow
                </button>
              </Alert>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div>
            <h3>Appointment list</h3>
            <p>Confirm pending requests, reschedule or cancel with a WhatsApp note.</p>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {(["upcoming", "today", "all"] as const).map((option) => (
              <button
                key={option}
                className={`btn btn-sm ${filter === option ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFilter(option)}
              >
                {option === "upcoming" ? "Upcoming" : option === "today" ? "Today" : "All"}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Appointment</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Repair</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <div className="cell-main">{bookingWhen(entry.scheduledAt)}</div>
                    <div className="cell-sub">{entry.reference} · {entry.source}</div>
                  </td>
                  <td>
                    <div className="cell-main">{entry.customerName}</div>
                    <div className="cell-sub">{entry.phone}</div>
                  </td>
                  <td>
                    <div className="cell-main">{entry.vehicleNo}</div>
                    <div className="cell-sub">{entry.vehicleModel}</div>
                  </td>
                  <td className="tiny">{entry.repairType}</td>
                  <td>
                    <StatusBadge status={entry.status} />
                    {entry.employeeNote && (
                      <div className="cell-sub" style={{ maxWidth: 170 }}>
                        {entry.employeeNote}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="row wrap" style={{ gap: 5 }}>
                      {entry.status === "Pending" && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            const result = confirmAppointment(entry.id);
                            if (result.ok) {
                              push(`${entry.reference} confirmed.`);
                              sendConfirmation(entry, true);
                            }
                          }}
                        >
                          <CheckCircle2 size={12} />
                          Confirm
                        </button>
                      )}
                      {["Pending", "Confirmed", "Rescheduled"].includes(entry.status) && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditing(entry);
                              setRescheduleAt(toLocalInput(entry.scheduledAt));
                            }}
                          >
                            <RotateCcw size={12} />
                            Reschedule
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setCancelTarget(entry);
                              setCancelReason("");
                            }}
                          >
                            <XCircle size={12} />
                            Cancel
                          </button>
                          <button
                            className="btn btn-soft btn-sm"
                            onClick={() => {
                              const result = fulfilAppointment(entry.id, true);
                              if (result.ok) {
                                push(
                                  `${entry.vehicleNo} checked in. Collect the inspection at the gate.`,
                                );
                              }
                            }}
                          >
                            <ClipboardCheck size={12} />
                            Arrived
                          </button>
                          {localDateKey(entry.scheduledAt) < today && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                markAppointmentNoShow(entry.id);
                                push(`${entry.reference} marked as no-show.`);
                              }}
                            >
                              No show
                            </button>
                          )}
                        </>
                      )}
                      {entry.status === "Confirmed" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => sendConfirmation(entry)}
                        >
                          <MessageCircle size={12} />
                          Note
                        </button>
                      )}
                      {entry.status === "Cancelled" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => sendCancellation(entry)}
                        >
                          <MessageCircle size={12} />
                          Cancellation note
                        </button>
                      )}
                      {entry.status === "Fulfilled" && entry.checkInId && (
                        <span className="tiny muted">Gate {entry.checkInId}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="No appointments here"
                      message="Send a booking link or add an appointment from the phone."
                      icon={<CalendarClock size={22} />}
                      action={
                        <button className="btn btn-primary btn-sm" onClick={() => setLinkOpen(true)}>
                          <Send size={13} />
                          Send booking link
                        </button>
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={linkOpen}
        onClose={() => {
          setLinkOpen(false);
          setLinkError("");
        }}
        title="Send reservation link"
        subtitle="The customer receives the workshop booking form on WhatsApp."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setLinkOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={sendLink}>
              <Send size={13} />
              Open WhatsApp
            </button>
          </>
        }
      >
        <div className="stack">
          {linkError && <Alert tone="danger">{linkError}</Alert>}
          <Field label="Customer WhatsApp number" required>
            <input
              className="input"
              inputMode="tel"
              value={phone}
              placeholder="77 123 4567"
              onChange={(event) => {
                setPhone(event.target.value);
                setLinkError("");
              }}
            />
          </Field>
          <div className="tiny muted" style={{ wordBreak: "break-all" }}>
            {bookingUrl}
          </div>
        </div>
      </Modal>

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Add appointment by staff"
        subtitle="Use this when the customer books over the phone."
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setManualOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveManual}>
              <CalendarPlus size={13} />
              Save appointment
            </button>
          </>
        }
      >
        <div className="grid cols-2" style={{ gap: 10 }}>
          <Field label="Customer name" required>
            <input
              className="input"
              value={manual.customerName}
              onChange={(event) =>
                setManual((prev) => ({ ...prev, customerName: event.target.value }))
              }
            />
          </Field>
          <Field label="WhatsApp number" required>
            <input
              className="input"
              value={manual.phone}
              onChange={(event) =>
                setManual((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </Field>
          <Field label="Vehicle number" required>
            <input
              className="input"
              value={manual.vehicleNo}
              onChange={(event) =>
                setManual((prev) => ({ ...prev, vehicleNo: event.target.value }))
              }
            />
          </Field>
          <Field label="Vehicle model" required>
            <input
              className="input"
              placeholder="Honda Vezel 2016"
              value={manual.vehicleModel}
              onChange={(event) =>
                setManual((prev) => ({ ...prev, vehicleModel: event.target.value }))
              }
            />
          </Field>
          <Field label="Repair type">
            <input
              className="input"
              value={manual.repairType}
              onChange={(event) =>
                setManual((prev) => ({ ...prev, repairType: event.target.value }))
              }
            />
          </Field>
          <Field label="Date and time" required>
            <input
              className="input"
              type="datetime-local"
              value={manual.scheduledAt}
              onChange={(event) =>
                setManual((prev) => ({ ...prev, scheduledAt: event.target.value }))
              }
            />
          </Field>
          <Field label="Notes" full>
            <input
              className="input"
              value={manual.notes}
              onChange={(event) =>
                setManual((prev) => ({ ...prev, notes: event.target.value }))
              }
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Reschedule appointment"
        subtitle={editing ? `${editing.vehicleNo} · ${editing.customerName}` : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!editing) return;
                const result = rescheduleAppointment(
                  editing.id,
                  new Date(rescheduleAt).toISOString(),
                );
                if (!result.ok) {
                  push(result.message ?? "Could not reschedule.", "error");
                  return;
                }
                const updated = { ...editing, scheduledAt: new Date(rescheduleAt).toISOString() };
                sendReschedule(updated);
                push(`${editing.reference} rescheduled.`);
                setEditing(null);
              }}
            >
              <RotateCcw size={13} />
              Save and send note
            </button>
          </>
        }
      >
        <Field label="New date and time" required>
          <input
            className="input"
            type="datetime-local"
            value={rescheduleAt}
            onChange={(event) => setRescheduleAt(event.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel appointment"
        subtitle={cancelTarget ? `${cancelTarget.vehicleNo} · ${cancelTarget.customerName}` : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCancelTarget(null)}>
              Keep appointment
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!cancelTarget) return;
                const result = cancelAppointment(cancelTarget.id, cancelReason);
                if (!result.ok) {
                  push(result.message ?? "Could not cancel.", "error");
                  return;
                }
                sendCancellation({ ...cancelTarget, cancelReason }, true);
                push(`${cancelTarget.reference} cancelled.`);
                setCancelTarget(null);
              }}
            >
              <XCircle size={13} />
              Cancel and send note
            </button>
          </>
        }
      >
        <Field label="Reason for the customer" required>
          <input
            className="input"
            value={cancelReason}
            placeholder="Workshop fully booked, please choose another day"
            onChange={(event) => setCancelReason(event.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Tomorrow's appointment review"
        subtitle="Supervisor call-back list for the 4:30 p.m. confirmation round."
        size="wide"
      >
        {tomorrowPending.length === 0 ? (
          <Alert tone="success" title="All confirmed">
            Every appointment for tomorrow has already been confirmed.
          </Alert>
        ) : (
          <div className="stack">
            <Alert tone="warn" title={`${tomorrowPending.length} pending confirmation`}>
              Call each customer, confirm the time, then press confirm to send the WhatsApp
              note.
            </Alert>
            {tomorrowPending.map((entry) => (
              <div key={entry.id} className="card">
                <div className="card-body row-between wrap" style={{ gap: 10 }}>
                  <div>
                    <div className="cell-main">
                      {entry.vehicleNo} · {entry.vehicleModel}
                    </div>
                    <div className="cell-sub">
                      {entry.customerName} · {entry.phone} · {bookingWhen(entry.scheduledAt)} ·{" "}
                      {entry.repairType}
                    </div>
                    {entry.notes && <div className="tiny muted">{entry.notes}</div>}
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <a
                      className="btn btn-secondary btn-sm"
                      href={`tel:${entry.phone.replace(/\s+/g, "")}`}
                    >
                      <Phone size={12} />
                      Call
                    </a>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const result = confirmAppointment(entry.id);
                        if (result.ok) {
                          push(`${entry.reference} confirmed.`);
                          sendConfirmation(entry);
                        }
                      }}
                    >
                      <CheckCircle2 size={12} />
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="tiny muted">
              Confirm each visit before 5:00 p.m. so the workshop floor can plan the bay.
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}