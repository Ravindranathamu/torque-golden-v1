import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FolderOpen,
  Gauge,
  KeyRound,
  Loader2,
  MessageCircle,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  XCircle,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import { acceptanceMessage, handoverMessage } from "../lib/messages";
import { compressPhoto } from "../lib/branding";
import { autoWhatsAppEnabled } from "../lib/whatsapp";
import { jobTotals, money, shortDate, timeAgo, waLink, checkInUrl as buildCheckInUrl } from "../lib/utils";
import {
  Alert,
  CopyButton,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  StatusBadge,
  Tabs,
} from "../components/ui";
import { useToast } from "../components/Toast";
import type { CheckIn, DamagePhoto, DriverCommission, JobCard, JobIntakeType } from "../types";

const repairTypes = [
  "Periodic Service",
  "Brake System",
  "AC Repair",
  "Engine Repair",
  "Suspension & Steering",
  "Electrical",
  "Body & Paint",
  "Hybrid Battery",
  "Full Inspection",
  "Other",
];

type GateTab = "pending" | "clearance";

export function GatePage() {
  const { state, currentUser, acceptCheckIn, rejectCheckIn, dispatchJob, overrideBillingGate } = useApp();
  const { push } = useToast();
  const [tab, setTab] = useState<GateTab>("pending");
  const [accepting, setAccepting] = useState<CheckIn | null>(null);
  const [intakeType, setIntakeType] = useState<JobIntakeType>("Repair");
  const [repairType, setRepairType] = useState("Periodic Service");
  const [acceptSectionIds, setAcceptSectionIds] = useState<string[]>([]);
  const [safetyNotes, setSafetyNotes] = useState("");
  const [photos, setPhotos] = useState<DamagePhoto[]>([]);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverBasis, setDriverBasis] = useState<DriverCommission["basis"]>("Labour");
  const [driverType, setDriverType] = useState<DriverCommission["type"]>("Percentage");
  const [driverValue, setDriverValue] = useState("");
  const [driverOpen, setDriverOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [acceptedJobId, setAcceptedJobId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<CheckIn | null>(null);
  const [dispatchTarget, setDispatchTarget] = useState<JobCard | null>(null);
  const [handoverJob, setHandoverJob] = useState<JobCard | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTargetId, setOverrideTargetId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [qrData, setQrData] = useState("");

  const pending = state.checkIns.filter((checkIn) => checkIn.status === "Awaiting Approval");
  const clearance = state.jobCards
    .filter(
      (job) =>
        job.status === "Paid" ||
        (job.status === "Released on Credit" &&
          Boolean(job.exitApprovedAt) &&
          (!job.partPaymentAt || Boolean(job.releaseApprovedAt))),
    )
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  const canOverride = Boolean(
    currentUser &&
      (currentUser.isOwner || currentUser.departments.includes("Cashier")),
  );
  const billingQueue = state.jobCards
    .filter((job) => job.status === "Repair Completed")
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
  const pendingReleases = state.jobCards
    .filter((job) => job.status === "Awaiting Release Approval")
    .sort((a, b) =>
      (a.releaseApprovalRequestedAt ?? "").localeCompare(
        b.releaseApprovalRequestedAt ?? "",
      ),
    );
  const cashierExits = state.jobCards
    .filter(
      (job) =>
        job.status === "Released on Credit" &&
        Boolean(job.releaseApprovedAt || !job.partPaymentAt) &&
        !job.exitApprovedAt,
    )
    .sort((a, b) =>
      (b.releaseApprovedAt ?? "").localeCompare(a.releaseApprovedAt ?? ""),
    );
  const acceptedJob = state.jobCards.find((job) => job.id === acceptedJobId) ?? null;

  const nextNumeric = state.jobCards.reduce((max, job) => Math.max(max, job.numericId), 1000) + 1;
  const checkInUrl = buildCheckInUrl(state.settings);
  const qrPosterUrl = useMemo(() => checkInUrl, [checkInUrl]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrPosterUrl, {
      width: 360,
      margin: 1,
      color: { dark: state.settings.brandColor || "#0f766e", light: "#ffffff" },
    })
      .then((data) => {
        if (!cancelled) setQrData(data);
      })
      .catch(() => {
        if (!cancelled) setQrData("");
      });
    return () => {
      cancelled = true;
    };
  }, [qrPosterUrl, state.settings.brandColor]);

  const sectionsEnabled =
    featureEnabled(state.settings, "enable_multi_sections") && state.sections.length > 0;
  const activeSections = state.sections.filter((section) => section.active);

  function suggestedSectionIds(type: string): string[] {
    const text = type.toLowerCase();
    if (text.includes("body") || text.includes("paint") || text.includes("accident")) {
      return activeSections
        .filter((section) => /paint|body/i.test(`${section.name} ${section.code}`))
        .map((section) => section.id);
    }
    if (text.includes("ac") || text.includes("electrical") || text.includes("hybrid")) {
      return activeSections
        .filter((section) => /electrical|hybrid/i.test(`${section.name} ${section.code}`))
        .map((section) => section.id);
    }
    if (text.includes("service") || text.includes("periodic")) {
      return activeSections
        .filter((section) => /service|bay/i.test(`${section.name} ${section.code}`))
        .map((section) => section.id);
    }
    return activeSections
      .filter((section) => /mechanical/i.test(`${section.name} ${section.code}`))
      .map((section) => section.id);
  }

  function openAccept(checkIn: CheckIn) {
    setAccepting(checkIn);
    setIntakeType("Repair");
    const suggestedRepair = checkIn.vehicleNo === "WP CAB-5521" ? "AC Repair" : "Periodic Service";
    setRepairType(suggestedRepair);
    setAcceptSectionIds(suggestedSectionIds(suggestedRepair));
    setSafetyNotes("");
    setPhotos([]);
    setDriverName(checkIn.driverName ?? "");
    setDriverPhone(checkIn.driverPhone ?? "");
    setDriverBasis(checkIn.driverBasis ?? "Labour");
    setDriverType(checkIn.driverType ?? "Percentage");
    setDriverValue(checkIn.driverValue ? String(checkIn.driverValue) : "");
    setDriverOpen(Boolean(checkIn.driverName));
  }

  function toggleDriver(open: boolean) {
    setDriverOpen(open);
    if (!open) {
      setDriverName("");
      setDriverPhone("");
      setDriverValue("");
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = 6 - photos.length;
    if (room <= 0) {
      push("You can attach up to 6 inspection photos.", "error");
      return;
    }
    setUploading(true);
    try {
      const selected = Array.from(files).slice(0, room);
      const compressed = await Promise.all(
        selected.map(async (file) => ({
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name.replace(/\.[^.]+$/, ""),
          dataUrl: await compressPhoto(file, 1400),
        })),
      );
      setPhotos((prev) => [...prev, ...compressed]);
      push(`${compressed.length} photo${compressed.length === 1 ? "" : "s"} attached.`);
    } catch {
      push("One of those photos could not be read.", "error");
    } finally {
      setUploading(false);
    }
  }

  function confirmAccept() {
    if (!accepting) return;
    if (!repairType) {
      push("Choose the repair type.", "error");
      return;
    }
    if (!safetyNotes.trim()) {
      push("Add the safety / damage notes seen at inspection.", "error");
      return;
    }
    const driverAmount = Number(driverValue);
    const driverEnabled = featureEnabled(state.settings, "enable_driver_commissions");
    if (driverEnabled && driverOpen && driverName.trim() && !driverPhone.trim()) {
      push("Enter the driver's phone number or clear the driver name.", "error");
      return;
    }
    if (
      driverEnabled &&
      driverOpen &&
      driverName.trim() &&
      (!Number.isFinite(driverAmount) || driverAmount <= 0)
    ) {
      push("Enter a valid driver commission value.", "error");
      return;
    }
    if (sectionsEnabled && activeSections.length > 0 && acceptSectionIds.length === 0) {
      push("Select at least one workshop section for this job.", "error");
      return;
    }
    const driver: DriverCommission | undefined =
      driverEnabled && driverOpen && driverName.trim()
        ? {
            name: driverName.trim(),
            phone: driverPhone.trim(),
            basis: driverBasis,
            type: driverType,
            value: driverAmount,
          }
        : undefined;
    const result = acceptCheckIn(accepting.id, {
      repairType,
      safetyNotes: safetyNotes.trim(),
      photos,
      intakeType,
      driver,
      sectionIds: sectionsEnabled ? acceptSectionIds : [],
    });
    if (!result.ok) {
      push(result.message ?? "Could not accept this check-in.", "error");
      return;
    }
    setAcceptedJobId(result.jobId ?? null);
    setAccepting(null);
    push(
      `${accepting.vehicleNo} accepted as ${intakeType === "Estimate" ? "an estimate" : "a repair"}.`,
    );
  }

  function confirmReject() {
    if (!rejectTarget) return;
    rejectCheckIn(rejectTarget.id);
    push(`${rejectTarget.vehicleNo} check-in rejected.`, "info");
    setRejectTarget(null);
  }

  function confirmDispatch() {
    if (!dispatchTarget) return;
    const job = dispatchTarget;
    const result = dispatchJob(job.id);
    if (!result.ok) {
      push(result.message ?? "The vehicle could not be handed over.", "error");
      return;
    }
    setHandoverJob(job);
    setDispatchTarget(null);
    push(result.message ?? `${job.vehicleNo} released through the gate.`);
  }

  function openOverride() {
    setOverrideTargetId(billingQueue[0]?.id ?? "");
    setOverrideReason("");
    setOverrideOpen(true);
  }

  function submitOverride() {
    if (!overrideTargetId) {
      push("Choose the vehicle waiting for billing.", "error");
      return;
    }
    const targetJob = state.jobCards.find((entry) => entry.id === overrideTargetId);
    const result = overrideBillingGate(overrideTargetId, overrideReason);
    if (!result.ok) {
      push(result.message ?? "The override could not be recorded.", "error");
      return;
    }
    push(
      `${targetJob?.vehicleNo ?? "Vehicle"} released on cashier override. Owner, PRO and accounts notified.`,
    );
    setOverrideOpen(false);
    setOverrideReason("");
    setTab("clearance");
  }

  return (
    <div className="page">
      <PageHeader
        title="Gate & PRO"
        subtitle="Receive vehicles, document their condition, and control what leaves the workshop."
        actions={
          <>
            <Tabs<GateTab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "pending", label: "At the gate", count: pending.length },
                { id: "clearance", label: "Gate clearance", count: clearance.length },
              ]}
            />
            <a className="btn btn-secondary" href={`/check-in/${state.settings.qrSlug}`} target="_blank" rel="noreferrer">
              <QrCode />
              Open check-in form
            </a>
          </>
        }
      />

      {tab === "pending" ? (
        <div className="grid cols-3">
          <div className="span-2 stack">
            {pending.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon={<CheckCircle2 size={22} />}
                  title="The gate is clear"
                  message="New QR check-ins will appear here instantly. Share the check-in link or QR poster with customers."
                  action={
                    <button className="btn btn-secondary" onClick={() => setTab("clearance")}>
                      Review gate clearance
                      <ArrowRight />
                    </button>
                  }
                />
              </div>
            ) : (
              pending.map((checkIn) => {
                const history = state.jobCards.filter((job) => job.vehicleNo === checkIn.vehicleNo);
                return (
                  <div className="card" key={checkIn.id}>
                    <div className="card-head">
                      <div className="row" style={{ gap: 11 }}>
                        <span
                          className="part-icon"
                          style={{ width: 42, height: 42, flex: "0 0 42px", background: "var(--brand-soft)", color: "var(--brand)" }}
                        >
                          <KeyRound size={18} />
                        </span>
                        <div>
                          <div className="row wrap" style={{ gap: 7 }}>
                            <h3 style={{ fontSize: 17, letterSpacing: "-0.02em", fontWeight: 800 }}>
                              {checkIn.vehicleNo}
                            </h3>
                            {history.length > 0 && (
                              <span className="badge badge-brand">
                                <Sparkles size={10} /> Returning vehicle
                              </span>
                            )}
                          </div>
                          <p>
                            {checkIn.make} {checkIn.model} · checked in {timeAgo(checkIn.createdAt)} ·{" "}
                            {checkIn.id}
                          </p>
                        </div>
                      </div>
                      <span className="badge badge-amber">Awaiting approval</span>
                    </div>
                    <div className="card-body">
                      <div className="grid cols-2" style={{ gap: 12 }}>
                        <div className="row" style={{ gap: 8, fontSize: 12.3 }}>
                          <UserRound size={14} className="muted" />
                          <span>{checkIn.customerName}</span>
                        </div>
                        <div className="row" style={{ gap: 8, fontSize: 12.3 }}>
                          <Phone size={14} className="muted" />
                          <span>{checkIn.phone}</span>
                        </div>
                        <div className="row" style={{ gap: 8, fontSize: 12.3 }}>
                          <Gauge size={14} className="muted" />
                          <span>{checkIn.mileage.toLocaleString()} km</span>
                        </div>
                        <div className="row" style={{ gap: 8, fontSize: 12.3 }}>
                          <Camera size={14} className="muted" />
                          <span>{photos.length ? "Photos ready" : "No inspection photos yet"}</span>
                        </div>
                      </div>
                      {checkIn.address && (
                        <div className="tiny muted" style={{ marginTop: 10 }}>
                          {checkIn.address}
                        </div>
                      )}
                      <div className="divider" />
                      <div className="row-between wrap">
                        <span className="tiny muted">
                          {history.length > 0
                            ? `${history.length} previous visit${history.length === 1 ? "" : "s"} on record — customer details auto-filled.`
                            : "First recorded visit for this vehicle."}
                        </span>
                        <div className="row wrap">
                          <button className="btn btn-danger-soft btn-sm" onClick={() => setRejectTarget(checkIn)}>
                            <XCircle />
                            Reject
                          </button>
                          <button className="btn btn-primary" onClick={() => openAccept(checkIn)}>
                            <ShieldCheck />
                            Inspect & accept
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Customer check-in QR</h3>
                  <p>Print or share this link at the entrance.</p>
                </div>
                <QrCode size={17} className="muted" />
              </div>
              <div className="card-body">
                <div className="qr-box" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                  {qrData ? (
                    <img src={qrData} alt={`QR check-in for ${state.settings.companyName}`} />
                  ) : (
                    <div style={{ width: 152, height: 152, borderRadius: 12, background: "#f1f5f9" }} />
                  )}
                  <div className="qr-copy" style={{ width: "100%" }}>
                    <div className="label">Public check-in link</div>
                    <div className="copy-field">
                      <input className="input" readOnly value={checkInUrl} />
                      <CopyButton value={checkInUrl} label="Copy" />
                    </div>
                    <div className="row wrap" style={{ marginTop: 8 }}>
                      {qrData && (
                        <a
                          className="btn btn-secondary btn-sm"
                          href={qrData}
                          download={`${state.settings.qrSlug || "workshop"}-check-in-qr.png`}
                        >
                          <QrCode />
                          Download QR
                        </a>
                      )}
                      <a className="btn btn-ghost btn-sm" href={checkInUrl} target="_blank" rel="noreferrer">
                        <ExternalLink />
                        Preview
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Gate protocol</h3>
                  <p>Same standard for every vehicle.</p>
                </div>
              </div>
              <div className="card-body stack" style={{ gap: 12 }}>
                {[
                  ["Verify plate & mileage", "Match the QR check-in to the physical vehicle."],
                  ["Photograph existing damage", "Upload clear photos before acceptance."],
                  ["Choose the repair type", "This guides the supervisor and parts fitment."],
                  ["WhatsApp the receiving note", "The customer gets the job number instantly."],
                ].map(([title, text], index) => (
                  <div className="row" style={{ alignItems: "flex-start", gap: 10 }} key={title}>
                    <span className="chip brand" style={{ width: 20, height: 20, justifyContent: "center", padding: 0 }}>
                      {index + 1}
                    </span>
                    <div>
                      <div className="small strong">{title}</div>
                      <div className="tiny muted">{text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="stack">
          <Alert tone="info" title="Gate clearance is controlled by billing">
            A vehicle can only be handed over after the cashier records full payment, an
            approved credit release, or a part payment approved by the owner or accounting and
            then confirmed for exit by the cashier. A supervisor cannot bypass this, and the PRO
            cannot override billing — only the cashier or owner can record a reasoned override when
            the owner accepts the risk.
          </Alert>
          {pendingReleases.length > 0 && (
            <Alert tone="warn" title="Part-payment releases waiting for approval">
              <div className="stack" style={{ gap: 6 }}>
                {pendingReleases.map((job) => (
                  <div className="row-between wrap" key={job.id}>
                    <span>
                      <strong>{job.vehicleNo}</strong> · {job.customerName} ·{" "}
                      {money(job.partPaymentCredit ?? 0)} on credit ({job.id})
                    </span>
                    <span className="tiny muted">
                      Owner / accounting approve in Accounting; the cashier then confirms the exit
                    </span>
                  </div>
                ))}
              </div>
            </Alert>
          )}
          {cashierExits.length > 0 && (
            <Alert tone="info" title="Approved part-payment releases — cashier exit pending">
              <div className="stack" style={{ gap: 6 }}>
                {cashierExits.map((job) => (
                  <div className="row-between wrap" key={job.id}>
                    <span>
                      <strong>{job.vehicleNo}</strong> · {job.customerName} ·{" "}
                      {money(job.partPaymentCredit ?? 0)} on credit ({job.id})
                    </span>
                    <span className="tiny muted">
                      Cashier must approve the exit from Paid &amp; released
                    </span>
                  </div>
                ))}
              </div>
            </Alert>
          )}
          {canOverride && (
            <div className="row wrap" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-secondary btn-sm" onClick={openOverride}>
                <ShieldCheck size={14} />
                Cashier billing override
                {billingQueue.length > 0 && <span className="chip">{billingQueue.length}</span>}
              </button>
            </div>
          )}

          {clearance.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<ShieldCheck size={22} />}
                title="No vehicles waiting for handover"
                message="Paid jobs and completed credit releases appear here. Part-payment releases wait for the cashier's exit approval before the PRO can hand them over."
                action={
                  <Link className="btn btn-secondary" to="/cashier">
                    Open billing queue
                    <ArrowRight />
                  </Link>
                }
              />
            </div>
          ) : (
            clearance.map((job) => {
              const totals = jobTotals(job, state.tasks, state.parts, state.workers);
              const credit = state.customerCredits.find((entry) => entry.jobCardId === job.id);
              return (
                <div className="card" key={job.id}>
                  <div className="card-head">
                    <div className="row" style={{ gap: 11 }}>
                      <span
                        className="part-icon"
                        style={{ width: 42, height: 42, flex: "0 0 42px", background: "var(--brand-soft)", color: "var(--brand)" }}
                      >
                        <KeyRound size={18} />
                      </span>
                      <div>
                        <div className="row wrap" style={{ gap: 7 }}>
                          <h3 style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: "-0.02em" }}>
                            {job.vehicleNo}
                          </h3>
                          <StatusBadge status={job.status} />
                          {job.billingOverrideReason && (
                            <span className="badge badge-amber">Cashier override</span>
                          )}
                        </div>
                        <p>
                          {job.make} {job.model} · {job.customerName} · {job.id}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="strong" style={{ fontSize: 16 }}>{money(totals.total)}</div>
                      <div className="tiny muted">
                        {job.billingOverrideReason ? (
                          <>
                            Override by {job.billingOverrideBy}: {job.billingOverrideReason}
                          </>
                        ) : job.paymentMethod === "Credit" &&
                          credit &&
                          credit.status !== "Settled" ? (
                          `Credit due ${shortDate(credit.dueDate)}`
                        ) : (
                          `Paid ${job.paidAt ? timeAgo(job.paidAt) : ""}`
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="row-between wrap">
                      <div className="row wrap small muted">
                        <span>
                          <Phone size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                          {job.phone}
                        </span>
                        <span>·</span>
                        <span>{job.repairType}</span>
                        <span>·</span>
                        <span>{job.mileage.toLocaleString()} km</span>
                      </div>
                      <div className="row wrap">
                        <a
                          className="btn btn-ghost btn-sm"
                          href={waLink(job.phone, handoverMessage(job, state.settings))}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle />
                          Message customer
                        </a>
                        <button className="btn btn-primary" onClick={() => setDispatchTarget(job)}>
                          <KeyRound />
                          Hand over & open gate
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <Modal
        open={Boolean(accepting)}
        onClose={() => setAccepting(null)}
        title="Gate inspection & acceptance"
        subtitle={
          accepting
            ? `${accepting.vehicleNo} · ${accepting.make} ${accepting.model} · ${accepting.customerName}`
            : undefined
        }
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAccepting(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmAccept}>
              <ShieldCheck />
              Accept & create job card
            </button>
          </>
        }
      >
        {accepting && (
          <div className="stack">
            <div className="grid cols-3">
              <div className="mini-stat card">
                <div className="label">Customer</div>
                <div className="value" style={{ fontSize: 14 }}>{accepting.customerName}</div>
                <div className="meta">{accepting.phone}</div>
              </div>
              <div className="mini-stat card">
                <div className="label">Vehicle</div>
                <div className="value" style={{ fontSize: 14 }}>{accepting.make} {accepting.model}</div>
                <div className="meta">{accepting.vehicleNo}</div>
              </div>
              <div className="mini-stat card">
                <div className="label">Mileage</div>
                <div className="value" style={{ fontSize: 14 }}>{accepting.mileage.toLocaleString()} km</div>
                <div className="meta">Check-in {accepting.id}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-body stack">
                <div>
                  <label className="label">Accept as</label>
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      className={`btn ${intakeType === "Repair" ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setIntakeType("Repair")}
                    >
                      Repair job
                    </button>
                    {featureEnabled(state.settings, "enable_estimates_module") && (
                      <button
                        type="button"
                        className={`btn ${intakeType === "Estimate" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setIntakeType("Estimate")}
                      >
                        Estimate only
                      </button>
                    )}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 6 }}>
                    {intakeType === "Estimate"
                      ? "The vehicle is checked in and the supervisor prepares a quotation before work starts."
                      : "The supervisor can assign labour and parts immediately."}
                  </div>
                </div>

                {featureEnabled(state.settings, "enable_driver_commissions") && (
                  <>
                    <div className="divider" />
                    <div>
                      <button
                        type="button"
                        aria-expanded={driverOpen}
                        onClick={() => toggleDriver(!driverOpen)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "10px 12px",
                          border: `1px solid ${driverOpen ? "var(--brand)" : "var(--line)"}`,
                          borderRadius: 10,
                          background: driverOpen ? "var(--brand-soft)" : "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span className="row" style={{ gap: 8 }}>
                          <UserRound size={15} />
                          <strong style={{ fontSize: 13 }}>Driver commission</strong>
                          <span className="tiny muted">Optional</span>
                          {driverName.trim() && !driverOpen && (
                            <span className="badge badge-brand">{driverName.trim()}</span>
                          )}
                        </span>
                        {driverOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <div className="tiny muted" style={{ marginTop: 6 }}>
                        {driverOpen
                          ? "Paid to a referring driver. Hidden from the customer invoice and deducted in the owner P&L."
                          : "Select only if a referring driver earns a commission on this job."}
                      </div>
                      {driverOpen && (
                        <div className="form-grid" style={{ marginTop: 10 }}>
                          <Field label="Driver name">
                            <input
                              className="input"
                              placeholder="e.g. Sunil Perera"
                              value={driverName}
                              onChange={(event) => setDriverName(event.target.value)}
                            />
                          </Field>
                          <Field label="Driver phone">
                            <input
                              className="input"
                              placeholder="+94 71 234 5678"
                              value={driverPhone}
                              onChange={(event) => setDriverPhone(event.target.value)}
                            />
                          </Field>
                          <Field label="Commission basis">
                            <select
                              className="select"
                              value={driverBasis}
                              onChange={(event) =>
                                setDriverBasis(event.target.value as DriverCommission["basis"])
                              }
                            >
                              <option value="Labour">Labour value</option>
                              <option value="Total Bill">Total bill</option>
                            </select>
                          </Field>
                          <Field label="Commission type">
                            <select
                              className="select"
                              value={driverType}
                              onChange={(event) =>
                                setDriverType(event.target.value as DriverCommission["type"])
                              }
                            >
                              <option value="Percentage">Percentage</option>
                              <option value="Fixed">Fixed amount</option>
                            </select>
                          </Field>
                          <Field
                            label={
                              driverType === "Percentage" ? "Percentage (%)" : "Fixed amount (LKR)"
                            }
                            full
                          >
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={driverValue}
                              onChange={(event) => setDriverValue(event.target.value)}
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="grid cols-2" style={{ gap: 14 }}>
              <Field label="Repair type" required hint="The supervisor sees this on the job card.">
                <select
                  className="select"
                  value={repairType}
                  onChange={(event) => {
                    const nextType = event.target.value;
                    setRepairType(nextType);
                    if (sectionsEnabled) setAcceptSectionIds(suggestedSectionIds(nextType));
                  }}
                >
                  {repairTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field label="Job number preview" hint="Assigned when you accept.">
                <input className="input" readOnly value={`JC-${nextNumeric}`} />
              </Field>
              {sectionsEnabled && (
                <Field
                  label="Workshop sections"
                  full
                  hint="Tick every section that will touch this vehicle. Tasks and parts are tagged per section."
                >
                  <div className="row wrap" style={{ gap: 8 }}>
                    {activeSections.map((section) => {
                      const selected = acceptSectionIds.includes(section.id);
                      return (
                        <button
                          key={section.id}
                          type="button"
                          className={`btn btn-sm ${selected ? "btn-primary" : "btn-secondary"}`}
                          onClick={() =>
                            setAcceptSectionIds((prev) =>
                              prev.includes(section.id)
                                ? prev.filter((id) => id !== section.id)
                                : [...prev, section.id],
                            )
                          }
                          style={{ borderLeft: `4px solid ${section.color}` }}
                        >
                          {section.name}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}
              <Field
                label="Safety notes & existing damage"
                required
                full
                hint="Record scratches, dents, warning lights, customer complaints and anything the workshop must not be blamed for."
              >
                <textarea
                  className="textarea"
                  rows={4}
                  placeholder="e.g. Deep scratch on front-left bumper. Pre-existing dent on left rear door. Customer reports brake squeal."
                  value={safetyNotes}
                  onChange={(event) => setSafetyNotes(event.target.value)}
                />
              </Field>
            </div>

            <div>
              <div className="row-between wrap" style={{ marginBottom: 7 }}>
                <label className="label">
                  <Camera size={13} /> Damage & inspection photos
                </label>
                <span className="tiny muted">{photos.length}/6 · compressed before upload</span>
              </div>
              <div
                className="logo-upload"
                style={{ flexWrap: "wrap", alignItems: "flex-start" }}
              >
                {photos.map((photo) => (
                  <div key={photo.id} style={{ position: "relative" }}>
                    <img
                      src={photo.dataUrl}
                      alt={photo.name}
                      className="photo-thumb"
                      style={{ width: 110, height: 76 }}
                    />
                    <button
                      type="button"
                      className="modal-close"
                      style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, background: "#fff" }}
                      onClick={() => setPhotos((prev) => prev.filter((entry) => entry.id !== photo.id))}
                      aria-label="Remove photo"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
                {photos.length < 6 && (
                  <label
                    className="btn btn-secondary btn-sm"
                    htmlFor="gate-photos"
                    style={{ minHeight: 76, minWidth: 120, flexDirection: "column", gap: 4 }}
                  >
                    {uploading ? <Loader2 size={17} className="spin" /> : <Upload size={17} />}
                    {uploading ? "Processing…" : "Add photos"}
                  </label>
                )}
                <input
                  id="gate-photos"
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(event) => addPhotos(event.target.files)}
                />
                <div style={{ flex: 1, minWidth: 180 }} className="tiny muted">
                  Photos are stored in Google Drive folder{" "}
                  <strong>Workshop_Job_Cards / Job_Card_{nextNumeric}</strong> after acceptance.
                  In this demo the compressed photo bytes are saved locally.
                </div>
              </div>
            </div>

            {photos.length === 0 && (
              <Alert tone="warn" icon={<CircleAlert />}>
                No inspection photos attached. We recommend at least one clear photo of the
                vehicle and any existing damage before accepting it.
              </Alert>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject this check-in?"
        subtitle={rejectTarget ? `${rejectTarget.vehicleNo} · ${rejectTarget.customerName}` : undefined}
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRejectTarget(null)}>
              Keep waiting
            </button>
            <button className="btn btn-danger" onClick={confirmReject}>
              Reject check-in
            </button>
          </>
        }
      >
        <Alert tone="danger" title="The customer will not be moved into the workshop">
          Use this only for duplicate entries, wrong workshop QR scans, or vehicles that cannot
          be accepted. The public check-in record remains in history as rejected.
        </Alert>
      </Modal>

      <Modal
        open={Boolean(acceptedJob)}
        onClose={() => setAcceptedJobId(null)}
        title="Vehicle accepted into the workshop"
        subtitle={acceptedJob ? `${acceptedJob.id} · ${acceptedJob.vehicleNo}` : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAcceptedJobId(null)}>
              Done
            </button>
            <Link className="btn btn-primary" to={`/jobs/${acceptedJob?.id}`} onClick={() => setAcceptedJobId(null)}>
              Open job card
              <ArrowRight />
            </Link>
          </>
        }
      >
        {acceptedJob && (
          <div className="success-panel" style={{ paddingTop: 0 }}>
            <div className="success-icon">
              <CheckCircle2 size={32} />
            </div>
            <h2>{acceptedJob.vehicleNo} is on the floor</h2>
            <p>
              The supervisor has been notified.{" "}
              {autoWhatsAppEnabled(state.settings)
                ? "The receiving note has been queued automatically on the workshop WhatsApp."
                : "Send the receiving note to the customer on WhatsApp so they have the job number and repair type."}
            </p>
            <div className="card" style={{ marginTop: 18, textAlign: "left" }}>
              <div className="card-body">
                <div className="kv">
                  <span>Job card</span>
                  <span>{acceptedJob.id}</span>
                </div>
                <div className="kv">
                  <span>Repair type</span>
                  <span>{acceptedJob.repairType}</span>
                </div>
                <div className="kv">
                  <span>Intake</span>
                  <span>{acceptedJob.intakeType}</span>
                </div>
                {featureEnabled(state.settings, "enable_driver_commissions") &&
                  acceptedJob.driver && (
                  <div className="kv">
                    <span>Driver commission</span>
                    <span>
                      {acceptedJob.driver.name} ·{" "}
                      {acceptedJob.driver.type === "Percentage"
                        ? `${acceptedJob.driver.value}% of ${acceptedJob.driver.basis.toLowerCase()}`
                        : `${money(acceptedJob.driver.value)} fixed`}
                    </span>
                  </div>
                )}
                <div className="kv">
                  <span>Inspection photos</span>
                  <span>{photos.length}</span>
                </div>
                <div className="kv">
                  <span>Drive folder</span>
                  <span style={{ fontSize: 11 }}>{acceptedJob.driveFolderId}</span>
                </div>
              </div>
            </div>
            <div className="row wrap" style={{ marginTop: 16, justifyContent: "center" }}>
              {!autoWhatsAppEnabled(state.settings) && (
                <a
                  className="btn btn-primary"
                  href={waLink(acceptedJob.phone, acceptanceMessage(acceptedJob, state.settings))}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle />
                  Send WhatsApp receiving note
                </a>
              )}
              {autoWhatsAppEnabled(state.settings) && (
                <span className="badge badge-green">
                  <MessageCircle size={12} /> Receiving note queued automatically
                </span>
              )}
              <Link className="btn btn-secondary" to={`/jobs/${acceptedJob.id}`} onClick={() => setAcceptedJobId(null)}>
                <FolderOpen />
                View job & photos
              </Link>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(dispatchTarget)}
        onClose={() => setDispatchTarget(null)}
        title="Hand over the vehicle?"
        subtitle={
          dispatchTarget
            ? `${dispatchTarget.vehicleNo} · ${dispatchTarget.make} ${dispatchTarget.model}`
            : undefined
        }
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDispatchTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmDispatch}>
              <KeyRound />
              Confirm handover
            </button>
          </>
        }
      >
        {dispatchTarget && (
          <div className="stack">
            <div className="kv">
              <span>Job</span>
              <span>{dispatchTarget.id}</span>
            </div>
            <div className="kv">
              <span>Customer</span>
              <span>{dispatchTarget.customerName}</span>
            </div>
            <div className="kv">
              <span>Billing status</span>
              <span>{dispatchTarget.status}</span>
            </div>
            <div className="kv">
              <span>Invoice value</span>
              <span>{money(jobTotals(dispatchTarget, state.tasks, state.parts, state.workers).total)}</span>
            </div>
            <Alert tone="info" icon={<Sparkles />} title="Marketing follow-up">
              If this visit qualifies, a service-cycle or mileage reminder is queued in
              Marketing and becomes ready after a two-day buffer.
            </Alert>
          </div>
        )}
      </Modal>

      <Modal
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title="PRO billing override"
        subtitle="Release a repaired vehicle before payment is recorded"
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setOverrideOpen(false)}>
              Keep the gate closed
            </button>
            <button className="btn btn-danger" onClick={submitOverride}>
              <ShieldCheck size={14} />
              Record override &amp; open gate
            </button>
          </>
        }
      >
        <div className="stack">
          <Alert tone="warn" title="This creates a receivable">
            The vehicle leaves without payment. A 7-day credit balance is opened, and the owner,
            cashier and accounting are notified with your reason.
          </Alert>
          {billingQueue.length === 0 ? (
            <p className="small muted">No completed jobs are waiting for billing right now.</p>
          ) : (
            <>
              <Field label="Vehicle waiting for billing" required>
                <select
                  className="input"
                  value={overrideTargetId}
                  onChange={(event) => setOverrideTargetId(event.target.value)}
                >
                  {billingQueue.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.vehicleNo} · {job.customerName} · {job.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Reason for the override"
                required
                hint="The exit notification and audit trail use this text."
              >
                <textarea
                  className="input"
                  rows={3}
                  value={overrideReason}
                  placeholder="Owner approved release; customer will settle the balance tomorrow."
                  onChange={(event) => setOverrideReason(event.target.value)}
                />
              </Field>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(handoverJob)}
        onClose={() => setHandoverJob(null)}
        title="Vehicle released"
        subtitle={handoverJob?.vehicleNo}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setHandoverJob(null)}>
              Close
            </button>
            <Link className="btn btn-primary" to="/marketing" onClick={() => setHandoverJob(null)}>
              <Sparkles />
              View marketing queue
            </Link>
          </>
        }
      >
        {handoverJob && (
          <div className="success-panel" style={{ paddingTop: 0 }}>
            <div className="success-icon">
              <CheckCircle2 size={32} />
            </div>
            <h2>{handoverJob.vehicleNo} has left the workshop</h2>
            <p>
              The gate log is updated. If this visit qualifies for a service-cycle or mileage
              follow-up, it has been queued with a two-day buffer.
            </p>
            {!autoWhatsAppEnabled(state.settings) ? (
              <a
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                href={waLink(handoverJob.phone, handoverMessage(handoverJob, state.settings))}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle />
                Send WhatsApp handover message
              </a>
            ) : (
              <div className="badge badge-green" style={{ marginTop: 16 }}>
                <MessageCircle size={12} /> Handover message queued automatically
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
