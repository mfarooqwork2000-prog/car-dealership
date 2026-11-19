import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { ToastProvider } from "@/components/ui";
import { AuthProvider } from "@/features/auth";
import { SiteProvider } from "@/features/site";
import { AppRouter } from "@/routes";
import "@/styles/index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SiteProvider>
            <AuthProvider>
              <AppRouter />
            </AuthProvider>
          </SiteProvider>
        </ToastProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
);
