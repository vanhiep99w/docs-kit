import { D2 } from '@terrastruct/d2';
import { renderDiagram } from './render.mjs';

// One SDK instance per process. SDK calls must never overlap: its worker uses
// one currentResolve/currentReject pair internally.
const d2 = new D2();
process.on('disconnect', () => process.exit(0));
try {
  await d2.compile('docs_kit_warmup');
  process.send?.({ type: 'ready' });
} catch (error) {
  process.send?.({ type: 'startup-error', error: String(error) });
  process.exit(1);
}

let busy = false;
process.on('message', async (message) => {
  if (message?.type !== 'render') return;
  if (busy) {
    process.send?.({ type: 'result', id: message.id, ok: false, error: 'Overlapping D2 worker calls.' });
    return;
  }
  busy = true;
  try {
    const result = await renderDiagram(d2, message.payload);
    process.send?.({ type: 'result', id: message.id, ok: true, result, rss: process.memoryUsage().rss });
  } catch (error) {
    process.send?.({ type: 'result', id: message.id, ok: false, error: String(error), rss: process.memoryUsage().rss });
  } finally {
    busy = false;
  }
});
