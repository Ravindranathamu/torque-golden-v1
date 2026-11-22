import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  CarFront,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { normalizePhone } from "../lib/utils";
import { cloudConfigured, supabase } from "../lib/supabase";
import { Alert, Field } from "../components/ui";
import { DeveloperCredit } from "../components/DeveloperCredit";

interface PublicWorkshop {
  slug?: string;
  company_name?: string;
  logo_url?: string | null;
  brand_color?: string | null;
  accent_color?: string | null;
  phone?: string | null;
}

interface FormState {
  vehicleNo: string;
  make: string;
  model: string;
  customerName: string;
  phone: string;
  mileage: string;
  email: string;
  address: string;
}

const emptyForm: FormState = {
  vehicleNo: "",
  make: "",
  model: "",
  customerName: "",
  phone: "",
  mileage: "",
  email: "",
  address: "",
};

const makes = [
  "Honda",
  "Toyota",
  "Suzuki",
  "Nissan",
  "Mitsubishi",
  "Mazda",
  "Hyundai",
  "Kia",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Volkswagen",
  "Other",
];

export function PublicCheckInPage() {
  const { state, lookupVehicle, submitCheckIn } = useApp();
  const { slug } = useParams();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [remoteWorkshop, setRemoteWorkshop] = useState<PublicWorkshop | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteChecked, setRemoteChecked] = useState(false);
  const [returning, setReturning] = useState<{
    make: string;
    model: string;
    customerName: string;
    phone: string;
    mileage: number;
    email?: string;
    address?: string;
  } | null>(null);
  const [submitted, setSubmitted] = useState<{
    reference: string;
    vehicleNo: string;
    customerName: string;
    make: string;
    model: string;
  } | null>(null);

  const settings = state.settings;
  const cloudMode = cloudConfigured && Boolean(supabase);
  const requestedSlug = (slug ?? "").trim();
  const workshopSlug = cloudMode ? requestedSlug : requestedSlug || settings.qrSlug;

  useEffect(() => {
    if (!cloudMode || !supabase) return;
    if (!requestedSlug) {
      setRemoteChecked(true);
      return;
    }
    let active = true;
    setRemoteLoading(true);
    void supabase
      .rpc("public_workshop", { p_slug: requestedSlug })
      .then(({ data, error: rpcError }) => {
        if (!active) return;
        if (!rpcError && data) {
          setRemoteWorkshop(data as PublicWorkshop);
        } else {
          setRemoteWorkshop(null);
        }
        setRemoteLoading(false);
        setRemoteChecked(true);
      });
    return () => {
      active = false;
    };
  }, [cloudMode, requestedSlug]);

  const workshopName =
    remoteWorkshop?.company_name?.trim() ||
    settings.companyName?.trim() ||
    "Workshop check-in";
  const workshopLogo = remoteWorkshop?.logo_url || settings.logo;
  const workshopPhone = remoteWorkshop?.phone || settings.phone;
  const validSlug = cloudMode
    ? Boolean(remoteWorkshop)
    : !requestedSlug || !settings.qrSlug || requestedSlug === settings.qrSlug;
  const missesLocalSetup = !cloudMode && !settings.configured;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  }

  async function findVehicle() {
    if (!form.vehicleNo.trim()) return;
    if (cloudMode && supabase && workshopSlug) {
      const { data, error: rpcError } = await supabase.rpc("lookup_vehicle_for_checkin", {
        p_slug: workshopSlug,
        p_vehicle_no: form.vehicleNo,
      });
      if (rpcError || !data) {
        setReturning(null);
        return;
      }
      const found = data as {
        make?: string;
        model?: string;
        customer_name?: string;
        phone?: string;
        mileage?: number;
      };
      setReturning({
        make: found.make ?? "",
        model: found.model ?? "",
        customerName: found.customer_name ?? "",
        phone: found.phone?.replace(/^\+94\s?/, "") ?? "",
        mileage: Number(found.mileage) || 0,
      });
      setForm((prev) => ({
        ...prev,
        make: found.make || prev.make,
        model: found.model || prev.model,
        customerName: found.customer_name || prev.customerName,
        phone: found.phone?.replace(/^\+94\s?/, "") || prev.phone,
        mileage: String(found.mileage || prev.mileage),
      }));
      return;
    }
    const found = lookupVehicle(form.vehicleNo);
    if (found) {
      setReturning(found);
      setForm((prev) => ({
        ...prev,
        make: found.make || prev.make,
        model: found.model || prev.model,
        customerName: found.customerName || prev.customerName,
        phone: found.phone?.replace(/^\+94\s?/, "") || prev.phone,
        mileage: String(found.mileage || prev.mileage),
        email: found.email ?? prev.email,
        address: found.address ?? prev.address,
      }));
    } else {
      setReturning(null);
    }
  }

  async function submit() {
    if (!form.vehicleNo.trim()) return setError("Vehicle number is required.");
    if (!form.make.trim()) return setError("Vehicle make is required.");
    if (!form.model.trim()) return setError("Vehicle model is required.");
    if (!form.customerName.trim()) return setError("Customer name is required.");
    const phone = normalizePhone(form.phone);
    if (!/^947\d{8}$/.test(phone)) {
      return setError("Enter a valid Sri Lankan mobile number, e.g. 77 123 4567.");
    }
    const mileage = Number(form.mileage);
    if (!Number.isFinite(mileage) || mileage <= 0) {
      return setError("Enter the current mileage in kilometres.");
    }
    if (cloudMode && supabase && workshopSlug) {
      setSubmitting(true);
      const { data, error: rpcError } = await supabase.rpc("public_check_in", {
        p_slug: workshopSlug,
        p_payload: {
          vehicle_no: form.vehicleNo,
          make: form.make.trim(),
          model: form.model.trim(),
          customer_name: form.customerName.trim(),
          phone: form.phone,
          mileage,
          email: form.email,
          address: form.address,
        },
      });
      setSubmitting(false);
      if (rpcError) {
        setError(rpcError.message || "Could not submit your check-in.");
        return;
      }
      const row = (data ?? {}) as { id?: string };
      setSubmitted({
        reference: (row.id ?? "CHECKIN").slice(0, 8).toUpperCase(),
        vehicleNo: form.vehicleNo.trim().toUpperCase(),
        customerName: form.customerName.trim(),
        make: form.make.trim(),
        model: form.model.trim(),
      });
      return;
    }
    const result = submitCheckIn({
      vehicleNo: form.vehicleNo,
      make: form.make.trim(),
      model: form.model.trim(),
      customerName: form.customerName,
      phone: form.phone,
      mileage,
      email: form.email,
      address: form.address,
    });
    if (!result.ok) {
      setError(result.message ?? "Could not submit your check-in.");
      return;
    }
    setSubmitted({
      reference: result.reference ?? "",
      vehicleNo: form.vehicleNo.trim().toUpperCase(),
      customerName: form.customerName.trim(),
      make: form.make.trim(),
      model: form.model.trim(),
    });
  }

  if (cloudMode && !remoteChecked) {
    return (
      <div className="public-shell">
        <div className="public-card">
          <div className="public-body" style={{ padding: 40, textAlign: "center" }}>
            <div className="brand-mark" style={{ margin: "0 auto 14px" }}>
              <QrCode size={22} />
            </div>
            <h1>Loading check-in</h1>
            <p className="muted">Connecting to the workshop…</p>
          </div>
        </div>
      </div>
    );
  }

  if (missesLocalSetup) {
    return (
      <div className="public-shell">
        <div className="public-card">
          <div className="public-head">
            <div className="brand-mark">
              <QrCode size={22} />
            </div>
            <div>
              <h1>Workshop check-in</h1>
              <p>This customer portal is not configured yet.</p>
            </div>
          </div>
          <div className="public-body">
            <Alert tone="warn" title="No active workshop">
              Load the demo workshop or complete setup to activate the QR check-in form.
            </Alert>
            <div className="row" style={{ marginTop: 18 }}>
              <Link className="btn btn-primary" to="/setup">
                Open setup
                <ArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!validSlug || (cloudMode && remoteLoading)) {
    return (
      <div className="public-shell">
        <div className="public-card">
          <div className="public-head">
            <div className="brand-mark">?</div>
            <div>
              <h1>QR link not recognised</h1>
              <p>This code does not belong to an active workshop.</p>
            </div>
          </div>
          <div className="public-body">
            <Alert tone="warn" title="Wrong workshop link">
              Ask the workshop for a fresh QR code, or scan the code displayed at the service
              gate.
            </Alert>
            {!cloudMode && settings.qrSlug && (
              <Link
                className="btn btn-secondary"
                style={{ marginTop: 18 }}
                to={`/check-in/${settings.qrSlug}`}
              >
                Open {workshopName}
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="public-shell">
      <div className="public-card">
        <div className="public-head">
          <div className="brand-mark" style={{ overflow: "hidden" }}>
            {workshopLogo ? (
              <img
                src={workshopLogo}
                alt={workshopName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              workshopName.slice(0, 2).toUpperCase()
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h1>{workshopName}</h1>
            <p>{settings.address || "Vehicle service check-in"}</p>
          </div>
          <span
            className="badge"
            style={{ background: "rgba(255,255,255,.12)", color: "#e6f4f1" }}
          >
            <QrCode size={11} /> QR check-in
          </span>
        </div>

        <div className="public-body">
          {submitted ? (
            <div className="success-panel">
              <div className="success-icon">
                <CheckCircle2 size={34} />
              </div>
              <h2>You're checked in</h2>
              <p>
                Thank you, {submitted.customerName.split(" ")[0]}. A service advisor will
                inspect <strong>{submitted.vehicleNo}</strong> at the gate and confirm your job
                card.
              </p>

              <div className="card" style={{ marginTop: 20, textAlign: "left" }}>
                <div className="card-head">
                  <div>
                    <h3>Check-in reference</h3>
                    <p>Show this at the service gate if needed.</p>
                  </div>
                  <span className="badge badge-green">{submitted.reference}</span>
                </div>
                <div className="card-body">
                  <div className="kv">
                    <span>Vehicle</span>
                    <span>
                      {submitted.vehicleNo} · {submitted.make} {submitted.model}
                    </span>
                  </div>
                  <div className="kv">
                    <span>Customer</span>
                    <span>{submitted.customerName}</span>
                  </div>
                  <div className="kv">
                    <span>Next step</span>
                    <span>Gate inspection & safety photos</span>
                  </div>
                </div>
              </div>

              <div className="stack" style={{ marginTop: 18, textAlign: "left" }}>
                <div className="alert alert-info">
                  <ClipboardCheck />
                  <div>
                    <strong>What happens next</strong>
                    Our PRO team will record the repair type, note existing damage, upload
                    inspection photos and message you on WhatsApp with your job number.
                  </div>
                </div>
                <div className="row wrap">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setSubmitted(null);
                      setReturning(null);
                      setForm(emptyForm);
                    }}
                  >
                    Check in another vehicle
                  </button>
                  <a
                    className="btn btn-ghost"
                    href={`https://wa.me/${normalizePhone(workshopPhone)}`}
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
                    <CarFront size={11} /> Vehicle arrival
                  </span>
                  <h2
                    style={{
                      fontSize: 20,
                      letterSpacing: "-0.03em",
                      marginTop: 10,
                    }}
                  >
                    Check in your vehicle
                  </h2>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    Takes under a minute. Our gate team will handle the inspection.
                  </p>
                </div>
                <div className="chip brand">
                  <ShieldCheck size={12} /> Your data stays private
                </div>
              </div>

              {returning && (
                <Alert tone="success" title={`Welcome back, ${returning.customerName}`}>
                  We found your {returning.make} {returning.model} from a previous visit.
                  We've filled in your details and last recorded mileage. Please update the
                  current mileage below.
                </Alert>
              )}

              {error && (
                <div style={{ marginTop: 12 }}>
                  <Alert tone="danger">{error}</Alert>
                </div>
              )}

              <div className="form-grid" style={{ marginTop: 16 }}>
                <Field
                  label="Vehicle number"
                  required
                  full
                  hint="Use the number on the plate, e.g. WP CAV-8742."
                >
                  <div className="search-wrap">
                    <div className="input-group">
                      <span className="prefix">
                        <CarFront size={14} />
                      </span>
                      <input
                        className="input"
                        placeholder="WP CAV-8742"
                        value={form.vehicleNo}
                        onChange={(event) => {
                          set("vehicleNo", event.target.value.toUpperCase());
                          setReturning(null);
                        }}
                        onBlur={findVehicle}
                        autoComplete="off"
                        autoFocus
                        style={{ textTransform: "uppercase", fontWeight: 700 }}
                      />
                      <button
                        type="button"
                        className="suffix-btn"
                        onClick={findVehicle}
                        title="Find previous visit"
                      >
                        <Sparkles size={14} />
                      </button>
                    </div>
                  </div>
                </Field>

                <Field label="Make" required>
                  <input
                    className="input"
                    list="vehicle-makes"
                    placeholder="Honda"
                    value={form.make}
                    onChange={(event) => set("make", event.target.value)}
                  />
                  <datalist id="vehicle-makes">
                    {makes.map((make) => (
                      <option key={make} value={make} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Model" required>
                  <input
                    className="input"
                    placeholder="Vezel"
                    value={form.model}
                    onChange={(event) => set("model", event.target.value)}
                  />
                </Field>

                <Field label="Customer name" required>
                  <div className="input-group">
                    <span className="prefix">
                      <UserRound size={14} />
                    </span>
                    <input
                      className="input"
                      placeholder="A. Perera"
                      value={form.customerName}
                      onChange={(event) => set("customerName", event.target.value)}
                      autoComplete="name"
                    />
                  </div>
                </Field>
                <Field label="Mobile number" required hint="Sri Lankan mobile, WhatsApp preferred.">
                  <div className="input-group">
                    <span className="prefix">+94</span>
                    <input
                      className="input"
                      inputMode="tel"
                      placeholder="77 123 4567"
                      value={form.phone}
                      onChange={(event) => set("phone", event.target.value)}
                      autoComplete="tel"
                    />
                  </div>
                </Field>

                <Field label="Current mileage (km)" required>
                  <div className="input-group">
                    <span className="prefix">
                      <Gauge size={14} />
                    </span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      placeholder="48530"
                      value={form.mileage}
                      onChange={(event) => set("mileage", event.target.value)}
                    />
                  </div>
                </Field>
                <Field label="Email" hint="Optional, for digital invoices.">
                  <input
                    className="input"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(event) => set("email", event.target.value)}
                    autoComplete="email"
                  />
                </Field>

                <Field label="Address" full hint="Optional. Helps with service reminders.">
                  <input
                    className="input"
                    placeholder="22, Wattegama Road, Kandy"
                    value={form.address}
                    onChange={(event) => set("address", event.target.value)}
                    autoComplete="street-address"
                  />
                </Field>
              </div>

              <div style={{ marginTop: 18 }}>
                <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={submitting}>
                  <CheckCircle2 />
                  {submitting ? "Sending check-in…" : "Check in vehicle"}
                </button>
                <p className="tiny muted" style={{ textAlign: "center", marginTop: 10 }}>
                  By checking in you agree to the workshop inspecting the vehicle and contacting
                  you about this service.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="public-credit">
        <p className="tiny muted" style={{ textAlign: "center" }}>
          Powered by Torque ERP · {workshopName}
        </p>
        <DeveloperCredit compact />
      </div>
    </div>
  );
}
