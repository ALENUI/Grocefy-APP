// Email provider abstraction. The worker depends only on EmailProvider, so the delivery service can be replaced
// without touching templates, the outbox, or database logic.

export type EmailMessage = { to: string; subject: string; html: string; text: string };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

type Fetch = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Resend (https://resend.com) transactional email API. */
export function resendProvider(apiKey: string, from: string, fetchImpl: Fetch = fetch): EmailProvider {
  return {
    name: 'resend',
    async send(message) {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text })
      });
      if (!response.ok) throw new Error(`Resend responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
  };
}

/** Development provider: records the subject only, never the recipient or body. */
export function logProvider(log: (line: string) => void = console.log): EmailProvider {
  return { name: 'log', async send(message) { log(`[email:log] ${message.subject}`); } };
}

export type ProviderConfig = { EMAIL_PROVIDER?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string };

export function createProvider(config: ProviderConfig): EmailProvider {
  const provider = config.EMAIL_PROVIDER ?? (config.RESEND_API_KEY ? 'resend' : 'log');
  if (provider === 'log') return logProvider();
  if (provider === 'resend') {
    if (!config.RESEND_API_KEY || !config.EMAIL_FROM) throw new Error('RESEND_API_KEY and EMAIL_FROM are required for the resend provider');
    return resendProvider(config.RESEND_API_KEY, config.EMAIL_FROM);
  }
  throw new Error(`Unknown EMAIL_PROVIDER "${provider}"`);
}
