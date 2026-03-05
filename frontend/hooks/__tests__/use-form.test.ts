import { renderHook, act } from '@testing-library/react';
import { useForm } from '../use-form';

describe('useForm', () => {
  it('initializes with values', () => {
    const { result } = renderHook(() => useForm({ initialValues: { name: '', email: '' } }));
    expect(result.current.values).toEqual({ name: '', email: '' });
  });

  it('handleChange updates value', () => {
    const { result } = renderHook(() => useForm({ initialValues: { name: '', email: '' } }));
    act(() => result.current.handleChange('name', 'John'));
    expect(result.current.values.name).toBe('John');
  });

  it('handleBlur marks touched', () => {
    const { result } = renderHook(() => useForm({ initialValues: { name: '' } }));
    act(() => result.current.handleBlur('name'));
    expect(result.current.touched.name).toBe(true);
  });

  it('reset clears state', () => {
    const { result } = renderHook(() => useForm({ initialValues: { name: '' } }));
    act(() => { result.current.handleChange('name', 'John'); result.current.handleBlur('name'); });
    act(() => result.current.reset());
    expect(result.current.values.name).toBe('');
    expect(result.current.touched.name).toBeUndefined();
  });

  it('handleSubmit calls onSubmit when valid', () => {
    const onSubmit = jest.fn();
    const { result } = renderHook(() => useForm({ initialValues: { name: '', email: '' } }));
    act(() => result.current.handleChange('name', 'John'));
    act(() => result.current.handleSubmit(onSubmit));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'John', email: '' });
  });

  it('validate produces errors', () => {
    const { result } = renderHook(() => useForm({
      initialValues: { name: '' },
      validate: (v) => v.name ? {} : { name: 'Required' }
    }));
    act(() => result.current.handleChange('name', ''));
    expect(result.current.errors.name).toBe('Required');
  });

  it('isValid reflects errors', () => {
    const { result: r1 } = renderHook(() => useForm({
      initialValues: { name: '' },
      validate: (v) => v.name ? {} : { name: 'Required' }
    }));
    expect(r1.current.isValid).toBe(false);
    act(() => r1.current.handleChange('name', 'John'));
    expect(r1.current.isValid).toBe(true);
  });

  it('handleSubmit does not call onSubmit when invalid', () => {
    const onSubmit = jest.fn();
    const { result } = renderHook(() => useForm({
      initialValues: { name: '' },
      validate: (v) => v.name ? {} : { name: 'Required' }
    }));
    act(() => result.current.handleSubmit(onSubmit));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});