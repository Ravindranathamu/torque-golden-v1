import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  CalendarClock,
  CarFront,
  CheckCircle2,
  Phone,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { normalizePhone } from "../lib/utils";
import { Alert, Field } from "../components/ui";
import { DeveloperCredit } from "../components/DeveloperCredit";

const repairTypes = [
  "Full service",
  "Lubricant service",
  "Brake repair",
  "AC repair",
  "Electrical repair",
  "Body / paint",
  "Insurance repair",
  "Diagnosis",
  "Other",
];

function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function defaultSlot(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toLocalInput(date);
}

export function PublicBookingPage() {
  const { state, submitAppointmentBooking } = useApp();
  const { token: pathToken } = useParams();
  const [search] = useSearchParams();
  const token = useMemo(
    () => (pathToken ?? search.get("token") ?? "").trim(),
    [pathToken, search],
  );
  const settings = state.settings;
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    vehicleNo: "",
    vehicleModel: "",
    repairType: repairTypes[0],
    scheduledAt: defaultSlot(),
    notes: "",
  });
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<{
    reference: string;
    scheduledAt: string;
    vehicleNo: string;
  } | null>(null);

  const validToken =
    Boolean(token) && Boolean(settings.bookingToken) && token === settings.bookingToken;

  if (!settings.configured) {
    return (
      <div className="public-shell">
        <div className="public-card">
          <div className="public-head">
            <div className="brand-mark">R</div>
            <div>
              <h1>Booking is not open yet</h1>
              <p>This workshop has not finished setup.</p>
            </div>
          </div>
          <div className="public-body">
            <Link className="btn btn-secondary" to="/setup">
              Open setup
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!validToken) {
    return (
      <div className="public-shell">
        <div className="public-card">
          <div className="public-head">
            <div className="brand-mark">?</div>
            <div>
              <h1>Booking link not recognised</h1>
              <p>This link may have expired or belongs to another workshop.</p>
            </div>
          </div>
          <div className="public-body">
            <Alert tone="warn" title="Ask for a fresh link">
              Contact {settings.companyName} on {settings.phone || "the workshop number"} and
              we will send a new reservation link.
            </Alert>
            <a
              className="btn btn-secondary"
              style={{ marginTop: 18 }}
              href={`tel:${settings.phone.replace(/\s+/g, "")}`}
            >
              <Phone size={14} />
              Call the workshop
            </a>
          </div>
        </div>
      </div>
    );
  }

  function submit() {
    setError("");
    if (!form.customerName.trim()) return setError("Enter your name.");
    const phone = normalizePhone(form.phone);
    if (!/^947\d{8}$/.test(phone)) {
      return setError("Enter a valid Sri Lankan mobile number, e.g. 77 123 4567.");
    }
    if (!form.vehicleNo.trim()) return setError("Enter the vehicle number.");
    if (!form.vehicleModel.trim()) return setError("Enter the vehicle make and model.");
    if (!form.scheduledAt) return setError("Choose the date and time.");
    const result = submitAppointmentBooking({
      token,
      customerName: form.customerName,
      phone,
      vehicleNo: form.vehicleNo,
      vehicleModel: form.vehicleModel,
      repairType: form.repairType,
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      notes: form.notes,
    });
    if (!result.ok) {
      setError(result.message ?? "Could not send the booking request.");
      return;
    }
    setSubmitted({
      reference: result.reference ?? "APT",
      scheduledAt: new Date(form.scheduledAt).toLocaleString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      vehicleNo: form.vehicleNo.trim().toUpperCase(),
    });
  }

  return (
    <div className="public-shell">
      <div className="public-card">
        <div className="public-head">
          <div className="brand-mark" style={{ overflow: "hidden" }}>
            {settings.logo ? (
              <img
                src={settings.logo}
                alt={settings.companyName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              settings.companyName.slice(0, 2).toUpperCase()
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h1>{settings.companyName}</h1>
            <p>{settings.address || "Service reservations"}</p>
          </div>
          <span
            className="badge"
            style={{ background: "rgba(255,255,255,.12)", color: "#e6f4f1" }}
          >
            <CalendarClock size={11} /> Reservation
          </span>
        </div>

        <div className="public-body">
          {submitted ? (
            <div className="success-panel">
              <div className="success-icon">
                <CheckCircle2 size={34} />
              </div>
              <h2>Reservation received</h2>
              <p>
                Thank you, {form.customerName.split(" ")[0]}. We received your request for{" "}
                <strong>{submitted.vehicleNo}</strong>. The workshop will call or WhatsApp you
                to confirm the time.
              </p>

              <div className="card" style={{ marginTop: 20, textAlign: "left" }}>
                <div className="card-head">
                  <div>
                    <h3>Your request</h3>
                    <p>Keep this reference for your visit.</p>
                  </div>
                  <span className="badge badge-amber">{submitted.reference}</span>
                </div>
                <div className="card-body">
                  <div className="kv">
                    <span>Requested time</span>
                    <span>{submitted.scheduledAt}</span>
                  </div>
                  <div className="kv">
                    <span>Vehicle</span>
                    <span>{submitted.vehicleNo} · {form.vehicleModel}</span>
                  </div>
                  <div className="kv">
                    <span>Repair</span>
                    <span>{form.repairType}</span>
                  </div>
                  <div className="kv">
                    <span>Status</span>
                    <span>Pending workshop confirmation</span>
                  </div>
                </div>
              </div>

              <div className="stack" style={{ marginTop: 18, textAlign: "left" }}>
                <div className="alert alert-info">
                  <Sparkles />
                  <div>
                    <strong>What happens next</strong>
                    A supervisor reviews tomorrow's list at 4:30 p.m., calls you to confirm
                    and sends a WhatsApp confirmation note. If you need to change or cancel,
                    reply to that message.
                  </div>
                </div>
                <div className="row wrap">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setSubmitted(null);
                      setForm((prev) => ({
                        ...prev,
                        customerName: "",
                        phone: "",
                        vehicleNo: "",
                        vehicleModel: "",
                        notes: "",
                        scheduledAt: defaultSlot(),
                      }));
                    }}
                  >
                    Book another vehicle
                  </button>
                  <a
                    className="btn btn-ghost"
                    href={`https://wa.me/${normalizePhone(settings.phone)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Phone />
                    Contact workshop
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="row-between wrap" style={{ marginBottom: 18 }}>
                <div>
                  <span className="badge badge-brand">
                    <CarFront size={11} /> Service booking
                  </span>
                  <h2 style={{ fontSize: 20, letterSpacing: "-0.03em", marginTop: 10 }}>
                    Reserve your workshop slot
                  </h2>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    Send the request now. A supervisor will confirm by WhatsApp.
                  </p>
                </div>
                <div className="chip brand">
                  <ShieldCheck size={12} /> No payment now
                </div>
              </div>

              {error && <Alert tone="danger">{error}</Alert>}

              <div className="form-grid" style={{ marginTop: 16 }}>
                <Field label="Your name" required>
                  <input
                    className="input"
                    value={form.customerName}
                    onChange={(event) => {
                      setForm((prev) => ({ ...prev, customerName: event.target.value }));
                      setError("");
                    }}
                  />
                </Field>
                <Field label="WhatsApp number" required hint="We send the confirmation here.">
                  <input
                    className="input"
                    inputMode="tel"
                    placeholder="77 123 4567"
                    value={form.phone}
                    onChange={(event) => {
                      setForm((prev) => ({ ...prev, phone: event.target.value }));
                      setError("");
                    }}
                  />
                </Field>
                <Field label="Vehicle number" required>
                  <input
                    className="input"
                    placeholder="CAR-8842"
                    value={form.vehicleNo}
                    onChange={(event) => {
                      setForm((prev) => ({ ...prev, vehicleNo: event.target.value }));
                      setError("");
                    }}
                  />
                </Field>
                <Field label="Vehicle make and model" required>
                  <input
                    className="input"
                    placeholder="Honda Vezel 2016"
                    value={form.vehicleModel}
                    onChange={(event) => {
                      setForm((prev) => ({ ...prev, vehicleModel: event.target.value }));
                      setError("");
                    }}
                  />
                </Field>
                <Field label="Repair type" required>
                  <select
                    className="select"
                    value={form.repairType}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, repairType: event.target.value }))
                    }
                  >
                    {repairTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Preferred date and time" required>
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.scheduledAt}
                    min={toLocalInput(new Date())}
                    onChange={(event) => {
                      setForm((prev) => ({ ...prev, scheduledAt: event.target.value }));
                      setError("");
                    }}
                  />
                </Field>
                <Field label="Anything we should know?" full>
                  <input
                    className="input"
                    placeholder="Noise when braking, AC not cold, etc."
                    value={form.notes}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                  />
                </Field>
              </div>

              <button
                className="btn btn-primary"
                style={{ marginTop: 18, width: "100%" }}
                onClick={submit}
              >
                <Wrench />
                Send reservation request
              </button>
              <p className="tiny muted" style={{ marginTop: 10, textAlign: "center" }}>
                This is a request, not a confirmed booking. The workshop will contact you.
              </p>
            </>
          )}
        </div>
      </div>
      <DeveloperCredit />
    </div>
  );
}