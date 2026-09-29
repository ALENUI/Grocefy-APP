/** Error codes raised by the database (see supabase/migrations) or derived from PostgREST failures. */
export type ServiceErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'ALREADY_PURCHASED' | 'INVALID_CURRENCY'
  | 'CURRENCY_LOCKED' | 'LIST_ARCHIVED' | 'OWNER_IMMUTABLE' | 'FINANCIAL_RECORD_IMMUTABLE' | 'ALREADY_MEMBER' | 'INVITATION_NOT_PENDING'
  | 'INVITATION_EXPIRED' | 'RESOURCE_ARCHIVED' | 'USERNAME_TAKEN' | 'UNKNOWN';

const raisedCodes: ServiceErrorCode[] = ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_ERROR', 'ALREADY_PURCHASED', 'INVALID_CURRENCY',
  'CURRENCY_LOCKED', 'LIST_ARCHIVED', 'OWNER_IMMUTABLE', 'FINANCIAL_RECORD_IMMUTABLE', 'ALREADY_MEMBER', 'INVITATION_NOT_PENDING',
  'INVITATION_EXPIRED', 'RESOURCE_ARCHIVED'];

export class ServiceError extends Error {
  constructor(public code: ServiceErrorCode, message: string) { super(message); this.name = 'ServiceError'; }
}

/** Normalizes Supabase/PostgREST errors so screens can show friendly messages per code. */
export function toServiceError(error: { message: string; code?: string }): ServiceError {
  const raised = raisedCodes.find((code) => error.message.includes(code));
  if (raised) return new ServiceError(raised, error.message);
  if (error.code === '42501' || error.message.includes('row-level security')) return new ServiceError('FORBIDDEN', error.message);
  if (error.code === '23505' && error.message.includes('username')) return new ServiceError('USERNAME_TAKEN', error.message);
  if (error.code === '23514' || error.code === '22P02') return new ServiceError('VALIDATION_ERROR', error.message);
  return new ServiceError('UNKNOWN', error.message);
}

/** Unwraps a Supabase response, throwing a ServiceError on failure. */
export function unwrap<T>({ data, error }: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (error) throw toServiceError(error);
  if (data === null) throw new ServiceError('NOT_FOUND', 'No data returned');
  return data;
}
