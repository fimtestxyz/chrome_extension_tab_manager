// Service Worker for Tab Workspace Manager (Manifest V3)
// All code bundled in one file (no ES6 imports in service workers)

// ============================================================================
// StorageManager - Abstraction over chrome.storage API
// ============================================================================
class StorageManager {
  constructor() {
    this.DEFAULTS = {
      workspaces: {},
      launchGroups: {},
      settings: {
        autoGroup: true,
        theme: 'light',
        hibernateEnabled: false,
        hibernateAfter: 30,
        showTabCount: true,
        groupByDefault: true
      },
      analytics: {
        totalTabsSaved: 0,
        workspaceCount: 0,
        totalRestores: 0,
        totalLaunches: 0,
        extensionInstalled: Date.now()
      }
    };
  }

  async init() {
    const existing = await chrome.storage.local.get(null);

    // Initialize missing keys with defaults
    const updates = {};
    for (const [key, value] of Object.entries(this.DEFAULTS)) {
      if (!(key in existing)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }
  }

  // Workspaces
  async getWorkspaces() {
    const { workspaces } = await chrome.storage.local.get('workspaces');
    return workspaces || {};
  }

  async getWorkspace(id) {
    const workspaces = await this.getWorkspaces();
    return workspaces[id];
  }

  async saveWorkspace(workspace) {
    const workspaces = await this.getWorkspaces();
    workspaces[workspace.id] = workspace;
    await chrome.storage.local.set({ workspaces });

    // Update analytics
    await this.incrementAnalytic('workspaceCount', Object.keys(workspaces).length);
    await this.incrementAnalytic('totalTabsSaved', workspace.tabs.length);
  }

  async deleteWorkspace(id) {
    const workspaces = await this.getWorkspaces();
    delete workspaces[id];
    await chrome.storage.local.set({ workspaces });
    await this.incrementAnalytic('workspaceCount', Object.keys(workspaces).length);
  }

  async updateWorkspace(id, updates) {
    const workspaces = await this.getWorkspaces();
    if (workspaces[id]) {
      workspaces[id] = { ...workspaces[id], ...updates };
      await chrome.storage.local.set({ workspaces });
    }
  }

  // Settings
  async getSettings() {
    const { settings } = await chrome.storage.local.get('settings');
    return { ...this.DEFAULTS.settings, ...settings };
  }

  async updateSettings(updates) {
    const settings = await this.getSettings();
    const newSettings = { ...settings, ...updates };
    await chrome.storage.local.set({ settings: newSettings });
  }

  // Analytics
  async getAnalytics() {
    const { analytics } = await chrome.storage.local.get('analytics');
    return { ...this.DEFAULTS.analytics, ...analytics };
  }

  async incrementAnalytic(key, value = 1) {
    const analytics = await this.getAnalytics();
    analytics[key] = typeof value === 'number' && key !== 'workspaceCount'
      ? (analytics[key] || 0) + value
      : value;
    await chrome.storage.local.set({ analytics });
  }
}

// ============================================================================
// WorkspaceManager - CRUD operations for workspaces
// ============================================================================
class WorkspaceManager {
  constructor(storageManager) {
    this.storage = storageManager;
  }

  generateId() {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async saveWorkspace(name, windowId = null) {
    // Get tabs from specified window or current window
    const tabs = windowId
      ? await chrome.tabs.query({ windowId })
      : await chrome.tabs.query({ currentWindow: true });

    // Get tab groups in the window
    const targetWindowId = windowId || tabs[0]?.windowId;
    const groups = targetWindowId
      ? await chrome.tabGroups.query({ windowId: targetWindowId })
      : [];

    // Create workspace object
    const workspace = {
      id: this.generateId(),
      name: name || `Workspace ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      tabs: tabs.map(tab => ({
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned,
        groupId: tab.groupId,
        index: tab.index,
        favIconUrl: tab.favIconUrl
      })),
      groups: groups.map(g => ({
        id: g.id,
        title: g.title,
        color: g.color,
        collapsed: g.collapsed
      })),
      tabCount: tabs.length
    };

    await this.storage.saveWorkspace(workspace);
    return workspace;
  }

  async getAllWorkspaces() {
    const workspaces = await this.storage.getWorkspaces();
    // Return as array, sorted by last used
    return Object.values(workspaces).sort((a, b) => b.lastUsed - a.lastUsed);
  }

  async getWorkspace(id) {
    return await this.storage.getWorkspace(id);
  }

  async restoreWorkspace(workspaceId, options = {}) {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    let targetWindowId;

    // Determine target window
    if (options.newWindow) {
      const newWindow = await chrome.windows.create({ focused: true });
      targetWindowId = newWindow.id;

      const [defaultTab] = await chrome.tabs.query({ windowId: targetWindowId });
      if (defaultTab) {
        await chrome.tabs.remove(defaultTab.id);
      }
    } else {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      targetWindowId = currentTab.windowId;

      if (options.replace) {
        const currentTabs = await chrome.tabs.query({ windowId: targetWindowId });
        const unpinnedTabs = currentTabs.filter(t => !t.pinned);
        if (unpinnedTabs.length > 0) {
          await chrome.tabs.remove(unpinnedTabs.map(t => t.id));
        }
      }
    }

    // Restore tabs
    const createdTabs = [];
    for (const tabData of workspace.tabs) {
      try {
        const tab = await chrome.tabs.create({
          url: tabData.url,
          pinned: tabData.pinned,
          active: false,
          windowId: targetWindowId
        });
        createdTabs.push({
          ...tab,
          originalGroupId: tabData.groupId
        });
      } catch (error) {
        console.error(`Failed to restore tab: ${tabData.url}`, error);
      }
    }

    // Restore tab groups
    for (const groupData of workspace.groups) {
      const tabsForGroup = createdTabs.filter(t => t.originalGroupId === groupData.id);

      if (tabsForGroup.length > 0) {
        try {
          const groupId = await chrome.tabs.group({
            tabIds: tabsForGroup.map(t => t.id)
          });

          await chrome.tabGroups.update(groupId, {
            title: groupData.title,
            color: groupData.color,
            collapsed: groupData.collapsed
          });
        } catch (error) {
          console.error('Failed to restore group:', groupData, error);
        }
      }
    }

    // Update last used timestamp
    await this.storage.updateWorkspace(workspaceId, {
      lastUsed: Date.now()
    });

    // Update analytics
    await this.storage.incrementAnalytic('totalRestores');

    return { success: true, tabCount: createdTabs.length };
  }

  async deleteWorkspace(id) {
    await this.storage.deleteWorkspace(id);
  }

  async renameWorkspace(id, newName) {
    await this.storage.updateWorkspace(id, { name: newName });
  }
}

// ============================================================================
// LaunchGroupManager - Quick Launch URL groups for traders/monitors
// ============================================================================
class LaunchGroupManager {
  constructor(storageManager) {
    this.storage = storageManager;

    // Site intelligence: auto-suggest refresh intervals & pin status
    this.SITE_INTELLIGENCE = {
      'tradingview.com':   { refresh: 60,  pinned: true,  category: 'charts' },
      'finviz.com':        { refresh: 300, pinned: false, category: 'data' },
      'reuters.com':       { refresh: 60,  pinned: false, category: 'news' },
      'bloomberg.com':     { refresh: 60,  pinned: false, category: 'news' },
      'cnbc.com':          { refresh: 60,  pinned: false, category: 'news' },
      'wsj.com':           { refresh: 60,  pinned: false, category: 'news' },
      'ft.com':            { refresh: 60,  pinned: false, category: 'news' },
      'marketwatch.com':   { refresh: 60,  pinned: false, category: 'news' },
      'forexfactory.com':  { refresh: 300, pinned: true,  category: 'calendar' },
      'investing.com':     { refresh: 300, pinned: true,  category: 'calendar' },
      'coingecko.com':     { refresh: 30,  pinned: false, category: 'crypto' },
      'coinmarketcap.com': { refresh: 60,  pinned: false, category: 'crypto' },
      'dexscreener.com':   { refresh: 30,  pinned: false, category: 'crypto' },
      'coinglass.com':     { refresh: 60,  pinned: false, category: 'crypto' },
      'stocktwits.com':    { refresh: 60,  pinned: false, category: 'sentiment' },
      'seekingalpha.com':  { refresh: 0,   pinned: false, category: 'research' },
      'sec.gov':           { refresh: 0,   pinned: false, category: 'research' },
      'tipranks.com':      { refresh: 0,   pinned: false, category: 'research' },
      'macrotrends.net':   { refresh: 0,   pinned: false, category: 'research' },
      'yahoo.com':         { refresh: 300, pinned: false, category: 'data' },
      'finance.yahoo.com': { refresh: 300, pinned: false, category: 'data' },
    };

    // Pre-built templates
    this.TEMPLATES = {
      'pre-market': {
        name: '📈 Pre-Market Scan',
        icon: '📈',
        color: 'blue',
        urls: [
          'https://www.tradingview.com/chart/',
          'https://www.finviz.com/screener.ashx',
          'https://finance.yahoo.com/markets/',
          'https://www.forexfactory.com/calendar',
          'https://www.investing.com/economic-calendar/',
          'https://www.reuters.com/markets/',
          'https://www.cnbc.com/pre-markets/'
        ],
        defaultRefresh: 300
      },
      'market-live': {
        name: '🔴 Market Live',
        icon: '🔴',
        color: 'red',
        urls: [
          'https://www.tradingview.com/chart/',
          'https://www.finviz.com/heatmap.ashx',
          'https://finance.yahoo.com/most-active/',
          'https://www.cnbc.com/live-market/',
          'https://www.bloomberg.com/markets',
          'https://www.reuters.com/markets/us/',
          'https://seekingalpha.com/market-news',
          'https://stocktwits.com/stream'
        ],
        defaultRefresh: 60
      },
      'news-wire': {
        name: '📰 News Wire',
        icon: '📰',
        color: 'orange',
        urls: [
          'https://www.reuters.com/',
          'https://www.bloomberg.com/',
          'https://www.cnbc.com/world/',
          'https://www.wsj.com/news/markets',
          'https://www.ft.com/markets',
          'https://www.marketwatch.com/'
        ],
        defaultRefresh: 60
      },
      'crypto-watch': {
        name: '🦐 Crypto Watch',
        icon: '🦐',
        color: 'purple',
        urls: [
          'https://www.coingecko.com/',
          'https://coinmarketcap.com/',
          'https://dexscreener.com/',
          'https://www.tradingview.com/crypto/',
          'https://www.coinglass.com/'
        ],
        defaultRefresh: 30
      },
      'weekend-research': {
        name: '📋 Weekend Research',
        icon: '📋',
        color: 'green',
        urls: [
          'https://www.sec.gov/cgi-bin/browse-edgar',
          'https://seekingalpha.com/stock-ideas',
          'https://www.tipranks.com/',
          'https://www.macrotrends.net/',
          'https://www.gurufocus.com/'
        ],
        defaultRefresh: 0
      }
    };
  }

  generateId() {
    return `lg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get site intelligence for a URL
  getSiteIntel(url) {
    try {
      const hostname = new URL(url).hostname;
      for (const [domain, intel] of Object.entries(this.SITE_INTELLIGENCE)) {
        if (hostname.includes(domain)) return intel;
      }
    } catch {}
    return { refresh: 0, pinned: false, category: 'other' };
  }

  // Create a launch group from user input
  createGroup(name, icon, color, rawUrls, defaultRefresh = 0) {
    const urls = rawUrls.map((urlStr, i) => {
      const trimmed = urlStr.trim();
      const intel = this.getSiteIntel(trimmed);
      return {
        url: trimmed,
        title: '',
        pinned: intel.pinned,
        autoRefresh: intel.refresh > 0,
        refreshInterval: intel.refresh || defaultRefresh,
        order: i
      };
    });

    return {
      id: this.generateId(),
      name: name,
      icon: icon || '🚀',
      color: color || 'blue',
      urls: urls,
      defaultRefresh: defaultRefresh,
      schedule: { enabled: false, time: '', days: [], autoClose: false, autoCloseAfter: null },
      createdAt: Date.now(),
      lastLaunched: null,
      launchCount: 0
    };
  }

  // Create from template
  createFromTemplate(templateKey) {
    const tpl = this.TEMPLATES[templateKey];
    if (!tpl) return null;

    const group = this.createGroup(tpl.name, tpl.icon, tpl.color, tpl.urls, tpl.defaultRefresh);
    return group;
  }

  // Save a launch group
  async saveGroup(group) {
    const { launchGroups } = await chrome.storage.local.get('launchGroups');
    const groups = launchGroups || {};
    groups[group.id] = group;
    await chrome.storage.local.set({ launchGroups: groups });
    return group;
  }

  // Get all groups
  async getAllGroups() {
    const { launchGroups } = await chrome.storage.local.get('launchGroups');
    const groups = launchGroups || {};
    return Object.values(groups).sort((a, b) => (b.lastLaunched || b.createdAt) - (a.lastLaunched || a.createdAt));
  }

  // Get single group
  async getGroup(id) {
    const { launchGroups } = await chrome.storage.local.get('launchGroups');
    return (launchGroups || {})[id];
  }

  // Delete group
  async deleteGroup(id) {
    const { launchGroups } = await chrome.storage.local.get('launchGroups');
    const groups = launchGroups || {};
    delete groups[id];
    await chrome.storage.local.set({ launchGroups: groups });
    // Remove any scheduled alarm for this group
    chrome.alarms.clear(`launch-${id}`);
    chrome.alarms.clear(`refresh-${id}`);
  }

  // Update group
  async updateGroup(id, updates) {
    const { launchGroups } = await chrome.storage.local.get('launchGroups');
    const groups = launchGroups || {};
    if (groups[id]) {
      groups[id] = { ...groups[id], ...updates };
      await chrome.storage.local.set({ launchGroups: groups });
    }
  }

  // Launch all URLs in a group
  async launchGroup(groupId, options = {}) {
    const group = await this.getGroup(groupId);
    if (!group) throw new Error('Launch group not found');

    let targetWindowId;

    if (options.newWindow) {
      const newWindow = await chrome.windows.create({ focused: true });
      targetWindowId = newWindow.id;
      // Close default blank tab
      const [defaultTab] = await chrome.tabs.query({ windowId: targetWindowId });
      if (defaultTab && defaultTab.url === 'chrome://newtab/') {
        await chrome.tabs.remove(defaultTab.id);
      }
    } else {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      targetWindowId = currentTab.windowId;

      if (options.replace) {
        const currentTabs = await chrome.tabs.query({ windowId: targetWindowId });
        const unpinnedTabs = currentTabs.filter(t => !t.pinned);
        if (unpinnedTabs.length > 0) {
          await chrome.tabs.remove(unpinnedTabs.map(t => t.id));
        }
      }
    }

    // Check for existing tabs with same URLs (skip duplicates)
    const existingTabs = await chrome.tabs.query({ windowId: targetWindowId });
    const existingUrls = new Set(existingTabs.map(t => t.url));

    const createdTabs = [];
    for (const urlEntry of group.urls) {
      const url = urlEntry.url;

      // Skip if already open and skipDuplicates is on
      if (options.skipDuplicates !== false && existingUrls.has(url)) {
        const existingTab = existingTabs.find(t => t.url === url);
        if (existingTab) {
          createdTabs.push(existingTab);
          continue;
        }
      }

      try {
        const tab = await chrome.tabs.create({
          url: url,
          pinned: urlEntry.pinned || false,
          active: false,
          windowId: targetWindowId
        });
        createdTabs.push(tab);
      } catch (error) {
        console.error(`Failed to launch: ${url}`, error);
      }
    }

    // Group all launched tabs into a Chrome tab group
    if (createdTabs.length >= 2) {
      try {
        const chromeGroupId = await chrome.tabs.group({
          tabIds: createdTabs.map(t => t.id)
        });
        await chrome.tabGroups.update(chromeGroupId, {
          title: `${group.icon} ${group.name}`,
          color: group.color,
          collapsed: false
        });
      } catch (error) {
        console.error('Failed to create tab group:', error);
      }
    }

    // Update last launched & count
    await this.updateGroup(groupId, {
      lastLaunched: Date.now(),
      launchCount: (group.launchCount || 0) + 1
    });

    // Set up auto-refresh if configured
    if (group.defaultRefresh > 0) {
      await this.startAutoRefresh(groupId);
    }

    // Update analytics
    await this.storage.incrementAnalytic('totalLaunches');

    return { success: true, tabCount: createdTabs.length, groupName: group.name };
  }

  // Auto-refresh: set up alarm for group
  async startAutoRefresh(groupId) {
    const group = await this.getGroup(groupId);
    if (!group) return;

    // Clear existing alarm
    await chrome.alarms.clear(`refresh-${groupId}`);

    // Find shortest refresh interval in group
    const intervals = group.urls
      .filter(u => u.autoRefresh && u.refreshInterval > 0)
      .map(u => u.refreshInterval);

    if (intervals.length === 0) return;

    const minInterval = Math.max(1, Math.min(...intervals) / 60); // convert secs to mins, min 1
    chrome.alarms.create(`refresh-${groupId}`, { periodInMinutes: minInterval });
  }

  // Refresh all tabs in a group NOW
  async refreshGroupNow(groupId) {
    const group = await this.getGroup(groupId);
    if (!group) return { refreshedCount: 0 };

    const groupUrls = new Set(group.urls.map(u => u.url));
    const allTabs = await chrome.tabs.query({});
    const groupTabs = allTabs.filter(t => groupUrls.has(t.url));

    let refreshedCount = 0;
    for (const tab of groupTabs) {
      try {
        await chrome.tabs.reload(tab.id);
        refreshedCount++;
      } catch (error) {
        console.error('Failed to refresh tab:', tab.id, error);
      }
    }

    return { refreshedCount };
  }

  // Refresh only auto-refresh-enabled URLs in a group
  async refreshGroupAuto(groupId) {
    const group = await this.getGroup(groupId);
    if (!group) return;

    const refreshUrls = new Set(
      group.urls.filter(u => u.autoRefresh && u.refreshInterval > 0).map(u => u.url)
    );

    if (refreshUrls.size === 0) return;

    const allTabs = await chrome.tabs.query({});
    const tabsToRefresh = allTabs.filter(t => refreshUrls.has(t.url) && !t.active);

    for (const tab of tabsToRefresh) {
      try {
        await chrome.tabs.reload(tab.id);
      } catch (error) {
        console.error('Auto-refresh failed:', tab.id, error);
      }
    }
  }

  // Pause all auto-refresh
  async pauseAllRefresh() {
    const groups = await this.getAllGroups();
    for (const group of groups) {
      await chrome.alarms.clear(`refresh-${group.id}`);
    }
  }

  // Resume all auto-refresh
  async resumeAllRefresh() {
    const groups = await this.getAllGroups();
    for (const group of groups) {
      if (group.defaultRefresh > 0) {
        await this.startAutoRefresh(group.id);
      }
    }
  }

  // Get available templates
  getTemplates() {
    return Object.entries(this.TEMPLATES).map(([key, tpl]) => ({
      key,
      ...tpl,
      urlCount: tpl.urls.length
    }));
  }

  // Import group from JSON
  importGroup(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data.name || !data.urls || !Array.isArray(data.urls)) {
        throw new Error('Invalid format: need name and urls array');
      }
      const rawUrls = data.urls.map(u => typeof u === 'string' ? u : u.url);
      const group = this.createGroup(
        data.name, data.icon, data.color, rawUrls,
        data.defaultRefresh || 0
      );
      if (data.schedule) group.schedule = { ...group.schedule, ...data.schedule };
      return group;
    } catch (error) {
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  // Export group as JSON
  async exportGroup(id) {
    const group = await this.getGroup(id);
    if (!group) throw new Error('Group not found');
    return JSON.stringify({
      name: group.name,
      icon: group.icon,
      color: group.color,
      urls: group.urls.map(u => u.url),
      defaultRefresh: group.defaultRefresh,
      schedule: group.schedule
    }, null, 2);
  }
}

// ============================================================================
// TabsManager - Tab operations and grouping logic
// ============================================================================
class TabsManager {
  constructor() {
    this.TAB_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

    // Intelligent color mapping for popular domains
    this.DOMAIN_COLORS = {
      'youtube.com': 'red',
      'google.com': 'blue',
      'gmail.com': 'red',
      'github.com': 'grey',
      'stackoverflow.com': 'orange',
      'reddit.com': 'orange',
      'twitter.com': 'cyan',
      'x.com': 'grey',
      'facebook.com': 'blue',
      'linkedin.com': 'blue',
      'instagram.com': 'pink',
      'netflix.com': 'red',
      'amazon.com': 'orange',
      'perplexity.ai': 'grey',
      'openai.com': 'green',
      'claude.ai': 'purple',
      'gemini.google.com': 'blue',
      'notion.so': 'grey',
      'figma.com': 'purple',
      'slack.com': 'purple',
      'discord.com': 'purple',
      'zoom.us': 'blue',
      'spotify.com': 'green',
      'twitch.tv': 'purple',
      'medium.com': 'grey',
      'wikipedia.org': 'grey',
      'docs.google.com': 'blue',
      'drive.google.com': 'yellow',
      'sheets.google.com': 'green',
      'slides.google.com': 'yellow',
      'chatgpt.com': 'green',
      'bard.google.com': 'blue',
      'bing.com': 'cyan',
      'yahoo.com': 'purple',
      'dropbox.com': 'blue',
      'trello.com': 'blue',
      'asana.com': 'pink',
      'monday.com': 'red',
      'airtable.com': 'yellow',
      'canva.com': 'cyan',
      'pinterest.com': 'red',
      'tumblr.com': 'blue',
      'tiktok.com': 'cyan',
      'whatsapp.com': 'green',
      'telegram.org': 'cyan',
      'signal.org': 'blue'
    };
  }

  // Get intelligent color for domain
  getColorForDomain(domain) {
    // Check if we have a specific color mapping
    if (this.DOMAIN_COLORS[domain]) {
      return this.DOMAIN_COLORS[domain];
    }

    // Fallback to hash-based color for consistency
    return this.hashToColor(domain);
  }

  // Hash string to color (for consistent domain colors)
  hashToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.TAB_COLORS[Math.abs(hash) % this.TAB_COLORS.length];
  }

  // Auto-group tabs by domain with intelligent colors
  async autoGroupByDomain(tabs) {
    const domainGroups = new Map();

    // Group tabs by base domain
    for (const tab of tabs) {
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

    for (const [domain, domainTabs] of domainGroups.entries()) {
      if (domainTabs.length >= 2) {
        try {
          const ungroupedTabs = domainTabs.filter(t => t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);

          if (ungroupedTabs.length >= 2) {
            const groupId = await chrome.tabs.group({
              tabIds: ungroupedTabs.map(t => t.id)
            });

            // Use intelligent color based on domain
            const color = this.getColorForDomain(domain);

            await chrome.tabGroups.update(groupId, {
              title: this.formatDomainName(domain),
              color: color,
              collapsed: false
            });

            createdGroups.push({
              groupId,
              domain,
              tabCount: ungroupedTabs.length,
              color: color
            });
          }
        } catch (error) {
          console.error('Failed to create group for', domain, error);
        }
      }
    }

    return createdGroups;
  }

  extractBaseDomain(hostname) {
    const parts = hostname.split('.');

    if (parts.length <= 2) {
      return hostname;
    }

    const tld = parts[parts.length - 1];
    const domain = parts[parts.length - 2];

    if (parts.length >= 3 && ['co', 'com', 'org', 'net', 'gov', 'edu'].includes(domain)) {
      return parts.slice(-3).join('.');
    }

    return `${domain}.${tld}`;
  }

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

        if (title.includes(lowerQuery)) score += 100;
        if (url.includes(lowerQuery)) score += 80;

        for (const word of words) {
          if (title.includes(word)) score += 50;
          if (url.includes(word)) score += 30;
        }

        let titleIndex = 0;
        for (const char of lowerQuery) {
          const found = title.indexOf(char, titleIndex);
          if (found !== -1) {
            score += 5;
            titleIndex = found + 1;
          }
        }

        if (tab.active) score += 10;

        return { tab, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.tab);
  }

  async hibernateInactiveTabs(inactiveMinutes = 30) {
    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    let hibernatedCount = 0;

    for (const tab of tabs) {
      if (tab.active || tab.pinned || tab.audible || tab.discarded) {
        continue;
      }

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
}

// ============================================================================
// Initialize managers
// ============================================================================
const storage = new StorageManager();
const workspaceManager = new WorkspaceManager(storage);
const tabsManager = new TabsManager();
const launchGroupManager = new LaunchGroupManager(storage);

// ============================================================================
// Extension lifecycle
// ============================================================================
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await handleFirstInstall();
  } else if (details.reason === 'update') {
    console.log('Extension updated to version', chrome.runtime.getManifest().version);
  }
});

async function handleFirstInstall() {
  await storage.init();

  // Note: Can't auto-open side panel on install (requires user gesture)
  // User will need to click the extension icon to open it

  // Optionally: Auto-group existing tabs as a demo
  // (commented out to avoid unexpected behavior on install)
  // const tabs = await chrome.tabs.query({ currentWindow: true });
  // if (tabs.length > 3) {
  //   await tabsManager.autoGroupByDomain(tabs);
  // }
}

chrome.runtime.onStartup.addListener(async () => {
  await storage.init();
  chrome.alarms.create('checkInactiveTabs', { periodInMinutes: 5 });
});

// ============================================================================
// Command handlers
// ============================================================================
chrome.commands.onCommand.addListener((command) => {
  // Handle commands that need side panel
  const sidePanelCommands = ['open-sidepanel', 'search-tabs', 'quick-save', 'quick-launch'];

  if (sidePanelCommands.includes(command)) {
    // Query for active tabs synchronously using callback style to preserve gesture
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const windowId = tabs?.[0]?.windowId;
      if (windowId) {
        chrome.sidePanel.open({ windowId }).catch(err => {
          console.error('sidePanel.open() failed:', err);
        });
      }
    });

    // Send messages that need to reach the sidepanel
    if (command === 'search-tabs') {
      chrome.runtime.sendMessage({ type: 'FOCUS_SEARCH' });
    } else if (command === 'quick-save') {
      chrome.runtime.sendMessage({ type: 'SHOW_SAVE_DIALOG' });
    } else if (command === 'quick-launch') {
      chrome.runtime.sendMessage({ type: 'SHOW_LAUNCH_PICKER' });
    }
  }

  // Handle commands that don't need side panel
  if (command === 'refresh-all') {
    storage.getSettings().then(async (settings) => {
      const groups = await launchGroupManager.getAllGroups();
      for (const g of groups) {
        if (g.defaultRefresh > 0) {
          await launchGroupManager.refreshGroupNow(g.id);
        }
      }
    });
  } else if (command === 'pause-refresh') {
    storage.getSettings().then(async (settings) => {
      if (settings.refreshPaused) {
        await launchGroupManager.resumeAllRefresh();
        await storage.updateSettings({ refreshPaused: false });
      } else {
        await launchGroupManager.pauseAllRefresh();
        await storage.updateSettings({ refreshPaused: true });
      }
    });
  }
});

// ============================================================================
// Alarm handler
// ============================================================================
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkInactiveTabs') {
    const settings = await storage.getSettings();
    if (settings.hibernateEnabled) {
      await tabsManager.hibernateInactiveTabs(settings.hibernateAfter);
    }
  }

  // Auto-refresh for launch groups
  if (alarm.name.startsWith('refresh-')) {
    const groupId = alarm.name.replace('refresh-', '');
    await launchGroupManager.refreshGroupAuto(groupId);
  }

  // Scheduled launch for groups
  if (alarm.name.startsWith('launch-')) {
    const groupId = alarm.name.replace('launch-', '');
    await launchGroupManager.launchGroup(groupId, { newWindow: false, replace: false, skipDuplicates: true });
  }
});

// ============================================================================
// Message handler
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => {
      console.error('Message handler error:', error);
      sendResponse({ error: error.message });
    });

  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_ALL_TABS':
      return { tabs: await chrome.tabs.query({}) };

    case 'GET_CURRENT_WINDOW_TABS':
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return { tabs: await chrome.tabs.query({ windowId: currentTab.windowId }) };

    case 'SEARCH_TABS':
      const allTabs = await chrome.tabs.query({});
      return { results: tabsManager.searchTabs(message.query, allTabs) };

    case 'SWITCH_TO_TAB':
      await chrome.tabs.update(message.tabId, { active: true });
      await chrome.windows.update(message.windowId, { focused: true });
      return { success: true };

    case 'CLOSE_TAB':
      await chrome.tabs.remove(message.tabId);
      return { success: true };

    case 'AUTO_GROUP_TABS':
      const tabs = message.windowId
        ? await chrome.tabs.query({ windowId: message.windowId })
        : await chrome.tabs.query({ currentWindow: true });
      const groups = await tabsManager.autoGroupByDomain(tabs);
      return { groups };

    case 'SAVE_WORKSPACE':
      const workspace = await workspaceManager.saveWorkspace(message.name, message.windowId);
      return { workspace };

    case 'GET_WORKSPACES':
      return { workspaces: await workspaceManager.getAllWorkspaces() };

    case 'RESTORE_WORKSPACE':
      await workspaceManager.restoreWorkspace(message.workspaceId, {
        newWindow: message.newWindow,
        replace: message.replace
      });
      return { success: true };

    case 'DELETE_WORKSPACE':
      await workspaceManager.deleteWorkspace(message.workspaceId);
      return { success: true };

    case 'RENAME_WORKSPACE':
      await workspaceManager.renameWorkspace(message.workspaceId, message.newName);
      return { success: true };

    case 'GET_SETTINGS':
      return { settings: await storage.getSettings() };

    case 'UPDATE_SETTINGS':
      await storage.updateSettings(message.settings);
      return { success: true };

    case 'GET_ANALYTICS':
      return { analytics: await storage.getAnalytics() };

    // ── Launch Group handlers ──
    case 'GET_LAUNCH_GROUPS':
      return { groups: await launchGroupManager.getAllGroups() };

    case 'GET_LAUNCH_GROUP':
      return { group: await launchGroupManager.getGroup(message.groupId) };

    case 'SAVE_LAUNCH_GROUP':
      const newGroup = launchGroupManager.createGroup(
        message.name, message.icon, message.color,
        message.urls, message.defaultRefresh || 0
      );
      await launchGroupManager.saveGroup(newGroup);
      return { group: newGroup };

    case 'CREATE_FROM_TEMPLATE':
      const tplGroup = launchGroupManager.createFromTemplate(message.templateKey);
      if (!tplGroup) throw new Error('Template not found');
      await launchGroupManager.saveGroup(tplGroup);
      return { group: tplGroup };

    case 'UPDATE_LAUNCH_GROUP':
      await launchGroupManager.updateGroup(message.groupId, message.updates);
      return { success: true };

    case 'DELETE_LAUNCH_GROUP':
      await launchGroupManager.deleteGroup(message.groupId);
      return { success: true };

    case 'LAUNCH_GROUP':
      const launchResult = await launchGroupManager.launchGroup(message.groupId, {
        newWindow: message.newWindow || false,
        replace: message.replace || false,
        skipDuplicates: message.skipDuplicates !== false
      });
      return launchResult;

    case 'REFRESH_GROUP_NOW':
      const refreshResult = await launchGroupManager.refreshGroupNow(message.groupId);
      return refreshResult;

    case 'PAUSE_ALL_REFRESH':
      await launchGroupManager.pauseAllRefresh();
      return { success: true };

    case 'RESUME_ALL_REFRESH':
      await launchGroupManager.resumeAllRefresh();
      return { success: true };

    case 'GET_TEMPLATES':
      return { templates: launchGroupManager.getTemplates() };

    case 'EXPORT_LAUNCH_GROUP':
      const exported = await launchGroupManager.exportGroup(message.groupId);
      return { json: exported };

    case 'IMPORT_LAUNCH_GROUP':
      const imported = launchGroupManager.importGroup(message.jsonString);
      await launchGroupManager.saveGroup(imported);
      return { group: imported };

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

// ============================================================================
// Tab activity tracking
// ============================================================================
const tabActivityTracker = new Map();

chrome.tabs.onActivated.addListener(({ tabId }) => {
  tabActivityTracker.set(tabId, Date.now());
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    tabActivityTracker.set(tabId, Date.now());
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabActivityTracker.delete(tabId);
});

globalThis.getTabLastActivity = (tabId) => {
  return tabActivityTracker.get(tabId) || Date.now();
};

// ============================================================================
// Context menu
// ============================================================================
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-current-workspace',
    title: 'Save tabs as workspace',
    contexts: ['page', 'action']
  });

  chrome.contextMenus.create({
    id: 'auto-group-tabs',
    title: 'Auto-group tabs by domain',
    contexts: ['page', 'action']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-current-workspace') {
    // sidePanel.open() must be called with user gesture context preserved
    await chrome.sidePanel.open({ windowId: tab.windowId });
    chrome.runtime.sendMessage({ type: 'SHOW_SAVE_DIALOG' });
  } else if (info.menuItemId === 'auto-group-tabs') {
    const tabs = await chrome.tabs.query({ windowId: tab.windowId });
    await tabsManager.autoGroupByDomain(tabs);
  }
});

console.log('Tab Workspace Manager service worker initialized');
