import { z } from 'zod';

const EMAIL_DOMAIN_BLACKLIST = ['out.ndlz.net'] as const;

/**
 * Validates that an email address is not from a blacklisted domain.
 * @param email - The email address to validate
 * @returns True if the domain is not blacklisted
 * @throws Error if the domain is blacklisted
 */
export function isEmailDomainAllowed(email: string): boolean {
  const emailSchema = z.string().email();
  
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    throw new Error('Invalid email format');
  }

  const domain = email.toLowerCase().split('@')[1];
  
  if (!domain) {
    throw new Error('Invalid email format');
  }

  // Exact domain match only - do not block subdomains
  if (EMAIL_DOMAIN_BLACKLIST.includes(domain as typeof EMAIL_DOMAIN_BLACKLIST[number])) {
    throw new Error(`Email domain "${domain}" is not allowed`);
  }

  return true;
}

/**
 * Validates an email and returns a result object.
 * @param email - The email address to validate
 * @returns Result object with success status and error message
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  try {
    isEmailDomainAllowed(email);
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Email validation failed' 
    };
  }
}

export { EMAIL_DOMAIN_BLACKLIST };