import { useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Download,
  Package,
  Printer,
  Scale,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { EmptyState, StatCard, Tabs } from "./ui";
import { formatQty, money, shortDate } from "../lib/utils";
import { expenseBreakdownForRange, pnlForRange } from "../lib/analytics";
import {
  debtorReport,
  downloadReportCsv,
  ledgerReport,
  readableReportDate,
  resolveReportRange,
  stockReport,
  trialBalanceReport,
  type LedgerKind,
  type ReportPreset,
} from "../lib/reports";

type ReportKind = "pnl" | "stock" | "trial" | "ledgers" | "debtors";

const reportLabels: Record<ReportKind, string> = {
  pnl: "Profit & loss",
  stock: "Stock",
  trial: "Trial balance",
  ledgers: "Separate ledgers",
  debtors: "Debtors",
};

const ledgerLabels: Record<LedgerKind, string> = {
  customer: "Customer ledger",
  supplier: "Supplier ledger",
  insurance: "Insurance ledger",
  bank: "Cash & bank",
};

function reportTitle(kind: ReportKind): string {
  return reportLabels[kind];
}

export function AccountingReports() {
  const { state } = useApp();
  const [kind, setKind] = useState<ReportKind>("stock");
  const [preset, setPreset] = useState<ReportPreset>("month");
  const [customStart, setCustomStart] = useState(
    () => resolveReportRange("month").start,
  );
  const [customEnd, setCustomEnd] = useState(() => resolveReportRange("month").end);
  const [ledgerKind, setLedgerKind] = useState<LedgerKind>("customer");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [preparedOn] = useState(() => shortDate(new Date().toISOString()));

  const range = useMemo(
    () => resolveReportRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );
  const pnl = useMemo(
    () => pnlForRange(state, range.start, range.end),
    [state, range.start, range.end],
  );
  const expenseLines = useMemo(
    () => expenseBreakdownForRange(state, range.start, range.end),
    [state, range.start, range.end],
  );
  const stock = useMemo(() => stockReport(state, range), [state, range]);
  const trial = useMemo(() => trialBalanceReport(state, range), [state, range]);
  const debtors = useMemo(() => debtorReport(state, range), [state, range]);
  const ledgers = useMemo(
    () => ledgerReport(state, range, ledgerKind),
    [state, range, ledgerKind],
  );
  const selectedLedger =
    ledgers.find((account) => account.id === selectedAccountId) ?? ledgers[0];

  function csvRows(): (string | number)[][] {
    const header: (string | number)[][] = [
      [state.settings.companyName || "Workshop"],
      [reportTitle(kind)],
      ["Period", range.label],
      [],
    ];
    if (kind === "stock") {
      return [
        ...header,
        [
          "Code",
          "Item",
          "Type",
          "Unit",
          "Opening",
          "In",
          "Out",
          "Closing",
          "Minimum",
          "Unit cost",
          "Closing value",
          "Status",
        ],
        ...stock.rows.map((row) => [
          row.code,
          row.name,
          row.type,
          row.unit,
          row.openingQty,
          row.inQty,
          row.outQty,
          row.closingQty,
          row.minStock,
          row.unitCost,
          row.closingValue,
          row.status,
        ]),
        [],
        ["Total closing value", stock.totalClosingValue],
        ["Total retail value", stock.totalRetailValue],
      ];
    }
    if (kind === "trial") {
      return [
        ...header,
        ["Account", "Group", "Debit", "Credit"],
        ...trial.rows.map((row) => [
          row.account,
          row.group,
          row.debit,
          row.credit,
        ]),
        [],
        ["Total", "", trial.totalDebit, trial.totalCredit],
      ];
    }
    if (kind === "debtors") {
      return [
        ...header,
        ["Customer debtors"],
        [
          "Customer",
          "Phone",
          "Vehicle",
          "Job",
          "Credit date",
          "Due date",
          "Kind",
          "Total",
          "Paid",
          "Balance",
          "Age days",
          "Overdue days",
        ],
        ...debtors.rows.map((row) => [
          row.customerName,
          row.phone,
          row.vehicleNo,
          row.jobCardId,
          row.creditDate.slice(0, 10),
          row.dueDate.slice(0, 10),
          row.kind,
          row.total,
          row.paid,
          row.balance,
          row.ageDays,
          row.overdueDays,
        ]),
        ["Total outstanding", "", "", "", "", "", "", "", "", debtors.totalOutstanding],
        [],
        ["Insurance debtors"],
        ["Insurer", "Claim", "Vehicle", "Bill date", "Bill", "Settled", "Balance", "Age days"],
        ...debtors.insuranceRows.map((row) => [
          row.insurerName,
          row.claimNo,
          row.vehicleNo,
          row.billDate.slice(0, 10),
          row.billAmount,
          row.settled,
          row.balance,
          row.ageDays,
        ]),
        [
          "Insurance outstanding",
          "",
          "",
          "",
          "",
          "",
          debtors.insuranceOutstanding,
        ],
      ];
    }
    if (kind === "ledgers") {
      return [
        ...header,
        [ledgerLabels[ledgerKind]],
        [],
        ...ledgers.flatMap((account) => [
          ["Account", account.name],
          ["Opening", account.opening],
          ["Date", "Reference", "Description", "Debit", "Credit", "Balance"],
          ...account.rows.map((row) => [
            row.date.slice(0, 10),
            row.reference,
            row.description,
            row.debit,
            row.credit,
            row.balance,
          ]),
          ["Closing", account.closing],
          [],
        ]),
      ];
    }
    return [
      ...header,
      ["Revenue"],
      ["Labour revenue", pnl.laborRevenue],
      ["Parts revenue", pnl.partsRevenue],
      ["Discounts", pnl.discounts],
      ["Net revenue", pnl.revenue],
      [],
      ["Cost of sales"],
      ["Parts cost", pnl.partsCost],
      ["Gross profit", pnl.grossProfit],
      [],
      ["Operating costs"],
      ["Technician commissions", pnl.commissions],
      ["Driver commissions", pnl.driverCommissions],
      ["Operating expenses", pnl.expenses],
      ["Petty cash expenses", pnl.pettyCashExpenses],
      ["Payroll", pnl.payroll],
      ["Net profit", pnl.netProfit],
      [],
      ["Cash collected", pnl.cashCollected],
      ["Credit settlements", pnl.creditSettlements],
      ["Customer receivables", pnl.receivables],
      ["Insurance receivables", pnl.insuranceReceivables],
      ["Supplier payables", pnl.payables],
      [],
      ["Expense breakdown"],
      ...expenseLines.map((row) => [row.category, row.amount]),
    ];
  }

  function exportCsv() {
    downloadReportCsv(
      `${reportTitle(kind).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${range.start}-to-${range.end}.csv`,
      csvRows(),
    );
  }

  function setPresetAndDates(next: ReportPreset) {
    setPreset(next);
    if (next === "custom") {
      const current = resolveReportRange("month");
      setCustomStart(range.start || current.start);
      setCustomEnd(range.end || current.end);
    }
  }

  return (
    <div className="stack report-sheet">
      <div className="card no-print">
        <div className="stack">
          <div className="row-between wrap">
            <div>
              <div className="small strong">Management reports</div>
              <div className="tiny muted">
                Every report follows the selected period. Pick a preset or enter exact
                dates, then print or export the figures.
              </div>
            </div>
            <div className="row wrap">
              <button className="btn btn-secondary btn-sm" onClick={exportCsv}>
                <Download />
                Export CSV
              </button>
              <button className="btn btn-soft btn-sm" onClick={() => window.print()}>
                <Printer />
                Print
              </button>
            </div>
          </div>

          <Tabs<ReportKind>
            value={kind}
            onChange={setKind}
            tabs={[
              { id: "stock", label: "Stock" },
              { id: "trial", label: "Trial balance" },
              { id: "ledgers", label: "Separate ledgers" },
              { id: "debtors", label: "Debtors" },
              { id: "pnl", label: "Profit & loss" },
            ]}
          />

          <div className="row-between wrap">
            <Tabs<ReportPreset>
              value={preset}
              onChange={setPresetAndDates}
              tabs={[
                { id: "today", label: "Today" },
                { id: "month", label: "This month" },
                { id: "last-month", label: "Last month" },
                { id: "year", label: "This year" },
                { id: "custom", label: "Custom" },
              ]}
            />
            <div className="row wrap">
              <label className="field" style={{ minWidth: 150 }}>
                <span className="field-label">From</span>
                <input
                  className="input"
                  type="date"
                  value={range.start}
                  onChange={(event) => {
                    setPreset("custom");
                    setCustomStart(event.target.value);
                    setCustomEnd(range.end);
                  }}
                />
              </label>
              <label className="field" style={{ minWidth: 150 }}>
                <span className="field-label">To</span>
                <input
                  className="input"
                  type="date"
                  value={range.end}
                  onChange={(event) => {
                    setPreset("custom");
                    setCustomStart(range.start);
                    setCustomEnd(event.target.value);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="card report-doc">
        <div className="report-letterhead">
          <div>
            <div className="report-company">
              {state.settings.companyName || "Workshop"}
            </div>
            <h2>{reportTitle(kind)}</h2>
            <div className="tiny muted">
              {range.label} · prepared {preparedOn}
            </div>
          </div>
          <div className="report-stamp">
            <div className="tiny muted">As at</div>
            <strong>{readableReportDate(range.end)}</strong>
          </div>
        </div>

        {kind === "stock" && (
          <div className="stack">
            <div className="grid cols-4">
              <StatCard
                label="Stock items"
                value={String(stock.totalItems)}
                meta={`${stock.lowStock} low · ${stock.outOfStock} out of stock`}
                icon={<Package />}
              />
              <StatCard
                label="Closing stock value"
                value={money(stock.totalClosingValue)}
                meta="At last recorded cost"
                icon={<Wallet />}
                tone="blue"
              />
              <StatCard
                label="Retail value"
                value={money(stock.totalRetailValue)}
                meta="At last selling price"
                icon={<TrendingUp />}
                tone="purple"
              />
              <StatCard
                label="Period movement"
                value={`${formatQty(stock.movementIn)} in`}
                meta={`${formatQty(stock.movementOut)} issued or returned out`}
                icon={<BarChart3 />}
                tone="amber"
              />
            </div>
            {stock.rows.length === 0 ? (
              <EmptyState
                icon={<Package size={22} />}
                title="No stock items"
                message="Add inventory items and purchases to build the stock report."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Type</th>
                      <th className="num">Opening</th>
                      <th className="num">In</th>
                      <th className="num">Out</th>
                      <th className="num">Closing</th>
                      <th className="num">Minimum</th>
                      <th className="num">Unit cost</th>
                      <th className="num">Closing value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="cell-main">{row.name}</div>
                          <div className="cell-sub">
                            {row.code} · {row.supplierName}
                          </div>
                        </td>
                        <td>{row.type}</td>
                        <td className="num">{formatQty(row.openingQty, row.unit)}</td>
                        <td className="num">{formatQty(row.inQty, row.unit)}</td>
                        <td className="num">{formatQty(row.outQty, row.unit)}</td>
                        <td className="num strong">
                          {formatQty(row.closingQty, row.unit)}
                        </td>
                        <td className="num">{formatQty(row.minStock, row.unit)}</td>
                        <td className="num">{money(row.unitCost, 2)}</td>
                        <td className="num strong">{money(row.closingValue)}</td>
                        <td>
                          <span
                            className={`badge ${
                              row.status === "Out"
                                ? "badge-red"
                                : row.status === "Low"
                                  ? "badge-amber"
                                  : "badge-green"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {kind === "trial" && (
          <div className="stack">
            <div className="grid cols-4">
              <StatCard
                label="Total debits"
                value={money(trial.totalDebit)}
                meta="Closing balances and period costs"
                icon={<Scale />}
              />
              <StatCard
                label="Total credits"
                value={money(trial.totalCredit)}
                meta="Income, liabilities and capital"
                icon={<Scale />}
                tone="blue"
              />
              <StatCard
                label="Difference"
                value={money(trial.totalDebit - trial.totalCredit)}
                meta={trial.balanced ? "Trial balance agrees" : "Check the report"}
                icon={<BarChart3 />}
                tone={trial.balanced ? "brand" : "red"}
              />
              <StatCard
                label="Accounts"
                value={String(trial.rows.length)}
                meta={`As at ${readableReportDate(range.end)}`}
                icon={<BookOpen />}
                tone="purple"
              />
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Group</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {trial.rows.map((row) => (
                    <tr key={`${row.group}-${row.account}`}>
                      <td className="strong">{row.account}</td>
                      <td>{row.group}</td>
                      <td className="num">{row.debit ? money(row.debit) : "—"}</td>
                      <td className="num">{row.credit ? money(row.credit) : "—"}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="strong">Total</td>
                    <td />
                    <td className="num strong">{money(trial.totalDebit)}</td>
                    <td className="num strong">{money(trial.totalCredit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="alert alert-info no-print">
              <Scale />
              <div>
                This management trial balance uses closing asset and liability
                balances at the period end and income and expenditure for the
                selected period. The capital line is the balancing figure from
                operational records, so opening balances and untracked tax
                adjustments sit there.
              </div>
            </div>
          </div>
        )}

        {kind === "ledgers" && (
          <div className="stack">
            <div className="row-between wrap no-print">
              <Tabs<LedgerKind>
                value={ledgerKind}
                onChange={(next) => {
                  setLedgerKind(next);
                  setSelectedAccountId("");
                }}
                tabs={[
                  { id: "customer", label: "Customers" },
                  { id: "supplier", label: "Suppliers" },
                  { id: "insurance", label: "Insurance" },
                  { id: "bank", label: "Cash & bank" },
                ]}
              />
              {ledgers.length > 0 && (
                <label className="field" style={{ minWidth: 230 }}>
                  <span className="field-label">Account</span>
                  <select
                    className="input"
                    value={selectedLedger?.id ?? ""}
                    onChange={(event) => setSelectedAccountId(event.target.value)}
                  >
                    {ledgers.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {ledgers.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={22} />}
                title={`No ${ledgerLabels[ledgerKind].toLowerCase()} activity`}
                message="Choose another period or ledger, or record a transaction."
              />
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th className="num">Opening</th>
                        <th className="num">Debit</th>
                        <th className="num">Credit</th>
                        <th className="num">Closing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgers.map((account) => (
                        <tr
                          key={account.id}
                          className="report-row-select"
                          onClick={() => setSelectedAccountId(account.id)}
                        >
                          <td>
                            <div className="cell-main">{account.name}</div>
                            <div className="cell-sub">{account.subtitle}</div>
                          </td>
                          <td className="num">{money(account.opening)}</td>
                          <td className="num">{money(account.debit)}</td>
                          <td className="num">{money(account.credit)}</td>
                          <td className="num strong">{money(account.closing)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedLedger && (
                  <div className="report-ledger-detail">
                    <div className="row-between wrap">
                      <div>
                        <div className="small strong">{selectedLedger.name}</div>
                        <div className="tiny muted">
                          {selectedLedger.subtitle} · {ledgerLabels[ledgerKind]} for{" "}
                          {range.label}
                        </div>
                      </div>
                      <div className="tiny muted">
                        Opening {money(selectedLedger.opening)} · Closing{" "}
                        <strong>{money(selectedLedger.closing)}</strong>
                      </div>
                    </div>
                    {selectedLedger.rows.length === 0 ? (
                      <EmptyState
                        icon={<BookOpen size={22} />}
                        title="No transactions in this period"
                        message="The opening and closing balance are still shown."
                      />
                    ) : (
                      <div className="table-wrap">
                        <table className="data">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Reference</th>
                              <th>Description</th>
                              <th className="num">Debit</th>
                              <th className="num">Credit</th>
                              <th className="num">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td colSpan={5} className="muted">
                                Opening balance
                              </td>
                              <td className="num strong">
                                {money(selectedLedger.opening)}
                              </td>
                            </tr>
                            {selectedLedger.rows.map((row) => (
                              <tr key={row.id}>
                                <td>{shortDate(row.date)}</td>
                                <td>
                                  <div className="cell-main">{row.reference}</div>
                                </td>
                                <td>{row.description}</td>
                                <td className="num">
                                  {row.debit ? money(row.debit) : "—"}
                                </td>
                                <td className="num">
                                  {row.credit ? money(row.credit) : "—"}
                                </td>
                                <td className="num strong">{money(row.balance)}</td>
                              </tr>
                            ))}
                            <tr>
                              <td colSpan={3} className="strong">
                                Closing balance
                              </td>
                              <td className="num strong">{money(selectedLedger.debit)}</td>
                              <td className="num strong">{money(selectedLedger.credit)}</td>
                              <td className="num strong">{money(selectedLedger.closing)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {kind === "debtors" && (
          <div className="stack">
            <div className="grid cols-4">
              <StatCard
                label="Customer debtors"
                value={money(debtors.totalOutstanding)}
                meta={`${debtors.rows.length} open credit account${
                  debtors.rows.length === 1 ? "" : "s"
                }`}
                icon={<Users />}
                tone="amber"
              />
              <StatCard
                label="Overdue"
                value={money(debtors.totalOverdue)}
                meta="Past the agreed due date"
                icon={<BarChart3 />}
                tone={debtors.totalOverdue > 0 ? "red" : "brand"}
              />
              <StatCard
                label="Insurance debtors"
                value={money(debtors.insuranceOutstanding)}
                meta={`${debtors.insuranceRows.length} claim${
                  debtors.insuranceRows.length === 1 ? "" : "s"
                } awaiting settlement`}
                icon={<Wallet />}
                tone="blue"
              />
              <StatCard
                label="Total receivable"
                value={money(
                  debtors.totalOutstanding + debtors.insuranceOutstanding,
                )}
                meta={`As at ${readableReportDate(range.end)}`}
                icon={<Scale />}
                tone="purple"
              />
            </div>

            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Ageing</th>
                    <th className="num">Balance</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.buckets.map((bucket) => (
                    <tr key={bucket.bucket}>
                      <td className="strong">{bucket.bucket} days</td>
                      <td className="num">{money(bucket.amount)}</td>
                      <td className="num">
                        {debtors.totalOutstanding > 0
                          ? `${((bucket.amount / debtors.totalOutstanding) * 100).toFixed(1)}%`
                          : "0.0%"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="small strong" style={{ marginBottom: 6 }}>
                Customer credit accounts
              </div>
              {debtors.rows.length === 0 ? (
                <EmptyState
                  icon={<Users size={22} />}
                  title="No customer debtors"
                  message="All customer credit is settled for this period."
                />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Vehicle</th>
                        <th>Credit date</th>
                        <th>Due date</th>
                        <th className="num">Total</th>
                        <th className="num">Paid</th>
                        <th className="num">Balance</th>
                        <th className="num">Age</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debtors.rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <div className="cell-main">{row.customerName}</div>
                            <div className="cell-sub">
                              {row.phone} · {row.kind}
                            </div>
                          </td>
                          <td>
                            <div className="cell-main">{row.vehicleNo}</div>
                            <div className="cell-sub">{row.jobCardId}</div>
                          </td>
                          <td>{shortDate(row.creditDate)}</td>
                          <td>{shortDate(row.dueDate)}</td>
                          <td className="num">{money(row.total)}</td>
                          <td className="num">{money(row.paid)}</td>
                          <td className="num strong">{money(row.balance)}</td>
                          <td className="num">{row.ageDays}d</td>
                          <td>
                            <span
                              className={`badge ${
                                row.overdueDays > 0 ? "badge-red" : "badge-amber"
                              }`}
                            >
                              {row.overdueDays > 0
                                ? `${row.overdueDays}d overdue`
                                : "Current"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="small strong" style={{ marginBottom: 6 }}>
                Insurance receivables
              </div>
              {debtors.insuranceRows.length === 0 ? (
                <EmptyState
                  icon={<Wallet size={22} />}
                  title="No insurance debtors"
                  message="Every insurance bill is settled for this period."
                />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Insurer</th>
                        <th>Claim</th>
                        <th>Vehicle</th>
                        <th>Bill date</th>
                        <th className="num">Billed</th>
                        <th className="num">Settled</th>
                        <th className="num">Balance</th>
                        <th className="num">Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debtors.insuranceRows.map((row) => (
                        <tr key={row.id}>
                          <td className="strong">{row.insurerName}</td>
                          <td>
                            <div className="cell-main">{row.claimNo}</div>
                            <div className="cell-sub">{row.id}</div>
                          </td>
                          <td>{row.vehicleNo}</td>
                          <td>{shortDate(row.billDate)}</td>
                          <td className="num">{money(row.billAmount)}</td>
                          <td className="num">{money(row.settled)}</td>
                          <td className="num strong">{money(row.balance)}</td>
                          <td className="num">{row.ageDays}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {kind === "pnl" && (
          <div className="stack">
            <div className="grid cols-4">
              <StatCard
                label="Revenue"
                value={money(pnl.revenue)}
                meta={`${money(pnl.cashSales)} cash, card & bank`}
                icon={<Wallet />}
              />
              <StatCard
                label="Gross profit"
                value={money(pnl.grossProfit)}
                meta={`${pnl.grossMargin.toFixed(1)}% after ${money(pnl.partsCost)} parts cost`}
                icon={<TrendingUp />}
                tone="blue"
              />
              <StatCard
                label="Operating costs"
                value={money(
                  pnl.expenses +
                    pnl.pettyCashExpenses +
                    pnl.commissions +
                    pnl.driverCommissions +
                    pnl.payroll,
                )}
                meta={`Payroll ${money(pnl.payroll)} · commissions ${money(
                  pnl.commissions + pnl.driverCommissions,
                )}`}
                icon={<BarChart3 />}
                tone="amber"
              />
              <StatCard
                label="Net profit"
                value={money(pnl.netProfit)}
                meta={pnl.netProfit < 0 ? "Loss for the period" : "Profit for the period"}
                icon={<Scale />}
                tone={pnl.netProfit < 0 ? "red" : "purple"}
              />
            </div>

            <div className="grid cols-2">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Profit & loss</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="strong">Revenue</td>
                      <td className="num" />
                    </tr>
                    <tr>
                      <td>Labour revenue</td>
                      <td className="num">{money(pnl.laborRevenue)}</td>
                    </tr>
                    <tr>
                      <td>Parts revenue</td>
                      <td className="num">{money(pnl.partsRevenue)}</td>
                    </tr>
                    <tr>
                      <td>Less discounts</td>
                      <td className="num">({money(pnl.discounts)})</td>
                    </tr>
                    <tr>
                      <td className="strong">Net revenue</td>
                      <td className="num strong">{money(pnl.revenue)}</td>
                    </tr>
                    <tr>
                      <td className="strong">Cost of sales</td>
                      <td className="num" />
                    </tr>
                    <tr>
                      <td>Parts cost</td>
                      <td className="num">({money(pnl.partsCost)})</td>
                    </tr>
                    <tr>
                      <td className="strong">Gross profit</td>
                      <td className="num strong">{money(pnl.grossProfit)}</td>
                    </tr>
                    <tr>
                      <td className="strong">Operating costs</td>
                      <td className="num" />
                    </tr>
                    <tr>
                      <td>Technician commissions</td>
                      <td className="num">({money(pnl.commissions)})</td>
                    </tr>
                    <tr>
                      <td>Driver commissions</td>
                      <td className="num">({money(pnl.driverCommissions)})</td>
                    </tr>
                    <tr>
                      <td>Operating expenses</td>
                      <td className="num">({money(pnl.expenses)})</td>
                    </tr>
                    <tr>
                      <td>Petty cash expenses</td>
                      <td className="num">({money(pnl.pettyCashExpenses)})</td>
                    </tr>
                    <tr>
                      <td>Payroll and employer contributions</td>
                      <td className="num">({money(pnl.payroll)})</td>
                    </tr>
                    <tr>
                      <td className="strong">Net profit</td>
                      <td
                        className="num strong"
                        style={{
                          color:
                            pnl.netProfit < 0 ? "var(--danger)" : "var(--success)",
                        }}
                      >
                        {money(pnl.netProfit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="stack">
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Revenue mix</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Cash, card & bank</td>
                        <td className="num">{money(pnl.cashSales)}</td>
                      </tr>
                      <tr>
                        <td>Credit sales</td>
                        <td className="num">{money(pnl.creditSales)}</td>
                      </tr>
                      <tr>
                        <td>Insurance sales</td>
                        <td className="num">{money(pnl.insuranceSales)}</td>
                      </tr>
                      <tr>
                        <td className="strong">Total revenue</td>
                        <td className="num strong">{money(pnl.revenue)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Collections & balances</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Cash collected in period</td>
                        <td className="num">{money(pnl.cashCollected)}</td>
                      </tr>
                      <tr>
                        <td>Credit settlements</td>
                        <td className="num">{money(pnl.creditSettlements)}</td>
                      </tr>
                      <tr>
                        <td>Customer receivables (now)</td>
                        <td className="num">{money(pnl.receivables)}</td>
                      </tr>
                      <tr>
                        <td>Insurance receivables (now)</td>
                        <td className="num">{money(pnl.insuranceReceivables)}</td>
                      </tr>
                      <tr>
                        <td>Supplier payables (now)</td>
                        <td className="num">{money(pnl.payables)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Expense breakdown</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseLines.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="muted">
                            No operating expenses in this period.
                          </td>
                        </tr>
                      ) : (
                        expenseLines.map((row) => (
                          <tr key={row.category}>
                            <td>{row.category}</td>
                            <td className="num">{money(row.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
