import express, { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { parseDescription } from './parser';
import { findBestMatch }   from './matcher';
import { initCache }       from './cache';

dotenv.config();
const PORT = parseInt(process.env.PORT || '3000', 10);
const CACHE_REFRESH_MS = parseInt(
  process.env.CACHE_REFRESH_INTERVAL_MS || '600000',
  10
);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const app = express();

// Load cache at startup
initCache().catch(err => {
  console.error('Failed to load cache:', err);
  process.exit(1);
});

// Periodic refresh (every 10 minutes)
setInterval(() => {
  initCache().catch(err => console.error('Cache reload failed:', err));
}, CACHE_REFRESH_MS);

// Optional: Admin endpoint for manual cache reload
// Secure with ADMIN_TOKEN in your .env
app.post('/admin/cache/reload', async (req: Request, res: Response) => {
  const token = req.headers['authorization'];
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await initCache();
    return res.json({ status: 'cache reloaded' });
  } catch (err: any) {
    console.error('Manual cache reload error:', err);
    return res.status(500).json({ error: 'Reload failed', details: err.message });
  }
});

// Logging
app.use(morgan(':method :url HTTP/:http-version :status ":user-agent" :response-time ms'));
app.use(express.json());

// Endpoints
app.get('/status', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/match',
  async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    try {
      const { description } = req.body;
      app.locals.logger?.info(`[Match] Received: "${description}"`);

      if (typeof description !== 'string') {
        app.locals.logger?.warn('[Match] Bad request, missing description');
        return res
          .status(400)
          .json({ error: 'Description (string) is required' });
      }

      const attrs   = parseDescription(description);
      app.locals.logger?.debug(`[Match] Parsed attrs: ${JSON.stringify(attrs)}`);

      const result  = await findBestMatch(attrs);
      app.locals.logger?.debug(`[Match] Result: ${JSON.stringify(result)}`);

      if (!result.vehicleId) {
        app.locals.logger?.warn('[Match] No vehicle found');
        return res
          .status(404)
          .json({ input: description, error: 'No match', confidence: 0 });
      }

      const duration = Date.now() - start;
      app.locals.logger?.info(
        `[Match] Matched vehicle=${result.vehicleId} confidence=${result.confidence} in ${duration}ms`
      );

      return res.json({ input: description, ...result });
    } catch (err) {
      app.locals.logger?.error('[Match] Unexpected error', err);
      return next(err);
    }
  }
);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Graceful shutting down...');
  // if you want: await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(PORT, () => {
  console.log(`Server listening on port ${process.env.PORT || '3000'}`);
  app.locals.logger = console;
});
