import type { AuthState } from "../auth/useAuth";

export function LoginScreen({
  loading,
  error,
  login,
}: AuthState & { login: () => void }) {
  return (
    <div className="login">
      <div className="login__card">
        <div className="login__logo" aria-hidden>📋</div>
        <h1 className="login__title">Kboard</h1>
        <p className="login__msg">
          A Trello-inspired Kanban board. Sign in with Google to keep your boards safe
          inside your own Google Drive.
        </p>
        <button
          type="button"
          className="login__btn"
          onClick={login}
          disabled={loading}
          aria-busy={loading}
        >
          <GoogleIcon />
          <span>{loading ? "Signing in…" : "Sign in with Google"}</span>
        </button>
        {error && <div className="login__error" role="alert">{error}</div>}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      className="login__btn-icon"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.2-11.5-11.5S17.6 12.5 24 12.5c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.7 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.7 19 12.5 24 12.5c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.7 6.4 29.1 4.5 24 4.5 16.6 4.5 10.2 8.4 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43.5c5 0 9.6-1.9 13.1-5.1l-6.1-5.1C29.1 35 26.7 35.5 24 35.5c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C10.1 39.6 16.5 43.5 24 43.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.1 5.1c-.4.4 6.4-4.7 6.4-14.8 0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
