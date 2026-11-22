import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  KeyRound,
  Landmark,
  Link2,
  Lock,
  MessageCircle,
  Pencil,
  Percent,
  Plus,
  ShieldCheck,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { supabase } from "../lib/supabase";
import { featureEnabled } from "../lib/features";
import { commissionsByWorker } from "../lib/analytics";
import { dateOnly, money, shortDate, waLink } from "../lib/utils";
import {
  Alert,
  Avatar,
  DeptChips,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  StatCard,
  StatusBadge,
  Tabs,
} from "../components/ui";
import { useToast } from "../components/Toast";
import type { Department, WorkerProfile, WorkshopUser } from "../types";

type TeamTab = "staff" | "workers" | "payroll";

const departments: Department[] = ["PRO", "Supervisor", "Cashier", "Accounting", "Stores"];

const emptyStaffForm = {
  name: "",
  username: "",
  pin: "",
  phone: "",
  email: "",
  gdriveEmail: "",
  departments: [] as Department[],
  baseSalary: "0",
  commissionRate: "0",
  workerId: "",
  sectionIds: [] as string[],
  active: true,
};

const emptyWorkerForm = {
  fullName: "",
  phone: "",
  nic: "",
  address: "",
  emergencyName: "",
  emergencyPhone: "",
  baseSalary: "0",
  commissionRate: "0",
  joined: dateOnly(new Date().toISOString()),
  status: "Active" as WorkerProfile["status"],
  bankName: "",
  accountNumber: "",
  userId: "",
  payType: "Monthly" as WorkerProfile["payType"],
  dailyRate: "0",
  epfEnabled: true,
  etfEnabled: true,
  commissionEnabled: true,
  allowedOffDaysPerMonth: "2",
  sectionIds: [] as string[],
};

export function TeamPage() {
  const { state, currentUser, cloudStatus, addUser, updateUser, removeUser, addWorker, updateWorker } = useApp();
  const { push } = useToast();
  const [tab, setTab] = useState<TeamTab>("staff");
  const [unlockedLocal, setUnlockedLocal] = useState(false);
  const cloudMode = cloudStatus !== "disabled";
  const sectionsEnabled =
    featureEnabled(state.settings, "enable_multi_sections") && state.sections.length > 0;
  const unlocked = cloudMode ? Boolean(currentUser?.isOwner) : unlockedLocal;
  const [password, setPassword] = useState("");
  const [staffOpen, setStaffOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState({ ...emptyStaffForm });
  const [removeTarget, setRemoveTarget] = useState<WorkshopUser | null>(null);
  const [workerOpen, setWorkerOpen] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [workerForm, setWorkerForm] = useState({ ...emptyWorkerForm });

  const payroll = useMemo(() => commissionsByWorker(state, "month"), [state]);
  const payrollEnabled =
    featureEnabled(state.settings, "enable_payroll_epf_etf") ||
    featureEnabled(state.settings, "enable_daily_wages");
  const epfEtfEnabled = featureEnabled(state.settings, "enable_payroll_epf_etf");
  const dailyWagesEnabled = featureEnabled(state.settings, "enable_daily_wages");
  const monthlyBase = state.workers
    .filter((worker) => worker.status === "Active")
    .reduce((sum, worker) => sum + worker.baseSalary, 0);
  const monthlyCommission = payroll.reduce((sum, row) => sum + row.commission, 0);
  const coveredDepartments = departments.filter((department) =>
    state.users.some((user) => !user.isOwner && user.active && user.departments.includes(department)),
  );
  const editingUser = state.users.find((user) => user.id === editingUserId) ?? null;
  const editingWorker = state.workers.find((worker) => worker.id === editingWorkerId) ?? null;

  function unlock() {
    if (!state.settings.ownerPassword) {
      push("No owner master password is configured. Set one in Settings.", "error");
      return;
    }
    if (password !== state.settings.ownerPassword) {
      push("Incorrect master password.", "error");
      return;
    }
    setUnlockedLocal(true);
    setPassword("");
    push("Owner controls unlocked for this session.");
  }

  function openAddStaff() {
    if (!unlocked) {
      push("Unlock owner controls to manage staff accounts.", "error");
      return;
    }
    if (cloudMode) {
      push(
        "Sign-in accounts live on the workshop server. Ask RAVBsoft to create the Auth account, then assign its departments here.",
      );
      return;
    }
    setEditingUserId(null);
    setStaffForm({ ...emptyStaffForm });
    setStaffOpen(true);
  }

  function openEditStaff(user: WorkshopUser) {
    if (!unlocked) {
      push("Unlock owner controls to edit staff accounts.", "error");
      return;
    }
    setEditingUserId(user.id);
    setStaffForm({
      name: user.name,
      username: user.username,
      pin: user.pin,
      phone: user.phone,
      email: user.email ?? "",
      gdriveEmail: user.gdriveEmail ?? "",
      departments: [...user.departments],
      baseSalary: String(user.baseSalary),
      commissionRate: String(user.commissionRate),
      workerId: user.workerId ?? "",
      sectionIds: [...(user.sectionIds ?? [])],
      active: user.active,
    });
    setStaffOpen(true);
  }

  async function saveStaff() {
    if (!staffForm.name.trim()) {
      push("Enter the staff member's full name.", "error");
      return;
    }
    if (!/^[a-z0-9._-]{3,}$/i.test(staffForm.username.trim())) {
      push("Username must be at least 3 characters (letters, numbers, dot, dash).", "error");
      return;
    }
    if (state.users.some(
      (user) =>
        user.id !== editingUserId &&
        user.username.toLowerCase() === staffForm.username.trim().toLowerCase(),
    )) {
      push("That username is already in use.", "error");
      return;
    }
    if (!cloudMode && !/^\d{4,6}$/.test(staffForm.pin)) {
      push("PIN must be 4 to 6 digits.", "error");
      return;
    }
    if (!staffForm.phone.trim()) {
      push("Enter a phone number for WhatsApp notifications.", "error");
      return;
    }
    if (!editingUser?.isOwner && staffForm.departments.length === 0) {
      push("Choose at least one department for this staff member.", "error");
      return;
    }
    if (
      sectionsEnabled &&
      !editingUser?.isOwner &&
      staffForm.departments.some(
        (department) => department === "Supervisor" || department === "Stores",
      ) &&
      staffForm.sectionIds.length === 0
    ) {
      push("Choose at least one workshop section for this supervisor or storekeeper.", "error");
      return;
    }
    const baseSalary = Number(staffForm.baseSalary);
    const commissionRate = Number(staffForm.commissionRate);
    if (!Number.isFinite(baseSalary) || baseSalary < 0 || !Number.isFinite(commissionRate) || commissionRate < 0) {
      push("Salary and commission must be zero or more.", "error");
      return;
    }
    if (editingUser) {
      const nextUser = {
        ...editingUser,
        name: staffForm.name.trim(),
        username: staffForm.username.trim().toLowerCase(),
        pin: staffForm.pin,
        phone: staffForm.phone.trim(),
        email: staffForm.email.trim() || undefined,
        gdriveEmail: staffForm.gdriveEmail.trim() || undefined,
        departments: editingUser.isOwner ? [] : staffForm.departments,
        sectionIds: editingUser.isOwner ? [] : staffForm.sectionIds,
        baseSalary,
        commissionRate,
        workerId: staffForm.workerId || undefined,
        active: editingUser.isOwner ? true : staffForm.active,
      };
      if (cloudMode && supabase) {
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: nextUser.name,
            username: nextUser.username,
            phone: nextUser.phone,
            email: nextUser.email ?? null,
            gdrive_email: nextUser.gdriveEmail ?? null,
            departments: nextUser.departments,
            base_salary: nextUser.baseSalary,
            commission_rate: nextUser.commissionRate,
            active: nextUser.active,
          })
          .eq("id", editingUser.id);
        if (error) {
          push(`Could not save the staff profile: ${error.message}`, "error");
          return;
        }
      }
      updateUser(nextUser);
      push(
        cloudMode
          ? "Staff departments saved to the workshop server. Changes apply at their next sign-in."
          : "Staff account updated.",
      );
    } else {
      addUser({
        name: staffForm.name.trim(),
        username: staffForm.username.trim().toLowerCase(),
        pin: staffForm.pin,
        isOwner: false,
        departments: staffForm.departments,
        sectionIds: staffForm.sectionIds,
        phone: staffForm.phone.trim(),
        email: staffForm.email.trim() || undefined,
        gdriveEmail: staffForm.gdriveEmail.trim() || undefined,
        baseSalary,
        commissionRate,
        workerId: staffForm.workerId || undefined,
        active: staffForm.active,
      });
      push("Staff account created. Share the PIN securely.");
    }
    setStaffOpen(false);
    setEditingUserId(null);
    setStaffForm({ ...emptyStaffForm });
  }

  function confirmRemoveStaff() {
    if (!removeTarget) return;
    if (cloudMode) {
      push(
        "Removing a sign-in account is a server-side action. Suspend the profile instead, or ask RAVBsoft to delete the Auth user.",
        "error",
      );
      setRemoveTarget(null);
      return;
    }
    const result = removeUser(removeTarget.id);
    if (!result.ok) {
      push(result.message ?? "Could not remove this account.", "error");
      return;
    }
    push(`${removeTarget.name} can no longer sign in.`);
    setRemoveTarget(null);
  }

  function openAddWorker() {
    if (!unlocked) {
      push("Unlock owner controls to add a worker.", "error");
      return;
    }
    setEditingWorkerId(null);
    setWorkerForm({ ...emptyWorkerForm });
    setWorkerOpen(true);
  }

  function openEditWorker(worker: WorkerProfile) {
    if (!unlocked) {
      push("Unlock owner controls to edit salary and commission.", "error");
      return;
    }
    setEditingWorkerId(worker.id);
    setWorkerForm({
      fullName: worker.fullName,
      phone: worker.phone,
      nic: worker.nic,
      address: worker.address,
      emergencyName: worker.emergencyName,
      emergencyPhone: worker.emergencyPhone,
      baseSalary: String(worker.baseSalary),
      commissionRate: String(worker.commissionRate),
      joined: dateOnly(worker.joined),
      status: worker.status,
      bankName: worker.bankName,
      accountNumber: worker.accountNumber,
      userId: worker.userId ?? "",
      payType: worker.payType,
      dailyRate: String(worker.dailyRate),
      epfEnabled: worker.epfEnabled,
      etfEnabled: worker.etfEnabled,
      commissionEnabled: worker.commissionEnabled,
      allowedOffDaysPerMonth: String(worker.allowedOffDaysPerMonth),
      sectionIds: [...(worker.sectionIds ?? [])],
    });
    setWorkerOpen(true);
  }

  function saveWorker() {
    if (!workerForm.fullName.trim() || !workerForm.phone.trim()) {
      push("Worker name and phone are required.", "error");
      return;
    }
    if (sectionsEnabled && workerForm.sectionIds.length === 0) {
      push("Choose the section this worker works in.", "error");
      return;
    }
    const baseSalary = Number(workerForm.baseSalary);
    const commissionRate = Number(workerForm.commissionRate);
    const dailyRate = Number(workerForm.dailyRate);
    const allowedOffDaysPerMonth = Number(workerForm.allowedOffDaysPerMonth);
    if (!Number.isFinite(baseSalary) || baseSalary < 0 || !Number.isFinite(commissionRate) || commissionRate < 0) {
      push("Salary and commission must be zero or more.", "error");
      return;
    }
    if (!Number.isFinite(dailyRate) || dailyRate < 0) {
      push("Daily rate must be zero or more.", "error");
      return;
    }
    if (!Number.isFinite(allowedOffDaysPerMonth) || allowedOffDaysPerMonth < 0) {
      push("Allowed off days must be zero or more.", "error");
      return;
    }
    const payload = {
      fullName: workerForm.fullName.trim(),
      phone: workerForm.phone.trim(),
      nic: workerForm.nic.trim(),
      address: workerForm.address.trim(),
      emergencyName: workerForm.emergencyName.trim(),
      emergencyPhone: workerForm.emergencyPhone.trim(),
      baseSalary,
      commissionRate,
      joined: new Date(`${workerForm.joined}T12:00:00`).toISOString(),
      status: workerForm.status,
      bankName: workerForm.bankName.trim(),
      accountNumber: workerForm.accountNumber.trim(),
      userId: workerForm.userId || undefined,
      payType: workerForm.payType,
      dailyRate,
      epfEnabled: workerForm.epfEnabled,
      etfEnabled: workerForm.etfEnabled,
      commissionEnabled: workerForm.commissionEnabled,
      allowedOffDaysPerMonth,
      sectionIds: workerForm.sectionIds,
    };
    if (editingWorker) {
      updateWorker({ ...editingWorker, ...payload });
      push("Worker profile and pay rates updated.");
    } else {
      addWorker(payload);
      push("Worker added to the team.");
    }
    setWorkerOpen(false);
    setEditingWorkerId(null);
    setWorkerForm({ ...emptyWorkerForm });
  }

  function sendPayslip(worker: WorkerProfile) {
    const row = payroll.find((entry) => entry.workerId === worker.id);
    if (!row) return;
    const message = `Hello ${worker.fullName}, your salary statement from ${state.settings.companyName} for ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}:\n\nBase salary: ${money(row.baseSalary)}\nCommission: ${money(row.commission)}\nTotal payable: ${money(row.baseSalary + row.commission)}\n\nThank you for your hard work.`;
    window.open(waLink(worker.phone, message), "_blank", "noopener,noreferrer");
  }

  const lockPanel = !unlocked ? (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-body">
        <div className="row-between wrap" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 11 }}>
            <span className="part-icon" style={{ width: 40, height: 40, flex: "0 0 40px" }}>
              <Lock size={17} />
            </span>
            <div>
              <div className="strong">Owner controls are locked</div>
              <div className="tiny muted">
                Salaries, commission rates and account changes need the owner master password.
              </div>
            </div>
          </div>
          <div className="row wrap">
            <input
              className="input"
              style={{ width: 210 }}
              type="password"
              placeholder="Owner master password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") unlock();
              }}
            />
            <button className="btn btn-primary" onClick={unlock}>
              <Unlock />
              Unlock
            </button>
          </div>
        </div>
        {state.settings.demoMode && (
          <div className="tiny muted" style={{ marginTop: 9 }}>
            Demo master password: <strong>owner123</strong>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="alert alert-success" style={{ marginBottom: 18 }}>
      <ShieldCheck />
      <div className="row-between wrap" style={{ width: "100%" }}>
        <span>
          {cloudMode ? (
            <>
              <strong>Owner controls unlocked</strong> — you are signed in as the owner, so
              departments, salaries and access changes are available for this session.
            </>
          ) : (
            <>
              <strong>Owner controls unlocked</strong> — salary, commission and access changes are
              available until you sign out or lock the page.
            </>
          )}
        </span>
        {!cloudMode && (
          <button className="btn btn-ghost btn-sm" onClick={() => setUnlockedLocal(false)}>
            <Lock />
            Lock again
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        title="Team, HR & access"
        subtitle="Staff accounts, departments, worker profiles, salaries and commissions — owner-only."
        actions={
          <>
            <Tabs<TeamTab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "staff", label: "Staff access", count: state.users.length },
                { id: "workers", label: "Workers & HR", count: state.workers.length },
                ...(payrollEnabled
                  ? [{ id: "payroll" as TeamTab, label: "Payroll" }]
                  : []),
              ]}
            />
            {tab === "staff" ? (
              <button className="btn btn-primary" onClick={openAddStaff} disabled={!unlocked}>
                <UserPlus />
                Add staff
              </button>
            ) : tab === "workers" ? (
              <button className="btn btn-primary" onClick={openAddWorker} disabled={!unlocked}>
                <Plus />
                Add worker
              </button>
            ) : null}
          </>
        }
      />

      {lockPanel}

      {tab === "staff" && (
        <div className="stack">
          <div className="grid cols-4">
            <StatCard
              label="Staff accounts"
              value={state.users.length}
              meta={`${state.users.filter((user) => user.active).length} active`}
              icon={<Users />}
            />
            <StatCard
              label="Departments covered"
              value={`${coveredDepartments.length}/5`}
              meta={coveredDepartments.join(" · ") || "No departments assigned"}
              icon={<Briefcase />}
              tone="blue"
            />
            <StatCard
              label="Multi-department staff"
              value={state.users.filter((user) => !user.isOwner && user.departments.length > 1).length}
              meta="One login, several counters"
              icon={<KeyRound />}
              tone="purple"
            />
            <StatCard
              label="Monthly salary base"
              value={unlocked ? money(monthlyBase) : "••••••"}
              meta={unlocked ? "Active worker profiles" : "Unlock to view"}
              icon={<Wallet />}
              tone="amber"
            />
          </div>

          <Alert tone="info" icon={<ShieldCheck />} title="Department access is additive">
            A user can hold PRO, Stores and Supervisor together. Every screen checks the
            department before allowing an action, while the owner sees all workshops screens.
          </Alert>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Staff accounts & login access</h3>
                <p>
                  {cloudMode
                    ? "Each person signs in with their workshop email and password; departments decide which workspaces open."
                    : "Each person signs in with a PIN and only sees their departments."}
                </p>
              </div>
              <span className="badge badge-green">
                {state.users.filter((user) => user.active).length} active
              </span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Staff member</th>
                    <th>Departments</th>
                    <th>Contact</th>
                    <th>Commission</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="row" style={{ gap: 9 }}>
                          <Avatar name={user.name} size="sm" />
                          <div>
                            <div className="cell-main">{user.name}</div>
                            <div className="cell-sub">@{user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <DeptChips departments={user.departments} owner={user.isOwner} />
                      </td>
                      <td>
                        <div className="cell-main" style={{ fontSize: 12 }}>{user.phone}</div>
                        <div className="cell-sub">{user.email ?? "No email"}</div>
                      </td>
                      <td>
                        {user.isOwner ? (
                          <span className="tiny muted">Owner</span>
                        ) : unlocked ? (
                          <div>
                            <div className="cell-main" style={{ fontSize: 12 }}>
                              {user.commissionRate}%
                            </div>
                            <div className="cell-sub">{money(user.baseSalary)} salary</div>
                          </div>
                        ) : (
                          <span className="badge badge-slate">
                            <Lock size={10} /> Locked
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={user.active ? "Active" : "Suspended"} />
                      </td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => openEditStaff(user)}
                            disabled={!unlocked}
                            title={unlocked ? "Edit account" : "Unlock owner controls first"}
                          >
                            <Pencil />
                          </button>
                          {!user.isOwner && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setRemoveTarget(user)}
                              disabled={!unlocked || cloudMode}
                              title={
                                cloudMode
                                  ? "Sign-in accounts are deleted on the workshop server by RAVBsoft"
                                  : "Remove account"
                              }
                            >
                              <Trash2 />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "workers" && (
        <div className="stack">
          <div className="grid cols-4">
            <StatCard
              label="Active workers"
              value={state.workers.filter((worker) => worker.status === "Active").length}
              meta={`${state.workers.length} profiles on file`}
              icon={<Users />}
            />
            <StatCard
              label="Monthly base"
              value={unlocked ? money(monthlyBase) : "••••••"}
              meta={unlocked ? "Active salaries" : "Unlock to view"}
              icon={<Wallet />}
              tone="blue"
            />
            <StatCard
              label="Average commission"
              value={unlocked ? `${state.workers.length ? Math.round(state.workers.reduce((sum, worker) => sum + worker.commissionRate, 0) / state.workers.length) : 0}%` : "••"}
              meta="Of labour revenue"
              icon={<Percent />}
              tone="amber"
            />
            <StatCard
              label="Linked staff"
              value={state.workers.filter((worker) => worker.userId).length}
              meta="Worker + login joined"
              icon={<Link2 />}
              tone="purple"
            />
          </div>

          {state.workers.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Users size={22} />}
                title="No workers yet"
                message="Add technicians, helpers and supervisors so labour tasks can be assigned and commissions calculated."
                action={
                  <button className="btn btn-primary" onClick={openAddWorker} disabled={!unlocked}>
                    <Plus />
                    Add the first worker
                  </button>
                }
              />
            </div>
          ) : (
            <div className="grid cols-3">
              {state.workers.map((worker) => {
                const workerPayroll = payroll.find((row) => row.workerId === worker.id);
                const linkedUser = state.users.find((user) => user.id === worker.userId);
                return (
                  <div className="card" key={worker.id}>
                    <div className="card-body">
                      <div className="row-between">
                        <div className="row" style={{ gap: 10 }}>
                          <Avatar name={worker.fullName} />
                          <div>
                            <div className="strong">{worker.fullName}</div>
                            <div className="tiny muted">
                              {linkedUser ? `Login @${linkedUser.username}` : "No staff login linked"}
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={worker.status} />
                      </div>
                      <div className="divider" />
                      <div className="kv">
                        <span>Phone</span>
                        <span>{worker.phone}</span>
                      </div>
                      <div className="kv">
                        <span>Joined</span>
                        <span>{shortDate(worker.joined)}</span>
                      </div>
                      <div className="kv">
                        <span>Base salary</span>
                        <span>{unlocked ? money(worker.baseSalary) : "••••••"}</span>
                      </div>
                      <div className="kv">
                        <span>Commission rate</span>
                        <span>{unlocked ? `${worker.commissionRate}%` : "••"}</span>
                      </div>
                      <div className="kv">
                        <span>This month commission</span>
                        <span>{unlocked ? money(workerPayroll?.commission ?? 0) : "••••"}</span>
                      </div>
                      <div className="kv">
                        <span>Bank</span>
                        <span>{worker.bankName || "Not set"}</span>
                      </div>
                      <div className="kv">
                        <span>Emergency contact</span>
                        <span>{worker.emergencyName || "Not set"}</span>
                      </div>
                      <div className="row wrap" style={{ marginTop: 12 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEditWorker(worker)}
                          disabled={!unlocked}
                        >
                          <Pencil />
                          Edit profile
                        </button>
                        <a
                          className="btn btn-ghost btn-sm"
                          href={waLink(
                            worker.phone,
                            `Hello ${worker.fullName}, this is ${state.settings.companyName}.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle />
                          WhatsApp
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "payroll" && payrollEnabled && (
        <div className="stack">
          {!unlocked ? (
            <div className="card">
              <EmptyState
                icon={<Lock size={22} />}
                title="Payroll is protected"
                message="Enter the owner master password above to view salaries, commissions and payroll statements."
              />
            </div>
          ) : (
            <>
              <div className="grid cols-4">
                <StatCard
                  label="Monthly base payroll"
                  value={money(monthlyBase)}
                  meta="Active workers"
                  icon={<Wallet />}
                />
                <StatCard
                  label="Monthly commissions"
                  value={money(monthlyCommission)}
                  meta="This month's labour"
                  icon={<Percent />}
                  tone="amber"
                />
                <StatCard
                  label="Total payable"
                  value={money(monthlyBase + monthlyCommission)}
                  meta="Base plus commission"
                  icon={<Landmark />}
                  tone="blue"
                />
                <StatCard
                  label="Payroll ratio"
                  value={`${
                    state.ledger.length
                      ? Math.min(
                          100,
                          Math.round(
                            ((monthlyBase + monthlyCommission) /
                              Math.max(
                                1,
                                state.ledger
                                  .filter((entry) => {
                                    const date = new Date(entry.date);
                                    const now = new Date();
                                    return (
                                      date.getMonth() === now.getMonth() &&
                                      date.getFullYear() === now.getFullYear()
                                    );
                                  })
                                  .reduce(
                                    (sum, entry) =>
                                      sum + entry.laborRevenue + entry.partsRevenue - entry.discount,
                                    0,
                                  ),
                              )) *
                              100,
                          ),
                        )
                      : 0
                  }%`}
                  meta="Of monthly revenue"
                  icon={<Briefcase />}
                  tone="purple"
                />
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Monthly payroll & commission statement</h3>
                    <p>Bank details and this month's commission accrual.</p>
                  </div>
                  <span className="badge badge-amber">
                    {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Worker</th>
                        <th>Bank account</th>
                        <th className="num">Base salary</th>
                        <th className="num">Commission</th>
                        <th className="num">Total</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {payroll.map((row) => {
                        const worker = state.workers.find((entry) => entry.id === row.workerId);
                        return (
                          <tr key={row.workerId}>
                            <td>
                              <div className="cell-main">{row.name}</div>
                              <div className="cell-sub">{worker?.phone}</div>
                            </td>
                            <td>
                              <div className="cell-main" style={{ fontSize: 12 }}>
                                {worker?.bankName || "Not set"}
                              </div>
                              <div className="cell-sub">{worker?.accountNumber || "—"}</div>
                            </td>
                            <td className="num">{money(row.baseSalary)}</td>
                            <td className="num">{money(row.commission)}</td>
                            <td className="num strong">
                              {money(row.baseSalary + row.commission)}
                            </td>
                            <td>
                              <StatusBadge status={worker?.status ?? "Active"} />
                            </td>
                            <td>
                              {worker && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => sendPayslip(worker)}
                                >
                                  <MessageCircle />
                                  Payslip
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <Alert tone="info" icon={<CheckCircle2 />} title="How commission is earned">
                Commission is calculated from the labour value of each task and the worker's rate
                at the moment the job is billed. Parts revenue is not commissioned. Payroll here is
                an accrual view — payouts are made through your normal bank process.
              </Alert>
            </>
          )}
        </div>
      )}

      <Modal
        open={staffOpen}
        onClose={() => setStaffOpen(false)}
        title={editingUser ? "Edit staff account" : "Add a staff account"}
        subtitle="Departments control which screens and actions this login can use."
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setStaffOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveStaff}>
              {editingUser ? <Pencil /> : <UserPlus />}
              {editingUser ? "Save changes" : "Create account"}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Full name" required>
              <input
                className="input"
                placeholder="e.g. Kasun Silva"
                value={staffForm.name}
                onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })}
              />
            </Field>
            <Field label="Username" required hint="Used on the sign-in screen.">
              <input
                className="input"
                placeholder="kasun"
                value={staffForm.username}
                onChange={(event) => setStaffForm({ ...staffForm, username: event.target.value })}
              />
            </Field>
            {!cloudMode && (
              <Field label="Login PIN" required hint="4 to 6 digits. Share it securely.">
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="1234"
                  value={staffForm.pin}
                  onChange={(event) =>
                    setStaffForm({ ...staffForm, pin: event.target.value.replace(/\D/g, "") })
                  }
                />
              </Field>
            )}
            <Field label="Phone" required>
              <input
                className="input"
                placeholder="+94 77 123 4567"
                value={staffForm.phone}
                onChange={(event) => setStaffForm({ ...staffForm, phone: event.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                className="input"
                type="email"
                placeholder="name@workshop.lk"
                value={staffForm.email}
                onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })}
              />
            </Field>
            <Field label="Google Drive email" hint="Optional. Used for workshop photo folders.">
              <input
                className="input"
                type="email"
                placeholder="photos@workshop.lk"
                value={staffForm.gdriveEmail}
                onChange={(event) =>
                  setStaffForm({ ...staffForm, gdriveEmail: event.target.value })
                }
              />
            </Field>
          </div>

          {!editingUser?.isOwner && (
            <div className="field">
              <label>
                Departments <span className="req">*</span>
              </label>
              <div className="dept-picker">
                {departments.map((department) => (
                  <label
                    key={department}
                    className={`dept-option ${
                      staffForm.departments.includes(department) ? "selected" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={staffForm.departments.includes(department)}
                      onChange={(event) =>
                        setStaffForm({
                          ...staffForm,
                          departments: event.target.checked
                            ? [...staffForm.departments, department]
                            : staffForm.departments.filter((entry) => entry !== department),
                        })
                      }
                    />
                    {department}
                  </label>
                ))}
              </div>
              <span className="hint">Pick every department this person works in.</span>
            </div>
          )}

          {!editingUser?.isOwner && sectionsEnabled && (
            <div className="field">
              <label>
                Workshop sections <span className="req">*</span>
              </label>
              <div className="dept-picker">
                {state.sections
                  .filter((section) => section.active)
                  .map((section) => (
                    <label
                      key={section.id}
                      className={`dept-option ${
                        staffForm.sectionIds.includes(section.id) ? "selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={staffForm.sectionIds.includes(section.id)}
                        onChange={(event) =>
                          setStaffForm({
                            ...staffForm,
                            sectionIds: event.target.checked
                              ? [...staffForm.sectionIds, section.id]
                              : staffForm.sectionIds.filter((entry) => entry !== section.id),
                          })
                        }
                      />
                      {section.name}
                    </label>
                  ))}
              </div>
              <span className="hint">
                Several supervisors can serve the same section and work separately. A
                supervisor or storekeeper only sees the sections ticked here.
              </span>
            </div>
          )}

          <div className="form-grid">
            <Field label="Base salary (LKR)" hint="Owner-only payroll data.">
              <input
                className="input"
                type="number"
                min={0}
                value={staffForm.baseSalary}
                onChange={(event) =>
                  setStaffForm({ ...staffForm, baseSalary: event.target.value })
                }
              />
            </Field>
            <Field label="Commission rate %" hint="Informational; worker rates drive payroll.">
              <input
                className="input"
                type="number"
                min={0}
                value={staffForm.commissionRate}
                onChange={(event) =>
                  setStaffForm({ ...staffForm, commissionRate: event.target.value })
                }
              />
            </Field>
            <Field label="Linked worker profile" hint="Join this login to a payroll worker.">
              <select
                className="select"
                value={staffForm.workerId}
                onChange={(event) =>
                  setStaffForm({ ...staffForm, workerId: event.target.value })
                }
              >
                <option value="">No worker link</option>
                {state.workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.fullName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Account status">
              <select
                className="select"
                value={staffForm.active ? "active" : "inactive"}
                disabled={editingUser?.isOwner}
                onChange={(event) =>
                  setStaffForm({ ...staffForm, active: event.target.value === "active" })
                }
              >
                <option value="active">Active — can sign in</option>
                <option value="inactive">Suspended — no access</option>
              </select>
            </Field>
          </div>

          <Alert tone="info" icon={<ShieldCheck />}>
            The owner account cannot be removed or suspended here. A staff account can be
            suspended instantly if a phone is lost or a team member leaves.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={workerOpen}
        onClose={() => setWorkerOpen(false)}
        title={editingWorker ? "Edit worker profile" : "Add a worker"}
        subtitle="HR record, emergency contact, salary and commission."
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setWorkerOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveWorker}>
              {editingWorker ? <Pencil /> : <Plus />}
              {editingWorker ? "Save worker" : "Add worker"}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Full name" required>
              <input
                className="input"
                placeholder="e.g. Kamal Bandara"
                value={workerForm.fullName}
                onChange={(event) =>
                  setWorkerForm({ ...workerForm, fullName: event.target.value })
                }
              />
            </Field>
            <Field label="Phone" required>
              <input
                className="input"
                placeholder="+94 77 345 1122"
                value={workerForm.phone}
                onChange={(event) => setWorkerForm({ ...workerForm, phone: event.target.value })}
              />
            </Field>
            <Field label="NIC">
              <input
                className="input"
                placeholder="198512304567"
                value={workerForm.nic}
                onChange={(event) => setWorkerForm({ ...workerForm, nic: event.target.value })}
              />
            </Field>
            <Field label="Joined date">
              <input
                className="input"
                type="date"
                value={workerForm.joined}
                onChange={(event) => setWorkerForm({ ...workerForm, joined: event.target.value })}
              />
            </Field>
            <Field label="Address" full>
              <input
                className="input"
                placeholder="45/2, Kundasale Road, Kandy"
                value={workerForm.address}
                onChange={(event) => setWorkerForm({ ...workerForm, address: event.target.value })}
              />
            </Field>
          </div>

          {sectionsEnabled && (
            <div className="field">
              <label>
                Works in sections <span className="req">*</span>
              </label>
              <div className="dept-picker">
                {state.sections
                  .filter((section) => section.active)
                  .map((section) => (
                    <label
                      key={section.id}
                      className={`dept-option ${
                        workerForm.sectionIds.includes(section.id) ? "selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={workerForm.sectionIds.includes(section.id)}
                        onChange={(event) =>
                          setWorkerForm({
                            ...workerForm,
                            sectionIds: event.target.checked
                              ? [...workerForm.sectionIds, section.id]
                              : workerForm.sectionIds.filter((entry) => entry !== section.id),
                          })
                        }
                      />
                      {section.name}
                    </label>
                  ))}
              </div>
              <span className="hint">
                Workers only appear in the sections they belong to when a supervisor
                assigns a task.
              </span>
            </div>
          )}

          <div className="form-grid">
            <Field label="Base salary (LKR)" required>
              <input
                className="input"
                type="number"
                min={0}
                value={workerForm.baseSalary}
                onChange={(event) =>
                  setWorkerForm({ ...workerForm, baseSalary: event.target.value })
                }
              />
            </Field>
            <Field label="Commission rate %" required hint="Applied to labour value at billing.">
              <input
                className="input"
                type="number"
                min={0}
                value={workerForm.commissionRate}
                onChange={(event) =>
                  setWorkerForm({ ...workerForm, commissionRate: event.target.value })
                }
              />
            </Field>
            {dailyWagesEnabled && (
              <>
                <Field label="Pay type" required hint="Daily workers are paid at the end of each day.">
                  <select
                    className="select"
                    value={workerForm.payType}
                    onChange={(event) =>
                      setWorkerForm({
                        ...workerForm,
                        payType: event.target.value as WorkerProfile["payType"],
                      })
                    }
                  >
                    <option value="Monthly">Monthly salary</option>
                    <option value="Daily">Daily wage</option>
                  </select>
                </Field>
                {workerForm.payType === "Daily" && (
                  <Field label="Daily rate (LKR)" required>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={workerForm.dailyRate}
                      onChange={(event) =>
                        setWorkerForm({ ...workerForm, dailyRate: event.target.value })
                      }
                    />
                  </Field>
                )}
              </>
            )}
            {workerForm.payType === "Monthly" && (
              <Field label="Allowed paid off days / month" hint="Owner-set allowance used by payroll.">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={workerForm.allowedOffDaysPerMonth}
                  onChange={(event) =>
                    setWorkerForm({
                      ...workerForm,
                      allowedOffDaysPerMonth: event.target.value,
                    })
                  }
                />
              </Field>
            )}
            {epfEtfEnabled && (
              <div className="field">
                <label className="label">Statutory contributions</label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={workerForm.epfEnabled}
                    onChange={(event) =>
                      setWorkerForm({ ...workerForm, epfEnabled: event.target.checked })
                    }
                  />
                  EPF (employee {state.settings.epfEmployeeRate}% · employer {state.settings.epfEmployerRate}%)
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={workerForm.etfEnabled}
                    onChange={(event) =>
                      setWorkerForm({ ...workerForm, etfEnabled: event.target.checked })
                    }
                  />
                  ETF (employer {state.settings.etfRate}%)
                </label>
              </div>
            )}
            <div className="field">
              <label className="label">Commission</label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={workerForm.commissionEnabled}
                  onChange={(event) =>
                    setWorkerForm({ ...workerForm, commissionEnabled: event.target.checked })
                  }
                />
                Include labour commission in pay
              </label>
            </div>
            <Field label="Employment status">
              <select
                className="select"
                value={workerForm.status}
                onChange={(event) =>
                  setWorkerForm({
                    ...workerForm,
                    status: event.target.value as WorkerProfile["status"],
                  })
                }
              >
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Terminated">Terminated</option>
              </select>
            </Field>
            <Field label="Linked staff account">
              <select
                className="select"
                value={workerForm.userId}
                onChange={(event) =>
                  setWorkerForm({ ...workerForm, userId: event.target.value })
                }
              >
                <option value="">No login linked</option>
                {state.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} (@{user.username})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bank">
              <input
                className="input"
                placeholder="Commercial Bank"
                value={workerForm.bankName}
                onChange={(event) =>
                  setWorkerForm({ ...workerForm, bankName: event.target.value })
                }
              />
            </Field>
            <Field label="Account number">
              <input
                className="input"
                placeholder="0071234567"
                value={workerForm.accountNumber}
                onChange={(event) =>
                  setWorkerForm({ ...workerForm, accountNumber: event.target.value })
                }
              />
            </Field>
          </div>

          <div className="form-grid">
            <Field label="Emergency contact name">
              <input
                className="input"
                placeholder="Nadeesha Bandara"
                value={workerForm.emergencyName}
                onChange={(event) =>
                  setWorkerForm({ ...workerForm, emergencyName: event.target.value })
                }
              />
            </Field>
            <Field label="Emergency contact phone">
              <input
                className="input"
                placeholder="+94 76 221 4455"
                value={workerForm.emergencyPhone}
                onChange={(event) =>
                  setWorkerForm({ ...workerForm, emergencyPhone: event.target.value })
                }
              />
            </Field>
          </div>

          <Alert tone="warn" icon={<AlertTriangle />} title="Commission changes affect future jobs">
            Changing the commission rate updates the worker profile immediately. Jobs already
            billed keep the commission recorded on their ledger entries.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title="Remove this staff account?"
        subtitle={removeTarget ? `${removeTarget.name} · @${removeTarget.username}` : undefined}
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRemoveTarget(null)}>
              Keep account
            </button>
            <button className="btn btn-danger" onClick={confirmRemoveStaff}>
              <Trash2 />
              Remove account
            </button>
          </>
        }
      >
        <Alert tone="danger" title="The login will stop working immediately">
          The person will no longer be able to sign in or receive role notifications. Their worker
          profile, job history and commission records remain for audit and payroll. If this is
          temporary, edit the account and suspend it instead.
        </Alert>
      </Modal>
    </div>
  );
}
