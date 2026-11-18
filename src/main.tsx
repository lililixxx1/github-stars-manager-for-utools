import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

async function bootstrap() {
    if (import.meta.env.DEV && typeof window !== 'undefined' && !window.githubStarsAPI) {
        const { ensureDevMockApi } = await import('./dev/mockApi');
        ensureDevMockApi();
    }

    createRoot(document.getElementById('root')!).render(
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    );
}

bootstrap();
