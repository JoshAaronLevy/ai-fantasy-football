export function bytesOf(obj: unknown): number {
  try {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return new TextEncoder().encode(s).length;
  } catch {
    return -1;
  }
}