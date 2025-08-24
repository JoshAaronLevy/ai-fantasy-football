import { v4 as uuid } from 'uuid';

const NS = 'app';
const k = (s: string) => `${NS}.${s}`;

export function getUserId(): string {
  let id = localStorage.getItem(k('userId'));
  if (!id) { 
    id = uuid(); 
    localStorage.setItem(k('userId'), id); 
  }
  return id;
}

export function getConversationId(scope: string): string | null {
  return localStorage.getItem(k(`${scope}.conversationId`));
}

export function setConversationId(scope: string, id: string): void {
  localStorage.setItem(k(`${scope}.conversationId`), id);
}

export function clearConversationId(scope: string): void {
  localStorage.removeItem(k(`${scope}.conversationId`));
}

export function getJSON<T>(key: string, fallback: T): T {
  try { 
    const raw = localStorage.getItem(k(key)); 
    return raw ? JSON.parse(raw) as T : fallback; 
  } catch { 
    return fallback; 
  }
}

export function setJSON(key: string, value: unknown): void {
  localStorage.setItem(k(key), JSON.stringify(value));
}