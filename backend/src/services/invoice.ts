import { prisma } from '../db/client';
import { Prisma, InvoiceStatus } from '@prisma/client';
import { z } from 'zod';

/**
 * Custom error class for invoice not found scenarios
 */
export class InvoiceNotFoundError extends Error {
  public readonly invoiceId: string;
  public readonly code: string = 'INVOICE_NOT_FOUND';

  constructor(invoiceId: string, message?: string) {
    const defaultMessage = `Invoice with ID "${invoiceId}" not found`;
    super(message ?? defaultMessage);
    this.name = 'InvoiceNotFoundError';
    this.invoiceId = invoiceId;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for invalid status transitions
 */
export class InvalidStatusTransitionError extends Error {
  public readonly currentStatus: InvoiceStatus;
  public readonly targetStatus: InvoiceStatus;
  public readonly code: string = 'INVALID_STATUS_TRANSITION';

  constructor(currentStatus: InvoiceStatus, targetStatus: InvoiceStatus) {
    const message = `Cannot transition from ${currentStatus} to ${targetStatus}`;
    super(message);
    this.name = 'InvalidStatusTransitionError';
    this.currentStatus = currentStatus;
    this.targetStatus = targetStatus;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Input schema for creating a pending invoice
 */
export const CreateInvoiceInputSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3, 'Currency must be a 3-letter code').default('USD'),
  customerEmail: z.string().email('Invalid email address'),
  customerName: z.string().min(1, 'Customer name is required'),
  companyId: z.string().optional(),
  paymentDetails: z.record(z.string(), z.unknown()).optional(),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInputSchema>;

/**
 * Input schema for updating payment details
 */
export const UpdatePaymentDetailsInputSchema = z.object({
  paymentDetails: z.record(z.string(), z.unknown()),
});

export type UpdatePaymentDetailsInput = z.infer<typeof UpdatePaymentDetailsInputSchema>;

/**
 * Valid status transitions map
 */
const VALID_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  [InvoiceStatus.PENDING]: [InvoiceStatus.SETTLED],
  [InvoiceStatus.SETTLED]: [InvoiceStatus.PROCESSING],
  [InvoiceStatus.PROCESSING]: [InvoiceStatus.COMPLETED],
  [InvoiceStatus.COMPLETED]: [],
};

/**
 * Validates if a status transition is allowed
 * @param currentStatus - Current invoice status
 * @param targetStatus - Desired target status
 * @returns true if transition is valid
 */
export function isValidStatusTransition(
  currentStatus: InvoiceStatus,
  targetStatus: InvoiceStatus
): boolean {
  const allowedTransitions = VALID_TRANSITIONS[currentStatus];
  return allowedTransitions?.includes(targetStatus) ?? false;
}

/**
 * Gets the next invoice number using PostgreSQL sequence
 * Uses a transaction to ensure atomicity
 * @param prismaClient - Optional Prisma transaction client
 * @returns Next available invoice number
 */
async function getNextInvoiceNumber(
  prismaClient: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  // Use PostgreSQL sequence for atomic invoice number generation
  const result = await prismaClient.$queryRaw<[{ nextval: bigint }]>`
    SELECT nextval('invoice_number_seq') as nextval
  `;
  
  return Number(result[0].nextval);
}

/**
 * Creates a new pending invoice with atomic invoice number generation
 * @param input - Invoice creation input data
 * @returns Created invoice record
 * @throws {Prisma.PrismaClientKnownRequestError} On database errors
 */
export async function createPendingInvoice(
  input: CreateInvoiceInput
): Promise<{
  id: string;
  invoiceNumber: number;
  status: InvoiceStatus;
  amount: Prisma.Decimal;
  currency: string;
  customerEmail: string;
  customerName: string;
  paymentDetails: any;
  settledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  const validatedInput = CreateInvoiceInputSchema.parse(input);

  // Use transaction to ensure atomic invoice number generation and creation
  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await getNextInvoiceNumber(tx);

    return tx.invoice.create({
      data: {
        invoiceNumber,
        status: InvoiceStatus.PENDING,
        amount: validatedInput.amount,
        currency: validatedInput.currency,
        customerEmail: validatedInput.customerEmail,
        customerName: validatedInput.customerName,
        companyId: validatedInput.companyId ?? null,
        paymentDetails: (validatedInput.paymentDetails ?? undefined) as any,
      },
    });
  });

  return invoice as typeof invoice;
}

/**
 * Updates payment details for an existing invoice
 * @param invoiceId - UUID of the invoice
 * @param paymentDetails - New payment details to set
 * @returns Updated invoice record
 * @throws {InvoiceNotFoundError} If invoice doesn't exist
 * @throws {InvalidStatusTransitionError} If invoice cannot be modified in current state
 */
export async function updatePaymentDetails(
  invoiceId: string,
  paymentDetails: Record<string, unknown>
): Promise<{
  id: string;
  invoiceNumber: number;
  status: InvoiceStatus;
  amount: Prisma.Decimal;
  currency: string;
  customerEmail: string;
  customerName: string;
  paymentDetails: any;
  settledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  UpdatePaymentDetailsInputSchema.parse({ paymentDetails });

  const existingInvoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!existingInvoice) {
    throw new InvoiceNotFoundError(invoiceId);
  }

  // Can only update payment details when in PENDING or SETTLED state
  if (
    existingInvoice.status !== InvoiceStatus.PENDING &&
    existingInvoice.status !== InvoiceStatus.SETTLED
  ) {
    throw new InvalidStatusTransitionError(
      existingInvoice.status,
      existingInvoice.status // Staying in same state, but we throw because we can't modify
    );
  }

  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paymentDetails: paymentDetails as Prisma.InputJsonValue,
    },
  });

  return updatedInvoice as typeof updatedInvoice;
}

/**
 * Marks an invoice as settled (transition from PENDING to SETTLED)
 * @param invoiceId - UUID of the invoice
 * @returns Updated invoice record with settledAt timestamp
 * @throws {InvoiceNotFoundError} If invoice doesn't exist
 * @throws {InvalidStatusTransitionError} If transition is not allowed
 */
export async function markAsSettled(
  invoiceId: string
): Promise<{
  id: string;
  invoiceNumber: number;
  status: InvoiceStatus;
  amount: Prisma.Decimal;
  currency: string;
  customerEmail: string;
  customerName: string;
  paymentDetails: any;
  settledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  const existingInvoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!existingInvoice) {
    throw new InvoiceNotFoundError(invoiceId);
  }

  if (!isValidStatusTransition(existingInvoice.status, InvoiceStatus.SETTLED)) {
    throw new InvalidStatusTransitionError(
      existingInvoice.status,
      InvoiceStatus.SETTLED
    );
  }

  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.SETTLED,
      settledAt: new Date(),
    },
  });

  return updatedInvoice as typeof updatedInvoice;
}

/**
 * Marks an invoice as processing (transition from SETTLED to PROCESSING)
 * @param invoiceId - UUID of the invoice
 * @returns Updated invoice record
 * @throws {InvoiceNotFoundError} If invoice doesn't exist
 * @throws {InvalidStatusTransitionError} If transition is not allowed
 */
export async function markAsProcessing(
  invoiceId: string
): Promise<{
  id: string;
  invoiceNumber: number;
  status: InvoiceStatus;
  amount: Prisma.Decimal;
  currency: string;
  customerEmail: string;
  customerName: string;
  paymentDetails: any;
  settledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  const existingInvoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!existingInvoice) {
    throw new InvoiceNotFoundError(invoiceId);
  }

  if (!isValidStatusTransition(existingInvoice.status, InvoiceStatus.PROCESSING)) {
    throw new InvalidStatusTransitionError(
      existingInvoice.status,
      InvoiceStatus.PROCESSING
    );
  }

  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.PROCESSING,
    },
  });

  return updatedInvoice as typeof updatedInvoice;
}

/**
 * Marks an invoice as completed (transition from PROCESSING to COMPLETED)
 * @param invoiceId - UUID of the invoice
 * @returns Updated invoice record with completedAt timestamp
 * @throws {InvoiceNotFoundError} If invoice doesn't exist
 * @throws {InvalidStatusTransitionError} If transition is not allowed
 */
export async function markAsCompleted(
  invoiceId: string
): Promise<{
  id: string;
  invoiceNumber: number;
  status: InvoiceStatus;
  amount: Prisma.Decimal;
  currency: string;
  customerEmail: string;
  customerName: string;
  paymentDetails: any;
  settledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  const existingInvoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!existingInvoice) {
    throw new InvoiceNotFoundError(invoiceId);
  }

  if (!isValidStatusTransition(existingInvoice.status, InvoiceStatus.COMPLETED)) {
    throw new InvalidStatusTransitionError(
      existingInvoice.status,
      InvoiceStatus.COMPLETED
    );
  }

  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.COMPLETED,
      completedAt: new Date(),
    },
  });

  return updatedInvoice as typeof updatedInvoice;
}

/**
 * Retrieves an invoice by ID
 * @param invoiceId - UUID of the invoice
 * @returns Invoice record or null if not found
 */
export async function getInvoiceById(
  invoiceId: string
): Promise<{
  id: string;
  invoiceNumber: number;
  status: InvoiceStatus;
  amount: Prisma.Decimal;
  currency: string;
  customerEmail: string;
  customerName: string;
  paymentDetails: any;
  settledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  return invoice as typeof invoice;
}

/**
 * Retrieves an invoice by invoice number
 * @param invoiceNumber - Sequential invoice number
 * @returns Invoice record or null if not found
 */
export async function getInvoiceByNumber(
  invoiceNumber: number
): Promise<{
  id: string;
  invoiceNumber: number;
  status: InvoiceStatus;
  amount: Prisma.Decimal;
  currency: string;
  customerEmail: string;
  customerName: string;
  paymentDetails: any;
  settledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber },
  });

  return invoice as typeof invoice;
}
