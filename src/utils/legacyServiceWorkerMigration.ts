/**
 * Migração controlada para eliminar possíveis Service Workers legados do EAVRA.
 * - Não registra novo Service Worker
 * - Não executa limpezas repetidas (usa flag persistente no localStorage)
 * - Não cria loop de reload (sem window.location.reload)
 * - Solicita update() para que o script de migração do servidor (/sw.js ou /service-worker.js) seja instalado
 */

export const EAVRA_LEGACY_SW_FLAG = 'eavra_legacy_sw_migration_v1';

export async function runLegacyServiceWorkerMigration(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const alreadyMigrated = localStorage.getItem(EAVRA_LEGACY_SW_FLAG);
    if (alreadyMigrated) {
      // Migração já concluída para este navegador/origem. Nenhuma ação repetida.
      return;
    }
  } catch {
    // Caso localStorage esteja bloqueado por políticas de privacidade/cookies, prosseguir com segurança
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    if (!registrations || registrations.length === 0) {
      // Nenhum Service Worker legado ativo nesta origem
      try {
        localStorage.setItem(EAVRA_LEGACY_SW_FLAG, 'done_no_legacy');
      } catch {}
      return;
    }

    console.info(
      `[EAVRA SW Migration] Encontrado(s) ${registrations.length} Service Worker(s) legado(s). Solicitando atualização para migração controlada...`
    );

    // 1. Solicitar atualização de cada registro para que busque o script de desativação do servidor
    for (const reg of registrations) {
      try {
        await reg.update();
      } catch {
        // Se a busca falhar (ex: offline ou erro de rede transitório), desregistra defensivamente
        try {
          await reg.unregister();
        } catch {}
      }
    }

    // 2. Limpar caches da origem apenas uma vez nesta migração
    if ('caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      } catch (err) {
        console.warn('[EAVRA SW Migration] Aviso ao limpar CacheStorage:', err);
      }
    }

    // 3. Gravar flag para nunca mais reexecutar
    try {
      localStorage.setItem(EAVRA_LEGACY_SW_FLAG, 'migrated');
    } catch {}

    // IMPORTANTE: NÃO executar window.location.reload() para evitar qualquer risco de loop de reload.
  } catch (error) {
    console.warn('[EAVRA SW Migration] Erro ao consultar registros de Service Worker:', error);
  }
}
