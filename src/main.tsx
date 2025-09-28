import { createRoot } from 'react-dom/client';
import App from './App';
import { sqlLoggingService } from './lib/sqlLogging';

// Initialize SQL logging service
sqlLoggingService.initialize().catch(console.error);

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);
