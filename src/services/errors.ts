/** Error codes raised by the database (see supabase/migrations) or derived from PostgREST failures. */
export type ServiceErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'ALREADY_PURCHASED' | 'INVALID_CURRENCY'
  | 'CURRENCY_LOCKED' | 'LIST_ARCHIVED' | 'OWNER_IMMUTABLE' | 'FINANCIAL_RECORD_IMMUTABLE' | 'ALREADY_MEMBER' | 'INVITATION_NOT_PENDING'
  | 'INVITATION_EXPIRED' | 'RESOURCE_ARCHIVED' | 'USERNAME_TAKEN' | 'ALREADY_EXISTS' | 'UNKNOWN';

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
  // .single() on zero rows: the row does not exist or RLS hides it / filtered the update.
  if (error.code === 'PGRST116') return new ServiceError('NOT_FOUND', error.message);
  if (error.code === '23505') return new ServiceError(error.message.includes('username') ? 'USERNAME_TAKEN' : 'ALREADY_EXISTS', error.message);
  if (error.code === '23514' || error.code === '22P02') return new ServiceError('VALIDATION_ERROR', error.message);
  return new ServiceError('UNKNOWN', error.message);
}

const friendlyMessages: Record<ServiceErrorCode, string> = {
  UNAUTHORIZED: 'Please sign in again.',
  FORBIDDEN: 'Your role does not allow this action.',
  NOT_FOUND: 'That item no longer exists or is not shared with you.',
  VALIDATION_ERROR: 'Some of the details are not valid. Please check and try again.',
  ALREADY_PURCHASED: 'This item has already been purchased.',
  INVALID_CURRENCY: 'That currency is not available.',
  CURRENCY_LOCKED: 'The currency cannot change once a list has items.',
  LIST_ARCHIVED: 'This list has been archived.',
  OWNER_IMMUTABLE: 'Ownership cannot be transferred.',
  FINANCIAL_RECORD_IMMUTABLE: 'Purchase records cannot be changed.',
  ALREADY_MEMBER: 'That person is already a member.',
  INVITATION_NOT_PENDING: 'This invitation has already been answered or cancelled.',
  INVITATION_EXPIRED: 'This invitation has expired. Ask the owner to invite you again.',
  RESOURCE_ARCHIVED: 'This group or list has been archived.',
  USERNAME_TAKEN: 'That username is already taken.',
  ALREADY_EXISTS: 'You already have one with that name.',
  UNKNOWN: 'Something went wrong. Please try again.'
};

/** A message suitable for showing to the user, for any thrown value. */
export function friendlyError(error: unknown): string {
  if (error instanceof ServiceError) return error.code === 'UNAUTHORIZED' && error.message ? error.message : friendlyMessages[error.code];
  if (error instanceof Error && /network|fetch/i.test(error.message)) return 'Could not reach Grocefy. Check your connection and try again.';
  return friendlyMessages.UNKNOWN;
}

/** Unwraps a Supabase response, throwing a ServiceError on failure. */
export function unwrap<T>({ data, error }: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (error) throw toServiceError(error);
  if (data === null) throw new ServiceError('NOT_FOUND', 'No data returned');
  return data;
}
