import { useCallback, useEffect, useRef, useState } from "react";
import type { UserProfile } from "../models/types";
import { requestAccessToken, clearToken } from "./tokenClient";

const PROFILE_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const STORAGE_KEY = "kboard:profile";

export interface AuthState {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => {
    // Restore cached profile for instant UI on refresh.
    if (typeof window === "undefined") return { profile: null, loading: false, error: null };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { profile: JSON.parse(raw) as UserProfile, loading: false, error: null };
    } catch {
      // ignore
    }
    return { profile: null, loading: false, error: null };
  });
  const inFlight = useRef(false);

  const login = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      await requestAccessToken("consent");
      const token = await requestAccessToken("");
      const res = await fetch(PROFILE_ENDPOINT, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Profile fetch failed (${res.status})`);
      const data = (await res.json()) as {
        sub: string;
        name?: string;
        email?: string;
        picture?: string;
      };
      const profile: UserProfile = {
        id: data.sub,
        name: data.name ?? "User",
        email: data.email ?? "",
        picture: data.picture,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setState({ profile, loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      setState({ profile: null, loading: false, error: message });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem(STORAGE_KEY);
    setState({ profile: null, loading: false, error: null });
  }, []);

  // Silent re-auth on mount if we have a cached profile (best effort).
  useEffect(() => {
    if (!state.profile) return;
    requestAccessToken("").catch(() => {
      // Non-fatal: user will be prompted on next interaction.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, login, logout };
}
