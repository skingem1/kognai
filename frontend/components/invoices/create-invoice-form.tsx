"use client";

import { useState, FormEvent } from "react";
import { apiPost } from "@/lib/api-client";

interface CreateInvoiceFormProps {
  onSuccess?: () => void;
}

/**
 * Invoice creation form component
 * Handles form state, validation, and API submission
 */
export default function CreateInvoiceForm({ onSuccess }: CreateInvoiceFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    recipient: "",
    amount: "",
    currency: "USD",
    due_date: "",
    description: "",
  });

  const validate = (): string | null => {
    if (!formData.recipient.trim()) return "Recipient is required";
    if (!formData.amount || Number(formData.amount) <= 0) return "Amount must be greater than 0";
    if (!formData.due_date) return "Due date is required";
    if (!formData.description.trim()) return "Description is required";
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await apiPost("/api/invoices", {
        recipient: formData.recipient,
        amount: Number(formData.amount),
        currency: formData.currency,
        due_date: formData.due_date,
        description: formData.description,
      });
      onSuccess?.();
    } catch {
      setError("Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <input
        type="text"
        placeholder="Recipient"
        value={formData.recipient}
        onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
        className="w-full p-2 border rounded"
        required
      />
      <input
        type="number"
        placeholder="Amount"
        value={formData.amount}
        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
        className="w-full p-2 border rounded"
        min="0.01"
        step="0.01"
        required
      />
      <select
        value={formData.currency}
        onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
        className="w-full p-2 border rounded"
      >
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        <option value="GBP">GBP</option>
      </select>
      <input
        type="date"
        value={formData.due_date}
        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
        className="w-full p-2 border rounded"
        required
      />
      <textarea
        placeholder="Description"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        className="w-full p-2 border rounded"
        rows={3}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create Invoice"}
      </button>
    </form>
  );
}
