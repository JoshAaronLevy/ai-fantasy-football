import type { Player } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''; // if set, use it; else use Vite proxy

export async function fetchPlayers(): Promise<Player[]> {
  const url = `${API_BASE}/api/players`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch players: ${res.status} ${text}`);
  }
  return res.json();
}
