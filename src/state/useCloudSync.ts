import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { AppState, CheckIn } from "../types";
import {
  applyCloudRow,
  checkInNotification,
  checkInNotificationId,
  diffRows,
  ensureCloudState,
  loadCloudContext,
  mergePendingRows,
  pushCloudRecords,
  readCloudQueue,
  recordKey,
  stateToRows,
  subscribeCloudRecords,
  writeCloudQueue,
  type AppRecordRow,
  type CloudContext,
} from "../lib/cloudStore";
import { supabase } from "../lib/supabase";

export type CloudStatus =
  | "disabled"
  | "loading"
  | "signed-out"
  | "unprovisioned"
  | "ready"
  | "offline"
  | "error";

export interface CloudActionResult {
  ok: boolean;
  message?: string;
}

export interface CloudSyncApi {
  status: CloudStatus;
  message: string;
  email: string | null;
  signIn: (email: string, password: string) => Promise<CloudActionResult>;
  signOut: () => Promise<void>;
  retry: () => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Cloud sync failed.";
}

export function useCloudSync(
  state: AppState,
  setState: Dispatch<SetStateAction<AppState>>,
): CloudSyncApi {
  const [status, setStatus] = useState<CloudStatus>(supabase ? "loading" : "disabled");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const setStateRef = useRef(setState);
  setStateRef.current = setState;

  const baselineRef = useRef<Map<string, AppRecordRow>>(new Map());
  const pendingRef = useRef<AppRecordRow[]>(readCloudQueue());
  const contextRef = useRef<CloudContext | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const flushingRef = useRef(false);
  const mountedRef = useRef(true);
  const loadGenerationRef = useRef(0);

  const flushRef = useRef<() => Promise<void>>(async () => {});

  const flush = useCallback(async () => {
    if (!supabase || flushingRef.current) return;
    const context = contextRef.current;
    if (!context || !pendingRef.current.length) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      setMessage("Offline — changes are queued and will sync when the connection returns.");
      return;
    }

    flushingRef.current = true;
    const batch = pendingRef.current.slice(0, 400);
    const batchKeys = new Set(batch.map((row) => recordKey(row)));

    try {
      await pushCloudRecords(context.workshop.id, batch);
      if (!mountedRef.current) return;
      pendingRef.current = pendingRef.current.filter(
        (row) => !batchKeys.has(recordKey(row)),
      );
      writeCloudQueue(pendingRef.current);
      for (const row of batch) {
        baselineRef.current.set(recordKey(row), row);
      }
      setStatus("ready");
      setMessage(
        pendingRef.current.length
          ? `Syncing ${pendingRef.current.length} queued change${pendingRef.current.length === 1 ? "" : "s"}…`
          : "Cloud sync connected. All changes saved.",
      );
    } catch (error) {
      if (!mountedRef.current) return;
      setStatus("offline");
      setMessage(
        `Cloud sync paused — changes stay on this device until the server is reachable. ${errorMessage(error)}`,
      );
    } finally {
      flushingRef.current = false;
      if (mountedRef.current && pendingRef.current.length) {
        if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = window.setTimeout(() => {
          void flushRef.current();
        }, 700);
      }
    }
  }, []);

  flushRef.current = flush;

  const load = useCallback(
    async (showLoading: boolean) => {
      if (!supabase) return;
      const generation = ++loadGenerationRef.current;
      if (showLoading) {
        setStatus("loading");
        setMessage("Connecting to the workshop server…");
      }

      try {
        const context = await loadCloudContext();
        if (!mountedRef.current || generation !== loadGenerationRef.current) return;
        if (!context) {
          contextRef.current = null;
          setEmail(null);
          setStatus("signed-out");
          setMessage("");
          setStateRef.current((previous) => ({ ...previous, currentUserId: null }));
          return;
        }

        const bundle = await ensureCloudState(context);
        if (!mountedRef.current || generation !== loadGenerationRef.current) return;

        let loaded = bundle.state;
        for (const row of pendingRef.current) {
          loaded = applyCloudRow(loaded, row);
        }
        loaded.currentUserId = context.profile.id;

        contextRef.current = context;
        baselineRef.current = new Map(
          bundle.records.map((row) => [recordKey(row), row]),
        );
        setEmail(context.session.user.email ?? null);
        setStateRef.current(loaded);
        setStatus("ready");
        setMessage(
          bundle.seeded
            ? "Workshop created in Supabase. Invite your team and start working."
            : pendingRef.current.length
              ? "Cloud sync connected — sending queued changes."
              : "Cloud sync connected.",
        );

        unsubscribeRef.current?.();
        unsubscribeRef.current = subscribeCloudRecords(context.workshop.id, (change) => {
          const key = `${change.collection}\u0000${change.recordId}`;
          const pending = pendingRef.current.some((row) => recordKey(row) === key);
          if (change.row) {
            baselineRef.current.set(recordKey(change.row), change.row);
          }
          if (pending || change.deleted) return;
          if (change.row?.updated_by === context.session.user.id) return;
          if (!change.row) return;
          setStateRef.current((previous) => {
            const checkIn = change.fromCheckInsTable
              ? (change.row?.payload as CheckIn | undefined)
              : undefined;
            const notificationId = checkIn ? checkInNotificationId(checkIn.id) : null;
            const withNotification = (state: AppState): AppState => {
              if (!checkIn || checkIn.status !== "Awaiting Approval" || notificationId === null) {
                return state;
              }
              if (state.notifications.some((entry) => entry.id === notificationId)) return state;
              return {
                ...state,
                notifications: [checkInNotification(checkIn), ...state.notifications].slice(
                  0,
                  120,
                ),
              };
            };

            // The check_ins subscription only reports new public submissions.
            // Once a check-in exists in app_records, accept/reject must win.
            if (
              change.fromCheckInsTable &&
              previous.checkIns.some((entry) => entry.id === change.recordId)
            ) {
              return withNotification(previous);
            }
            return withNotification(applyCloudRow(previous, change.row!));
          });
        });

        if (pendingRef.current.length) {
          void flushRef.current();
        }
      } catch (error) {
        if (!mountedRef.current || generation !== loadGenerationRef.current) return;
        const detail = errorMessage(error);
        if (/no workshop profile|missing workshop/i.test(detail)) {
          setStatus("unprovisioned");
          setMessage(detail);
        } else {
          setStatus("offline");
          setMessage(
            `The workshop server is unreachable. This device keeps working from its local cache. ${detail}`,
          );
        }
      }
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!supabase) {
      setStatus("disabled");
      return;
    }

    void load(true);

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (!mountedRef.current) return;
      if (event === "SIGNED_OUT") {
        loadGenerationRef.current += 1;
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        contextRef.current = null;
        baselineRef.current.clear();
        pendingRef.current = [];
        writeCloudQueue([]);
        setEmail(null);
        setStatus("signed-out");
        setMessage("");
        setStateRef.current((previous) => ({ ...previous, currentUserId: null }));
        return;
      }
      if (event === "SIGNED_IN" && !contextRef.current) {
        void load(false);
      }
    });

    const onOnline = () => {
      if (contextRef.current) void flushRef.current();
      else void load(false);
    };
    window.addEventListener("online", onOnline);

    return () => {
      mountedRef.current = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    };
  }, [flush, load]);

  useEffect(() => {
    if ((status !== "ready" && status !== "offline") || !contextRef.current) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      if (!contextRef.current) return;
      const nextRows = stateToRows(stateRef.current);
      const previousRows = [...baselineRef.current.values()];
      const diff = diffRows(previousRows, nextRows);
      const changed = [...diff.upserts, ...diff.deletes];
      if (!changed.length) return;
      pendingRef.current = mergePendingRows(pendingRef.current, changed);
      writeCloudQueue(pendingRef.current);
      void flushRef.current();
    }, 1200);

    return () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    };
  }, [state, status]);

  const signIn = useCallback(
    async (emailAddress: string, password: string): Promise<CloudActionResult> => {
      if (!supabase) {
        return { ok: false, message: "Cloud sync is not configured for this build." };
      }
      setStatus("loading");
      setMessage("Signing in…");
      const { error } = await supabase.auth.signInWithPassword({
        email: emailAddress.trim(),
        password,
      });
      if (error) {
        setStatus("signed-out");
        setMessage("");
        return { ok: false, message: error.message };
      }
      await load(false);
      return { ok: true };
    },
    [load],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    contextRef.current = null;
    baselineRef.current.clear();
    pendingRef.current = [];
    writeCloudQueue([]);
    setEmail(null);
    setStatus("signed-out");
    setMessage("");
    setStateRef.current((previous) => ({ ...previous, currentUserId: null }));
  }, []);

  const retry = useCallback(() => {
    void load(true);
    void flushRef.current();
  }, [load]);

  return { status, message, email, signIn, signOut, retry };
}