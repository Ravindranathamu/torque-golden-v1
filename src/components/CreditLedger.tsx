import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Package,
  Wallet,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { daysUntil, money, shortDate, waLink } from "../lib/utils";
import { creditReminderMessage, creditSettledMessage } from "../lib/messages";
import { EmptyState, Field, Modal, StatCard, StatusBadge, Tabs } from "./ui";
import { useToast } from "./Toast";
import type { CustomerCredit } from "../types";

type CreditFilter = "open" | "settled" | "all";
type CreditPaymentMethod = "Cash" | "Card" | "Bank Transfer" | "Cheque";

interface PaymentResult {
  credit: CustomerCredit;
  remaining: number;
  message: string;
}

export function CreditLedger({ defaultFilter = "open" }: { defaultFilter?: CreditFilter }) {
  const { state, recordCreditPayment } = useApp();
  const { push } = useToast();
  const [filter, setFilter] = useState<CreditFilter>(defaultFilter);
  const [selected, setSelected] = useState<CustomerCredit | null>(null);
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<CreditPaymentMethod>("Cash");
  const [bankAccountId, setBankAccountId] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeBranch, setChequeBranch] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [partsCredit, setPartsCredit] = useState<CustomerCredit | null>(null);

  const activeAccounts = state.bankAccounts.filter((account) => account.active);

  const credits = useMemo(
    () =>
      state.customerCredits
        .filter((credit) => {
          if (filter === "open") return credit.status !== "Settled";
          if (filter === "settled") return credit.status === "Settled";
          return true;
        })
        .filter((credit) => {
          const needle = query.trim().toLowerCase();
          if (!needle) return true;
          return `${credit.customerName} ${credit.vehicleNo} ${credit.phone} ${credit.id}`
            .toLowerCase()
            .includes(needle);
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [state.customerCredits, filter, query],
  );

  const openCredits = state.customerCredits.filter((credit) => credit.status !== "Settled");
  const outstanding = openCredits.reduce(
    (sum, credit) => sum + Math.max(0, credit.total - credit.paid),
    0,
  );
  const overdue = openCredits.filter((credit) => daysUntil(credit.dueDate) < 0);
  const overdueAmount = overdue.reduce(
    (sum, credit) => sum + Math.max(0, credit.total - credit.paid),
    0,
  );
  const dueSoon = openCredits.filter((credit) => {
    const days = daysUntil(credit.dueDate);
    return days >= 0 && days <= 7;
  });

  const partsCreditJob = partsCredit
    ? state.jobCards.find((job) => job.id === partsCredit.jobCardId)
    : null;
  const partsCreditParts = partsCredit
    ? state.parts.filter((part) => part.jobCardId === partsCredit.jobCardId)
    : [];

  function openPayment(credit: CustomerCredit) {
    setSelected(credit);
    setAmount(String(Math.max(0, credit.total - credit.paid)));
    setMethod("Cash");
    setBankAccountId(activeAccounts[0]?.id ?? "");
    setChequeNo("");
    setChequeBank("");
    setChequeBranch("");
    setChequeDate("");
    setResult(null);
  }

  function submitPayment() {
    if (!selected) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      push("Enter a valid payment amount.", "error");
      return;
    }
    if (method === "Cheque") {
      if (!chequeNo.trim() || !chequeBank.trim() || !chequeBranch.trim()) {
        push("Enter the cheque number, bank and branch.", "error");
        return;
      }
      if (!chequeDate) {
        push("Enter the cheque date.", "error");
        return;
      }
    }
    const response = recordCreditPayment(selected.id, {
      amount: value,
      method,
      bankAccountId: method === "Cheque" ? undefined : bankAccountId || undefined,
      cheque:
        method === "Cheque"
          ? {
              chequeNo: chequeNo.trim(),
              bank: chequeBank.trim(),
              branch: chequeBranch.trim(),
              chequeDate,
              amount: value,
            }
          : undefined,
    });
    if (!response.ok) {
      push(response.message ?? "Unable to record payment.", "error");
      return;
    }
    const remaining = Math.max(0, selected.total - selected.paid - value);
    setResult({
      credit: selected,
      remaining,
      message:
        response.message ??
        `Payment recorded. Remaining balance: ${money(remaining)}.`,
    });
    push(
      method === "Cheque"
        ? "Dated cheque recorded in the incoming cheque board."
        : "Payment recorded in the customer ledger.",
    );
  }

  function sendReminder(credit: CustomerCredit) {
    const remaining = Math.max(0, credit.total - credit.paid);
    window.open(
      waLink(
        credit.phone,
        creditReminderMessage(
          credit.customerName,
          credit.vehicleNo,
          remaining,
          credit.dueDate,
          state.settings,
        ),
      ),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="stack">
      <div className="grid cols-4">
        <StatCard
          label="Outstanding"
          value={money(outstanding)}
          meta={`${openCredits.length} open account${openCredits.length === 1 ? "" : "s"}`}
          icon={<Wallet />}
        />
        <StatCard
          label="Overdue"
          value={money(overdueAmount)}
          meta={`${overdue.length} account${overdue.length === 1 ? "" : "s"} past due`}
          icon={<AlertTriangle />}
          tone="red"
          negative={overdueAmount > 0}
        />
        <StatCard
          label="Due within 7 days"
          value={money(
            dueSoon.reduce((sum, credit) => sum + Math.max(0, credit.total - credit.paid), 0),
          )}
          meta={`${dueSoon.length} reminder${dueSoon.length === 1 ? "" : "s"} recommended`}
          icon={<Clock3 />}
          tone="amber"
        />
        <StatCard
          label="Settled accounts"
          value={state.customerCredits.filter((credit) => credit.status === "Settled").length}
          meta="Recorded in the ledger"
          icon={<CheckCircle2 />}
          tone="blue"
        />
      </div>

      <div className="card">
        <div className="card-head" style={{ paddingBottom: 14 }}>
          <div>
            <h3>Customer credit ledger</h3>
            <p>Grace periods, partial settlements and WhatsApp reminders.</p>
          </div>
          <div className="row wrap">
            <input
              className="input"
              style={{ width: 220 }}
              placeholder="Search customer or vehicle…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Tabs<CreditFilter>
              value={filter}
              onChange={setFilter}
              tabs={[
                { id: "open", label: "Open", count: openCredits.length },
                {
                  id: "settled",
                  label: "Settled",
                  count: state.customerCredits.length - openCredits.length,
                },
                { id: "all", label: "All" },
              ]}
            />
          </div>
        </div>
        <div className="table-wrap">
          {credits.length === 0 ? (
            <EmptyState
              title="No credit accounts here"
              message="Credit sales initiated from the billing desk will appear in this ledger with their grace period and due date."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Vehicle</th>
                  <th className="num">Invoice</th>
                  <th className="num">Paid</th>
                  <th className="num">Balance</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {credits.map((credit) => {
                  const remaining = Math.max(0, credit.total - credit.paid);
                  const dueIn = daysUntil(credit.dueDate);
                  return (
                    <tr key={credit.id}>
                      <td>
                        <div className="cell-main">{credit.customerName}</div>
                        <div className="cell-sub">
                          {credit.phone} · {credit.creditDate.slice(0, 10)}
                        </div>
                      </td>
                      <td>
                        <div className="cell-main">{credit.vehicleNo}</div>
                        <div className="cell-sub">{credit.jobCardId}</div>
                      </td>
                      <td className="num">{money(credit.total)}</td>
                      <td className="num">{money(credit.paid)}</td>
                      <td className="num strong">{money(remaining)}</td>
                      <td>
                        <div className="cell-main" style={{ fontWeight: 600 }}>
                          {shortDate(credit.dueDate)}
                        </div>
                        <div
                          className="cell-sub"
                          style={{
                            color:
                              credit.status !== "Settled" && dueIn < 0
                                ? "var(--danger)"
                                : undefined,
                          }}
                        >
                          {credit.status === "Settled"
                            ? "Closed"
                            : dueIn < 0
                              ? `Overdue ${Math.abs(dueIn)}d`
                              : dueIn === 0
                                ? "Due today"
                                : `Due in ${dueIn}d`}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={credit.status} />
                      </td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="View purchased parts"
                            onClick={() => setPartsCredit(credit)}
                          >
                            <Package />
                            Parts
                          </button>
                          {credit.status !== "Settled" && (
                            <>
                              <button
                                className="btn btn-soft btn-sm"
                                onClick={() => openPayment(credit)}
                              >
                                Record payment
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Send WhatsApp reminder"
                                onClick={() => sendReminder(credit)}
                              >
                                <MessageCircle />
                                Remind
                              </button>
                            </>
                          )}
                          {credit.status === "Settled" && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                window.open(
                                  waLink(
                                    credit.phone,
                                    creditSettledMessage(
                                      credit.customerName,
                                      credit.vehicleNo,
                                      0,
                                      state.settings,
                                    ),
                                  ),
                                  "_blank",
                                  "noopener,noreferrer",
                                )
                              }
                            >
                              <MessageCircle />
                              Thank you
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setResult(null);
        }}
        title={result ? "Payment recorded" : "Record credit payment"}
        subtitle={
          selected
            ? `${selected.customerName} · ${selected.vehicleNo} · ${selected.jobCardId}`
            : undefined
        }
        size="wide"
        footer={
          result ? (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSelected(null);
                  setResult(null);
                }}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  window.open(
                    waLink(
                      result.credit.phone,
                      creditSettledMessage(
                        result.credit.customerName,
                        result.credit.vehicleNo,
                        result.remaining,
                        state.settings,
                      ),
                    ),
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                <MessageCircle />
                Send WhatsApp thank-you
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submitPayment}>
                Save payment
              </button>
            </>
          )
        }
      >
        {!selected ? null : result ? (
          <div className="success-panel" style={{ paddingTop: 0 }}>
            <div className="success-icon">
              <CheckCircle2 size={32} />
            </div>
            <h2>{result.remaining > 0 ? "Part payment recorded" : "Account settled"}</h2>
            <p>{result.message}</p>
            <div className="card" style={{ marginTop: 18, textAlign: "left" }}>
              <div className="card-body">
                <div className="kv">
                  <span>Invoice total</span>
                  <span>{money(result.credit.total)}</span>
                </div>
                <div className="kv">
                  <span>Balance after payment</span>
                  <span>{money(result.remaining)}</span>
                </div>
                <div className="kv">
                  <span>Due date</span>
                  <span>{shortDate(result.credit.dueDate)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="stack">
            <div className="grid cols-2">
              <div className="card">
                <div className="card-body">
                  <div className="kv">
                    <span>Invoice total</span>
                    <span>{money(selected.total)}</span>
                  </div>
                  <div className="kv">
                    <span>Already paid</span>
                    <span>{money(selected.paid)}</span>
                  </div>
                  <div className="kv">
                    <span>Balance</span>
                    <span>{money(selected.total - selected.paid)}</span>
                  </div>
                  <div className="kv">
                    <span>Due date</span>
                    <span>{shortDate(selected.dueDate)}</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-body stack">
                  <Field label="Payment amount (LKR)" required hint="Partial settlements are allowed.">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={selected.total - selected.paid}
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </Field>
                  <div className="row wrap">
                    {[0.25, 0.5, 1].map((fraction) => (
                      <button
                        key={fraction}
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          setAmount(
                            String(
                              Math.round(
                                (selected.total - selected.paid) * fraction * 100,
                              ) / 100,
                            ),
                          )
                        }
                      >
                        {fraction === 1 ? "Full balance" : `${fraction * 100}%`}
                      </button>
                    ))}
                  </div>
                  <div className="alert alert-info" style={{ marginTop: 2 }}>
                    <Wallet />
                    <div>
                      Remaining after this payment:{" "}
                      <strong>
                        {money(Math.max(0, selected.total - selected.paid - Number(amount || 0)))}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Field label="Payment method" required>
              <select
                className="select"
                value={method}
                onChange={(event) => setMethod(event.target.value as CreditPaymentMethod)}
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </Field>

            {method !== "Cheque" ? (
              <Field label="Receiving account" hint="Cash, card and transfer receipts post to this account.">
                <select
                  className="select"
                  value={bankAccountId}
                  onChange={(event) => setBankAccountId(event.target.value)}
                >
                  <option value="">No account selected</option>
                  {activeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.accountNumber}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <>
                <div className="form-grid">
                  <Field label="Cheque number" required>
                    <input
                      className="input"
                      placeholder="102345"
                      value={chequeNo}
                      onChange={(event) => setChequeNo(event.target.value)}
                    />
                  </Field>
                  <Field label="Bank" required>
                    <input
                      className="input"
                      placeholder="Bank of Ceylon"
                      value={chequeBank}
                      onChange={(event) => setChequeBank(event.target.value)}
                    />
                  </Field>
                  <Field label="Branch" required>
                    <input
                      className="input"
                      placeholder="Kandy"
                      value={chequeBranch}
                      onChange={(event) => setChequeBranch(event.target.value)}
                    />
                  </Field>
                  <Field label="Cheque date" required hint="Future dates are held as post-dated cheques.">
                    <input
                      className="input"
                      type="date"
                      value={chequeDate}
                      onChange={(event) => setChequeDate(event.target.value)}
                    />
                  </Field>
                </div>
                <p className="tiny muted">
                  The cheque is recorded on the incoming cheque board as In Safe. The balance is
                  credited immediately, and if the cheque bounces the credit balance is reopened
                  automatically.
                </p>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(partsCredit)}
        onClose={() => setPartsCredit(null)}
        title="Purchased parts on this credit invoice"
        subtitle={
          partsCredit
            ? `${partsCredit.customerName} · ${partsCredit.vehicleNo} · ${partsCredit.jobCardId}`
            : undefined
        }
        size="wide"
        footer={
          <button className="btn btn-secondary" onClick={() => setPartsCredit(null)}>
            Close
          </button>
        }
      >
        {partsCredit && (
          <div className="stack">
            <div className="grid cols-3">
              <div className="card">
                <div className="card-body">
                  <div className="kv">
                    <span>Invoice total</span>
                    <span>{money(partsCredit.total)}</span>
                  </div>
                  <div className="kv">
                    <span>Paid to date</span>
                    <span>{money(partsCredit.paid)}</span>
                  </div>
                  <div className="kv">
                    <span>Outstanding</span>
                    <span>{money(Math.max(0, partsCredit.total - partsCredit.paid))}</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-body">
                  <div className="kv">
                    <span>Vehicle</span>
                    <span>{partsCreditJob ? `${partsCreditJob.make} ${partsCreditJob.model}` : partsCredit.vehicleNo}</span>
                  </div>
                  <div className="kv">
                    <span>Repair type</span>
                    <span>{partsCreditJob?.repairType ?? "—"}</span>
                  </div>
                  <div className="kv">
                    <span>Due date</span>
                    <span>{shortDate(partsCredit.dueDate)}</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-body">
                  <div className="kv">
                    <span>Parts lines</span>
                    <span>{partsCreditParts.length}</span>
                  </div>
                  <div className="kv">
                    <span>Parts value</span>
                    <span>
                      {money(
                        partsCreditParts.reduce(
                          (sum, part) => sum + part.qtyIssued * part.sellingPrice,
                          0,
                        ),
                      )}
                    </span>
                  </div>
                  <div className="kv">
                    <span>Status</span>
                    <span><StatusBadge status={partsCredit.status} /></span>
                  </div>
                </div>
              </div>
            </div>

            {partsCreditParts.length === 0 ? (
              <EmptyState
                icon={<Package size={22} />}
                title="No parts on this invoice"
                message="This credit account was raised for labour only, or its parts were never issued from stores."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Supplier</th>
                      <th>Invoice</th>
                      <th className="num">Qty</th>
                      <th className="num">Unit price</th>
                      <th className="num">Line total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partsCreditParts.map((part) => {
                      const supplier = state.suppliers.find(
                        (entry) => entry.id === part.supplierId,
                      );
                      return (
                        <tr key={part.id}>
                          <td>
                            <div className="cell-main">{part.itemName}</div>
                            <div className="cell-sub">{part.itemId}</div>
                          </td>
                          <td className="small">{supplier?.name ?? "—"}</td>
                          <td className="small">{part.supplierInvoiceNo ?? "—"}</td>
                          <td className="num">{part.qtyIssued}</td>
                          <td className="num">{money(part.sellingPrice)}</td>
                          <td className="num strong">
                            {money(part.qtyIssued * part.sellingPrice)}
                          </td>
                          <td><StatusBadge status={part.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
