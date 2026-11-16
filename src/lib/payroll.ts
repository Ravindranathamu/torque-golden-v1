import type { AppState, WorkerProfile } from "../types";
import { ledgerCommissionForWorker } from "./utils";

export function localDateKey(value: string | Date = new Date()): string {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
    return localDateKey(parsed);
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthBounds(date: Date = new Date()): { start: string; end: string; label: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: localDateKey(start),
    end: localDateKey(end),
    label: date.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
  };
}

export function workingDaysInMonth(date: Date, workingDays: number[]): number {
  const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    if (workingDays.includes(new Date(date.getFullYear(), date.getMonth(), day).getDay())) {
      count += 1;
    }
  }
  return Math.max(1, count);
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  offDays: number;
  paidOffDays: number;
  marks: number;
  payableDays: number;
}

export function attendanceSummary(
  state: AppState,
  worker: WorkerProfile,
  date: Date = new Date(),
): AttendanceSummary {
  const { start, end } = monthBounds(date);
  const records = state.attendance.filter(
    (record) =>
      record.workerId === worker.id && record.date >= start && record.date <= end,
  );
  const present = records.filter((record) => record.status === "Present").length;
  const absent = records.filter((record) => record.status === "Absent").length;
  const offDays = records.filter((record) => record.status === "Off Day").length;
  const paidOffDays = Math.min(offDays, Math.max(0, worker.allowedOffDaysPerMonth));
  return {
    present,
    absent,
    offDays,
    paidOffDays,
    marks: records.length,
    payableDays: present + paidOffDays,
  };
}

export interface MonthlyPayrollRow {
  workerId: string;
  name: string;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  offDays: number;
  paidOffDays: number;
  basic: number;
  commission: number;
  gross: number;
  loanDeduction: number;
  epfEmployee: number;
  epfEmployer: number;
  etfEmployer: number;
  net: number;
  attendanceBased: boolean;
}

export function monthlyPayrollRow(
  state: AppState,
  worker: WorkerProfile,
  date: Date = new Date(),
): MonthlyPayrollRow {
  const { start, end } = monthBounds(date);
  const workingDays = workingDaysInMonth(date, state.settings.workingDays);
  const attendance = attendanceSummary(state, worker, date);
  const attendanceBased = attendance.marks > 0;
  const monthlyBasic =
    worker.payType === "Daily"
      ? worker.dailyRate * workingDays
      : worker.baseSalary;
  const basic = attendanceBased
    ? Math.min(monthlyBasic, (monthlyBasic / workingDays) * attendance.payableDays)
    : monthlyBasic;
  const commission = worker.commissionEnabled
    ? state.ledger
        .filter(
          (entry) =>
            localDateKey(entry.date) >= start &&
            localDateKey(entry.date) <= end,
        )
        .reduce(
          (sum, entry) => sum + ledgerCommissionForWorker(entry, worker.id),
          0,
        )
    : 0;
  const gross = basic + commission;
  const loanDeduction = state.staffLoans
    .filter((loan) => loan.workerId === worker.id && loan.status === "Active")
    .reduce((sum, loan) => sum + Math.min(loan.balance, loan.monthlyDeduction), 0);
  const epfEmployee = worker.epfEnabled
    ? (gross * state.settings.epfEmployeeRate) / 100
    : 0;
  const epfEmployer = worker.epfEnabled
    ? (gross * state.settings.epfEmployerRate) / 100
    : 0;
  const etfEmployer = worker.etfEnabled ? (gross * state.settings.etfRate) / 100 : 0;
  const net = Math.max(0, gross - loanDeduction - epfEmployee);
  return {
    workerId: worker.id,
    name: worker.fullName,
    workingDays,
    presentDays: attendance.present,
    absentDays: attendance.absent,
    offDays: attendance.offDays,
    paidOffDays: attendance.paidOffDays,
    basic,
    commission,
    gross,
    loanDeduction,
    epfEmployee,
    epfEmployer,
    etfEmployer,
    net,
    attendanceBased,
  };
}

export interface DailyWageDue {
  days: number;
  baseAmount: number;
  commissionAmount: number;
  amount: number;
  from: string;
  commissionIncluded: boolean;
}

export function dailyWageDue(
  state: AppState,
  worker: WorkerProfile,
  includeCommission: boolean,
  date: Date = new Date(),
): DailyWageDue {
  const today = localDateKey(date);
  const previous = state.wagePayouts
    .filter((payout) => payout.workerId === worker.id)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
  const from = previous?.paidAt ? localDateKey(previous.paidAt) : localDateKey(worker.joined);
  const presentDates = state.attendance
    .filter(
      (record) =>
        record.workerId === worker.id &&
        record.status === "Present" &&
        record.date > from &&
        record.date <= today,
    )
    .map((record) => record.date);
  const days = new Set(presentDates).size;
  const baseAmount = days * worker.dailyRate;
  const commissionAmount =
    includeCommission && worker.commissionEnabled
      ? state.ledger
          .filter((entry) => {
            const key = localDateKey(entry.date);
            return key > from && key <= today;
          })
          .reduce(
            (sum, entry) => sum + ledgerCommissionForWorker(entry, worker.id),
            0,
          )
      : 0;
  return {
    days,
    baseAmount,
    commissionAmount,
    amount: baseAmount + commissionAmount,
    from,
    commissionIncluded: includeCommission && worker.commissionEnabled,
  };
}

export function nextWorkingDayLabel(workingDays: number[]): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return workingDays.map((day) => names[day] ?? "").filter(Boolean).join(" · ");
}
