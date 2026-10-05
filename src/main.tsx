import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { runLegacyServiceWorkerMigration } from "./utils/legacyServiceWorkerMigration";

// Migração e saneamento controlado de Service Worker legado (sem loops, sem reload forçado)
runLegacyServiceWorkerMigration();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

