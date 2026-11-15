import { useState } from "react";
import { KeyRound, LogOut, Mail, ShieldAlert } from "lucide-react";
import { useApp } from "../state/AppStore";
import { getMachineId, licenceInfo, TRIAL_DAYS } from "../lib/licence";
import { Alert, CopyButton, Field } from "../components/ui";
import { useToast } from "../components/Toast";
import { DEVELOPER } from "../lib/developer";
import { shortDate } from "../lib/utils";

export function LicenceLockPage() {
  const { state, currentUser, activateLicence, logout } = useApp();
  const { push } = useToast();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const licence = licenceInfo(state.settings);
  const machineId = getMachineId();
  const trialStart =
    state.settings.trialStartedAt ?? state.settings.createdAt ?? "";
  const trialEnd = trialStart
    ? new Date(new Date(trialStart).getTime() + TRIAL_DAYS * 86400000)
    : null;

  function activate() {
    setError("");
    const result = activateLicence(key);
    if (!result.ok) {
      setError(result.message ?? "Could not activate this licence.");
      return;
    }
    push(result.message ?? "Licence activated.");
  }

  return (
    <div className="auth-shell" style={{ gridTemplateColumns: "1fr" }}>
      <main className="auth-panel">
        <div className="auth-card">
          <span className="badge badge-red">
            <ShieldAlert size={11} /> {licence.mode === "Expired" ? "Licence expired" : "Licence required"}
          </span>
          <h1 style={{ marginTop: 12 }}>This installation needs a licence</h1>
          <p className="sub">
            {state.settings.licenseExpiresAt
              ? `The licence for ${state.settings.companyName} expired on ${shortDate(state.settings.licenseExpiresAt)}.`
              : `${state.settings.companyName} completed its ${TRIAL_DAYS}-day trial on ${trialEnd ? shortDate(trialEnd.toISOString()) : "record"}.`}{" "}
            Your workshop data is safe. Enter the RAVsoft licence key for this installation to
            continue.
          </p>

          {error && (
            <div style={{ marginTop: 14 }}>
              <Alert tone="danger">{error}</Alert>
            </div>
          )}

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-body stack">
              <div className="kv">
                <span>Machine ID</span>
                <span className="mono" style={{ fontSize: 11 }}>
                  {machineId}
                </span>
              </div>
              <CopyButton value={machineId} label="Copy machine ID" />
              <div className="divider" />
              {currentUser?.isOwner ? (
                <>
                  <Field
                    label="Licence key"
                    hint="Format TRQ-YYYYMMDD-XXXXXXXX. Issued for this machine."
                  >
                    <input
                      className="input"
                      placeholder="TRQ-20271231-XXXXXXXX"
                      value={key}
                      onChange={(event) => setKey(event.target.value.toUpperCase())}
                    />
                  </Field>
                  <button className="btn btn-primary" onClick={activate}>
                    <KeyRound />
                    Activate licence
                  </button>
                </>
              ) : (
                <Alert tone="warn">
                  Ask the workshop owner to sign in and activate this installation. Staff access
                  returns as soon as the licence is active.
                </Alert>
              )}
              <a
                className="btn btn-secondary btn-sm"
                href={`mailto:${DEVELOPER.email}?subject=Torque ERP licence renewal&body=Machine ID: ${machineId}%0AWorkshop: ${state.settings.companyName}%0AExpired: ${state.settings.licenseExpiresAt ?? "trial"}`}
              >
                <Mail />
                Request a licence
              </a>
            </div>
          </div>

          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 12 }}
            onClick={logout}
          >
            <LogOut />
            Sign out
          </button>
        </div>
      </main>
    </div>
  );
}
