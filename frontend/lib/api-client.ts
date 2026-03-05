import { createClient } from '@/lib/supabase';

export interface ApiConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/api';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || errorData.message || `API Error: ${response.status}`);
  }
  return response.json();
}

export async function apiGet<T>(endpoint: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`${API_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.append(key, value);
    });
  }
  const headers = await getAuthHeaders();
  const response = await fetch(url.toString(), { method: 'GET', headers });
  return handleResponse<T>(response);
}

export async function apiPost<T>(endpoint: string, data?: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST', headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiDelete<T>(endpoint: string): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}${endpoint}`, { method: 'DELETE', headers });
  return handleResponse<T>(response);
}

export interface Settlement {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

export async function fetchSettlement(id: string): Promise<Settlement> {
  return apiGet<Settlement>(`/v1/settlements/${id}`);
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey;
  secret: string;
}

export async function fetchApiKeys(): Promise<ApiKey[]> {
  return apiGet<ApiKey[]>('/v1/api-keys');
}

export async function createNewApiKey(name: string, expiresInDays?: number): Promise<CreateApiKeyResponse> {
  return apiPost<CreateApiKeyResponse>('/v1/api-keys', { name, expiresInDays });
}

export async function deleteApiKey(id: string): Promise<void> {
  return apiDelete<void>(`/v1/api-keys/${id}`);
}

export async function revokeApiKey(id: string): Promise<void> {
  return apiDelete<void>(`/v1/api-keys/${id}`);
}

export async function rotateApiKey(id: string): Promise<CreateApiKeyResponse> {
  return apiPost<CreateApiKeyResponse>(`/v1/api-keys/${id}/rotate`);
}

export interface DashboardStats {
  totalInvoices: number;
  pending: number;
  settled: number;
  revenue: number;
  totalTax?: number;
}

export interface RecentActivityItem {
  id: string;
  title: string;
  description: string;
  status: 'success' | 'pending' | 'failed';
  timestamp: string;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return apiGet<DashboardStats>('/v1/dashboard/stats');
}

export async function fetchRecentActivity(): Promise<RecentActivityItem[]> {
  return apiGet<RecentActivityItem[]>('/v1/dashboard/activity');
}

export interface TaxSummary {
  totalSubtotal: number;
  totalTax: number;
  totalWithTax: number;
  invoiceCount: number;
  byCountry: Record<string, { count: number; subtotal: number; tax: number }>;
}

export async function fetchTaxSummary(): Promise<{ success: boolean; data: TaxSummary }> {
  return apiGet<{ success: boolean; data: TaxSummary }>('/v1/dashboard/tax-summary');
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  settledAt?: string;
  customerName?: string;
  customerEmail?: string;
  sellerName?: string;
  serviceDescription?: string;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  total?: number;
  taxType?: string;
  taxCountry?: string;
}

export interface InvoiceListResponse {
  invoices: InvoiceListItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchInvoices(params?: { limit?: string; offset?: string; status?: string }): Promise<InvoiceListResponse> {
  return apiGet<InvoiceListResponse>('/v1/invoices', params);
}

export async function fetchInvoiceById(id: string): Promise<InvoiceListItem & { metadata?: Record<string, unknown> }> {
  return apiGet<InvoiceListItem & { metadata?: Record<string, unknown> }>(`/v1/invoices/${id}`);
}

// Billing / Subscription
export interface BillingStatus {
  subscription_plan: 'free' | 'pro' | 'enterprise';
  subscription_status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_period_end: string | null;
  invoice_count_this_month: number;
  api_call_count_this_month: number;
}

export async function fetchBillingStatus(): Promise<BillingStatus> {
  const res = await apiGet<{ success: boolean; data: BillingStatus }>('/v1/billing/status');
  return res.data;
}

export async function createCheckoutSession(): Promise<{ url: string }> {
  const res = await apiPost<{ success: boolean; data: { url: string; sessionId: string } }>('/v1/billing/create-checkout');
  return { url: res.data.url };
}

export async function createPortalSession(): Promise<{ url: string }> {
  const res = await apiPost<{ success: boolean; data: { url: string } }>('/v1/billing/create-portal');
  return { url: res.data.url };
}

// Company Profile
export interface SupportedCountry {
  code: string;
  name: string;
  regLabel: string;
  regPlaceholder: string;
  regFormat: string;
  autoVerify: boolean;
}

export interface CompanyProfile {
  id: string;
  profile_type: 'registered_company' | 'web3_project';
  company_name: string | null;
  company_country: string | null;
  registration_number: string | null;
  verification_status: 'unverified' | 'pending' | 'verified' | 'failed' | 'not_applicable';
  verified_company_name: string | null;
  verified_at: string | null;
  verification_details: Record<string, unknown> | null;
  project_name: string | null;
  vat_number: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface VerifyCompanyResult {
  verified: boolean;
  method: string;
  companyName: string | null;
  address: string | null;
  status: string;
  message: string;
  profile: CompanyProfile;
}

export async function fetchSupportedCountries(): Promise<SupportedCountry[]> {
  const res = await apiGet<{ success: boolean; data: SupportedCountry[] }>('/v1/company/countries');
  return res.data;
}

export async function fetchCompanyProfile(): Promise<CompanyProfile | null> {
  const res = await apiGet<{ success: boolean; data: CompanyProfile | null }>('/v1/company/profile');
  return res.data;
}

export async function saveCompanyProfile(data: {
  profile_type: 'registered_company' | 'web3_project';
  company_name?: string;
  company_country?: string;
  registration_number?: string;
  vat_number?: string;
  address?: string;
  project_name?: string;
}): Promise<CompanyProfile> {
  const res = await apiPost<{ success: boolean; data: CompanyProfile }>('/v1/company/profile', data);
  return res.data;
}

export async function verifyCompanyProfile(): Promise<VerifyCompanyResult> {
  const res = await apiPost<{ success: boolean; data: VerifyCompanyResult }>('/v1/company/verify');
  return res.data;
}

export class ApiError extends Error {
  status: number;
  data?: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}
