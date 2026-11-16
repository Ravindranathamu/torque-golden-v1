import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Package,
  ShieldCheck,
} from "lucide-react";
import { hasDepartment, useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import { money, shortDate } from "../lib/utils";
import {
  EmptyState,
  Field,
  PageHeader,
  StatCard,
  StatusBadge,
} from "../components/ui";
import { useToast } from "../components/Toast";
import type { InsuranceClaim, JobCard } from "../types";

export function InsuranceDeskPage() {
  const {
    state,
    currentUser,
    updateInsuranceClaim,
    updatePartSalvage,
    settleInsuranceClaim,
  } = useApp();
  const { push } = useToast();
  const [salvageRefs, setSalvageRefs] = useState<Record<string, string>>({});

  const insuranceEnabled = featureEnabled(state.settings, "enable_insurance_module");
  const owner = Boolean(currentUser?.isOwner);
  const canSalvage =
    owner || hasDepartment(currentUser, "Supervisor") || hasDepartment(currentUser, "Stores");
  const canSettle =
    owner || hasDepartment(currentUser, "Cashier") || hasDepartment(currentUser, "Accounting");

  const jobFor = (claim: InsuranceClaim): JobCard | undefined =>
    state.jobCards.find((job) => job.id === claim.jobCardId);

  const released = (job?: JobCard) =>
    Boolean(job && (job.status === "Paid" || job.status === "Released on Credit"));

  const salvageQueue = useMemo(
    () =>
      state.insuranceJobs
        .filter((claim) => {
          const job = state.jobCards.find((entry) => entry.id === claim.jobCardId);
          return (
            released(job) &&
            claim.salvageStatus !== "Submitted" &&
            state.parts.some(
              (part) =>
                part.jobCardId === claim.jobCardId &&
                (part.salvageStatus === "Pending" || part.salvageStatus === "Submitted"),
            )
          );
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [state.insuranceJobs, state.jobCards, state.parts],
  );

  const chequeQueue = useMemo(
    () =>
      state.insuranceJobs
        .filter((claim) => {
          const job = state.jobCards.find((entry) => entry.id === claim.jobCardId);
          return released(job) && claim.status !== "Settled";
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [state.insuranceJobs, state.jobCards],
  );

  const chequesInSafe = chequeQueue
    .filter((claim) => claim.chequeAmount && !claim.chequeClearedAt)
    .reduce((sum, claim) => sum + (claim.chequeAmount ?? 0), 0);

  function submitSalvage(claim: InsuranceClaim) {
    const pending = state.parts.filter(
      (part) => part.jobCardId === claim.jobCardId && part.salvageStatus === "Pending",
    );
    if (pending.length > 0) {
      push("Mark every salvage part line as submitted first.", "error");
      return;
    }
    updateInsuranceClaim(claim.id, {
      salvageStatus: "Submitted",
      salvageSubmittedAt: new Date().toISOString(),
      salvageReference: salvageRefs[claim.id]?.trim() || claim.salvageReference,
    });
    push(`${claim.claimNo} salvage recorded as submitted.`);
  }

  function markPartSalvage(partId: string, name: string) {
    updatePartSalvage(partId, { status: "Submitted" });
    push(`${name} salvage marked submitted.`, "info");
  }

  function settle(claim: InsuranceClaim) {
    const result = settleInsuranceClaim(claim.id);
    if (!result.ok) {
      push(result.message ?? "Could not settle the claim.", "error");
      return;
    }
    push(`${claim.claimNo} settled. The cheque is cleared in the accounts.`);
  }

  if (!insuranceEnabled) {
    return (
      <div className="page">
        <PageHeader
          title="Insurance desk"
          subtitle="Salvage handover and insurer cheque settlement for released claims."
        />
        <EmptyState
          icon={<ShieldCheck size={22} />}
          title="Insurance module is off"
          message="The developer must enable the insurance module for this workshop before the insurance desk is available."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Insurance desk"
        subtitle="Post-release work that stays open after the vehicle leaves: salvage handover and insurer cheque settlement."
      />

      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <StatCard
          label="Salvage pending"
          value={String(salvageQueue.length)}
          meta="Released vehicles with parts awaiting handover"
          icon={<Package size={18} />}
        />
        <StatCard
          label="Cheques to settle"
          value={String(chequeQueue.length)}
          meta="Awaiting insurer payment or clearance"
          icon={<Banknote size={18} />}
        />
        <StatCard
          label="Cheques in safe"
          value={money(chequesInSafe)}
          meta="Recorded but not cleared"
          icon={<ClipboardCheck size={18} />}
        />
      </div>

      {canSalvage && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <div>
              <h3>Salvage submission</h3>
              <p>
                Supervisors and storekeepers confirm old parts handed to the assessor after
                the vehicle is released. Nothing is returned to the stores shelf.
              </p>
            </div>
          </div>
          <div className="card-body stack">
            {salvageQueue.length === 0 ? (
              <EmptyState
                icon={<Package size={22} />}
                title="No salvage pending"
                message="Released insurance vehicles with pending salvage will appear here."
              />
            ) : (
              salvageQueue.map((claim) => {
                const job = jobFor(claim);
                const insurer = state.insuranceCompanies.find(
                  (entry) => entry.id === claim.insurerId,
                );
                const parts = state.parts.filter(
                  (part) =>
                    part.jobCardId === claim.jobCardId &&
                    (part.salvageStatus === "Pending" ||
                      part.salvageStatus === "Submitted"),
                );
                const pending = parts.filter(
                  (part) => part.salvageStatus === "Pending",
                );
                return (
                  <div
                    key={claim.id}
                    className="card"
                    style={{ border: "1px solid var(--border)", boxShadow: "none" }}
                  >
                    <div className="card-body stack">
                      <div className="row-between wrap">
                        <div>
                          <strong>
                            {job?.vehicleNo ?? claim.jobCardId} · {claim.claimNo}
                          </strong>
                          <div className="tiny muted">
                            {insurer?.name ?? "Insurer"} · {job?.make} {job?.model} ·{" "}
                            {job?.customerName}
                          </div>
                        </div>
                        <StatusBadge status="Salvage Pending" />
                      </div>
                      <div className="table-wrap">
                        <table className="data">
                          <thead>
                            <tr>
                              <th>Part</th>
                              <th className="num">Qty</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {parts.map((part) => (
                              <tr key={part.id}>
                                <td>{part.itemName}</td>
                                <td className="num">{part.qtyIssued || part.qtyRequested}</td>
                                <td className="num">
                                  {part.salvageStatus === "Pending" ? (
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => markPartSalvage(part.id, part.itemName)}
                                    >
                                      <CheckCircle2 />
                                      Submitted
                                    </button>
                                  ) : (
                                    <StatusBadge status="Submitted" />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="row wrap" style={{ alignItems: "flex-end", gap: 10 }}>
                        <Field label="Salvage reference / handover note">
                          <input
                            className="input"
                            placeholder="Assessor receipt or handover note"
                            value={salvageRefs[claim.id] ?? claim.salvageReference ?? ""}
                            onChange={(event) =>
                              setSalvageRefs((prev) => ({
                                ...prev,
                                [claim.id]: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => submitSalvage(claim)}
                          disabled={pending.length > 0}
                        >
                          <CheckCircle2 />
                          Mark salvage submitted
                        </button>
                        <Link className="btn btn-ghost btn-sm" to={`/jobs/${claim.jobCardId}`}>
                          Open job
                        </Link>
                      </div>
                      {pending.length > 0 ? (
                        <div className="tiny muted">
                          {pending.length} part line(s) still pending. Confirm each line first.
                        </div>
                      ) : (
                        <div className="tiny muted">
                          All part lines confirmed. Enter the handover reference and mark the
                          claim salvage as submitted.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {canSettle && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Cheque & settlement</h3>
              <p>
                Cashier and accounting record the insurer cheque, wait for clearance and
                settle the claim. The vehicle is already released.
              </p>
            </div>
          </div>
          <div className="card-body stack">
            {chequeQueue.length === 0 ? (
              <EmptyState
                icon={<Banknote size={22} />}
                title="No cheques to settle"
                message="Released insurance claims awaiting payment will appear here."
              />
            ) : (
              chequeQueue.map((claim) => {
                const job = jobFor(claim);
                const insurer = state.insuranceCompanies.find(
                  (entry) => entry.id === claim.insurerId,
                );
                return (
                  <div
                    key={claim.id}
                    className="card"
                    style={{ border: "1px solid var(--border)", boxShadow: "none" }}
                  >
                    <div className="card-body stack">
                      <div className="row-between wrap">
                        <div>
                          <strong>
                            {job?.vehicleNo ?? claim.jobCardId} · {claim.claimNo}
                          </strong>
                          <div className="tiny muted">
                            {insurer?.name ?? "Insurer"} · release order{" "}
                            {claim.releaseOrderNo ?? "not recorded"}
                          </div>
                        </div>
                        <StatusBadge status={claim.status} />
                      </div>
                      <div className="kv">
                        <span>Insurance bill</span>
                        <span>{money(claim.insuranceBillAmount ?? 0)}</span>
                      </div>
                      <div className="kv">
                        <span>Cheque</span>
                        <span>
                          {claim.chequeNo
                            ? `${claim.chequeNo} · ${money(claim.chequeAmount ?? 0)} · ${
                                claim.chequeBank ?? ""
                              } ${claim.chequeBranch ?? ""}`
                            : "Not received"}
                        </span>
                      </div>
                      <div className="kv">
                        <span>Cheque status</span>
                        <span>
                          {claim.chequeClearedAt
                            ? `Cleared ${shortDate(claim.chequeClearedAt)}`
                            : claim.chequeStatus ?? "Not received"}
                        </span>
                      </div>
                      <div className="row wrap">
                        <Link
                          className="btn btn-secondary btn-sm"
                          to={`/jobs/${claim.jobCardId}`}
                        >
                          <FileText />
                          {claim.chequeNo ? "Cheque details" : "Record cheque"}
                        </Link>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => settle(claim)}
                          disabled={!claim.chequeAmount || claim.status === "Settled"}
                        >
                          <CheckCircle2 />
                          Settle claim
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
