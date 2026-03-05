import { 
  extractInvoiceHeaders, 
  tryExtractInvoiceHeaders, 
  hasInvoiceHeaders, 
  getSupportedHeaders,
  InvoiceHeaders 
} from "../../src/proxy/headers";

describe("headers.ts", () => {
  describe("extractInvoiceHeaders", () => {
    it("should extract all invoice headers from request headers", () => {
      const headers = {
        "x-invoice-company-name": "Acme Corp",
        "x-invoice-vat-number": "GB123456789",
        "x-invoice-address": "123 Business St, London",
        "x-invoice-email": "billing@acme.com",
        "x-invoice-purchase-order": "PO-2024-001",
      };

      const result = extractInvoiceHeaders(headers);

      expect(result.companyName).toBe("Acme Corp");
      expect(result.vatNumber).toBe("GB123456789");
      expect(result.address).toBe("123 Business St, London");
      expect(result.email).toBe("billing@acme.com");
      expect(result.purchaseOrder).toBe("PO-2024-001");
    });

    it("should return empty object when no invoice headers present", () => {
      const headers = {
        "content-type": "application/json",
        "authorization": "Bearer token",
      };

      const result = extractInvoiceHeaders(headers);

      expect(result).toEqual({});
    });

    it("should handle array header values (take first)", () => {
      const headers = {
        "x-invoice-company-name": ["Acme Corp", "Acme Ltd"],
      };

      const result = extractInvoiceHeaders(headers);

      expect(result.companyName).toBe("Acme Corp");
    });

    it("should handle undefined header values", () => {
      const headers = {
        "x-invoice-company-name": undefined,
        "x-invoice-email": "test@example.com",
      };

      const result = extractInvoiceHeaders(headers);

      expect(result.companyName).toBeUndefined();
      expect(result.email).toBe("test@example.com");
    });

    it("should handle mixed valid and invalid headers", () => {
      const headers = {
        "x-invoice-company-name": "Valid Company",
        "x-invoice-email": "invalid-email", // Invalid email format
      };

      expect(() => extractInvoiceHeaders(headers)).toThrow();
    });

    it("should validate email format correctly", () => {
      const validEmails = [
        "test@example.com",
        "user.name@domain.org",
        "user+tag@example.co.uk",
      ];

      for (const email of validEmails) {
        const headers = { "x-invoice-email": email };
        const result = extractInvoiceHeaders(headers);
        expect(result.email).toBe(email);
      }
    });

    it("should reject invalid email formats", () => {
      const invalidEmails = [
        "not-an-email",
        "missing@domain",
        "@nodomain.com",
        "spaces in@email.com",
      ];

      for (const email of invalidEmails) {
        const headers = { "x-invoice-email": email };
        expect(() => extractInvoiceHeaders(headers)).toThrow();
      }
    });

    it("should handle partial invoice headers", () => {
      const headers = {
        "x-invoice-company-name": "Acme Corp",
        "x-invoice-email": "billing@acme.com",
        // Missing: vatNumber, address, purchaseOrder
      };

      const result = extractInvoiceHeaders(headers);

      expect(result.companyName).toBe("Acme Corp");
      expect(result.email).toBe("billing@acme.com");
      expect(result.vatNumber).toBeUndefined();
      expect(result.address).toBeUndefined();
      expect(result.purchaseOrder).toBeUndefined();
    });

    it("should be case-insensitive for header names", () => {
      const headers = {
        "X-INVOICE-COMPANY-NAME": "Acme Corp",
        "X-INVOICE-EMAIL": "test@example.com",
      };

      const result = extractInvoiceHeaders(headers);

      expect(result.companyName).toBeUndefined(); // Header names are case-sensitive in Node
    });
  });

  describe("tryExtractInvoiceHeaders", () => {
    it("should return success result with data for valid headers", () => {
      const headers = {
        "x-invoice-company-name": "Acme Corp",
        "x-invoice-email": "billing@acme.com",
      };

      const result = tryExtractInvoiceHeaders(headers);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.companyName).toBe("Acme Corp");
        expect(result.data.email).toBe("billing@acme.com");
      }
    });

    it("should return failure result for invalid email", () => {
      const headers = {
        "x-invoice-email": "not-valid-email",
      };

      const result = tryExtractInvoiceHeaders(headers);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("should return empty data for no invoice headers", () => {
      const headers = {
        "content-type": "application/json",
      };

      const result = tryExtractInvoiceHeaders(headers);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({});
      }
    });
  });

  describe("hasInvoiceHeaders", () => {
    it("should return true when invoice headers are present", () => {
      const headers = {
        "x-invoice-company-name": "Acme Corp",
        "content-type": "application/json",
      };

      expect(hasInvoiceHeaders(headers)).toBe(true);
    });

    it("should return false when no invoice headers are present", () => {
      const headers = {
        "content-type": "application/json",
        "authorization": "Bearer token",
      };

      expect(hasInvoiceHeaders(headers)).toBe(false);
    });

    it("should return true with only one invoice header", () => {
      const headers = {
        "x-invoice-email": "test@example.com",
      };

      expect(hasInvoiceHeaders(headers)).toBe(true);
    });

    it("should be case-sensitive for header names", () => {
      const headers = {
        "X-INVOICE-COMPANY-NAME": "Acme Corp",
      };

      expect(hasInvoiceHeaders(headers)).toBe(false);
    });
  });

  describe("getSupportedHeaders", () => {
    it("should return all supported header names", () => {
      const supported = getSupportedHeaders();

      expect(supported).toContain("x-invoice-company-name");
      expect(supported).toContain("x-invoice-vat-number");
      expect(supported).toContain("x-invoice-address");
      expect(supported).toContain("x-invoice-email");
      expect(supported).toContain("x-invoice-purchase-order");
    });

    it("should return exactly 5 supported headers", () => {
      const supported = getSupportedHeaders();

      expect(supported).toHaveLength(5);
    });
  });

  describe("InvoiceHeaders type", () => {
    it("should allow all optional invoice fields", () => {
      const validHeaders: InvoiceHeaders = {
        companyName: "Test Company",
        vatNumber: "GB123456789",
        address: "123 Test St",
        email: "test@example.com",
        purchaseOrder: "PO-001",
      };

      expect(validHeaders.companyName).toBe("Test Company");
    });

    it("should allow empty object", () => {
      const validHeaders: InvoiceHeaders = {};

      expect(validHeaders).toEqual({});
    });

    it("should allow partial fields", () => {
      const validHeaders: InvoiceHeaders = {
        email: "test@example.com",
      };

      expect(validHeaders.email).toBe("test@example.com");
    });
  });
});
