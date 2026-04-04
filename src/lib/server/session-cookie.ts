export const SESSION_COOKIE_NAME = "agb_session";

export type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options?: Record<string, unknown>,
  ): void;
  delete(name: string, options?: Record<string, unknown>): void;
};

export function readSessionCookie(
  cookies: Pick<CookieStore, "get">,
): string | null {
  return cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export function writeSessionCookie(
  cookies: CookieStore,
  token: string,
  expiresAt: string,
  secure: boolean,
): void {
  cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(
  cookies: CookieStore,
  secure: boolean,
): void {
  cookies.delete(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
}
