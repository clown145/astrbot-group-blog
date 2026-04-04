export function jsonError(
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json(
    {
      ok: false,
      error,
      ...extra,
    },
    { status },
  );
}

export function getClientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

export function getUserAgent(request: Request): string | null {
  return request.headers.get("user-agent");
}
