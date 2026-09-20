type Session = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string };
};

const storageKey = "quest-buddies-supabase-session";
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

function configured() {
  return Boolean(url && anonKey && !url.includes("your-project") && !anonKey.includes("your_supabase"));
}

function save(session: Session | null) {
  if (session) localStorage.setItem(storageKey, JSON.stringify(session));
  else localStorage.removeItem(storageKey);
}

export function currentSession() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "null") as Session | null;
  } catch {
    return null;
  }
}

async function authRequest(path: string, body: Record<string, unknown>) {
  if (!configured()) throw new Error("Supabase authentication is not configured.");
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const authError = data && typeof data === "object"
      ? (data as Record<string, unknown>).message ??
        (data as Record<string, unknown>).error_description ??
        (data as Record<string, unknown>).msg ??
        (data as Record<string, unknown>).error
      : undefined;
    throw new Error(typeof authError === "string" ? authError : `Supabase authentication failed (${response.status}).`);
  }
  return data as { access_token?: string; refresh_token?: string; expires_in?: number; user?: Session["user"] };
}

function storeAuthResponse(data: Awaited<ReturnType<typeof authRequest>>) {
  if (!data.access_token || !data.refresh_token || !data.user) return null;
  const session: Session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    user: data.user,
  };
  save(session);
  return session;
}

export async function signIn(email: string, password: string) {
  return storeAuthResponse(await authRequest("token?grant_type=password", { email, password }));
}

export async function signUp(email: string, password: string) {
  const data = await authRequest("signup", { email, password });
  const session = storeAuthResponse(data);
  // With email confirmation disabled, ensure a newly created user is signed in
  // even if Supabase returns the user without session tokens.
  return session ?? signIn(email, password);
}

export async function findMyRoom() {
  const token = await getAccessToken();
  if (!token) throw new Error("Your sign-in session is no longer valid.");
  const response = await fetch("/api/me/room", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data === "object" ? (data as Record<string, unknown>).error : undefined;
    throw new Error(typeof message === "string" ? message : `Could not restore your room (${response.status}).`);
  }
  const roomId = data && typeof data === "object" ? (data as Record<string, unknown>).roomId : null;
  return typeof roomId === "string" ? roomId : null;
}

export async function leaveMyRoom() {
  const token = await getAccessToken();
  if (!token) throw new Error("Your sign-in session is no longer valid.");
  const response = await fetch("/api/me/room", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data === "object" ? (data as Record<string, unknown>).error : undefined;
    throw new Error(typeof message === "string" ? message : `Could not leave the room (${response.status}).`);
  }
}

export async function getAccessToken() {
  const session = currentSession();
  if (!session) return null;
  if (!session.expires_at || session.expires_at > Math.floor(Date.now() / 1000) + 60) return session.access_token;
  try {
    return storeAuthResponse(await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token }))?.access_token ?? null;
  } catch {
    save(null);
    return null;
  }
}

export function signOut() {
  save(null);
}
