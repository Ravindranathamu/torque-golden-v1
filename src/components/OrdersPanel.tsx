import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageCircle,
  PackageCheck,
  Rocket,
  Save,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import type { ClientOrder, ClientOrderStatus, ProvisioningChecklist } from "../lib/orders";
import {
  ORDER_STATUSES,
  PROVISIONING_ITEMS,
  defaultProvisioning,
  deploymentBrief,
  generateInstallationId,
  handoverMessage,
  orderStatusLabel,
  orderStatusTone,
  orderTrialEnd,
  productHasModules,
  validInstallationIdForProduct,
} from "../lib/orders";
import { FEATURE_FLAGS } from "../lib/features";
import { money, shortDate } from "../lib/utils";

export type OrderPaymentMethod = "Bank Transfer" | "Cash" | "Card" | "Online";

export interface OrdersPanelProps {
  orders: ClientOrder[];
  orderLink: string;
  onSave: (order: ClientOrder) => Promise<boolean>;
  onConvert: (order: ClientOrder) => Promise<{ ok: boolean; message: string }>;
  onActivate: (
    order: ClientOrder,
    months: number,
    method: OrderPaymentMethod,
    reference: string,
  ) => Promise<{ ok: boolean; message: string }>;
  onNotice: (tone: "ok" | "warn" | "error", text: string) => void;
}

function orderWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("94")) return digits;
  if (digits.startsWith("0")) return `94${digits.slice(1)}`;
  return digits;
}

function moduleLabels(order: ClientOrder): string[] {
  const labels = new Map(FEATURE_FLAGS.map((flag) => [flag.key, flag.label]));
  return order.modules.map((key) => labels.get(key) ?? key);
}

export function OrdersPanel({
  orders,
  orderLink,
  onSave,
  onConvert,
  onActivate,
  onNotice,
}: OrdersPanelProps) {
  const [statusFilter, setStatusFilter] = useState<"open" | "all" | ClientOrderStatus>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<ClientOrder | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activationMonths, setActivationMonths] = useState(12);
  const [activationMethod, setActivationMethod] =
    useState<OrderPaymentMethod>("Bank Transfer");
  const [activationReference, setActivationReference] = useState("");
  const [clearArmedId, setClearArmedId] = useState<string | null>(null);

  const openOrders = useMemo(
    () => orders.filter((order) => order.status !== "Active" && order.status !== "Cancelled"),
    [orders],
  );
  const filtered = useMemo(() => {
    return orders
      .filter((order) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "open") {
          return order.status !== "Active" && order.status !== "Cancelled";
        }
        return order.status === statusFilter;
      })
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [orders, statusFilter]);

  const selected = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? filtered[0] ?? null,
    [orders, selectedId, filtered],
  );

  /**
   * The detail pane edits a copy of the selected order. The copy is discarded
   * as soon as another order is selected, so no effect is needed to reset it.
   */
  const draft = useMemo(() => {
    if (!selected) return null;
    if (draftState && draftState.id === selected.id) return draftState;
    return { ...selected, provisioning: { ...selected.provisioning } };
  }, [selected, draftState]);

  function patch(next: Partial<ClientOrder>) {
    if (!draft) return;
    setDraftState({ ...draft, ...next });
  }

  function patchProvisioning(key: keyof ProvisioningChecklist, value: boolean) {
    if (!draft) return;
    setDraftState({
      ...draft,
      provisioning: { ...draft.provisioning, [key]: value },
    });
  }

  async function commit(next: ClientOrder): Promise<ClientOrder> {
    const saved = { ...next, updatedAt: new Date().toISOString() };
    const ok = await onSave(saved);
    setDraftState(saved);
    if (!ok) {
      onNotice(
        "warn",
        `${saved.reference} was saved on this device, but the master registry rejected it.`,
      );
    }
    return saved;
  }

  async function saveOrder() {
    if (!draft) return;
    setBusy("save");
    const saved = await commit(draft);
    setBusy(null);
    onNotice("ok", `${saved.reference} saved.`);
  }

  async function deployOrder() {
    if (!draft) return;
    setBusy("deploy");
    let detail = "No deploy webhook configured; deployment marked manually.";
    if (draft.deployWebhookUrl?.trim()) {
      try {
        const response = await fetch(draft.deployWebhookUrl.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderReference: draft.reference,
            product: draft.product,
            client: draft.clientName,
            installationId: draft.installationId,
            serverAddress: draft.serverAddress,
            supabaseUrl: draft.supabaseUrl,
            cloudflareProject: draft.cloudflareProject,
            appUrl: draft.appUrl,
            modules: draft.modules,
            requestedAt: new Date().toISOString(),
          }),
        });
        if (!response.ok) {
          throw new Error(`The deploy webhook returned HTTP ${response.status}.`);
        }
        detail = "Deploy webhook accepted the release.";
      } catch (error) {
        setBusy(null);
        onNotice(
          "error",
          error instanceof Error
            ? `${draft.reference} was not deployed: ${error.message}`
            : `${draft.reference} was not deployed.`,
        );
        return;
      }
    }
    const saved = await commit({
      ...draft,
      status: "Deployed",
      deployedAt: new Date().toISOString(),
      provisioning: { ...draft.provisioning, deployed: true },
    });
    setBusy(null);
    onNotice("ok", `${saved.reference} deployed. ${detail}`);
  }

  async function registerInstallation() {
    if (!draft) return;
    const installationId =
      draft.installationId?.trim() || generateInstallationId(draft.product);
    if (!validInstallationIdForProduct(installationId, draft.product)) {
      onNotice(
        "error",
        `Installation ID must look like ${draft.product === "ScanPlan" ? "SP-LK" : draft.product === "TAW" ? "TAW-LK" : "WS-LK"}-XXXXXXXX.`,
      );
      return;
    }
    setBusy("register");
    const saved = await commit({
      ...draft,
      installationId,
      status: draft.status === "Submitted" ? "Provisioning" : draft.status,
    });
    const result = await onConvert(saved);
    setBusy(null);
    onNotice(result.ok ? "ok" : "error", result.message);
  }

  async function activateOrder() {
    if (!draft) return;
    if (!draft.clientId) {
      onNotice("warn", "Register the installation in the portal before activating it.");
      return;
    }
    setBusy("activate");
    const result = await onActivate(
      draft,
      activationMonths,
      activationMethod,
      activationReference.trim(),
    );
    setBusy(null);
    onNotice(result.ok ? "ok" : "error", result.message);
    if (result.ok) setActivationReference("");
  }

  async function markDelivered() {
    if (!draft) return;
    setBusy("deliver");
    const saved = await commit({
      ...draft,
      status: "Delivered",
      deliveredAt: new Date().toISOString(),
    });
    setBusy(null);
    onNotice("ok", `${saved.reference} marked as handed over.`);
  }

  async function clearCredentials() {
    if (!draft) return;
    if (clearArmedId !== draft.id) {
      setClearArmedId(draft.id);
      onNotice(
        "warn",
        "Click “Clear credentials” again to remove the initial login from the portal.",
      );
      return;
    }
    setBusy("clear");
    const saved = await commit({
      ...draft,
      initialUsername: undefined,
      initialPassword: undefined,
      ownerPin: undefined,
      credentialsClearedAt: new Date().toISOString(),
    });
    setBusy(null);
    setClearArmedId(null);
    onNotice(
      "ok",
      `${saved.reference} credentials cleared. The handover message no longer includes them.`,
    );
  }

  function copy(value: string, label: string) {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => onNotice("ok", `${label} copied.`))
      .catch(() => onNotice("warn", "Copy failed — select the text manually."));
  }

  function openWhatsApp() {
    if (!draft) return;
    const link = `https://wa.me/${orderWhatsApp(draft.phone)}?text=${encodeURIComponent(
      handoverMessage(draft),
    )}`;
    window.open(link, "_blank", "noopener,noreferrer");
  }

  function openEmail() {
    if (!draft) return;
    const subject = `${draft.product} installation ${draft.reference} — ${draft.clientName}`;
    const link = draft.email
      ? `mailto:${draft.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(handoverMessage(draft))}`
      : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(handoverMessage(draft))}`;
    window.location.href = link;
  }

  return (
    <div className="order-board">
      <div className="card order-list-card">
        <div className="card-head">
          <div>
            <h3>Orders & pending installations</h3>
            <p>
              Every public order lands here. Move it through provisioning, deployment and
              handover, then activate the client copy.
            </p>
          </div>
          <span className="badge badge-amber">
            <ClipboardList size={12} /> {openOrders.length} open
          </span>
        </div>
        <div className="card-body">
          <div className="row wrap" style={{ gap: 6 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => copy(orderLink, "Order link")}
            >
              <Copy size={12} /> Copy order link
            </button>
            <a
              className="btn btn-primary btn-sm"
              href={orderLink}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={12} /> Open order page
            </a>
            <select
              className="select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "open" | "all" | ClientOrderStatus)
              }
              title="Filter orders"
            >
              <option value="open">Open orders</option>
              <option value="all">All orders</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {orderStatusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="order-link-hint tiny muted">
            Share this link with clients: <code>{orderLink}</code>
          </div>

          <div className="order-list">
            {filtered.map((order) => {
              const labels = moduleLabels(order);
              return (
                <button
                  key={order.id}
                  type="button"
                  className={`order-row ${order.id === selectedId ? "active" : ""}`}
                  onClick={() => setSelectedId(order.id)}
                >
                  <div className="row-between">
                    <span className="mono order-row-ref">{order.reference}</span>
                    <span className={`badge ${orderStatusTone(order.status)}`}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </div>
                  <strong>{order.clientName}</strong>
                  <span className="order-row-meta">
                    {order.product} · {order.plan} · {shortDate(order.submittedAt)}
                  </span>
                  <span className="order-row-modules">
                    {productHasModules(order.product)
                      ? labels.length
                        ? labels.slice(0, 3).join(" · ") + (labels.length > 3 ? " …" : "")
                        : "No modules selected"
                      : "All product features"}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="empty" style={{ padding: "28px 12px" }}>
                <ClipboardCheck />
                <p>No orders in this view yet.</p>
                <span className="tiny muted">
                  Share the order link, or submit an order from this browser to test the queue.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {draft ? (
        <div className="card order-detail-card">
          <div className="order-detail-head">
            <div>
              <div className="row wrap" style={{ gap: 6 }}>
                <span className={`badge ${orderStatusTone(draft.status)}`}>
                  {orderStatusLabel(draft.status)}
                </span>
                <span className="badge badge-slate">{draft.product}</span>
                <span className="badge badge-slate">{draft.plan}</span>
              </div>
              <h2>{draft.reference}</h2>
              <p>
                {draft.clientName} · submitted {shortDate(draft.submittedAt)}
              </p>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <select
                className="select"
                value={draft.status}
                onChange={(event) => patch({ status: event.target.value as ClientOrderStatus })}
                title="Order status"
              >
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {orderStatusLabel(status)}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void saveOrder()}
                disabled={busy !== null}
              >
                {busy === "save" ? <Loader2 className="spin" /> : <Save size={12} />}
                Save
              </button>
            </div>
          </div>

          <div className="order-detail-body">
            <div className="developer-detail-grid">
              <div>
                <span>Contact</span>
                <strong>{draft.contactName}</strong>
                <em>{draft.phone}</em>
              </div>
              <div>
                <span>Email</span>
                <strong>{draft.email || "Not supplied"}</strong>
                <em>{draft.district || "District not supplied"}</em>
              </div>
              <div>
                <span>Monthly fee</span>
                <strong>
                  {draft.monthlyFee === undefined ? "Rate card / quote" : money(draft.monthlyFee)}
                </strong>
                <em>{draft.plan} plan</em>
              </div>
              <div>
                <span>Trial</span>
                <strong>{draft.trialDays} days</strong>
                <em>
                  {orderTrialEnd(draft)
                    ? `Ends ${shortDate(orderTrialEnd(draft)!)}`
                    : "Starts at handover"}
                </em>
              </div>
            </div>

            {draft.address && (
              <div className="tiny muted">{draft.address}</div>
            )}
            {draft.notes && (
              <div className="alert alert-info">
                <ClipboardList />
                <span>{draft.notes}</span>
              </div>
            )}

            <div className="order-detail-section">
              <div className="row-between wrap">
                <div>
                  <h3 className="developer-section-title">Selected modules</h3>
                  <p className="tiny muted">
                    These stay unlocked after activation. The trial unlocks every module first.
                  </p>
                </div>
                <span className="badge badge-blue">
                  {productHasModules(draft.product)
                    ? `${draft.modules.length} selected`
                    : "All features"}
                </span>
              </div>
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                {productHasModules(draft.product) ? (
                  moduleLabels(draft).map((label) => (
                    <span key={label} className="badge badge-slate">
                      <Check size={10} /> {label}
                    </span>
                  ))
                ) : (
                  <span className="badge badge-green">
                    <BadgeCheck size={10} /> Every {draft.product} feature
                  </span>
                )}
                {productHasModules(draft.product) && draft.modules.length === 0 && (
                  <span className="tiny text-amber">No modules selected — activation would lock every module.</span>
                )}
              </div>
            </div>

            <div className="order-detail-section">
              <h3 className="developer-section-title">Provisioning checklist</h3>
              <div className="order-check-grid">
                {PROVISIONING_ITEMS.map((item) => (
                  <label key={item.key} className="developer-flag">
                    <input
                      type="checkbox"
                      checked={draft.provisioning[item.key]}
                      onChange={(event) => patchProvisioning(item.key, event.target.checked)}
                    />
                    <span>
                      <strong>{item.label}</strong>
                      <em className="tiny muted" style={{ display: "block" }}>
                        {item.hint}
                      </em>
                    </span>
                  </label>
                ))}
              </div>
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    patch({
                      provisioning: defaultProvisioning(),
                    })
                  }
                  type="button"
                >
                  Reset checklist
                </button>
                <span className="tiny muted">
                  Accounts are created outside the portal; this checklist records what is ready.
                </span>
              </div>
            </div>

            <div className="order-detail-section">
              <h3 className="developer-section-title">Deployment values</h3>
              <div className="form-grid">
                <label className="field">
                  <span className="label">Installation ID</span>
                  <div className="row" style={{ gap: 6 }}>
                    <input
                      className="input"
                      value={draft.installationId ?? ""}
                      onChange={(event) =>
                        patch({ installationId: event.target.value.toUpperCase() })
                      }
                      placeholder="WS-LK-XXXXXXXX"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        patch({ installationId: generateInstallationId(draft.product) })
                      }
                    >
                      Generate
                    </button>
                  </div>
                  <span className="hint">
                    {draft.product === "ScanPlan"
                      ? "SP-LK-"
                      : draft.product === "TAW"
                        ? "TAW-LK-"
                        : "WS-LK-"}
                    XXXXXXXX · matches the client installation.
                  </span>
                </label>
                <label className="field">
                  <span className="label">Server address</span>
                  <input
                    className="input"
                    value={draft.serverAddress ?? ""}
                    onChange={(event) => patch({ serverAddress: event.target.value })}
                    placeholder="https://erp.client.lk"
                  />
                </label>
                <label className="field">
                  <span className="label">App link sent to client</span>
                  <input
                    className="input"
                    value={draft.appUrl ?? ""}
                    onChange={(event) => patch({ appUrl: event.target.value })}
                    placeholder="https://erp.client.lk"
                  />
                </label>
                <label className="field">
                  <span className="label">Supabase project URL</span>
                  <input
                    className="input"
                    value={draft.supabaseUrl ?? ""}
                    onChange={(event) => patch({ supabaseUrl: event.target.value })}
                    placeholder="https://xxxx.supabase.co"
                  />
                </label>
                <label className="field">
                  <span className="label">Cloudflare Pages project</span>
                  <input
                    className="input"
                    value={draft.cloudflareProject ?? ""}
                    onChange={(event) => patch({ cloudflareProject: event.target.value })}
                    placeholder="client-torque-erp"
                  />
                </label>
                <label className="field">
                  <span className="label">Deploy webhook</span>
                  <input
                    className="input"
                    value={draft.deployWebhookUrl ?? ""}
                    onChange={(event) => patch({ deployWebhookUrl: event.target.value })}
                    placeholder="https://deploy.example/hook"
                  />
                  <span className="hint">Optional. The portal posts the deployment brief here.</span>
                </label>
              </div>
              <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void deployOrder()}
                  disabled={busy !== null}
                >
                  {busy === "deploy" ? <Loader2 className="spin" /> : <Rocket size={12} />}
                  Deploy now
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => copy(deploymentBrief(draft), "Deployment brief")}
                >
                  <Copy size={12} /> Copy deployment brief
                </button>
              </div>
            </div>

            <div className="order-detail-section">
              <div className="row-between wrap">
                <div>
                  <h3 className="developer-section-title">Initial credentials</h3>
                  <p className="tiny muted">
                    Chosen by RAVBsoft. Clear them after the client signs in and changes the password.
                  </p>
                </div>
                {draft.credentialsClearedAt && (
                  <span className="badge badge-green">
                    <ShieldCheck size={11} /> Cleared {shortDate(draft.credentialsClearedAt)}
                  </span>
                )}
              </div>
              <div className="form-grid">
                <label className="field">
                  <span className="label">Owner login / email</span>
                  <input
                    className="input"
                    value={draft.initialUsername ?? ""}
                    onChange={(event) => patch({ initialUsername: event.target.value })}
                    placeholder="owner@client.lk"
                  />
                </label>
                <label className="field">
                  <span className="label">Initial password</span>
                  <input
                    className="input"
                    value={draft.initialPassword ?? ""}
                    onChange={(event) => patch({ initialPassword: event.target.value })}
                    placeholder="Temporary password"
                  />
                </label>
                <label className="field">
                  <span className="label">Owner PIN</span>
                  <input
                    className="input"
                    value={draft.ownerPin ?? ""}
                    onChange={(event) => patch({ ownerPin: event.target.value })}
                    placeholder="4–6 digits"
                    inputMode="numeric"
                  />
                </label>
              </div>
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    copy(
                      [
                        `Login: ${draft.initialUsername || "—"}`,
                        `Password: ${draft.initialPassword || "—"}`,
                        draft.ownerPin ? `Owner PIN: ${draft.ownerPin}` : "",
                      ]
                        .filter(Boolean)
                        .join("\n"),
                      "Credentials",
                    )
                  }
                >
                  <Copy size={12} /> Copy credentials
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${clearArmedId === draft.id ? "btn-danger" : "btn-ghost"}`}
                  onClick={() => void clearCredentials()}
                  disabled={busy !== null}
                >
                  <Trash2 size={12} />{" "}
                  {clearArmedId === draft.id ? "Confirm clear" : "Clear credentials"}
                </button>
              </div>
            </div>

            <div className="order-detail-section">
              <h3 className="developer-section-title">Handover</h3>
              <div className="row wrap" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => copy(handoverMessage(draft), "Handover message")}
                >
                  <Copy size={12} /> Copy handover message
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={openWhatsApp}>
                  <MessageCircle size={12} /> WhatsApp
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={openEmail}>
                  <ExternalLink size={12} /> Email
                </button>
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => void markDelivered()}
                  disabled={busy !== null}
                >
                  {busy === "deliver" ? <Loader2 className="spin" /> : <PackageCheck size={12} />}
                  Mark link sent
                </button>
              </div>
              <div className="order-handover-preview tiny muted">
                {handoverMessage(draft)}
              </div>
            </div>

            <div className="order-detail-section order-activate">
              <div className="row-between wrap">
                <div>
                  <h3 className="developer-section-title">Register & activate</h3>
                  <p className="tiny muted">
                    Registration creates the client installation row. Activation applies the
                    purchased modules and the paid period.
                  </p>
                </div>
                {draft.clientId ? (
                  <span className="badge badge-green">
                    <BadgeCheck size={11} /> Installation {draft.clientId}
                  </span>
                ) : (
                  <span className="badge badge-amber">
                    <CircleAlert size={11} /> Not registered
                  </span>
                )}
              </div>

              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void registerInstallation()}
                  disabled={busy !== null}
                >
                  {busy === "register" ? <Loader2 className="spin" /> : <ClipboardCheck size={12} />}
                  {draft.clientId ? "Update installation" : "Register installation"}
                </button>
                {!draft.installationId && (
                  <span className="tiny muted">
                    A {draft.product} installation ID will be generated automatically.
                  </span>
                )}
              </div>

              <div className="order-activation-grid">
                <label className="field">
                  <span className="label">Paid period</span>
                  <select
                    className="select"
                    value={activationMonths}
                    onChange={(event) => setActivationMonths(Number(event.target.value))}
                  >
                    {[1, 3, 6, 12, 24, 36].map((months) => (
                      <option key={months} value={months}>
                        {months} month{months === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Payment method</span>
                  <select
                    className="select"
                    value={activationMethod}
                    onChange={(event) =>
                      setActivationMethod(event.target.value as OrderPaymentMethod)
                    }
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Online">Online</option>
                  </select>
                </label>
                <label className="field">
                  <span className="label">Payment reference</span>
                  <input
                    className="input"
                    value={activationReference}
                    onChange={(event) => setActivationReference(event.target.value)}
                    placeholder="Bank slip / gateway reference"
                  />
                </label>
              </div>
              <div className="row-between wrap" style={{ gap: 8, marginTop: 8 }}>
                <span className="tiny muted">
                  <Wallet size={11} />{" "}
                  {draft.monthlyFee === undefined
                    ? "No fee set on the order."
                    : `${money(draft.monthlyFee)} × ${activationMonths} month${activationMonths === 1 ? "" : "s"} = ${money(draft.monthlyFee * activationMonths)}`}
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void activateOrder()}
                  disabled={busy !== null || !draft.clientId}
                >
                  {busy === "activate" ? <Loader2 className="spin" /> : <KeyRound size={12} />}
                  Activate for {activationMonths} month{activationMonths === 1 ? "" : "s"}
                </button>
              </div>
              {!draft.clientId && (
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  Register the installation first. Activation will then switch the client from
                  Trial to Active and keep only the selected modules.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card order-detail-card">
          <div className="empty" style={{ padding: "60px 20px" }}>
            <ClipboardList />
            <p>Select an order to provision it.</p>
            <span className="tiny muted">
              The pipeline is: submitted → reviewing → provisioning → deployed → link sent → trial
              → active.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
