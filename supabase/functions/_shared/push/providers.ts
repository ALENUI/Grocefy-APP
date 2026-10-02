// Push provider abstraction. Expo's push service delivers to both iOS (APNs) and Android (FCM).

export type PushMessage = { to: string; title: string; body: string; data: Record<string, unknown> };
/** Per-message result, in the order the messages were given. */
export type PushResult = { status: 'ok' } | { status: 'invalid-token' } | { status: 'error'; message: string };

export interface PushProvider {
  readonly name: string;
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

type Fetch = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;
type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

/** https://docs.expo.dev/push-notifications/sending-notifications/ — up to 100 messages per request. */
export function expoPushProvider(accessToken: string | undefined, fetchImpl: Fetch = fetch): PushProvider {
  return {
    name: 'expo',
    async send(messages) {
      const results: PushResult[] = [];
      for (let start = 0; start < messages.length; start += 100) {
        const chunk = messages.slice(start, start + 100);
        const response = await fetchImpl('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify(chunk.map((message) => ({ ...message, sound: 'default' })))
        });
        if (!response.ok) throw new Error(`Expo push responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
        const tickets = ((await response.json()) as { data?: ExpoTicket[] }).data ?? [];
        chunk.forEach((_, index) => {
          const ticket = tickets[index];
          if (!ticket) results.push({ status: 'error', message: 'No ticket returned' });
          else if (ticket.status === 'ok') results.push({ status: 'ok' });
          else if (ticket.details?.error === 'DeviceNotRegistered') results.push({ status: 'invalid-token' });
          else results.push({ status: 'error', message: ticket.message });
        });
      }
      return results;
    }
  };
}

/** Development provider: records titles only, never tokens or message bodies. */
export function logPushProvider(log: (line: string) => void = console.log): PushProvider {
  return { name: 'log', async send(messages) { messages.forEach((message) => log(`[push:log] ${message.title}`)); return messages.map(() => ({ status: 'ok' as const })); } };
}

export function createPushProvider(config: { PUSH_PROVIDER?: string; EXPO_ACCESS_TOKEN?: string }): PushProvider {
  const provider = config.PUSH_PROVIDER ?? 'expo';
  if (provider === 'log') return logPushProvider();
  if (provider === 'expo') return expoPushProvider(config.EXPO_ACCESS_TOKEN);
  throw new Error(`Unknown PUSH_PROVIDER "${provider}"`);
}
