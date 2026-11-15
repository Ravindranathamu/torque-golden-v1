import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  Landmark,
  Megaphone,
  Package,
  ReceiptText,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { commissionsByWorker, dailySales, pnlFor, type Period } from "../lib/analytics";
import { daysUntil, jobTotals, money, shortDate, timeAgo } from "../lib/utils";
import { PageHeader, StatCard, StatusBadge, Tabs } from "../components/ui";

export function DashboardPage() {
  const { state, currentUser } = useApp();
  const [period, setPeriod] = useState<Period>("month");

  const pnl = useMemo(() => pnlFor(state, period), [state, period]);
  const todayPnl = useMemo(() => pnlFor(state, "today"), [state]);
  const daily = useMemo(() => dailySales(state, 7), [state]);
  const maxDay = Math.max(1, ...daily.map((day) => day.total));
  const commissions = useMemo(() => commissionsByWorker(state, "month"), [state]);
  const topCommission = Math.max(1, ...commissions.map((row) => row.commission));
  const creditShare = pnl.revenue > 0 ? (pnl.creditSales / pnl.revenue) * 100 : 0;

  const activeJobs = state.jobCards
    .filter((job) => job.status !== "Dispatched")
    .sort((a, b) => (b.acceptedAt ?? b.createdAt).localeCompare(a.acceptedAt ?? a.createdAt));

  const pendingCheckIns = state.checkIns.filter((checkIn) => checkIn.status === "Awaiting Approval");
  const pendingParts = state.parts.filter((part) =>
    ["Requested", "Backordered", "Exchange Pending", "Return Pending"].includes(part.status),
  );
  const lowStock = state.inventory.filter((item) => item.stock < item.minStock);
  const openCredits = state.customerCredits.filter((credit) => credit.status !== "Settled");
  const overdueCredits = openCredits.filter((credit) => daysUntil(credit.dueDate) < 0);
  const dueSupplierPurchases = state.purchases.filter(
    (purchase) =>
      purchase.type === "Credit" &&
      purchase.status === "Unpaid" &&
      purchase.dueDate &&
      daysUntil(purchase.dueDate) <= 7,
  );
  const readyMarketing = state.marketing.filter(
    (reminder) =>
      reminder.status === "Pending" &&
      (!reminder.readyAt || new Date(reminder.readyAt) <= new Date()),
  );
  const billingQueue = state.jobCards.filter((job) => job.status === "Repair Completed");
  const gateQueue = state.jobCards.filter(
    (job) => job.status === "Paid" || job.status === "Released on Credit",
  );

  const attention = [
    {
      icon: <ClipboardCheck />,
      label: `${pendingCheckIns.length} vehicle${pendingCheckIns.length === 1 ? "" : "s"} at the gate`,
      detail: "Waiting for PRO inspection and acceptance",
      link: "/gate",
      tone: "amber",
      count: pendingCheckIns.length,
    },
    {
      icon: <ReceiptText />,
      label: `${billingQueue.length} job${billingQueue.length === 1 ? "" : "s"} ready to bill`,
      detail: "Repair completed and waiting at the cashier",
      link: "/cashier",
      tone: "purple",
      count: billingQueue.length,
    },
    {
      icon: <Package />,
      label: `${pendingParts.length} parts request${pendingParts.length === 1 ? "" : "s"} open`,
      detail: "Requests, backorders, returns or exchanges",
      link: "/stores",
      tone: "blue",
      count: pendingParts.length,
    },
    {
      icon: <Package />,
      label: `${lowStock.length} item${lowStock.length === 1 ? "" : "s"} below minimum`,
      detail: "Stock alerts need a supplier order",
      link: "/stores",
      tone: "red",
      count: lowStock.length,
    },
    {
      icon: <CreditCard />,
      label: `${overdueCredits.length} customer credit${overdueCredits.length === 1 ? "" : "s"} overdue`,
      detail: "Grace period passed — send a WhatsApp reminder",
      link: "/accounting",
      tone: "red",
      count: overdueCredits.length,
    },
    {
      icon: <Banknote />,
      label: `${dueSupplierPurchases.length} supplier payment${dueSupplierPurchases.length === 1 ? "" : "s"} due`,
      detail: "Credit invoices due within 7 days",
      link: "/accounting",
      tone: "amber",
      count: dueSupplierPurchases.length,
    },
    {
      icon: <Megaphone />,
      label: `${readyMarketing.length} marketing reminder${readyMarketing.length === 1 ? "" : "s"} ready`,
      detail: "Service cycles and mileage milestones",
      link: "/marketing",
      tone: "blue",
      count: readyMarketing.length,
    },
    {
      icon: <Wrench />,
      label: `${gateQueue.length} vehicle${gateQueue.length === 1 ? "" : "s"} awaiting handover`,
      detail: "Paid or on credit — PRO gate clearance",
      link: "/gate",
      tone: "brand",
      count: gateQueue.length,
    },
  ].filter((item) => item.count > 0);

  const recentLedger = [...state.ledger]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="page">
      <PageHeader
        title={`${greeting}, ${currentUser?.name.split(" ")[0] ?? "Owner"}`}
        subtitle={`Live workshop performance · ${new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}`}
        actions={
          <>
            <Tabs<Period>
              value={period}
              onChange={setPeriod}
              tabs={[
                { id: "today", label: "Today" },
                { id: "month", label: "This month" },
                { id: "year", label: "This year" },
              ]}
            />
            <Link className="btn btn-secondary" to="/cashier">
              <ReceiptText />
              Billing queue
              {billingQueue.length > 0 && <span className="badge badge-amber">{billingQueue.length}</span>}
            </Link>
          </>
        }
      />

      <div className="grid cols-4">
        <StatCard
          label={`Revenue · ${period === "today" ? "today" : period === "month" ? "month" : "year"}`}
          value={money(pnl.revenue)}
          meta={`${money(todayPnl.revenue)} billed today`}
          icon={<Wallet />}
        />
        <StatCard
          label="Gross profit"
          value={money(pnl.grossProfit)}
          meta={`${pnl.grossMargin.toFixed(1)}% margin after parts cost`}
          icon={<TrendingUp />}
          tone="blue"
        />
        <StatCard
          label="Net profit"
          value={money(pnl.netProfit)}
          meta="After commissions, payroll & expenses"
          icon={<CircleDollarSign />}
          tone={pnl.netProfit < 0 ? "red" : "purple"}
          negative={pnl.netProfit < 0}
        />
        <StatCard
          label="Receivables"
          value={money(pnl.receivables)}
          meta={`${openCredits.length} open customer credit account${openCredits.length === 1 ? "" : "s"}`}
          icon={<CreditCard />}
          tone="amber"
        />
      </div>

      <div className="grid cols-4" style={{ marginTop: 18 }}>
        <StatCard
          label="Cash & card sales"
          value={money(pnl.cashSales)}
          meta={`${pnl.revenue > 0 ? (100 - creditShare).toFixed(0) : 0}% of invoiced revenue`}
          icon={<Banknote />}
        />
        <StatCard
          label="Credit sales"
          value={money(pnl.creditSales)}
          meta="Recognised as revenue, cash later"
          icon={<CreditCard />}
          tone="amber"
        />
        <StatCard
          label="Vehicles on the floor"
          value={state.jobCards.filter((job) => job.status === "In Progress").length}
          meta={`${billingQueue.length} awaiting billing · ${gateQueue.length} at gate`}
          icon={<Wrench />}
          tone="blue"
        />
        <StatCard
          label="Low stock alerts"
          value={lowStock.length}
          meta={
            lowStock.length
              ? `${lowStock.slice(0, 2).map((item) => item.name).join(", ")}${lowStock.length > 2 ? "…" : ""}`
              : "All inventory above minimum"
          }
          icon={<AlertTriangle />}
          tone={lowStock.length ? "red" : "brand"}
          negative={lowStock.length > 0}
        />
      </div>

      <div className="grid cols-4" style={{ marginTop: 18 }}>
        <StatCard
          label="Bank & cash liquidity"
          value={money(pnl.bankLiquidity)}
          meta={`${state.bankAccounts.length} account${state.bankAccounts.length === 1 ? "" : "s"} across banks and drawers`}
          icon={<Landmark />}
          tone={pnl.bankLiquidity < 0 ? "red" : "blue"}
          negative={pnl.bankLiquidity < 0}
        />
        <StatCard
          label="Petty cash float"
          value={money(pnl.pettyCashBalance)}
          meta={
            pnl.pettyCashBalance < 3000
              ? "Below the LKR 3,000 minimum — top up"
              : "Above the minimum float policy"
          }
          icon={<Wallet />}
          tone={pnl.pettyCashBalance < 3000 ? "red" : "brand"}
          negative={pnl.pettyCashBalance < 3000}
        />
        <StatCard
          label="Insurance receivables"
          value={money(pnl.insuranceReceivables)}
          meta={`${state.insuranceJobs.filter((claim) => claim.status !== "Settled").length} open insurer claim${state.insuranceJobs.filter((claim) => claim.status !== "Settled").length === 1 ? "" : "s"}`}
          icon={<ClipboardCheck />}
          tone="purple"
        />
        <StatCard
          label="Supplier payables"
          value={money(pnl.payables)}
          meta="Unpaid credit invoices and post-dated cheques"
          icon={<CalendarDays />}
          tone="amber"
        />
      </div>

      <div className="grid cols-3" style={{ marginTop: 18 }}>
        <div className="card span-2">
          <div className="card-head">
            <div>
              <h3>Sales rhythm · last 7 days</h3>
              <p>Cash/card collected versus credit invoiced.</p>
            </div>
            <div className="legend">
              <span>
                <i style={{ background: "var(--brand)" }} /> Cash & card
              </span>
              <span>
                <i style={{ background: "var(--accent)" }} /> Credit
              </span>
            </div>
          </div>
          <div className="card-body">
            <div className="bar-chart">
              {daily.map((day) => (
                <div className="bar-wrap" key={day.key}>
                  <div className="bar-group">
                    <div
                      className="bar"
                      title={`Cash & card ${money(day.cash)}`}
                      style={{ height: `${Math.max(2, (day.cash / maxDay) * 100)}%` }}
                    />
                    <div
                      className="bar credit"
                      title={`Credit ${money(day.credit)}`}
                      style={{ height: `${Math.max(2, (day.credit / maxDay) * 100)}%` }}
                    />
                  </div>
                  <span>{day.label}</span>
                  <span className="bar-value">{day.total > 0 ? `${Math.round(day.total / 1000)}k` : "—"}</span>
                </div>
              ))}
            </div>
            <div className="divider" />
            <div className="row-between wrap small muted">
              <span>
                <strong style={{ color: "var(--ink)" }}>{money(daily.reduce((sum, day) => sum + day.total, 0))}</strong>{" "}
                invoiced in the last 7 days
              </span>
              <span>{money(pnl.creditSettlements)} collected from credit settlements this period</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Cash vs credit</h3>
              <p>Contribution to revenue.</p>
            </div>
          </div>
          <div className="card-body">
            <div className="row" style={{ gap: 18, alignItems: "center" }}>
              <div className="donut" style={{ "--p": Math.round(creditShare) } as CSSProperties}>
                <div className="donut-label">
                  <strong>{creditShare.toFixed(0)}%</strong>
                  <span>credit</span>
                </div>
              </div>
              <div className="stack" style={{ flex: 1, gap: 10 }}>
                <div>
                  <div className="tiny muted">Cash & card</div>
                  <div className="strong">{money(pnl.cashSales)}</div>
                </div>
                <div>
                  <div className="tiny muted">Credit invoices</div>
                  <div className="strong">{money(pnl.creditSales)}</div>
                </div>
                <div>
                  <div className="tiny muted">Collected settlements</div>
                  <div className="strong">{money(pnl.creditSettlements)}</div>
                </div>
              </div>
            </div>
            <div className="divider" />
            <div className="kv">
              <span>Supplier payables</span>
              <span>{money(pnl.payables)}</span>
            </div>
            <div className="kv">
              <span>Payroll accrual</span>
              <span>{money(pnl.payroll)}</span>
            </div>
            <div className="kv">
              <span>Commission accrued</span>
              <span>{money(pnl.commissions)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginTop: 18 }}>
        <div className="card span-2">
          <div className="card-head">
            <div>
              <h3>Live workshop floor</h3>
              <p>Jobs currently inside the gate, with billed value.</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/workshop">
              Open board
              <ArrowRight />
            </Link>
          </div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            {activeJobs.length === 0 ? (
              <div className="empty" style={{ padding: "26px 10px" }}>
                <p>No vehicles in the workshop right now.</p>
              </div>
            ) : (
              activeJobs.slice(0, 6).map((job) => {
                const totals = jobTotals(job, state.tasks, state.parts, state.workers);
                return (
                  <Link
                    key={job.id}
                    to={`/jobs/${job.id}`}
                    className="list-row"
                    style={{ color: "inherit" }}
                  >
                    <span className="part-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                      <Wrench size={15} />
                    </span>
                    <div className="list-main">
                      <strong>
                        {job.vehicleNo} · {job.make} {job.model}
                      </strong>
                      <span>
                        {job.customerName} · {job.repairType} · {job.id}
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="strong small">{money(totals.total)}</div>
                      <div className="tiny muted">{totals.activeTasks.length} task{totals.activeTasks.length === 1 ? "" : "s"}</div>
                    </div>
                    <StatusBadge status={job.status} />
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Owner attention</h3>
              <p>Items that need a decision or a nudge.</p>
            </div>
            <span className="badge badge-red">{attention.reduce((sum, item) => sum + item.count, 0)} open</span>
          </div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            {attention.length === 0 ? (
              <div className="empty" style={{ padding: "26px 10px" }}>
                <p>Everything is under control. No exceptions today.</p>
              </div>
            ) : (
              attention.map((item) => (
                <Link
                  key={item.label}
                  to={item.link}
                  className="list-row"
                  style={{ color: "inherit" }}
                >
                  <span
                    className={`stat-icon ${item.tone === "brand" ? "" : item.tone}`}
                    style={{ width: 30, height: 30, flex: "0 0 30px", borderRadius: 8 }}
                  >
                    {item.icon}
                  </span>
                  <div className="list-main">
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <ArrowRight size={13} className="muted" />
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Team commissions · this month</h3>
              <p>Worker share of labour revenue.</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/team">
              <Users />
              Team
            </Link>
          </div>
          <div className="card-body">
            {commissions.filter((row) => row.commission > 0).length === 0 ? (
              <div className="empty" style={{ padding: "22px 10px" }}>
                <p>No commission-bearing jobs recorded this month.</p>
              </div>
            ) : (
              commissions
                .filter((row) => row.commission > 0)
                .slice(0, 5)
                .map((row) => (
                  <div key={row.workerId} style={{ marginBottom: 13 }}>
                    <div className="row-between" style={{ marginBottom: 5 }}>
                      <span className="small strong">{row.name}</span>
                      <span className="small mono">{money(row.commission)}</span>
                    </div>
                    <div className="progress">
                      <span
                        style={{
                          width: `${Math.max(4, (row.commission / topCommission) * 100)}%`,
                          background: "var(--accent)",
                        }}
                      />
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Recent sales</h3>
              <p>Latest entries in the revenue ledger.</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/accounting">
              <CalendarDays />
              Accounts
            </Link>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Job / description</th>
                  <th>Method</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {recentLedger.map((entry) => {
                  const amount =
                    entry.paymentMethod === "Credit Settlement"
                      ? entry.settlementAmount ?? 0
                      : Math.max(0, entry.laborRevenue + entry.partsRevenue - entry.discount);
                  return (
                    <tr key={entry.id}>
                      <td>
                        <div className="cell-main" style={{ fontSize: 12.2 }}>
                          {entry.description}
                        </div>
                        <div className="cell-sub">{timeAgo(entry.date)}</div>
                      </td>
                      <td>
                        <StatusBadge status={entry.paymentMethod} />
                      </td>
                      <td className="num strong">{money(amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="alert alert-brand" style={{ marginTop: 18 }}>
        <CircleDollarSign />
        <div>
          <strong>Period P&amp;L snapshot</strong>
          Revenue {money(pnl.revenue)} − parts {money(pnl.partsCost)} − commissions{" "}
          {money(pnl.commissions)} − operating expenses {money(pnl.expenses)} − payroll accrual{" "}
          {money(pnl.payroll)} = <strong>{money(pnl.netProfit)}</strong> net profit. Payroll is
          estimated from active worker salaries for the selected period.
        </div>
      </div>

      <div className="row-between wrap" style={{ marginTop: 14 }}>
        <span className="tiny muted">
          Last refreshed {timeAgo(new Date().toISOString())} · demo data stored in this browser
        </span>
        <span className="tiny muted">
          Next supplier payment:{" "}
          {state.purchases
            .filter((purchase) => purchase.type === "Credit" && purchase.status === "Unpaid")
            .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0]?.dueDate
            ? shortDate(
                state.purchases
                  .filter((purchase) => purchase.type === "Credit" && purchase.status === "Unpaid")
                  .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0]?.dueDate,
              )
            : "No supplier credit due"}
        </span>
      </div>
    </div>
  );
}
