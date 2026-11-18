/** Reautorizacao so e necessaria quando o refresh token foi recusado pelo Google. */
export function refreshTokenNeedsReauthorization(status: number, googleError: unknown): boolean {
  return status === 400 && googleError === 'invalid_grant';
}
