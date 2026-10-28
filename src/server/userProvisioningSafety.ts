/**
 * Decisão segura para provisionamento. Um e-mail coincidente é sinal de revisão,
 * jamais prova de identidade nem autorização para alterar o ID existente.
 */
export type ExistingProfile = { id: string; email: string | null };
export type ProvisioningDecision = 'create_new' | 'already_linked' | 'manual_review';

export function reviewProvisioningIdentity(
  authId: string | null,
  email: string,
  profilesByEmail: ExistingProfile[],
): ProvisioningDecision {
  const target = email.trim().toLowerCase();
  if (!target || !Array.isArray(profilesByEmail)) return 'manual_review';
  // Múltiplos perfis com o mesmo e-mail são ambíguos até na hipótese de um ID coincidir.
  if (profilesByEmail.length > 1) return 'manual_review';
  const matchedProfile = profilesByEmail[0];
  if (matchedProfile && (matchedProfile.email || '').trim().toLowerCase() !== target) {
    return 'manual_review';
  }
  if (!authId) return matchedProfile ? 'manual_review' : 'create_new';
  if (!matchedProfile || matchedProfile.id !== authId) return 'manual_review';
  return 'already_linked';
}
