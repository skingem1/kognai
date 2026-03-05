import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CreateInvoiceForm from "@/components/invoices/create-invoice-form";
import { apiPost } from "@/lib/api-client";

jest.mock("@/lib/api-client", () => ({
  apiPost: jest.fn(),
}));

const mockedApiPost = apiPost as jest.MockedFunction<typeof apiPost>;

describe("CreateInvoiceForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders all form fields", () => {
    render(<CreateInvoiceForm />);
    expect(screen.getByPlaceholderText("Recipient")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Amount")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Description")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByDisplayValue("")).toHaveAttribute("type", "date");
    expect(screen.getByRole("button", { name: /create invoice/i })).toBeInTheDocument();
  });

  it("shows validation error for empty recipient", async () => {
    render(<CreateInvoiceForm />);
    fireEvent.change(screen.getByPlaceholderText("Amount"), { target: { value: "100" } });
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Test" } });
    fireEvent.submit(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText("Recipient is required")).toBeInTheDocument();
    });
  });

  it("shows validation error for amount <= 0", async () => {
    render(<CreateInvoiceForm />);
    fireEvent.change(screen.getByPlaceholderText("Recipient"), { target: { value: "John" } });
    fireEvent.change(screen.getByPlaceholderText("Amount"), { target: { value: "0" } });
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Test" } });
    fireEvent.submit(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText("Amount must be greater than 0")).toBeInTheDocument();
    });
  });

  it("shows validation error for empty due_date", async () => {
    render(<CreateInvoiceForm />);
    fireEvent.change(screen.getByPlaceholderText("Recipient"), { target: { value: "John" } });
    fireEvent.change(screen.getByPlaceholderText("Amount"), { target: { value: "100" } });
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Test" } });
    fireEvent.submit(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText("Due date is required")).toBeInTheDocument();
    });
  });

  it("shows validation error for empty description", async () => {
    render(<CreateInvoiceForm />);
    fireEvent.change(screen.getByPlaceholderText("Recipient"), { target: { value: "John" } });
    fireEvent.change(screen.getByPlaceholderText("Amount"), { target: { value: "100" } });
    fireEvent.submit(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText("Description is required")).toBeInTheDocument();
    });
  });

  it("submits form successfully with valid data", async () => {
    mockedApiPost.mockResolvedValue({ id: "1" } as any);
    const onSuccess = jest.fn();
    render(<CreateInvoiceForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText("Recipient"), { target: { value: "John Doe" } });
    fireEvent.change(screen.getByPlaceholderText("Amount"), { target: { value: "100.50" } });
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Test invoice" } });
    fireEvent.change(screen.getByDisplayValue(""), { target: { value: "2024-12-31" } });
    fireEvent.submit(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockedApiPost).toHaveBeenCalledWith("/api/invoices", {
        recipient: "John Doe",
        amount: 100.5,
        currency: "USD",
        due_date: "2024-12-31",
        description: "Test invoice",
      });
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows loading state during submission", async () => {
    mockedApiPost.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
    render(<CreateInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("Recipient"), { target: { value: "John" } });
    fireEvent.change(screen.getByPlaceholderText("Amount"), { target: { value: "100" } });
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Test" } });
    fireEvent.change(screen.getByDisplayValue(""), { target: { value: "2024-12-31" } });
    fireEvent.submit(screen.getByRole("button"));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText("Creating...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create invoice/i })).toBeInTheDocument();
    });
  });

  it("shows error message on API failure", async () => {
    mockedApiPost.mockRejectedValue(new Error("API Error"));
    render(<CreateInvoiceForm />);

    fireEvent.change(screen.getByPlaceholderText("Recipient"), { target: { value: "John" } });
    fireEvent.change(screen.getByPlaceholderText("Amount"), { target: { value: "100" } });
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Test" } });
    fireEvent.change(screen.getByDisplayValue(""), { target: { value: "2024-12-31" } });
    fireEvent.submit(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("Failed to create invoice")).toBeInTheDocument();
    });
  });

  it("calls onSuccess callback on successful submission", async () => {
    mockedApiPost.mockResolvedValue({ id: "1" } as any);
    const onSuccess = jest.fn();
    render(<CreateInvoiceForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText("Recipient"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByPlaceholderText("Amount"), { target: { value: "250" } });
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Consulting" } });
    fireEvent.change(screen.getByDisplayValue(""), { target: { value: "2024-06-15" } });
    fireEvent.submit(screen.getByRole("button"));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("allows currency selection", () => {
    render(<CreateInvoiceForm />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "EUR" } });
    expect(select.value).toBe("EUR");
  });
});
