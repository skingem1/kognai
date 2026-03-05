import request from "supertest";
import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { createApp, ProxyServerConfig } from "../../src/proxy/server";

// Mock dependencies
jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../src/queue/invoice.queue", () => ({
  invoiceQueue: {
    add: jest.fn().mockResolvedValue({ id: "test-job" }),
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
    isPaused: jest.fn().mockResolvedValue(false),
    close: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock http-proxy-middleware
jest.mock("http-proxy-middleware", () => {
  return {
    createProxyMiddleware: jest.fn(() => {
      return (req: Request, res: Response, next: NextFunction) => {
        next(); // Pass through for tests
      };
    }),
  };
});

describe("proxy/server.ts", () => {
  let app: Express;
  const mockMerchantUrl = "http://localhost:4000";

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp({
      merchantUrl: mockMerchantUrl,
      corsOrigins: "*",
      proxyPath: "/api/merchant",
      healthCheckPath: "/health",
    });
  });

  describe("createApp", () => {
    it("should create an Express app", () => {
      expect(app).toBeDefined();
      expect(app).toBeInstanceOf(express.Application);
    });

    it("should have CORS middleware configured", async () => {
      const response = await request(app)
        .options("/health")
        .expect(200);

      expect(response.headers["access-control-allow-origin"]).toBe("*");
    });

    it("should parse JSON bodies", async () => {
      app.use(express.json());
      
      let receivedBody: unknown = null;
      app.post("/test-json", (req: Request, res: Response) => {
        receivedBody = req.body;
        res.json({ success: true });
      });

      const response = await request(app)
        .post("/test-json")
        .send({ test: "data" })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe("Health Check Endpoint", () => {
    it("should return health status at /health", async () => {
      const response = await request(app)
        .get("/health")
        .expect(200);

      expect(response.body.status).toBe("ok");
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.service).toBe("invoice-proxy");
    });

    it("should return health status at custom path", async () => {
      const customApp = createApp({
        merchantUrl: mockMerchantUrl,
        healthCheckPath: "/custom-health",
      });

      const response = await request(customApp)
        .get("/custom-health")
        .expect(200);

      expect(response.body.status).toBe("ok");
    });
  });

  describe("Queue Status Endpoint", () => {
    it("should return queue statistics", async () => {
      const response = await request(app)
        .get("/queue/status")
        .expect(200);

      expect(response.body.waiting).toBe(0);
      expect(response.body.active).toBe(0);
      expect(response.body.completed).toBe(0);
      expect(response.body.failed).toBe(0);
      expect(response.body.paused).toBe(false);
    });

    it("should return queue status with actual counts", async () => {
      const { invoiceQueue } = require("../../src/queue/invoice.queue");
      (invoiceQueue.getWaitingCount as jest.Mock).mockResolvedValue(5);
      (invoiceQueue.getActiveCount as jest.Mock).mockResolvedValue(2);
      (invoiceQueue.getCompletedCount as jest.Mock).mockResolvedValue(100);
      (invoiceQueue.getFailedCount as jest.Mock).mockResolvedValue(3);

      const response = await request(app)
        .get("/queue/status")
        .expect(200);

      expect(response.body.waiting).toBe(5);
      expect(response.body.active).toBe(2);
      expect(response.body.completed).toBe(100);
      expect(response.body.failed).toBe(3);
    });
  });

  describe("CORS Configuration", () => {
    it("should allow specified origins", async () => {
      const corsApp = createApp({
        merchantUrl: mockMerchantUrl,
        corsOrigins: ["https://example.com", "https://app.example.com"],
      });

      const response = await request(corsApp)
        .options("/health")
        .set("Origin", "https://example.com")
        .expect(200);

      expect(response.headers["access-control-allow-origin"]).toBe("https://example.com");
    });

    it("should expose invoice headers", async () => {
      const response = await request(app)
        .options("/health")
        .expect(200);

      const exposedHeaders = response.headers["access-control-expose-headers"];
      expect(exposedHeaders).toContain("X-Request-Id");
      expect(exposedHeaders).toContain("X-Invoice-Required");
    });

    it("should include X-Invoice-* in allowed headers", async () => {
      const response = await request(app)
        .options("/api/merchant/test")
        .set("Origin", "http://localhost:3000")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "x-invoice-company-name, x-invoice-email")
        .expect(200);

      const allowedHeaders = response.headers["access-control-allow-headers"];
      expect(allowedHeaders).toContain("x-invoice-company-name");
      expect(allowedHeaders).toContain("x-invoice-email");
    });
  });

  describe("404 Handling", () => {
    it("should return 404 for unknown routes", async () => {
      const response = await request(app)
        .get("/unknown/route")
        .expect(404);

      expect(response.body.error).toBe("Not Found");
      expect(response.body.supportedRoutes).toBeDefined();
    });

    it("should list supported routes in 404 response", async () => {
      const response = await request(app)
        .get("/nonexistent")
        .expect(404);

      expect(response.body.supportedRoutes).toContain("/health");
      expect(response.body.supportedRoutes).toContain("/api/merchant");
      expect(response.body.supportedRoutes).toContain("/queue/status");
    });
  });

  describe("Error Handling", () => {
    it("should handle JSON parse errors gracefully", async () => {
      const errorApp = createApp({
        merchantUrl: mockMerchantUrl,
      });

      const response = await request(errorApp)
        .post("/api/merchant/test")
        .set("Content-Type", "application/json")
        .send("{ invalid json }")
        .expect(400);
    });

    it("should handle unknown errors with 500", async () => {
      const errorApp = express();
      errorApp.use(cors());
      
      // Add a route that throws an error
      errorApp.get("/error", () => {
        throw new Error("Test error");
      });

      // Add the error handler from our server
      const { logger } = require("../../src/utils/logger");
      
      const response = await request(errorApp)
        .get("/error")
        .expect(500);

      expect(response.body.error).toBe("Internal Server Error");
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("Configuration", () => {
    it("should use default values when not provided", () => {
      const minimalApp = createApp({
        merchantUrl: mockMerchantUrl,
      });

      expect(minimalApp).toBeDefined();
    });

    it("should handle custom proxy path", () => {
      const customPathApp = createApp({
        merchantUrl: mockMerchantUrl,
        proxyPath: "/custom-proxy",
      });

      expect(customPathApp).toBeDefined();
    });
  });

  describe("Request Logging", () => {
    it("should log requests with invoice headers", async () => {
      const { logger } = require("../../src/utils/logger");
      
      await request(app)
        .get("/health")
        .expect(200);

      expect(logger.info).toHaveBeenCalled();
      
      const logCall = (logger.info as jest.Mock).mock.calls.find(
        (call: unknown[]) => {
          const obj = call[0] as Record<string, unknown>;
          return obj.msg === "Request completed";
        }
      );
      
      expect(logCall).toBeDefined();
    });
  });
});
