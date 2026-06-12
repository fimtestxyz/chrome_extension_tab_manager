// Popup JavaScript
document.addEventListener('DOMContentLoaded', async () => {
  await updateStats();
  attachEventListeners();
});

async function updateStats() {
  try {
    // Get current tabs
    const tabs = await chrome.tabs.query({ currentWindow: true });
    document.getElementById('tabCount').textContent = tabs.length;

    // Get workspaces count
    const response = await chrome.runtime.sendMessage({ type: 'GET_WORKSPACES' });
    const workspaces = response.workspaces || {};
    document.getElementById('workspaceCount').textContent = Object.keys(workspaces).length;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

function attachEventListeners() {
  // Open side panel
  document.getElementById('openSidePanelBtn').addEventListener('click', async () => {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ windowId: currentTab.windowId });
    window.close();
  });

  // Save workspace
  document.getElementById('saveWorkspaceBtn').addEventListener('click', async () => {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ windowId: currentTab.windowId });

    // Wait a bit for side panel to open, then send message
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'SHOW_SAVE_DIALOG' });
    }, 100);

    window.close();
  });

  // Auto-group
  document.getElementById('autoGroupBtn').addEventListener('click', async () => {
    try {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabs = await chrome.tabs.query({ windowId: currentTab.windowId });

      // Filter tabs by domain and create groups
      const domainGroups = new Map();

      for (const tab of tabs) {
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
          continue;
        }

        try {
          const url = new URL(tab.url);
          const baseDomain = url.hostname.split('.').slice(-2).join('.');

          if (!domainGroups.has(baseDomain)) {
            domainGroups.set(baseDomain, []);
          }
          domainGroups.get(baseDomain).push(tab);
        } catch (e) {
          // Invalid URL, skip
        }
      }

      // Create groups for domains with 2+ tabs
      let groupCount = 0;
      const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

      for (const [domain, domainTabs] of domainGroups.entries()) {
        if (domainTabs.length >= 2) {
          const ungroupedTabs = domainTabs.filter(t => {
            // Check if tab is in a group (Chrome returns -1 or actual groupId)
            const inGroup = tabs.find(t => t.groupId !== -1 && t.groupId !== undefined);
            return t.groupId === -1 || t.groupId === undefined;
          });

          if (ungroupedTabs.length >= 2) {
            const groupId = await chrome.tabs.group({
              tabIds: ungroupedTabs.map(t => t.id)
            });

            await chrome.tabGroups.update(groupId, {
              title: domain.replace('.com', ''),
              color: colors[groupCount % colors.length]
            });

            groupCount++;
          }
        }
      }

      if (groupCount > 0) {
        alert(`Created ${groupCount} group${groupCount !== 1 ? 's' : ''}`);
      } else {
        alert('No tabs to group. Try opening more tabs from the same domain!');
      }
    } catch (error) {
      console.error('Failed to auto-group:', error);
      alert('Failed to auto-group tabs');
    }

    window.close();
  });

  // Keyboard shortcuts
  document.getElementById('keyboardShortcuts').addEventListener('click', async () => {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    window.close();
  });
}