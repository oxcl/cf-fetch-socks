import { REDIRECT_STATUSES } from '../constants';

export function isRedirect(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}
