export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function chatRequest(
  messages: ChatMessage[],
  init: { url?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(init.url ?? 'https://portfolio.example/api/luzia', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: JSON.stringify({ messages }),
  });
}

export const fixturePath = (name: string) => new URL(`../fixtures/${name}`, import.meta.url).pathname;
