import express, { Express, Request, Response, NextFunction, ErrorRequestHandler } from "express";
import cors from "cors";
import { createInvoiceRouteHandler, createInvoiceProxyMiddleware } from "./middleware";
import { hasInvoiceHeaders } from "./headers";
import { logger } from "../utils/logger";
import { invoiceQueue } from "../queue/invoice.queue";

/**
 * Configuration for the invoice proxy server
 */
export interface ProxyServerConfig {
  port: number;
  merchantUrl: string;
  corsOrigins?: string | string[];
  proxyPath?: string;
  healthCheckPath?: string;
}

/**
 * Creates and configures the Express application for invoice proxy
 */
export function createApp(config: Omit<ProxyServerConfig, "port">): Express {
  const app = express();

  // CORS configuration
  const corsOptions: cors.CorsOptions = {
    origin: config.corsOrigins || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-Id",
      "X-Invoice-Company-Name",
      "X-Invoice-VAT-Number",
      "X-Invoice-Address",
      "X-Invoice-Email",
      "X-Invoice-Purchase-Order",
    ],
    exposedHeaders: ["X-Request-Id", "X-Invoice-Required"],
    credentials: true,
    maxAge: 86400,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    res.on("finish", () => {
      const duration = Date.now() - start;
      logger.info({
        msg: "Request completed",
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        hasInvoiceHeaders: hasInvoiceHeaders(req.headers),
      });
    });
    
    next();
  });

  // Health check endpoint
  const healthPath = config.healthCheckPath || "/health";
  app.get(healthPath, (req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "invoice-proxy",
    });
  });

  // Queue status endpoint
  app.get("/queue/status", async (req: Request, res: Response) => {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        invoiceQueue.getWaitingCount(),
        invoiceQueue.getActiveCount(),
        invoiceQueue.getCompletedCount(),
        invoiceQueue.getFailedCount(),
      ]);

      res.status(200).json({
        waiting,
        active,
        completed,
        failed,
        paused: invoiceQueue.isPaused(),
      });
    } catch (error) {
      logger.error({
        msg: "Failed to get queue status",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      res.status(500).json({ error: "Failed to get queue status" });
    }
  });

  // Proxy route for invoice requests
  const proxyPath = config.proxyPath || "/api/merchant";
  app.use(proxyPath, createInvoiceProxyMiddleware({
    target: config.merchantUrl,
    changeOrigin: true,
  }));

  // Fallback route handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: "Not Found",
      message: `Route ${req.method} ${req.path} not found`,
      supportedRoutes: [healthPath, proxyPath, "/queue/status"],
    });
  });

  // Global error handler
  const errorHandler: ErrorRequestHandler = (
    err: Error,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: NextFunction
  ) => {
    logger.error({
      msg: "Unhandled error",
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
      requestId: req.headers["x-request-id"],
    });
  };

  app.use(errorHandler);

  return app;
}

/**
 * Starts the invoice proxy server
 */
export async function startServer(config: ProxyServerConfig): Promise<void> {
  const app = createApp({
    merchantUrl: config.merchantUrl,
    corsOrigins: config.corsOrigins,
    proxyPath: config.proxyPath,
    healthCheckPath: config.healthCheckPath,
  });

  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      logger.info({
        msg: "Invoice proxy server started",
        port: config.port,
        merchantUrl: config.merchantUrl,
        proxyPath: config.proxyPath || "/api/merchant",
      });
      resolve();
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ msg: `Received ${signal}, shutting down gracefully` });
      
      server.close(async () => {
        logger.info({ msg: "HTTP server closed" });
        
        try {
          await invoiceQueue.close();
          logger.info({ msg: "Queue closed" });
          process.exit(0);
        } catch (error) {
          logger.error({
            msg: "Error during shutdown",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error({ msg: "Forced shutdown after timeout" });
        process.exit(1);
      }, 30000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  });
}

// Main entry point
if (require.main === module) {
  const config: ProxyServerConfig = {
    port: parseInt(process.env.PORT || "3000", 10),
    merchantUrl: process.env.MERCHANT_URL || "http://localhost:4000",
    corsOrigins: process.env.CORS_ORIGINS?.split(",") || "*",
    proxyPath: process.env.PROXY_PATH || "/api/merchant",
    healthCheckPath: process.env.HEALTH_CHECK_PATH || "/health",
  };

  startServer(config).catch((error) => {
    logger.error({
      msg: "Failed to start server",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    process.exit(1);
  });
}
