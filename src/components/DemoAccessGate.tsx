import { Clock3, ShieldAlert } from "lucide-react";
import { demoAccessExpiry } from "../lib/licence";
import { DEVELOPER } from "../lib/developer";
import { shortDate } from "../lib/utils";

export function DemoAccessExpiredPage() {
  const expiry = demoAccessExpiry();
  const expiryDate = expiry ? new Date(expiry) : null;

  return (
    <div className="auth-shell" style={{ gridTemplateColumns: "1fr" }}>
      <main className="auth-panel">
        <div className="auth-card">
          <span className="badge badge-red">
            <ShieldAlert size={11} /> Demo access ended
          </span>
          <h1 style={{ marginTop: 12 }}>This demo has expired</h1>
          <p className="sub">
            The public demonstration period has finished. Clearing browser data will not restart
            this demo.
          </p>

          {expiryDate && !Number.isNaN(expiryDate.getTime()) && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-body stack">
                <div className="kv">
                  <span>
                    <Clock3 size={12} /> Demo ended
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
        </div>
      </main>
    </div>
  );
}
