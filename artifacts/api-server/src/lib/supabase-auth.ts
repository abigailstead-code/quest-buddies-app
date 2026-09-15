import type { NextFunction, Request, Response } from "express";

export type AuthenticatedRequest = Request & { authUserId?: string };

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

export async function requireSupabaseUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorization = req.header("authorization");
  if (!url || !anonKey || !authorization?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization },
    });
    const user = response.ok ? await response.json() as { id?: string } : null;
    if (!user?.id) {
      res.status(401).json({ error: "Your sign-in session is no longer valid." });
      return;
    }
    req.authUserId = user.id;
    next();
  } catch {
    res.status(503).json({ error: "Could not verify your sign-in session." });
  }
}
