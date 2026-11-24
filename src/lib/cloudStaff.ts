import { createClient } from "@supabase/supabase-js";
import type { Department } from "../types";
import { supabase } from "./supabase";

export interface CreateCloudStaffInput {
  fullName: string;
  username: string;
  email: string;
  password: string;
  phone: string;
  departments: Department[];
  baseSalary: number;
  commissionRate: number;
  gdriveEmail?: string;
  active: boolean;
}

export type CreateCloudStaffResult =
  | { ok: true; id: string; needsEmailConfirmation: boolean }
  | { ok: false; message: string };

function detail(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Unknown server error.";
}

/**
 * Create a staff sign-in on the client's own Supabase project, then attach the
 * workshop profile with the owner's authenticated session.
 *
 * A throwaway Supabase client is used for sign-up so that a successful sign-up
 * never replaces the owner's session in the main client.
 */
export async function createCloudStaffAccount(
  input: CreateCloudStaffInput,
): Promise<CreateCloudStaffResult> {
  if (!supabase) {
    return { ok: false, message: "Cloud workshop is not connected." };
  }

  const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anonKey) {
    return { ok: false, message: "Workshop server details are missing from this build." };
  }

  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Enter a valid staff email address." };
  }
  if (input.password.length < 8) {
    return { ok: false, message: "Use a password of at least 8 characters." };
  }

  const signupClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const { data: signup, error: signupError } = await signupClient.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          full_name: input.fullName.trim(),
          username,
          role: "staff",
        },
      },
    });

    if (signupError) {
      if (/already registered|already exists|user.*registered|email.*taken/i.test(signupError.message)) {
        return {
          ok: false,
          message:
            "That email already has a sign-in on this workshop server. Use another email or ask RAVBsoft to reset the existing password.",
        };
      }
      return { ok: false, message: signupError.message };
    }

    const userId = signup.user?.id;
    if (!userId) {
      return {
        ok: false,
        message: "The workshop server did not return a new account. Try again.",
      };
    }

    const { data: workshopId, error: workshopError } = await supabase.rpc("current_workshop_id");
    if (workshopError || !workshopId) {
      return {
        ok: false,
        message: workshopError?.message ?? "Could not identify the current workshop.",
      };
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      workshop_id: workshopId,
      full_name: input.fullName.trim(),
      username,
      phone: input.phone.trim(),
      email,
      is_owner: false,
      departments: input.departments,
      base_salary: input.baseSalary,
      commission_rate: input.commissionRate,
      gdrive_email: input.gdriveEmail?.trim() || null,
      active: input.active,
    });

    if (profileError) {
      return {
        ok: false,
        message:
          "The sign-in was created but the staff profile could not be saved: " +
          profileError.message +
          ". Ask RAVBsoft to finish this account before trying again.",
      };
    }

    return {
      ok: true,
      id: userId,
      needsEmailConfirmation: !signup.session,
    };
  } catch (error) {
    return { ok: false, message: detail(error) };
  } finally {
    try {
      await signupClient.auth.signOut();
    } catch {
      // Throwaway client; nothing to clean up beyond discarding it.
    }
  }
}
