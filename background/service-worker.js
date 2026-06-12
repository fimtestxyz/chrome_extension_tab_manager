// Service Worker for Tab Workspace Manager (Manifest V3)
// All code bundled in one file (no ES6 imports in service workers)

// ============================================================================
// StorageManager - Abstraction over chrome.storage API
// ============================================================================
class StorageManager {
  constructor() {
    this.DEFAULTS = {
      workspaces: {},
      settings: {
        autoGroup: true,
        theme: 'light',
        hibernateEnabled: false,
        hibernateAfter: 30, // minutes
        showTabCount: true,
        groupByDefault: true
      },
      analytics: {
        totalTabsSaved: 0,
        workspaceCount: 0,
        totalRestores: 0,
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
chrome.commands.onCommand.addListener(async (command) => {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  switch (command) {
    case 'open-sidepanel':
      await chrome.sidePanel.open({ windowId: currentTab.windowId });
      break;

    case 'search-tabs':
      await chrome.sidePanel.open({ windowId: currentTab.windowId });
      chrome.runtime.sendMessage({ type: 'FOCUS_SEARCH' });
      break;

    case 'quick-save':
      await chrome.sidePanel.open({ windowId: currentTab.windowId });
      chrome.runtime.sendMessage({ type: 'SHOW_SAVE_DIALOG' });
      break;
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
    await chrome.sidePanel.open({ windowId: tab.windowId });
    chrome.runtime.sendMessage({ type: 'SHOW_SAVE_DIALOG' });
  } else if (info.menuItemId === 'auto-group-tabs') {
    const tabs = await chrome.tabs.query({ windowId: tab.windowId });
    await tabsManager.autoGroupByDomain(tabs);
  }
});

console.log('Tab Workspace Manager service worker initialized');
