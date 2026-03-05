import React from "react";
import { render, screen } from "@testing-library/react";
import StatsOverview from "../../components/dashboard/stats-overview";

describe("StatsOverview", () => {
  const defaultStats = {
    total_invoices: 150,
    total_revenue: 75000,
    currency: "USD",
    pending_count: 25,
    overdue_count: 10,
  };

  it("renders all four stat cards with correct labels", () => {
    render(<StatsOverview stats={defaultStats} />);
    expect(screen.getByText("Total Invoices")).toBeInTheDocument();
    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("Pending Payments")).toBeInTheDocument();
    expect(screen.getByText("Overdue Invoices")).toBeInTheDocument();
  });

  it("displays correct values for each stat", () => {
    render(<StatsOverview stats={defaultStats} />);
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("$75,000")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("handles zero values correctly", () => {
    const zeroStats = {
      total_invoices: 0,
      total_revenue: 0,
      currency: "USD",
      pending_count: 0,
      overdue_count: 0,
    };
    render(<StatsOverview stats={zeroStats} />);
    expect(screen.getByText("$0")).toBeInTheDocument();
  });

  it("formats different currencies correctly", () => {
    const eurStats = { ...defaultStats, currency: "EUR", total_revenue: 50000 };
    render(<StatsOverview stats={eurStats} />);
    expect(screen.getByText("€50,000")).toBeInTheDocument();
  });

  it("applies correct color classes to each card", () => {
    render(<StatsOverview stats={defaultStats} />);
    const cards = screen.getAllByRole("generic");
    const valueElements = cards.filter((card) => card.className.includes("text-2xl"));
    expect(valueElements.length).toBe(4);
  });

  it("renders with default USD currency when currency is not provided", () => {
    const statsWithoutCurrency = { ...defaultStats, currency: "" };
    render(<StatsOverview stats={statsWithoutCurrency} />);
    expect(screen.getByText("$75,000")).toBeInTheDocument();
  });
});
