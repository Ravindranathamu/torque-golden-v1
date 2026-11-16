import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  AlertTriangle,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  PackageSearch,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from "lucide-react";
import { useApp, hasAnyDepartment } from "../state/AppStore";
import type { Department, FeatureFlagKey } from "../types";
import { featureEnabled, featureFlagsFor } from "../lib/features";
import { mergeNotificationPreferences } from "../lib/notifications";
import {
  primeVoice,
  speakAlert,
  speechSupported,
  spokenVehicle,
  voicePrimed,
} from "../lib/voice";
import { classNames, timeAgo } from "../lib/utils";
import { DEVELOPER } from "../lib/developer";
import { Avatar, Field, Modal } from "./ui";
import { useToast } from "./Toast";
import { DeveloperCredit } from "./DeveloperCredit";
import { VoiceSettingsPanel } from "./VoiceSettings";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  departments?: Department[];
  ownerOnly?: boolean;
  end?: boolean;
  /** Any one of these modules keeps the navigation item visible. */
  features?: FeatureFlagKey[];
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, ownerOnly: true },
  { to: "/gate", label: "Gate / PRO", icon: ClipboardCheck, departments: ["PRO"] },
  { to: "/appointments", label: "Reservations", icon: CalendarClock },
  { to: "/workshop", label: "Workshop floor", icon: Wrench, departments: ["Supervisor"] },
  { to: "/stores", label: "Stores & stock", icon: PackageSearch, departments: ["Stores"] },
  { to: "/cashier", label: "Billing", icon: ReceiptText, departments: ["Cashier"] },
  {
    to: "/insurance-desk",
    label: "Insurance desk",
    icon: ShieldCheck,
    departments: ["Cashier", "Accounting", "Supervisor", "Stores"],
    features: ["enable_insurance_module"],
  },
  {
    to: "/accounting",
    label: "Accounts",
    icon: Landmark,
    departments: ["Accounting"],
    features: ["enable_advanced_accounting", "enable_petty_cash"],
  },
  { to: "/marketing", label: "Marketing", icon: Megaphone, departments: ["PRO"] },
  { to: "/history", label: "Vehicle history", icon: History },
  { to: "/team", label: "Team & HR", icon: Users, ownerOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, ownerOnly: true },
];

export function AppShell() {
  const {
    state,
    currentUser,
    logout,
    markNotificationRead,
    markAllNotificationsRead,
    changeOwnPin,
    updateNotificationPreferences,
  } = useApp();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pinForm, setPinForm] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => {
    setMenuOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  if (!state.settings.configured) return null;
  if (!currentUser) return null;

  const owner = currentUser.isOwner;
  const visibleNotifications = state.notifications
    .filter(
      (n) =>
        owner ||
        n.departments.some(
          (d) => d === "Owner" ? false : currentUser.departments.includes(d as Department),
        ),
    )
    .slice(0, 30);
  const unread = visibleNotifications.filter((n) => !n.read).length;
  const prefs = mergeNotificationPreferences(currentUser.notificationPreferences);

  function toggleVoice() {
    updateNotificationPreferences({ voiceEnabled: !prefs.voiceEnabled });
    push(
      prefs.voiceEnabled
        ? "Voice alerts muted on this device."
        : "Voice alerts enabled. New alerts will be spoken aloud.",
    );
  }

  function savePin() {
    if (pinForm.next !== pinForm.confirm) {
      push("The new PIN confirmation does not match.", "error");
      return;
    }
    const result = changeOwnPin(pinForm.current, pinForm.next);
    if (!result.ok) {
      push(result.message ?? "Could not change your PIN.", "error");
      return;
    }
    setPinForm({ current: "", next: "", confirm: "" });
    setPinOpen(false);
    push("Your PIN has been updated.");
  }

  const counts = {
    gate:
      state.checkIns.filter((c) => c.status === "Awaiting Approval").length +
      state.jobCards.filter((j) => j.status === "Paid" || j.status === "Released on Credit").length,
    workshop: state.jobCards.filter((j) => j.status === "In Progress").length,
    stores: state.parts.filter(
      (p) =>
        ["Requested", "Exchange Pending", "Return Pending", "Backordered"].includes(p.status) &&
        p.partSource !== "Customer_Brought" &&
        !(p.estimateId && !p.partSource),
    ).length,
    cashier: state.jobCards.filter((j) => j.status === "Repair Completed").length,
    "insurance-desk": state.insuranceJobs.filter((claim) => {
      const job = state.jobCards.find((entry) => entry.id === claim.jobCardId);
      if (!job || (job.status !== "Paid" && job.status !== "Released on Credit")) return false;
      return (
        claim.status !== "Settled" ||
        (claim.salvageStatus !== "Submitted" &&
          state.parts.some(
            (part) => part.jobCardId === claim.jobCardId && part.salvageStatus === "Pending",
          ))
      );
    }).length,
    accounting:
      state.purchases.filter((p) => p.status === "Unpaid" && p.type === "Credit").length +
      state.customerCredits.filter((c) => c.status !== "Settled").length,
    marketing: state.marketing.filter(
      (m) => m.status === "Pending" && (!m.readyAt || new Date(m.readyAt) <= new Date()),
    ).length,
  } as Record<string, number>;

  const flags = featureFlagsFor(state.settings);
  const visibleNav = navItems.filter((item) => {
    if (item.ownerOnly && !owner) return false;
    if (item.features && !item.features.some((key) => flags[key])) return false;
    if (!item.departments) return true;
    return hasAnyDepartment(currentUser, item.departments);
  });

  const roleText = owner
    ? "Owner"
    : currentUser.departments.join(" · ") || "Team member";

  return (
    <div className="app-shell">
      {menuOpen && <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />}
      <aside className={classNames("sidebar", menuOpen && "open")}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            {state.settings.logo ? (
              <img src={state.settings.logo} alt={state.settings.companyName} />
            ) : (
              (state.settings.companyName || "WS").slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="brand-copy">
            <strong>{state.settings.companyName}</strong>
            <span>Workshop ERP</span>
          </div>
          <button
            className="icon-btn"
            style={{ display: "none", marginLeft: "auto" }}
            onClick={() => setMenuOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">Operations</div>
          {visibleNav
            .filter((item) => !item.ownerOnly)
            .map((item) => {
              const Icon = item.icon;
              const count = counts[item.to.slice(1)] ?? 0;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => classNames("nav-link", isActive && "active")}
                  onClick={() => setMenuOpen(false)}
                  end={item.end}
                >
                  <Icon />
                  <span>{item.label}</span>
                  {count > 0 && <span className="nav-badge">{count > 99 ? "99+" : count}</span>}
                </NavLink>
              );
            })}
        </div>

        {(owner || visibleNav.some((n) => n.ownerOnly)) && (
          <div className="sidebar-section">
            <div className="sidebar-label">Administration</div>
            {visibleNav
              .filter((n) => n.ownerOnly)
              .map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => classNames("nav-link", isActive && "active")}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
          </div>
        )}

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <Avatar name={currentUser.name} image={state.settings.logo} />
            <div className="sidebar-user-copy">
              <strong>{currentUser.name}</strong>
              <span>{roleText}</span>
            </div>
            <button
              className="logout-btn"
              title="Sign out"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
          <div style={{ padding: "10px 6px 0", fontSize: 9.5, color: "#5f7f85", display: "flex", justifyContent: "space-between" }}>
            <span>{DEVELOPER.product} · v{DEVELOPER.version}</span>
            <span>Local demo</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <div className="topbar-title">
            <span className="dot" />
            <span>{state.settings.companyName}</span>
            <ChevronRight size={13} style={{ color: "#94a3b8" }} />
            <span style={{ color: "#64748b", fontWeight: 500 }}>{roleText}</span>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-actions">
            <button
              className="icon-btn"
              title="Vehicle history lookup"
              onClick={() => navigate("/history")}
            >
              <Search size={16} />
            </button>
            <button
              className="icon-btn"
              title="Notifications"
              onClick={() => setNotifOpen((v) => !v)}
            >
              <Bell size={16} />
              {unread > 0 && <span className="ping" />}
            </button>
            <div className="profile-wrap">
              <button
                className="profile-trigger"
                onClick={() => setProfileOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                <Avatar name={currentUser.name} size="sm" />
                <div style={{ lineHeight: 1.25, textAlign: "left" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700 }}>{currentUser.name}</div>
                  <div style={{ fontSize: 9.5, color: "var(--muted)", textTransform: "capitalize" }} title={roleText}>
                    {roleText}
                  </div>
                </div>
              </button>
              {profileOpen && (
                <>
                  <div className="profile-overlay" onClick={() => setProfileOpen(false)} />
                  <div className="profile-menu" role="menu">
                    <div className="profile-menu-head">
                      <strong>{currentUser.name}</strong>
                      <span>{roleText}</span>
                    </div>
                    {featureEnabled(state.settings, "enable_voice_notifications") && (
                      <>
                        <button className="profile-menu-item" onClick={toggleVoice}>
                          {prefs.voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                          <span>{prefs.voiceEnabled ? "Mute voice alerts" : "Enable voice alerts"}</span>
                        </button>
                        <button
                          className="profile-menu-item"
                          onClick={() => {
                            setProfileOpen(false);
                            setVoiceOpen(true);
                          }}
                        >
                          <Volume2 size={15} />
                          <span>Voice alert settings</span>
                        </button>
                      </>
                    )}
                    <button
                      className="profile-menu-item"
                      onClick={() => {
                        setProfileOpen(false);
                        setPinOpen(true);
                      }}
                    >
                      <KeyRound size={15} />
                      <span>Change my PIN</span>
                    </button>
                    {owner && (
                      <button
                        className="profile-menu-item"
                        onClick={() => {
                          setProfileOpen(false);
                          navigate("/settings");
                        }}
                      >
                        <Settings size={15} />
                        <span>Notification settings</span>
                      </button>
                    )}
                    <button
                      className="profile-menu-item danger"
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                        navigate("/login");
                      }}
                    >
                      <LogOut size={15} />
                      <span>Sign out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {state.settings.demoMode && (
          <div className="demo-banner" role="status">
            <AlertTriangle size={16} />
            <strong>Demo mode active</strong>
            <span>
              Every WhatsApp message and PDF is routed to +94 75 575 6803. Real customers
              are never contacted. A normal client trial sends to real customers.
            </span>
          </div>
        )}

        <main>
          <Outlet />
          <footer className="app-foot">
            <DeveloperCredit compact />
          </footer>
        </main>
      </div>

      {notifOpen && (
        <>
          <div className="notif-overlay" onClick={() => setNotifOpen(false)} />
          <div className="notif-panel">
            <div className="notif-head">
              <div>
                <div style={{ fontSize: 13, fontWeight: 750 }}>Notifications</div>
                <div className="tiny muted">{unread} unread</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={markAllNotificationsRead}>
                Mark all read
              </button>
            </div>
            <div className="notif-list">
              {visibleNotifications.length === 0 && (
                <div className="empty" style={{ padding: "28px 10px" }}>
                  <p>No notifications for your role yet.</p>
                </div>
              )}
              {visibleNotifications.map((n) => (
                <div
                  key={n.id}
                  className={classNames("notif-item", !n.read && "unread")}
                  onClick={() => {
                    markNotificationRead(n.id);
                    if (n.link) navigate(n.link);
                    setNotifOpen(false);
                  }}
                >
                  <span className={classNames("notif-dot", n.priority)} />
                  <div className="ni-main">
                    <strong>{n.title}</strong>
                    <p>{n.message}</p>
                    <time>{timeAgo(n.createdAt)}</time>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Modal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Change your sign-in PIN"
        subtitle={`${currentUser.name} · ${roleText}`}
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPinOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={savePin}>
              <KeyRound />
              Update PIN
            </button>
          </>
        }
      >
        <div className="stack">
          <Field label="Current PIN" required>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinForm.current}
              onChange={(event) =>
                setPinForm({ ...pinForm, current: event.target.value.replace(/\D/g, "") })
              }
            />
          </Field>
          <div className="form-grid">
            <Field label="New PIN" required hint="4 to 6 digits.">
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                value={pinForm.next}
                onChange={(event) =>
                  setPinForm({ ...pinForm, next: event.target.value.replace(/\D/g, "") })
                }
              />
            </Field>
            <Field label="Confirm new PIN" required>
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                value={pinForm.confirm}
                onChange={(event) =>
                  setPinForm({ ...pinForm, confirm: event.target.value.replace(/\D/g, "") })
                }
              />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        title="Voice alert settings"
        subtitle={`${currentUser.name} · spoken on this device`}
        size="wide"
        footer={
          <button className="btn btn-primary" onClick={() => setVoiceOpen(false)}>
            Done
          </button>
        }
      >
        <VoiceSettingsPanel compact />
      </Modal>

      <VoiceAlertBridge />
    </div>
  );
}

function VoiceAlertBridge() {
  const { state, currentUser, updateNotificationPreferences } = useApp();
  const { push } = useToast();
  const seen = useRef<Set<string> | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const preferences = currentUser?.notificationPreferences;
  const prefs = useMemo(
    () => mergeNotificationPreferences(preferences),
    [preferences],
  );
  const enabled =
    Boolean(currentUser) &&
    featureEnabled(state.settings, "enable_voice_notifications") &&
    prefs.voiceEnabled &&
    speechSupported();

  useEffect(() => {
    if (!enabled) {
      setNeedsUnlock(false);
      return;
    }
    if (!voicePrimed()) setNeedsUnlock(true);
    const unlock = () => {
      primeVoice();
      setNeedsUnlock(false);
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  useEffect(() => {
    if (!currentUser || !enabled) return;
    if (!seen.current) {
      seen.current = new Set(state.notifications.map((entry) => entry.id));
      return;
    }
    const visible = state.notifications.filter(
      (entry) =>
        !seen.current?.has(entry.id) &&
        (currentUser.isOwner ||
          entry.departments.some((department) =>
            department === "Owner"
              ? false
              : currentUser.departments.includes(department as Department),
          )),
    );
    if (!visible.length) return;
    visible.forEach((entry) => seen.current?.add(entry.id));
    const spokenEvents = new Set(prefs.voiceEvents ?? []);
    const candidate = visible
      .filter((entry) => !entry.eventType || spokenEvents.has(entry.eventType))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!candidate) return;
    const text = candidate.vehicleNo
      ? `${candidate.title}. Vehicle ${spokenVehicle(candidate.vehicleNo)}`
      : candidate.title;
    setAnnouncement(text);
    void speakAlert(text, prefs).finally(() => setAnnouncement(null));
  }, [state.notifications, enabled, currentUser, prefs]);

  if (!enabled) return null;

  return (
    <>
      {needsUnlock && (
        <button
          className="voice-unlock"
          onClick={() => {
            primeVoice();
            setNeedsUnlock(false);
            updateNotificationPreferences({ voiceEnabled: true });
            push("Voice alerts unlocked. New alerts will be spoken.");
          }}
        >
          <Volume2 size={16} />
          <span>Tap to enable voice alerts</span>
        </button>
      )}
      {announcement && (
        <div className="voice-announcement" role="status">
          <Volume2 size={14} />
          <span>{announcement}</span>
        </div>
      )}
    </>
  );
}

export function HomeRedirect() {
  const { currentUser } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    if (!currentUser) {
      navigate("/login", { replace: true });
      return;
    }
    if (currentUser.isOwner) navigate("/dashboard", { replace: true });
    else if (currentUser.departments.includes("PRO")) navigate("/gate", { replace: true });
    else if (currentUser.departments.includes("Supervisor")) navigate("/workshop", { replace: true });
    else if (currentUser.departments.includes("Stores")) navigate("/stores", { replace: true });
    else if (currentUser.departments.includes("Cashier")) navigate("/cashier", { replace: true });
    else if (currentUser.departments.includes("Accounting")) navigate("/accounting", { replace: true });
    else navigate("/history", { replace: true });
  }, [currentUser, navigate]);
  return null;
}

export function AccessDenied() {
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 520, margin: "60px auto" }}>
        <div className="empty">
          <div className="empty-icon">
            <BarChart3 size={22} />
          </div>
          <h4>Restricted area</h4>
          <p>Your account does not have the department access required for this screen.</p>
        </div>
      </div>
    </div>
  );
}
