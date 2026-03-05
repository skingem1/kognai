import {
  createPendingInvoice,
  updatePaymentDetails,
  markAsSettled,
  markAsProcessing,
  markAsCompleted,
  getInvoiceById,
  getInvoiceByNumber,
  InvoiceNotFoundError,
  InvalidStatusTransitionError,
  CreateInvoiceInput,
} from '../../src/services/invoice';
import { prisma, connectPrisma, disconnectPrisma } from '../../src/db/client';
import { InvoiceStatus } from '@prisma/client';

/**
 * Test database setup and teardown
 */
beforeAll(async () => {
  // Create the sequence if it doesn't exist
  await prisma.$executeRaw`
    CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1000;
  `;
  await connectPrisma();
});

afterAll(async () => {
  // Clean up test data
  await prisma.invoice.deleteMany({});
  await disconnectPrisma();
});

beforeEach(async () => {
  // Clean up before each test
  await prisma.invoice.deleteMany({});
});

/**
 * Test fixtures
 */
const validInvoiceInput: CreateInvoiceInput = {
  amount: 100.00,
  currency: 'USD',
  customerEmail: 'test@example.com',
  customerName: 'Test Customer',
  paymentDetails: {
    paymentMethod: 'credit_card',
    cardLast4: '1234',
  },
};

describe('createPendingInvoice', () => {
  it('should create a pending invoice with valid input', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);

    expect(invoice).toBeDefined();
    expect(invoice.id).toBeDefined();
    expect(invoice.invoiceNumber).toBeGreaterThanOrEqual(1000);
    expect(invoice.status).toBe(InvoiceStatus.PENDING);
    expect(invoice.amount.toString()).toBe('100.00');
    expect(invoice.currency).toBe('USD');
    expect(invoice.customerEmail).toBe('test@example.com');
    expect(invoice.customerName).toBe('Test Customer');
    expect(invoice.paymentDetails).toEqual({
      paymentMethod: 'credit_card',
      cardLast4: '1234',
    });
    expect(invoice.settledAt).toBeNull();
    expect(invoice.completedAt).toBeNull();
    expect(invoice.createdAt).toBeDefined();
    expect(invoice.updatedAt).toBeDefined();
  });

  it('should generate sequential invoice numbers atomically', async () => {
    const invoice1 = await createPendingInvoice(validInvoiceInput);
    const invoice2 = await createPendingInvoice({
      ...validInvoiceInput,
      customerEmail: 'second@example.com',
    });

    // Invoice numbers should be sequential
    expect(invoice2.invoiceNumber).toBe(invoice1.invoiceNumber + 1);
  });

  it('should use default currency when not provided', async () => {
    const inputWithoutCurrency = {
      amount: 50.00,
      customerEmail: 'test@example.com',
      customerName: 'Test Customer',
    };

    const invoice = await createPendingInvoice(inputWithoutCurrency);

    expect(invoice.currency).toBe('USD');
  });

  it('should throw validation error for invalid email', async () => {
    const invalidInput = {
      ...validInvoiceInput,
      customerEmail: 'invalid-email',
    };

    await expect(createPendingInvoice(invalidInput)).rejects.toThrow();
  });

  it('should throw validation error for negative amount', async () => {
    const invalidInput = {
      ...validInvoiceInput,
      amount: -10.00,
    };

    await expect(createPendingInvoice(invalidInput)).rejects.toThrow();
  });

  it('should throw validation error for invalid currency length', async () => {
    const invalidInput = {
      ...validInvoiceInput,
      currency: 'USDD', // Too long
    };

    await expect(createPendingInvoice(invalidInput)).rejects.toThrow();
  });

  it('should throw validation error for empty customer name', async () => {
    const invalidInput = {
      ...validInvoiceInput,
      customerName: '',
    };

    await expect(createPendingInvoice(invalidInput)).rejects.toThrow();
  });
});

describe('updatePaymentDetails', () => {
  it('should update payment details for a pending invoice', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);

    const newPaymentDetails = {
      paymentMethod: 'bank_transfer',
      referenceNumber: 'REF-12345',
    };

    const updatedInvoice = await updatePaymentDetails(
      invoice.id,
      newPaymentDetails
    );

    expect(updatedInvoice.paymentDetails).toEqual(newPaymentDetails);
    expect(updatedInvoice.status).toBe(InvoiceStatus.PENDING);
  });

  it('should update payment details for a settled invoice', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);
    await markAsSettled(invoice.id);

    const newPaymentDetails = {
      paymentMethod: 'bank_transfer',
      referenceNumber: 'REF-12345',
    };

    const updatedInvoice = await updatePaymentDetails(
      invoice.id,
      newPaymentDetails
    );

    expect(updatedInvoice.paymentDetails).toEqual(newPaymentDetails);
    expect(updatedInvoice.status).toBe(InvoiceStatus.SETTLED);
  });

  it('should throw InvoiceNotFoundError for non-existent invoice', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    await expect(
      updatePaymentDetails(nonExistentId, { paymentMethod: 'test' })
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it('should throw error when updating completed invoice', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);
    await markAsSettled(invoice.id);
    await markAsProcessing(invoice.id);
    await markAsCompleted(invoice.id);

    await expect(
      updatePaymentDetails(invoice.id, { paymentMethod: 'test' })
    ).rejects.toThrow(InvalidStatusTransitionError);
  });
});

describe('markAsSettled', () => {
  it('should transition invoice from PENDING to SETTLED', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);

    expect(invoice.status).toBe(InvoiceStatus.PENDING);
    expect(invoice.settledAt).toBeNull();

    const settledInvoice = await markAsSettled(invoice.id);

    expect(settledInvoice.status).toBe(InvoiceStatus.SETTLED);
    expect(settledInvoice.settledAt).toBeInstanceOf(Date);
  });

  it('should throw InvoiceNotFoundError for non-existent invoice', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    await expect(markAsSettled(nonExistentId)).rejects.toThrow(
      InvoiceNotFoundError
    );
  });

  it('should throw InvalidStatusTransitionError when not in PENDING state', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);
    await markAsSettled(invoice.id);

    // Try to settle again - should fail
    await expect(markAsSettled(invoice.id)).rejects.toThrow(
      InvalidStatusTransitionError
    );
  });

  it('should preserve invoice data when marking as settled', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);
    const settledInvoice = await markAsSettled(invoice.id);

    expect(settledInvoice.id).toBe(invoice.id);
    expect(settledInvoice.invoiceNumber).toBe(invoice.invoiceNumber);
    expect(settledInvoice.amount.toString()).toBe(invoice.amount.toString());
    expect(settledInvoice.customerEmail).toBe(invoice.customerEmail);
    expect(settledInvoice.customerName).toBe(invoice.customerName);
  });
});

describe('markAsProcessing', () => {
  it('should transition invoice from SETTLED to PROCESSING', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);
    await markAsSettled(invoice.id);

    const processingInvoice = await markAsProcessing(invoice.id);

    expect(processingInvoice.status).toBe(InvoiceStatus.PROCESSING);
  });

  it('should throw InvalidStatusTransitionError when not in SETTLED state', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);

    // Cannot go directly from PENDING to PROCESSING
    await expect(markAsProcessing(invoice.id)).rejects.toThrow(
      InvalidStatusTransitionError
    );
  });
});

describe('markAsCompleted', () => {
  it('should transition invoice from PROCESSING to COMPLETED', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);
    await markAsSettled(invoice.id);
    await markAsProcessing(invoice.id);

    const completedInvoice = await markAsCompleted(invoice.id);

    expect(completedInvoice.status).toBe(InvoiceStatus.COMPLETED);
    expect(completedInvoice.completedAt).toBeInstanceOf(Date);
  });

  it('should throw InvalidStatusTransitionError when not in PROCESSING state', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);
    await markAsSettled(invoice.id);

    // Cannot go directly from SETTLED to COMPLETED
    await expect(markAsCompleted(invoice.id)).rejects.toThrow(
      InvalidStatusTransitionError
    );
  });
});

describe('Full status transition flow', () => {
  it('should complete full PENDING -> SETTLED -> PROCESSING -> COMPLETED flow', async () => {
    // Step 1: Create pending invoice
    const invoice = await createPendingInvoice(validInvoiceInput);
    expect(invoice.status).toBe(InvoiceStatus.PENDING);

    // Step 2: Mark as settled
    const settledInvoice = await markAsSettled(invoice.id);
    expect(settledInvoice.status).toBe(InvoiceStatus.SETTLED);
    expect(settledInvoice.settledAt).toBeInstanceOf(Date);

    // Step 3: Mark as processing
    const processingInvoice = await markAsProcessing(invoice.id);
    expect(processingInvoice.status).toBe(InvoiceStatus.PROCESSING);

    // Step 4: Mark as completed
    const completedInvoice = await markAsCompleted(invoice.id);
    expect(completedInvoice.status).toBe(InvoiceStatus.COMPLETED);
    expect(completedInvoice.completedAt).toBeInstanceOf(Date);

    // Verify final state
    const finalInvoice = await getInvoiceById(invoice.id);
    expect(finalInvoice?.status).toBe(InvoiceStatus.COMPLETED);
    expect(finalInvoice?.settledAt).toBeInstanceOf(Date);
    expect(finalInvoice?.completedAt).toBeInstanceOf(Date);
  });

  it('should prevent skipping states in the transition flow', async () => {
    const invoice = await createPendingInvoice(validInvoiceInput);

    // Cannot skip from PENDING directly to PROCESSING
    await expect(markAsProcessing(invoice.id)).rejects.toThrow(
      InvalidStatusTransitionError
    );

    // Cannot skip from PENDING directly to COMPLETED
    await expect(markAsCompleted(invoice.id)).rejects.toThrow(
      InvalidStatusTransitionError
    );

    // Cannot skip from SETTLED directly to COMPLETED
    await markAsSettled(invoice.id);
    await expect(markAsCompleted(invoice.id)).rejects.toThrow(
      InvalidStatusTransitionError
    );
  });
});

describe('getInvoiceById', () => {
  it('should return invoice when found', async () => {
    const createdInvoice = await createPendingInvoice(validInvoiceInput);

    const foundInvoice = await getInvoiceById(createdInvoice.id);

    expect(foundInvoice).toBeDefined();
    expect(foundInvoice?.id).toBe(createdInvoice.id);
    expect(foundInvoice?.invoiceNumber).toBe(createdInvoice.invoiceNumber);
  });

  it('should return null when invoice not found', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const foundInvoice = await getInvoiceById(nonExistentId);

    expect(foundInvoice).toBeNull();
  });
});

describe('getInvoiceByNumber', () => {
  it('should return invoice when found by invoice number', async () => {
    const createdInvoice = await createPendingInvoice(validInvoiceInput);

    const foundInvoice = await getInvoiceByNumber(createdInvoice.invoiceNumber);

    expect(foundInvoice).toBeDefined();
    expect(foundInvoice?.id).toBe(createdInvoice.id);
    expect(foundInvoice?.invoiceNumber).toBe(createdInvoice.invoiceNumber);
  });

  it('should return null when invoice number not found', async () => {
    const foundInvoice = await getInvoiceByNumber(999999);

    expect(foundInvoice).toBeNull();
  });
});

describe('Error classes', () => {
  it('InvoiceNotFoundError should have correct properties', () => {
    const error = new InvoiceNotFoundError('test-id', 'Custom message');

    expect(error.name).toBe('InvoiceNotFoundError');
    expect(error.invoiceId).toBe('test-id');
    expect(error.code).toBe('INVOICE_NOT_FOUND');
    expect(error.message).toBe('Custom message');
  });

  it('InvoiceNotFoundError should use default message when not provided', () => {
    const error = new InvoiceNotFoundError('test-id');

    expect(error.message).toBe('Invoice with ID "test-id" not found');
  });

  it('InvalidStatusTransitionError should have correct properties', () => {
    const error = new InvalidStatusTransitionError(
      InvoiceStatus.PENDING,
      InvoiceStatus.COMPLETED
    );

    expect(error.name).toBe('InvalidStatusTransitionError');
    expect(error.currentStatus).toBe(InvoiceStatus.PENDING);
    expect(error.targetStatus).toBe(InvoiceStatus.COMPLETED);
    expect(error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('Concurrent invoice creation', () => {
  it('should handle concurrent invoice creation without number collisions', async () => {
    // Create multiple invoices concurrently
    const invoicePromises = Array.from({ length: 10 }, (_, i) =>
      createPendingInvoice({
        ...validInvoiceInput,
        customerEmail: `concurrent${i}@example.com`,
        customerName: `Concurrent Customer ${i}`,
      })
    );

    const invoices = await Promise.all(invoicePromises);

    // All invoice numbers should be unique
    const invoiceNumbers = invoices.map((inv) => inv.invoiceNumber);
    const uniqueNumbers = new Set(invoiceNumbers);

    expect(uniqueNumbers.size).toBe(10);
    
    // Numbers should be sequential (within the batch)
    const sortedNumbers = [...invoiceNumbers].sort((a, b) => a - b);
    for (let i = 1; i < sortedNumbers.length; i++) {
      expect(sortedNumbers[i] - sortedNumbers[i - 1]).toBe(1);
    }
  }, 30000); // Increase timeout for concurrent tests
});
