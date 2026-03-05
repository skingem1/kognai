import express from 'express';
import cors from 'cors';
import invoiceRoutes from './routes/invoices';
import apiKeyRoutes from './routes/api-keys';
import webhookRoutes from './routes/webhooks';
import settlementRoutes from './routes/settlements';
import healthRoutes from './routes/health';
import aiInferenceRoutes from './routes/ai-inference';
import ledgerRoutes from './routes/ledger';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`${req.method} ${req.path} ${_res.statusCode} ${duration}ms`);
    }
  });
  next();
});

app.use(healthRoutes);
app.use(invoiceRoutes);
app.use(apiKeyRoutes);
app.use(webhookRoutes);
app.use(settlementRoutes);
app.use(aiInferenceRoutes);
app.use(ledgerRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message);
  const statusCode = (err as any).statusCode || 500;
  res.status(statusCode).json({ success: false, error: { message: err.message, code: 'INTERNAL_ERROR' } });
});

export { app };
