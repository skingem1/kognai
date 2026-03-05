import { useState, useCallback } from 'react';
import type { FormEvent } from 'react';

interface UseFormOptions<T> {
  initialValues: T;
  validate?: (values: T) => Partial<Record<keyof T, string>>;
}

interface UseFormReturn<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  handleChange: (field: keyof T, value: T[keyof T]) => void;
  handleBlur: (field: keyof T) => void;
  handleSubmit: (onSubmit: (values: T) => void) => void;
  reset: () => void;
  isValid: boolean;
}

/**
 * Lightweight form state management hook.
 */
export function useForm<T extends Record<string, unknown>>(options: UseFormOptions<T>): UseFormReturn<T> {
  const [values, setValues] = useState<T>(options.initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  const handleChange = useCallback((field: keyof T, value: T[keyof T]) => {
    setValues(prev => {
      const updated = { ...prev, [field]: value };
      if (options.validate) setErrors(options.validate(updated));
      return updated;
    });
  }, [options.validate]);

  const handleBlur = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  const handleSubmit = useCallback((onSubmit: (values: T) => void) => {
    const validationErrors = options.validate ? options.validate(values) : {};
    setErrors(validationErrors);
    setTouched(Object.keys(values).reduce((acc, k) => ({ ...acc, [k]: true }), {}));
    if (Object.keys(validationErrors).length === 0) onSubmit(values);
  }, [options.validate, values]);

  const reset = useCallback(() => {
    setValues(options.initialValues);
    setErrors({});
    setTouched({});
  }, [options.initialValues]);

  const isValid = Object.keys(errors).length === 0;

  return { values, errors, touched, handleChange, handleBlur, handleSubmit, reset, isValid };
}