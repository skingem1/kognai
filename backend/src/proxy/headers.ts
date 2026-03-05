import { z } from "zod";

/**
 * Schema for extracted invoice headers
 */
export const InvoiceHeadersSchema = z.object({
  companyName: z.string().optional(),
  vatNumber: z.string().optional(),
  address: z.string().optional(),
  email: z.string().email().optional(),
  purchaseOrder: z.string().optional(),
});

export type InvoiceHeaders = z.infer<typeof InvoiceHeadersSchema>;

/**
 * Mapping of X-Invoice-* header names to their property names
 */
const HEADER_TO_PROPERTY_MAP: Record<string, keyof InvoiceHeaders> = {
  "x-invoice-company-name": "companyName",
  "x-invoice-vat-number": "vatNumber",
  "x-invoice-address": "address",
  "x-invoice-email": "email",
  "x-invoice-purchase-order": "purchaseOrder",
};

/**
 * Extracts X-Invoice-* headers from incoming HTTP request headers
 * 
 * @param headers - The incoming request headers object
 * @returns Parsed InvoiceHeaders object with extracted values
 * @throws ZodError if email format is invalid
 */
export function extractInvoiceHeaders(headers: Record<string, string | undefined | string[]>): InvoiceHeaders {
  const extracted: Partial<InvoiceHeaders> = {};

  for (const [headerName, propertyName] of Object.entries(HEADER_TO_PROPERTY_MAP)) {
    const headerValue = headers[headerName];
    
    if (headerValue && Array.isArray(headerValue)) {
      extracted[propertyName] = headerValue[0];
    } else if (headerValue && typeof headerValue === "string") {
      extracted[propertyName] = headerValue;
    }
  }

  return InvoiceHeadersSchema.parse(extracted);
}

/**
 * Extracts and validates X-Invoice-* headers, returning a safe result
 * 
 * @param headers - The incoming request headers object
 * @returns Object with either valid headers or error information
 */
export function tryExtractInvoiceHeaders(
  headers: Record<string, string | undefined | string[]>
): { success: true; data: InvoiceHeaders } | { success: false; error: string } {
  try {
    const data = extractInvoiceHeaders(headers);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: "Failed to extract invoice headers" };
  }
}

/**
 * Checks if any X-Invoice-* headers are present in the request
 * 
 * @param headers - The incoming request headers object
 * @returns true if any invoice headers are present
 */
export function hasInvoiceHeaders(headers: Record<string, string | undefined | string[]>): boolean {
  return Object.keys(HEADER_TO_PROPERTY_MAP).some(
    (headerName) => headerName in headers
  );
}

/**
 * Gets a list of all supported X-Invoice-* header names
 * 
 * @returns Array of supported header names
 */
export function getSupportedHeaders(): string[] {
  return Object.keys(HEADER_TO_PROPERTY_MAP);
}
