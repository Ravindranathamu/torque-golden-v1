/**
 * Shared licence timings.
 *
 * Kept in a tiny module so the feature-flag resolver can know the trial length
 * without importing the licence module (which itself imports feature flags).
 */
export const TRIAL_DAYS = 30;
export const OFFLINE_GRACE_DAYS = 7;
