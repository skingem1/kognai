export interface ShutdownConfig {
  timeout: number;
  signals: string[];
  onShutdown?: () => Promise<void>;
}

export const DEFAULT_CONFIG: ShutdownConfig = {
  timeout: 10000,
  signals: ['SIGTERM', 'SIGINT'],
};

export function createShutdownHandler(
  server: { close: (cb: (err?: Error) => void) => void },
  config?: Partial<ShutdownConfig>
): () => Promise<void> {
  const resolved = { ...DEFAULT_CONFIG, ...config };
  let isShuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('[shutdown] Graceful shutdown initiated...');

    const timer = setTimeout(() => {
      console.error('[shutdown] Forced exit after timeout');
      process.exit(1);
    }, resolved.timeout);

    try {
      if (resolved.onShutdown) await resolved.onShutdown();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      console.log('[shutdown] Server closed cleanly');
    } catch (err) {
      console.error('[shutdown] Error during shutdown:', err);
    } finally {
      clearTimeout(timer);
    }
  };

  for (const signal of resolved.signals) {
    try {
      process.on(signal, async () => {
        try {
          await shutdown();
        } catch (err) {
          console.error('[shutdown] Error during shutdown:', err);
          process.exit(1);
        }
      });
    } catch (err) {
      console.error(`[shutdown] Failed to register handler for ${signal}:`, err);
    }
  }

  return shutdown;
}