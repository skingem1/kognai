export interface InvoicaConfig {
  baseUrl: string;
  apiKey: string;
}

export interface RequestOptions {
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
}