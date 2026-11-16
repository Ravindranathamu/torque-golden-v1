import type { ReactNode } from "react";
import { useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  Inbox,
  X,
} from "lucide-react";
import { classNames } from "../lib/utils";
import { useState } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "wide" | "narrow";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={classNames("modal", size)} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  meta,
  icon,
  tone = "brand",
  negative,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  icon: ReactNode;
  tone?: "brand" | "amber" | "red" | "blue" | "purple";
  negative?: boolean;
}) {
  return (
    <div className="card stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={classNames("stat-icon", tone !== "brand" && tone)}>{icon}</span>
      </div>
      <div className={classNames("stat-value", negative && "negative")}>{value}</div>
      {meta && <div className="stat-meta">{meta}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Inbox size={22} />}</div>
      <h4>{title}</h4>
      <p>{message}</p>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

const statusTone: Record<string, string> = {
  "Awaiting Approval": "amber",
  Accepted: "green",
  Rejected: "red",
  "In Progress": "blue",
  "Repair Completed": "purple",
  Paid: "green",
  "Released on Credit": "amber",
  Dispatched: "slate",
  Requested: "amber",
  Issued: "green",
  "Exchange Pending": "blue",
  "Return Pending": "amber",
  Returned: "slate",
  Backordered: "red",
  Unpaid: "red",
  "Awaiting Release Order": "amber",
  Draft: "slate",
  "Waiting for releasing order": "amber",
  "Partially Paid": "amber",
  Settled: "green",
  Pending: "amber",
  Confirmed: "green",
  Rescheduled: "blue",
  Arrived: "purple",
  Fulfilled: "slate",
  Cancelled: "red",
  "No Show": "red",
  "Reminder Sent": "green",
  Completed: "slate",
  Active: "green",
  Suspended: "amber",
  Terminated: "red",
  Cash: "green",
  Card: "blue",
  "Bank Transfer": "blue",
  "Release Order": "blue",
  Insurance: "blue",
  Credit: "amber",
  "Credit Settlement": "purple",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${statusTone[status] ?? "slate"}`}>{status}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone =
    priority === "critical" ? "red" : priority === "high" ? "amber" : "slate";
  return <span className={`badge badge-${tone}`}>{priority}</span>;
}

export function DeptChips({ departments, owner }: { departments: string[]; owner?: boolean }) {
  if (owner) return <span className="chip brand">Owner</span>;
  if (!departments.length) return <span className="chip">No department</span>;
  return (
    <div className="row wrap" style={{ gap: 4 }}>
      {departments.map((d) => (
        <span key={d} className="chip">
          {d}
        </span>
      ))}
    </div>
  );
}

export function Avatar({ name, image, size }: { name: string; image?: string; size?: "sm" | "lg" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span className={classNames("avatar", size)}>
      {image ? <img src={image} alt={name} /> : initials}
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={classNames("tab", value === tab.id && "active")}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
          {typeof tab.count === "number" && <span className="count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  icon,
}: {
  tone?: "info" | "warn" | "danger" | "success" | "brand";
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={`alert alert-${tone}`}>
      {icon ?? (tone === "success" ? <CheckCircle2 /> : tone === "warn" || tone === "danger" ? <AlertTriangle /> : <ClipboardList />)}
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function Field({
  label,
  hint,
  required,
  full,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={classNames("field", full && "full")}>
      <label>
        {label} {required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
