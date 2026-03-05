import { Request, Response, NextFunction } from "express";
import { createProxyMiddleware, Options } from "http-proxy-middleware";
import { extractInvoiceHeaders, hasInvoiceHeaders, InvoiceHeaders } from "./headers";
import { logger } from "../utils/logger";
import { invoiceQueue } from "../queue/invoice.queue";

/**
 * Configuration for the proxy middleware
 */
export interface ProxyConfig {
  target: string;
  changeOrigin?: boolean;
  pathRewrite?: Record<string, string>;
}

/**
 * Creates the invoice proxy middleware with 402/200 detection
 * 
 * @param config - Proxy configuration options
 * @returns Express middleware function
 */
export function createInvoiceProxyMiddleware(config: ProxyConfig) {
  const proxyOptions: Options = {
    target: config.target,
    changeOrigin: config.changeOrigin ?? true,
    pathRewrite: config.pathRewrite,
    onProxyReq: (
      proxyReq: ReturnType<ReturnType<typeof require>["http"]["createClient"]>,
      req: Request
    ): void => {
      // Add custom headers for tracking
      proxyReq.setHeader("X-Forwarded-For", req.ip || req.socket.remoteAddress || "unknown");
      proxyReq.setHeader("X-Proxy-Type", "invoice-proxy");
      
      logger.debug({
        msg: "Proxying request",
        method: req.method,
        path: req.path,
        target: config.target,
      });
    },
    onProxyRes: async (
      proxyRes: ReturnType<ReturnType<typeof require>["http"]["createClient"]>["res"],
      req: Request,
      res: Response
    ): Promise<void> => {
      const statusCode = proxyRes.statusCode || 0;
      const invoiceHeaders = extractInvoiceHeaders(req.headers);
      
      logger.info({
        msg: "Proxy response received",
        statusCode,
        path: req.path,
        hasInvoiceData: hasInvoiceHeaders(req.headers),
      });

      // Handle Payment Required (402) response
      if (statusCode === 402) {
        await handle402Response(req, res, invoiceHeaders, proxyRes);
        return;
      }

      // Handle successful response (200) with invoice headers
      if (statusCode === 200 && hasInvoiceHeaders(req.headers)) {
        await handle200WithInvoice(req, res, invoiceHeaders);
      }
    },
    onError: (
      err: Error,
      req: Request,
      res: Response
    ): void => {
      logger.error({
        msg: "Proxy error",
        error: err.message,
        path: req.path,
      });
      
      if (!res.headersSent) {
        res.status(502).json({
          error: "Bad Gateway",
          message: "Failed to proxy request to merchant",
          details: err.message,
        });
      }
    },
  };

  return createProxyMiddleware(proxyOptions);
}

/**
 * Handles 402 Payment Required responses
 * Emits event to Redis queue for invoice generation
 */
async function handle402Response(
  req: Request,
  res: Response,
  invoiceHeaders: ReturnType<typeof extractInvoiceHeaders>,
  proxyRes: ReturnType<ReturnType<typeof require>["http"]["createClient"]>["res"]
): Promise<void> {
  try {
    const jobData = {
      requestId: req.headers["x-request-id"] as string || crypto.randomUUID(),
      method: req.method,
      path: req.path,
      headers: invoiceHeaders,
      timestamp: new Date().toISOString(),
      originalUrl: req.originalUrl,
      query: req.query,
    };

    logger.info({
      msg: "Emitting 402 event to invoice queue",
      requestId: jobData.requestId,
      invoiceHeaders,
    });

    // Add job to Bull queue
    await invoiceQueue.add("payment-required", jobData, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });

    // Stream the 402 response to client
    res.writeHead(402, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  } catch (error) {
    logger.error({
      msg: "Failed to emit 402 event",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to process payment required response",
      });
    }
  }
}

/**
 * Handles 200 OK responses with invoice headers
 * Emits event to Redis queue for logging/audit
 */
async function handle200WithInvoice(
  req: Request,
  res: Response,
  invoiceHeaders: ReturnType<typeof extractInvoiceHeaders>
): Promise<void> {
  try {
    const jobData = {
      requestId: req.headers["x-request-id"] as string || crypto.randomUUID(),
      method: req.method,
      path: req.path,
      headers: invoiceHeaders,
      timestamp: new Date().toISOString(),
      status: "success",
    };

    logger.info({
      msg: "Emitting 200 event to invoice queue for audit",
      requestId: jobData.requestId,
    });

    await invoiceQueue.add("success-with-invoice", jobData, {
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 500,
      },
    });
  } catch (error) {
    logger.error({
      msg: "Failed to emit 200 event",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // Don't fail the request - audit failure shouldn't block success response
  }
}

/**
 * Creates a route handler that optionally proxies based on X-Invoice-* headers
 */
export function createInvoiceRouteHandler(merchantUrl: string) {
  const proxyMiddleware = createInvoiceProxyMiddleware({
    target: merchantUrl,
    changeOrigin: true,
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    // Only proxy requests that have invoice headers
    if (hasInvoiceHeaders(req.headers)) {
      logger.debug({
        msg: "Invoice headers detected, proxying request",
        headers: Object.keys(req.headers).filter(h => h.startsWith("x-invoice-")),
      });
      return proxyMiddleware(req, res, next);
    }
    
    // No invoice headers, skip proxying
    next();
  };
}
