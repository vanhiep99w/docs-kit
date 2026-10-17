import { hydrateRoot } from 'react-dom/client';
import { App } from './app.js';
const data = JSON.parse(document.getElementById('data')!.textContent!);
hydrateRoot(document.getElementById('root')!, <App data={data} />);
