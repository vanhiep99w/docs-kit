process.on('disconnect', () => process.exit(0));
process.send({ type: 'ready' });
process.on('message', (message) => {
  if (message.payload.source === 'crash') process.exit(7);
  if (message.payload.source === 'hang') return;
  const respond = () => process.send({ type: 'result', id: message.id, ok: true,
    result: { pid: process.pid, source: message.payload.source,
      ...(message.payload.source.startsWith('large') ? { data: 'x'.repeat(1024 * 1024) } : {}) },
    rss: process.memoryUsage().rss });
  if (message.payload.source.startsWith('slow')) setTimeout(respond, 120);
  else respond();
});
