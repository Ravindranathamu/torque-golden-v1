import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  CarFront,
  ChevronDown,
  ChevronRight,
  Gauge,
  History as HistoryIcon,
  MessageCircle,
  Package,
  Phone,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
  Wrench,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { daysBetween, driverCommissionFor, jobTotals, money, shortDate, taskWorkerNames, waLink } from "../lib/utils";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "../components/ui";
import type { JobCard } from "../types";

interface VehicleGroup {
  key: string;
  vehicleNo: string;
  make: string;
  model: string;
  customerName: string;
  phone: string;
  jobs: JobCard[];
  latest: string;
  spend: number;
  averageCycle: number | null;
}

export function HistoryPage() {
  const { state } = useApp();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const groups = useMemo<VehicleGroup[]>(() => {
    const map = new Map<string, JobCard[]>();
    state.jobCards.forEach((job) => {
      const key = job.vehicleNo.trim().toUpperCase();
      map.set(key, [...(map.get(key) ?? []), job]);
    });

    return [...map.entries()]
      .map(([key, jobs]) => {
        const sorted = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const latest = sorted[0];
        const dispatches = sorted
          .map((job) => job.dispatchedAt)
          .filter((value): value is string => Boolean(value))
          .sort();
        const gaps = dispatches
          .slice(1)
          .map((date, index) => daysBetween(dispatches[index], date))
          .filter((gap) => gap > 0);
        return {
          key,
          vehicleNo: latest.vehicleNo,
          make: latest.make,
          model: latest.model,
          customerName: latest.customerName,
          phone: latest.phone,
          jobs: sorted,
          latest: latest.dispatchedAt ?? latest.createdAt,
          spend: sorted.reduce(
            (sum, job) => sum + jobTotals(job, state.tasks, state.parts, state.workers).total,
            0,
          ),
          averageCycle: gaps.length
            ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length)
            : null,
        };
      })
      .sort((a, b) => b.latest.localeCompare(a.latest));
  }, [state.jobCards, state.tasks, state.parts, state.workers]);

  const needles = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const visible = groups.filter((group) => {
    if (!needles.length) return true;
    const haystack = `${group.vehicleNo} ${group.make} ${group.model} ${group.customerName} ${group.phone} ${group.jobs.map((job) => job.id).join(" ")}`.toLowerCase();
    return needles.every((needle) => haystack.includes(needle));
  });

  const totalVisits = groups.reduce((sum, group) => sum + group.jobs.length, 0);
  const totalSpend = groups.reduce((sum, group) => sum + group.spend, 0);
  const repeatVehicles = groups.filter((group) => group.jobs.length > 1).length;

  return (
    <div className="page">
      <PageHeader
        title="Vehicle history & warranty"
        subtitle="Search any number plate for every visit, repair, price and supplier — with full warranty traceability."
      />

      <div className="grid cols-4">
        <StatCard
          label="Vehicles on record"
          value={groups.length}
          meta={`${repeatVehicles} returning vehicle${repeatVehicles === 1 ? "" : "s"}`}
          icon={<CarFront />}
        />
        <StatCard
          label="Total visits"
          value={totalVisits}
          meta="Accepted job cards, all time"
          icon={<HistoryIcon />}
          tone="blue"
        />
        <StatCard
          label="Lifetime invoiced"
          value={money(totalSpend)}
          meta="Across all recorded jobs"
          icon={<ShieldCheck />}
          tone="purple"
        />
        <StatCard
          label="Search scope"
          value="Plate · name · job"
          meta="Try WP CAV-8742 or A. Perera"
          icon={<Search />}
          tone="amber"
        />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-body">
          <div className="input-group" style={{ maxWidth: 620 }}>
            <span className="prefix">
              <Search size={16} />
            </span>
            <input
              className="input"
              placeholder="Search vehicle number, customer name or job number…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
            {query && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginRight: 4 }}
                onClick={() => setQuery("")}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="row-between wrap" style={{ marginTop: 18 }}>
        <div>
          <h2 style={{ fontSize: 17, letterSpacing: "-0.02em" }}>Service history</h2>
          <p className="tiny muted">
            {query
              ? `${visible.length} vehicle${visible.length === 1 ? "" : "s"} matching “${query}”`
              : `${groups.length} vehicle${groups.length === 1 ? "" : "s"} with recorded jobs`}
          </p>
        </div>
        <span className="badge badge-brand">
          <ShieldCheck size={11} />
          Warranty-ready records
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <EmptyState
            icon={<Search size={22} />}
            title="No vehicle history found"
            message="Check the number plate spelling. Only vehicles with accepted job cards appear here; new QR check-ins become searchable after PRO acceptance."
            action={
              <button className="btn btn-secondary" onClick={() => setQuery("")}>
                Show all vehicles
              </button>
            }
          />
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 12 }}>
          {visible.map((group) => {
            const isOpen = expanded.has(group.key);
            return (
            <div className="card" key={group.key}>
              <button
                type="button"
                className="card-head history-summary"
                onClick={() => toggleGroup(group.key)}
                aria-expanded={isOpen}
                style={{ width: "100%", textAlign: "left", cursor: "pointer", border: 0, background: "transparent" }}
              >
                <div className="row" style={{ gap: 12 }}>
                  <span
                    className="part-icon"
                    style={{
                      width: 44,
                      height: 44,
                      flex: "0 0 44px",
                      background: "var(--brand-soft)",
                      color: "var(--brand)",
                    }}
                  >
                    <CarFront size={19} />
                  </span>
                  <div>
                    <div className="row wrap" style={{ gap: 7 }}>
                      <h3 style={{ fontSize: 17, letterSpacing: "-0.02em", fontWeight: 800 }}>
                        {group.vehicleNo}
                      </h3>
                      <span className="badge badge-brand">{group.jobs.length} visit{group.jobs.length === 1 ? "" : "s"}</span>
                      {group.jobs.length > 1 && (
                        <span className="badge badge-green">Returning customer</span>
                      )}
                    </div>
                    <p>
                      {group.make} {group.model} · Owner {group.customerName}
                    </p>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 18, justifyContent: "flex-end", alignItems: "center" }}>
                  <div className="history-summary-stat">
                    <span className="tiny muted">Visit date</span>
                    <strong>{shortDate(group.latest)}</strong>
                  </div>
                  <div className="history-summary-stat">
                    <span className="tiny muted">Mileage</span>
                    <strong>{group.jobs[0].mileage.toLocaleString()} km</strong>
                  </div>
                  <div className="history-summary-stat" style={{ textAlign: "right" }}>
                    <span className="tiny muted">Total</span>
                    <strong>{money(group.spend)}</strong>
                  </div>
                  <span className="icon-btn" aria-hidden="true">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </div>
              </button>

              {isOpen && (
              <>
              <div className="card-body" style={{ paddingBottom: 6 }}>
                <div className="row wrap small muted" style={{ gap: 18 }}>
                  <span>
                    <CalendarDays size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
                    Last visit {shortDate(group.latest)}
                  </span>
                  <span>
                    <Gauge size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
                    Latest mileage {group.jobs[0].mileage.toLocaleString()} km
                  </span>
                  <span>
                    <Phone size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
                    {group.phone}
                  </span>
                  {group.averageCycle && (
                    <span>
                      <HistoryIcon size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
                      Average return interval {group.averageCycle} days
                    </span>
                  )}
                </div>
                <div className="row wrap" style={{ marginTop: 10 }}>
                  <a
                    className="btn btn-ghost btn-sm"
                    href={waLink(
                      group.phone,
                      `Hello ${group.customerName}, this is ${state.settings.companyName}. We are reviewing the service history for ${group.vehicleNo}. How can we help?`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle />
                    WhatsApp customer
                  </a>
                  <div className="tiny muted" style={{ alignSelf: "center" }}>
                    Use the parts and supplier details below for any warranty claim.
                  </div>
                </div>
                <div className="divider" />
              </div>

              <div className="card-body" style={{ paddingTop: 4 }}>
                <div className="timeline">
                  {group.jobs.map((job) => {
                    const totals = jobTotals(job, state.tasks, state.parts, state.workers);
                    const jobTasks = state.tasks.filter((task) => task.jobCardId === job.id);
                    const jobParts = state.parts.filter((part) => part.jobCardId === job.id);
                    const serviceRecord = state.serviceRecords.find(
                      (record) => record.jobCardId === job.id,
                    );
                    const claim = job.insuranceClaimId
                      ? state.insuranceJobs.find((entry) => entry.id === job.insuranceClaimId)
                      : null;
                    const driverCommission = driverCommissionFor(job, totals);
                    return (
                      <div className="timeline-item" key={job.id}>
                        <div className="timeline-date">
                          {shortDate(job.createdAt)} · {job.id} · {job.repairType}
                        </div>
                        <div className="history-card">
                          <div className="history-card-head">
                            <div>
                              <div className="row wrap" style={{ gap: 7 }}>
                                <StatusBadge status={job.status} />
                                <span className="chip">
                                  <Gauge size={10} />
                                  {job.mileage.toLocaleString()} km
                                </span>
                                {job.paymentMethod && (
                                  <span className="chip">{job.paymentMethod}</span>
                                )}
                                {claim && (
                                  <span className="chip">
                                    <ShieldCheck size={10} />
                                    {claim.claimNo} · {claim.status}
                                  </span>
                                )}
                                {job.driver && (
                                  <span className="chip" title="Internal driver commission — not shown on customer invoice">
                                    <Truck size={10} />
                                    Driver {job.driver.name} · {money(driverCommission)}
                                  </span>
                                )}
                              </div>
                              <div className="tiny muted" style={{ marginTop: 5 }}>
                                Accepted {shortDate(job.acceptedAt)} · Completed{" "}
                                {shortDate(job.completedAt)} · Dispatched {shortDate(job.dispatchedAt)}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div className="strong">{money(totals.total)}</div>
                              <div className="tiny muted">
                                {totals.discount > 0
                                  ? `${money(totals.labor)} labour + ${money(totals.parts)} parts − ${money(totals.discount)} discount`
                                  : `${money(totals.labor)} labour + ${money(totals.parts)} parts`}
                              </div>
                            </div>
                          </div>

                          <div className="history-section">
                            <div className="section-title">
                              <span className="label">
                                <Wrench size={12} /> Repairs & labour
                              </span>
                              <span className="tiny muted">{money(totals.labor)}</span>
                            </div>
                            {jobTasks.length === 0 ? (
                              <div className="tiny muted">No labour tasks recorded.</div>
                            ) : (
                              jobTasks.map((task) => {
                                const workerNames = taskWorkerNames(task, state.workers);
                                return (
                                  <div className="history-line" key={task.id}>
                                    <span>
                                      {task.name}
                                      <small> · {workerNames}</small>
                                    </span>
                                    <span>{money(task.laborCost)}</span>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          <div className="history-section" style={{ borderBottom: 0 }}>
                            <div className="section-title">
                              <span className="label">
                                <Package size={12} /> Parts, prices & suppliers
                              </span>
                              <span className="tiny muted">{jobParts.length} line{jobParts.length === 1 ? "" : "s"}</span>
                            </div>
                            {jobParts.length === 0 ? (
                              <div className="tiny muted">No parts issued on this visit.</div>
                            ) : (
                              jobParts.map((part) => {
                                const supplier = state.suppliers.find(
                                  (entry) => entry.id === part.supplierId,
                                );
                                return (
                                  <div className="history-line" key={part.id}>
                                    <span>
                                      {part.itemName} × {Math.max(1, part.qtyIssued)}
                                      <small> · {supplier ? `Supplied by ${supplier.name}` : "Supplier not recorded"}</small>
                                      <small style={{ display: "block", marginTop: 2 }}>
                                        Invoice {part.supplierInvoiceNo || "not recorded"}
                                        {part.warrantyReplacementInvoiceNo
                                          ? ` · Replacement invoice ${part.warrantyReplacementInvoiceNo}`
                                          : ""}
                                        {part.warrantyStatus !== "None" && (
                                          <>
                                            {" "}· Warranty {part.warrantyStatus}
                                            {part.creditNoteNo ? ` · Credit note ${part.creditNoteNo}` : ""}
                                            {part.warrantyNote ? ` · ${part.warrantyNote}` : ""}
                                          </>
                                        )}
                                        {claim && part.salvageStatus
                                          ? ` · Salvage ${part.salvageStatus}`
                                          : ""}
                                      </small>
                                    </span>
                                    <span style={{ textAlign: "right" }}>
                                      {money(part.sellingPrice * Math.max(1, part.qtyIssued))}
                                      <small style={{ marginLeft: 6 }}>{part.status}</small>
                                    </span>
                                  </div>
                                );
                              })
                            )}
                            {job.safetyNotes && (
                              <>
                                <div className="divider" />
                                <div className="tiny muted">
                                  <strong style={{ color: "var(--ink-2)" }}>Gate notes:</strong>{" "}
                                  {job.safetyNotes}
                                </div>
                              </>
                            )}
                          </div>

                          {serviceRecord && (
                            <div className="history-section" style={{ borderBottom: 0 }}>
                              <div className="section-title">
                                <span className="label">
                                  <UserRound size={12} /> Saved service record
                                </span>
                                <span className="tiny muted">{shortDate(serviceRecord.date)}</span>
                              </div>
                              <div className="history-line">
                                <span>Worker / task assignments</span>
                                <span style={{ textAlign: "right" }}>
                                  {[...new Set(serviceRecord.tasks.map((task) => task.workerName))].join(", ") || "None"}
                                </span>
                              </div>
                              <div className="history-line">
                                <span>Snapshot at dispatch</span>
                                <span>
                                  {serviceRecord.tasks.length} task
                                  {serviceRecord.tasks.length === 1 ? "" : "s"} ·{" "}
                                  {serviceRecord.parts.length} part
                                  {serviceRecord.parts.length === 1 ? "" : "s"} ·{" "}
                                  {serviceRecord.mileage.toLocaleString()} km
                                </span>
                              </div>
                              {serviceRecord.parts.some((part) => part.supplierInvoiceNo) && (
                                <div className="history-line">
                                  <span>Supplier invoices</span>
                                  <span style={{ textAlign: "right" }}>
                                    {serviceRecord.parts
                                      .filter((part) => part.supplierInvoiceNo)
                                      .map((part) => `${part.itemName} (${part.supplierInvoiceNo})`)
                                      .join(", ")}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          <div
                            className="card-body row-between wrap"
                            style={{ paddingTop: 9, paddingBottom: 9, background: "#fafcfc" }}
                          >
                            <span className="tiny muted">
                              {job.driveFolderId ?? "No Drive folder recorded"}
                            </span>
                            <div className="row wrap">
                              <Link className="btn btn-ghost btn-sm" to={`/jobs/${job.id}`}>
                                Open job card
                              </Link>
                              {job.photos.length > 0 && (
                                <span className="badge badge-blue">
                                  {job.photos.length} inspection photo{job.photos.length === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </>
              )}
            </div>
            );
          })}
        </div>
      )}

      <div className="alert alert-info" style={{ marginTop: 18 }}>
        <Truck />
        <div>
          <strong>Warranty claim checklist</strong>
          Record the job number, part name, supplier, supplier purchase invoice number, invoice
          date and vehicle mileage. All of these are available above — each issued part now carries
          its supplier invoice, warranty status and any credit note, and completed visits keep a
          saved service record of worker and task assignments. A claim can be traced without
          searching paper invoices.
        </div>
      </div>

      <div className="row wrap tiny muted" style={{ marginTop: 12 }}>
        <span>
          <UserRound size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          {groups.length} customer vehicle record{groups.length === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span>{totalVisits} job cards</span>
        <span>·</span>
        <span>Demo data stored in this browser</span>
      </div>
    </div>
  );
}
