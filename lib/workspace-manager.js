// Workspace Manager - CRUD operations for workspaces
export class WorkspaceManager {
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
      // Create new window
      const newWindow = await chrome.windows.create({ focused: true });
      targetWindowId = newWindow.id;

      // Close the default blank tab
      const [defaultTab] = await chrome.tabs.query({ windowId: targetWindowId });
      if (defaultTab) {
        await chrome.tabs.remove(defaultTab.id);
      }
    } else {
      // Use current window
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      targetWindowId = currentTab.windowId;

      // Optionally replace existing tabs
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
    const groupIdMap = new Map(); // old groupId -> new groupId

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

          groupIdMap.set(groupData.id, groupId);
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

  async duplicateWorkspace(id) {
    const original = await this.getWorkspace(id);
    if (!original) {
      throw new Error('Workspace not found');
    }

    const duplicate = {
      ...original,
      id: this.generateId(),
      name: `${original.name} (Copy)`,
      createdAt: Date.now(),
      lastUsed: Date.now()
    };

    await this.storage.saveWorkspace(duplicate);
    return duplicate;
  }

  async exportWorkspace(id) {
    const workspace = await this.getWorkspace(id);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    return JSON.stringify(workspace, null, 2);
  }

  async importWorkspace(jsonString) {
    try {
      const workspace = JSON.parse(jsonString);

      // Validate structure
      if (!workspace.tabs || !Array.isArray(workspace.tabs)) {
        throw new Error('Invalid workspace format');
      }

      // Generate new ID and timestamps
      workspace.id = this.generateId();
      workspace.createdAt = Date.now();
      workspace.lastUsed = Date.now();
      workspace.name = workspace.name || 'Imported Workspace';

      await this.storage.saveWorkspace(workspace);
      return workspace;
    } catch (error) {
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  // Get workspace statistics
  async getStatistics() {
    const workspaces = await this.getAllWorkspaces();
    const analytics = await this.storage.getAnalytics();

    const totalTabs = workspaces.reduce((sum, ws) => sum + ws.tabCount, 0);
    const avgTabsPerWorkspace = workspaces.length > 0 ? totalTabs / workspaces.length : 0;

    return {
      totalWorkspaces: workspaces.length,
      totalTabs,
      avgTabsPerWorkspace: Math.round(avgTabsPerWorkspace),
      totalRestores: analytics.totalRestores || 0,
      mostUsedWorkspace: workspaces.length > 0 ? workspaces[0] : null
    };
  }
}
