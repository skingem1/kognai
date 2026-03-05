import { render, screen } from '@testing-library/react';
import WebhookEventCard from '../webhook-event-card';

const mockDate = new Date('2024-01-15T12:00:00Z');

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(mockDate);
});

afterAll(() => {
  jest.useRealTimers();
});

describe('WebhookEventCard', () => {
  it('renders event type as h3 heading with font-bold', () => {
    render(<WebhookEventCard eventType="payment.succeeded" eventId="evt_123" timestamp="2024-01-15T12:00:00Z" status="delivered" />);
    expect(screen.getByRole('heading', { name: 'payment.succeeded' })).toHaveClass('font-bold');
  });

  it('renders event ID in monospace text', () => {
    render(<WebhookEventCard eventType="test" eventId="evt_abc" timestamp="2024-01-15T12:00:00Z" status="delivered" />);
    expect(screen.getByText('evt_abc')).toHaveClass('font-mono');
  });

  it('renders "Just now" for current timestamp', () => {
    render(<WebhookEventCard eventType="test" eventId="evt_1" timestamp="2024-01-15T12:00:00Z" status="delivered" />);
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  it('renders minutes ago for recent timestamp', () => {
    render(<WebhookEventCard eventType="test" eventId="evt_2" timestamp="2024-01-15T11:55:00Z" status="delivered" />);
    expect(screen.getByText('5 minute(s) ago')).toBeInTheDocument();
  });

  it('renders hours ago for older timestamp', () => {
    render(<WebhookEventCard eventType="test" eventId="evt_3" timestamp="2024-01-15T08:00:00Z" status="delivered" />);
    expect(screen.getByText('4 hour(s) ago')).toBeInTheDocument();
  });

  it('renders days ago for timestamp from days before', () => {
    render(<WebhookEventCard eventType="test" eventId="evt_4" timestamp="2024-01-10T12:00:00Z" status="delivered" />);
    expect(screen.getByText('5 day(s) ago')).toBeInTheDocument();
  });

  it('shows correct status dot color for delivered', () => {
    render(<WebhookEventCard eventType="test" eventId="evt_5" timestamp="2024-01-15T12:00:00Z" status="delivered" />);
    const dot = screen.getByRole('presentation');
    expect(dot).toHaveClass('bg-green-500');
  });

  it('shows correct status dot color for failed', () => {
    render(<WebhookEventCard eventType="test" eventId="evt_6" timestamp="2024-01-15T12:00:00Z" status="failed" />);
    const dot = screen.getByRole('presentation');
    expect(dot).toHaveClass('bg-red-500');
  });

  it('shows correct aria-label for pending status', () => {
    render(<WebhookEventCard eventType="test" eventId="evt_7" timestamp="2024-01-15T12:00:00Z" status="pending" />);
    const dot = screen.getByRole('presentation');
    expect(dot).toHaveAttribute('aria-label', 'Status: pending');
  });
});