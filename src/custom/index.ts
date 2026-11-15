/**
 * Client-specific overrides.
 *
 * This folder is the only place where a per-client branch should diverge from
 * the RAVsoft core. Keep changes small, documented and isolated here so core
 * updates can always merge from `main` without touching client code.
 *
 * Branch convention:
 *   main                     RAVsoft core, shared by every installation
 *   client/<installation-id> one branch per client customisation
 *
 * The developer portal records the branch, custom-build badge and a short
 * customisation summary for support and update planning.
 */

export interface ClientCustomisation {
  /** Added to the notes block of every A4 tax invoice and thermal receipt. */
  invoiceNote?: string;
  /** Added to the notes block of every estimate PDF. */
  estimateNote?: string;
  /** Optional customer-facing message shown under the login card. */
  loginMessage?: string;
  /** Short support summary. Also exposed to the RAVsoft portal. */
  summary?: string;
}

export const CLIENT_BUILD = {
  /** Must match the Git branch recorded in the RAVsoft portal. */
  branch: "main",
  /** Leave blank on a core build; set it on a client branch. */
  summary: "",
};

export const CLIENT_CUSTOMISATION: ClientCustomisation = {
  // Example:
  // invoiceNote: "Goods once sold are not returnable. Warranty is handled by the supplier.",
  // estimateNote: "Estimate valid for 14 days. Parts prices may change without notice.",
  // loginMessage: "Welcome to our workshop. Call the hotline for urgent breakdowns.",
};

export const HAS_CLIENT_CUSTOMISATION =
  CLIENT_BUILD.branch.trim() !== "main" ||
  Boolean(CLIENT_BUILD.summary.trim()) ||
  Object.values(CLIENT_CUSTOMISATION).some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );