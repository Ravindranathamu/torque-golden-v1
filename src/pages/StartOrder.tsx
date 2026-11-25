import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Truck,
  Wrench,
} from "lucide-react";
import type { FeatureFlagKey, LicencePlan } from "../types";
import { FEATURE_FLAGS, MODULE_PRESETS } from "../lib/features";
import {
  ORDER_PLAN_ORDER,
  ORDER_PRODUCTS,
  planDescriptionFor,
  planPriceFor,
  productHasModules,
  submitClientOrder,
} from "../lib/orders";
import { money } from "../lib/utils";
import { Field } from "../components/ui";
import { DeveloperCredit } from "../components/DeveloperCredit";

const MODULE_GROUPS = ["Operations", "Finance", "People", "Communication"] as const;

function recommendedModules(product: string, plan: LicencePlan): FeatureFlagKey[] {
  if (!productHasModules(product)) return [];
  const presetId =
    plan === "Lite" ? "garage-lite" : plan === "Starter" ? "quick-lube" : "full-workshop";
  return MODULE_PRESETS.find((preset) => preset.id === presetId)?.flags ?? [];
}

function ProductGlyph({ product, size = 18 }: { product: string; size?: number }) {
  if (product === "ScanPlan") return <ShieldCheck size={size} />;
  if (product === "TAW") return <Truck size={size} />;
  return <Wrench size={size} />;
}

export function StartOrderPage() {
  const [product, setProduct] = useState("Torque ERP");
  const [plan, setPlan] = useState<LicencePlan>("Growth");
  const [modules, setModules] = useState<FeatureFlagKey[]>(() =>
    recommendedModules("Torque ERP", "Growth"),
  );
  const [form, setForm] = useState({
    clientName: "",
    contactName: "",
    phone: "",
    email: "",
    district: "",
    address: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [savedLocally, setSavedLocally] = useState(false);

  const price = planPriceFor(product, plan);
  const hasModules = productHasModules(product);
  const selectedModules = useMemo(
    () => FEATURE_FLAGS.filter((flag) => modules.includes(flag.key)),
    [modules],
  );

  function selectProduct(name: string) {
    setProduct(name);
    setModules(recommendedModules(name, plan));
  }

  function selectPlan(next: LicencePlan) {
    setPlan(next);
    setModules(recommendedModules(product, next));
  }

  function toggleModule(key: FeatureFlagKey) {
    setModules((prev) =>
      prev.includes(key) ? prev.filter((entry) => entry !== key) : [...prev, key],
    );
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (form.clientName.trim().length < 2) {
      setError("Enter the business or workshop name.");
      return;
    }
    if (form.contactName.trim().length < 2) {
      setError("Enter the person RAVBsoft should contact.");
      return;
    }
    if (form.phone.replace(/\D/g, "").length < 7) {
      setError("Enter a valid phone number, including the area or mobile prefix.");
      return;
    }
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      setError("That email address does not look valid.");
      return;
    }
    if (hasModules && modules.length === 0) {
      setError("Select at least one Torque ERP module.");
      return;
    }

    setBusy(true);
    const result = await submitClientOrder({
      product,
      clientName: form.clientName,
      contactName: form.contactName,
      phone: form.phone,
      email: form.email,
      district: form.district,
      address: form.address,
      plan,
      modules,
      notes: form.notes,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSavedLocally(result.local);
    setReference(result.reference);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (reference) {
    return (
      <div className="order-page">
        <header className="order-topbar">
          <Link to="/" className="order-brand">
            <img src="/brand/ravbsoft-mark.jpg" alt="RAVBsoft" />
            <span>
              <strong>RAVBsoft</strong>
              <em>Enterprise management systems</em>
            </span>
          </Link>
          <Link to="/" className="btn btn-ghost btn-sm">
            <ArrowLeft size={13} /> Back to the app
          </Link>
        </header>
        <main className="order-shell">
          <section className="order-confirm card">
            <span className="badge badge-green">
              <CheckCircle2 size={12} /> Order received
            </span>
            <h1>Thank you — your order is in the queue</h1>
            <p className="sub">
              RAVBsoft will review the details, confirm the plan and prepare your isolated
              installation.
            </p>
            <div className="order-reference">
              <span>Your reference</span>
              <strong>{reference}</strong>
            </div>
            <div className="order-steps">
              <div>
                <span>1</span>
                <div>
                  <strong>Review and confirmation</strong>
                  <p>We confirm the product, plan, monthly fee and selected modules with you.</p>
                </div>
              </div>
              <div>
                <span>2</span>
                <div>
                  <strong>Accounts and deployment</strong>
                  <p>
                    Supabase, Cloudflare and any messaging accounts are created, then the
                    golden master is deployed for your business.
                  </p>
                </div>
              </div>
              <div>
                <span>3</span>
                <div>
                  <strong>Handover</strong>
                  <p>
                    You receive the app link, installation ID and initial owner login. Finish
                    the short setup to start your 30-day full-access trial.
                  </p>
                </div>
              </div>
              <div>
                <span>4</span>
                <div>
                  <strong>Activation</strong>
                  <p>
                    After payment RAVBsoft activates the copy for your period. The app thanks
                    you, removes the trial reminder and keeps only the modules you bought.
                  </p>
                </div>
              </div>
            </div>
            {savedLocally && (
              <div className="alert alert-warn">
                <CircleAlert />
                <span>
                  The master portal is not configured in this build, so this order was saved in
                  this browser for the demo. Apply the client-orders migration and set the master
                  Supabase URL to receive real orders.
                </span>
              </div>
            )}
            <div className="row wrap">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setReference("");
                  setSavedLocally(false);
                  setForm({
                    clientName: "",
                    contactName: "",
                    phone: "",
                    email: "",
                    district: "",
                    address: "",
                    notes: "",
                  });
                }}
              >
                Submit another order
              </button>
              <Link to="/" className="btn btn-primary">
                Open the app <ArrowRight />
              </Link>
            </div>
            <div className="order-contact tiny muted">
              Questions? <a href="mailto:ravindranath@hotmail.co.uk">ravindranath@hotmail.co.uk</a>{" "}
              · +94 75 575 6803
            </div>
          </section>
        </main>
        <footer className="order-foot">
          <DeveloperCredit compact />
        </footer>
      </div>
    );
  }

  return (
    <div className="order-page">
      <header className="order-topbar">
        <Link to="/" className="order-brand">
          <img src="/brand/ravbsoft-mark.jpg" alt="RAVBsoft" />
          <span>
            <strong>RAVBsoft</strong>
            <em>Enterprise management systems</em>
          </span>
        </Link>
        <Link to="/" className="btn btn-ghost btn-sm">
          <ArrowLeft size={13} /> Back to the app
        </Link>
      </header>

      <main className="order-shell">
        <section className="order-hero">
          <span className="developer-eyebrow">START A NEW INSTALLATION</span>
          <h1>Choose your app. Tell us about the business. We build the rest.</h1>
          <p>
            One order link covers Torque ERP, ScanPlan and TAW. Your order lands directly in the
            RAVBsoft portal as a pending installation, with the modules and plan you select.
          </p>
          <div className="order-hero-points">
            <span><CheckCircle2 size={13} /> 30-day full-access trial</span>
            <span><CheckCircle2 size={13} /> Isolated Supabase database</span>
            <span><CheckCircle2 size={13} /> Initial owner login supplied</span>
          </div>
        </section>

        <form className="order-layout" onSubmit={submit}>
          <div className="order-main">
            <section className="card">
              <div className="card-head">
                <div>
                  <h3>1 · Product</h3>
                  <p>Every product is licensed through the same RAVBsoft portal.</p>
                </div>
              </div>
              <div className="card-body">
                <div className="order-product-grid">
                  {ORDER_PRODUCTS.map((entry) => {
                    const active = product === entry.name;
                    return (
                      <button
                        key={entry.name}
                        type="button"
                        className={`order-product-card ${active ? "active" : ""}`}
                        onClick={() => selectProduct(entry.name)}
                      >
                        <span className="order-product-icon">
                          <ProductGlyph product={entry.name} size={19} />
                        </span>
                        <strong>{entry.name}</strong>
                        <em>{entry.short}</em>
                        <p>{entry.tagline}</p>
                        {active && <span className="order-picked"><CheckCircle2 size={12} /> Selected</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div>
                  <h3>2 · Plan</h3>
                  <p>Choose the monthly plan that fits the business today. It can change later.</p>
                </div>
              </div>
              <div className="card-body">
                <div className="order-plan-grid">
                  {ORDER_PLAN_ORDER.map((entry) => {
                    const active = plan === entry;
                    const planPrice = planPriceFor(product, entry);
                    return (
                      <button
                        key={entry}
                        type="button"
                        className={`order-plan-card ${active ? "active" : ""}`}
                        onClick={() => selectPlan(entry)}
                      >
                        <strong>{entry}</strong>
                        <div className="order-plan-price">
                          {planPrice === undefined ? "Quoted" : money(planPrice)}
                          {planPrice !== undefined && <span>/ month</span>}
                        </div>
                        <p>{planDescriptionFor(product, entry)}</p>
                        {active && <span className="order-picked"><CheckCircle2 size={12} /> Selected</span>}
                      </button>
                    );
                  })}
                </div>
                {product === "ScanPlan" && (
                  <div className="alert alert-info" style={{ marginTop: 12 }}>
                    <Sparkles />
                    <span>
                      ScanPlan is priced per site after we review the number of staff and
                      departments. Submit the order and RAVBsoft will confirm the monthly fee.
                    </span>
                  </div>
                )}
              </div>
            </section>

            {hasModules && (
              <section className="card">
                <div className="card-head">
                  <div>
                    <h3>3 · Torque ERP modules</h3>
                    <p>
                      Select what the workshop needs. Every module is unlocked during the trial;
                      after activation only these stay available.
                    </p>
                  </div>
                  <span className="badge badge-blue">{modules.length} selected</span>
                </div>
                <div className="card-body stack">
                  {MODULE_GROUPS.map((group) => {
                    const groupFlags = FEATURE_FLAGS.filter((flag) => flag.group === group);
                    if (groupFlags.length === 0) return null;
                    return (
                      <div key={group}>
                        <div className="label">{group}</div>
                        <div className="order-module-grid">
                          {groupFlags.map((flag) => (
                            <label key={flag.key} className="order-module">
                              <input
                                type="checkbox"
                                checked={modules.includes(flag.key)}
                                onChange={() => toggleModule(flag.key)}
                              />
                              <span>
                                <strong>{flag.label}</strong>
                                <em>{flag.description}</em>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="card">
              <div className="card-head">
                <div>
                  <h3>{hasModules ? "4" : "3"} · Business details</h3>
                  <p>This is what RAVBsoft uses to provision and hand over the installation.</p>
                </div>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <Field label="Business / workshop name" required>
                    <div className="input-group">
                      <span className="prefix"><Building2 size={14} /></span>
                      <input
                        className="input"
                        value={form.clientName}
                        onChange={(event) => setField("clientName", event.target.value)}
                        placeholder="e.g. Vezel Masters (Pvt) Ltd"
                        autoComplete="organization"
                      />
                    </div>
                  </Field>
                  <Field label="Contact person" required>
                    <input
                      className="input"
                      value={form.contactName}
                      onChange={(event) => setField("contactName", event.target.value)}
                      placeholder="Owner or manager name"
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Phone / WhatsApp" required>
                    <div className="input-group">
                      <span className="prefix"><Phone size={14} /></span>
                      <input
                        className="input"
                        value={form.phone}
                        onChange={(event) => setField("phone", event.target.value)}
                        placeholder="+94 77 123 4567"
                        inputMode="tel"
                        autoComplete="tel"
                      />
                    </div>
                  </Field>
                  <Field label="Email" hint="Used for the handover and licence reminders.">
                    <div className="input-group">
                      <span className="prefix"><Mail size={14} /></span>
                      <input
                        className="input"
                        type="email"
                        value={form.email}
                        onChange={(event) => setField("email", event.target.value)}
                        placeholder="owner@business.lk"
                        autoComplete="email"
                      />
                    </div>
                  </Field>
                  <Field label="District / city">
                    <div className="input-group">
                      <span className="prefix"><MapPin size={14} /></span>
                      <input
                        className="input"
                        value={form.district}
                        onChange={(event) => setField("district", event.target.value)}
                        placeholder="e.g. Kandy"
                      />
                    </div>
                  </Field>
                  <Field label="Address" hint="Optional. Used on the licence and invoices.">
                    <input
                      className="input"
                      value={form.address}
                      onChange={(event) => setField("address", event.target.value)}
                      placeholder="No. 12, Peradeniya Road"
                      autoComplete="street-address"
                    />
                  </Field>
                </div>
                <Field
                  label="Anything else we should know?"
                  hint="Branches, existing systems, custom documents, WhatsApp number, preferred go-live date."
                >
                  <textarea
                    className="input"
                    rows={3}
                    value={form.notes}
                    onChange={(event) => setField("notes", event.target.value)}
                    placeholder="Tell us about the workshop, team size or custom requirements."
                  />
                </Field>
              </div>
            </section>
          </div>

          <aside className="order-side">
            <div className="card order-summary">
              <div className="card-head">
                <div>
                  <h3>Your order</h3>
                  <p>Review before sending it to RAVBsoft.</p>
                </div>
              </div>
              <div className="card-body stack">
                <div className="order-summary-product">
                  <span className="order-product-icon">
                    <ProductGlyph product={product} />
                  </span>
                  <div>
                    <strong>{product}</strong>
                    <em>{plan} plan</em>
                  </div>
                </div>
                <div className="order-summary-rows">
                  <div>
                    <span>Monthly</span>
                    <strong>{price === undefined ? "Quoted after review" : money(price)}</strong>
                  </div>
                  <div>
                    <span>Trial</span>
                    <strong>30 days · full access</strong>
                  </div>
                  <div>
                    <span>Modules</span>
                    <strong>{hasModules ? `${modules.length} selected` : "All product features"}</strong>
                  </div>
                </div>
                {hasModules && selectedModules.length > 0 && (
                  <div className="order-summary-modules">
                    {selectedModules.map((flag) => (
                      <span key={flag.key} className="badge badge-slate">{flag.label}</span>
                    ))}
                  </div>
                )}
                {error && (
                  <div className="alert alert-danger">
                    <CircleAlert />
                    <span>{error}</span>
                  </div>
                )}
                <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
                  {busy ? <Loader2 className="spin" /> : <ArrowRight />}
                  {busy ? "Sending your order…" : "Send order to RAVBsoft"}
                </button>
                <div className="tiny muted">
                  No payment is taken here. RAVBsoft confirms the plan and fee before deployment.
                </div>
              </div>
            </div>
            <div className="order-side-note">
              <ShieldCheck size={16} />
              <div>
                <strong>Your own isolated installation</strong>
                <p>
                  Every client gets a dedicated Supabase project, Cloudflare deployment and owner
                  login. Data is never shared between workshops.
                </p>
              </div>
            </div>
          </aside>
        </form>
      </main>

      <footer className="order-foot">
        <DeveloperCredit compact />
      </footer>
    </div>
  );
}
