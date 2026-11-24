import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Package,
  Phone,
  ReceiptText,
  Search,
  Users,
  Wrench,
} from "lucide-react";
import { hasDepartment, useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import {
  estimateDisplayNumber,
  estimateKindLabel,
  isWithinRange,
  jobTotals,
  money,
  shortDate,
  timeAgo,
  waLink,
} from "../lib/utils";
import { autoWhatsAppEnabled } from "../lib/whatsapp";
import { localDateKey } from "../lib/payroll";
import { PageHeader, StatCard, StatusBadge, Modal, Alert, EmptyState } from "../components/ui";
import { useToast } from "../components/Toast";
import type { JobCard, JobEstimate } from "../types";

interface VehicleEstimateItem {
  estimate: JobEstimate;
  job: JobCard;
  quotedTotal: number;
  approvedTotal: number;
}

interface BoardColumn {
  key: string;
  title: string;
  caption: string;
  jobs: JobCard[];
}

export function WorkshopPage() {
  const { state, currentUser, markAttendance, markManyPresent, confirmAppointment } = useApp();
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [attendanceEditing, setAttendanceEditing] = useState(false);
  const [estimateHistoryOpen, setEstimateHistoryOpen] = useState(false);
  const [estimateHistoryVehicle, setEstimateHistoryVehicle] = useState("");
  const [estimateHistoryJob, setEstimateHistoryJob] = useState("");
  const [estimateSearch, setEstimateSearch] = useState("");
  const [expandedEstimates, setExpandedEstimates] = useState<Set<string>>(() => new Set());
  const [reviewOpen, setReviewOpen] = useState(() => {
    const hour = new Date().getHours();
    return hour >= 16 && state.appointments.some(
      (entry) => entry.status === "Pending" && localDateKey(entry.scheduledAt) === tomorrowKey(),
    );
  });
  const today = localDateKey();
  const estimatesEnabled = featureEnabled(state.settings, "enable_estimates_module");
  const sectionsEnabled =
    featureEnabled(state.settings, "enable_multi_sections") && state.sections.length > 0;
  const owner = Boolean(currentUser?.isOwner);
  const mySectionIds = currentUser?.sectionIds ?? [];
  const scopedSections = useMemo(
    () =>
      state.sections.filter(
        (section) =>
          section.active &&
          (owner || mySectionIds.length === 0 || mySectionIds.includes(section.id)),
      ),
    [state.sections, owner, mySectionIds],
  );
  const activeSection =
    sectionFilter === "all"
      ? undefined
      : state.sections.find((section) => section.id === sectionFilter);
  const activeWorkers = state.workers.filter(
    (worker) =>
      worker.status === "Active" &&
      (!activeSection || activeSection.workerIds.includes(worker.id)),
  );
  const attendanceToday = new Map(
    state.attendance
      .filter((record) => record.date === today)
      .map((record) => [record.workerId, record] as const),
  );
  const presentCount = activeWorkers.filter(
    (worker) => attendanceToday.get(worker.id)?.status === "Present",
  ).length;
  const attendanceComplete =
    activeWorkers.length > 0 &&
    activeWorkers.every((worker) => attendanceToday.has(worker.id));
  const canMarkAttendance =
    Boolean(currentUser?.isOwner) || hasDepartment(currentUser, "Supervisor");

  const jobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const allowed =
      sectionsEnabled && !owner && mySectionIds.length > 0
        ? new Set(mySectionIds)
        : null;
    return state.jobCards.filter((job) => {
      if (allowed && !(job.sectionIds ?? []).some((id) => allowed.has(id))) return false;
      if (activeSection && !(job.sectionIds ?? []).includes(activeSection.id)) return false;
      if (!needle) return true;
      return `${job.vehicleNo} ${job.make} ${job.model} ${job.customerName} ${job.id} ${job.repairType}`
        .toLowerCase()
        .includes(needle);
    });
  }, [state.jobCards, query, sectionsEnabled, owner, mySectionIds, activeSection]);

  const active = jobs.filter((job) => job.status === "In Progress").sort((a, b) => (b.acceptedAt ?? "").localeCompare(a.acceptedAt ?? ""));
  const billing = jobs.filter((job) => job.status === "Repair Completed");
  const gate = jobs.filter((job) => job.status === "Paid" || job.status === "Released on Credit");
  const dispatched = jobs
    .filter((job) => job.status === "Dispatched")
    .sort((a, b) => (b.dispatchedAt ?? "").localeCompare(a.dispatchedAt ?? ""))
    .slice(0, 6);

  const pendingParts = state.parts.filter((part) =>
    ["Requested", "Backordered", "Exchange Pending", "Return Pending"].includes(part.status),
  );
  const tomorrowPending = state.appointments.filter(
    (entry) =>
      entry.status === "Pending" &&
      localDateKey(entry.scheduledAt) === tomorrowKey(),
  );
  const labourToday = state.tasks
    .filter((task) => isWithinRange(task.createdAt, "today"))
    .reduce((sum, task) => sum + task.laborCost, 0);
  const dispatchedToday = state.jobCards.filter(
    (job) => job.dispatchedAt && isWithinRange(job.dispatchedAt, "today"),
  ).length;

  const columns: BoardColumn[] = [
    {
      key: "floor",
      title: "On the floor",
      caption: "Repairs in progress",
      jobs: active,
    },
    {
      key: "billing",
      title: "Ready to bill",
      caption: "Repair completed",
      jobs: billing,
    },
    {
      key: "gate",
      title: "Awaiting gate",
      caption: "Paid or on credit",
      jobs: gate,
    },
    {
      key: "left",
      title: "Recently left",
      caption: "Dispatched vehicles",
      jobs: dispatched,
    },
  ] as BoardColumn[];

  const estimateHistoryByVehicle = useMemo(() => {
    const grouped = new Map<string, VehicleEstimateItem[]>();
    const jobsById = new Map(state.jobCards.map((job) => [job.id, job]));
    state.estimates.forEach((estimate) => {
      const job = jobsById.get(estimate.jobCardId);
      if (!job) return;
      const key = job.vehicleNo.trim().toUpperCase();
      const quotedTotal = estimate.lines.reduce(
        (sum, line) => sum + line.qty * line.unitPrice,
        0,
      );
      const approvedTotal = estimate.lines.reduce((sum, line) => {
        if (line.approvalStatus !== "Approved") return sum;
        return sum + line.qty * (line.approvedUnitPrice ?? line.unitPrice);
      }, 0);
      const list = grouped.get(key) ?? [];
      list.push({ estimate, job, quotedTotal, approvedTotal });
      grouped.set(key, list);
    });
    return grouped;
  }, [state.estimates, state.jobCards]);

  const estimateVehicleKeys = useMemo(
    () => [...estimateHistoryByVehicle.keys()].sort(),
    [estimateHistoryByVehicle],
  );

  const estimateGroups = useMemo(() => {
    const needle = estimateSearch.trim().toLowerCase();
    return [...estimateHistoryByVehicle.entries()]
      .filter(([key]) => !estimateHistoryVehicle || key === estimateHistoryVehicle)
      .map(([key, items]) => ({
        key,
        items: items
          .filter((item) => {
            if (!needle) return true;
            const haystack = [
              key,
              item.job.make,
              item.job.model,
              item.job.customerName,
              item.job.id,
              item.job.repairType,
              estimateDisplayNumber(item.estimate),
              item.estimate.notes,
            ]
              .join(" ")
              .toLowerCase();
            return haystack.includes(needle);
          })
          .sort((a, b) => {
            const byEstimate = b.estimate.createdAt.localeCompare(a.estimate.createdAt);
            return byEstimate || b.job.createdAt.localeCompare(a.job.createdAt);
          }),
      }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) =>
        (b.items[0]?.estimate.createdAt ?? "").localeCompare(
          a.items[0]?.estimate.createdAt ?? "",
        ),
      );
  }, [estimateHistoryByVehicle, estimateSearch, estimateHistoryVehicle]);

  const estimateHistoryLabel = estimateHistoryVehicle
    ? estimateGroups[0]?.items[0]?.job.vehicleNo ?? estimateHistoryVehicle
    : "all vehicles";

  function openEstimateHistory(job?: JobCard) {
    setEstimateHistoryVehicle(job ? job.vehicleNo.trim().toUpperCase() : "");
    setEstimateHistoryJob(job?.id ?? "");
    setEstimateSearch("");
    setExpandedEstimates(new Set());
    setEstimateHistoryOpen(true);
  }

  function toggleEstimateLines(id: string) {
    setExpandedEstimates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="page">
      <PageHeader
        title="Workshop floor"
        subtitle="Assign labour to technicians, request parts by vehicle fitment, and hand finished jobs to billing."
        actions={
          <>
            {sectionsEnabled && (
              <select
                className="select"
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                style={{ minWidth: 170 }}
              >
                <option value="all">All sections</option>
                {scopedSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            )}
            <div className="search-wrap">
              <div className="input-group" style={{ minWidth: 220 }}>
                <span className="prefix">
                  <Search size={14} />
                </span>
                <input
                  className="input"
                  placeholder="Search vehicle or job…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            {estimatesEnabled && (
              <button
                className="btn btn-secondary"
                onClick={() => openEstimateHistory()}
                title="Browse quotations by vehicle"
              >
                <FileText />
                Estimate history
              </button>
            )}
            <Link className="btn btn-secondary" to="/history">
              <ClipboardList />
              Vehicle history
            </Link>
          </>
        }
      />

      {sectionsEnabled && (
        <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
          <button
            className={`btn btn-sm ${sectionFilter === "all" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSectionFilter("all")}
          >
            All sections
          </button>
          {scopedSections.map((section) => (
            <button
              key={section.id}
              className={`btn btn-sm ${sectionFilter === section.id ? "btn-primary" : "btn-secondary"}`}
              style={{ borderLeft: `4px solid ${section.color}` }}
              onClick={() => setSectionFilter(section.id)}
            >
              {section.name}
              <span className="tiny muted" style={{ marginLeft: 4 }}>
                {state.jobCards.filter(
                  (job) =>
                    job.status === "In Progress" && (job.sectionIds ?? []).includes(section.id),
                ).length}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid cols-4">
        <StatCard
          label="On the floor"
          value={active.length}
          meta="Vehicles in active repair"
          icon={<Wrench />}
          tone="blue"
        />
        <StatCard
          label="Awaiting billing"
          value={billing.length}
          meta="Repairs completed, cashier notified"
          icon={<ReceiptText />}
          tone="purple"
        />
        <StatCard
          label="Parts to watch"
          value={pendingParts.length}
          meta="Open requests, swaps and backorders"
          icon={<Package />}
          tone={pendingParts.length ? "amber" : "brand"}
        />
        <StatCard
          label="Labour assigned today"
          value={money(labourToday)}
          meta={`${dispatchedToday} vehicle${dispatchedToday === 1 ? "" : "s"} dispatched today`}
          icon={<Banknote />}
        />
      </div>

      {attendanceComplete && !attendanceEditing ? (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <div>
              <h3>
                <CalendarCheck size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
                Morning attendance{activeSection ? ` · ${activeSection.name}` : ""}
              </h3>
              <p>
                Attendance is locked for today. It reappears tomorrow morning for the next
                register.
              </p>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="badge badge-green">
                {presentCount}/{activeWorkers.length} present · submitted
              </span>
              {canMarkAttendance && (
                <button
                  className="btn btn-soft btn-sm"
                  onClick={() => setAttendanceEditing(true)}
                >
                  Edit today's attendance
                </button>
              )}
            </div>
          </div>
          <div className="card-body row-between wrap" style={{ gap: 10 }}>
            <div className="tiny muted">
              Marked by{" "}
              {Array.from(
                new Set(
                  activeWorkers
                    .map((worker) => attendanceToday.get(worker.id)?.markedBy)
                    .filter(Boolean),
                ),
              ).join(", ") || "supervisor"}{" "}
              · next register opens tomorrow at 6:00 a.m.
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {(["Present", "Absent", "Off Day"] as const).map((status) => (
                <span key={status} className="chip">
                  {status}:{" "}
                  {activeWorkers.filter((worker) => attendanceToday.get(worker.id)?.status === status)
                    .length}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div>
            <h3><CalendarCheck size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Morning attendance{activeSection ? ` · ${activeSection.name}` : ""}</h3>
            <p>
              Mark present workers before assigning labour. Only present workers appear in the task
              assignment list. Basic salary and daily wages use this register.
            </p>
          </div>
          <div className="row wrap">
            <span className={`badge ${presentCount === activeWorkers.length ? "badge-green" : "badge-amber"}`}>
              {presentCount}/{activeWorkers.length} present
            </span>
            {canMarkAttendance && activeWorkers.length > 0 && (
              <button
                className="btn btn-soft btn-sm"
                onClick={() => {
                  markManyPresent(
                    activeWorkers.map((worker) => worker.id),
                    today,
                    activeSection?.id,
                  );
                }}
              >
                <Users />
                Mark all present
              </button>
            )}
          </div>
        </div>
        <div className="table-wrap table-cards">
          <table className="data attendance-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Pay basis</th>
                <th className="num">Allowed off days</th>
                <th>Status</th>
                <th>Mark today</th>
              </tr>
            </thead>
            <tbody>
              {activeWorkers.map((worker) => {
                const record = attendanceToday.get(worker.id);
                const status = record?.status ?? "Not marked";
                return (
                  <tr key={worker.id}>
                    <td data-label="Worker">
                      <div className="cell-main">{worker.fullName}</div>
                      <div className="cell-sub">{worker.phone}</div>
                      {sectionsEnabled && (
                        <div className="tiny muted" style={{ marginTop: 2 }}>
                          {(worker.sectionIds ?? [])
                            .map((id) => state.sections.find((section) => section.id === id)?.name)
                            .filter(Boolean)
                            .join(" · ") || "No section"}
                        </div>
                      )}
                    </td>
                    <td className="tiny" data-label="Pay basis">
                      {worker.payType === "Daily"
                        ? `Daily · ${money(worker.dailyRate)}`
                        : `Monthly · ${money(worker.baseSalary)}${worker.epfEnabled ? " · EPF" : ""}${worker.etfEnabled ? " · ETF" : ""}`}
                    </td>
                    <td className="num" data-label="Allowed off days">{worker.allowedOffDaysPerMonth}</td>
                    <td data-label="Status">
                      <span
                        className={`badge ${
                          status === "Present"
                            ? "badge-green"
                            : status === "Absent"
                              ? "badge-red"
                              : status === "Off Day"
                                ? "badge-amber"
                                : "badge-slate"
                        }`}
                      >
                        {status}
                      </span>
                      {record?.markedBy && <div className="cell-sub">{record.markedBy}</div>}
                    </td>
                    <td data-label="Mark today">
                      {canMarkAttendance ? (
                        <div className="row wrap" style={{ gap: 4 }}>
                          {(["Present", "Absent", "Off Day"] as const).map((option) => (
                            <button
                              key={option}
                              className={`btn btn-sm ${status === option ? "btn-primary" : "btn-secondary"}`}
                              onClick={() =>
                                markAttendance(worker.id, today, option, activeSection?.id)
                              }
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="tiny muted">Supervisor marks attendance</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {tomorrowPending.length > 0 && (
        <div className="alert alert-warn" style={{ marginTop: 18 }}>
          <CalendarClock />
          <div>
            <strong>
              {tomorrowPending.length} reservation{tomorrowPending.length === 1 ? "" : "s"} for
              tomorrow still need a confirmation call
            </strong>
            The 4:30 p.m. supervisor round checks each booking, calls the customer and sends
            the WhatsApp confirmation.{" "}
            <button className="btn btn-ghost btn-sm" onClick={() => setReviewOpen(true)}>
              Review now
            </button>{" "}
            <Link to="/appointments" style={{ fontWeight: 700 }}>
              Open reservations →
            </Link>
          </div>
        </div>
      )}

      {pendingParts.length > 0 && (
        <div className="alert alert-warn" style={{ marginTop: 18 }}>
          <Package />
          <div>
            <strong>{pendingParts.length} parts line{pendingParts.length === 1 ? "" : "s"} still need stores action</strong>
            {pendingParts.map((part) => {
              const job = state.jobCards.find((entry) => entry.id === part.jobCardId);
              return (
                <span key={part.id} style={{ marginRight: 12 }}>
                  {job?.vehicleNo ?? part.jobCardId} · {part.itemName} ({part.status}){" "}
                </span>
              );
            })}
            <Link to="/stores" style={{ fontWeight: 700 }}>
              Open stores →
            </Link>
          </div>
        </div>
      )}

      <div className="board" style={{ marginTop: 18, gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))" }}>
        {columns.map((column) => (
          <div className="board-col" key={column.key}>
            <div className="board-head">
              <div>
                {column.title}
                <div className="tiny muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, marginTop: 1 }}>
                  {column.caption}
                </div>
              </div>
              <span className="count">{column.jobs.length}</span>
            </div>

            {column.jobs.length === 0 ? (
              <div style={{ padding: "18px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 11.5 }}>
                No vehicles here.
              </div>
            ) : (
              column.jobs.map((job) => {
                const totals = jobTotals(job, state.tasks, state.parts, state.workers);
                const jobParts = state.parts.filter(
                  (part) => part.jobCardId === job.id && part.status !== "Returned",
                );
                const waitingParts = jobParts.filter((part) =>
                  ["Requested", "Backordered"].includes(part.status),
                ).length;
                const vehicleEstimateCount =
                  estimateHistoryByVehicle.get(job.vehicleNo.trim().toUpperCase())?.length ?? 0;
                return (
                  <div className="job-card" key={job.id}>
                    <Link className="job-card-link" to={`/jobs/${job.id}`}>
                      <div className="job-card-top">
                        <div>
                          <div className="job-vehicle">{job.vehicleNo}</div>
                          <div className="job-model">
                            {job.make} {job.model} · {job.customerName}
                          </div>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>

                      <div className="row wrap" style={{ gap: 5, marginTop: 9 }}>
                        <span className="chip">{job.repairType}</span>
                        <span className="chip">{job.id}</span>
                        {sectionsEnabled &&
                          (job.sectionIds ?? []).map((id) => {
                            const section = state.sections.find((entry) => entry.id === id);
                            if (!section) return null;
                            return (
                              <span
                                key={id}
                                className="chip"
                                style={{
                                  borderColor: section.color,
                                  color: section.color,
                                  background: `${section.color}14`,
                                }}
                              >
                                {section.name}
                              </span>
                            );
                          })}
                        {waitingParts > 0 && (
                          <span className="badge badge-red">
                            <Package size={10} /> {waitingParts} part{waitingParts === 1 ? "" : "s"} waiting
                          </span>
                        )}
                      </div>

                      <div className="job-card-meta">
                        <span>
                          <Users size={11} /> {totals.activeTasks.length} task{totals.activeTasks.length === 1 ? "" : "s"}
                        </span>
                        <span>
                          <Package size={11} /> {jobParts.length} part{jobParts.length === 1 ? "" : "s"}
                        </span>
                        <span>
                          <Banknote size={11} /> {money(totals.total)}
                        </span>
                      </div>
                    </Link>
                    <div className="row-between" style={{ marginTop: 9, paddingTop: 8, borderTop: "1px dashed var(--line)", gap: 6 }}>
                      <span className="tiny muted">
                        {job.status === "Dispatched"
                          ? `Left ${timeAgo(job.dispatchedAt)}`
                          : `In since ${timeAgo(job.acceptedAt)}`}
                      </span>
                      <div className="row wrap" style={{ gap: 4, justifyContent: "flex-end" }}>
                        {estimatesEnabled && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: "2px 4px" }}
                            title={`Estimate history for ${job.vehicleNo}`}
                            onClick={() => openEstimateHistory(job)}
                          >
                            <FileText size={11} />
                            Estimates
                            {vehicleEstimateCount > 0 && (
                              <span className="count">{vehicleEstimateCount}</span>
                            )}
                          </button>
                        )}
                        <Link
                          className="btn btn-ghost btn-sm"
                          style={{ padding: "2px 4px" }}
                          to={`/jobs/${job.id}`}
                        >
                          Open
                          <ArrowRight size={11} />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>

      {active.some(
        (job) =>
          state.tasks.filter((task) => task.jobCardId === job.id).length === 0,
      ) && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <div>
              <h3>Needs a labour assignment</h3>
              <p>These vehicles have no technician task yet, so no commission is attached.</p>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            {active
              .filter(
                (job) => state.tasks.filter((task) => task.jobCardId === job.id).length === 0,
              )
              .map((job) => (
                <Link key={job.id} to={`/jobs/${job.id}`} className="list-row" style={{ color: "inherit" }}>
                  <span className="part-icon">
                    <Wrench size={15} />
                  </span>
                  <div className="list-main">
                    <strong>{job.vehicleNo} · {job.repairType}</strong>
                    <span>{job.customerName} · accepted {timeAgo(job.acceptedAt)}</span>
                  </div>
                  <span className="btn btn-soft btn-sm">
                    Assign tasks
                    <ArrowRight />
                  </span>
                </Link>
              ))}
          </div>
        </div>
      )}

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Tomorrow's reservation review"
        subtitle="4:30 p.m. supervisor confirmation round"
        size="wide"
        footer={
          <button className="btn btn-secondary" onClick={() => setReviewOpen(false)}>
            Close
          </button>
        }
      >
        {tomorrowPending.length === 0 ? (
          <Alert tone="success" title="All confirmed">
            Every reservation for tomorrow has been confirmed.
          </Alert>
        ) : (
          <div className="stack">
            <Alert tone="warn" title={`${tomorrowPending.length} customer call${tomorrowPending.length === 1 ? "" : "s"} needed`}>
              Confirm the time, then press confirm to record it and send the WhatsApp note.
            </Alert>
            {tomorrowPending.map((entry) => (
              <div key={entry.id} className="card">
                <div className="card-body row-between wrap" style={{ gap: 10 }}>
                  <div>
                    <div className="cell-main">
                      {entry.vehicleNo} · {entry.vehicleModel}
                    </div>
                    <div className="cell-sub">
                      {entry.customerName} · {entry.phone} ·{" "}
                      {new Date(entry.scheduledAt).toLocaleString("en-GB", {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {entry.repairType}
                    </div>
                    {entry.notes && <div className="tiny muted">{entry.notes}</div>}
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <a
                      className="btn btn-secondary btn-sm"
                      href={`tel:${entry.phone.replace(/\s+/g, "")}`}
                    >
                      <Phone size={12} />
                      Call
                    </a>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const result = confirmAppointment(entry.id);
                        if (!result.ok) return;
                        if (autoWhatsAppEnabled(state.settings)) {
                          push(`${entry.vehicleNo} confirmed. WhatsApp note queued automatically.`);
                          return;
                        }
                        window.open(
                          waLink(
                            entry.phone,
                            `Hello ${entry.customerName}, your appointment at ${state.settings.companyName} is confirmed for ${new Date(entry.scheduledAt).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}. Vehicle: ${entry.vehicleNo}.`,
                          ),
                          "_blank",
                          "noopener,noreferrer",
                        );
                      }}
                    >
                      <CheckCircle2 size={12} />
                      Confirm + WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={estimateHistoryOpen}
        onClose={() => setEstimateHistoryOpen(false)}
        title="Estimate history"
        subtitle={`Quotations recorded for ${estimateHistoryLabel}, newest first.`}
        size="wide"
        footer={
          <button className="btn btn-secondary" onClick={() => setEstimateHistoryOpen(false)}>
            Close
          </button>
        }
      >
        <div className="stack">
          <div className="card">
            <div className="card-body row wrap" style={{ gap: 10 }}>
              <div className="input-group" style={{ flex: "1 1 260px" }}>
                <span className="prefix">
                  <Search size={14} />
                </span>
                <input
                  className="input"
                  placeholder="Search plate, customer, job or estimate…"
                  value={estimateSearch}
                  onChange={(event) => setEstimateSearch(event.target.value)}
                  autoFocus
                />
              </div>
              <select
                className="select"
                value={estimateHistoryVehicle}
                onChange={(event) => {
                  const key = event.target.value;
                  setEstimateHistoryVehicle(key);
                  const currentJob = state.jobCards.find((job) => job.id === estimateHistoryJob);
                  if (currentJob?.vehicleNo.trim().toUpperCase() !== key) {
                    setEstimateHistoryJob("");
                  }
                }}
                style={{ minWidth: 210 }}
              >
                <option value="">All vehicles with estimates</option>
                {estimateVehicleKeys.map((key) => {
                  const sample = estimateHistoryByVehicle.get(key)?.[0]?.job;
                  return (
                    <option key={key} value={key}>
                      {sample?.vehicleNo ?? key} · {sample?.customerName ?? "Vehicle"}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {estimateGroups.length === 0 ? (
            <EmptyState
              icon={<FileText size={22} />}
              title="No estimates found"
              message={
                estimateSearch || estimateHistoryVehicle
                  ? "No quotations match this vehicle and search. Try a different plate or clear the filters."
                  : "No estimates have been recorded yet. Create one on a job card to start the history."
              }
              action={
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setEstimateSearch("");
                    setEstimateHistoryVehicle("");
                    setEstimateHistoryJob("");
                  }}
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            estimateGroups.map((group) => {
              const sample = group.items[0].job;
              return (
                <div className="card" key={group.key}>
                  <div className="card-head">
                    <div>
                      <h3>
                        {sample.vehicleNo} · {sample.make} {sample.model}
                      </h3>
                      <p>
                        {sample.customerName} · {group.items.length} estimate
                        {group.items.length === 1 ? "" : "s"} on record
                      </p>
                    </div>
                    <span className="badge badge-brand">
                      <FileText size={11} /> {group.items.length}
                    </span>
                  </div>
                  <div className="card-body stack" style={{ paddingTop: 6, gap: 10 }}>
                    {group.items.map((item) => {
                      const linesOpen = expandedEstimates.has(item.estimate.id);
                      const isCurrentJob = Boolean(estimateHistoryJob) && item.job.id === estimateHistoryJob;
                      return (
                        <div className="estimate-history-item" key={item.estimate.id}>
                          <div className="row-between wrap" style={{ gap: 6 }}>
                            <div className="row wrap" style={{ gap: 6 }}>
                              <strong>{estimateDisplayNumber(item.estimate)}</strong>
                              <span className="chip">{estimateKindLabel(item.estimate)}</span>
                              <StatusBadge status={item.estimate.status} />
                              {estimateHistoryJob && (
                                <span className={isCurrentJob ? "badge badge-brand" : "badge badge-slate"}>
                                  {isCurrentJob ? "Current job" : "Previous visit"}
                                </span>
                              )}
                            </div>
                            <div className="row wrap" style={{ gap: 6 }}>
                              <span className="badge badge-slate">{money(item.quotedTotal)} quoted</span>
                              {item.approvedTotal > 0 && (
                                <span className="badge badge-green">
                                  {money(item.approvedTotal)} approved
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="tiny muted" style={{ marginTop: 4 }}>
                            {shortDate(item.estimate.createdAt)} · {item.job.id} ·{" "}
                            {item.job.repairType} · {item.estimate.createdBy ?? "Workshop"}
                          </div>
                          {item.estimate.notes && (
                            <div className="tiny muted" style={{ marginTop: 6, fontStyle: "italic" }}>
                              “{item.estimate.notes}”
                            </div>
                          )}
                          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleEstimateLines(item.estimate.id)}
                            >
                              {linesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              {linesOpen
                                ? "Hide lines"
                                : `${item.estimate.lines.length} line${item.estimate.lines.length === 1 ? "" : "s"}`}
                            </button>
                            <Link className="btn btn-soft btn-sm" to={`/jobs/${item.job.id}`}>
                              Open job
                              <ArrowRight size={12} />
                            </Link>
                          </div>
                          {linesOpen && (
                            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                              {item.estimate.lines.length === 0 ? (
                                <div className="tiny muted">No line items on this estimate.</div>
                              ) : (
                                item.estimate.lines.map((line) => {
                                  const lineTotal = line.qty * line.unitPrice;
                                  const approvedPrice = line.approvedUnitPrice ?? line.unitPrice;
                                  return (
                                    <div className="estimate-line-row" key={line.id}>
                                      <div style={{ minWidth: 0 }}>
                                        <div className="cell-main" style={{ fontSize: 12 }}>
                                          {line.description}
                                        </div>
                                        <div className="tiny muted">
                                          {line.type} · {line.qty} × {money(line.unitPrice)}
                                        </div>
                                      </div>
                                      <div className="row wrap" style={{ gap: 4, justifyContent: "flex-end" }}>
                                        <span className="badge badge-slate">{money(lineTotal)}</span>
                                        {line.approvalStatus === "Approved" &&
                                          approvedPrice !== line.unitPrice && (
                                            <span className="badge badge-green">
                                              Approved {money(line.qty * approvedPrice)}
                                            </span>
                                          )}
                                        {line.approvalStatus && (
                                          <StatusBadge status={line.approvalStatus} />
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Modal>
    </div>
  );
}

function tomorrowKey(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localDateKey(date);
}
