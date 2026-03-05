import React from "react";

interface StatsData {
  total_invoices: number;
  total_revenue: number;
  currency: string;
  pending_count: number;
  overdue_count: number;
}

interface StatsOverviewProps {
  stats: StatsData;
}

/**
 * Dashboard stats overview component displaying key metrics in a card grid layout.
 * Shows Total Invoices, Total Revenue, Pending Payments, and Overdue Invoices.
 */
export default function StatsOverview({ stats }: StatsOverviewProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const cards = [
    { label: "Total Invoices", value: stats.total_invoices, color: "text-blue-600" },
    { label: "Total Revenue", value: formatCurrency(stats.total_revenue, stats.currency), color: "text-green-600" },
    { label: "Pending Payments", value: stats.pending_count, color: "text-amber-600" },
    { label: "Overdue Invoices", value: stats.overdue_count, color: "text-red-600" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-sm text-gray-500 font-medium">{card.label}</p>
          <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}
