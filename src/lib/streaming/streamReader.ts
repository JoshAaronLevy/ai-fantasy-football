/**
 * Simplified utilities for handling JSON responses
 * The backend now returns single JSON objects instead of streaming chunks
 */

export async function readAsJson<T = unknown>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}