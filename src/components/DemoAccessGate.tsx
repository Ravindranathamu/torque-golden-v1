import { Clock3, Loader2, ShieldAlert } from "lucide-react";
import { demoAccessExpiry } from "../lib/licence";
import { DEVELOPER } from "../lib/developer";
import { shortDate } from "../lib/utils";

interface DemoAccessGateProps {
  status?: "checking" | "denied" | "error";
  expiry?: string;
  message?: string;
}

export function DemoAccessExpiredPage({
  status = "denied",
  expiry,
  message,
}: DemoAccessGateProps) {
  const activeExpiry = expiry || demoAccessExpiry();
  const expiryDate = activeExpiry ? new Date(activeExpiry) : null;
  const checking = status === "checking";
  const title = checking
    ? "Checking demo access"
    : status === "error"
      ? "Demo access unavailable"
      : "This demo has expired";
  const sub = checking
    ? "Verifying the public demo period with RAVBsoft."
    : message ||
      (status === "error"
        ? "The demo access server could not be reached."
        : "The public demonstration period has finished. Clearing browser data will not restart this demo.");

  return (
    <div className="auth-shell" style={{ gridTemplateColumns: "1fr" }}>
      <main className="auth-panel">
        <div className="auth-card">
          <span className={`badge ${checking ? "badge-brand" : "badge-red"}`}>
            {checking ? <Loader2 className="spin" size={11} /> : <ShieldAlert size={11} />}{" "}
            {checking ? "Demo access check" : "Demo access ended"}
          </span>
          <h1 style={{ marginTop: 12 }}>{title}</h1>
          <p className="sub">{sub}</p>

          {!checking && expiryDate && !Number.isNaN(expiryDate.getTime()) && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-body stack">
                <div className="kv">
                  <span>
                    <Clock3 size={12} /> Demo ends
                  </span>
                  <strong>{shortDate(expiryDate.toISOString())}</strong>
                </div>
                <div className="tiny muted">
                  Contact RAVBsoft for a fresh demo link or to arrange a licensed installation.
                </div>
                <a
                  className="btn btn-primary"
                  href={`mailto:${DEVELOPER.email}?subject=Torque ERP demo access request`}
                >
                  Request a demo
                </a>
              </div>
            </div>
          )}

          {!checking && (
            <a
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 12 }}
              href={`mailto:${DEVELOPER.email}?subject=Torque ERP demo access issue`}
            >
              Contact RAVBsoft
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
