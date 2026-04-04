export function nowIso(): string {
  return new Date().toISOString();
}

export function addSeconds(dateIso: string, seconds: number): string {
  return new Date(Date.parse(dateIso) + seconds * 1000).toISOString();
}
