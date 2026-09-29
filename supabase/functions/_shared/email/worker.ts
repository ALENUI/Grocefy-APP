import type { EmailProvider } from './providers.ts';
import { InvitationEmail, renderInvitation, renderMonthlyReport, ReportEmail } from './templates.ts';

export type OutboxEmail = { id: string; kind: 'invitation' | 'monthly_report'; to_email: string; reference_id: string };
export type Outcome = 'sent' | 'failed' | 'skipped';

/** Persistence used by the worker; implemented with Supabase in supabase-store.ts and with fakes in tests. */
export interface OutboxStore {
  claim(batchSize: number): Promise<OutboxEmail[]>;
  complete(id: string, outcome: Outcome, error?: string): Promise<void>;
  /** Null when the invitation no longer exists, was answered or cancelled, or has expired. */
  loadInvitation(id: string): Promise<InvitationEmail | null>;
  loadReport(id: string): Promise<ReportEmail | null>;
}

export type WorkerResult = Record<Outcome, number>;

/** Claims due emails, renders each from current data, and delivers it. One failure never blocks the rest of the batch. */
export async function processOutbox(store: OutboxStore, provider: EmailProvider, options: { appUrl: string; batchSize?: number; log?: (line: string) => void }): Promise<WorkerResult> {
  const result: WorkerResult = { sent: 0, failed: 0, skipped: 0 };
  const log = options.log ?? console.log;
  for (const email of await store.claim(options.batchSize ?? 20)) {
    let outcome: Outcome;
    let error: string | undefined;
    try {
      const content = email.kind === 'invitation'
        ? await store.loadInvitation(email.reference_id).then((data) => data && renderInvitation(data, options.appUrl))
        : await store.loadReport(email.reference_id).then((data) => data && renderMonthlyReport(data, options.appUrl));
      if (!content) {
        outcome = 'skipped';
        error = 'no longer relevant';
      } else {
        await provider.send({ to: email.to_email, ...content });
        outcome = 'sent';
      }
    } catch (caught) {
      outcome = 'failed';
      error = caught instanceof Error ? caught.message : String(caught);
      log(`[send-emails] ${email.kind} ${email.id} failed: ${error}`); // no recipient address in logs
    }
    await store.complete(email.id, outcome, error);
    result[outcome] += 1;
  }
  return result;
}
