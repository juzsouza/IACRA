import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { runLegacyServiceWorkerMigration } from "./utils/legacyServiceWorkerMigration";

// Este entrypoint é EXCLUSIVO da branch IACRA-DEV.
// Carregar App dinamicamente permite exibir um diagnóstico seguro se a configuração
// do Supabase de testes estiver ausente. Nunca inicializar o cliente de produção.
const container = document.getElementById("root");
if (!container) throw new Error("Elemento root não encontrado.");
const root = createRoot(container);

try {
  runLegacyServiceWorkerMigration();
} catch {
  // Uma falha de Service Worker antigo não deve impedir a tela de diagnóstico.
  console.warn("[IACRA DEV] Não foi possível executar a limpeza de cache legado.");
}

void import("./App.tsx")
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const kind = err instanceof Error ? err.name : "erro de inicialização";
    // Não registrar segredos, credenciais, valores de env ou mensagens arbitrárias.
    console.error("[IACRA DEV] Falha ao inicializar a prévia:", kind);
    root.render(
      <StrictMode>
        <main role="alert" style={{
          maxWidth: 720, margin: "12vh auto", padding: 28,
          border: "1px solid #fbbf24", borderRadius: 12,
          background: "#fffbeb", color: "#713f12",
          fontFamily: "system-ui, sans-serif", lineHeight: 1.6,
        }}>
          <h1 style={{ marginTop: 0 }}>Prévia IACRA-DEV indisponível</h1>
          <p>O aplicativo não conseguiu concluir a configuração de testes.
             Nenhuma alteração foi feita no banco de produção.</p>
          <p>Confira no ambiente de testes as variáveis públicas
             <code> VITE_SUPABASE_URL</code>,
             <code> VITE_EAVRA_DEV_PROJECT_REF</code> e
             <code> VITE_SUPABASE_ANON_KEY</code>.
             Use somente credenciais públicas do IACRA-DEV.</p>
          <p>Se o servidor de testes também estiver sem configuração,
             confira <code>SUPABASE_URL</code> e uma chave pública de servidor
             (nunca service_role no navegador).</p>
          <p><strong>Não preencha nem copie credenciais do IACRA original.</strong></p>
        </main>
      </StrictMode>,
    );
  });
