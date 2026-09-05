import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { queryClient } from './app/queryClient';
import { ThemeProvider } from './app/ThemeProvider';
import { AuthProvider } from './app/AuthProvider';
import { EnvironmentProvider } from './app/EnvironmentProvider';
import { ToastProvider } from './components/ui/Toast';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {/* EnvironmentProvider precisa do queryClient (limpa cache na troca) e
            envolve o AuthProvider, porque cada ambiente tem Auth proprio. */}
        <EnvironmentProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </EnvironmentProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
