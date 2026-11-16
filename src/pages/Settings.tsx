import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Palette,
  Pencil,
  Percent,
  Phone,
  Plug,
  Plus,
  Printer,
  QrCode,
  RefreshCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  ToggleRight,
  Trash2,
  Upload,
  UploadCloud,
  Users,
  Volume2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { extractBrandColors, readImage } from "../lib/branding";
import {
  licenceInfo,
  getMachineId,
  getInstallationId,
  OFFLINE_GRACE_DAYS,
  TRIAL_DAYS,
} from "../lib/licence";
import { readLicenceCache } from "../lib/licenceSync";
import { FEATURE_FLAGS, MODULE_PRESETS, featureFlagsFor } from "../lib/features";
import { dateOnly, money, shortDate, waLink } from "../lib/utils";
import { printPrinterTest } from "../lib/invoice";
import { STORAGE_KEY } from "../data/seed";
import {
  Alert,
  CopyButton,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Tabs,
} from "../components/ui";
import { BankAccountsPanel } from "../components/FinancePanels";
import { VoiceSettingsPanel } from "../components/VoiceSettings";
import { useToast } from "../components/Toast";
import { COPYRIGHT, DEVELOPER } from "../lib/developer";
import { CLIENT_BUILD, HAS_CLIENT_CUSTOMISATION } from "../custom";
import type {
  AppState,
  FeatureFlagKey,
  InsuranceCompany,
  StoresTopology,
  WorkshopSection,
  WorkshopSettings,
} from "../types";

type SettingsTab =
  | "profile"
  | "branding"
  | "qr"
  | "security"
  | "printing-tax"
  | "catalogues"
  | "payroll-rules"
  | "modules"
  | "licence"
  | "integrations"
  | "data"
  | "about";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SettingsPage() {
  const {
    state,
    currentUser,
    updateSettings,
    loadDemo,
    resetAll,
    importState,
    addInsuranceCompany,
    updateInsuranceCompany,
    removeInsuranceCompany,
    changeOwnerPassword,
    changeOwnPin,
    activateLicence,
    addSection,
    updateSection,
    removeSection,
    assignUserSections,
    updateFeatureFlag,
    updateFeatureFlags,
    setStoresTopology,
    updateWorker,
    syncLicence,
    backupToDrive,
  } = useApp();
  const { push } = useToast();
  const navigate = useNavigate();
  const settings = state.settings;
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [profile, setProfile] = useState({
    companyName: settings.companyName,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    googleReviewUrl: settings.googleReviewUrl,
    currency: settings.currency,
  });
  const [brand, setBrand] = useState({
    logo: settings.logo ?? "",
    brandColor: settings.brandColor,
    accentColor: settings.accentColor,
  });
  const [tax, setTax] = useState({
    tinNumber: settings.tinNumber ?? "",
    vatRegNumber: settings.vatRegNumber ?? "",
    defaultVatRate: String(settings.defaultVatRate ?? 18),
    placeOfSupply: settings.placeOfSupply ?? "",
    footerInquiryLine: settings.footerInquiryLine ?? "",
    footerComplaintLine: settings.footerComplaintLine ?? "",
    printerMode: settings.printerMode ?? "Both",
    thermalPaperWidth: settings.thermalPaperWidth ?? "80mm",
    standardPaperSize: settings.standardPaperSize ?? "A4",
  });
  const [uploading, setUploading] = useState(false);
  const [qrSlug, setQrSlug] = useState(settings.qrSlug);
  const [qrData, setQrData] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [pinForm, setPinForm] = useState({ current: "", pin: "", confirm: "" });
  const [confirmAction, setConfirmAction] = useState<"reset" | "demo" | null>(null);
  const [insurerOpen, setInsurerOpen] = useState(false);
  const [insurerEditingId, setInsurerEditingId] = useState<string | null>(null);
  const [insurerForm, setInsurerForm] = useState({
    name: "",
    address: "",
    email: "",
    hotline: "",
    website: "",
    tinNumber: "",
    active: true,
  });
  const [rules, setRules] = useState({
    workingDays: settings.workingDays,
    epfEmployeeRate: String(settings.epfEmployeeRate),
    epfEmployerRate: String(settings.epfEmployerRate),
    etfRate: String(settings.etfRate),
  });
  const [licenceKey, setLicenceKey] = useState(settings.licenseKey ?? "");
  const [licenceHolder, setLicenceHolder] = useState(settings.licenseHolder ?? "");
  const [syncingLicence, setSyncingLicence] = useState(false);
  const [driveForm, setDriveForm] = useState({
    enabled: settings.driveBackupEnabled ?? false,
    url: settings.driveBackupUrl ?? "",
    key: settings.driveBackupKey ?? "",
    folderId: settings.driveBackupFolderId ?? "",
    hour: String(settings.driveBackupHour ?? 2),
  });
  const [driveBusy, setDriveBusy] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [sectionEditingId, setSectionEditingId] = useState<string | null>(null);
  const [sectionForm, setSectionForm] = useState({
    name: "",
    code: "",
    color: "#0f766e",
    description: "",
    active: true,
    supervisorIds: [] as string[],
    storekeeperIds: [] as string[],
    workerIds: [] as string[],
  });
  const licence = licenceInfo(settings);
  const machineId = useMemo(() => getMachineId(), []);
  const installationId = settings.installationId || getInstallationId();
  const [syncCache, setSyncCache] = useState(() => readLicenceCache());
  const flags = featureFlagsFor(settings);
  const supervisors = state.users.filter((user) => user.departments.includes("Supervisor"));
  const storekeepers = state.users.filter((user) => user.departments.includes("Stores"));
  const activeWorkers = state.workers.filter((worker) => worker.status === "Active");

  const checkInUrl = `${window.location.origin}/check-in/${qrSlug || "workshop"}`;
  const backupSize = useMemo(
    () => new Blob([JSON.stringify(state)]).size,
    [state],
  );
  const photoCount = state.jobCards.reduce((sum, job) => sum + job.photos.length, 0);
  const linkedPro = state.users.find((user) => user.departments.includes("PRO"));

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(checkInUrl, {
      width: 380,
      margin: 1,
      color: { dark: settings.brandColor || "#0f766e", light: "#ffffff" },
    })
      .then((data) => {
        if (!cancelled) setQrData(data);
      })
      .catch(() => {
        if (!cancelled) setQrData("");
      });
    return () => {
      cancelled = true;
    };
  }, [checkInUrl, settings.brandColor]);

  function saveProfile() {
    if (!profile.companyName.trim()) {
      push("Workshop name is required.", "error");
      return;
    }
    if (!profile.phone.trim()) {
      push("Workshop phone is required.", "error");
      return;
    }
    updateSettings({
      companyName: profile.companyName.trim(),
      address: profile.address.trim(),
      phone: profile.phone.trim(),
      email: profile.email.trim(),
      googleReviewUrl: profile.googleReviewUrl.trim(),
      currency: profile.currency.trim() || "LKR",
    });
    push("Workshop profile updated across invoices and messages.");
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      push("Choose a PNG, JPG or SVG image.", "error");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      push("Logo must be smaller than 3 MB.", "error");
      return;
    }
    setUploading(true);
    try {
      const [data, palette] = await Promise.all([readImage(file), extractBrandColors(file)]);
      setBrand({
        logo: data,
        brandColor: palette.brandColor,
        accentColor: palette.accentColor,
      });
      push("Logo loaded. Brand colours extracted — review and save.");
    } catch {
      push("That image could not be read. Try a PNG or JPG.", "error");
    } finally {
      setUploading(false);
    }
  }

  function saveBranding() {
    if (!/^#[0-9a-f]{6}$/i.test(brand.brandColor) || !/^#[0-9a-f]{6}$/i.test(brand.accentColor)) {
      push("Choose valid brand and accent colours.", "error");
      return;
    }
    updateSettings({
      logo: brand.logo || undefined,
      brandColor: brand.brandColor,
      accentColor: brand.accentColor,
    });
    push("Branding saved. The full app re-themed instantly.");
  }

  function saveQrSlug() {
    const slug = qrSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) {
      push("Enter a valid check-in link name.", "error");
      return;
    }
    updateSettings({ qrSlug: slug });
    setQrSlug(slug);
    push("Check-in link updated. Reprint any QR posters that used the old link.");
  }

  function saveTaxAndPrinting() {
    const rate = Number(tax.defaultVatRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      push("VAT rate must be between 0 and 100 percent.", "error");
      return;
    }
    updateSettings({
      tinNumber: tax.tinNumber.trim(),
      vatRegNumber: tax.vatRegNumber.trim(),
      defaultVatRate: rate,
      placeOfSupply: tax.placeOfSupply.trim() || profile.address.trim(),
      footerInquiryLine: tax.footerInquiryLine.trim(),
      footerComplaintLine: tax.footerComplaintLine.trim(),
      printerMode: tax.printerMode,
      thermalPaperWidth: tax.thermalPaperWidth,
      standardPaperSize: tax.standardPaperSize,
    });
    push("Tax and printing settings saved.");
  }

  function changeMasterPassword() {
    if (!passwordForm.next) {
      push("Enter a new master password.", "error");
      return;
    }
    if (passwordForm.next.length < 6) {
      push("The new master password must be at least 6 characters.", "error");
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      push("The new password confirmation does not match.", "error");
      return;
    }
    const result = changeOwnerPassword(passwordForm.current, passwordForm.next);
    if (!result.ok) {
      push(result.message ?? "Could not change the master password.", "error");
      return;
    }
    setPasswordForm({ current: "", next: "", confirm: "" });
    push("Owner master password changed. Keep it safe.");
  }

  function changeOwnerPin() {
    if (!currentUser) return;
    if (pinForm.pin !== pinForm.confirm) {
      push("The PIN confirmation does not match.", "error");
      return;
    }
    const result = changeOwnPin(pinForm.current, pinForm.pin);
    if (!result.ok) {
      push(result.message ?? "Could not update the PIN.", "error");
      return;
    }
    setPinForm({ current: "", pin: "", confirm: "" });
    push("Sign-in PIN updated.");
  }

  function printQrPoster() {
    if (!qrData) {
      push("The QR code is still generating. Try again in a moment.", "error");
      return;
    }
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) {
      push("Allow pop-ups to print the QR poster.", "error");
      return;
    }
    const brand = settings.brandColor || "#0f766e";
    const accent = settings.accentColor || "#f59e0b";
    win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>${settings.companyName} — check-in poster</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; background: #fff; }
  .poster { width: 210mm; min-height: 297mm; padding: 22mm 20mm; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .brand { font-size: 15px; letter-spacing: .18em; text-transform: uppercase; font-weight: 700; color: ${brand}; }
  .rule { width: 34mm; height: 3px; background: ${accent}; margin: 6mm 0 10mm; border-radius: 3px; }
  h1 { font-size: 34px; line-height: 1.15; margin: 0 0 5mm; max-width: 150mm; }
  .sub { font-size: 16px; color: #475569; margin: 0 0 12mm; max-width: 130mm; line-height: 1.5; }
  .qr-card { border: 2px solid ${brand}; border-radius: 10mm; padding: 12mm; display: inline-flex; flex-direction: column; align-items: center; background: #f8fafc; }
  .qr-card img { width: 108mm; height: 108mm; display: block; }
  .scan { margin-top: 7mm; font-size: 18px; font-weight: 800; color: ${brand}; letter-spacing: .02em; }
  .steps { margin-top: 13mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; width: 100%; }
  .step { border: 1px solid #e2e8f0; border-radius: 5mm; padding: 6mm 5mm; text-align: left; }
  .step b { display: block; font-size: 14px; margin-bottom: 2mm; }
  .step span { font-size: 12px; color: #64748b; line-height: 1.45; }
  .foot { margin-top: auto; padding-top: 12mm; font-size: 12px; color: #64748b; line-height: 1.6; }
  .foot strong { color: #0f172a; }
  @media print { .poster { width: 210mm; height: 297mm; } }
</style></head><body>
  <div class="poster">
    <div class="brand">${settings.companyName}</div>
    <div class="rule"></div>
    <h1>Scan to check in your vehicle</h1>
    <p class="sub">Skip the queue. Tell us about your vehicle before you arrive and our service team will be ready.</p>
    <div class="qr-card">
      <img src="${qrData}" alt="Check-in QR code" />
      <div class="scan">SCAN WITH YOUR PHONE CAMERA</div>
    </div>
    <div class="steps">
      <div class="step"><b>1. Scan</b><span>Open the camera on your phone and point it at the QR code.</span></div>
      <div class="step"><b>2. Describe</b><span>Add your vehicle number, model, mileage and what needs attention.</span></div>
      <div class="step"><b>3. Arrive</b><span>We confirm your booking and greet you at the gate.</span></div>
    </div>
    <div class="foot">
      <strong>${settings.companyName}</strong><br />
      ${settings.address}<br />
      ${settings.phone} · ${settings.email}<br />
      ${checkInUrl}
    </div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>
</body></html>`);
    win.document.close();
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${settings.qrSlug || "workshop"}-backup-${dateOnly(new Date().toISOString())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    push("Workshop backup downloaded.");
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as
        | AppState
        | { app?: string; state?: AppState };
      const parsed =
        "state" in raw && raw.state ? raw.state : (raw as AppState);
      if (
        !parsed ||
        typeof parsed.version !== "number" ||
        parsed.version > 4 ||
        !parsed.settings ||
        !Array.isArray(parsed.users) ||
        !Array.isArray(parsed.jobCards) ||
        !Array.isArray(parsed.checkIns) ||
        !Array.isArray(parsed.inventory) ||
        !Array.isArray(parsed.ledger)
      ) {
        throw new Error("Invalid backup structure");
      }
      importState(parsed);
      push("Backup imported. Please sign in again.");
      navigate("/login", { replace: true });
    } catch {
      push("That file is not a valid Torque workshop backup.", "error");
    }
  }

  function saveDriveBackup() {
    const hour = Number(driveForm.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      push("Backup hour must be a whole number between 0 and 23.", "error");
      return;
    }
    if (driveForm.enabled && (!driveForm.url.trim() || !driveForm.key.trim())) {
      push(
        "Add the backup webhook URL and secret key before enabling daily backups.",
        "error",
      );
      return;
    }
    updateSettings({
      driveBackupEnabled: driveForm.enabled,
      driveBackupUrl: driveForm.url.trim(),
      driveBackupKey: driveForm.key.trim(),
      driveBackupFolderId: driveForm.folderId.trim(),
      driveBackupHour: hour,
    });
    push("Daily Google Drive backup settings saved.");
  }

  async function runDriveBackupNow() {
    setDriveBusy(true);
    try {
      const result = await backupToDrive(true);
      push(
        result.message ??
          (result.ok ? "Backup uploaded to Google Drive." : "Backup failed."),
        result.ok ? "info" : "error",
      );
    } finally {
      setDriveBusy(false);
    }
  }

  function runConfirmedAction() {
    if (confirmAction === "demo") {
      loadDemo();
      push("Demo workshop restored. Sign in with any demo account and PIN 1234.");
      navigate("/login", { replace: true });
    } else if (confirmAction === "reset") {
      resetAll();
      push("Operational data cleared. Staff, inventory and suppliers were kept.");
      navigate("/dashboard");
    }
    setConfirmAction(null);
  }

  function toggleWorkingDay(day: number) {
    setRules((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((entry) => entry !== day)
        : [...prev.workingDays, day].sort((a, b) => a - b),
    }));
  }

  function savePayrollRules() {
    if (rules.workingDays.length === 0) {
      push("Choose at least one company working day.", "error");
      return;
    }
    const epfEmployeeRate = Number(rules.epfEmployeeRate);
    const epfEmployerRate = Number(rules.epfEmployerRate);
    const etfRate = Number(rules.etfRate);
    if (
      [epfEmployeeRate, epfEmployerRate, etfRate].some(
        (rate) => !Number.isFinite(rate) || rate < 0 || rate > 100,
      )
    ) {
      push("Contribution rates must be between 0 and 100 percent.", "error");
      return;
    }
    updateSettings({
      workingDays: rules.workingDays,
      epfEmployeeRate,
      epfEmployerRate,
      etfRate,
    });
    push("Working days and EPF/ETF rates updated. Payroll recalculates immediately.");
  }

  function openInsurerModal(company?: InsuranceCompany) {
    setInsurerEditingId(company?.id ?? null);
    setInsurerForm(
      company
        ? {
            name: company.name,
            address: company.address,
            email: company.email,
            hotline: company.hotline,
            website: company.website ?? "",
            tinNumber: company.tinNumber ?? "",
            active: company.active !== false,
          }
        : {
            name: "",
            address: "",
            email: "",
            hotline: "",
            website: "",
            tinNumber: "",
            active: true,
          },
    );
    setInsurerOpen(true);
  }

  function saveInsurer() {
    if (!insurerForm.name.trim()) {
      push("Enter the insurance company name.", "error");
      return;
    }
    const payload = {
      name: insurerForm.name.trim(),
      address: insurerForm.address.trim(),
      email: insurerForm.email.trim(),
      hotline: insurerForm.hotline.trim(),
      website: insurerForm.website.trim() || undefined,
      tinNumber: insurerForm.tinNumber.trim(),
      active: insurerForm.active,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name,
    };
    if (insurerEditingId) {
      const existing = state.insuranceCompanies.find(
        (company) => company.id === insurerEditingId,
      );
      if (existing) {
        updateInsuranceCompany({ ...existing, ...payload });
        push("Insurance directory entry updated.");
      }
    } else {
      addInsuranceCompany(payload);
      push("Insurance company added to the directory.");
    }
    setInsurerOpen(false);
  }

  function activateKey() {
    const result = activateLicence(licenceKey);
    if (!result.ok) {
      push(result.message ?? "Could not activate this licence.", "error");
      return;
    }
    if (licenceHolder.trim()) {
      updateSettings({ licenseHolder: licenceHolder.trim() });
    }
    push(result.message ?? "Licence activated.");
  }

  function openSectionModal(section?: WorkshopSection) {
    if (section) {
      setSectionEditingId(section.id);
      setSectionForm({
        name: section.name,
        code: section.code,
        color: section.color,
        description: section.description ?? "",
        active: section.active,
        supervisorIds: [...section.supervisorIds],
        storekeeperIds: [...section.storekeeperIds],
        workerIds: [...section.workerIds],
      });
    } else {
      setSectionEditingId(null);
      setSectionForm({
        name: "",
        code: "",
        color: "#0f766e",
        description: "",
        active: true,
        supervisorIds: [],
        storekeeperIds: [],
        workerIds: [],
      });
    }
    setSectionOpen(true);
  }

  function toggleSectionMember(
    key: "supervisorIds" | "storekeeperIds" | "workerIds",
    id: string,
  ) {
    setSectionForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(id)
        ? prev[key].filter((entry) => entry !== id)
        : [...prev[key], id],
    }));
  }

  function saveSection() {
    if (!sectionForm.name.trim() || !sectionForm.code.trim()) {
      push("Section name and code are required.", "error");
      return;
    }
    const payload = {
      name: sectionForm.name.trim(),
      code: sectionForm.code.trim().toUpperCase(),
      color: sectionForm.color || "#0f766e",
      description: sectionForm.description.trim() || undefined,
      active: sectionForm.active,
      supervisorIds: sectionForm.supervisorIds,
      storekeeperIds: sectionForm.storekeeperIds,
      workerIds: sectionForm.workerIds,
    };
    const existing = state.sections.find((section) => section.id === sectionEditingId);
    const sectionId = existing ? existing.id : addSection(payload);
    if (existing) {
      updateSection({ ...existing, ...payload });
    }
    const sectionUsers = new Set([...payload.supervisorIds, ...payload.storekeeperIds]);
    state.users.forEach((user) => {
      const current = user.sectionIds ?? [];
      const shouldHave = sectionUsers.has(user.id);
      const next = shouldHave
        ? Array.from(new Set([...current, sectionId]))
        : current.filter((id) => id !== sectionId);
      if (
        next.length !== current.length ||
        next.some((id, index) => id !== current[index])
      ) {
        assignUserSections(user.id, next);
      }
    });
    state.workers.forEach((worker) => {
      const current = worker.sectionIds ?? [];
      const shouldHave = payload.workerIds.includes(worker.id);
      const next = shouldHave
        ? Array.from(new Set([...current, sectionId]))
        : current.filter((id) => id !== sectionId);
      if (
        next.length !== current.length ||
        next.some((id, index) => id !== current[index])
      ) {
        updateWorker({ ...worker, sectionIds: next });
      }
    });
    push(
      existing
        ? `${payload.name} updated. Staff assignments synced.`
        : `${payload.name} created. Assign jobs to this section on intake or the job page.`,
    );
    setSectionOpen(false);
  }

  function deleteSection(section: WorkshopSection) {
    const result = removeSection(section.id);
    if (!result.ok) {
      push(result.message ?? "Could not remove this section.", "error");
      return;
    }
    push(`${section.name} removed.`);
  }

  function applyPreset(presetId: string) {
    const preset = MODULE_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    const next = FEATURE_FLAGS.reduce((acc, flag) => {
      acc[flag.key] = preset.flags.includes(flag.key);
      return acc;
    }, {} as Record<FeatureFlagKey, boolean>);
    updateFeatureFlags(next);
    push(`${preset.name} modules applied. Navigation and forms update immediately.`);
  }

  async function syncLicenceNow() {
    setSyncingLicence(true);
    const result = await syncLicence();
    setSyncingLicence(false);
    setSyncCache(readLicenceCache());
    if (result.ok) {
      push(result.message ?? "Licence sync completed.");
    } else {
      push(result.message ?? "Could not sync the licence.", "error");
    }
  }

  const tabs = [
    { id: "profile" as SettingsTab, label: "Workshop" },
    { id: "branding" as SettingsTab, label: "Branding" },
    { id: "qr" as SettingsTab, label: "QR check-in" },
    { id: "security" as SettingsTab, label: "Security" },
    { id: "printing-tax" as SettingsTab, label: "Printing & tax" },
    { id: "catalogues" as SettingsTab, label: "Catalogue & insurers" },
    { id: "payroll-rules" as SettingsTab, label: "Payroll rules" },
    { id: "modules" as SettingsTab, label: "Modules & sections" },
    { id: "licence" as SettingsTab, label: "Licence" },
    { id: "integrations" as SettingsTab, label: "Integrations" },
    { id: "data" as SettingsTab, label: "Data & backup" },
    { id: "about" as SettingsTab, label: "About" },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Workshop settings"
        subtitle="Profile, brand theme, customer check-in, owner security, integrations and data."
        actions={
          <Tabs<SettingsTab> value={tab} onChange={setTab} tabs={tabs} />
        }
      />

      {tab === "profile" && (
        <div className="grid cols-3">
          <div className="card span-2">
            <div className="card-head">
              <div>
                <h3>Workshop profile</h3>
                <p>Appears on invoices, WhatsApp messages and the customer check-in page.</p>
              </div>
              <Building2 size={18} className="muted" />
            </div>
            <div className="card-body">
              <div className="form-grid">
                <Field label="Workshop / company name" required full>
                  <input
                    className="input"
                    value={profile.companyName}
                    onChange={(event) =>
                      setProfile({ ...profile, companyName: event.target.value })
                    }
                  />
                </Field>
                <Field label="Phone" required>
                  <input
                    className="input"
                    value={profile.phone}
                    onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <input
                    className="input"
                    type="email"
                    value={profile.email}
                    onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                  />
                </Field>
                <Field label="Address" full>
                  <input
                    className="input"
                    value={profile.address}
                    onChange={(event) => setProfile({ ...profile, address: event.target.value })}
                  />
                </Field>
                <Field
                  label="Google review link"
                  hint="Added to invoice and after-service messages."
                  full
                >
                  <input
                    className="input"
                    placeholder="https://g.page/r/your-workshop/review"
                    value={profile.googleReviewUrl}
                    onChange={(event) =>
                      setProfile({ ...profile, googleReviewUrl: event.target.value })
                    }
                  />
                </Field>
                <Field label="Currency code">
                  <input
                    className="input"
                    value={profile.currency}
                    onChange={(event) => setProfile({ ...profile, currency: event.target.value })}
                  />
                </Field>
                <div className="field" style={{ justifyContent: "flex-end" }}>
                  <button className="btn btn-primary" onClick={saveProfile}>
                    <Save />
                    Save profile
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Brand preview</h3>
                  <p>The customer-facing identity.</p>
                </div>
              </div>
              <div className="card-body">
                <div className="row" style={{ gap: 11 }}>
                  <div className="brand-mark" style={{ background: brand.brandColor }}>
                    {brand.logo ? <img src={brand.logo} alt="" /> : profile.companyName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="strong">{profile.companyName || "Your workshop"}</div>
                    <div className="tiny muted">{profile.phone || "Phone"} · {profile.currency}</div>
                  </div>
                </div>
                <div className="divider" />
                <div className="kv">
                  <span>Owner</span>
                  <span>{currentUser?.name ?? "—"}</span>
                </div>
                <div className="kv">
                  <span>Staff accounts</span>
                  <span>{state.users.length}</span>
                </div>
                <div className="kv">
                  <span>Marketing mode</span>
                  <span>{settings.demoMode ? "Demo workshop" : "Live workshop"}</span>
                </div>
                <div className="kv">
                  <span>Created</span>
                  <span>{shortDate(settings.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Workshop records</h3>
                  <p>At a glance.</p>
                </div>
              </div>
              <div className="card-body">
                <div className="kv">
                  <span>Job cards</span>
                  <span>{state.jobCards.length}</span>
                </div>
                <div className="kv">
                  <span>Inspection photos</span>
                  <span>{photoCount}</span>
                </div>
                <div className="kv">
                  <span>Inventory lines</span>
                  <span>{state.inventory.length}</span>
                </div>
                <div className="kv">
                  <span>Supplier records</span>
                  <span>{state.suppliers.length}</span>
                </div>
                <div className="kv">
                  <span>Ledger entries</span>
                  <span>{state.ledger.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "branding" && (
        <div className="grid cols-3">
          <div className="card span-2">
            <div className="card-head">
              <div>
                <h3>Logo & theme colours</h3>
                <p>Upload a logo and the dominant colours theme the entire app automatically.</p>
              </div>
              <Palette size={18} className="muted" />
            </div>
            <div className="card-body stack">
              <div className="logo-upload">
                {brand.logo ? (
                  <img src={brand.logo} alt="Workshop logo" style={{ width: 82, height: 82, objectFit: "cover", borderRadius: 14 }} />
                ) : (
                  <div className="logo-placeholder" style={{ background: brand.brandColor }}>
                    {(profile.companyName || "WS").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div className="strong">Workshop logo</div>
                  <div className="tiny muted" style={{ marginTop: 3 }}>
                    PNG, JPG or SVG up to 3 MB. Colours are extracted locally in this browser.
                  </div>
                  <div className="row wrap" style={{ marginTop: 9 }}>
                    <label className="btn btn-secondary btn-sm" htmlFor="settings-logo">
                      {uploading ? <Loader2 size={13} className="spin" /> : <Upload />}
                      {uploading ? "Reading colours…" : "Upload logo"}
                    </label>
                    <input
                      id="settings-logo"
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(event) => uploadLogo(event.target.files?.[0])}
                    />
                    {brand.logo && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setBrand({ ...brand, logo: "" })}
                      >
                        <Trash2 />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-grid">
                <Field label="Brand colour" hint="Primary buttons, sidebar and invoice header.">
                  <div className="row">
                    <input
                      type="color"
                      value={brand.brandColor}
                      onChange={(event) => setBrand({ ...brand, brandColor: event.target.value })}
                      style={{ width: 44, height: 40, padding: 3, borderRadius: 9, border: "1px solid var(--line-strong)", background: "#fff" }}
                    />
                    <input
                      className="input"
                      value={brand.brandColor}
                      onChange={(event) => setBrand({ ...brand, brandColor: event.target.value })}
                    />
                  </div>
                </Field>
                <Field label="Accent colour" hint="Attention dots, highlights and marketing badges.">
                  <div className="row">
                    <input
                      type="color"
                      value={brand.accentColor}
                      onChange={(event) => setBrand({ ...brand, accentColor: event.target.value })}
                      style={{ width: 44, height: 40, padding: 3, borderRadius: 9, border: "1px solid var(--line-strong)", background: "#fff" }}
                    />
                    <input
                      className="input"
                      value={brand.accentColor}
                      onChange={(event) => setBrand({ ...brand, accentColor: event.target.value })}
                    />
                  </div>
                </Field>
              </div>

              <div className="row wrap">
                <button className="btn btn-primary" onClick={saveBranding}>
                  <Save />
                  Save branding
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    setBrand({
                      ...brand,
                      brandColor: "#0f766e",
                      accentColor: "#f59e0b",
                    })
                  }
                >
                  <RefreshCcw />
                  Reset colours
                </button>
              </div>

              <Alert tone="info" icon={<ImageIcon />}>
                The logo and colours are stored with the workshop settings. In production the same
                palette is applied to invoices, PDF documents and the printed QR poster.
              </Alert>
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Live theme preview</h3>
                  <p>Every screen updates from these tokens.</p>
                </div>
              </div>
              <div className="card-body">
                <div className="row" style={{ gap: 9 }}>
                  <span className="badge" style={{ background: brand.brandColor, color: "#fff" }}>Primary</span>
                  <span className="badge" style={{ background: brand.accentColor, color: "#3a2500" }}>Accent</span>
                  <span className="chip">Chip</span>
                </div>
                <div className="divider" />
                <div className="row wrap">
                  <button className="btn btn-primary btn-sm" style={{ background: brand.brandColor }}>
                    Issue parts
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ borderColor: brand.accentColor }}>
                    Awaiting approval
                  </button>
                </div>
                <div className="divider" />
                <div className="mini-stat">
                  <div className="label">Revenue today</div>
                  <div className="value" style={{ color: brand.brandColor }}>{money(15500)}</div>
                  <div className="meta">Demo preview</div>
                </div>
              </div>
            </div>

            <div className="alert alert-brand">
              <Sparkles />
              <div>
                <strong>Automatic colour extraction</strong>
                Uploading a new logo samples its dominant colours and adjusts the app theme. Fine
                tune the result with the colour pickers.
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "qr" && (
        <div className="grid cols-3">
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Customer check-in QR</h3>
                <p>Print or share at the entrance.</p>
              </div>
              <QrCode size={18} className="muted" />
            </div>
            <div className="card-body">
              <div className="qr-box" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                {qrData ? (
                  <img src={qrData} alt="Customer check-in QR" />
                ) : (
                  <div style={{ width: 152, height: 152, borderRadius: 12, background: "#f1f5f9" }} />
                )}
                <div className="qr-copy" style={{ width: "100%" }}>
                  <div className="label">Public check-in link</div>
                  <div className="copy-field">
                    <input className="input" readOnly value={checkInUrl} />
                    <CopyButton value={checkInUrl} />
                  </div>
                  <div className="row wrap" style={{ marginTop: 8 }}>
                    {qrData && (
                      <a
                        className="btn btn-secondary btn-sm"
                        href={qrData}
                        download={`${qrSlug || "workshop"}-check-in-qr.png`}
                      >
                        <Download />
                        Download QR
                      </a>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={printQrPoster}>
                      <QrCode />
                      Print A4 poster
                    </button>
                    <a className="btn btn-ghost btn-sm" href={checkInUrl} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Preview form
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card span-2">
            <div className="card-head">
              <div>
                <h3>Check-in link settings</h3>
                <p>Each workshop has its own QR link and isolated bookings.</p>
              </div>
              <Smartphone size={18} className="muted" />
            </div>
            <div className="card-body stack">
              <Field
                label="Link name (slug)"
                required
                hint="Changing this invalidates previously printed QR codes."
              >
                <div className="row">
                  <span className="tiny muted">/check-in/</span>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    value={qrSlug}
                    onChange={(event) => setQrSlug(event.target.value)}
                  />
                </div>
              </Field>
              <div className="row wrap">
                <button className="btn btn-primary" onClick={saveQrSlug}>
                  <Save />
                  Save check-in link
                </button>
                <CopyButton value={checkInUrl} label="Copy full link" />
              </div>
              <div className="divider" />
              <div className="section-title">
                <span className="label">What the customer submits</span>
              </div>
              <div className="history-line">
                <span>Vehicle number</span>
                <span className="badge badge-red">Compulsory</span>
              </div>
              <div className="history-line">
                <span>Make, model and current mileage</span>
                <span className="badge badge-red">Compulsory</span>
              </div>
              <div className="history-line">
                <span>Customer name and +94 phone</span>
                <span className="badge badge-red">Compulsory</span>
              </div>
              <div className="history-line">
                <span>Email and address</span>
                <span className="badge badge-slate">Optional</span>
              </div>
              <Alert tone="info" icon={<RefreshCcw />}>
                Returning vehicles auto-fill the make, model, owner and last mileage as soon as the
                number plate matches a previous job or check-in.
              </Alert>
              <div className="tiny muted">
                QR poster tip: print the downloaded image on the entrance board with the text
                “Scan to check in your vehicle”. Each workshop's QR points only to its own isolated
                check-in form.
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "security" && (
        <div className="grid cols-2">
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Owner master password</h3>
                <p>Protects salary, commission and destructive settings.</p>
              </div>
              <Lock size={18} className="muted" />
            </div>
            <div className="card-body stack">
              <Field label="Current master password" required>
                <input
                  className="input"
                  type="password"
                  value={passwordForm.current}
                  onChange={(event) =>
                    setPasswordForm({ ...passwordForm, current: event.target.value })
                  }
                />
              </Field>
              <div className="form-grid">
                <Field label="New password" required hint="At least 6 characters.">
                  <input
                    className="input"
                    type="password"
                    value={passwordForm.next}
                    onChange={(event) =>
                      setPasswordForm({ ...passwordForm, next: event.target.value })
                    }
                  />
                </Field>
                <Field label="Confirm new password" required>
                  <input
                    className="input"
                    type="password"
                    value={passwordForm.confirm}
                    onChange={(event) =>
                      setPasswordForm({ ...passwordForm, confirm: event.target.value })
                    }
                  />
                </Field>
              </div>
              <button className="btn btn-primary" onClick={changeMasterPassword}>
                <KeyRound />
                Change master password
              </button>
              {settings.demoMode && (
                <div className="tiny muted">
                  Demo master password: <strong>owner123</strong>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Your sign-in PIN</h3>
                <p>Self-service PIN change — no owner password needed.</p>
              </div>
              <ShieldCheck size={18} className="muted" />
            </div>
            <div className="card-body stack">
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
                    value={pinForm.pin}
                    onChange={(event) =>
                      setPinForm({ ...pinForm, pin: event.target.value.replace(/\D/g, "") })
                    }
                  />
                </Field>
                <Field label="Confirm PIN" required>
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
              <button className="btn btn-primary" onClick={changeOwnerPin}>
                <KeyRound />
                Update my PIN
              </button>
              <div className="divider" />
              <div className="kv">
                <span>Signed in as</span>
                <span>{currentUser?.name}</span>
              </div>
              <div className="kv">
                <span>Role</span>
                <span>{currentUser?.isOwner ? "Owner" : currentUser?.departments.join(" · ")}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Voice & notification preferences</h3>
                <p>Per-user alerts spoken through the browser and shown in the bell menu.</p>
              </div>
              <Volume2 size={18} className="muted" />
            </div>
            <div className="card-body stack">
              <VoiceSettingsPanel />
            </div>
          </div>

          <div className="card span-2">
            <div className="card-head">
              <div>
                <h3>Security model</h3>
                <p>What is protected in this demo and what Supabase adds in production.</p>
              </div>
            </div>
            <div className="card-body">
              <div className="grid cols-2">
                <div className="stack" style={{ gap: 8 }}>
                  <div className="small strong">Protected screens</div>
                  <div className="tiny muted">
                    Dashboard, Team & HR and Settings are owner-only. Gate, workshop, stores,
                    cashier, accounts and marketing check the department on every route.
                  </div>
                  <div className="small strong" style={{ marginTop: 8 }}>Master password</div>
                  <div className="tiny muted">
                    Required to unlock salary and commission controls in Team & HR, and to change
                    the owner PIN or master password here.
                  </div>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  <div className="small strong">Demo storage</div>
                  <div className="tiny muted">
                    Demo data lives in this browser's localStorage. It is convenient for
                    evaluation but not encrypted and not shared between devices.
                  </div>
                  <div className="small strong" style={{ marginTop: 8 }}>Production</div>
                  <div className="tiny muted">
                    The included Supabase schema uses row-level security, hashed auth, tenant
                    isolation, storage buckets and audit-friendly records.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "printing-tax" && (
        <div className="grid cols-3">
          <div className="card span-2">
            <div className="card-head">
              <div>
                <h3>Tax registration &amp; invoice template</h3>
                <p>Printed in the Sri Lankan IRD supplier block on every A4 tax invoice and bill.</p>
              </div>
              <Percent size={18} className="muted" />
            </div>
            <div className="card-body">
              <div className="form-grid">
                <Field label="Company TIN" hint="Taxpayer Identification Number for IRD documents.">
                  <input
                    className="input"
                    placeholder="123456789-7000"
                    value={tax.tinNumber}
                    onChange={(event) => setTax({ ...tax, tinNumber: event.target.value })}
                  />
                </Field>
                <Field label="VAT registration number">
                  <input
                    className="input"
                    placeholder="123456789-7000"
                    value={tax.vatRegNumber}
                    onChange={(event) => setTax({ ...tax, vatRegNumber: event.target.value })}
                  />
                </Field>
                <Field label="Default VAT rate (%)">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={tax.defaultVatRate}
                    onChange={(event) => setTax({ ...tax, defaultVatRate: event.target.value })}
                  />
                </Field>
                <Field label="Place of supply">
                  <input
                    className="input"
                    placeholder="Kandy, Sri Lanka"
                    value={tax.placeOfSupply}
                    onChange={(event) => setTax({ ...tax, placeOfSupply: event.target.value })}
                  />
                </Field>
                <Field label="Footer inquiry line" full>
                  <input
                    className="input"
                    value={tax.footerInquiryLine}
                    onChange={(event) =>
                      setTax({ ...tax, footerInquiryLine: event.target.value })
                    }
                  />
                </Field>
                <Field label="Footer complaint line" full>
                  <input
                    className="input"
                    value={tax.footerComplaintLine}
                    onChange={(event) =>
                      setTax({ ...tax, footerComplaintLine: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Alert tone="info" title="When VAT applies">
                The cashier chooses No VAT or Add VAT on a draft bill in Cashier → Separate bills,
                before it is sent to the insurer or corporate customer. With VAT prints a TAX
                INVOICE with the 18% (or chosen) VAT row; without VAT prints a standard INVOICE.
                Once sent, the bill's VAT is fixed. Insurance estimates and bills always use the
                standard A4 IRD layout.
              </Alert>
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Printers</h3>
                  <p>Default routing for customer documents.</p>
                </div>
                <Printer size={18} className="muted" />
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <Field label="Printer mode" full>
                    <select
                      className="select"
                      value={tax.printerMode}
                      onChange={(event) =>
                        setTax({
                          ...tax,
                          printerMode: event.target.value as typeof tax.printerMode,
                        })
                      }
                    >
                      <option value="Both">Both — thermal and standard PC</option>
                      <option value="Thermal_Only">Thermal only</option>
                      <option value="Standard_PC">Standard PC only (A4)</option>
                    </select>
                  </Field>
                  <Field label="Thermal roll width" full>
                    <select
                      className="select"
                      value={tax.thermalPaperWidth}
                      onChange={(event) =>
                        setTax({
                          ...tax,
                          thermalPaperWidth: event.target.value as typeof tax.thermalPaperWidth,
                        })
                      }
                    >
                      <option value="80mm">80 mm</option>
                      <option value="58mm">58 mm</option>
                    </select>
                  </Field>
                  <Field label="Standard paper size" full>
                    <select
                      className="select"
                      value={tax.standardPaperSize}
                      onChange={(event) =>
                        setTax({
                          ...tax,
                          standardPaperSize: event.target.value as typeof tax.standardPaperSize,
                        })
                      }
                    >
                      <option value="A4">A4</option>
                      <option value="A5">A5</option>
                    </select>
                  </Field>
                </div>
                <div className="row wrap" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={saveTaxAndPrinting}>
                    <Save />
                    Save tax &amp; printing
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() =>
                      printPrinterTest({
                        ...settings,
                        printerMode: tax.printerMode,
                        thermalPaperWidth: tax.thermalPaperWidth,
                        standardPaperSize: tax.standardPaperSize,
                      })
                    }
                  >
                    <Printer />
                    Test thermal print
                  </button>
                </div>
              </div>
            </div>
            <Alert tone="info" title="Default routing">
              Normal customer invoices and advance receipts default to thermal. Insurance bills and
              estimates always print on standard A4. The cashier can switch a customer invoice or
              advance receipt between thermal and A4 at any time.
            </Alert>
          </div>
        </div>
      )}

      {tab === "catalogues" && (
        <div className="stack">
          <BankAccountsPanel />
          <div className="grid cols-1">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Sri Lankan insurance directory</h3>
                  <p>Addresses, TIN, emails and hotlines used on claims and tax invoices.</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => openInsurerModal()}>
                  <Plus />
                  Add insurer
                </button>
              </div>
              {state.insuranceCompanies.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck size={22} />}
                  title="No insurance companies"
                  message="Add the insurers your workshop deals with so claim forms and bills carry the right contact details."
                  action={
                    <button className="btn btn-primary" onClick={() => openInsurerModal()}>
                      Add insurer
                    </button>
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Insurer</th>
                        <th>TIN</th>
                        <th>Hotline</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {state.insuranceCompanies.map((company) => (
                        <tr key={company.id}>
                          <td>
                            <div className="cell-main">{company.name}</div>
                            <div className="cell-sub">{company.address || "Address not set"}</div>
                          </td>
                          <td className="tiny">{company.tinNumber || "—"}</td>
                          <td className="small">{company.hotline || "—"}</td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              title={
                                company.active === false
                                  ? "Inactive — click to reactivate"
                                  : "Active — click to deactivate"
                              }
                              onClick={() =>
                                updateInsuranceCompany({
                                  ...company,
                                  active: company.active === false,
                                  updatedAt: new Date().toISOString(),
                                  updatedBy: currentUser?.name,
                                })
                              }
                            >
                              <span
                                className={`badge ${company.active === false ? "" : "badge-green"}`}
                              >
                                {company.active === false ? "Inactive" : "Active"}
                              </span>
                            </button>
                          </td>
                          <td>
                            <div className="row" style={{ justifyContent: "flex-end", gap: 3 }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Edit insurer"
                                onClick={() => openInsurerModal(company)}
                              >
                                <Pencil />
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Remove insurer"
                                onClick={() => {
                                  removeInsuranceCompany(company.id);
                                  push("Insurance company removed.", "info");
                                }}
                              >
                                <Trash2 />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="card-body">
                <div className="tiny muted">
                  Hotlines and emails appear on the insurance bill PDF, claim tracker and the
                  release-order workflow. Keep them current when an insurer changes contacts.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "payroll-rules" && (
        <div className="grid cols-3">
          <div className="card span-2">
            <div className="card-head">
              <div>
                <h3>Working days & statutory rates</h3>
                <p>Owner-only payroll rules used for attendance, EPF and ETF.</p>
              </div>
              <Percent size={18} className="muted" />
            </div>
            <div className="card-body stack">
              <div className="field">
                <label className="label">Company working days</label>
                <div className="row wrap" style={{ gap: 6 }}>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                    (label, day) => (
                      <button
                        key={label}
                        type="button"
                        className={`btn btn-sm ${
                          rules.workingDays.includes(day) ? "btn-primary" : "btn-secondary"
                        }`}
                        onClick={() => toggleWorkingDay(day)}
                      >
                        {label.slice(0, 3)}
                      </button>
                    ),
                  )}
                </div>
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  Basic salary is prorated across these days. Attendance and paid allowed off days
                  determine how many days are payable.
                </div>
              </div>

              <div className="form-grid">
                <Field label="EPF employee (%)" hint="Deducted from the worker's gross pay.">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={rules.epfEmployeeRate}
                    onChange={(event) =>
                      setRules({ ...rules, epfEmployeeRate: event.target.value })
                    }
                  />
                </Field>
                <Field label="EPF employer (%)" hint="Paid by the workshop, not deducted.">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={rules.epfEmployerRate}
                    onChange={(event) =>
                      setRules({ ...rules, epfEmployerRate: event.target.value })
                    }
                  />
                </Field>
                <Field label="ETF (%)" hint="Employer contribution only.">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={rules.etfRate}
                    onChange={(event) => setRules({ ...rules, etfRate: event.target.value })}
                  />
                </Field>
              </div>

              <div className="row wrap">
                <button className="btn btn-primary" onClick={savePayrollRules}>
                  <Save />
                  Save payroll rules
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    setRules({
                      workingDays: [1, 2, 3, 4, 5, 6],
                      epfEmployeeRate: "8",
                      epfEmployerRate: "12",
                      etfRate: "3",
                    })
                  }
                >
                  <RefreshCcw />
                  Reset to Sri Lankan defaults
                </button>
              </div>

              <Alert tone="info" icon={<CalendarDays />}>
                Allowed off days are assigned per worker in Team & HR. Off days up to the allowed
                number are paid; additional absences reduce the basic salary. Daily-wage workers
                are paid only for present days from the daily wage panel.
              </Alert>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Current rules</h3>
                <p>What payroll uses today.</p>
              </div>
            </div>
            <div className="card-body">
              <div className="kv">
                <span>Working days</span>
                <span>{settings.workingDays.length} / week</span>
              </div>
              <div className="kv">
                <span>EPF employee</span>
                <span>{settings.epfEmployeeRate}%</span>
              </div>
              <div className="kv">
                <span>EPF employer</span>
                <span>{settings.epfEmployerRate}%</span>
              </div>
              <div className="kv">
                <span>ETF employer</span>
                <span>{settings.etfRate}%</span>
              </div>
              <div className="divider" />
              <div className="kv">
                <span>Monthly workers</span>
                <span>{state.workers.filter((worker) => worker.payType === "Monthly").length}</span>
              </div>
              <div className="kv">
                <span>Daily workers</span>
                <span>{state.workers.filter((worker) => worker.payType === "Daily").length}</span>
              </div>
              <div className="kv">
                <span>EPF/ETF enabled</span>
                <span>
                  {state.workers.filter((worker) => worker.epfEnabled || worker.etfEnabled).length}{" "}
                  workers
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "modules" && (
        <div className="stack">
          <div className="grid cols-3">
            <div className="card span-2">
              <div className="card-head">
                <div>
                  <h3>Installed modules</h3>
                  <p>
                    Switch features on or off for this installation. Disabled modules disappear
                    from navigation, intake, the cashier and reports immediately.
                  </p>
                </div>
                <ToggleRight size={18} className="muted" />
              </div>
              <div className="card-body stack">
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="tiny muted" style={{ alignSelf: "center" }}>
                    Presets:
                  </span>
                  {MODULE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className="btn btn-secondary btn-sm"
                      onClick={() => applyPreset(preset.id)}
                      title={preset.caption}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <div className="grid cols-2" style={{ gap: 8 }}>
                  {FEATURE_FLAGS.map((flag) => (
                    <label key={flag.key} className="toggle-row">
                      <span>
                        <strong style={{ fontSize: 12.5 }}>{flag.label}</strong>
                        <div className="tiny muted">{flag.description}</div>
                        <div className="tiny muted" style={{ marginTop: 2 }}>
                          {flag.group} · {flag.key}
                        </div>
                      </span>
                      <input
                        type="checkbox"
                        checked={flags[flag.key] !== false}
                        onChange={(event) => {
                          updateFeatureFlag(flag.key, event.target.checked);
                          if (
                            flag.key === "enable_multi_sections" &&
                            !event.target.checked
                          ) {
                            setTab("modules");
                          }
                        }}
                      />
                    </label>
                  ))}
                </div>
                {!flags.enable_multi_sections && (
                  <Alert tone="info" title="Single-workflow mode is active">
                    Section selectors are hidden across intake, jobs, stores and attendance. Existing
                    section records are kept and return when multi-section mode is re-enabled.
                  </Alert>
                )}
              </div>
            </div>

            <div className="stack">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Stores topology</h3>
                    <p>Central store or one store per section.</p>
                  </div>
                  <Store size={16} className="muted" />
                </div>
                <div className="card-body stack">
                  <label className="toggle-row">
                    <span>
                      <strong>Central store</strong>
                      <div className="tiny muted">
                        One storekeeper team issues to every section.
                      </div>
                    </span>
                    <input
                      type="radio"
                      name="stores-topology"
                      checked={(settings.storesTopology ?? "Central") === "Central"}
                      onChange={() => setStoresTopology("Central" as StoresTopology)}
                    />
                  </label>
                  <label className="toggle-row">
                    <span>
                      <strong>Per-section stores</strong>
                      <div className="tiny muted">
                        Each section storekeeper sees only their own stock and requests.
                      </div>
                    </span>
                    <input
                      type="radio"
                      name="stores-topology"
                      checked={settings.storesTopology === "PerSection"}
                      onChange={() => setStoresTopology("PerSection" as StoresTopology)}
                    />
                  </label>
                  <div className="tiny muted">
                    Current: {settings.storesTopology ?? "Central"} ·{" "}
                    {state.sections.length} section{state.sections.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Section coverage</h3>
                    <p>Staff assigned across sections.</p>
                  </div>
                  <Users size={16} className="muted" />
                </div>
                <div className="card-body">
                  <div className="kv">
                    <span>Sections</span>
                    <span>{state.sections.filter((section) => section.active).length} active</span>
                  </div>
                  <div className="kv">
                    <span>Supervisors assigned</span>
                    <span>{state.users.filter((user) => (user.sectionIds ?? []).length > 0).length}</span>
                  </div>
                  <div className="kv">
                    <span>Workers assigned</span>
                    <span>
                      {state.workers.filter((worker) => (worker.sectionIds ?? []).length > 0).length}
                    </span>
                  </div>
                  <div className="kv">
                    <span>Jobs routed</span>
                    <span>
                      {state.jobCards.filter((job) => (job.sectionIds ?? []).length > 0).length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Workshop sections</h3>
                <p>
                  Owner-defined sections with supervisors, storekeepers and workers. Staff can belong
                  to several sections.
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => openSectionModal()}>
                <Plus />
                Add section
              </button>
            </div>
            {state.sections.length === 0 ? (
              <EmptyState
                icon={<Layers size={22} />}
                title="No sections yet"
                message="Create sections such as Mechanical, Electrical or Body & Paint. You can turn multi-section mode off at any time and the workshop runs as one floor."
                action={
                  <button className="btn btn-primary" onClick={() => openSectionModal()}>
                    <Plus />
                    Create first section
                  </button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th>Supervisors</th>
                      <th>Storekeepers</th>
                      <th>Workers</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.sections.map((section) => (
                      <tr key={section.id}>
                        <td>
                          <div className="row" style={{ gap: 7 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 3,
                                background: section.color,
                                flex: "0 0 10px",
                              }}
                            />
                            <div>
                              <div className="cell-main">{section.name}</div>
                              <div className="cell-sub">
                                {section.code}
                                {section.description ? ` · ${section.description}` : ""}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="tiny">
                          {section.supervisorIds
                            .map((id) => state.users.find((user) => user.id === id)?.name)
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td className="tiny">
                          {section.storekeeperIds
                            .map((id) => state.users.find((user) => user.id === id)?.name)
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td className="tiny">
                          {section.workerIds
                            .map(
                              (id) =>
                                state.workers.find((worker) => worker.id === id)?.fullName,
                            )
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td>
                          <span
                            className={`badge ${section.active ? "badge-green" : "badge-slate"}`}
                          >
                            {section.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                            <button
                              className="btn btn-soft btn-sm"
                              onClick={() => openSectionModal(section)}
                            >
                              <Pencil size={12} />
                              Edit
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Remove section"
                              onClick={() => deleteSection(section)}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "licence" && (
        <div className="grid cols-3">
          <div className="card span-2">
            <div className="card-head">
              <div>
                <h3>Licence & activation</h3>
                <p>30-day trial, then activate this installation with a RAVsoft licence key.</p>
              </div>
              <span
                className={`badge ${
                  licence.mode === "Active"
                    ? "badge-green"
                    : licence.mode === "Trial"
                      ? "badge-amber"
                      : licence.mode === "Demo"
                        ? "badge-slate"
                        : "badge-red"
                }`}
              >
                <KeyRound size={10} /> {licence.label}
              </span>
              {HAS_CLIENT_CUSTOMISATION && (
                <span
                  className="badge badge-blue"
                  title={CLIENT_BUILD.summary || "Client-specific branch"}
                >
                  <BadgeCheck size={10} /> Custom build · {CLIENT_BUILD.branch}
                </span>
              )}
            </div>
            <div className="card-body stack">
              <div className="grid cols-2" style={{ gap: 10 }}>
                <div>
                  <div className="kv">
                    <span>Trial started</span>
                    <span>{shortDate(settings.trialStartedAt || settings.createdAt)}</span>
                  </div>
                  <div className="kv">
                    <span>Trial length</span>
                    <span>{TRIAL_DAYS} days</span>
                  </div>
                  <div className="kv">
                    <span>Licence holder</span>
                    <span>{settings.licenseHolder || "Not set"}</span>
                  </div>
                  <div className="kv">
                    <span>Activated</span>
                    <span>
                      {settings.licenseActivatedAt
                        ? shortDate(settings.licenseActivatedAt)
                        : "Not activated"}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="kv">
                    <span>Licence expiry</span>
                    <span>
                      {settings.licenseExpiresAt
                        ? shortDate(settings.licenseExpiresAt)
                        : licence.mode === "Trial"
                          ? `${licence.daysLeft} days left`
                          : "—"}
                    </span>
                  </div>
                  <div className="kv">
                    <span>Status</span>
                    <span>{settings.licenseStatus ?? licence.mode}</span>
                  </div>
                  <div className="kv">
                    <span>Plan</span>
                    <span>{settings.licensePlan || "Not provisioned"}</span>
                  </div>
                  <div className="kv">
                    <span>Last online check</span>
                    <span>
                      {settings.lastLicenceSyncAt
                        ? shortDate(settings.lastLicenceSyncAt)
                        : "Never"}
                    </span>
                  </div>
                </div>
              </div>

              <div
                className="card"
                style={{ padding: 12, background: "var(--surface-2, #f8fafc)" }}
              >
                <div className="row-between wrap" style={{ gap: 10 }}>
                  <div>
                    <div className="label">Installation ID</div>
                    <div className="mono" style={{ fontSize: 11.5, letterSpacing: 0.3 }}>
                      {installationId}
                    </div>
                    <div className="tiny muted" style={{ marginTop: 3 }}>
                      Machine ID {machineId}
                    </div>
                  </div>
                  <CopyButton value={installationId} label="Copy installation ID" />
                </div>
                <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={syncLicenceNow}
                    disabled={syncingLicence}
                  >
                    <RefreshCcw className={syncingLicence ? "spin" : undefined} />
                    {syncingLicence ? "Checking…" : "Sync licence now"}
                  </button>
                  <span
                    className={`badge ${
                      import.meta.env.VITE_MASTER_LICENSE_URL ? "badge-green" : "badge-amber"
                    }`}
                  >
                    {import.meta.env.VITE_MASTER_LICENSE_URL ? (
                      <Wifi size={11} />
                    ) : (
                      <WifiOff size={11} />
                    )}
                    {import.meta.env.VITE_MASTER_LICENSE_URL
                      ? "Master server configured"
                      : "Local / offline mode"}
                  </span>
                </div>
                {syncCache ? (
                  <div className="tiny muted" style={{ marginTop: 8 }}>
                    Cached {syncCache.status} · {syncCache.plan} · last success{" "}
                    {shortDate(syncCache.lastSyncedAt)}. Offline operation is allowed for up to 7
                    days after the last successful check.
                  </div>
                ) : (
                  <div className="tiny muted" style={{ marginTop: 8 }}>
                    No remote licence cache yet. The workshop keeps working offline and polls the
                    master server outbound when configured.
                  </div>
                )}
              </div>

              <div className="divider" />

              <div className="form-grid">
                <Field label="Licence holder" hint="Workshop or company name on the licence.">
                  <input
                    className="input"
                    placeholder="e.g. Vezel Masters (Pvt) Ltd"
                    value={licenceHolder}
                    onChange={(event) => setLicenceHolder(event.target.value)}
                  />
                </Field>
                <Field
                  label="Licence key or offline token"
                  hint="TRQ-YYYYMMDD-XXXXXXXX or a signed TRQ2. token issued by the developer portal."
                >
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="TRQ-20271231-XXXXXXXX or TRQ2.…"
                    value={licenceKey}
                    onChange={(event) => setLicenceKey(event.target.value)}
                  />
                </Field>
              </div>

              <div className="row wrap">
                <button className="btn btn-primary" onClick={activateKey}>
                  <KeyRound />
                  Activate licence
                </button>
                <a className="btn btn-secondary" href={`mailto:${DEVELOPER.email}?subject=Torque ERP licence request&body=Machine ID: ${machineId}%0AInstallation ID: ${installationId}%0AWorkshop: ${settings.companyName}`}>
                  <Mail />
                  Request a licence
                </a>
              </div>

              <Alert tone="warn" icon={<ShieldCheck />}>
                Offline tokens are bound to installation ID <strong>{installationId}</strong> and
                carry the plan, expiry and module flags. They cannot be edited without breaking the
                signature. Online checks run outbound only, never inbound.
              </Alert>
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>How licensing works</h3>
                  <p>Offline activation for client workshops.</p>
                </div>
              </div>
              <div className="card-body stack">
                <div className="history-line">
                  <span>1 · Trial</span>
                  <span className="badge badge-amber">{TRIAL_DAYS} days</span>
                </div>
                <div className="history-line">
                  <span>2 · Send installation ID</span>
                  <span className="tiny">WS-LK-XXXXXXXX</span>
                </div>
                <div className="history-line">
                  <span>3 · Online poll</span>
                  <span className="tiny">Outbound licence check</span>
                </div>
                <div className="history-line">
                  <span>4 · Offline token</span>
                  <span className="badge badge-green">TRQ2 signed</span>
                </div>
                <div className="divider" />
                <div className="tiny muted">
                  Each client runs its own isolated server. The master portal can switch modules,
                  suspend, renew or extend a licence remotely. A workshop that stays offline keeps
                  working for {OFFLINE_GRACE_DAYS} days on the last successful check, then locks until it can sync
                  again.
                </div>
                <div className="tiny muted">
                  Clock rollback is detected and forces a fresh online check before operations resume.
                </div>
              </div>
            </div>

            <div className="alert alert-brand">
              <Sparkles />
              <div>
                <strong>RAVsoft client installations</strong>
                Each client receives its own licence key bound to its machine ID. Contact{" "}
                {DEVELOPER.email} · {DEVELOPER.phoneDisplay} for pricing and renewals.
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "integrations" && (
        <div className="stack">
          <div className="grid cols-3">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>WhatsApp</h3>
                  <p>Customer messages and invoices.</p>
                </div>
                <MessageCircle size={18} className="muted" />
              </div>
              <div className="card-body stack">
                <div className="row-between">
                  <span className="small">Gateway status</span>
                  <span
                    className={`badge ${
                      settings.whatsappMode === "WAHA"
                        ? settings.whatsappConnected
                          ? "badge-green"
                          : "badge-amber"
                        : "badge-slate"
                    }`}
                  >
                    {settings.whatsappMode === "WAHA"
                      ? settings.whatsappConnected
                        ? "Connected"
                        : "Paired, awaiting QR"
                      : "Not configured"}
                  </span>
                </div>
                <label className="field">
                  <span className="label">Mode</span>
                  <select
                    className="select"
                    value={settings.whatsappMode ?? "Disabled"}
                    onChange={(event) =>
                      updateSettings({
                        whatsappMode: event.target.value as WorkshopSettings["whatsappMode"],
                      })
                    }
                  >
                    <option value="Disabled">Disabled · wa.me links only</option>
                    <option value="WAHA">Self-hosted WAHA gateway</option>
                  </select>
                </label>
                <label className="field">
                  <span className="label">Company WhatsApp number</span>
                  <input
                    className="input"
                    value={settings.whatsappCompanyNumber ?? settings.phone}
                    onChange={(event) =>
                      updateSettings({ whatsappCompanyNumber: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span className="label">Gateway URL</span>
                  <input
                    className="input"
                    placeholder="https://wa.workshop.lk"
                    value={settings.whatsappGatewayUrl ?? ""}
                    onChange={(event) =>
                      updateSettings({
                        whatsappGatewayUrl: event.target.value,
                        whatsappMode: event.target.value.trim() ? "WAHA" : "Disabled",
                      })
                    }
                  />
                </label>
                <div className="grid cols-2" style={{ gap: 8 }}>
                  <label className="field">
                    <span className="label">Session</span>
                    <input
                      className="input"
                      value={settings.whatsappSession ?? "default"}
                      onChange={(event) =>
                        updateSettings({ whatsappSession: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="label">API key</span>
                    <input
                      className="input"
                      type="password"
                      value={settings.whatsappApiKey ?? ""}
                      onChange={(event) =>
                        updateSettings({ whatsappApiKey: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!settings.whatsappGatewayUrl?.trim()}
                    onClick={() => {
                      const base = (settings.whatsappGatewayUrl ?? "").replace(/\/$/, "");
                      const session = encodeURIComponent(
                        settings.whatsappSession?.trim() || "default",
                      );
                      window.open(
                        `${base}/api/${session}/auth/qr`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                      updateSettings({ whatsappLastQrAt: new Date().toISOString() });
                    }}
                  >
                    <QrCode size={13} />
                    Open pairing QR
                  </button>
                  <button
                    className="btn btn-soft btn-sm"
                    disabled={!settings.whatsappGatewayUrl?.trim()}
                    onClick={() => updateSettings({ whatsappConnected: true })}
                  >
                    <CheckCircle2 size={13} />
                    Mark connected
                  </button>
                </div>
                <label className="row" style={{ gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={settings.whatsappAutoSend !== false}
                    onChange={(event) =>
                      updateSettings({ whatsappAutoSend: event.target.checked })
                    }
                  />
                  <span className="tiny">Attach PDFs and send automatically after each event</span>
                </label>
                <label className="row" style={{ gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={settings.whatsappOwnerNotify !== false}
                    onChange={(event) =>
                      updateSettings({ whatsappOwnerNotify: event.target.checked })
                    }
                  />
                  <span className="tiny">Notify the owner on every new intake</span>
                </label>
                <div className="tiny muted">
                  Messages open in WhatsApp with the customer number and a pre-filled, branded
                  message. WAHA sends receipts, invoices and reminders automatically from the
                  company account. In demo mode every message is redirected to +94 75 575 6803.
                </div>
                <a
                  className="btn btn-secondary btn-sm"
                  href={waLink(
                    currentUser?.phone ?? settings.phone,
                    `Hello from ${settings.companyName}! This is a setup test message from Torque ERP.`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle />
                  Send test message
                </a>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Google Drive</h3>
                  <p>Damage photo folders per job.</p>
                </div>
                <Cloud size={18} className="muted" />
              </div>
              <div className="card-body stack">
                <div className="row-between">
                  <span className="small">Status</span>
                  <span className="badge badge-amber">Demo folder refs</span>
                </div>
                <div className="kv">
                  <span>Folder pattern</span>
                  <span>Workshop_Job_Cards</span>
                </div>
                <div className="kv">
                  <span>Job folder</span>
                  <span>Job_Card_1001</span>
                </div>
                <div className="kv">
                  <span>Linked PRO</span>
                  <span>{linkedPro?.gdriveEmail ?? "Not set"}</span>
                </div>
                <div className="tiny muted">
                  In the demo, compressed inspection photos are stored with the job card locally.
                  The production adapter creates a Drive folder per job and stores its file ID.
                </div>
                <span className="badge badge-slate">Requires OAuth setup</span>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Supabase backend</h3>
                  <p>Multi-tenant production database.</p>
                </div>
                <Database size={18} className="muted" />
              </div>
              <div className="card-body stack">
                <div className="row-between">
                  <span className="small">Status</span>
                  <span className="badge badge-slate">Local demo</span>
                </div>
                <div className="kv">
                  <span>Schema</span>
                  <span>supabase/migrations</span>
                </div>
                <div className="kv">
                  <span>Auth</span>
                  <span>Staff PIN → Supabase Auth</span>
                </div>
                <div className="kv">
                  <span>Isolation</span>
                  <span>Row-level security</span>
                </div>
                <div className="tiny muted">
                  The full SQL schema, storage buckets and policies are in the project. Add the
                  environment keys from <strong>.env.example</strong> and run the migration.
                </div>
                <span className="badge badge-amber">Setup documented</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Deployment & PWA</h3>
                <p>The same link works on Android, iPhone and desktop.</p>
              </div>
              <Plug size={18} className="muted" />
            </div>
            <div className="card-body">
              <div className="grid cols-3">
                <div>
                  <div className="small strong">Installable web app</div>
                  <div className="tiny muted">
                    A web manifest and service worker make the app installable from the browser.
                    No separate APK or App Store release is needed.
                  </div>
                </div>
                <div>
                  <div className="small strong">Responsive layouts</div>
                  <div className="tiny muted">
                    Sidebar navigation collapses into a mobile drawer, tables scroll horizontally,
                    and every form works on a phone screen.
                  </div>
                </div>
                <div>
                  <div className="small strong">Offline shell</div>
                  <div className="tiny muted">
                    The app shell is cached. Demo data already lives on the device; production
                    writes sync to Supabase when connectivity returns.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "data" && (
        <div className="stack">
          <div className="grid cols-4">
            <div className="card mini-stat">
              <div className="label">Backup size</div>
              <div className="value">{formatBytes(backupSize)}</div>
              <div className="meta">Includes photos</div>
            </div>
            <div className="card mini-stat">
              <div className="label">Job cards</div>
              <div className="value">{state.jobCards.length}</div>
              <div className="meta">{photoCount} photos</div>
            </div>
            <div className="card mini-stat">
              <div className="label">Ledger entries</div>
              <div className="value">{state.ledger.length}</div>
              <div className="meta">Revenue & settlements</div>
            </div>
            <div className="card mini-stat">
              <div className="label">Marketing records</div>
              <div className="value">{state.marketing.length}</div>
              <div className="meta">Retention queue</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Daily Google Drive backup</h3>
                <p>
                  Upload a complete JSON snapshot to Drive once a day through a secured webhook.
                </p>
              </div>
              <Cloud size={18} className="muted" />
            </div>
            <div className="card-body stack">
              <div className="form-grid">
                <Field label="Daily backup" full>
                  <select
                    className="select"
                    value={driveForm.enabled ? "on" : "off"}
                    onChange={(event) =>
                      setDriveForm((prev) => ({
                        ...prev,
                        enabled: event.target.value === "on",
                      }))
                    }
                  >
                    <option value="off">Disabled</option>
                    <option value="on">Enabled — upload once a day</option>
                  </select>
                </Field>
                <Field
                  label="Backup webhook URL"
                  full
                  hint="Google Apps Script web app or Supabase Edge Function that writes the JSON file to Drive."
                >
                  <input
                    className="input"
                    placeholder="https://script.google.com/macros/s/…/exec"
                    value={driveForm.url}
                    onChange={(event) =>
                      setDriveForm((prev) => ({ ...prev, url: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Secret key" hint="Shared secret checked by the webhook.">
                  <input
                    className="input"
                    type="password"
                    placeholder="Long random value"
                    value={driveForm.key}
                    onChange={(event) =>
                      setDriveForm((prev) => ({ ...prev, key: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Drive folder ID" hint="Optional — the webhook default folder is used when blank.">
                  <input
                    className="input"
                    placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz"
                    value={driveForm.folderId}
                    onChange={(event) =>
                      setDriveForm((prev) => ({ ...prev, folderId: event.target.value }))
                    }
                  />
                </Field>
                <Field
                  label="Earliest backup hour (0–23)"
                  hint="The app uploads once the local clock passes this hour, or at the next launch if it was closed."
                >
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={23}
                    value={driveForm.hour}
                    onChange={(event) =>
                      setDriveForm((prev) => ({ ...prev, hour: event.target.value }))
                    }
                  />
                </Field>
              </div>
              <div className="row wrap">
                <button className="btn btn-primary" onClick={saveDriveBackup}>
                  <Save />
                  Save backup settings
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={runDriveBackupNow}
                  disabled={driveBusy}
                >
                  {driveBusy ? <Loader2 className="spin" /> : <UploadCloud />}
                  Backup now
                </button>
              </div>
              <div className="card">
                <div className="card-body">
                  <div className="kv">
                    <span>Last successful upload</span>
                    <span>
                      {settings.lastDriveBackupAt
                        ? new Date(settings.lastDriveBackupAt).toLocaleString()
                        : "Never"}
                    </span>
                  </div>
                  <div className="kv">
                    <span>Last result</span>
                    <span>{settings.lastDriveBackupStatus ?? "Not run yet"}</span>
                  </div>
                  <div className="kv">
                    <span>Last file</span>
                    <span>{settings.lastDriveBackupFile ?? "—"}</span>
                  </div>
                </div>
              </div>
              {driveForm.enabled &&
                (!driveForm.url.trim() || !driveForm.key.trim()) && (
                  <Alert tone="warn" icon={<Lock />}>
                    Daily backup is enabled but the webhook URL or secret key is missing. Nothing
                    will upload until both are saved.
                  </Alert>
                )}
              <div className="tiny muted">
                The snapshot includes jobs, parts, bills, staff, ledger, settings and embedded
                photos. Configure the Apps Script or Edge Function as described in
                docs/GOOGLE_DRIVE_BACKUP.md. Keep the secret key in the webhook, not in shared
                documents.
              </div>
            </div>
          </div>

          <div className="grid cols-2">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Export & restore</h3>
                  <p>Keep a complete JSON snapshot of this workshop.</p>
                </div>
                <HardDrive size={18} className="muted" />
              </div>
              <div className="card-body stack">
                <div className="tiny muted">
                  The backup includes settings, users, workers, check-ins, jobs, parts, stock,
                  suppliers, credits, expenses, ledger and marketing records. Photos are embedded
                  as data URLs.
                </div>
                <div className="row wrap">
                  <button className="btn btn-primary" onClick={exportBackup}>
                    <Download />
                    Download backup
                  </button>
                  <label className="btn btn-secondary" htmlFor="backup-import">
                    <UploadCloud />
                    Import backup
                  </label>
                  <input
                    id="backup-import"
                    type="file"
                    accept="application/json,.json"
                    style={{ display: "none" }}
                    onChange={(event) => {
                      importBackup(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </div>
                <Alert tone="warn" icon={<Lock />}>
                  A backup contains staff PINs and the owner password because this is a local demo.
                  Store the file securely. Production uses Supabase Auth instead.
                </Alert>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Demo & reset</h3>
                  <p>Restore the showcase data or clear operations.</p>
                </div>
                <Database size={18} className="muted" />
              </div>
              <div className="card-body stack">
                <div className="kv">
                  <span>Storage key</span>
                  <span className="mono" style={{ fontSize: 10.5 }}>{STORAGE_KEY}</span>
                </div>
                <div className="kv">
                  <span>Mode</span>
                  <span>{settings.demoMode ? "Demo workshop" : "Custom workshop"}</span>
                </div>
                <div className="divider" />
                <button className="btn btn-secondary" onClick={() => setConfirmAction("demo")}>
                  <RefreshCcw />
                  Restore demo workshop
                </button>
                <button className="btn btn-danger-soft" onClick={() => setConfirmAction("reset")}>
                  <Trash2 />
                  Clear operational data
                </button>
                <div className="tiny muted">
                  The reset clears check-ins, jobs, tasks, parts, credits, expenses, ledger,
                  marketing and notifications. Staff, workers, inventory, suppliers and settings
                  are kept.
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Production migration path</h3>
                <p>From this local demo to a live multi-workshop SaaS.</p>
              </div>
              <Building2 size={18} className="muted" />
            </div>
            <div className="card-body">
              <div className="timeline">
                {[
                  {
                    title: "1 · Provision Supabase",
                    text: "Create the project, run the schema migration and deploy storage buckets for job photos and logos.",
                  },
                  {
                    title: "2 · Connect authentication",
                    text: "Replace the demo PIN login with Supabase Auth. Staff PINs become secure, hashed credentials and the owner gets MFA.",
                  },
                  {
                    title: "3 · Connect Google Drive",
                    text: "Create a service account or OAuth client. Each accepted job gets a Drive folder named by job number.",
                  },
                  {
                    title: "4 · Deploy the PWA",
                    text: "Publish the built app to Vercel or Netlify, point each workshop's QR slug at the live domain and onboard the team.",
                  },
                ].map((step) => (
                  <div className="timeline-item" key={step.title}>
                    <div className="timeline-date">{step.title}</div>
                    <div className="small">{step.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "about" && (
        <div className="grid cols-2">
          <div className="card">
            <div className="card-head">
              <div>
                <h3>About {DEVELOPER.product}</h3>
                <p>Version, developer and ownership information.</p>
              </div>
              <Sparkles size={18} className="muted" />
            </div>
            <div className="card-body stack">
              <div className="kv">
                <span>Product</span>
                <span>
                  {DEVELOPER.product} · v{DEVELOPER.version}
                </span>
              </div>
              <div className="kv">
                <span>Developed by</span>
                <span>{DEVELOPER.name}</span>
              </div>
              <div className="kv">
                <span>Copyright</span>
                <span>{COPYRIGHT}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Support &amp; licensing</h3>
                <p>Deployment help, customisation and permission requests.</p>
              </div>
              <ShieldCheck size={18} className="muted" />
            </div>
            <div className="card-body stack">
              <p className="small muted" style={{ margin: 0 }}>
                {DEVELOPER.product} is developed and maintained by {DEVELOPER.name}. Contact the
                developer for production setup, Supabase integration, Google Drive photos, WhatsApp
                messaging or workshop-specific customisations.
              </p>
              <div className="row wrap">
                <a className="btn btn-primary btn-sm" href={`mailto:${DEVELOPER.email}`}>
                  <Mail size={14} />
                  Email support
                </a>
                <a className="btn btn-secondary btn-sm" href={`tel:${DEVELOPER.phone}`}>
                  <Phone size={14} />
                  Call {DEVELOPER.phoneDisplay}
                </a>
              </div>
              <Alert tone="info" title="Usage & ownership">
                {DEVELOPER.product} and its source code are the property of {DEVELOPER.name}. They
                may not be copied, redistributed or resold without written permission.
              </Alert>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={insurerOpen}
        onClose={() => setInsurerOpen(false)}
        title={insurerEditingId ? "Edit insurance company" : "Add insurance company"}
        subtitle="Contact details used on claims, bills and release orders."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setInsurerOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveInsurer}>
              <Save />
              {insurerEditingId ? "Update insurer" : "Add insurer"}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Company name" required full>
              <input
                className="input"
                placeholder="e.g. Ceylinco General Insurance"
                value={insurerForm.name}
                onChange={(event) =>
                  setInsurerForm({ ...insurerForm, name: event.target.value })
                }
              />
            </Field>
            <Field label="Hotline">
              <input
                className="input"
                placeholder="+94 11 2 500 500"
                value={insurerForm.hotline}
                onChange={(event) =>
                  setInsurerForm({ ...insurerForm, hotline: event.target.value })
                }
              />
            </Field>
            <Field label="Email">
              <input
                className="input"
                type="email"
                placeholder="claims@insurer.lk"
                value={insurerForm.email}
                onChange={(event) =>
                  setInsurerForm({ ...insurerForm, email: event.target.value })
                }
              />
            </Field>
            <Field label="Company TIN" hint="Printed in the purchaser TIN block on insurer bills.">
              <input
                className="input"
                placeholder="123456789-7000"
                value={insurerForm.tinNumber}
                onChange={(event) =>
                  setInsurerForm({ ...insurerForm, tinNumber: event.target.value })
                }
              />
            </Field>
            <Field label="Address" full>
              <input
                className="input"
                placeholder="No. 1, Union Place, Colombo 02"
                value={insurerForm.address}
                onChange={(event) =>
                  setInsurerForm({ ...insurerForm, address: event.target.value })
                }
              />
            </Field>
            <Field label="Website" full>
              <input
                className="input"
                placeholder="https://…"
                value={insurerForm.website}
                onChange={(event) =>
                  setInsurerForm({ ...insurerForm, website: event.target.value })
                }
              />
            </Field>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={insurerForm.active}
              onChange={(event) =>
                setInsurerForm({ ...insurerForm, active: event.target.checked })
              }
            />
            Active — show in the PRO insurance intake list
          </label>
          <Alert tone="info">
            Inactive insurers stay on historical claims and bills but are hidden from new PRO
            intake forms. Set the TIN so insurance tax invoices carry the correct purchaser
            details.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={sectionOpen}
        onClose={() => setSectionOpen(false)}
        title={sectionEditingId ? "Edit workshop section" : "Add workshop section"}
        subtitle="Sections scope supervisors, stores, tasks, attendance and profitability."
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setSectionOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveSection}>
              <Save />
              {sectionEditingId ? "Save section" : "Create section"}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Section name" required>
              <input
                className="input"
                placeholder="Mechanical"
                value={sectionForm.name}
                onChange={(event) =>
                  setSectionForm({ ...sectionForm, name: event.target.value })
                }
              />
            </Field>
            <Field label="Code" required hint="Short code used on job cards and reports.">
              <input
                className="input"
                placeholder="MECH"
                value={sectionForm.code}
                onChange={(event) =>
                  setSectionForm({ ...sectionForm, code: event.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="Colour">
              <div className="row" style={{ gap: 8 }}>
                <input
                  type="color"
                  value={sectionForm.color}
                  onChange={(event) =>
                    setSectionForm({ ...sectionForm, color: event.target.value })
                  }
                  style={{ width: 42, height: 36, border: 0, background: "none" }}
                />
                <input
                  className="input"
                  value={sectionForm.color}
                  onChange={(event) =>
                    setSectionForm({ ...sectionForm, color: event.target.value })
                  }
                />
              </div>
            </Field>
            <Field label="Description" full>
              <input
                className="input"
                placeholder="Engines, suspensions, transmissions"
                value={sectionForm.description}
                onChange={(event) =>
                  setSectionForm({ ...sectionForm, description: event.target.value })
                }
              />
            </Field>
          </div>

          <label className="toggle-row">
            <span>
              <strong>Active section</strong>
              <div className="tiny muted">
                Inactive sections stay on old records but are hidden from new intake and routing.
              </div>
            </span>
            <input
              type="checkbox"
              checked={sectionForm.active}
              onChange={(event) =>
                setSectionForm({ ...sectionForm, active: event.target.checked })
              }
            />
          </label>

          <div className="divider" />
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              Section supervisors
            </div>
            <div className="grid cols-2" style={{ gap: 6 }}>
              {supervisors.map((user) => (
                <label key={user.id} className="toggle-row" style={{ padding: "7px 9px" }}>
                  <span className="small">
                    <strong>{user.name}</strong>
                    <div className="tiny muted">{user.departments.join(" / ")}</div>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionForm.supervisorIds.includes(user.id)}
                    onChange={() => toggleSectionMember("supervisorIds", user.id)}
                  />
                </label>
              ))}
              {supervisors.length === 0 && (
                <div className="tiny muted">No users have the Supervisor department.</div>
              )}
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              Section storekeepers
            </div>
            <div className="grid cols-2" style={{ gap: 6 }}>
              {storekeepers.map((user) => (
                <label key={user.id} className="toggle-row" style={{ padding: "7px 9px" }}>
                  <span className="small">
                    <strong>{user.name}</strong>
                    <div className="tiny muted">{user.departments.join(" / ")}</div>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionForm.storekeeperIds.includes(user.id)}
                    onChange={() => toggleSectionMember("storekeeperIds", user.id)}
                  />
                </label>
              ))}
              {storekeepers.length === 0 && (
                <div className="tiny muted">No users have the Stores department.</div>
              )}
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              Workers in this section
            </div>
            <div className="grid cols-2" style={{ gap: 6 }}>
              {activeWorkers.map((worker) => (
                <label key={worker.id} className="toggle-row" style={{ padding: "7px 9px" }}>
                  <span className="small">
                    <strong>{worker.fullName}</strong>
                    <div className="tiny muted">{worker.payType} · {worker.phone}</div>
                  </span>
                  <input
                    type="checkbox"
                    checked={sectionForm.workerIds.includes(worker.id)}
                    onChange={() => toggleSectionMember("workerIds", worker.id)}
                  />
                </label>
              ))}
              {activeWorkers.length === 0 && (
                <div className="tiny muted">No active workers yet.</div>
              )}
            </div>
          </div>

          <Alert tone="info">
            A supervisor, storekeeper or worker can belong to several sections. Their task lists,
            attendance view and store requests follow these assignments.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        title={confirmAction === "demo" ? "Restore the demo workshop?" : "Clear operational data?"}
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmAction(null)}>
              Cancel
            </button>
            <button
              className={confirmAction === "demo" ? "btn btn-primary" : "btn btn-danger"}
              onClick={runConfirmedAction}
            >
              {confirmAction === "demo" ? <RefreshCcw /> : <Trash2 />}
              {confirmAction === "demo" ? "Restore demo" : "Clear data"}
            </button>
          </>
        }
      >
        {confirmAction === "demo" ? (
          <Alert tone="warn" title="This replaces the current workshop data">
            Vezel Masters Kandy demo data will be loaded into this browser. Any jobs, staff or
            settings you added will be replaced. Download a backup first if you need to keep them.
          </Alert>
        ) : (
          <Alert tone="danger" title="Operational records will be removed">
            This clears all jobs, check-ins, parts, credits, expenses and the revenue ledger. Staff
            accounts, workers, inventory, suppliers and settings remain. This cannot be undone.
          </Alert>
        )}
      </Modal>
    </div>
  );
}
