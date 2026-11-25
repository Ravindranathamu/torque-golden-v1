import type { FeatureFlagKey, FeatureFlags, WorkshopSettings } from "../types";
import { TRIAL_DAYS } from "./licenceConfig";

export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  label: string;
  description: string;
  group: "Operations" | "Finance" | "People" | "Communication";
  defaultEnabled: boolean;
}

export const FEATURE_FLAGS: FeatureFlagDefinition[] = [
  {
    key: "enable_multi_sections",
    label: "Multi-section workshop",
    description:
      "Owner-defined sections, section supervisors, section stores and section profitability. Turn off for a single unified floor.",
    group: "Operations",
    defaultEnabled: false,
  },
  {
    key: "enable_paint_module",
    label: "Body & paint",
    description: "Paint and body section tools, paint consumables and paint job intake.",
    group: "Operations",
    defaultEnabled: true,
  },
  {
    key: "enable_insurance_module",
    label: "Insurance claims",
    description: "Insurer directory, claim workflow, assessor approvals and insurance documents.",
    group: "Operations",
    defaultEnabled: true,
  },
  {
    key: "enable_estimates_module",
    label: "Estimates",
    description: "Customer estimates, initial approval and supplementary revisions.",
    group: "Operations",
    defaultEnabled: true,
  },
  {
    key: "enable_vat_invoicing",
    label: "VAT & IRD invoicing",
    description: "Tax invoices with VAT, TIN and IRD-compliant A4 documents.",
    group: "Finance",
    defaultEnabled: true,
  },
  {
    key: "enable_advanced_accounting",
    label: "Advanced accounting",
    description: "Bank accounts, cheque register, loans, supplier credits and P&L reports.",
    group: "Finance",
    defaultEnabled: true,
  },
  {
    key: "enable_payroll_epf_etf",
    label: "Payroll (EPF / ETF)",
    description: "Monthly payroll, EPF/ETF contributions and payslips.",
    group: "People",
    defaultEnabled: true,
  },
  {
    key: "enable_daily_wages",
    label: "Daily wages",
    description: "Daily wage attendance and payout receipts.",
    group: "People",
    defaultEnabled: true,
  },
  {
    key: "enable_driver_commissions",
    label: "Driver commissions",
    description: "Referral driver commission captured at intake and hidden from customer documents.",
    group: "People",
    defaultEnabled: true,
  },
  {
    key: "enable_petty_cash",
    label: "Petty cash",
    description: "Petty cash float, vouchers and expense photos.",
    group: "Finance",
    defaultEnabled: true,
  },
  {
    key: "enable_voice_notifications",
    label: "Voice notifications",
    description: "Spoken alerts on supported devices for job, stock and payment events.",
    group: "Communication",
    defaultEnabled: true,
  },
];

export function defaultFeatureFlags(): FeatureFlags {
  return FEATURE_FLAGS.reduce((flags, flag) => {
    flags[flag.key] = flag.defaultEnabled;
    return flags;
  }, {} as FeatureFlags);
}

/** Used by demo data and full-suite provisioned installations. */
export function allFeatureFlags(enabled = true): FeatureFlags {
  return FEATURE_FLAGS.reduce((flags, flag) => {
    flags[flag.key] = enabled;
    return flags;
  }, {} as FeatureFlags);
}

/**
 * During the 30-day trial every module is available, regardless of the flags
 * stored on the installation. Once the licence is Active the stored flags are
 * authoritative, so only the modules bought on the order stay unlocked.
 */
function trialGrantsFullAccess(settings: WorkshopSettings): boolean {
  if (settings.demoMode) return true;
  if (settings.licenceClockRollback) return false;
  if (settings.licenseStatus === "Suspended" || settings.licenseStatus === "Expired") {
    return false;
  }
  if (settings.licenseStatus === "Trial") {
    if (settings.licenseExpiresAt) {
      const end = new Date(settings.licenseExpiresAt).getTime();
      return Number.isFinite(end) && end > Date.now();
    }
    const trialStart = new Date(
      settings.trialStartedAt || settings.createdAt || 0,
    ).getTime();
    if (!Number.isFinite(trialStart) || trialStart <= 0) return false;
    return Date.now() - trialStart < TRIAL_DAYS * 86400000;
  }
  if (settings.licenseStatus === "Active" || settings.licenseExpiresAt) return false;
  const start = new Date(settings.trialStartedAt || settings.createdAt || 0).getTime();
  if (!Number.isFinite(start) || start <= 0) return false;
  return Date.now() - start < TRIAL_DAYS * 86400000;
}

export function featureFlagsFor(settings: WorkshopSettings): FeatureFlags {
  if (trialGrantsFullAccess(settings)) return allFeatureFlags(true);
  return {
    ...defaultFeatureFlags(),
    ...(settings.featureFlags ?? {}),
  };
}

export function featureEnabled(
  settings: WorkshopSettings,
  key: FeatureFlagKey,
): boolean {
  return featureFlagsFor(settings)[key] !== false;
}

export const MODULE_LABELS: Record<FeatureFlagKey, string> = FEATURE_FLAGS.reduce(
  (labels, flag) => {
    labels[flag.key] = flag.label;
    return labels;
  },
  {} as Record<FeatureFlagKey, string>,
);

/** Installation presets used by setup and the developer portal. */
export const MODULE_PRESETS: {
  id: string;
  name: string;
  caption: string;
  flags: FeatureFlagKey[];
}[] = [
  {
    id: "garage-lite",
    name: "Small garage",
    caption: "Job cards, estimates, basic stock and credit — no ledger, payroll, insurance or sections.",
    flags: ["enable_estimates_module", "enable_voice_notifications"],
  },
  {
    id: "quick-lube",
    name: "Quick service bay",
    caption: "Single-floor service workshop with estimates and thermal invoices.",
    flags: [
      "enable_estimates_module",
      "enable_vat_invoicing",
      "enable_advanced_accounting",
      "enable_petty_cash",
      "enable_voice_notifications",
    ],
  },
  {
    id: "scanplan",
    name: "ScanPlan attendance",
    caption: "QR check-in, GPS geofence, department shifts, approvals and Excel reports.",
    flags: FEATURE_FLAGS.map((flag) => flag.key),
  },
  {
    id: "taw-fleet",
    name: "TAW vehicle carrier",
    caption: "Owner/driver logins, dispatch, automatic GPS, WAHA, partner handover and IRD billing.",
    flags: [
      "enable_vat_invoicing",
      "enable_advanced_accounting",
      "enable_payroll_epf_etf",
      "enable_driver_commissions",
      "enable_petty_cash",
      "enable_voice_notifications",
    ],
  },
  {
    id: "full-workshop",
    name: "Full multi-section workshop",
    caption: "Sections, paint, insurance, payroll and complete accounts.",
    flags: FEATURE_FLAGS.map((flag) => flag.key),
  },
  {
    id: "insurance-bay",
    name: "Insurance & body shop",
    caption: "Multi-section body and paint operation with insurance claims.",
    flags: [
      "enable_multi_sections",
      "enable_paint_module",
      "enable_insurance_module",
      "enable_estimates_module",
      "enable_vat_invoicing",
      "enable_petty_cash",
      "enable_voice_notifications",
    ],
  },
];
