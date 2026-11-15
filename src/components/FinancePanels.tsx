import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  History,
  Landmark,
  Plus,
  Printer,
  ShieldCheck,
  Undo2,
  Wallet,
  XCircle,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import {
  dateOnly,
  daysUntil,
  money,
  shortDate,
} from "../lib/utils";
import {
  Alert,
  EmptyState,
  Field,
  Modal,
  StatCard,
  StatusBadge,
  Tabs,
} from "./ui";
import { useToast } from "./Toast";
import { printThermalPettyCashVoucher } from "../lib/ird";
import type {
  BankAccount,
  BankDirection,
  CustomerCheque,
  PettyCashCategory,
  WorkshopLoanPayment,
} from "../types";

const PETTY_CASH_MINIMUM = 3000;

const pettyCategories: PettyCashCategory[] = [
  "Fuel",
  "Transport",
  "Office Supplies",
  "Refreshments",
  "Repairs",
  "Other",
];

function printHtml(title: string, body: string) {
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:24px;color:#0f172a;background:#fff}
  .voucher{max-width:460px;margin:0 auto;border:1px dashed #94a3b8;border-radius:14px;padding:20px}
  h1{font-size:18px;margin:0 0 2px}
  h2{font-size:14px;margin:0 0 14px;color:#475569;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
  .muted{color:#64748b;font-size:12px}
  .kv{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
  .kv strong{text-align:right}
  .amount{font-size:26px;font-weight:800;margin:14px 0 4px}
  .sig{display:flex;gap:24px;margin-top:36px}
  .sig div{flex:1;border-top:1px solid #94a3b8;padding-top:6px;font-size:11px;color:#64748b;text-align:center}
  img{max-width:100%;border-radius:10px;margin-top:12px;border:1px solid #e2e8f0}
  @media print{body{padding:0}.voucher{border:none}}
</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  win.document.close();
}

export function printPettyCashVoucher(
  entry: {
    voucherNo?: string;
    receiptNo: string;
    date: string;
    category: string;
    amount: number;
    description: string;
    paidTo?: string;
    recordedBy?: string;
    photoDataUrl?: string;
  },
  companyName: string,
) {
  printHtml(
    `Petty cash voucher ${entry.voucherNo ?? entry.receiptNo}`,
    `<div class="voucher">
      <h1>${companyName}</h1>
      <h2>Petty cash expense voucher</h2>
      <div class="kv"><span>Voucher</span><strong>${entry.voucherNo ?? entry.receiptNo}</strong></div>
      <div class="kv"><span>Date</span><strong>${shortDate(entry.date)}</strong></div>
      <div class="kv"><span>Category</span><strong>${entry.category}</strong></div>
      <div class="kv"><span>Paid to</span><strong>${entry.paidTo || "—"}</strong></div>
      <div class="kv"><span>Description</span><strong>${entry.description}</strong></div>
      <div class="amount">${money(entry.amount)}</div>
      <div class="muted">Recorded by ${entry.recordedBy ?? "—"}</div>
      ${entry.photoDataUrl ? `<img src="${entry.photoDataUrl}" alt="Receipt photo" />` : ""}
      <div class="sig"><div>Prepared by</div><div>Approved by</div><div>Received by</div></div>
    </div>`,
  );
}

function printPettyCashTopUp(
  entry: { receiptNo: string; date: string; amount: number; description: string; recordedBy?: string; bankAccountName?: string },
  companyName: string,
) {
  printHtml(
    `Petty cash top-up ${entry.receiptNo}`,
    `<div class="voucher">
      <h1>${companyName}</h1>
      <h2>Petty cash float top-up</h2>
      <div class="kv"><span>Receipt</span><strong>${entry.receiptNo}</strong></div>
      <div class="kv"><span>Date</span><strong>${shortDate(entry.date)}</strong></div>
      <div class="kv"><span>Source account</span><strong>${entry.bankAccountName ?? "—"}</strong></div>
      <div class="kv"><span>Note</span><strong>${entry.description}</strong></div>
      <div class="amount">${money(entry.amount)}</div>
      <div class="muted">Recorded by ${entry.recordedBy ?? "—"}</div>
      <div class="sig"><div>Cashier</div><div>Accounting</div></div>
    </div>`,
  );
}

export function PettyCashPanel() {
  const { state, addPettyCashTopUp, addPettyCashExpense } = useApp();
  const { push } = useToast();
  const [tab, setTab] = useState<"all" | "expenses" | "topups">("all");
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpForm, setTopUpForm] = useState({ amount: "", bankAccountId: "", note: "" });
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: "Fuel" as PettyCashCategory,
    amount: "",
    description: "",
    paidTo: "",
    photoDataUrl: "",
  });
  const photoInput = useRef<HTMLInputElement | null>(null);

  const balance = state.pettyCash.reduce(
    (sum, entry) => sum + (entry.type === "Float_Topup" ? entry.amount : -entry.amount),
    0,
  );
  const topUps = state.pettyCash.filter((entry) => entry.type === "Float_Topup");
  const expenses = state.pettyCash.filter((entry) => entry.type === "Expense");
  const totalTopUps = topUps.reduce((sum, entry) => sum + entry.amount, 0);
  const totalExpenses = expenses.reduce((sum, entry) => sum + entry.amount, 0);
  const low = balance < PETTY_CASH_MINIMUM;

  const rows = useMemo(() => {
    const source =
      tab === "expenses" ? expenses : tab === "topups" ? topUps : state.pettyCash;
    return [...source].sort((a, b) => b.date.localeCompare(a.date));
  }, [tab, state.pettyCash, expenses, topUps]);

  function openTopUp() {
    setTopUpForm({
      amount: "",
      bankAccountId: state.bankAccounts.find((account) => account.active)?.id ?? "",
      note: "",
    });
    setTopUpOpen(true);
  }

  function saveTopUp() {
    const amount = Number(topUpForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      push("Enter a valid float amount.", "error");
      return;
    }
    const result = addPettyCashTopUp(
      amount,
      topUpForm.bankAccountId,
      topUpForm.note.trim() || "Petty cash float top-up",
    );
    if (!result.ok) {
      push(result.message ?? "Could not top up the float.", "error");
      return;
    }
    push(`Float topped up · ${result.reference ?? ""}.`);
    setTopUpOpen(false);
  }

  function openExpense() {
    setExpenseForm({
      category: "Fuel",
      amount: "",
      description: "",
      paidTo: "",
      photoDataUrl: "",
    });
    setExpenseOpen(true);
  }

  function attachPhoto(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setExpenseForm((prev) => ({ ...prev, photoDataUrl: String(reader.result ?? "") }));
    };
    reader.readAsDataURL(file);
  }

  function saveExpense() {
    const amount = Number(expenseForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      push("Enter a valid voucher amount.", "error");
      return;
    }
    if (!expenseForm.description.trim()) {
      push("Enter the expense description.", "error");
      return;
    }
    const result = addPettyCashExpense({
      category: expenseForm.category,
      amount,
      description: expenseForm.description.trim(),
      paidTo: expenseForm.paidTo.trim(),
      photoDataUrl: expenseForm.photoDataUrl || undefined,
    });
    if (!result.ok) {
      push(result.message ?? "Could not save the voucher.", "error");
      return;
    }
    push(`Voucher ${result.reference ?? ""} saved.`);
    setExpenseOpen(false);
  }

  return (
    <div className="stack">
      <div className="grid cols-4">
        <StatCard
          label="Float balance"
          value={money(balance)}
          meta={low ? "Below the LKR 3,000 minimum" : "Healthy float"}
          icon={<Wallet />}
          tone={low ? "red" : "brand"}
          negative={low}
        />
        <StatCard label="Total top-ups" value={money(totalTopUps)} meta={`${topUps.length} top-up${topUps.length === 1 ? "" : "s"}`} icon={<Landmark />} tone="blue" />
        <StatCard label="Voucher expenses" value={money(totalExpenses)} meta={`${expenses.length} voucher${expenses.length === 1 ? "" : "s"}`} icon={<Banknote />} tone="amber" />
        <StatCard label="Minimum policy" value={money(PETTY_CASH_MINIMUM)} meta="Alert triggers below this balance" icon={<ShieldCheck />} tone="purple" />
      </div>

      {low && (
        <Alert tone="warn" title="Petty cash is low">
          The float holds {money(balance)}, below the LKR 3,000 minimum. Top up from a bank
          account so the cashier can keep issuing vouchers.
        </Alert>
      )}

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Petty cash float</h3>
            <p>Expense vouchers with category, receipt photo and printable A5 voucher.</p>
          </div>
          <div className="row wrap">
            <Tabs<"all" | "expenses" | "topups">
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "all", label: "All", count: state.pettyCash.length },
                { id: "expenses", label: "Vouchers", count: expenses.length },
                { id: "topups", label: "Top-ups", count: topUps.length },
              ]}
            />
            <button className="btn btn-secondary btn-sm" onClick={openTopUp}>
              <Landmark />
              Top up float
            </button>
            <button className="btn btn-primary btn-sm" onClick={openExpense}>
              <Plus />
              New voucher
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Wallet size={22} />}
            title="No petty cash activity"
            message="Top up the float from a bank account and record expense vouchers. Low balances raise an alert automatically."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Voucher</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th>By</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="cell-main">{entry.voucherNo ?? entry.receiptNo}</div>
                      <div className="cell-sub">{entry.type === "Float_Topup" ? "Float top-up" : "Expense"}</div>
                    </td>
                    <td className="small">{shortDate(entry.date)}</td>
                    <td><span className="chip">{entry.category}</span></td>
                    <td className="small">
                      {entry.description}
                      {entry.paidTo ? <div className="cell-sub">Paid to {entry.paidTo}</div> : null}
                    </td>
                    <td className={`num strong ${entry.type === "Expense" ? "overdue-text" : ""}`}>
                      {entry.type === "Expense" ? "−" : "+"} {money(entry.amount)}
                    </td>
                    <td className="tiny">{entry.recordedBy ?? "—"}</td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        {entry.photoDataUrl && (
                          <a className="btn btn-ghost btn-sm" href={entry.photoDataUrl} target="_blank" rel="noreferrer">
                            Photo
                          </a>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Print voucher"
                          onClick={() =>
                            entry.type === "Float_Topup"
                              ? printPettyCashTopUp(
                                  {
                                    ...entry,
                                    bankAccountName: state.bankAccounts.find((account) => account.id === entry.bankAccountId)?.name,
                                  },
                                  state.settings.companyName,
                                )
                              : printThermalPettyCashVoucher(entry, state.settings)
                          }
                        >
                          <Printer />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        title="Top up petty cash float"
        subtitle="The amount is debited from the selected bank or cash account."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setTopUpOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveTopUp}>
              <Landmark />
              Top up
            </button>
          </>
        }
      >
        <div className="stack">
          <Field label="Amount (LKR)" required>
            <input className="input" type="number" min={1} value={topUpForm.amount} onChange={(event) => setTopUpForm({ ...topUpForm, amount: event.target.value })} />
          </Field>
          <Field label="Source account" required>
            <select className="select" value={topUpForm.bankAccountId} onChange={(event) => setTopUpForm({ ...topUpForm, bankAccountId: event.target.value })}>
              <option value="">Choose account</option>
              {state.bankAccounts.filter((account) => account.active).map((account) => (
                <option key={account.id} value={account.id}>{account.name} · {account.accountNumber}</option>
              ))}
            </select>
          </Field>
          <Field label="Note">
            <input className="input" placeholder="Monthly float top-up" value={topUpForm.note} onChange={(event) => setTopUpForm({ ...topUpForm, note: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        title="New petty cash voucher"
        subtitle={`Float balance ${money(balance)} · vouchers cannot exceed the float.`}
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setExpenseOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveExpense}>
              <Plus />
              Save voucher
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Category" required>
              <select className="select" value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value as PettyCashCategory })}>
                {pettyCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount (LKR)" required>
              <input className="input" type="number" min={1} value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} />
            </Field>
            <Field label="Paid to">
              <input className="input" placeholder="Vendor or staff member" value={expenseForm.paidTo} onChange={(event) => setExpenseForm({ ...expenseForm, paidTo: event.target.value })} />
            </Field>
            <Field label="Description" required full>
              <input className="input" placeholder="Fuel for parts collection run" value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} />
            </Field>
          </div>
          <Field label="Receipt photo" hint="Optional — attach a photo of the bill for audit.">
            <div className="row wrap">
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(event) => attachPhoto(event.target.files?.[0] ?? null)}
              />
              <button className="btn btn-secondary btn-sm" onClick={() => photoInput.current?.click()}>
                Choose photo
              </button>
              {expenseForm.photoDataUrl && (
                <>
                  <img src={expenseForm.photoDataUrl} alt="Receipt preview" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8 }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpenseForm({ ...expenseForm, photoDataUrl: "" })}>
                    Remove
                  </button>
                </>
              )}
            </div>
          </Field>
          <Alert tone="info">
            Petty cash expenses post to the profit & loss statement under operating expenses.
          </Alert>
        </div>
      </Modal>
    </div>
  );
}

export function BankAccountsPanel() {
  const { state, addBankAccount, addBankTransaction, transferBetweenAccounts } = useApp();
  const { push } = useToast();
  const [selectedId, setSelectedId] = useState(state.bankAccounts[0]?.id ?? "");
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({
    name: "",
    bankName: "",
    branch: "",
    accountNumber: "",
    type: "Bank" as BankAccount["type"],
    openingBalance: "",
  });
  const [txOpen, setTxOpen] = useState(false);
  const [txForm, setTxForm] = useState({
    accountId: selectedId,
    direction: "Credit_In" as BankDirection,
    amount: "",
    category: "",
    description: "",
    date: dateOnly(new Date().toISOString()),
    reference: "",
  });
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromId: "",
    toId: "",
    amount: "",
    note: "",
  });

  function balanceFor(accountId: string): number {
    const account = state.bankAccounts.find((entry) => entry.id === accountId);
    if (!account) return 0;
    return state.bankTransactions
      .filter((entry) => entry.accountId === accountId)
      .reduce(
        (sum, entry) =>
          sum + (entry.direction === "Credit_In" ? entry.amount : -entry.amount),
        account.openingBalance,
      );
  }

  const selected = state.bankAccounts.find((account) => account.id === selectedId) ?? null;
  const selectedTransactions = selected
    ? [...state.bankTransactions]
        .filter((entry) => entry.accountId === selected.id)
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  let running = selected?.openingBalance ?? 0;
  const statementRows = selectedTransactions.map((entry) => {
    running += entry.direction === "Credit_In" ? entry.amount : -entry.amount;
    return { ...entry, running };
  });
  const totalLiquidity = state.bankAccounts.reduce(
    (sum, account) => sum + balanceFor(account.id),
    0,
  );

  function saveAccount() {
    if (!accountForm.name.trim() || !accountForm.bankName.trim()) {
      push("Enter an account name and bank name.", "error");
      return;
    }
    const opening = Number(accountForm.openingBalance) || 0;
    addBankAccount({
      name: accountForm.name.trim(),
      bankName: accountForm.bankName.trim(),
      branch: accountForm.branch.trim(),
      accountNumber: accountForm.accountNumber.trim(),
      type: accountForm.type,
      openingBalance: opening,
      active: true,
    });
    push("Bank account added with its opening balance.");
    setAccountOpen(false);
    setAccountForm({ name: "", bankName: "", branch: "", accountNumber: "", type: "Bank", openingBalance: "" });
  }

  function openTransaction(direction: BankDirection) {
    setTxForm({
      accountId: selectedId || state.bankAccounts[0]?.id || "",
      direction,
      amount: "",
      category: direction === "Credit_In" ? "Other Income" : "Operational Cost",
      description: "",
      date: dateOnly(new Date().toISOString()),
      reference: "",
    });
    setTxOpen(true);
  }

  function saveTransaction() {
    const result = addBankTransaction({
      accountId: txForm.accountId,
      direction: txForm.direction,
      amount: Number(txForm.amount),
      category: txForm.category,
      description: txForm.description,
      date: txForm.date,
      reference: txForm.reference,
    });
    if (!result.ok) {
      push(result.message ?? "Could not save the transaction.", "error");
      return;
    }
    push("Bank transaction recorded.");
    setTxOpen(false);
  }

  function openTransfer() {
    const active = state.bankAccounts.filter((account) => account.active);
    setTransferForm({
      fromId: active[0]?.id ?? "",
      toId: active[1]?.id ?? "",
      amount: "",
      note: "",
    });
    setTransferOpen(true);
  }

  function saveTransfer() {
    const result = transferBetweenAccounts(
      transferForm.fromId,
      transferForm.toId,
      Number(transferForm.amount),
      transferForm.note,
    );
    if (!result.ok) {
      push(result.message ?? "Could not transfer funds.", "error");
      return;
    }
    push("Internal transfer recorded on both accounts.");
    setTransferOpen(false);
  }

  return (
    <div className="stack">
      <div className="grid cols-4">
        <StatCard label="Total liquidity" value={money(totalLiquidity)} meta={`${state.bankAccounts.length} account${state.bankAccounts.length === 1 ? "" : "s"}`} icon={<Landmark />} />
        <StatCard label="Bank accounts" value={state.bankAccounts.filter((account) => account.type === "Bank").length} meta="Current and savings" icon={<Landmark />} tone="blue" />
        <StatCard label="Cash accounts" value={state.bankAccounts.filter((account) => account.type === "Cash").length} meta="Drawer and safe" icon={<Wallet />} tone="amber" />
        <StatCard label="Transactions" value={state.bankTransactions.length} meta="Inflows and outflows" icon={<History />} tone="purple" />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Bank & cash accounts</h3>
            <p>Opening balances, live balances and internal transfers.</p>
          </div>
          <div className="row wrap">
            <button className="btn btn-secondary btn-sm" onClick={openTransfer} disabled={state.bankAccounts.length < 2}>
              <ArrowLeftRight />
              Transfer
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setAccountOpen(true)}>
              <Plus />
              Add account
            </button>
          </div>
        </div>
        {state.bankAccounts.length === 0 ? (
          <EmptyState
            icon={<Landmark size={22} />}
            title="No bank accounts"
            message="Add each bank or cash account with its opening balance to track liquidity, cheque deposits and supplier payments."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Number</th>
                  <th className="num">Opening</th>
                  <th className="num">Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.bankAccounts.map((account) => {
                  const balance = balanceFor(account.id);
                  return (
                    <tr
                      key={account.id}
                      onClick={() => setSelectedId(account.id)}
                      style={{ cursor: "pointer", background: account.id === selectedId ? "var(--brand-soft)" : undefined }}
                    >
                      <td>
                        <div className="cell-main">{account.name}</div>
                        <div className="cell-sub">{account.bankName} · {account.branch}</div>
                      </td>
                      <td><span className="chip">{account.type}</span></td>
                      <td className="small">{account.accountNumber}</td>
                      <td className="num">{money(account.openingBalance)}</td>
                      <td className={`num strong ${balance < 0 ? "overdue-text" : ""}`}>{money(balance)}</td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="btn btn-soft btn-sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(account.id);
                              setTxForm((prev) => ({ ...prev, accountId: account.id }));
                              setTxOpen(false);
                              setTimeout(() => openTransaction("Credit_In"), 0);
                            }}
                          >
                            Inflow
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(account.id);
                              setTimeout(() => openTransaction("Debit_Out"), 0);
                            }}
                          >
                            Outflow
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

      {selected && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>{selected.name} — statement</h3>
              <p>Opening balance {money(selected.openingBalance)} · running balance after each entry.</p>
            </div>
            <div className="row wrap">
              <button className="btn btn-secondary btn-sm" onClick={() => openTransaction("Credit_In")}>
                <Plus />
                Inflow
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => openTransaction("Debit_Out")}>
                Outflow
              </button>
            </div>
          </div>
          {statementRows.length === 0 ? (
            <EmptyState
              icon={<History size={22} />}
              title="No transactions"
              message="Record an opening balance transaction, cheque deposit or manual inflow/outflow to start the statement."
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th className="num">In</th>
                    <th className="num">Out</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statementRows
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((entry) => (
                      <tr key={entry.id}>
                        <td className="small">{shortDate(entry.date)}</td>
                        <td><span className="chip">{entry.category}</span></td>
                        <td className="small">{entry.description}</td>
                        <td className="tiny">{entry.reference ?? "—"}</td>
                        <td className="num">{entry.direction === "Credit_In" ? money(entry.amount) : "—"}</td>
                        <td className="num">{entry.direction === "Debit_Out" ? money(entry.amount) : "—"}</td>
                        <td className="num strong">{money(entry.running)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title="Add bank or cash account"
        subtitle="The opening balance posts as the first transaction."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAccountOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveAccount}>Save account</button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Account name" required>
            <input className="input" placeholder="Bank of Ceylon — Current" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} />
          </Field>
          <Field label="Bank name" required>
            <input className="input" placeholder="Bank of Ceylon" value={accountForm.bankName} onChange={(event) => setAccountForm({ ...accountForm, bankName: event.target.value })} />
          </Field>
          <Field label="Branch">
            <input className="input" placeholder="Peradeniya" value={accountForm.branch} onChange={(event) => setAccountForm({ ...accountForm, branch: event.target.value })} />
          </Field>
          <Field label="Account number">
            <input className="input" placeholder="0079456123" value={accountForm.accountNumber} onChange={(event) => setAccountForm({ ...accountForm, accountNumber: event.target.value })} />
          </Field>
          <Field label="Type" required>
            <select className="select" value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value as BankAccount["type"] })}>
              <option value="Bank">Bank</option>
              <option value="Cash">Cash</option>
            </select>
          </Field>
          <Field label="Opening balance (LKR)">
            <input className="input" type="number" placeholder="0" value={accountForm.openingBalance} onChange={(event) => setAccountForm({ ...accountForm, openingBalance: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={txOpen}
        onClose={() => setTxOpen(false)}
        title={txForm.direction === "Credit_In" ? "Record bank inflow" : "Record bank outflow"}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setTxOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveTransaction}>Save transaction</button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Account" required>
              <select className="select" value={txForm.accountId} onChange={(event) => setTxForm({ ...txForm, accountId: event.target.value })}>
                <option value="">Choose account</option>
                {state.bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Direction" required>
              <select className="select" value={txForm.direction} onChange={(event) => setTxForm({ ...txForm, direction: event.target.value as BankDirection })}>
                <option value="Credit_In">Inflow — money in</option>
                <option value="Debit_Out">Outflow — money out</option>
              </select>
            </Field>
            <Field label="Amount (LKR)" required>
              <input className="input" type="number" min={1} value={txForm.amount} onChange={(event) => setTxForm({ ...txForm, amount: event.target.value })} />
            </Field>
            <Field label="Category">
              <input className="input" placeholder="Other Income" value={txForm.category} onChange={(event) => setTxForm({ ...txForm, category: event.target.value })} />
            </Field>
            <Field label="Date" required>
              <input className="input" type="date" value={txForm.date} onChange={(event) => setTxForm({ ...txForm, date: event.target.value })} />
            </Field>
            <Field label="Reference">
              <input className="input" placeholder="Receipt or slip number" value={txForm.reference} onChange={(event) => setTxForm({ ...txForm, reference: event.target.value })} />
            </Field>
            <Field label="Description" required full>
              <input className="input" placeholder="What is this transaction for?" value={txForm.description} onChange={(event) => setTxForm({ ...txForm, description: event.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Internal transfer"
        subtitle="Moves funds between two accounts and records both sides."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setTransferOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveTransfer}>
              <ArrowLeftRight />
              Transfer
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="From account" required>
              <select className="select" value={transferForm.fromId} onChange={(event) => setTransferForm({ ...transferForm, fromId: event.target.value })}>
                <option value="">Choose account</option>
                {state.bankAccounts.filter((account) => account.active).map((account) => (
                  <option key={account.id} value={account.id}>{account.name} · {money(balanceFor(account.id))}</option>
                ))}
              </select>
            </Field>
            <Field label="To account" required>
              <select className="select" value={transferForm.toId} onChange={(event) => setTransferForm({ ...transferForm, toId: event.target.value })}>
                <option value="">Choose account</option>
                {state.bankAccounts.filter((account) => account.active).map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount (LKR)" required>
              <input className="input" type="number" min={1} value={transferForm.amount} onChange={(event) => setTransferForm({ ...transferForm, amount: event.target.value })} />
            </Field>
            <Field label="Note">
              <input className="input" placeholder="Cash drawer replenishment" value={transferForm.note} onChange={(event) => setTransferForm({ ...transferForm, note: event.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface ChequeActionState {
  cheque: CustomerCheque;
  next: CustomerCheque["status"];
}

export function CustomerChequePanel() {
  const { state, updateCustomerChequeStatus } = useApp();
  const { push } = useToast();
  const [statusFilter, setStatusFilter] = useState<"all" | CustomerCheque["status"]>("all");
  const [pending, setPending] = useState<ChequeActionState | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [bounceReason, setBounceReason] = useState("");

  const cheques = [...state.customerCheques]
    .filter((cheque) => statusFilter === "all" || cheque.status === statusFilter)
    .sort((a, b) => a.chequeDate.localeCompare(b.chequeDate));

  const inSafe = state.customerCheques.filter((cheque) => cheque.status === "In_Safe");
  const deposited = state.customerCheques.filter((cheque) => cheque.status === "Deposited");
  const bounced = state.customerCheques.filter((cheque) => cheque.status === "Bounced");
  const pendingValue = inSafe.reduce((sum, cheque) => sum + cheque.amount, 0);

  function openAction(cheque: CustomerCheque, next: CustomerCheque["status"]) {
    setPending({ cheque, next });
    setBankAccountId(cheque.bankAccountId ?? state.bankAccounts[0]?.id ?? "");
    setBounceReason(cheque.bounceReason ?? "");
  }

  function saveAction() {
    if (!pending) return;
    if (pending.next === "Bounced" && !bounceReason.trim()) {
      push("Enter the bank bounce reason.", "error");
      return;
    }
    const result = updateCustomerChequeStatus(
      pending.cheque.id,
      pending.next,
      pending.next === "Bounced" ? bounceReason.trim() : undefined,
      bankAccountId || undefined,
    );
    if (!result.ok) {
      push(result.message ?? "Could not update the cheque.", "error");
      return;
    }
    push(
      pending.next === "Bounced"
        ? "Cheque marked bounced. Customer credit and job balance reopened."
        : pending.next === "Cleared"
          ? "Cheque cleared and posted to the bank account."
          : "Cheque marked deposited.",
    );
    setPending(null);
  }

  return (
    <div className="stack">
      <div className="grid cols-4">
        <StatCard label="Cheques in safe" value={money(pendingValue)} meta={`${inSafe.length} awaiting deposit`} icon={<ShieldCheck />} tone="amber" />
        <StatCard label="Deposited" value={state.customerCheques.filter((cheque) => cheque.status === "Deposited").length} meta="Awaiting bank clearance" icon={<Landmark />} tone="blue" />
        <StatCard label="Cleared" value={state.customerCheques.filter((cheque) => cheque.status === "Cleared").length} meta="Posted to bank" icon={<CheckCircle2 />} tone="brand" />
        <StatCard label="Bounced" value={money(bounced.reduce((sum, cheque) => sum + cheque.amount, 0))} meta={`${bounced.length} returned cheque${bounced.length === 1 ? "" : "s"}`} icon={<XCircle />} tone="red" negative={bounced.length > 0} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Incoming cheque board</h3>
            <p>Post-dated customer and insurer cheques through safe, deposit, clearance and bounce.</p>
          </div>
          <Tabs<"all" | CustomerCheque["status"]>
            value={statusFilter}
            onChange={setStatusFilter}
            tabs={[
              { id: "all", label: "All", count: state.customerCheques.length },
              { id: "In_Safe", label: "In safe", count: inSafe.length },
              { id: "Deposited", label: "Deposited", count: deposited.length },
              { id: "Cleared", label: "Cleared" },
              { id: "Bounced", label: "Bounced", count: bounced.length },
            ]}
          />
        </div>
        {cheques.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={22} />}
            title="No cheques here"
            message="Dated cheques accepted at checkout, advance, credit settlement or insurance are tracked on this board."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Cheque</th>
                  <th>Customer</th>
                  <th>Source</th>
                  <th>Cheque date</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cheques.map((cheque) => {
                  const due = daysUntil(cheque.chequeDate);
                  return (
                    <tr key={cheque.id}>
                      <td>
                        <div className="cell-main">{cheque.chequeNo}</div>
                        <div className="cell-sub">{cheque.bank} · {cheque.branch}</div>
                      </td>
                      <td>
                        <div className="cell-main">{cheque.customerName}</div>
                        <div className="cell-sub">{cheque.vehicleNo} · {cheque.phone}</div>
                      </td>
                      <td><span className="chip">{cheque.source}</span></td>
                      <td>
                        <div className="cell-main">{shortDate(cheque.chequeDate)}</div>
                        <div className="cell-sub">
                          {cheque.status === "Cleared"
                            ? "Cleared"
                            : due < 0
                              ? `Overdue ${Math.abs(due)}d`
                              : due === 0
                                ? "Today"
                                : `In ${due}d`}
                        </div>
                      </td>
                      <td className="num strong">{money(cheque.amount)}</td>
                      <td>
                        <StatusBadge status={cheque.status.replaceAll("_", " ")} />
                        {cheque.bounceReason && <div className="cell-sub">{cheque.bounceReason}</div>}
                      </td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end" }}>
                          {cheque.status === "In_Safe" && (
                            <button className="btn btn-soft btn-sm" onClick={() => openAction(cheque, "Deposited")}>
                              Deposit
                            </button>
                          )}
                          {(cheque.status === "In_Safe" || cheque.status === "Deposited") && (
                            <>
                              <button className="btn btn-secondary btn-sm" onClick={() => openAction(cheque, "Cleared")}>
                                Clear
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => openAction(cheque, "Bounced")}>
                                Bounce
                              </button>
                            </>
                          )}
                          {cheque.status === "Bounced" && (
                            <span className="tiny muted">Balance reopened</span>
                          )}
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

      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={
          pending
            ? `Mark cheque ${pending.cheque.chequeNo} ${pending.next.toLowerCase()}`
            : "Update cheque"
        }
        subtitle={pending ? `${pending.cheque.customerName} · ${money(pending.cheque.amount)}` : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPending(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveAction}>Save status</button>
          </>
        }
      >
        {pending && (
          <div className="stack">
            {pending.next !== "Bounced" && (
              <Field label="Bank account" hint={pending.next === "Deposited" ? "Where the cheque will be deposited." : "Where the cleared funds landed."}>
                <select className="select" value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}>
                  <option value="">No account</option>
                  {state.bankAccounts.filter((account) => account.active).map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </Field>
            )}
            {pending.next === "Bounced" && (
              <Field label="Bounce reason" required>
                <input className="input" placeholder="Insufficient funds — returned by issuing bank" value={bounceReason} onChange={(event) => setBounceReason(event.target.value)} />
              </Field>
            )}
            {pending.next === "Bounced" && (
              <Alert tone="warn" title="Balance will reopen">
                The customer credit or job balance will be reopened and the cheque marked Bounced with
                the reason stored for follow-up.
              </Alert>
            )}
            {pending.next === "Cleared" && (
              <Alert tone="info" title="Cleared funds post to the bank">
                The cheque amount will be recorded as an inflow in the selected account.
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function SupplierChequeLoanPanel() {
  const {
    state,
    clearSupplierCheque,
    takeBackSupplierCheque,
    addWorkshopLoan,
    payWorkshopLoanInstallment,
  } = useApp();
  const { push } = useToast();
  const [chequeTarget, setChequeTarget] = useState<{ id: string; mode: "clear" | "takeback" } | null>(null);
  const [chequeBankId, setChequeBankId] = useState("");
  const [loanOpen, setLoanOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    lender: "",
    purpose: "",
    principal: "",
    monthlyInstallment: "",
    startDate: dateOnly(new Date().toISOString()),
  });
  const [paymentTarget, setPaymentTarget] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "Bank Transfer" as WorkshopLoanPayment["method"],
    bankAccountId: "",
  });

  const loans = [...state.workshopLoans].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const activeLoans = loans.filter((loan) => loan.status === "Active");
  const loanBalance = activeLoans.reduce((sum, loan) => sum + loan.balance, 0);
  const monthlyBurden = activeLoans.reduce((sum, loan) => sum + loan.monthlyInstallment, 0);
  const pendingCheques = state.supplierCheques.filter((cheque) => cheque.status === "Issued_PDC");

  function openCheque(id: string, mode: "clear" | "takeback") {
    setChequeTarget({ id, mode });
    setChequeBankId(state.bankAccounts.find((account) => account.active)?.id ?? "");
  }

  function saveChequeAction() {
    if (!chequeTarget) return;
    const result =
      chequeTarget.mode === "clear"
        ? clearSupplierCheque(chequeTarget.id, chequeBankId)
        : takeBackSupplierCheque(chequeTarget.id, chequeBankId);
    if (!result.ok) {
      push(result.message ?? "Could not update the supplier cheque.", "error");
      return;
    }
    push(
      chequeTarget.mode === "clear"
        ? "Supplier cheque cleared and invoice settled."
        : "Cheque taken back and supplier paid in cash.",
    );
    setChequeTarget(null);
  }

  function openPayment(loanId: string) {
    const loan = state.workshopLoans.find((entry) => entry.id === loanId);
    setPaymentTarget(loanId);
    setPaymentForm({
      amount: loan ? String(Math.min(loan.monthlyInstallment, loan.balance)) : "",
      method: "Bank Transfer",
      bankAccountId: state.bankAccounts.find((account) => account.active)?.id ?? "",
    });
  }

  function saveLoan() {
    const principal = Number(loanForm.principal);
    const monthly = Number(loanForm.monthlyInstallment);
    if (!loanForm.lender.trim() || principal <= 0 || monthly <= 0) {
      push("Enter the lender, principal and monthly installment.", "error");
      return;
    }
    addWorkshopLoan({
      lender: loanForm.lender.trim(),
      purpose: loanForm.purpose.trim(),
      principal,
      monthlyInstallment: monthly,
      startDate: loanForm.startDate,
    });
    push("Workshop loan added with the next due date one month away.");
    setLoanOpen(false);
  }

  function savePayment() {
    if (!paymentTarget) return;
    const result = payWorkshopLoanInstallment(
      paymentTarget,
      Number(paymentForm.amount),
      paymentForm.method,
      paymentForm.bankAccountId || undefined,
    );
    if (!result.ok) {
      push(result.message ?? "Could not record the installment.", "error");
      return;
    }
    push(`Loan installment recorded · ${result.reference ?? ""}.`);
    setPaymentTarget(null);
  }

  return (
    <div className="stack">
      <div className="grid cols-4">
        <StatCard label="Supplier PDCs" value={money(pendingCheques.reduce((sum, cheque) => sum + cheque.amount, 0))} meta={`${pendingCheques.length} cheque${pendingCheques.length === 1 ? "" : "s"} issued`} icon={<CalendarDays />} tone="amber" />
        <StatCard label="Workshop loan balance" value={money(loanBalance)} meta={`${activeLoans.length} active loan${activeLoans.length === 1 ? "" : "s"}`} icon={<Landmark />} tone="red" negative={loanBalance > 0} />
        <StatCard label="Monthly installments" value={money(monthlyBurden)} meta="Due across all active loans" icon={<Banknote />} tone="blue" />
        <StatCard label="Repayments recorded" value={state.workshopLoanPayments.length} meta="Installments posted to bank accounts" icon={<CheckCircle2 />} tone="purple" />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Supplier post-dated cheques</h3>
            <p>Cheques issued for supplier invoices. Clear on the due date or take back and pay cash.</p>
          </div>
        </div>
        {state.supplierCheques.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title="No supplier cheques"
            message="Issue a post-dated cheque against an unpaid supplier invoice and it will appear here until it clears."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Cheque</th>
                  <th>Supplier</th>
                  <th>Invoice</th>
                  <th>Cheque date</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...state.supplierCheques]
                  .sort((a, b) => a.chequeDate.localeCompare(b.chequeDate))
                  .map((cheque) => {
                    const supplier = state.suppliers.find((entry) => entry.id === cheque.supplierId);
                    const purchase = state.purchases.find((entry) => entry.id === cheque.purchaseId);
                    const due = daysUntil(cheque.chequeDate);
                    return (
                      <tr key={cheque.id}>
                        <td>
                          <div className="cell-main">{cheque.chequeNo}</div>
                          <div className="cell-sub">{cheque.bank} · {cheque.branch}</div>
                        </td>
                        <td className="small">{supplier?.name ?? "—"}</td>
                        <td className="small">{purchase?.invoiceNo ?? "—"}</td>
                        <td>
                          <div className="cell-main">{shortDate(cheque.chequeDate)}</div>
                          <div className="cell-sub">
                            {cheque.status === "Issued_PDC"
                              ? due < 0
                                ? `Overdue ${Math.abs(due)}d`
                                : due === 0
                                  ? "Due today"
                                  : `In ${due}d`
                              : "—"}
                          </div>
                        </td>
                        <td className="num strong">{money(cheque.amount)}</td>
                        <td><StatusBadge status={cheque.status.replaceAll("_", " ")} /></td>
                        <td>
                          <div className="row" style={{ justifyContent: "flex-end" }}>
                            {cheque.status === "Issued_PDC" && (
                              <>
                                <button className="btn btn-soft btn-sm" onClick={() => openCheque(cheque.id, "clear")}>
                                  Clear
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => openCheque(cheque.id, "takeback")}>
                                  <Undo2 />
                                  Take back & pay cash
                                </button>
                              </>
                            )}
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

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Workshop loans & installments</h3>
            <p>Track lender balances, monthly installments and payment receipts.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setLoanOpen(true)}>
            <Plus />
            Add loan
          </button>
        </div>
        {loans.length === 0 ? (
          <EmptyState
            icon={<Landmark size={22} />}
            title="No workshop loans"
            message="Record equipment or vehicle loans with their monthly installment to track the outstanding balance."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Lender</th>
                  <th>Purpose</th>
                  <th className="num">Principal</th>
                  <th className="num">Balance</th>
                  <th className="num">Monthly</th>
                  <th>Next due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.id}>
                    <td className="cell-main">{loan.lender}</td>
                    <td className="small">{loan.purpose}</td>
                    <td className="num">{money(loan.principal)}</td>
                    <td className="num strong">{money(loan.balance)}</td>
                    <td className="num">{money(loan.monthlyInstallment)}</td>
                    <td className="small">{shortDate(loan.nextDueDate)}</td>
                    <td><StatusBadge status={loan.status} /></td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        {loan.status === "Active" && (
                          <button className="btn btn-soft btn-sm" onClick={() => openPayment(loan.id)}>
                            <Banknote />
                            Pay installment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {state.workshopLoanPayments.length > 0 && (
          <div className="table-wrap" style={{ borderTop: "1px solid var(--border)" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Loan</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {[...state.workshopLoanPayments]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((payment) => {
                    const loan = state.workshopLoans.find((entry) => entry.id === payment.loanId);
                    return (
                      <tr key={payment.id}>
                        <td className="cell-main">{payment.receiptNo}</td>
                        <td className="small">{loan?.lender ?? "—"}</td>
                        <td className="small">{shortDate(payment.date)}</td>
                        <td><span className="chip">{payment.method}</span></td>
                        <td className="num strong">{money(payment.amount)}</td>
                        <td className="tiny">{payment.recordedBy ?? "—"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(chequeTarget)}
        onClose={() => setChequeTarget(null)}
        title={chequeTarget?.mode === "clear" ? "Clear supplier cheque" : "Take back cheque & pay cash"}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setChequeTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveChequeAction}>
              {chequeTarget?.mode === "clear" ? "Clear cheque" : "Take back & pay"}
            </button>
          </>
        }
      >
        <div className="stack">
          <Field label="Pay from account" required>
            <select className="select" value={chequeBankId} onChange={(event) => setChequeBankId(event.target.value)}>
              <option value="">Choose account</option>
              {state.bankAccounts.filter((account) => account.active).map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </Field>
          <Alert tone={chequeTarget?.mode === "clear" ? "info" : "warn"}>
            {chequeTarget?.mode === "clear"
              ? "Clearing records the cheque as an outflow and settles the supplier invoice."
              : "The cheque is returned to you and the supplier is paid in cash. The invoice is settled immediately."}
          </Alert>
        </div>
      </Modal>

      <Modal
        open={loanOpen}
        onClose={() => setLoanOpen(false)}
        title="Add workshop loan"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setLoanOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveLoan}>Save loan</button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Lender" required full>
            <input className="input" placeholder="Sampath Bank — SME Term Loan" value={loanForm.lender} onChange={(event) => setLoanForm({ ...loanForm, lender: event.target.value })} />
          </Field>
          <Field label="Purpose" full>
            <input className="input" placeholder="Equipment upgrade" value={loanForm.purpose} onChange={(event) => setLoanForm({ ...loanForm, purpose: event.target.value })} />
          </Field>
          <Field label="Principal (LKR)" required>
            <input className="input" type="number" min={1} value={loanForm.principal} onChange={(event) => setLoanForm({ ...loanForm, principal: event.target.value })} />
          </Field>
          <Field label="Monthly installment (LKR)" required>
            <input className="input" type="number" min={1} value={loanForm.monthlyInstallment} onChange={(event) => setLoanForm({ ...loanForm, monthlyInstallment: event.target.value })} />
          </Field>
          <Field label="Start date" required>
            <input className="input" type="date" value={loanForm.startDate} onChange={(event) => setLoanForm({ ...loanForm, startDate: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(paymentTarget)}
        onClose={() => setPaymentTarget(null)}
        title="Pay loan installment"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPaymentTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={savePayment}>Save payment</button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Amount (LKR)" required>
              <input className="input" type="number" min={1} value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} />
            </Field>
            <Field label="Method" required>
              <select className="select" value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value as WorkshopLoanPayment["method"] })}>
                <option value="Bank Transfer">Bank transfer</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
              </select>
            </Field>
            <Field label="Bank account">
              <select className="select" value={paymentForm.bankAccountId} onChange={(event) => setPaymentForm({ ...paymentForm, bankAccountId: event.target.value })}>
                <option value="">No account</option>
                {state.bankAccounts.filter((account) => account.active).map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Alert tone="info">
            The installment reduces the loan balance and posts an outflow to the selected account.
          </Alert>
        </div>
      </Modal>
    </div>
  );
}

export function FinanceWarning({ message }: { message: string }) {
  return (
    <Alert tone="warn">
      <AlertTriangle size={16} /> {message}
    </Alert>
  );
}
