import "@fontsource-variable/archivo/wdth.css";
import "./styles/base.css";
import "./styles/hero.css";
import "./styles/sections.css";
import "./styles/panels.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PlacesProvider } from "./state/places";
import { SettingsProvider } from "./state/settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true } },
});

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <PlacesProvider>
          <App />
        </PlacesProvider>
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
