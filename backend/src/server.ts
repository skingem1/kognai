import { app } from './app';


const PORT = parseInt(process.env.PORT || '3001', 10);

const server = app.listen(PORT, () => {
  console.log(`Invoica API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/v1/health`);

  // CEO AI bot runs as a SEPARATE PM2 process (ceo-ai-bot) — do NOT start here.
  // Reason: ceoBot has a process.exit(1) watchdog that would crash the API server.
  // See ecosystem.config.js → ceo-ai-bot → scripts/run-ceo-bot.ts
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
  throw err;
});

export { server };
