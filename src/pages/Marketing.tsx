import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  CarFront,
  CheckCircle2,
  Clock3,
  Gauge,
  Megaphone,
  MessageCircle,
  Phone,
  Route,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { afterServiceFollowUpMessage, marketingMessage } from "../lib/messages";
import { autoWhatsAppEnabled, sendWhatsApp } from "../lib/whatsapp";
import { money, shortDate, timeAgo, waLink } from "../lib/utils";
import {
  Alert,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
  Tabs,
} from "../components/ui";
import { useToast } from "../components/Toast";
import type { MarketingReminder } from "../types";

type MarketingTab = "ready" | "scheduled" | "sent" | "completed";

export function MarketingPage() {
  const { state, sendMarketingReminder, markMarketingCompleted } = useApp();
  const { push } = useToast();
  const [tab, setTab] = useState<MarketingTab>("ready");
  const [query, setQuery] = useState("");

  const now = new Date();

  const ready = useMemo(
    () =>
      state.marketing
        .filter(
          (reminder) =>
            reminder.status === "Pending" &&
            (!reminder.readyAt || new Date(reminder.readyAt) <= now),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [state.marketing, now],
  );
  const scheduled = useMemo(
    () =>
      state.marketing
        .filter(
          (reminder) =>
            reminder.status === "Pending" &&
            Boolean(reminder.readyAt) &&
            new Date(reminder.readyAt ?? "") > now,
        )
        .sort((a, b) => (a.readyAt ?? "").localeCompare(b.readyAt ?? "")),
    [state.marketing, now],
  );
  const sent = useMemo(
    () =>
      state.marketing
        .filter((reminder) => reminder.status === "Reminder Sent")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.marketing],
  );
  const completed = useMemo(
    () =>
      state.marketing
        .filter((reminder) => reminder.status === "Completed")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.marketing],
  );

  const activeList =
    tab === "ready" ? ready : tab === "scheduled" ? scheduled : tab === "sent" ? sent : completed;
  const visible = activeList.filter((reminder) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${reminder.vehicleNo} ${reminder.customerName} ${reminder.phone} ${reminder.triggerType}`
      .toLowerCase()
      .includes(needle);
  });

  const dueThisWeek = scheduled.filter(
    (reminder) => reminder.readyAt && new Date(reminder.readyAt).getTime() - now.getTime() < 7 * 86400000,
  );

  const thisMonthSent = state.marketing.filter(
    (reminder) =>
      reminder.status !== "Pending" &&
      new Date(reminder.createdAt).getMonth() === now.getMonth() &&
      new Date(reminder.createdAt).getFullYear() === now.getFullYear(),
  );

  const periodicCount = state.marketing.filter(
    (reminder) => reminder.triggerType === "Periodic Cycle",
  ).length;
  const mileageCount = state.marketing.filter(
    (reminder) => reminder.triggerType === "Mileage Milestone",
  ).length;

  const dispatchValue = state.marketing.reduce((sum, reminder) => {
    if (reminder.triggerType === "Mileage Milestone") return sum + 1;
    return sum + 1;
  }, 0);

  function openWhatsApp(reminder: MarketingReminder, followUp = false) {
    const message =
      followUp || reminder.status !== "Pending"
        ? afterServiceFollowUpMessage(reminder, state.settings)
        : marketingMessage(reminder, state.settings);
    window.open(waLink(reminder.phone, message), "_blank", "noopener,noreferrer");
  }

  function sendReminder(reminder: MarketingReminder) {
    const automatic = autoWhatsAppEnabled(state.settings);
    if (!automatic) openWhatsApp(reminder);
    sendMarketingReminder(reminder.id);
    push(
      automatic
        ? `Reminder queued on the workshop WhatsApp for ${reminder.customerName}.`
        : `WhatsApp reminder opened for ${reminder.customerName}. Marked as sent.`,
    );
  }

  function sendAfterService(reminder: MarketingReminder) {
    if (autoWhatsAppEnabled(state.settings)) {
      void sendWhatsApp(
        reminder.phone,
        afterServiceFollowUpMessage(reminder, state.settings),
        state.settings,
      );
      push(`After-service note queued for ${reminder.customerName}.`);
      return;
    }
    openWhatsApp(reminder, true);
  }

  function completeReminder(reminder: MarketingReminder) {
    markMarketingCompleted(reminder.id);
    push(`${reminder.vehicleNo} marked completed in the marketing queue.`);
  }

  const tabs = [
    { id: "ready" as MarketingTab, label: "Ready to send", count: ready.length },
    { id: "scheduled" as MarketingTab, label: "Scheduled", count: scheduled.length },
    { id: "sent" as MarketingTab, label: "Sent", count: sent.length },
    { id: "completed" as MarketingTab, label: "Completed", count: completed.length },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Marketing & retention"
        subtitle="Service-cycle reminders, 5,000 km milestones and the two-day after-service buffer."
        actions={
          <>
            <Tabs<MarketingTab> value={tab} onChange={setTab} tabs={tabs} />
            <div className="input-group" style={{ minWidth: 215 }}>
              <span className="prefix">
                <Search size={14} />
              </span>
              <input
                className="input"
                placeholder="Search vehicle or customer…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </>
        }
      />

      <div className="grid cols-4">
        <StatCard
          label="Ready to send"
          value={ready.length}
          meta="Follow-up buffer has passed"
          icon={<Send />}
          tone={ready.length ? "amber" : "brand"}
        />
        <StatCard
          label="Scheduled"
          value={scheduled.length}
          meta={`${dueThisWeek.length} becomes ready this week`}
          icon={<CalendarClock />}
          tone="blue"
        />
        <StatCard
          label="Sent this month"
          value={thisMonthSent.length}
          meta={`${sent.length} reminders awaiting completion`}
          icon={<MessageCircle />}
          tone="purple"
        />
        <StatCard
          label="Completed"
          value={completed.length}
          meta="Customer responded or job rebooked"
          icon={<CheckCircle2 />}
        />
      </div>

      <div className="grid cols-3" style={{ marginTop: 18 }}>
        <div className="card span-2">
          <div className="card-head">
            <div>
              <h3>
                {tab === "ready"
                  ? "Send these reminders now"
                  : tab === "scheduled"
                    ? "Scheduled follow-ups"
                    : tab === "sent"
                      ? "Sent — awaiting outcome"
                      : "Completed reminders"}
              </h3>
              <p>
                {tab === "ready"
                  ? "The two-day buffer has passed. Open WhatsApp with a personalised message."
                  : tab === "scheduled"
                    ? "Mileage and service-cycle triggers wait until their ready date."
                    : tab === "sent"
                      ? "Mark completed once the customer responds or books again."
                      : "Historical marketing outcomes for this workshop."}
              </p>
            </div>
            <span className="badge badge-brand">
              {activeList.length} reminder{activeList.length === 1 ? "" : "s"}
            </span>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={<Megaphone size={22} />}
              title="Nothing in this queue"
              message={
                query
                  ? "No reminders match that search. Try the vehicle number or customer name."
                  : tab === "ready"
                    ? "New reminders appear automatically when a vehicle is dispatched. The two-day buffer protects customers from instant marketing."
                    : tab === "scheduled"
                      ? "Service-cycle and mileage reminders scheduled for a future date will appear here."
                      : tab === "sent"
                        ? "Sent reminders will wait here until you mark them completed."
                        : "Completed marketing reminders will be archived here."
              }
            />
          ) : (
            <div className="card-body stack">
              {visible.map((reminder) => {
                const isReady = ready.some((entry) => entry.id === reminder.id);
                const target =
                  reminder.triggerType === "Mileage Milestone"
                    ? `${reminder.targetMileage?.toLocaleString() ?? "—"} km`
                    : reminder.targetDate
                      ? shortDate(reminder.targetDate)
                      : "Cycle due";
                return (
                  <div className="history-card" key={reminder.id}>
                    <div className="history-card-head">
                      <div className="row" style={{ gap: 11 }}>
                        <span
                          className="part-icon"
                          style={{
                            width: 38,
                            height: 38,
                            flex: "0 0 38px",
                            background:
                              reminder.triggerType === "Mileage Milestone"
                                ? "var(--info-soft)"
                                : "var(--brand-soft)",
                            color:
                              reminder.triggerType === "Mileage Milestone"
                                ? "var(--info)"
                                : "var(--brand)",
                          }}
                        >
                          {reminder.triggerType === "Mileage Milestone" ? (
                            <Gauge size={16} />
                          ) : (
                            <Route size={16} />
                          )}
                        </span>
                        <div>
                          <div className="row wrap" style={{ gap: 7 }}>
                            <strong style={{ fontSize: 13.5 }}>{reminder.vehicleNo}</strong>
                            <span className="chip">{reminder.triggerType}</span>
                            <StatusBadge status={reminder.status} />
                          </div>
                          <div className="tiny muted" style={{ marginTop: 3 }}>
                            {reminder.customerName} · {reminder.phone}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="strong small">{target}</div>
                        <div className="tiny muted">
                          {reminder.triggerType === "Mileage Milestone"
                            ? "Next mileage milestone"
                            : `${reminder.avgCycleDays ?? 90}-day cycle`}
                        </div>
                      </div>
                    </div>
                    <div className="history-section">
                      <div className="history-line">
                        <span>
                          <CarFront size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                          Last dispatch
                        </span>
                        <span>
                          {reminder.dispatchDate ? shortDate(reminder.dispatchDate) : "Not recorded"}
                        </span>
                      </div>
                      <div className="history-line">
                        <span>
                          <CalendarDays size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                          Ready for follow-up
                        </span>
                        <span>
                          {reminder.readyAt ? shortDate(reminder.readyAt) : "Immediately"}
                        </span>
                      </div>
                      <div className="history-line">
                        <span>
                          <Clock3 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                          Created
                        </span>
                        <span>{timeAgo(reminder.createdAt)}</span>
                      </div>
                    </div>
                    <div
                      className="card-body row-between wrap"
                      style={{ paddingTop: 11, paddingBottom: 11 }}
                    >
                      <span className="tiny muted">
                        Suggested value: {money(reminder.triggerType === "Mileage Milestone" ? 18500 : 24000)} average service basket
                      </span>
                      <div className="row wrap">
                        {reminder.status === "Pending" && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => sendReminder(reminder)}
                            disabled={!isReady}
                            title={isReady ? "Open WhatsApp" : "Wait for the two-day buffer"}
                          >
                            <Send />
                            {isReady ? "Send WhatsApp reminder" : "Waiting for buffer"}
                          </button>
                        )}
                        {reminder.status === "Reminder Sent" && (
                          <>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => sendAfterService(reminder)}
                            >
                              <MessageCircle />
                              After-service note
                            </button>
                            <button
                              className="btn btn-soft btn-sm"
                              onClick={() => completeReminder(reminder)}
                            >
                              <CheckCircle2 />
                              Mark completed
                            </button>
                          </>
                        )}
                        {reminder.status === "Completed" && (
                          <span className="badge badge-green">Closed</span>
                        )}
                        <a
                          className="btn btn-ghost btn-sm"
                          href={waLink(
                            reminder.phone,
                            `Hello ${reminder.customerName}, this is ${state.settings.companyName}. We are checking in about ${reminder.vehicleNo}.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          title="Open a blank WhatsApp chat"
                        >
                          <Phone />
                          Chat
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <div>
                <h3>How triggers work</h3>
                <p>Set automatically from dispatch history.</p>
              </div>
              <Sparkles size={17} className="muted" />
            </div>
            <div className="card-body stack" style={{ gap: 13 }}>
              <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <span className="chip brand" style={{ width: 22, height: 22, justifyContent: "center", padding: 0 }}>
                  1
                </span>
                <div>
                  <div className="small strong">Periodic service cycle</div>
                  <div className="tiny muted">
                    The gap between the last two periodic services becomes the rolling average
                    cycle, with 90 days as the fallback.
                  </div>
                </div>
              </div>
              <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <span className="chip brand" style={{ width: 22, height: 22, justifyContent: "center", padding: 0 }}>
                  2
                </span>
                <div>
                  <div className="small strong">5,000 km milestones</div>
                  <div className="tiny muted">
                    When a vehicle is within 300 km of the next 5,000 km interval, a mileage
                    reminder is queued.
                  </div>
                </div>
              </div>
              <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <span className="chip brand" style={{ width: 22, height: 22, justifyContent: "center", padding: 0 }}>
                  3
                </span>
                <div>
                  <div className="small strong">Two-day buffer</div>
                  <div className="tiny muted">
                    Nothing is sent until two days after gate release, so the customer is not
                    marketed to while collecting the vehicle.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Reminder mix</h3>
                <p>All-time triggers in the database.</p>
              </div>
            </div>
            <div className="card-body">
              <div className="kv">
                <span>Periodic cycle</span>
                <span>{periodicCount}</span>
              </div>
              <div className="kv">
                <span>Mileage milestones</span>
                <span>{mileageCount}</span>
              </div>
              <div className="kv">
                <span>Total reminders</span>
                <span>{dispatchValue}</span>
              </div>
              <div className="divider" />
              <div className="tiny muted">
                Reminder messages include the workshop name, vehicle number and service interval,
                with a WhatsApp link the customer can reply to directly.
              </div>
            </div>
          </div>

          <Alert tone="info" icon={<Megaphone />} title="Owner-ready retention">
            Sent and completed counts give the owner a simple view of marketing activity. Use the
            Google review link from Settings in every after-service message.
          </Alert>
        </div>
      </div>
    </div>
  );
}
