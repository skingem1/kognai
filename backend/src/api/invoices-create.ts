import { Request, Response } from 'express';
import { z } from 'zod';
import { createPendingInvoice } from '../services/invoice';

/**
 * Blacklisted email domains for spam prevention
 * Invoices cannot be created for merchants using these domains
 */
const SPAM_DOMAINS = [
  'out.ndlz.net',
  'example.com',
  'test.com',
  'fakeinbox.com',
  'mailinator.com',
  'throwaway.email',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
] as const;

export const createInvoiceSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  customerEmail: z.string().email(),
  customerName: z.string().min(1),
  merchant: z.object({
    email: z.string().email(),
    name: z.string().min(1),
  }).optional(),
});

type CreateInvoiceBody = z.infer<typeof createInvoiceSchema>;

/**
 * Extracts domain from an email address
 * @param email - The email address to extract domain from
 * @returns The domain part of the email or null if invalid
 */
function extractDomainFromEmail(email: string): string | null {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

/**
 * Checks if an email domain is in the spam blacklist
 * @param email - The email address to check
 * @returns True if the domain is blacklisted, false otherwise
 */
function isSpamDomain(email: string): boolean {
  const domain = extractDomainFromEmail(email);
  if (!domain) {
    return false;
  }
  return (SPAM_DOMAINS as readonly string[]).includes(domain);
}

/**
 * Logs blocked invoice creation attempts due to spam domains
 * @param merchantEmail - The merchant's email that was blocked
 * @param domain - The blacklisted domain
 */
function logBlockedAttempt(merchantEmail: string, domain: string): void {
  const timestamp = new Date().toISOString();
  console.log(
    JSON.stringify({
      level: 'warn',
      timestamp,
      event: 'INVOICE_CREATION_BLOCKED',
      reason: 'SPAM_DOMAIN_DETECTED',
      merchantEmail,
      blockedDomain: domain,
      message: `Invoice creation blocked: merchant email domain ${domain} is blacklisted`,
    })
  );
}

export async function createInvoice(req: Request, res: Response): Promise<void> {
  const parseResult = createInvoiceSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({ error: 'Invalid request body', details: parseResult.error.issues });
    return;
  }

  const { customerEmail, merchant } = parseResult.data;

  // Check if merchant email domain is blacklisted (if merchant info provided)
  if (merchant?.email) {
    const merchantDomain = extractDomainFromEmail(merchant.email);
    
    if (merchantDomain && isSpamDomain(merchant.email)) {
      logBlockedAttempt(merchant.email, merchantDomain);
      
      res.status(403).json({
        error: 'Invoice rejected',
        message: `Cannot create invoice: merchant email domain "${merchantDomain}" is not allowed. Please use a valid business email address.`,
      });
      return;
    }
  }

  try {
    const invoice = await createPendingInvoice(parseResult.data);
    res.status(201).json({
      id: invoice.id,
      number: 'INV-' + invoice.invoiceNumber,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      status: invoice.status.toLowerCase(),
      customerEmail: invoice.customerEmail,
      customerName: invoice.customerName,
      createdAt: invoice.createdAt.toISOString(),
      paidAt: null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}