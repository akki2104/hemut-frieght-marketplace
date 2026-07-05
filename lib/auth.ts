// Minimal client-side auth: store the JWT in localStorage and notify listeners
// on change so the guard/header can react without a full page reload.

const TOKEN_KEY = "fm_token";

type Listener = () => void;
const listeners = new Set<Listener>();

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  listeners.forEach((l) => l());
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  listeners.forEach((l) => l());
}

export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
