import React from "react";
import { render, screen } from "@testing-library/react";
import WebhookEventCard from "@/components/dashboard/webhook-event-card";

describe("WebhookEventCard", () => {
  it("renders event type, event ID, and relative timestamp", () => {
    const pastDate = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    render(
      <WebhookEventCard
        eventType="payment.completed"
        eventId="evt_123456"
        timestamp={pastDate}
        status="delivered"
      />
    );
    expect(screen.getByText("payment.completed")).toBeInTheDocument();
    expect(screen.getByText("evt_123456")).toBeInTheDocument();
    expect(screen.getByText(/minute/)).toBeInTheDocument();
  });

  it("displays green status dot for delivered", () => {
    const pastDate = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    render(
      <WebhookEventCard
        eventType="payment.completed"
        eventId="evt_123"
        timestamp={pastDate}
        status="delivered"
      />
    );
    expect(screen.getByRole("presentation")).toHaveClass("bg-green-500");
  });

  it("displays red status dot for failed", () => {
    const pastDate = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    render(
      <WebhookEventCard
        eventType="payment.failed"
        eventId="evt_456"
        timestamp={pastDate}
        status="failed"
      />
    );
    expect(screen.getByRole("presentation")).toHaveClass("bg-red-500");
  });

  it("displays yellow status dot for pending", () => {
    const pastDate = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    render(
      <WebhookEventCard
        eventType="payment.pending"
        eventId="evt_789"
        timestamp={pastDate}
        status="pending"
      />
    );
    expect(screen.getByRole("presentation")).toHaveClass("bg-yellow-500");
  });

  it("shows 'Just now' for timestamps less than a minute old", () => {
    const now = new Date().toISOString();
    render(
      <WebhookEventCard
        eventType="test.event"
        eventId="evt_test"
        timestamp={now}
        status="pending"
      />
    );
    expect(screen.getByText("Just now")).toBeInTheDocument();
  });

  it("formats days correctly for timestamps over 24 hours", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <WebhookEventCard
        eventType="test.event"
        eventId="evt_days"
        timestamp={twoDaysAgo}
        status="delivered"
      />
    );
    expect(screen.getByText("2 days ago")).toBeInTheDocument();
  });
});
