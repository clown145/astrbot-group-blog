import type { AuthSessionView } from "./auth-store";
import { getCurrentAuthSession } from "./request";
import type { RuntimeEnv } from "./runtime-env";
import type { CookieStore } from "./session-cookie";

export async function safeGetCurrentAuthSession(
  env: RuntimeEnv,
  cookies: Pick<CookieStore, "get">,
): Promise<{
  sessionToken: string | null;
  authSession: AuthSessionView | null;
}> {
  try {
    return await getCurrentAuthSession(env, cookies);
  } catch {
    return {
      sessionToken: null,
      authSession: null,
    };
  }
}
