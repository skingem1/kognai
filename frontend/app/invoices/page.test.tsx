import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvoicesPage from "./page";

jest.mock("@/lib/api-client", () => ({
  fetchInvoices: jest.fn(),
}));

import { fetchInvoices } from "@/lib/api-client";

describe("InvoicesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading spinner while fetching", async () => {
    (fetchInvoices as jest.Mock).mockImplementation(
      () => new Promise(() => {})
    );
    render(<InvoicesPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows no invoices message when list is empty", async () => {
    (fetchInvoices as jest.Mock).mockResolvedValue({ invoices: [] });
    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByText("No invoices found")).toBeInTheDocument();
    });
  });

  it("displays invoice data in table when loaded", async () => {
    (fetchInvoices as jest.Mock).mockResolvedValue({
      invoices: [
        {
          id: "1",
          invoice_number: "INV-001",
          amount: 1000,
          currency: "USD",
          status: "paid",
          created_at: "2024-01-15",
        },
      ],
    });
    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByText("INV-001")).toBeInTheDocument();
    });
  });

  it("handles fetch error gracefully", async () => {
    (fetchInvoices as jest.Mock).mockRejectedValue(new Error("Failed"));
    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
