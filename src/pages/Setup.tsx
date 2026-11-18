import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Cloud,
  Layers,
  Loader2,
  LogOut,
  Palette,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  ToggleRight,
  Trash2,
  Upload,
  Users,
  Wrench,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { extractBrandColors, readImage } from "../lib/branding";
import { FEATURE_FLAGS, MODULE_PRESETS } from "../lib/features";
import { Alert, Field } from "../components/ui";
import { DeveloperCredit } from "../components/DeveloperCredit";
import { useToast } from "../components/Toast";
import type { Department, FeatureFlags, StoresTopology } from "../types";

const departmentOptions: Department[] = ["PRO", "Supervisor", "Cashier", "Accounting", "Stores"];

function presetFlags(presetId: string): FeatureFlags {
  const preset = MODULE_PRESETS.find((entry) => entry.id === presetId);
  return FEATURE_FLAGS.reduce((flags, flag) => {
    flags[flag.key] = preset ? preset.flags.includes(flag.key) : flag.defaultEnabled;
    return flags;
  }, {} as FeatureFlags);
}

const steps = [
  {
    title: "Workshop profile",
    caption: "Name, contact details and Google review link.",
    icon: Building2,
  },
  {
    title: "Brand identity",
    caption: "Upload a logo and we extract the theme colours.",
    icon: Palette,
  },
  {
    title: "Modules & sections",
    caption: "Choose the modules and initial workshop sections.",
    icon: Layers,
  },
  {
    title: "Owner & security",
    caption: "Owner PIN and the master password for controls.",
    icon: ShieldCheck,
  },
  {
    title: "Staff & departments",
    caption: "Create logins and assign one or more departments.",
    icon: Users,
  },
];

export function SetupPage() {
  const {
    state,
    createWorkshop,
    loadDemo,
    cloudStatus,
    cloudMessage,
    cloudEmail,
    cloudSignOut,
    cloudRetry,
  } = useApp();
  const { push } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [readingLogo, setReadingLogo] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    address: "",
    phone: "",
    email: "",
    googleReviewUrl: "",
    logo: "",
    brandColor: "#0f766e",
    accentColor: "#f59e0b",
    ownerName: "",
    ownerPin: "",
    ownerPassword: "",
    confirmPassword: "",
    bankAccountName: "",
    bankName: "",
    bankBranch: "",
    bankAccountNumber: "",
    bankType: "Bank" as "Bank" | "Cash",
    openingBalance: "",
    ownerCapital: "",
    tinNumber: "",
    vatRegNumber: "",
    defaultVatRate: "18",
    placeOfSupply: "",
    printerMode: "Both" as "Standard_PC" | "Thermal_Only" | "Both",
    thermalPaperWidth: "80mm" as "58mm" | "80mm",
    standardPaperSize: "A4" as "A4" | "A5",
    whatsappCompanyNumber: "",
    whatsappGatewayUrl: "",
    whatsappSession: "default",
    whatsappApiKey: "",
    preset: "full-workshop",
    featureFlags: presetFlags("full-workshop"),
    storesTopology: "Central" as StoresTopology,
  });
  const [sectionDraft, setSectionDraft] = useState({ name: "", code: "" });
  const [sectionsDraft, setSectionsDraft] = useState<
    Array<{ name: string; code: string }>
  >([]);
  const [staffDraft, setStaffDraft] = useState({
    name: "",
    username: "",
    pin: "",
    phone: "",
    departments: [] as Department[],
  });
  const [staffList, setStaffList] = useState<
    Array<{ name: string; username: string; pin: string; phone: string; departments: Department[] }>
  >([]);

  if (state.settings.configured) return <Navigate to="/login" replace />;

  const slug = form.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  }

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for the logo.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Logo must be smaller than 3 MB.");
      return;
    }
    setReadingLogo(true);
    try {
      const [data, palette] = await Promise.all([
        readImage(file),
        extractBrandColors(file),
      ]);
      setForm((prev) => ({
        ...prev,
        logo: data,
        brandColor: palette.brandColor,
        accentColor: palette.accentColor,
      }));
      push("Logo added and brand colours extracted.");
    } catch {
      setError("We could not read that image. Try a PNG or JPG.");
    } finally {
      setReadingLogo(false);
    }
  }

  function toggleDraftDepartment(department: Department) {
    setStaffDraft((prev) => ({
      ...prev,
      departments: prev.departments.includes(department)
        ? prev.departments.filter((entry) => entry !== department)
        : [...prev.departments, department],
    }));
  }

  function addStaffMember() {
    if (!staffDraft.name.trim()) return setError("Enter the staff member's name.");
    if (!/^[a-z0-9._-]{3,}$/i.test(staffDraft.username.trim())) {
      return setError("Username must be at least 3 characters (letters, numbers, dot or dash).");
    }
    if (!/^\d{4,6}$/.test(staffDraft.pin)) return setError("Staff PIN must be 4 to 6 digits.");
    if (!staffDraft.phone.trim()) return setError("Enter the staff phone number.");
    if (staffDraft.departments.length === 0) return setError("Choose at least one department.");
    if (
      staffList.some(
        (person) => person.username.toLowerCase() === staffDraft.username.trim().toLowerCase(),
      )
    ) {
      return setError("That username is already used by another staff member.");
    }
    setStaffList((prev) => [
      ...prev,
      {
        name: staffDraft.name.trim(),
        username: staffDraft.username.trim().toLowerCase(),
        pin: staffDraft.pin,
        phone: staffDraft.phone.trim(),
        departments: staffDraft.departments,
      },
    ]);
    setStaffDraft({ name: "", username: "", pin: "", phone: "", departments: [] });
    setError("");
    push("Staff member added. You can add more, then finish setup.");
  }

  function toggleStaffDepartment(username: string, department: Department) {
    const person = staffList.find((entry) => entry.username === username);
    if (!person) return;
    if (person.departments.includes(department) && person.departments.length === 1) {
      setError("A staff member must keep at least one department.");
      return;
    }
    setStaffList((prev) =>
      prev.map((entry) =>
        entry.username === username
          ? {
              ...entry,
              departments: entry.departments.includes(department)
                ? entry.departments.filter((value) => value !== department)
                : [...entry.departments, department],
            }
          : entry,
      ),
    );
    setError("");
  }

  function next() {
    if (step === 0) {
      if (!form.companyName.trim()) return setError("Enter your workshop name.");
      if (!form.phone.trim()) return setError("Enter the workshop phone number.");
      if (
        form.ownerCapital.trim() !== "" &&
        (!Number.isFinite(Number(form.ownerCapital)) || Number(form.ownerCapital) < 0)
      ) {
        return setError("Owner's capital must be zero or more.");
      }
      const vatRate =
        form.defaultVatRate.trim() === "" ? 18 : Number(form.defaultVatRate);
      if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
        return setError("Default VAT rate must be between 0 and 100 percent.");
      }
    }
    if (step === 3) {
      if (!form.ownerName.trim()) return setError("Enter the owner's name.");
      if (!/^\d{4,6}$/.test(form.ownerPin)) return setError("Owner PIN must be 4 to 6 digits.");
      if (form.ownerPassword.length < 6)
        return setError("Master password must be at least 6 characters.");
      if (form.ownerPassword !== form.confirmPassword)
        return setError("The master password confirmation does not match.");
      setError("");
      setStep(4);
      return;
    }
    if (step === 4) {
      createWorkshop({
        companyName: form.companyName.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        ownerName: form.ownerName.trim(),
        ownerPin: form.ownerPin,
        ownerPassword: form.ownerPassword,
        ownerCapital:
          form.ownerCapital.trim() === "" ? 0 : Number(form.ownerCapital) || 0,
        googleReviewUrl: form.googleReviewUrl.trim(),
        logo: form.logo || undefined,
        brandColor: form.brandColor,
        accentColor: form.accentColor,
        tinNumber: form.tinNumber.trim(),
        vatRegNumber: form.vatRegNumber.trim(),
        defaultVatRate:
          form.defaultVatRate.trim() === "" ? 18 : Number(form.defaultVatRate) || 0,
        placeOfSupply: form.placeOfSupply.trim() || form.address.trim(),
        printerMode: form.printerMode,
        thermalPaperWidth: form.thermalPaperWidth,
        standardPaperSize: form.standardPaperSize,
        whatsappCompanyNumber: form.whatsappCompanyNumber.trim() || form.phone.trim(),
        whatsappGatewayUrl: form.whatsappGatewayUrl.trim() || undefined,
        whatsappSession: form.whatsappSession.trim() || "default",
        whatsappApiKey: form.whatsappApiKey.trim() || undefined,
        featureFlags: form.featureFlags,
        storesTopology: form.storesTopology,
        sections: sectionsDraft,
        bankAccount: form.bankName.trim()
          ? {
              name:
                form.bankAccountName.trim() ||
                `${form.bankName.trim()}${form.bankType === "Cash" ? " cash" : " account"}`,
              bankName: form.bankName.trim(),
              branch: form.bankBranch.trim(),
              accountNumber: form.bankAccountNumber.trim(),
              type: form.bankType,
              openingBalance: Number(form.openingBalance) || 0,
            }
          : undefined,
        staff: staffList,
      });
      push("Workshop created. Sign in with your owner PIN.");
      navigate("/login", { replace: true });
      return;
    }
    setError("");
    setStep((value) => Math.min(4, value + 1));
  }

  if (cloudStatus !== "disabled" && cloudStatus !== "ready") {
    return (
      <div className="auth-shell">
        <main className="auth-panel">
          <div className="auth-card">
            <span className="badge badge-brand">
              <Cloud size={11} /> Cloud workshop
            </span>
            <h1 style={{ marginTop: 12 }}>
              {cloudStatus === "unprovisioned"
                ? "RAVsoft provisioning required"
                : cloudStatus === "loading"
                  ? "Loading the workshop"
                  : "Cloud sign-in required"}
            </h1>
            <p className="sub">
              {cloudStatus === "unprovisioned"
                ? "This Supabase account is active, but it has no workshop profile yet. RAVsoft must create the workshop and owner profile before the app can start."
                : cloudStatus === "loading"
                  ? "Checking your Supabase session, workshop profile and licence."
                  : "This client build reads its workshop from Supabase. Sign in with the account RAVsoft issued."}
            </p>
            {cloudMessage && (
              <div style={{ marginTop: 14 }}>
                <Alert tone={cloudStatus === "unprovisioned" ? "warn" : "info"}>
                  {cloudMessage}
                </Alert>
              </div>
            )}
            {cloudEmail && (
              <div className="kv" style={{ marginTop: 14 }}>
                <span>Signed in as</span>
                <span>{cloudEmail}</span>
              </div>
            )}
            <div className="stack" style={{ marginTop: 16 }}>
              {cloudStatus === "signed-out" && (
                <button
                  className="btn btn-primary btn-block"
                  type="button"
                  onClick={() => navigate("/login", { replace: true })}
                >
                  <ArrowRight />
                  Go to sign in
                </button>
              )}
              {(cloudStatus === "offline" || cloudStatus === "error") && (
                <button
                  className="btn btn-secondary btn-block"
                  type="button"
                  onClick={cloudRetry}
                >
                  <RefreshCw />
                  Retry connection
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => void cloudSignOut()}
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
            <div className="auth-legal">
              <DeveloperCredit compact />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="setup-shell">
      <aside className="setup-aside">
        <div className="auth-brand">
          <div className="brand-mark">T</div>
          <div>
            <strong>Torque Workshop</strong>
            <span>Operations ERP</span>
          </div>
        </div>

        <div style={{ marginTop: 38 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#8eb2b8" }}>
            Start here
          </div>
          <h2 style={{ fontSize: 26, lineHeight: 1.15, letterSpacing: "-0.035em", marginTop: 8 }}>
            One workshop.
            <br />
            Every department.
            <br />
            One link.
          </h2>
          <p style={{ color: "#9fbcc1", fontSize: 12.5, lineHeight: 1.65, marginTop: 12 }}>
            Gate check-in, workshop jobs, stores, billing, accounts, marketing and owner
            reporting — all connected.
          </p>
        </div>

        <div className="steps">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className={`step ${index === step ? "active" : ""} ${index < step ? "done" : ""}`}
              >
                <span className="step-num">
                  {index < step ? <CheckCircle2 size={12} /> : <Icon size={12} />}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.caption}</small>
                </div>
              </div>
            );
          })}
        </div>

        <div className="setup-aside-foot">
          <button
            className="btn btn-accent btn-block"
            style={{ marginBottom: 12 }}
            onClick={() => {
              loadDemo();
              navigate("/login", { replace: true });
            }}
          >
            <Sparkles />
            Explore the demo workshop
          </button>
          Loads Vezel Masters Kandy with live jobs, stock, credits and reports. All demo
          accounts use PIN 1234.
          <div style={{ marginTop: 14 }}>Torque ERP · multi-tenant ready</div>
          <DeveloperCredit dark compact />
        </div>
      </aside>

      <main className="setup-main">
        <div className="setup-card">
          <div className="row-between wrap" style={{ marginBottom: 4 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="badge badge-brand">
                <Wrench size={11} /> New workshop
              </span>
              <span className="tiny muted">Step {step + 1} of {steps.length}</span>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                loadDemo();
                navigate("/login", { replace: true });
              }}
            >
              <Sparkles />
              Use demo instead
            </button>
          </div>

          <h1>
            {step === 0
              ? "Tell us about your workshop"
              : step === 1
                ? "Make it unmistakably yours"
                : step === 2
                  ? "Choose modules and sections"
                  : step === 3
                    ? "Secure the owner controls"
                    : "Create your staff logins"}
          </h1>
          <p className="sub">
            {step === 0
              ? "This becomes the heading on invoices, WhatsApp messages and your customer check-in page."
              : step === 1
                ? "Your logo automatically sets the brand palette used across the app, invoices and QR poster."
                : step === 2
                  ? "Pick the modules this workshop needs now. The developer portal can enable or disable them remotely later, and sections can be edited any time."
                  : step === 3
                    ? "The owner PIN signs you in. The master password protects settings, salaries and commission rates."
                    : "Add each staff member once and tick every department they work in. A supervisor who also handles stores gets both workspaces without switching accounts."}
          </p>

          {error && (
            <div style={{ marginTop: 16 }}>
              <Alert tone="danger" title="Check this">
                {error}
              </Alert>
            </div>
          )}

          <div className="card" style={{ marginTop: 22 }}>
            <div className="card-body">
              {step === 0 && (
                <div className="form-grid">
                  <Field label="Workshop / company name" required full>
                    <input
                      className="input"
                      placeholder="e.g. Vezel Masters Kandy"
                      value={form.companyName}
                      onChange={(event) => set("companyName", event.target.value)}
                      autoFocus
                    />
                  </Field>
                  <Field label="Workshop phone" required hint="Used on invoices and WhatsApp.">
                    <input
                      className="input"
                      placeholder="+94 81 234 5678"
                      value={form.phone}
                      onChange={(event) => set("phone", event.target.value)}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      className="input"
                      type="email"
                      placeholder="care@workshop.lk"
                      value={form.email}
                      onChange={(event) => set("email", event.target.value)}
                    />
                  </Field>
                  <Field label="Address" full>
                    <input
                      className="input"
                      placeholder="No. 12, Peradeniya Road, Kandy"
                      value={form.address}
                      onChange={(event) => set("address", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Google review link"
                    hint="Included in invoice and after-service WhatsApp messages."
                    full
                  >
                    <input
                      className="input"
                      placeholder="https://g.page/r/your-workshop/review"
                      value={form.googleReviewUrl}
                      onChange={(event) => set("googleReviewUrl", event.target.value)}
                    />
                  </Field>

                  <div className="field full">
                    <div className="section-title">
                      <span className="label">Company WhatsApp (optional)</span>
                    </div>
                    <div className="tiny muted" style={{ marginBottom: 8 }}>
                      Connect the workshop's own WhatsApp number through a self-hosted WAHA
                      gateway. The owner scans the QR once after setup.
                    </div>
                  </div>
                  <Field label="WhatsApp number">
                    <input
                      className="input"
                      placeholder="+94 81 234 5678"
                      value={form.whatsappCompanyNumber}
                      onChange={(event) => set("whatsappCompanyNumber", event.target.value)}
                    />
                  </Field>
                  <Field label="WAHA gateway URL">
                    <input
                      className="input"
                      placeholder="https://wa.workshop.lk"
                      value={form.whatsappGatewayUrl}
                      onChange={(event) => set("whatsappGatewayUrl", event.target.value)}
                    />
                  </Field>
                  <Field label="WAHA session" hint="Use a separate session per workshop.">
                    <input
                      className="input"
                      placeholder="vezel-masters"
                      value={form.whatsappSession}
                      onChange={(event) => set("whatsappSession", event.target.value)}
                    />
                  </Field>
                  <Field label="WAHA API key" hint="Stored in this installation only.">
                    <input
                      className="input"
                      type="password"
                      placeholder="Optional gateway key"
                      value={form.whatsappApiKey}
                      onChange={(event) => set("whatsappApiKey", event.target.value)}
                    />
                  </Field>

                  <div className="field full">
                    <div className="section-title">
                      <span className="label">Tax &amp; printing</span>
                    </div>
                    <div className="tiny muted" style={{ marginBottom: 8 }}>
                      Used on the Sri Lankan IRD tax invoice, insurance bills and thermal receipts.
                      You can change these in Settings later.
                    </div>
                    <div className="form-grid">
                      <Field label="Company TIN" hint="Taxpayer Identification Number.">
                        <input
                          className="input"
                          placeholder="123456789-7000"
                          value={form.tinNumber}
                          onChange={(event) => set("tinNumber", event.target.value)}
                        />
                      </Field>
                      <Field label="VAT registration number">
                        <input
                          className="input"
                          placeholder="123456789-7000"
                          value={form.vatRegNumber}
                          onChange={(event) => set("vatRegNumber", event.target.value)}
                        />
                      </Field>
                      <Field label="Default VAT rate (%)">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={form.defaultVatRate}
                          onChange={(event) => set("defaultVatRate", event.target.value)}
                        />
                      </Field>
                      <Field label="Place of supply">
                        <input
                          className="input"
                          placeholder="Kandy, Sri Lanka"
                          value={form.placeOfSupply}
                          onChange={(event) => set("placeOfSupply", event.target.value)}
                        />
                      </Field>
                      <Field
                        label="Printer mode"
                        hint="Thermal receipts, standard A4, or both."
                      >
                        <select
                          className="select"
                          value={form.printerMode}
                          onChange={(event) =>
                            set(
                              "printerMode",
                              event.target.value as "Standard_PC" | "Thermal_Only" | "Both",
                            )
                          }
                        >
                          <option value="Both">Both — thermal and standard PC</option>
                          <option value="Thermal_Only">Thermal only</option>
                          <option value="Standard_PC">Standard PC only (A4)</option>
                        </select>
                      </Field>
                      <Field label="Thermal roll width">
                        <select
                          className="select"
                          value={form.thermalPaperWidth}
                          onChange={(event) =>
                            set("thermalPaperWidth", event.target.value as "58mm" | "80mm")
                          }
                        >
                          <option value="80mm">80 mm</option>
                          <option value="58mm">58 mm</option>
                        </select>
                      </Field>
                      <Field label="Standard paper">
                        <select
                          className="select"
                          value={form.standardPaperSize}
                          onChange={(event) =>
                            set("standardPaperSize", event.target.value as "A4" | "A5")
                          }
                        >
                          <option value="A4">A4</option>
                          <option value="A5">A5</option>
                        </select>
                      </Field>
                    </div>
                  </div>

                  <div className="field full">
                    <div className="section-title">
                      <span className="label">Opening bank or cash account</span>
                    </div>
                    <div className="tiny muted" style={{ marginBottom: 8 }}>
                      Optional — record the balance you start with so cheque deposits, petty cash
                      top-ups and supplier payments reconcile from day one.
                    </div>
                    <div className="form-grid">
                      <Field label="Account name">
                        <input
                          className="input"
                          placeholder="Bank of Ceylon — Current"
                          value={form.bankAccountName}
                          onChange={(event) => set("bankAccountName", event.target.value)}
                        />
                      </Field>
                      <Field label="Bank name">
                        <input
                          className="input"
                          placeholder="Bank of Ceylon"
                          value={form.bankName}
                          onChange={(event) => set("bankName", event.target.value)}
                        />
                      </Field>
                      <Field label="Branch">
                        <input
                          className="input"
                          placeholder="Peradeniya"
                          value={form.bankBranch}
                          onChange={(event) => set("bankBranch", event.target.value)}
                        />
                      </Field>
                      <Field label="Account number">
                        <input
                          className="input"
                          placeholder="0079456123"
                          value={form.bankAccountNumber}
                          onChange={(event) => set("bankAccountNumber", event.target.value)}
                        />
                      </Field>
                      <Field label="Account type">
                        <select
                          className="select"
                          value={form.bankType}
                          onChange={(event) =>
                            set("bankType", event.target.value as "Bank" | "Cash")
                          }
                        >
                          <option value="Bank">Bank account</option>
                          <option value="Cash">Cash drawer / safe</option>
                        </select>
                      </Field>
                      <Field label="Opening balance (LKR)">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          placeholder="0"
                          value={form.openingBalance}
                          onChange={(event) => set("openingBalance", event.target.value)}
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="field full">
                    <div className="section-title">
                      <span className="label">Owner's opening capital</span>
                    </div>
                    <div className="tiny muted" style={{ marginBottom: 8 }}>
                      The owner's investment in the workshop. It appears as Owner's capital
                      in the trial balance and is separate from the bank or cash opening
                      balance above.
                    </div>
                    <div className="form-grid">
                      <Field label="Owner's capital (LKR)">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          placeholder="0"
                          value={form.ownerCapital}
                          onChange={(event) => set("ownerCapital", event.target.value)}
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="field full">
                    <div
                      className="setup-preview"
                      style={{ display: "flex", alignItems: "center", gap: 13 }}
                    >
                      <div className="brand-mark" style={{ background: form.brandColor }}>
                        {(form.companyName || "WS").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 750, fontSize: 14 }}>
                          {form.companyName || "Your workshop name"}
                        </div>
                        <div className="tiny muted" style={{ marginTop: 2 }}>
                          {form.phone || "Workshop phone"} · {form.email || "Email"}
                        </div>
                        <div className="tiny muted" style={{ marginTop: 1 }}>
                          Customer link: /check-in/{slug || "your-workshop"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="stack">
                  <div className="logo-upload">
                    {form.logo ? (
                      <img src={form.logo} alt="Workshop logo preview" />
                    ) : (
                      <div
                        className="logo-placeholder"
                        style={{ background: form.brandColor }}
                      >
                        {(form.companyName || "WS").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Workshop logo</div>
                      <div className="tiny muted" style={{ marginTop: 3 }}>
                        PNG, JPG or SVG up to 3 MB. We read the dominant colours and theme
                        the full app.
                      </div>
                      <div className="row wrap" style={{ marginTop: 9 }}>
                        <label className="btn btn-secondary btn-sm" htmlFor="setup-logo">
                          {readingLogo ? <Loader2 className="spin" size={13} /> : <Upload />}
                          {readingLogo ? "Reading colours…" : "Upload logo"}
                        </label>
                        <input
                          id="setup-logo"
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(event) => handleLogo(event.target.files?.[0])}
                        />
                        {form.logo && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => set("logo", "")}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid cols-2">
                    <Field label="Brand colour" hint="Primary buttons, navigation and invoice header.">
                      <div className="row">
                        <input
                          type="color"
                          value={form.brandColor}
                          onChange={(event) => set("brandColor", event.target.value)}
                          style={{
                            width: 44,
                            height: 40,
                            borderRadius: 9,
                            border: "1px solid var(--line-strong)",
                            background: "#fff",
                            padding: 3,
                          }}
                        />
                        <input
                          className="input"
                          value={form.brandColor}
                          onChange={(event) => set("brandColor", event.target.value)}
                        />
                      </div>
                    </Field>
                    <Field label="Accent colour" hint="Highlights, alerts and attention states.">
                      <div className="row">
                        <input
                          type="color"
                          value={form.accentColor}
                          onChange={(event) => set("accentColor", event.target.value)}
                          style={{
                            width: 44,
                            height: 40,
                            borderRadius: 9,
                            border: "1px solid var(--line-strong)",
                            background: "#fff",
                            padding: 3,
                          }}
                        />
                        <input
                          className="input"
                          value={form.accentColor}
                          onChange={(event) => set("accentColor", event.target.value)}
                        />
                      </div>
                    </Field>
                  </div>

                  <div className="setup-preview">
                    <div className="row-between wrap">
                      <div className="row">
                        <div
                          className="brand-mark"
                          style={{
                            background: form.brandColor,
                            width: 42,
                            height: 42,
                            flexBasis: 42,
                          }}
                        >
                          {form.logo ? (
                            <img src={form.logo} alt="" />
                          ) : (
                            (form.companyName || "WS").slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 750, fontSize: 13.5 }}>
                            {form.companyName || "Your workshop"}
                          </div>
                          <div className="tiny muted">Live theme preview</div>
                        </div>
                      </div>
                      <div className="row wrap">
                        <span
                          className="badge"
                          style={{ background: form.brandColor, color: "#fff" }}
                        >
                          Primary
                        </span>
                        <span
                          className="badge"
                          style={{ background: form.accentColor, color: "#3a2500" }}
                        >
                          Accent
                        </span>
                      </div>
                    </div>
                    <div className="divider" />
                    <div className="row wrap">
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ background: form.brandColor }}
                      >
                        Issue parts
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ borderColor: form.accentColor }}
                      >
                        Awaiting approval
                      </button>
                      <span
                        className="chip"
                        style={{
                          background: `${form.accentColor}22`,
                          borderColor: `${form.accentColor}55`,
                        }}
                      >
                        QR check-in
                      </span>
                    </div>
                  </div>

                  <Alert tone="info" icon={<Sparkles />} title="Automatic theming">
                    You can re-upload the logo later in Settings. Extracted colours are a
                    starting point — fine-tune them above.
                  </Alert>
                </div>
              )}

              {step === 2 && (
                <div className="stack">
                  <div className="form-grid">
                    <Field label="Module preset" full hint="Applies a starting set; fine-tune below.">
                      <select
                        className="select"
                        value={form.preset}
                        onChange={(event) => {
                          const preset = event.target.value;
                          setForm((prev) => ({
                            ...prev,
                            preset,
                            featureFlags: presetFlags(preset),
                          }));
                        }}
                      >
                        {MODULE_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name} — {preset.caption}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Stores topology" hint="Central store is the default.">
                      <select
                        className="select"
                        value={form.storesTopology}
                        onChange={(event) =>
                          set("storesTopology", event.target.value as StoresTopology)
                        }
                      >
                        <option value="Central">Central store</option>
                        <option value="PerSection">One store per section</option>
                      </select>
                    </Field>
                  </div>

                  <div>
                    <div className="label" style={{ marginBottom: 6 }}>
                      Enabled modules
                    </div>
                    <div className="grid cols-2" style={{ gap: 6 }}>
                      {FEATURE_FLAGS.map((flag) => (
                        <label
                          key={flag.key}
                          className="toggle-row"
                          style={{ padding: "8px 10px" }}
                        >
                          <span>
                            <strong style={{ fontSize: 12 }}>{flag.label}</strong>
                            <div className="tiny muted">{flag.description}</div>
                          </span>
                          <input
                            type="checkbox"
                            checked={form.featureFlags[flag.key] !== false}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                featureFlags: {
                                  ...prev.featureFlags,
                                  [flag.key]: event.target.checked,
                                } as FeatureFlags,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  {form.featureFlags.enable_multi_sections ? (
                    <div className="card" style={{ padding: 14 }}>
                      <div className="row-between wrap" style={{ marginBottom: 8 }}>
                        <div>
                          <strong style={{ fontSize: 13 }}>Initial sections</strong>
                          <div className="tiny muted">
                            Add the bays this workshop starts with. Supervisors and storekeepers are
                            assigned later in Settings.
                          </div>
                        </div>
                        <span className="badge badge-brand">
                          <Layers size={11} />
                          {sectionsDraft.length} section{sectionsDraft.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <input
                          className="input"
                          style={{ flex: "1 1 170px" }}
                          placeholder="Section name · e.g. Mechanical"
                          value={sectionDraft.name}
                          onChange={(event) =>
                            setSectionDraft({ ...sectionDraft, name: event.target.value })
                          }
                        />
                        <input
                          className="input"
                          style={{ width: 110 }}
                          placeholder="Code"
                          value={sectionDraft.code}
                          onChange={(event) =>
                            setSectionDraft({ ...sectionDraft, code: event.target.value })
                          }
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            if (!sectionDraft.name.trim()) {
                              setError("Enter the section name.");
                              return;
                            }
                            setSectionsDraft((prev) => [
                              ...prev,
                              {
                                name: sectionDraft.name.trim(),
                                code: sectionDraft.code.trim().toUpperCase(),
                              },
                            ]);
                            setSectionDraft({ name: "", code: "" });
                            setError("");
                          }}
                        >
                          <Plus />
                          Add
                        </button>
                      </div>
                      <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>
                        {["Mechanical", "Electrical", "Body & Paint", "Service Bay"].map(
                          (name) => (
                            <button
                              key={name}
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                setSectionsDraft((prev) =>
                                  prev.some((section) => section.name === name)
                                    ? prev
                                    : [
                                        ...prev,
                                        {
                                          name,
                                          code: name
                                            .split(/\s+/)
                                            .map((word) => word[0])
                                            .join("")
                                            .toUpperCase(),
                                        },
                                      ],
                                )
                              }
                            >
                              + {name}
                            </button>
                          ),
                        )}
                      </div>
                      {sectionsDraft.length > 0 && (
                        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                          {sectionsDraft.map((section) => (
                            <div className="list-row" key={section.name}>
                              <span className="part-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                                <Layers size={14} />
                              </span>
                              <div className="list-main">
                                <strong>{section.name}</strong>
                                <span>{section.code || "Auto code"}</span>
                              </div>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() =>
                                  setSectionsDraft((prev) =>
                                    prev.filter((entry) => entry.name !== section.name),
                                  )
                                }
                              >
                                <Trash2 />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Alert tone="info" icon={<ToggleRight />}>
                      Single-workflow mode: all section selectors stay hidden. You can enable sections
                      later from Settings → Modules &amp; sections.
                    </Alert>
                  )}

                  <Alert tone="brand" icon={<Store />}>
                    Modules such as insurance, estimates, VAT invoicing and driver commissions can be
                    switched off later without losing data. The developer portal can also change them
                    remotely through the licence sync.
                  </Alert>
                </div>
              )}

              {step === 3 && (
                <div className="stack">
                  <div className="form-grid">
                    <Field label="Owner's full name" required full>
                      <input
                        className="input"
                        placeholder="e.g. Nimal Perera"
                        value={form.ownerName}
                        onChange={(event) => set("ownerName", event.target.value)}
                      />
                    </Field>
                    <Field label="Owner PIN" required hint="4 to 6 digits. Used to sign in.">
                      <input
                        className="input"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="1234"
                        value={form.ownerPin}
                        onChange={(event) =>
                          set("ownerPin", event.target.value.replace(/\D/g, ""))
                        }
                      />
                    </Field>
                    <Field label="Master password" required hint="Minimum 6 characters.">
                      <input
                        className="input"
                        type="password"
                        placeholder="••••••••"
                        value={form.ownerPassword}
                        onChange={(event) => set("ownerPassword", event.target.value)}
                      />
                    </Field>
                    <Field label="Confirm master password" required>
                      <input
                        className="input"
                        type="password"
                        placeholder="••••••••"
                        value={form.confirmPassword}
                        onChange={(event) => set("confirmPassword", event.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="card">
                    <div className="card-head">
                      <div>
                        <h3>Ready to launch</h3>
                        <p>This is what will be created.</p>
                      </div>
                      <span className="badge badge-green">
                        <CheckCircle2 size={11} /> All set
                      </span>
                    </div>
                    <div className="card-body">
                      <div className="kv">
                        <span>Workshop</span>
                        <span>{form.companyName || "—"}</span>
                      </div>
                      <div className="kv">
                        <span>Owner</span>
                        <span>{form.ownerName || "—"}</span>
                      </div>
                      <div className="kv">
                        <span>Public check-in link</span>
                        <span>/check-in/{slug || "your-workshop"}</span>
                      </div>
                      <div className="kv">
                        <span>Theme</span>
                        <span className="row" style={{ justifyContent: "flex-end" }}>
                          <i
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 4,
                              background: form.brandColor,
                              display: "inline-block",
                            }}
                          />
                          <i
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 4,
                              background: form.accentColor,
                              display: "inline-block",
                            }}
                          />
                          Brand + accent
                        </span>
                      </div>
                      <div className="kv">
                        <span>Tax &amp; printing</span>
                        <span>
                          {form.tinNumber.trim() ? `TIN ${form.tinNumber.trim()} · ` : ""}
                          VAT{" "}
                          {form.defaultVatRate.trim() === "" ? "18" : form.defaultVatRate}% ·{" "}
                          {form.printerMode.replace(/_/g, " ")}{" "}
                          {form.printerMode !== "Standard_PC"
                            ? `· ${form.thermalPaperWidth}`
                            : `· ${form.standardPaperSize}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Alert tone="warn" title="Keep this safe">
                    The master password is required for owner-only changes such as commission
                    rates, payroll and secure settings. It is never shown to other departments.
                  </Alert>
                </div>
              )}

              {step === 4 && (
                <div className="stack">
                  <div className="form-grid">
                    <Field label="Staff full name" required>
                      <input
                        className="input"
                        placeholder="e.g. Ruwan Fernando"
                        value={staffDraft.name}
                        onChange={(event) =>
                          setStaffDraft({ ...staffDraft, name: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Username" required hint="Used on the sign-in screen.">
                      <input
                        className="input"
                        placeholder="ruwan"
                        value={staffDraft.username}
                        onChange={(event) =>
                          setStaffDraft({ ...staffDraft, username: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="PIN" required hint="4 to 6 digits.">
                      <input
                        className="input"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="1234"
                        value={staffDraft.pin}
                        onChange={(event) =>
                          setStaffDraft({
                            ...staffDraft,
                            pin: event.target.value.replace(/\D/g, ""),
                          })
                        }
                      />
                    </Field>
                    <Field label="Phone" required>
                      <input
                        className="input"
                        placeholder="+94 77 123 4567"
                        value={staffDraft.phone}
                        onChange={(event) =>
                          setStaffDraft({ ...staffDraft, phone: event.target.value })
                        }
                      />
                    </Field>
                  </div>

                  <div className="field">
                    <label className="label">Departments</label>
                    <div className="row wrap" style={{ gap: 8 }}>
                      {departmentOptions.map((department) => (
                        <label className="checkbox-row" key={department}>
                          <input
                            type="checkbox"
                            checked={staffDraft.departments.includes(department)}
                            onChange={() => toggleDraftDepartment(department)}
                          />
                          {department}
                        </label>
                      ))}
                    </div>
                    <div className="tiny muted" style={{ marginTop: 6 }}>
                      Tick every department this person works in. For example, Supervisor + Stores
                      gives one login both the workshop and stores workspaces.
                    </div>
                  </div>

                  <button className="btn btn-secondary" onClick={addStaffMember}>
                    <Plus />
                    Add staff member
                  </button>

                  {staffList.length > 0 ? (
                    <div className="stack" style={{ gap: 8 }}>
                      {staffList.map((person) => (
                        <div className="list-row" key={person.username}>
                          <span className="part-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                            <Users size={15} />
                          </span>
                          <div className="list-main">
                            <strong>{person.name}</strong>
                            <span>
                              {person.username} · PIN set · {person.phone}
                            </span>
                            <div className="dept-picker" style={{ marginTop: 6 }}>
                              {departmentOptions.map((department) => (
                                <label
                                  key={department}
                                  className={`dept-option ${
                                    person.departments.includes(department) ? "selected" : ""
                                  }`}
                                  style={{ padding: "4px 8px", fontSize: 11 }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={person.departments.includes(department)}
                                    onChange={() =>
                                      toggleStaffDepartment(person.username, department)
                                    }
                                  />
                                  {department}
                                </label>
                              ))}
                            </div>
                            <div className="tiny muted" style={{ marginTop: 4 }}>
                              Tap any department to add or remove it. Roles combine; one
                              login can cover several departments.
                            </div>
                          </div>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setStaffList((prev) =>
                                prev.filter((entry) => entry.username !== person.username),
                              )
                            }
                          >
                            <Trash2 />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Alert tone="info" title="Staff are optional here">
                      You can skip this step and add staff later under Team. All accounts can be
                      given multiple departments at any time.
                    </Alert>
                  )}

                  {staffList.length > 0 && (
                    <div className="card" style={{ padding: 12, boxShadow: "none" }}>
                      <div className="row-between" style={{ marginBottom: 8 }}>
                        <strong style={{ fontSize: 12 }}>Department coverage</strong>
                        <span className="tiny muted">
                          {staffList.length} staff ·{" "}
                          {departmentOptions.filter((department) =>
                            staffList.some((person) =>
                              person.departments.includes(department),
                            ),
                          ).length}
                          /{departmentOptions.length} departments covered
                        </span>
                      </div>
                      {departmentOptions.map((department) => {
                        const people = staffList.filter((person) =>
                          person.departments.includes(department),
                        );
                        return (
                          <div className="kv" key={department}>
                            <span>{department}</span>
                            <span>
                              {people.length
                                ? people.map((person) => person.name).join(", ")
                                : "Not assigned"}
                            </span>
                          </div>
                        );
                      })}
                      <div className="tiny muted" style={{ marginTop: 6 }}>
                        A person can cover several departments. Their permissions are
                        combined, and the sidebar shows every workspace they can open.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="card-foot row-between wrap">
              <div>
                {step > 0 ? (
                  <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                    <ArrowLeft />
                    Back
                  </button>
                ) : (
                  <span className="tiny muted">You can change all of this later.</span>
                )}
              </div>
              <button className="btn btn-primary btn-lg" onClick={next}>
                {step === 4 ? (
                  <>
                    <CheckCircle2 />
                    Create workshop
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight />
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="tiny muted" style={{ textAlign: "center", marginTop: 18 }}>
            Demo data stays in this browser. Production setup with Supabase, Google Drive and
            the WhatsApp gateway is documented in the project.
          </p>
          <div className="setup-main-credit">
            <DeveloperCredit compact />
          </div>
        </div>
      </main>
    </div>
  );
}
