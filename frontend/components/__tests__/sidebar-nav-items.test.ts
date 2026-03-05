import { navItems, NavItem } from '../sidebar-nav-items';

describe('sidebar-nav-items', () => {
  it('exports an array with exactly 8 items', () => {
    expect(Array.isArray(navItems)).toBe(true);
    expect(navItems).toHaveLength(8);
  });

  it('each item has required fields: href, label, iconPath', () => {
    navItems.forEach((item: NavItem) => {
      expect(item).toHaveProperty('href');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('iconPath');
      expect(typeof item.href).toBe('string');
      expect(typeof item.label).toBe('string');
      expect(typeof item.iconPath).toBe('string');
    });
  });

  it('all hrefs start with "/" and iconPaths are non-empty', () => {
    navItems.forEach((item: NavItem) => {
      expect(item.href.startsWith('/')).toBe(true);
      expect(item.iconPath.length).toBeGreaterThan(0);
    });
  });

  it('Dashboard has href "/" and label "Dashboard"', () => {
    const dashboard = navItems.find((i: NavItem) => i.label === 'Dashboard');
    expect(dashboard?.href).toBe('/');
  });

  it('Settings has href "/settings" and is the only item with iconPaths', () => {
    const settings = navItems.find((i: NavItem) => i.label === 'Settings');
    expect(settings?.href).toBe('/settings');
    expect(settings?.iconPaths).toBeDefined();
    expect(Array.isArray(settings?.iconPaths)).toBe(true);
    const othersWithIconPaths = navItems.filter((i: NavItem) => i.iconPaths);
    expect(othersWithIconPaths).toHaveLength(1);
  });

  it('all specific navigation items have correct hrefs', () => {
    const itemsByLabel: Record<string, string> = {};
    navItems.forEach((item: NavItem) => { itemsByLabel[item.label] = item.href; });
    expect(itemsByLabel['Settlements']).toBe('/settlements');
    expect(itemsByLabel['API Keys']).toBe('/api-keys');
    expect(itemsByLabel['Invoices']).toBe('/invoices');
    expect(itemsByLabel['Agents']).toBe('/agents');
    expect(itemsByLabel['Webhooks']).toBe('/webhooks');
    expect(itemsByLabel['Docs']).toBe('/docs/getting-started');
  });
});