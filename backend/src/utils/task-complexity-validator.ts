import { z } from 'zod';

/**
 * Validation schema for task complexity requirements
 */
const TaskComplexitySchema = z.object({
  filePath: z.string(),
  context: z.string().max(600, 'Context must not exceed 600 characters'),
  agent: z.enum(['frontend-core', 'backend-core', 'fullstack-core'], {
    errorMap: () => ({ message: 'Agent must be one of: frontend-core, backend-core, fullstack-core' })
  }),
  type: z.enum(['feature', 'bug', 'refactor'], {
    errorMap: () => ({ message: 'Type must be one of: feature, bug, refactor' })
  }),
  priority: z.enum(['low', 'medium', 'high'], {
    errorMap: () => ({ message: 'Priority must be one of: low, medium, high' })
  }),
  dependencies: z.array(z.string()).length(0, 'Dependencies array must be empty')
});

/**
 * Task complexity validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Task complexity validation input
 */
export interface TaskComplexityInput {
  filePath: string;
  context: string;
  agent: string;
  type: string;
  priority: string;
  dependencies: string[];
}

/**
 * Validates task complexity requirements according to the 6-point validation criteria:
 * 1. Single-file enforcement
 * 2. Context limit of 600 characters
 * 3. Valid agent values (frontend-core, backend-core, fullstack-core)
 * 4. Type constraints (feature, bug, refactor)
 * 5. Priority enforcement (low, medium, high)
 * 6. Empty dependencies structure
 * 
 * @param input - The task complexity input to validate
 * @returns ValidationResult with valid flag and array of error messages
 */
export function validateTaskComplexity(input: TaskComplexityInput): ValidationResult {
  const result = TaskComplexitySchema.safeParse(input);
  
  if (result.success) {
    return {
      valid: true,
      errors: []
    };
  }

  const errors = result.error.errors.map(error => {
    if (error.path.length > 0) {
      return `${error.path.join('.')}: ${error.message}`;
    }
    return error.message;
  });

  return {
    valid: false,
    errors
  };
}