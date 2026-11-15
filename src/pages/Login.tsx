import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CarFront,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  QrCode,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { Avatar, Alert } from "../components/ui";
import { DeveloperCredit } from "../components/DeveloperCredit";

const features = [
  { icon: CarFront, text: "QR gate check-in with returning-vehicle autofill" },
  { icon: Wrench, text: "Worker tasks, parts and commission tracking" },
  { icon: Users, text: "Multi-department roles without workflow conflicts" },
  { icon: ShieldCheck, text: "Owner-only controls, payroll and live P&L" },
];

export function LoginPage() {
  const { state, currentUser, login, cloudStatus } = useApp();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(() =>
    state.users.find((user) => user.isOwner)?.id ?? state.users[0]?.id ?? "",
  );
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");

  if (cloudStatus !== "disabled") return <CloudLoginPage />;
  if (!state.settings.configured) return <Navigate to="/setup" replace />;
  if (currentUser) return <Navigate to="/" replace />;

  const selected =
    state.users.find((user) => user.id === selectedId) ?? state.users[0] ?? null;
  const checkInUrl = `${window.location.origin}/check-in/${state.settings.qrSlug || "workshop"}`;

  function submit() {
    if (!selected) {
      setError("No staff account exists. Reset the workshop and run setup again.");
      return;
    }
    if (pin.length < 4) {
      setError("Enter your PIN.");
      return;
    }
    const result = login(selected.id, pin);
    if (!result.ok) {
      setError(result.message ?? "Unable to sign in.");
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="auth-shell">
      <aside className="auth-art">
        <div className="auth-brand">
          <div className="brand-mark" style={{ overflow: "hidden" }}>
            {state.settings.logo ? (
              <img
                src={state.settings.logo}
                alt={state.settings.companyName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              (state.settings.companyName || "T").slice(0, 1)
            )}
          </div>
          <div>
            <strong>{state.settings.companyName || "Torque Workshop"}</strong>
            <span>Workshop operations</span>
          </div>
        </div>

        <div className="auth-hero">
          <h2>
            Every vehicle,
            <br />
            every job,
            <br />
            <em>under control.</em>
          </h2>
          <p>
            From the customer's first QR scan to the final gate release. Gate, workshop,
            stores, billing, accounts and marketing working from one live system.
          </p>
          <div className="auth-features">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div className="auth-feature" key={feature.text}>
                  <Icon />
                  <span>{feature.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="auth-art-foot">
          <div className="row" style={{ gap: 7, color: "#a8c4c8" }}>
            <QrCode size={13} />
            <span>Customer check-in</span>
            <span style={{ opacity: 0.35 }}>·</span>
            <span style={{ fontSize: 10 }}>{checkInUrl}</span>
          </div>
          <div style={{ marginTop: 7 }}>Torque ERP · responsive PWA · v1.0</div>
          <DeveloperCredit dark compact />
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <span className="badge badge-brand">
            <Sparkles size={11} /> {state.settings.demoMode ? "Demo workshop" : "Secure sign in"}
          </span>
          <h1 style={{ marginTop: 12 }}>Welcome back</h1>
          <p className="sub">
            Choose your staff account, then enter your PIN. Your screens and permissions follow
            your departments.
          </p>

          {error && (
            <div style={{ marginTop: 14 }}>
              <Alert tone="danger">{error}</Alert>
            </div>
          )}

          <div className="auth-accounts">
            {state.users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={`account-option ${selected?.id === user.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedId(user.id);
                  setPin("");
                  setError("");
                }}
              >
                <Avatar name={user.name} size="sm" />
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: 12.8, fontWeight: 700 }}>
                    {user.name}
                  </span>
                  <span className="roles">
                    {user.isOwner ? (
                      <span>Owner</span>
                    ) : user.departments.length ? (
                      user.departments.map((department) => (
                        <span key={department}>{department}</span>
                      ))
                    ) : (
                      <span>No department</span>
                    )}
                    <span>{user.phone}</span>
                  </span>
                </span>
                {selected?.id === user.id && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: "var(--brand)",
                    }}
                  />
                )}
              </button>
            ))}
          </div>

          <form
            className="stack"
            style={{ marginTop: 16 }}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="field">
              <label htmlFor="login-pin">
                PIN for {selected?.name ?? "your account"}
                <KeyRound size={12} style={{ marginLeft: "auto", color: "var(--muted)" }} />
              </label>
              <div className="input-group">
                <input
                  id="login-pin"
                  className="input pin-input"
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="current-password"
                  maxLength={6}
                  placeholder="••••"
                  value={pin}
                  onChange={(event) => {
                    setPin(event.target.value.replace(/\D/g, ""));
                    setError("");
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="suffix-btn"
                  onClick={() => setShowPin((value) => !value)}
                  aria-label={showPin ? "Hide PIN" : "Show PIN"}
                >
                  {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button className="btn btn-primary btn-lg btn-block" type="submit">
              Sign in
              <ArrowRight />
            </button>
          </form>

          {state.settings.demoMode && (
            <div className="auth-hint">
              <Sparkles />
              <div>
                <strong style={{ display: "block", color: "var(--ink-2)", marginBottom: 2 }}>
                  Demo access
                </strong>
                Every demo account uses PIN <strong>1234</strong>. Owner master password is{" "}
                <strong>owner123</strong>.
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setPin("1234");
                    setError("");
                  }}
                >
                  Fill demo PIN
                </button>
              </div>
            </div>
          )}

          <div className="divider" />
          <div className="row-between wrap">
            <a className="btn btn-ghost btn-sm" href={`/check-in/${state.settings.qrSlug}`} target="_blank" rel="noreferrer">
              <QrCode />
              Open customer check-in
            </a>
            <span className="tiny muted">
              {state.users.length} staff account{state.users.length === 1 ? "" : "s"} ·{" "}
              {state.settings.currency}
            </span>
          </div>
          <div className="auth-legal">
            <DeveloperCredit compact />
          </div>
        </div>
      </main>
    </div>
  );
}

function CloudLoginPage() {
  const {
    state,
    currentUser,
    cloudStatus,
    cloudMessage,
    cloudEmail,
    cloudSignIn,
    cloudSignOut,
    cloudRetry,
  } = useApp();
  const [email, setEmail] = useState(cloudEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cloudEmail) setEmail(cloudEmail);
  }, [cloudEmail]);

  const signedIn =
    Boolean(currentUser) &&
    cloudStatus !== "signed-out" &&
    cloudStatus !== "unprovisioned" &&
    cloudStatus !== "loading";

  if (signedIn) return <Navigate to="/" replace />;

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter the email and password issued by RAVsoft.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await cloudSignIn(email, password);
    setBusy(false);
    if (!result.ok) setError(result.message ?? "Unable to sign in.");
  }

  const company = state.settings.companyName || "your workshop";

  return (
    <div className="auth-shell">
      <aside className="auth-art">
        <div className="auth-brand">
          <div className="brand-mark" style={{ overflow: "hidden" }}>
            {state.settings.logo ? (
              <img
                src={state.settings.logo}
                alt={company}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              company.slice(0, 1)
            )}
          </div>
          <div>
            <strong>{company}</strong>
            <span>Cloud workshop</span>
          </div>
        </div>

        <div className="auth-hero">
          <h2>
            One workshop,
            <br />
            every device,
            <br />
            <em>one live record.</em>
          </h2>
          <p>
            Your gate, workshop, stores, cashier and accounting screens share the
            same Supabase workshop database. Sign in once on each device.
          </p>
          <div className="auth-features">
            <div className="auth-feature">
              <Cloud />
              <span>Workshop-scoped Supabase Auth and row-level security</span>
            </div>
            <div className="auth-feature">
              <ShieldCheck />
              <span>Offline edits queue locally and sync when the link returns</span>
            </div>
            <div className="auth-feature">
              <Users />
              <span>Owner and department permissions stay on every screen</span>
            </div>
          </div>
        </div>

        <div className="auth-art-foot">
          <div className="row" style={{ gap: 7, color: "#a8c4c8" }}>
            <QrCode size={13} />
            <span>Licensed by RAVsoft</span>
          </div>
          <div style={{ marginTop: 7 }}>Torque ERP · cloud workshop · v1.4</div>
          <DeveloperCredit dark compact />
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <span className="badge badge-brand">
            <Cloud size={11} /> Cloud workshop
          </span>
          <h1 style={{ marginTop: 12 }}>
            {cloudStatus === "unprovisioned" ? "Workshop not provisioned" : "Sign in"}
          </h1>
          <p className="sub">
            {cloudStatus === "unprovisioned"
              ? "This account is not linked to a workshop yet. RAVsoft must create the workshop and owner profile first."
              : "Use the email and password issued by RAVsoft. The app loads this workshop's data and keeps it in sync across devices."}
          </p>

          {error && (
            <div style={{ marginTop: 14 }}>
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          {!error && cloudMessage && (
            <div style={{ marginTop: 14 }}>
              <Alert
                tone={
                  cloudStatus === "offline" || cloudStatus === "unprovisioned"
                    ? "warn"
                    : cloudStatus === "error"
                      ? "danger"
                      : "info"
                }
              >
                {cloudMessage}
              </Alert>
            </div>
          )}

          {cloudStatus === "loading" ? (
            <div className="auth-hint" style={{ marginTop: 16 }}>
              <Loader2 className="spin" />
              <div>
                <strong style={{ display: "block", color: "var(--ink-2)" }}>
                  Connecting to the workshop
                </strong>
                Loading your license, staff profiles and live records.
              </div>
            </div>
          ) : cloudStatus === "unprovisioned" ? (
            <div className="stack" style={{ marginTop: 18 }}>
              <div className="kv">
                <span>Signed in as</span>
                <span>{cloudEmail ?? "unknown account"}</span>
              </div>
              <button
                className="btn btn-secondary btn-block"
                type="button"
                onClick={() => void cloudSignOut()}
              >
                <LogOut />
                Sign out and use another account
              </button>
            </div>
          ) : signedIn ? null : (
            <form
              className="stack"
              style={{ marginTop: 16 }}
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="field">
                <label htmlFor="cloud-email">Email</label>
                <div className="input-group">
                  <Mail size={15} style={{ marginLeft: 10, color: "var(--muted)" }} />
                  <input
                    id="cloud-email"
                    className="input"
                    type="email"
                    autoComplete="email"
                    placeholder="owner@workshop.lk"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setError("");
                    }}
                    autoFocus
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="cloud-password">Password</label>
                <div className="input-group">
                  <KeyRound size={15} style={{ marginLeft: 10, color: "var(--muted)" }} />
                  <input
                    id="cloud-password"
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                  />
                </div>
              </div>

              <button
                className="btn btn-primary btn-lg btn-block"
                type="submit"
                disabled={busy}
              >
                {busy ? <Loader2 className="spin" /> : <ArrowRight />}
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          {cloudStatus === "offline" && (
            <div className="stack" style={{ marginTop: 14 }}>
              <button
                className="btn btn-secondary btn-block"
                type="button"
                onClick={cloudRetry}
              >
                Retry connection
              </button>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => void cloudSignOut()}
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          )}

          <div className="auth-hint" style={{ marginTop: 18 }}>
            <ShieldCheck />
            <div>
              <strong style={{ display: "block", color: "var(--ink-2)", marginBottom: 2 }}>
                RAVsoft support
              </strong>
              If you have lost the workshop password, contact RAVsoft. Do not create a
              new account.
            </div>
          </div>

          <div className="auth-legal">
            <DeveloperCredit compact />
          </div>
        </div>
      </main>
    </div>
  );
}
