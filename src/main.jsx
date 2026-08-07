import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { ThemeProvider } from "./theme/ThemeContext";
import { GlobalModalOverlayProvider } from "./contexts/GlobalModalOverlayContext";
import { ensureFirebaseAuth } from "./firebase";
import { syncPendingTelegramMessages } from "./telegram/telegramMessageLog";
import "./index.css";
import "./theme/app-theme.css";

async function bootstrap() {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <ThemeProvider>
            <GlobalModalOverlayProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </GlobalModalOverlayProvider>
          </ThemeProvider>
        </BrowserRouter>
      </AppErrorBoundary>
    </React.StrictMode>,
  );

  try {
    await ensureFirebaseAuth();
    console.info("[firebase] Ulandi");
    const syncResult = await syncPendingTelegramMessages();
    if (syncResult?.synced) {
      console.info("[telegram_messages] Navbatdan sinxronlandi:", syncResult.synced);
    }
  } catch (error) {
    console.warn("[firebase] Ulanish o‘tkazib yuborildi:", error);
  }
}

void bootstrap();
