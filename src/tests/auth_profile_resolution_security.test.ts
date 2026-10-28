/**
 * Compatibilidade com o comando de testes preexistente.
 * As validações usam o gate de produção em src/utils/profileAccess.ts;
 * o fallback antigo por email/cache foi removido por risco de elevação de privilégios.
 */
import './profile_access_gate.test.ts';
