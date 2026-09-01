import { useCallback, useEffect, useRef, useState } from "react";
import type { UserProfile } from "../models/types";
import { requestAccessToken, clearToken, getCurrentToken } from "./tokenClient";

const PROFILE_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const STORAGE_KEY = "kboard:profile";

export interface AuthState {
  profile: UserProfile | null;
  loading: boolean;
  /** True after we've attempted silent re-auth on mount. Use this to
   *  know whether it's safe to make Drive calls. */
  ready: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => {
    // Restore cached profile for instant UI on refresh.
    if (typeof window === "undefined") {
      return { profile: null, loading: false, ready: true, error: null };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return {
          profile: JSON.parse(raw) as UserProfile,
          loading: false,
          // If we have a cached token in memory too, we're effectively
          // re-authenticated. Otherwise we'll attempt silent re-auth
          // in the effect below and flip `ready` to true when done.
          ready: getCurrentToken() !== null,
          error: null,
        };
      }
    } catch {
      // ignore
    }
    return { profile: null, loading: false, ready: true, error: null };
  });
  const inFlight = useRef(false);

  const login = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // Single token request. `prompt: "consent"` forces the consent
      // screen on first login; on subsequent logins Google re-grants
      // silently. Either way the returned access_token is valid for
      // the userinfo call below.
      const token = await requestAccessToken("consent");
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
      setState({ profile, loading: false, ready: true, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      setState({ profile: null, loading: false, ready: true, error: message });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem(STORAGE_KEY);
    setState({ profile: null, loading: false, ready: true, error: null });
  }, []);

  // Silent re-auth on mount if we have a cached profile but no in-memory
  // token. This must AWAIT — otherwise the rest of the app fires off Drive
  // calls before we have a token, and those calls race each other into a
  // dead state.
  useEffect(() => {
    if (!state.profile) return;
    if (getCurrentToken()) {
      setState((s) => ({ ...s, ready: true }));
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, ready: false }));
    requestAccessToken("")
      .then(() => {
        if (!cancelled) setState((s) => ({ ...s, ready: true }));
      })
      .catch(() => {
        // Silent grant failed (e.g. expired Google session). User will
        // be prompted on next interaction. Keep `ready: true` so the
        // UI doesn't sit forever; the Drive call will surface the error.
        if (!cancelled) setState((s) => ({ ...s, ready: true }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, login, logout };
}
