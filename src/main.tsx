import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { router } from './router';
import { isSupabaseConfigured } from './lib/supabase';
import './lib/i18n';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isSupabaseConfigured ? (
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      ) : (
        <BrowserRouter>
          <AuthProvider offline>
            <App localMode />
          </AuthProvider>
        </BrowserRouter>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
