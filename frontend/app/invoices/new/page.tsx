'use client';

import { useState } from 'react';
import { apiPost } from '@/lib/api-client';
import { useRouter } from 'next/navigation';

export default function NewInvoicePage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    amount: '',
    currency: 'USD',
    customerEmail: '',
    customerName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiPost('/v1/invoices', formData);
      router.push('/invoices');
    } catch {
      setError('Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='p-8'>
      <div className='bg-white rounded shadow p-6'>
        <h1 className='text-xl font-bold mb-4'>New Invoice</h1>
        {error && <div className='text-red-500 mb-4'>{error}</div>}
        <form onSubmit={handleSubmit} role='form'>
          <div className='mb-4'>
            <label className='block mb-1'>Amount</label>
            <input
              type='number'
              step='0.01'
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className='w-full border p-2 rounded'
              required
            />
          </div>
          <div className='mb-4'>
            <label className='block mb-1'>Currency</label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              className='w-full border p-2 rounded'
            >
              <option value='USD'>USD</option>
              <option value='EUR'>EUR</option>
              <option value='GBP'>GBP</option>
            </select>
          </div>
          <div className='mb-4'>
            <label className='block mb-1'>Customer Email</label>
            <input
              type='email'
              value={formData.customerEmail}
              onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
              className='w-full border p-2 rounded'
              required
            />
          </div>
          <div className='mb-4'>
            <label className='block mb-1'>Customer Name</label>
            <input
              type='text'
              value={formData.customerName}
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
              className='w-full border p-2 rounded'
              required
            />
          </div>
          <button
            type='submit'
            disabled={loading}
            className='w-full bg-sky-600 text-white p-2 rounded'
          >
            {loading ? 'Creating...' : 'Create Invoice'}
          </button>
        </form>
      </div>
    </div>
  );
}
