import React from 'react';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '../sidebar';

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: any }) =>
    React.createElement('a', { href, ...props }, children),
}));

const navLabels = ['Dashboard', 'Settlements', 'API Keys', 'Invoices', 'Settings', 'Agents', 'Webhooks', 'Docs'];

describe('Sidebar', () => {
  beforeEach(() => { (usePathname as jest.Mock).mockReturnValue('/'); });

  it('renders navigation landmark with aria-label', () => {
    render(<Sidebar />);
    expect(screen.getByRole('navigation', { name: 'Sidebar navigation' })).toBeInTheDocument();
  });

  it('renders all 8 navigation items with correct labels', () => {
    render(<Sidebar />);
    navLabels.forEach(label => expect(screen.getByRole('link', { name: label })).toBeInTheDocument());
  });

  it('Dashboard link has href="/" and active styles when pathname is "/"', () => {
    render(<Sidebar />);
    const link = screen.getByRole('link', { name: 'Dashboard' });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveClass('bg-sky-50');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('Invoices link gets active styles when pathname is "/invoices"', () => {
    (usePathname as jest.Mock).mockReturnValue('/invoices');
    render(<Sidebar />);
    const link = screen.getByRole('link', { name: 'Invoices' });
    expect(link).toHaveClass('bg-sky-50');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('non-active links do NOT have aria-current', () => {
    (usePathname as jest.Mock).mockReturnValue('/invoices');
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: 'Settlements' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Agents' })).not.toHaveAttribute('aria-current');
  });

  it('links starting with pathname are also active', () => {
    (usePathname as jest.Mock).mockReturnValue('/docs/getting-started/quickstart');
    render(<Sidebar />);
    const docsLink = screen.getByRole('link', { name: 'Docs' });
    expect(docsLink).toHaveClass('bg-sky-50');
    expect(docsLink).toHaveAttribute('aria-current', 'page');
  });
});