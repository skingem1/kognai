import { PrismaClient } from '@prisma/client';

/**
 * Global type declaration for extending NodeJS.Global
 */
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Prisma client singleton instance
 * Prevents multiple connections during development hot-reloading
 */
export const prisma = globalThis.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
  errorFormat: 'pretty',
});

/**
 * In development, cache the client to prevent connection exhaustion
 * on hot reloads
 */
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

/**
 * Graceful shutdown handler
 * Ensures database connections are properly closed on process termination
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Connect to the database
 * Useful for testing and explicit connection management
 */
export async function connectPrisma(): Promise<void> {
  await prisma.$connect();
}

export default prisma;
