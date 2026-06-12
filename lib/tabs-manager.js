// Tabs Manager - Tab operations and grouping logic
export class TabsManager {
  constructor() {
    this.TAB_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  }

  // Auto-group tabs by domain
  async autoGroupByDomain(tabs) {
    const domainGroups = new Map();

    // Group tabs by base domain
    for (const tab of tabs) {
      // Skip special URLs
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        continue;
      }

      try {
        const url = new URL(tab.url);
        const baseDomain = this.extractBaseDomain(url.hostname);

        if (!domainGroups.has(baseDomain)) {
          domainGroups.set(baseDomain, []);
        }
        domainGroups.get(baseDomain).push(tab);
      } catch (error) {
        console.error('Invalid URL:', tab.url, error);
      }
    }

    // Create groups for domains with 2+ tabs
    const createdGroups = [];
    let colorIndex = 0;

    for (const [domain, domainTabs] of domainGroups.entries()) {
      if (domainTabs.length >= 2) {
        try {
          // Check if tabs are already in a group
          const ungroupedTabs = domainTabs.filter(t => t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);

          if (ungroupedTabs.length >= 2) {
            const groupId = await chrome.tabs.group({
              tabIds: ungroupedTabs.map(t => t.id)
            });

            await chrome.tabGroups.update(groupId, {
              title: this.formatDomainName(domain),
              color: this.TAB_COLORS[colorIndex % this.TAB_COLORS.length],
              collapsed: false
            });

            createdGroups.push({
              groupId,
              domain,
              tabCount: ungroupedTabs.length
            });

            colorIndex++;
          }
        } catch (error) {
          console.error('Failed to create group for', domain, error);
        }
      }
    }

    return createdGroups;
  }

  // Extract base domain (e.g., github.com from repo.github.com)
  extractBaseDomain(hostname) {
    const parts = hostname.split('.');

    // Handle special cases
    if (parts.length <= 2) {
      return hostname;
    }

    // Common patterns: subdomain.domain.tld or subdomain.domain.co.uk
    const tld = parts[parts.length - 1];
    const domain = parts[parts.length - 2];

    // Handle two-part TLDs (co.uk, com.au, etc.)
    if (parts.length >= 3 && ['co', 'com', 'org', 'net', 'gov', 'edu'].includes(domain)) {
      return parts.slice(-3).join('.');
    }

    // Standard domain.tld
    return `${domain}.${tld}`;
  }

  // Format domain name for display
  formatDomainName(domain) {
    const domainMap = {
      'github.com': 'GitHub',
      'google.com': 'Google',
      'stackoverflow.com': 'Stack Overflow',
      'youtube.com': 'YouTube',
      'reddit.com': 'Reddit',
      'twitter.com': 'Twitter',
      'linkedin.com': 'LinkedIn',
      'facebook.com': 'Facebook',
      'amazon.com': 'Amazon',
      'netflix.com': 'Netflix'
    };

    return domainMap[domain] || domain.replace('.com', '').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Fuzzy search across tabs
  searchTabs(query, tabs) {
    if (!query || query.trim() === '') {
      return tabs;
    }

    const lowerQuery = query.toLowerCase().trim();
    const words = lowerQuery.split(/\s+/);

    return tabs
      .map(tab => {
        const title = (tab.title || '').toLowerCase();
        const url = (tab.url || '').toLowerCase();
        let score = 0;

        // Exact match in title (highest priority)
        if (title.includes(lowerQuery)) {
          score += 100;
        }

        // Exact match in URL
        if (url.includes(lowerQuery)) {
          score += 80;
        }

        // Word matches
        for (const word of words) {
          if (title.includes(word)) score += 50;
          if (url.includes(word)) score += 30;
        }

        // Fuzzy character sequence match
        let titleIndex = 0;
        for (const char of lowerQuery) {
          const found = title.indexOf(char, titleIndex);
          if (found !== -1) {
            score += 5;
            titleIndex = found + 1;
          }
        }

        // Boost for active tab
        if (tab.active) {
          score += 10;
        }

        return { tab, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.tab);
  }

  // Hibernate inactive tabs (unload from memory)
  async hibernateInactiveTabs(inactiveMinutes = 30) {
    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    let hibernatedCount = 0;

    for (const tab of tabs) {
      // Skip active, pinned, audible, or already discarded tabs
      if (tab.active || tab.pinned || tab.audible || tab.discarded) {
        continue;
      }

      // Check last activity
      const lastActivity = globalThis.getTabLastActivity?.(tab.id) || now;
      const inactiveMs = now - lastActivity;
      const inactiveMin = inactiveMs / 1000 / 60;

      if (inactiveMin >= inactiveMinutes) {
        try {
          await chrome.tabs.discard(tab.id);
          hibernatedCount++;
        } catch (error) {
          console.error('Failed to hibernate tab:', tab.id, error);
        }
      }
    }

    return { hibernatedCount };
  }

  // Get tab statistics
  async getTabStatistics() {
    const tabs = await chrome.tabs.query({});
    const windows = await chrome.windows.getAll();

    const pinnedTabs = tabs.filter(t => t.pinned).length;
    const activeTabs = tabs.filter(t => t.active).length;
    const discardedTabs = tabs.filter(t => t.discarded).length;
    const groupedTabs = tabs.filter(t => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE).length;

    return {
      total: tabs.length,
      pinned: pinnedTabs,
      active: activeTabs,
      discarded: discardedTabs,
      grouped: groupedTabs,
      windows: windows.length,
      avgPerWindow: windows.length > 0 ? Math.round(tabs.length / windows.length) : 0
    };
  }

  // Find duplicate tabs
  async findDuplicates() {
    const tabs = await chrome.tabs.query({});
    const urlMap = new Map();

    for (const tab of tabs) {
      if (!tab.url) continue;

      // Normalize URL (remove trailing slash, hash, etc.)
      const normalizedUrl = this.normalizeUrl(tab.url);

      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, []);
      }
      urlMap.get(normalizedUrl).push(tab);
    }

    // Return URLs with duplicates
    return Array.from(urlMap.entries())
      .filter(([url, tabs]) => tabs.length > 1)
      .map(([url, tabs]) => ({
        url,
        tabs,
        count: tabs.length
      }));
  }

  normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      // Remove hash and trailing slash
      return `${parsed.origin}${parsed.pathname}${parsed.search}`.replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  // Close duplicate tabs (keep first occurrence)
  async closeDuplicates() {
    const duplicates = await this.findDuplicates();
    let closedCount = 0;

    for (const { tabs } of duplicates) {
      // Keep the first tab, close the rest
      const tabsToClose = tabs.slice(1);

      for (const tab of tabsToClose) {
        try {
          await chrome.tabs.remove(tab.id);
          closedCount++;
        } catch (error) {
          console.error('Failed to close duplicate tab:', tab.id, error);
        }
      }
    }

    return { closedCount, duplicateGroups: duplicates.length };
  }

  // Hash string to color (for consistent domain colors)
  hashToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.TAB_COLORS[Math.abs(hash) % this.TAB_COLORS.length];
  }
}
