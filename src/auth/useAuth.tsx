import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UserProfile } from "../models/types";
import { requestAccessToken, clearToken, getCurrentToken } from "./tokenClient";
import { cardDrafts } from "../state/cardDrafts";

const PROFILE_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const PROFILE_STORAGE_KEY = "kboard:profile";
const BOARDS_CACHE_KEY = "kboard:boards-cache";

export interface AuthState {
  profile: UserProfile | null;
  loading: boolean;
  /** True after we've restored the profile from localStorage. The app can
   *  render the authenticated UI; the first Drive call will trigger a
   *  token grant as part of the user's interaction. */
  ready: boolean;
  error: string | null;
}

export interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => void;
  /**
   * Try to acquire a valid access token. Used by the BoardContext before
   * its first Drive call. Returns true if a valid token is in memory,
   * false otherwise.
   */
  ensureToken: () => Promise<boolean>;
  /**
   * Force a fresh interactive OAuth consent flow. Used when the
   * current token is missing required scopes (e.g. drive.appdata).
   * This always opens a popup (user gesture) so the browser never
   * blocks it.
   */
  reauthenticate: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === "undefined") {
      return { profile: null, loading: false, ready: false, error: null };
    }
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (raw) {
        return {
          profile: JSON.parse(raw) as UserProfile,
          loading: false,
          ready: true,
          error: null,
        };
      }
    } catch {
      // ignore
    }
    return { profile: null, loading: false, ready: false, error: null };
  });
  const inFlight = useRef(false);

  const login = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
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
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      setState({ profile, loading: false, ready: true, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      setState({ profile: null, loading: false, ready: false, error: message });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    // Also clear the boards cache so a different Google account
    // signing in on the same device doesn't see the previous user's
    // boards flash by. Drafts are wiped for the same reason — they
    // carry card titles that belong to the previous user.
    localStorage.removeItem(BOARDS_CACHE_KEY);
    cardDrafts.clear();
    setState({ profile: null, loading: false, ready: false, error: null });
  }, []);

  const ensureToken = useCallback(async (): Promise<boolean> => {
    if (getCurrentToken()) return true;
    try {
      await requestAccessToken("");
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Force a fresh consent grant. The popup is opened in response to
   * a user-initiated call (e.g. clicking "Reconnect to Drive" or
   * retrying after a 403), so the browser doesn't block it.
   *
   * Uses `prompt: "consent"` to force the consent screen even if
   * Google has a previously granted scope set. This is what gives us
   * a token with the full `drive.appdata` scope.
   */
  const reauthenticate = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      await requestAccessToken("consent");
      return getCurrentToken() !== null;
    } catch {
      return false;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, ensureToken, reauthenticate }),
    [state, login, logout, ensureToken, reauthenticate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// Re-export the cache key so BoardContext can use it.
export const BOARDS_CACHE_STORAGE_KEY = BOARDS_CACHE_KEY;
