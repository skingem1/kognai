# Code Style Guide

## TypeScript Standards
- Use strict mode
- Prefer `const` over `let`
- Use explicit types for function parameters
- No `any` types (use `unknown` if needed)

## Naming Conventions
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Interfaces: `PascalCase`

## Error Handling
```typescript
class ServiceError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

// Always try-catch async operations
try {
  await someAsyncOperation();
} catch (error) {
  if (error instanceof ServiceError) {
    // Handle known errors
  }
  throw error; // Re-throw unknown errors
}
```

## Documentation
- Add JSDoc to all public functions
- Include @param, @returns, @throws
- Add examples for complex functions

## Testing
- Unit tests for all services
- Integration tests for API endpoints
- Use descriptive test names: `should create invoice with sequential number`

## File Organization
```
src/
├── services/     # Business logic
├── api/          # API routes
├── middleware/    # Express middleware
├── types/        # TypeScript types
└── utils/        # Helper functions
```
