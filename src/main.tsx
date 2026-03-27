import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './styles/index.css';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            gcTime: 1000 * 60 * 60, // 1 hour (formerly cacheTime)
            refetchOnWindowFocus: false, // Prevent too many re-fetches during dev
        },
    },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    </React.StrictMode>
);

// Register Service Worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
// For dev, we might need a different strategy or just rely on Vite's dev server handling it?
// VitePWA plugin handles dev if `devOptions: { enabled: true }` is set.
// It usually registers it automatically if `registerType: 'autoUpdate'` is set?
// Actually, with `injectManifest`, we might need manual registration or use the `virtual:pwa-register` module.
// Let's use the explicit registration which is safer for our custom logic.
if ('serviceWorker' in navigator && import.meta.env.DEV) {
    navigator.serviceWorker.register('/sw.js', { type: 'module' });
}