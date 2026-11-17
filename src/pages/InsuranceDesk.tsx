import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Package,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { hasDepartment, useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import { dateOnly, money, shortDate } from "../lib/utils";
import {
  EmptyState,
  Field,
  Modal,
  PageHeader,
  StatCard,
  StatusBadge,
} from "../components/ui";
import { useToast } from "../components/Toast";
import type { CustomerCheque, InsuranceClaim, JobCard } from "../types";

export function InsuranceDeskPage() {
  const {
    state,
    currentUser,
    updateInsuranceClaim,
    updatePartSalvage,
    recordInsuranceCheque,
    updateCustomerChequeStatus,
  } = useApp();
  const { push } = useToast();
  const [salvageRefs, setSalvageRefs] = useState<Record<string, string>>({});
  const [chequeClaimId, setChequeClaimId] = useState<string | null>(null);
  const [chequeNo, setChequeNo] = useState("");
  const [chequeAmount, setChequeAmount] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeBranch, setChequeBranch] = useState("");
  const [chequeDate, setChequeDate] = useState(dateOnly(new Date().toISOString()));
  const [chequeAccountId, setChequeAccountId] = useState("");
  const [chequeAction, setChequeAction] = useState<{
    cheque: CustomerCheque;
    next: CustomerCheque["status"];
  } | null>(null);
  const [actionAccountId, setActionAccountId] = useState("");
  const [bounceReason, setBounceReason] = useState("");

  const insuranceEnabled = featureEnabled(state.settings, "enable_insurance_module");
  const owner = Boolean(currentUser?.isOwner);
  const canSalvage =
    owner || hasDepartment(currentUser, "Supervisor") || hasDepartment(currentUser, "Stores");
  const canSettle =
    owner || hasDepartment(currentUser, "Cashier") || hasDepartment(currentUser, "Accounting");

  const jobFor = (claim: InsuranceClaim): JobCard | undefined =>
    state.jobCards.find((job) => job.id === claim.jobCardId);

  const released = (job?: JobCard) =>
    Boolean(
      job &&
        (job.status === "Paid" ||
          job.status === "Released on Credit" ||
          job.status === "Dispatched"),
    );

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

  const chequesInSafe = state.customerCheques
    .filter(
      (cheque) => cheque.source === "Insurance" && cheque.status === "In_Safe",
    )
    .reduce((sum, cheque) => sum + cheque.amount, 0);

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

  const chequeClaim =
    state.insuranceJobs.find((claim) => claim.id === chequeClaimId) ?? null;

  function chequeFor(claim: InsuranceClaim): CustomerCheque | undefined {
    return (
      state.customerCheques.find((cheque) => cheque.id === claim.chequeId) ??
      state.customerCheques
        .filter((cheque) => cheque.insuranceClaimId === claim.id)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0]
    );
  }

  function openRecordCheque(claim: InsuranceClaim) {
    setChequeClaimId(claim.id);
    setChequeNo(claim.chequeNo ?? "");
    setChequeAmount(
      String(claim.chequeAmount ?? claim.insuranceBillAmount ?? ""),
    );
    setChequeBank("");
    setChequeBranch("");
    setChequeDate(dateOnly(new Date().toISOString()));
    setChequeAccountId(
      state.bankAccounts.find((account) => account.active)?.id ?? "",
    );
  }

  function saveCheque() {
    if (!chequeClaim) return;
    const amount = Number(chequeAmount);
    if (!chequeNo.trim()) {
      push("Enter the insurer cheque number.", "error");
      return;
    }
    if (!chequeBank.trim() || !chequeBranch.trim()) {
      push("Enter the issuing bank and branch.", "error");
      return;
    }
    if (!chequeDate) {
      push("Enter the cheque date.", "error");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      push("Enter a valid cheque amount.", "error");
      return;
    }
    const result = recordInsuranceCheque(chequeClaim.id, {
      chequeNo: chequeNo.trim(),
      amount,
      bank: chequeBank.trim(),
      branch: chequeBranch.trim(),
      chequeDate,
      bankAccountId: chequeAccountId || undefined,
    });
    if (!result.ok) {
      push(result.message ?? "Could not record the cheque.", "error");
      return;
    }
    push(
      "Insurer cheque recorded and held in safe. Mark it realized only after the bank clears the funds.",
    );
    setChequeClaimId(null);
  }

  function openChequeAction(cheque: CustomerCheque, next: CustomerCheque["status"]) {
    setChequeAction({ cheque, next });
    setActionAccountId(cheque.bankAccountId ?? state.bankAccounts[0]?.id ?? "");
    setBounceReason(cheque.bounceReason ?? "");
  }

  function saveChequeAction() {
    if (!chequeAction) return;
    if (chequeAction.next === "Bounced" && !bounceReason.trim()) {
      push("Enter the bank bounce reason.", "error");
      return;
    }
    if (chequeAction.next === "Cleared" && !actionAccountId) {
      push("Choose the bank account where the funds were realized.", "error");
      return;
    }
    const result = updateCustomerChequeStatus(
      chequeAction.cheque.id,
      chequeAction.next,
      chequeAction.next === "Bounced" ? bounceReason.trim() : undefined,
      actionAccountId || undefined,
    );
    if (!result.ok) {
      push(result.message ?? "Could not update the cheque.", "error");
      return;
    }
    push(
      chequeAction.next === "Bounced"
        ? "Cheque marked bounced. The claim is awaiting a replacement cheque."
        : chequeAction.next === "Cleared"
          ? "Cheque realized. The insurance claim is now marked settled and posted to the ledger."
          : "Cheque marked deposited. Mark it realized after bank clearance.",
    );
    setChequeAction(null);
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
                Cashier and accounting record the insurer cheque after the vehicle is sent, then
                mark the claim settled only when the cheque is realized by the bank.
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
                const cheque = chequeFor(claim);
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
                        <div className="row wrap" style={{ gap: 6 }}>
                          {cheque && (
                            <StatusBadge
                              status={cheque.status.replaceAll("_", " ")}
                            />
                          )}
                          <StatusBadge status={claim.status} />
                        </div>
                      </div>
                      <div className="grid cols-3" style={{ gap: 10 }}>
                        <div className="mini-stat card">
                          <div className="label">Insurance bill</div>
                          <div className="value" style={{ fontSize: 15 }}>
                            {money(claim.insuranceBillAmount ?? 0)}
                          </div>
                          <div className="meta">{claim.insuranceBillNo ?? "Not billed"}</div>
                        </div>
                        <div className="mini-stat card">
                          <div className="label">Cheque received</div>
                          <div className="value" style={{ fontSize: 15 }}>
                            {cheque ? money(cheque.amount) : "—"}
                          </div>
                          <div className="meta">
                            {cheque
                              ? `${cheque.chequeNo} · ${cheque.bank}`
                              : "Not received"}
                          </div>
                        </div>
                        <div className="mini-stat card">
                          <div className="label">Cheque status</div>
                          <div className="value" style={{ fontSize: 15 }}>
                            {cheque
                              ? cheque.status.replaceAll("_", " ")
                              : "Awaiting cheque"}
                          </div>
                          <div className="meta">
                            {cheque?.clearedAt
                              ? `Realized ${shortDate(cheque.clearedAt)}`
                              : cheque
                                ? `Dated ${shortDate(cheque.chequeDate)}`
                                : "Settlement waits for realization"}
                          </div>
                        </div>
                      </div>
                      {cheque?.bounceReason && (
                        <div className="alert alert-warn">
                          <XCircle />
                          <div>
                            Cheque bounced: {cheque.bounceReason}. Record a replacement cheque from
                            the insurer.
                          </div>
                        </div>
                      )}
                      <div className="row wrap">
                        {(!cheque || cheque.status === "Bounced") && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openRecordCheque(claim)}
                          >
                            <Banknote />
                            {cheque ? "Record replacement cheque" : "Record cheque"}
                          </button>
                        )}
                        {cheque?.status === "In_Safe" && (
                          <button
                            className="btn btn-soft btn-sm"
                            onClick={() => openChequeAction(cheque, "Deposited")}
                          >
                            <ClipboardCheck />
                            Mark deposited
                          </button>
                        )}
                        {(cheque?.status === "In_Safe" ||
                          cheque?.status === "Deposited") && (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => openChequeAction(cheque, "Cleared")}
                            >
                              <CheckCircle2 />
                              Mark realized & settle
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => openChequeAction(cheque, "Bounced")}
                            >
                              <XCircle />
                              Bounce
                            </button>
                          </>
                        )}
                        <Link
                          className="btn btn-ghost btn-sm"
                          to={`/jobs/${claim.jobCardId}`}
                        >
                          <FileText />
                          Open job
                        </Link>
                      </div>
                      <div className="tiny muted">
                        {cheque?.clearedAt
                          ? `Cheque realized ${shortDate(cheque.clearedAt)}. The claim is settled.`
                          : cheque
                            ? "The vehicle is already released. The claim stays open until this cheque is realized by the bank."
                            : "The vehicle is already released. Record the cheque when the insurer sends it."}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(chequeClaim)}
        onClose={() => setChequeClaimId(null)}
        title="Record insurer cheque"
        subtitle={
          chequeClaim
            ? `${jobFor(chequeClaim)?.vehicleNo ?? chequeClaim.jobCardId} · ${chequeClaim.claimNo}`
            : undefined
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setChequeClaimId(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveCheque}>
              <Banknote />
              Record cheque
            </button>
          </>
        }
      >
        {chequeClaim && (
          <div className="stack">
            <div className="kv">
              <span>Insurance bill</span>
              <span>
                {chequeClaim.insuranceBillAmount
                  ? money(chequeClaim.insuranceBillAmount)
                  : "Not billed"}
              </span>
            </div>
            <div className="kv">
              <span>Release order</span>
              <span>{chequeClaim.releaseOrderNo ?? "Not recorded"}</span>
            </div>
            <div className="form-grid">
              <Field label="Cheque number" required>
                <input
                  className="input"
                  value={chequeNo}
                  onChange={(event) => setChequeNo(event.target.value)}
                />
              </Field>
              <Field label="Cheque amount (LKR)" required>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={chequeAmount}
                  onChange={(event) => setChequeAmount(event.target.value)}
                />
              </Field>
              <Field label="Bank" required>
                <input
                  className="input"
                  placeholder="Issuing bank"
                  value={chequeBank}
                  onChange={(event) => setChequeBank(event.target.value)}
                />
              </Field>
              <Field label="Branch" required>
                <input
                  className="input"
                  placeholder="Branch"
                  value={chequeBranch}
                  onChange={(event) => setChequeBranch(event.target.value)}
                />
              </Field>
              <Field label="Cheque date" required hint="Post-dated cheques stay in safe until deposit.">
                <input
                  className="input"
                  type="date"
                  value={chequeDate}
                  onChange={(event) => setChequeDate(event.target.value)}
                />
              </Field>
              <Field label="Deposit account">
                <select
                  className="select"
                  value={chequeAccountId}
                  onChange={(event) => setChequeAccountId(event.target.value)}
                >
                  <option value="">No account</option>
                  {state.bankAccounts
                    .filter((account) => account.active)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <div className="alert alert-info">
              <Banknote />
              <div>
                Recording the cheque does not settle the claim. The claim is marked settled only
                when the cheque is realized and posted to the selected bank account.
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(chequeAction)}
        onClose={() => setChequeAction(null)}
        title={
          chequeAction
            ? `Mark cheque ${chequeAction.cheque.chequeNo} ${
                chequeAction.next === "Cleared"
                  ? "realized"
                  : chequeAction.next.toLowerCase()
              }`
            : "Update cheque"
        }
        subtitle={
          chequeAction
            ? `${chequeAction.cheque.customerName} · ${money(chequeAction.cheque.amount)}`
            : undefined
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setChequeAction(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveChequeAction}>
              Save status
            </button>
          </>
        }
      >
        {chequeAction && (
          <div className="stack">
            {chequeAction.next !== "Bounced" && (
              <Field
                label="Bank account"
                required={chequeAction.next === "Cleared"}
                hint={
                  chequeAction.next === "Deposited"
                    ? "Where the cheque will be deposited."
                    : "Where the cleared funds landed."
                }
              >
                <select
                  className="select"
                  value={actionAccountId}
                  onChange={(event) => setActionAccountId(event.target.value)}
                >
                  <option value="">No account</option>
                  {state.bankAccounts
                    .filter((account) => account.active)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {chequeAction.next === "Bounced" && (
              <Field label="Bounce reason" required>
                <input
                  className="input"
                  placeholder="Insufficient funds / signature mismatch"
                  value={bounceReason}
                  onChange={(event) => setBounceReason(event.target.value)}
                />
              </Field>
            )}
            <div className="alert alert-info">
              <CheckCircle2 />
              <div>
                {chequeAction.next === "Cleared"
                  ? "Realizing the cheque posts the insurance settlement to the ledger and marks the claim settled."
                  : chequeAction.next === "Bounced"
                    ? "The claim goes back to Awaiting Payment so a replacement cheque can be recorded."
                    : "The cheque remains open until it is realized by the bank."}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
