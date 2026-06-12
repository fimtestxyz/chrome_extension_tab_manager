// Storage Manager - Abstraction over chrome.storage API
export class StorageManager {
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

  // Storage quota check
  async getStorageUsage() {
    const bytes = await chrome.storage.local.getBytesInUse();
    const maxBytes = 10 * 1024 * 1024; // 10MB limit
    return {
      used: bytes,
      max: maxBytes,
      percentage: (bytes / maxBytes) * 100
    };
  }

  async isStorageAlmostFull() {
    const usage = await this.getStorageUsage();
    return usage.percentage > 80;
  }

  // Clear all data (for debugging/reset)
  async clearAll() {
    await chrome.storage.local.clear();
    await this.init();
  }
}
