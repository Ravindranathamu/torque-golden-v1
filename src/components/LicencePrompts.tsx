import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, Clock3, Sparkles } from "lucide-react";
import { useApp } from "../state/AppStore";
import { licenceInfo, TRIAL_DAYS } from "../lib/licence";
import { FEATURE_FLAGS, featureFlagsFor } from "../lib/features";
import { shortDate } from "../lib/utils";
import { Modal } from "./ui";

const SNOOZE_KEY = "torque_trial_activation_prompt_v1";
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function readSnoozeUntil(): number {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeSnoozeUntil(value: number): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(value));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Owner-only licence nudges:
 *   * from day 15 of the 30-day trial, a daily activation prompt
 *   * a one-time thank-you after the portal activates the copy
 *
 * Both are mounted in the app shell so they also appear when the owner lands
 * on the dashboard after signing in.
 */
export function LicencePrompts() {
  const { state, currentUser, updateSettings } = useApp();
  const navigate = useNavigate();
  const [snoozeUntil, setSnoozeUntil] = useState(readSnoozeUntil);

  if (!currentUser?.isOwner) return null;
  const settings = state.settings;
  if (!settings.configured || settings.demoMode) return null;

  const licence = licenceInfo(settings);
  const trialElapsed = Math.max(0, TRIAL_DAYS - licence.daysLeft);
  const snoozed = snoozeUntil > Date.now();
  const showTrialPrompt =
    licence.mode === "Trial" && trialElapsed >= 14 && !snoozed;

  const showThankYou =
    licence.mode === "Active" &&
    Boolean(settings.licenseActivatedAt) &&
    settings.licenceActivationAcknowledgedAt !== settings.licenseActivatedAt;

  const purchasedModules = FEATURE_FLAGS.filter(
    (flag) => featureFlagsFor(settings)[flag.key],
  );

  function snooze() {
    const until = Date.now() + SNOOZE_MS;
    writeSnoozeUntil(until);
    setSnoozeUntil(until);
  }

  function openActivation() {
    snooze();
    navigate("/settings", { state: { tab: "licence" } });
  }

  return (
    <>
      <Modal
        open={showTrialPrompt}
        onClose={snooze}
        title="Your trial is still active"
        subtitle={`Day ${Math.min(trialElapsed + 1, TRIAL_DAYS)} of ${TRIAL_DAYS} · every module is unlocked`}
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={snooze}>
              Remind me tomorrow
            </button>
            <button className="btn btn-primary" onClick={openActivation}>
              Activate now
              <ArrowRight />
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="alert alert-brand">
            <Clock3 />
            <div>
              <strong>{licence.daysLeft} day{licence.daysLeft === 1 ? "" : "s"} left in your trial</strong>
              You still have full access to every module. Activate now so your workshop keeps
              working without interruption and only the modules on your order stay unlocked.
            </div>
          </div>
          <div className="tiny muted">
            Activation is completed by RAVBsoft after payment. Open Settings → Licence to send
            your installation ID or paste the activation key you receive.
          </div>
        </div>
      </Modal>

      <Modal
        open={showThankYou}
        onClose={() =>
          updateSettings({
            licenceActivationAcknowledgedAt: settings.licenseActivatedAt,
          })
        }
        title="Thank you — your copy is activated"
        subtitle="RAVBsoft has activated this installation"
        size="narrow"
        footer={
          <button
            className="btn btn-primary"
            onClick={() =>
              updateSettings({
                licenceActivationAcknowledgedAt: settings.licenseActivatedAt,
              })
            }
          >
            <BadgeCheck />
            Continue
          </button>
        }
      >
        <div className="stack">
          <div className="alert alert-ok">
            <Sparkles />
            <div>
              <strong>
                {licence.lifetime
                  ? "Lifetime licence — owned outright"
                  : `Licence active${settings.licenseExpiresAt ? ` until ${shortDate(settings.licenseExpiresAt)}` : ""}`}
              </strong>
              The trial reminder has been removed. Your data, users and settings are unchanged.
            </div>
          </div>
          <div>
            <div className="label">Modules on this licence</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              {purchasedModules.map((flag) => (
                <span key={flag.key} className="badge badge-green">
                  <BadgeCheck size={10} /> {flag.label}
                </span>
              ))}
              {purchasedModules.length === 0 && (
                <span className="tiny muted">All modules on this installation.</span>
              )}
            </div>
          </div>
          <div className="tiny muted">
            If a module you bought is missing, contact RAVBsoft with installation ID{" "}
            <strong>{settings.installationId}</strong>.
          </div>
        </div>
      </Modal>
    </>
  );
}
