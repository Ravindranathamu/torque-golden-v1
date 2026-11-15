import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  Download,
  MessageCircle,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  ShieldCheck,
  Star,
  UserRound,
  Wallet,
  Wrench,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import { pnlFor } from "../lib/analytics";
import { jobTotals, money, shortDate, timeAgo, waLink } from "../lib/utils";
import { checkoutMessage } from "../lib/messages";
import {
  downloadInvoice,
  printAdvanceReceipt,
  printDriverCommissionChit,
  printInvoice,
  shareAdvanceReceiptWhatsApp,
  shareInvoiceWhatsApp,
  totalsForInvoice,
} from "../lib/invoice";
import { CreditLedger } from "../components/CreditLedger";
import { EmptyState, Field, Modal, PageHeader, StatCard, StatusBadge, Tabs } from "../components/ui";
import { useToast } from "../components/Toast";
import type { AdvancePayment, DiscountType, JobCard, PaymentMethod } from "../types";

type CashierTab = "queue" | "advances" | "settled" | "credits";

export function CashierPage() {
  const { state, checkoutJob, recordAdvancePayment } = useApp();
  const { push } = useToast();
  const [tab, setTab] = useState<CashierTab>("queue");
  const [checkoutTargetId, setCheckoutTargetId] = useState<string | null>(null);
  const [successJobId, setSuccessJobId] = useState<string | null>(null);
  const [discount, setDiscount] = useState("0");
  const [discountType, setDiscountType] = useState<DiscountType>("Fixed");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [graceDays, setGraceDays] = useState("30");
  const [busy, setBusy] = useState("");
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceJob, setAdvanceJob] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<AdvancePayment["method"]>("Cash");
  const [advanceNote, setAdvanceNote] = useState("");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(String(state.settings.defaultVatRate ?? 18));
  const [customerTin, setCustomerTin] = useState("");
  const [printFormat, setPrintFormat] = useState<"thermal" | "a4">(
    state.settings.printerMode === "Standard_PC" ? "a4" : "thermal",
  );

  const queue = state.jobCards
    .filter((job) => job.status === "Repair Completed")
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
  const vatFeatureEnabled = featureEnabled(state.settings, "enable_vat_invoicing");
  const effectiveVat = vatFeatureEnabled && vatEnabled;
  const settled = state.jobCards
    .filter((job) => ["Paid", "Released on Credit", "Dispatched"].includes(job.status))
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  const progressingJobs = state.jobCards
    .filter((job) => !["Paid", "Released on Credit", "Dispatched"].includes(job.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const todayPnl = pnlFor(state, "today");

  const target = state.jobCards.find((job) => job.id === checkoutTargetId) ?? null;
  const ticket = useMemo(() => {
    if (!target) return null;
    const baseDraft: JobCard = {
      ...target,
      discount: Number(discount) || 0,
      discountType,
      isVatInvoice: false,
      vatAmount: 0,
      vatRateApplied: 0,
    };
    const base = jobTotals(baseDraft, state.tasks, state.parts, state.workers);
    const rate = effectiveVat ? Math.max(0, Number(vatRate) || 0) : 0;
    const vatAmount = Math.round(base.total * rate) / 100;
    return jobTotals(
      {
        ...baseDraft,
        isVatInvoice: effectiveVat,
        vatRateApplied: rate,
        vatAmount,
      },
      state.tasks,
      state.parts,
      state.workers,
    );
  }, [
    target,
    discount,
    discountType,
    effectiveVat,
    vatRate,
    state.tasks,
    state.parts,
    state.workers,
  ]);

  const successJob = state.jobCards.find((job) => job.id === successJobId) ?? null;
  const successTotals = successJob
    ? jobTotals(successJob, state.tasks, state.parts, state.workers)
    : null;
  const successCredit = successJob
    ? state.customerCredits.find((credit) => credit.jobCardId === successJob.id) ?? null
    : null;
  const targetAdvances = target ? advancePaidFor(target.id) : 0;
  const targetBalance = ticket ? Math.max(0, ticket.total - targetAdvances) : 0;
  const targetClaim = target?.insuranceClaimId
    ? state.insuranceJobs.find((claim) => claim.id === target.insuranceClaimId) ?? null
    : null;
  const targetInsurer = targetClaim
    ? state.insuranceCompanies.find((insurer) => insurer.id === targetClaim.insurerId)
    : null;
  const advanceMatch = advanceJob.trim()
    ? state.jobCards.find(
        (job) =>
          job.id.toLowerCase() === advanceJob.trim().toLowerCase() ||
          job.vehicleNo.toLowerCase() === advanceJob.trim().toLowerCase(),
      ) ?? null
    : null;

  function openCheckout(jobId: string) {
    const job = state.jobCards.find((entry) => entry.id === jobId);
    setCheckoutTargetId(jobId);
    setSuccessJobId(null);
    setDiscount(String(job?.discount ?? 0));
    setDiscountType(job?.discountType ?? "Fixed");
    setPaymentMethod("Cash");
    setGraceDays("30");
    setVatEnabled(false);
    setVatRate(String(state.settings.defaultVatRate ?? 18));
    setCustomerTin(job?.customerTinNumber ?? "");
  }

  function advancePaidFor(jobId: string): number {
    return state.advancePayments
      .filter(
        (advance) =>
          advance.jobCardId === jobId && advance.chequeStatus !== "Bounced",
      )
      .reduce((sum, advance) => sum + advance.amount, 0);
  }

  function confirmCheckout() {
    if (!target || !ticket) return;
    const value = Number(discount);
    if (!Number.isFinite(value) || value < 0) {
      push("Enter a valid discount.", "error");
      return;
    }
    if (discountType === "Percentage" && value > 100) {
      push("Percentage discount cannot exceed 100%.", "error");
      return;
    }
    if (paymentMethod === "Credit" && (!Number(graceDays) || Number(graceDays) < 1)) {
      push("Enter a credit grace period in days.", "error");
      return;
    }
    if (effectiveVat && (!Number.isFinite(Number(vatRate)) || Number(vatRate) < 0 || Number(vatRate) > 100)) {
      push("VAT rate must be between 0 and 100 percent.", "error");
      return;
    }
    const result = checkoutJob(target.id, {
      paymentMethod,
      discount: value,
      discountType,
      graceDays: paymentMethod === "Credit" ? Number(graceDays) : undefined,
      isVatInvoice: effectiveVat,
      vatRate: effectiveVat ? Number(vatRate) : 0,
      customerTinNumber: customerTin.trim() || undefined,
    });
    if (!result.ok) {
      push(result.message ?? "Could not complete billing.", "error");
      return;
    }
    setSuccessJobId(target.id);
    setCheckoutTargetId(null);
    push(
      paymentMethod === "Credit"
        ? "Credit sale recorded. PRO notified for gate release."
        : "Payment collected. PRO notified for gate clearance.",
    );
  }

  function invoiceTotals(job: JobCard) {
    return totalsForInvoice(jobTotals(job, state.tasks, state.parts, state.workers));
  }

  function dueFor(job: JobCard) {
    return state.customerCredits.find((credit) => credit.jobCardId === job.id)?.dueDate;
  }

  function advanceBalanceAfter(advance: AdvancePayment) {
    const job = state.jobCards.find((entry) => entry.id === advance.jobCardId);
    if (!job) return undefined;
    const total = jobTotals(job, state.tasks, state.parts, state.workers).total;
    const paid = state.advancePayments
      .filter((entry) => entry.jobCardId === advance.jobCardId)
      .reduce((sum, entry) => sum + entry.amount, 0);
    return Math.max(0, total - paid);
  }

  function printAdvance(advance: AdvancePayment) {
    printAdvanceReceipt(advance, state.settings, advanceBalanceAfter(advance), printFormat);
  }

  async function shareAdvance(advance: AdvancePayment) {
    setBusy(`advance_${advance.id}`);
    try {
      const outcome = await shareAdvanceReceiptWhatsApp(
        advance,
        state.settings,
        `Hello ${advance.customerName}, we received your advance of ${money(advance.amount)} against job ${advance.jobCardId} (${advance.vehicleNo}). Receipt ${advance.receiptNo}. Thank you — ${state.settings.companyName}.`,
        advanceBalanceAfter(advance),
      );
      push(
        outcome === "queued"
          ? "Advance receipt sent automatically through WAHA."
          : outcome === "shared"
            ? "Advance receipt shared through your device."
            : "Receipt downloaded. Attach it in the WhatsApp chat that opened.",
        "info",
      );
    } catch {
      push("Could not prepare the advance receipt.", "error");
    } finally {
      setBusy("");
    }
  }

  function openAdvance() {
    setAdvanceJob("");
    setAdvanceAmount("");
    setAdvanceMethod("Cash");
    setAdvanceNote("");
    setAdvanceOpen(true);
  }

  function saveAdvance() {
    const amount = Number(advanceAmount);
    if (!advanceJob.trim()) {
      push("Enter the job number or vehicle number.", "error");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      push("Enter a valid advance amount.", "error");
      return;
    }
    const result = recordAdvancePayment(advanceJob.trim(), amount, advanceMethod, advanceNote);
    if (!result.ok) {
      push(result.message ?? "Could not record the advance.", "error");
      return;
    }
    push(`Advance ${result.reference} recorded for ${result.jobId}.`);
    setAdvanceOpen(false);
    setTab("advances");
  }

  function insuranceFor(job: JobCard) {
    const claim = job.insuranceClaimId
      ? state.insuranceJobs.find((entry) => entry.id === job.insuranceClaimId)
      : undefined;
    if (!claim) return undefined;
    return {
      claim,
      insurer: state.insuranceCompanies.find((entry) => entry.id === claim.insurerId),
    };
  }

  function printJobWithFormat(job: JobCard, format: "thermal" | "a4") {
    printInvoice(
      job,
      state.tasks.filter((task) => task.jobCardId === job.id),
      state.parts.filter((part) => part.jobCardId === job.id),
      state.workers,
      state.settings,
      invoiceTotals(job),
      dueFor(job),
      insuranceFor(job),
      { format, advancePaid: advancePaidFor(job.id) },
    );
  }

  function printJob(job: JobCard) {
    printJobWithFormat(job, printFormat);
  }

  async function downloadJob(job: JobCard) {
    setBusy(`download_${job.id}`);
    try {
      await downloadInvoice(
        job,
        state.tasks.filter((task) => task.jobCardId === job.id),
        state.parts.filter((part) => part.jobCardId === job.id),
        state.workers,
        state.settings,
        invoiceTotals(job),
        dueFor(job),
        insuranceFor(job),
        { advancePaid: advancePaidFor(job.id), customerTin: job.customerTinNumber },
      );
      push("Invoice PDF downloaded.");
    } catch {
      push("Could not generate the invoice PDF.", "error");
    } finally {
      setBusy("");
    }
  }

  async function shareJob(job: JobCard) {
    setBusy(`share_${job.id}`);
    const total = invoiceTotals(job).total;
    try {
      const outcome = await shareInvoiceWhatsApp(
        job,
        state.tasks.filter((task) => task.jobCardId === job.id),
        state.parts.filter((part) => part.jobCardId === job.id),
        state.workers,
        state.settings,
        invoiceTotals(job),
        checkoutMessage(job, total, state.settings, dueFor(job)),
        dueFor(job),
        insuranceFor(job),
        { advancePaid: advancePaidFor(job.id), customerTin: job.customerTinNumber },
      );
      push(
        outcome === "queued"
          ? "Invoice sent automatically through WAHA with the PDF attached."
          : outcome === "shared"
            ? "Invoice shared through your device."
            : "PDF downloaded. Attach it in the WhatsApp chat that opened.",
        "info",
      );
    } catch {
      push("Could not prepare the WhatsApp invoice.", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Billing & cashier"
        subtitle="Discounts, payment capture, thermal receipts, PDF invoices and credit releases — with PRO gate clearance built in."
        actions={
          <>
            <Tabs<CashierTab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "queue", label: "Billing queue", count: queue.length },
                { id: "advances", label: "Advances", count: state.advancePayments.length },
                { id: "settled", label: "Paid & released", count: settled.length },
                { id: "credits", label: "Credit ledger" },
              ]}
            />
            <select
              className="select"
              aria-label="Print format"
              title="Default format for customer invoices and advance receipts"
              style={{ width: 152 }}
              value={printFormat}
              onChange={(event) => setPrintFormat(event.target.value as "thermal" | "a4")}
            >
              <option value="thermal">
                Thermal {state.settings.thermalPaperWidth ?? "80mm"}
              </option>
              <option value="a4">Standard A4</option>
            </select>
            {tab === "advances" && (
              <button className="btn btn-primary" onClick={openAdvance}>
                <Plus />
                Record advance
              </button>
            )}
          </>
        }
      />

      {tab !== "credits" && (
        <div className="grid cols-4">
          <StatCard
            label="Queue value"
            value={money(
              queue.reduce(
                (sum, job) => sum + jobTotals(job, state.tasks, state.parts, state.workers).total,
                0,
              ),
            )}
            meta={`${queue.length} repair${queue.length === 1 ? "" : "s"} ready to bill`}
            icon={<ReceiptText />}
            tone="purple"
          />
          <StatCard
            label="Cash & card today"
            value={money(todayPnl.cashSales)}
            meta="Collected at the counter"
            icon={<Banknote />}
          />
          <StatCard
            label="Credit sales today"
            value={money(todayPnl.creditSales)}
            meta="Approved customer credit"
            icon={<CreditCard />}
            tone="amber"
          />
          <StatCard
            label="Receivables"
            value={money(todayPnl.receivables)}
            meta="All open customer credit balances"
            icon={<Wallet />}
            tone="blue"
          />
        </div>
      )}

      {tab === "queue" && (
        <div className="stack" style={{ marginTop: 18 }}>
          {queue.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<CheckCircle2 size={22} />}
                title="Billing queue is clear"
                message="When a supervisor marks a repair completed, the full job — labour, parts and discounts — lands here for checkout."
                action={
                  <Link className="btn btn-secondary" to="/workshop">
                    Open workshop floor
                    <ArrowRight />
                  </Link>
                }
              />
            </div>
          ) : (
            queue.map((job) => {
              const totals = jobTotals(job, state.tasks, state.parts, state.workers);
              return (
                <div className="card" key={job.id}>
                  <div className="card-head">
                    <div className="row" style={{ gap: 11 }}>
                      <span
                        className="part-icon"
                        style={{ width: 42, height: 42, flex: "0 0 42px", background: "var(--purple-soft)", color: "var(--purple)" }}
                      >
                        <ReceiptText size={18} />
                      </span>
                      <div>
                        <div className="row wrap" style={{ gap: 7 }}>
                          <h3 style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: "-0.02em" }}>
                            {job.vehicleNo} · {job.make} {job.model}
                          </h3>
                          <StatusBadge status={job.status} />
                        </div>
                        <p>
                          {job.customerName} · {job.id} · completed {timeAgo(job.completedAt)}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 780 }}>{money(totals.total)}</div>
                      <div className="tiny muted">incl. {money(totals.parts)} parts</div>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="grid cols-4" style={{ gap: 10 }}>
                      <div className="mini-stat card">
                        <div className="label">Labour</div>
                        <div className="value" style={{ fontSize: 15 }}>{money(totals.labor)}</div>
                        <div className="meta">{totals.activeTasks.length} tasks</div>
                      </div>
                      <div className="mini-stat card">
                        <div className="label">Parts</div>
                        <div className="value" style={{ fontSize: 15 }}>{money(totals.parts)}</div>
                        <div className="meta">{totals.issuedParts.length} issued lines</div>
                      </div>
                      <div className="mini-stat card">
                        <div className="label">Discount</div>
                        <div className="value" style={{ fontSize: 15 }}>{money(totals.discount)}</div>
                        <div className="meta">Apply at checkout</div>
                      </div>
                      <div className="mini-stat card">
                        <div className="label">Commission</div>
                        <div className="value" style={{ fontSize: 15 }}>{money(totals.commission)}</div>
                        <div className="meta">Payable to technicians</div>
                      </div>
                    </div>
                    <div className="divider" />
                    <div className="row-between wrap">
                      <div className="row wrap small muted">
                        <span><UserRound size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{job.customerName}</span>
                        <span>·</span>
                        <span><Phone size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{job.phone}</span>
                        <span>·</span>
                        <span><Wrench size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{job.repairType}</span>
                      </div>
                      <div className="row wrap">
                        <Link className="btn btn-ghost btn-sm" to={`/jobs/${job.id}`}>
                          Review job
                        </Link>
                        <button className="btn btn-primary" onClick={() => openCheckout(job.id)}>
                          <Wallet />
                          Bill & collect
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

      {tab === "advances" && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <div>
              <h3>Advance payments against jobs</h3>
              <p>Deposits collected before final billing. Each receipt is credited to the job at checkout.</p>
            </div>
            <span className="badge badge-green">{state.advancePayments.length} receipts</span>
          </div>
          {state.advancePayments.length === 0 ? (
            <EmptyState
              icon={<Wallet size={22} />}
              title="No advance payments yet"
              message="Record a deposit against a job or vehicle number, print the receipt and send it to the customer on WhatsApp."
              action={
                <button className="btn btn-primary" onClick={openAdvance}>
                  <Plus />
                  Record advance
                </button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Job / vehicle</th>
                    <th>Customer</th>
                    <th>Method</th>
                    <th className="num">Amount</th>
                    <th>Balance after</th>
                    <th>Recorded</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.advancePayments.map((advance) => {
                    const balance = advanceBalanceAfter(advance);
                    return (
                      <tr key={advance.id}>
                        <td className="strong">{advance.receiptNo}</td>
                        <td>
                          <Link className="cell-main" to={`/jobs/${advance.jobCardId}`}>
                            {advance.jobCardId}
                          </Link>
                          <div className="cell-sub">{advance.vehicleNo}</div>
                        </td>
                        <td>
                          <div className="cell-main" style={{ fontSize: 12.2 }}>{advance.customerName}</div>
                          <div className="cell-sub">{advance.phone}</div>
                        </td>
                        <td><StatusBadge status={advance.method} /></td>
                        <td className="num strong">{money(advance.amount)}</td>
                        <td className="num">{balance === undefined ? "—" : money(balance)}</td>
                        <td className="tiny muted">
                          {shortDate(advance.createdAt)}
                          <div className="cell-sub">{advance.recordedBy ?? "—"}</div>
                        </td>
                        <td>
                          <div className="row" style={{ justifyContent: "flex-end", gap: 3 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Print advance receipt"
                              onClick={() => printAdvance(advance)}
                            >
                              <Printer />
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Send receipt on WhatsApp"
                              disabled={busy === `advance_${advance.id}`}
                              onClick={() => shareAdvance(advance)}
                            >
                              <MessageCircle />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "settled" && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <div>
              <h3>Paid, credit-released & dispatched</h3>
              <p>Reprint receipts, download PDFs or resend via WhatsApp.</p>
            </div>
            <span className="badge badge-green">{settled.length} records</span>
          </div>
          {settled.length === 0 ? (
            <EmptyState title="No settled invoices yet" message="Completed checkouts and approved credit releases will be archived here." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Method</th>
                    <th className="num">Total</th>
                    <th>Paid</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {settled.map((job) => {
                    const settledTotals = jobTotals(job, state.tasks, state.parts, state.workers);
                    const total = settledTotals.total;
                    const credit = state.customerCredits.find((entry) => entry.jobCardId === job.id);
                    const separateBills = state.vehicleBills.filter(
                      (bill) => bill.jobCardId === job.id,
                    );
                    return (
                      <tr key={job.id}>
                        <td>
                          <Link className="cell-main" to={`/jobs/${job.id}`}>{job.id}</Link>
                          <div className="cell-sub">{job.repairType}</div>
                          {separateBills.length > 0 && (
                            <div className="cell-sub">
                              {separateBills.length} separate bill
                              {separateBills.length === 1 ? "" : "s"}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="cell-main" style={{ fontSize: 12.2 }}>{job.customerName}</div>
                          <div className="cell-sub">{job.phone}</div>
                        </td>
                        <td className="small">{job.vehicleNo}</td>
                        <td><StatusBadge status={job.paymentMethod ?? "—"} /></td>
                        <td className="num strong">{money(total)}</td>
                        <td className="tiny muted">
                          {shortDate(job.paidAt)}
                          {credit && credit.status !== "Settled" && (
                            <div className="cell-sub">Due {shortDate(credit.dueDate)}</div>
                          )}
                        </td>
                        <td><StatusBadge status={job.status} /></td>
                        <td>
                          <div className="row" style={{ justifyContent: "flex-end", gap: 3 }}>
                            <button className="btn btn-ghost btn-sm" title="Print invoice" onClick={() => printJob(job)}>
                              <Printer />
                            </button>
                            {job.driver && (
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Driver commission thermal chit"
                                onClick={() =>
                                  printDriverCommissionChit(job, state.settings, {
                                    labor: settledTotals.labor,
                                    total: Math.max(0, total - settledTotals.vat),
                                  })
                                }
                              >
                                <Banknote />
                              </button>
                            )}
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Download PDF"
                              disabled={busy === `download_${job.id}`}
                              onClick={() => downloadJob(job)}
                            >
                              <Download />
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Send on WhatsApp"
                              disabled={busy === `share_${job.id}`}
                              onClick={() => shareJob(job)}
                            >
                              <MessageCircle />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "credits" && (
        <div style={{ marginTop: 18 }}>
          <CreditLedger />
        </div>
      )}

      <Modal
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        title="Record advance payment"
        subtitle="Receipt is credited against the job at final billing."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAdvanceOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveAdvance}>
              <ReceiptText />
              Record & issue receipt
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field
              label="Vehicle in progress"
              required
              full
              hint="Only vehicles still in the workshop can take an advance."
            >
              <select
                className="input"
                value={advanceJob}
                onChange={(event) => setAdvanceJob(event.target.value)}
              >
                <option value="">Choose a progressing vehicle…</option>
                {progressingJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.vehicleNo} · {job.customerName} · {job.id} · {job.status}
                  </option>
                ))}
              </select>
              {progressingJobs.length === 0 && (
                <span className="tiny muted">
                  No jobs are currently in progress. Accept a vehicle at the gate first.
                </span>
              )}
            </Field>
            <Field label="Advance amount (LKR)" required>
              <input
                className="input"
                type="number"
                min={1}
                value={advanceAmount}
                onChange={(event) => setAdvanceAmount(event.target.value)}
              />
            </Field>
            <Field label="Payment method" required>
              <select
                className="select"
                value={advanceMethod}
                onChange={(event) =>
                  setAdvanceMethod(event.target.value as AdvancePayment["method"])
                }
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank transfer</option>
              </select>
            </Field>
            <Field label="Note" full hint="Optional — shown on the receipt.">
              <input
                className="input"
                placeholder="Brake repair deposit"
                value={advanceNote}
                onChange={(event) => setAdvanceNote(event.target.value)}
              />
            </Field>
          </div>

          {advanceMatch ? (
            <div className="card">
              <div className="card-body">
                <div className="kv"><span>Job</span><span>{advanceMatch.id}</span></div>
                <div className="kv"><span>Vehicle</span><span>{advanceMatch.vehicleNo}</span></div>
                <div className="kv"><span>Customer</span><span>{advanceMatch.customerName}</span></div>
                <div className="kv"><span>Phone</span><span>{advanceMatch.phone}</span></div>
                <div className="kv">
                  <span>Current job total</span>
                  <span>{money(jobTotals(advanceMatch, state.tasks, state.parts, state.workers).total)}</span>
                </div>
              </div>
            </div>
          ) : advanceJob.trim() ? (
            <div className="alert alert-warn">
              <Wallet />
              <div>No job matches that number. Check the job card or vehicle plate.</div>
            </div>
          ) : null}

          <div className="alert alert-brand">
            <MessageCircle />
            <div>
              After saving, print the advance receipt or resend it on WhatsApp from the Advances tab.
              The cashier may take deposits before the repair is completed.
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(target)}
        onClose={() => setCheckoutTargetId(null)}
        title="Checkout & payment"
        subtitle={target ? `${target.id} · ${target.vehicleNo} · ${target.customerName}` : undefined}
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCheckoutTargetId(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmCheckout}>
              <CheckCircle2 />
              Confirm {paymentMethod === "Credit" ? "credit release" : "payment"}
            </button>
          </>
        }
      >
        {target && ticket && (
          <div className="stack">
            <div className="grid cols-2" style={{ gap: 14 }}>
              <div className="card">
                <div className="card-head" style={{ paddingTop: 14 }}>
                  <div>
                    <h3>Invoice preview</h3>
                    <p>{target.make} {target.model} · {target.mileage.toLocaleString()} km</p>
                  </div>
                </div>
                <div className="card-body" style={{ paddingTop: 6 }}>
                  {ticket.issuedParts.map((part) => (
                    <div className="kv" key={part.id}>
                      <span>{part.itemName} × {Math.max(1, part.qtyIssued)}</span>
                      <span>{money(part.sellingPrice * Math.max(1, part.qtyIssued))}</span>
                    </div>
                  ))}
                  {ticket.activeTasks.map((task) => (
                    <div className="kv" key={task.id}>
                      <span>{task.name}</span>
                      <span>{money(task.laborCost)}</span>
                    </div>
                  ))}
                  <div className="kv"><span>Subtotal</span><span>{money(ticket.subtotal)}</span></div>
                  <div className="kv"><span>Discount</span><span>- {money(ticket.discount)}</span></div>
                  {ticket.vat > 0 && (
                    <div className="kv"><span>VAT @ {vatRate}%</span><span>{money(ticket.vat)}</span></div>
                  )}
                  <div className="kv" style={{ fontSize: 16 }}><span>{ticket.vat > 0 ? "Total incl. VAT" : "Net total"}</span><span>{money(ticket.total)}</span></div>
                  {targetAdvances > 0 && (
                    <>
                      <div className="kv"><span>Advance already paid</span><span>- {money(targetAdvances)}</span></div>
                      <div className="kv strong"><span>Balance payable</span><span>{money(targetBalance)}</span></div>
                    </>
                  )}
                </div>
              </div>

              <div className="stack">
                <div className="card">
                  <div className="card-body stack">
                    <div className="form-grid">
                      <Field label="Discount" hint="Fixed amount or percentage.">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={discountType === "Percentage" ? 100 : undefined}
                          value={discount}
                          onChange={(event) => setDiscount(event.target.value)}
                        />
                      </Field>
                      <Field label="Discount type">
                        <select
                          className="select"
                          value={discountType}
                          onChange={(event) => setDiscountType(event.target.value as DiscountType)}
                        >
                          <option value="Fixed">Fixed (LKR)</option>
                          <option value="Percentage">Percentage (%)</option>
                        </select>
                      </Field>
                      <Field label="Payment method" required full>
                        <select
                          className="select"
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                        >
                          <option value="Cash">Cash</option>
                          <option value="Card">Card</option>
                          <option value="Credit">Credit — release now, pay later</option>
                          {targetClaim && (
                            <option value="Insurance">Insurance — bill the insurer</option>
                          )}
                        </select>
                      </Field>
                      {vatFeatureEnabled && (
                        <>
                          <Field label="Invoice tax" full hint="Prints TAX INVOICE with the supplier and purchaser TIN blocks when VAT is enabled.">
                            <select
                              className="select"
                              value={vatEnabled ? "vat" : "novat"}
                              onChange={(event) => setVatEnabled(event.target.value === "vat")}
                            >
                              <option value="novat">Without VAT — standard INVOICE</option>
                              <option value="vat">With VAT — TAX INVOICE</option>
                            </select>
                          </Field>
                          {vatEnabled && (
                            <>
                              <Field label="VAT rate (%)" required>
                                <input
                                  className="input"
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.01"
                                  value={vatRate}
                                  onChange={(event) => setVatRate(event.target.value)}
                                />
                          </Field>
                              <Field label="Customer TIN" hint="Optional for corporate customers.">
                                <input
                                  className="input"
                                  placeholder="123456789-7000"
                                  value={customerTin}
                                  onChange={(event) => setCustomerTin(event.target.value)}
                                />
                              </Field>
                            </>
                          )}
                        </>
                      )}
                      {paymentMethod === "Insurance" && targetClaim && (
                        <div className="alert alert-info" style={{ gridColumn: "1 / -1" }}>
                          <ShieldCheck />
                          <div>
                            <strong>{targetInsurer?.name ?? "Insurer"}</strong> · claim{" "}
                            {targetClaim.claimNo} · policy {targetClaim.policyNo}. The insurance bill
                            is recorded for {money(ticket.total)} and the vehicle can be released on
                            the insurer release note. Salvage submission stays with the workshop.
                          </div>
                        </div>
                      )}
                      {paymentMethod === "Credit" && (
                        <Field
                          label="Grace period (days)"
                          required
                          full
                          hint={`Due date: ${shortDate(
                            new Date(Date.now() + (Number(graceDays) || 0) * 86400000).toISOString(),
                          )}`}
                        >
                          <input
                            className="input"
                            type="number"
                            min={1}
                            value={graceDays}
                            onChange={(event) => setGraceDays(event.target.value)}
                          />
                        </Field>
                      )}
                    </div>
                    <div className="alert alert-info">
                      <Wallet />
                      <div>
                        {paymentMethod === "Insurance" ? (
                          <>
                            <strong>{money(ticket.total)}</strong> is billed to the insurer.
                            {targetAdvances > 0 && (
                              <> Customer advance {money(targetAdvances)} is already credited.</>
                            )}{" "}
                            Record the insurer cheque in the insurance tracker when it arrives.
                          </>
                        ) : (
                          <>
                            {targetAdvances > 0 ? (
                              <>
                                Advance {money(targetAdvances)} is credited. Customer pays{" "}
                                <strong>{money(targetBalance)}</strong>.
                              </>
                            ) : (
                              <>Customer pays <strong>{money(ticket.total)}</strong>.</>
                            )}{" "}
                            {paymentMethod === "Credit"
                              ? "The balance will appear in the customer credit ledger and accounts reminders."
                              : "PRO is notified immediately for gate clearance after payment."}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="alert alert-brand">
                  <Star />
                  <div>
                    <strong>After checkout</strong>
                    Print a thermal receipt, download/share the PDF invoice, and send the Google
                    review request in one WhatsApp thread.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(successJob)}
        onClose={() => setSuccessJobId(null)}
        title="Checkout complete"
        subtitle={successJob ? `${successJob.id} · ${successJob.vehicleNo}` : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setSuccessJobId(null)}>Done</button>
            <Link className="btn btn-primary" to="/gate" onClick={() => setSuccessJobId(null)}>
              Gate clearance
              <ArrowRight />
            </Link>
          </>
        }
      >
        {successJob && successTotals && (
          <div className="success-panel" style={{ paddingTop: 0 }}>
            <div className="success-icon">
              <CheckCircle2 size={32} />
            </div>
            <h2>
              {successJob.paymentMethod === "Credit" ? "Released on credit" : "Payment received"}
            </h2>
            <p>
              {money(successTotals.total)} recorded for {successJob.customerName}. The PRO has been
              notified that {successJob.vehicleNo} is cleared for handover.
            </p>

            <div className="card" style={{ marginTop: 18, textAlign: "left" }}>
              <div className="card-body">
                <div className="kv"><span>Invoice</span><span>{successJob.id}</span></div>
                <div className="kv"><span>Payment method</span><span>{successJob.paymentMethod}</span></div>
                <div className="kv"><span>Net amount</span><span>{money(successTotals.total)}</span></div>
                {successJob.isVatInvoice && (
                  <div className="kv">
                    <span>VAT</span>
                    <span>{money(successJob.vatAmount ?? 0)} @ {successJob.vatRateApplied ?? 0}%</span>
                  </div>
                )}
                {successJob.customerTinNumber && (
                  <div className="kv"><span>Customer TIN</span><span>{successJob.customerTinNumber}</span></div>
                )}
                {successCredit && (
                  <div className="kv">
                    <span>Credit due</span>
                    <span>{shortDate(successCredit.dueDate)} ({successCredit.graceDays} days)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="row wrap" style={{ marginTop: 16, justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={() => printJobWithFormat(successJob, "a4")}>
                <Printer />
                Print A4 invoice
              </button>
              <button className="btn btn-secondary" onClick={() => printJobWithFormat(successJob, "thermal")}>
                <ReceiptText />
                Thermal {state.settings.thermalPaperWidth ?? "80mm"} receipt
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => shareJob(successJob)}
                disabled={busy === `share_${successJob.id}`}
              >
                <MessageCircle />
                WhatsApp PDF
              </button>
              <a
                className="btn btn-ghost"
                href={waLink(
                  successJob.phone,
                  checkoutMessage(successJob, successTotals.total, state.settings, successCredit?.dueDate),
                )}
                target="_blank"
                rel="noreferrer"
              >
                <Star />
                Review request
              </a>
            </div>
            <p className="tiny muted" style={{ marginTop: 12 }}>
              Tip: use "WhatsApp PDF" — it shares the invoice file on mobile and downloads it on
              desktop while opening WhatsApp.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
