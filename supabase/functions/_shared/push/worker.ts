import type { PushProvider } from './providers.ts';

export type QueuedPush = { id: string; user_id: string; title: string; body: string; data: Record<string, unknown> };
export type PushOutcome = 'sent' | 'failed' | 'skipped';

export interface PushStore {
  claim(batchSize: number): Promise<QueuedPush[]>;
  complete(id: string, outcome: PushOutcome, error?: string): Promise<void>;
  tokensFor(userId: string): Promise<string[]>;
  removeTokens(tokens: string[]): Promise<void>;
}

/**
 * Delivers each queued push to every device of its recipient. A push counts as sent when at least one device
 * accepted it; tokens Expo reports as no longer registered (app uninstalled) are deleted.
 */
export async function processPushOutbox(store: PushStore, provider: PushProvider, options: { batchSize?: number; log?: (line: string) => void } = {}): Promise<Record<PushOutcome, number>> {
  const result: Record<PushOutcome, number> = { sent: 0, failed: 0, skipped: 0 };
  const log = options.log ?? console.log;
  for (const push of await store.claim(options.batchSize ?? 50)) {
    let outcome: PushOutcome;
    let error: string | undefined;
    try {
      const tokens = await store.tokensFor(push.user_id);
      if (tokens.length === 0) {
        outcome = 'skipped'; error = 'no registered devices';
      } else {
        const results = await provider.send(tokens.map((to) => ({ to, title: push.title, body: push.body, data: push.data })));
        const invalid = tokens.filter((_, index) => results[index]?.status === 'invalid-token');
        if (invalid.length) await store.removeTokens(invalid);
        const errors = results.flatMap((entry) => (entry.status === 'error' ? [entry.message] : []));
        if (results.some((entry) => entry.status === 'ok')) outcome = 'sent';
        else if (errors.length) { outcome = 'failed'; error = errors.join('; '); }
        else { outcome = 'skipped'; error = 'all devices unregistered'; }
      }
    } catch (caught) {
      outcome = 'failed';
      error = caught instanceof Error ? caught.message : String(caught);
      log(`[send-push] ${push.id} failed: ${error}`); // no tokens or message content in logs
    }
    await store.complete(push.id, outcome, error);
    result[outcome] += 1;
  }
  return result;
}

type Result<T> = { data: T | null; error: { message: string } | null };
// Structural subset of SupabaseClient, as in the email store.
export type PushServiceClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result<unknown>>;
  from(table: string): {
    select(columns: string): { eq(column: string, value: unknown): PromiseLike<Result<unknown>> };
    delete(): { in(column: string, values: unknown[]): PromiseLike<Result<unknown>> };
  };
};
const unwrap = <T>({ data, error }: Result<T>): T | null => { if (error) throw new Error(error.message); return data; };

export function createSupabasePushStore(client: PushServiceClient): PushStore {
  return {
    async claim(batchSize) { return (unwrap(await client.rpc('claim_push_batch', { batch_size: batchSize })) as QueuedPush[] | null) ?? []; },
    async complete(id, outcome, error) { unwrap(await client.rpc('complete_push', { push_id: id, outcome, error_message: error ?? null })); },
    async tokensFor(userId) { return ((unwrap(await client.from('push_tokens').select('token').eq('user_id', userId)) as { token: string }[] | null) ?? []).map((row) => row.token); },
    async removeTokens(tokens) { unwrap(await client.from('push_tokens').delete().in('token', tokens)); }
  };
}
