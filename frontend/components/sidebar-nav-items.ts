export interface NavItem {
  href: string;
  label: string;
  iconPath: string;
  iconPaths?: string[];
  adminOnly?: boolean;
  dividerAfter?: boolean; // renders a divider after this item
}

export const ADMIN_EMAILS = ['skininthegem@gmail.com'];

export const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    iconPath: 'M4 5a2 2 0 012-2h3a2 2 0 012 2v5a2 2 0 01-2 2H6a2 2 0 01-2-2V5z',
    iconPaths: ['M13 14a2 2 0 012-2h3a2 2 0 012 2v5a2 2 0 01-2 2h-3a2 2 0 01-2-2v-5z', 'M13 5a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2V5z', 'M4 16a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3z'],
  },
  {
    href: '/dashboard/api-keys',
    label: 'API Keys',
    iconPath: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z',
    iconPaths: ['M8 11V7a4 4 0 118 0v4'],
  },
  {
    href: '/settlements',
    label: 'Settlements',
    iconPath: 'M9 14l2 2 4-4',
    iconPaths: ['M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z'],
  },
  {
    href: '/invoices',
    label: 'Invoices',
    iconPath: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    iconPaths: ['M9 12h6M9 16h4'],
  },
  {
    href: '/ledger',
    label: 'Ledger',
    iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2',
    iconPaths: ['M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', 'M9 12h6M9 16h4'],
  },
  {
    href: '/agents',
    label: 'Agents',
    iconPath: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    href: '/webhooks',
    label: 'Webhooks',
    iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
    dividerAfter: true,
  },
  {
    href: '/usage',
    label: 'Usage',
    iconPath: 'M16 8v8m-4-5v5m-4-2v2',
    iconPaths: ['M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'],
  },
  {
    href: '/billing',
    label: 'Billing',
    iconPath: 'M3 8a3 3 0 013-3h12a3 3 0 013 3v8a3 3 0 01-3 3H6a3 3 0 01-3-3V8z',
    iconPaths: ['M3 10h18', 'M7 15h2m4 0h2'],
  },
  {
    href: '/settings',
    label: 'Settings',
    iconPath: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    dividerAfter: true,
  },
  {
    href: '/support',
    label: 'Support',
    iconPath: 'M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  },
  {
    href: '/docs/getting-started',
    label: 'Docs',
    iconPath: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    href: '/marketing',
    label: 'Marketing',
    iconPath: 'M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728',
    iconPaths: ['M8.464 15.536a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072', 'M13 12a1 1 0 11-2 0 1 1 0 012 0z'],
    adminOnly: true,
  },
];
