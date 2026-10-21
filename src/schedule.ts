export const sameFileEveryMs = 2 * 60_000;

export type Last = { entity: string; at: number } | null;

export function shouldSend(last: Last, entity: string, now: number, isWrite: boolean): boolean {
  if (isWrite) return true;
  if (!last || last.entity !== entity) return true;
  return now - last.at >= sameFileEveryMs;
}
