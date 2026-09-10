export type Source = { id: string; document: string; page: number | null; text: string };
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  mode?: 'openai' | 'local' | 'unavailable';
};
export type Health = {
  status: string;
  resume_ready: boolean;
  mode: 'openai' | 'local';
  voice: 'openai' | 'browser';
  documents: string[];
  chunks: number;
};
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_BASE + path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = typeof body.detail === 'string' ? body.detail : undefined;
    throw new Error(response.status === 429
      ? 'A few too many requests. Please try again in a minute.'
      : detail || 'The connection was interrupted. Please try again.');
  }
  return response.json() as Promise<T>;
}
