// Side Panel JavaScript
let workspaces = [];
let currentTabs = [];
let settings = {};
let searchTimeout = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  attachEventListeners();
  setupMessageListener();
  applyTheme();
});

// Load data from background
async function loadData() {
  try {
    // Load workspaces
    const workspacesResponse = await chrome.runtime.sendMessage({ type: 'GET_WORKSPACES' });
    workspaces = workspacesResponse.workspaces || [];

    // Load current tabs
    const tabsResponse = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_WINDOW_TABS' });
    currentTabs = tabsResponse.tabs || [];

    // Load settings
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    settings = settingsResponse.settings || {};

    // Update UI
    renderWorkspaces();
    updateStats();
  } catch (error) {
    console.error('Failed to load data:', error);
    showToast('Failed to load data');
  }
}

// Event Listeners
function attachEventListeners() {
  // Search
  document.getElementById('searchInput').addEventListener('input', handleSearch);

  // Quick actions
  document.getElementById('saveWorkspaceBtn').addEventListener('click', showSaveModal);
  document.getElementById('emptyStateSaveBtn').addEventListener('click', showSaveModal);
  document.getElementById('autoGroupBtn').addEventListener('click', handleAutoGroup);

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', showSettingsModal);

  // Save modal
  document.getElementById('cancelSaveBtn').addEventListener('click', hideSaveModal);
  document.getElementById('confirmSaveBtn').addEventListener('click', handleSaveWorkspace);
  document.getElementById('workspaceNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSaveWorkspace();
  });

  // Settings modal
  document.getElementById('closeSettingsBtn').addEventListener('click', hideSettingsModal);
  document.getElementById('autoGroupSetting').addEventListener('change', handleSettingChange);
  document.getElementById('hibernateSetting').addEventListener('change', handleSettingChange);
  document.getElementById('themeSetting').addEventListener('change', handleSettingChange);

  // Click outside modal to close
  document.getElementById('saveModal').addEventListener('click', (e) => {
    if (e.target.id === 'saveModal') hideSaveModal();
  });
  document.getElementById('settingsModal').addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') hideSettingsModal();
  });
}

// Message listener for commands from background
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'FOCUS_SEARCH':
        document.getElementById('searchInput').focus();
        break;
      case 'SHOW_SAVE_DIALOG':
        showSaveModal();
        break;
    }
  });
}

// Search tabs
function handleSearch(e) {
  const query = e.target.value.trim();

  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    if (query === '') {
      // Show workspaces
      document.getElementById('tabList').classList.add('hidden');
      document.getElementById('workspaceList').classList.remove('hidden');
    } else {
      // Show search results
      document.getElementById('workspaceList').classList.add('hidden');
      document.getElementById('tabList').classList.remove('hidden');

      const response = await chrome.runtime.sendMessage({
        type: 'SEARCH_TABS',
        query
      });

      renderTabList(response.results);
    }
  }, 200);
}

// Render tab search results
function renderTabList(tabs) {
  const container = document.getElementById('tabList');
  container.innerHTML = '';

  if (tabs.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No tabs found</div>';
    return;
  }

  tabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'tab-item';
    item.innerHTML = `
      <img class="tab-favicon" src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%235f6368" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>'}" alt="">
      <div class="tab-info">
        <div class="tab-title">${escapeHtml(tab.title)}</div>
        <div class="tab-url">${escapeHtml(tab.url)}</div>
      </div>
      <button class="tab-close" title="Close tab">×</button>
    `;

    // Click to switch to tab
    item.addEventListener('click', async (e) => {
      if (!e.target.classList.contains('tab-close')) {
        await chrome.runtime.sendMessage({
          type: 'SWITCH_TO_TAB',
          tabId: tab.id,
          windowId: tab.windowId
        });
      }
    });

    // Close button
    item.querySelector('.tab-close').addEventListener('click', async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({
        type: 'CLOSE_TAB',
        tabId: tab.id
      });
      item.remove();
      showToast('Tab closed');
    });

    container.appendChild(item);
  });
}

// Render workspaces
function renderWorkspaces() {
  const container = document.getElementById('workspaceItems');
  const emptyState = document.getElementById('emptyState');

  if (workspaces.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  container.innerHTML = '';

  workspaces.forEach(workspace => {
    const card = document.createElement('div');
    card.className = 'workspace-card';

    const timeAgo = formatTimeAgo(workspace.lastUsed);

    card.innerHTML = `
      <div class="workspace-header">
        <div class="workspace-name">${escapeHtml(workspace.name)}</div>
        <div class="workspace-actions">
          <button class="workspace-action-btn" data-action="rename" title="Rename">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="workspace-action-btn" data-action="delete" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="workspace-meta">
        <span class="workspace-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
          </svg>
          ${workspace.tabCount} tabs
        </span>
        <span>•</span>
        <span class="workspace-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          ${timeAgo}
        </span>
      </div>
    `;

    // Click to restore
    card.addEventListener('click', async (e) => {
      if (!e.target.closest('.workspace-action-btn')) {
        await restoreWorkspace(workspace.id);
      }
    });

    // Action buttons
    card.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
      e.stopPropagation();
      renameWorkspace(workspace.id, workspace.name);
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWorkspace(workspace.id, workspace.name);
    });

    container.appendChild(card);
  });
}

// Workspace actions
async function restoreWorkspace(id) {
  try {
    await chrome.runtime.sendMessage({
      type: 'RESTORE_WORKSPACE',
      workspaceId: id,
      replace: false,
      newWindow: false
    });
    showToast('Workspace restored!');
    await loadData();
  } catch (error) {
    console.error('Failed to restore workspace:', error);
    showToast('Failed to restore workspace');
  }
}

async function renameWorkspace(id, currentName) {
  const newName = prompt('Rename workspace:', currentName);
  if (newName && newName !== currentName) {
    try {
      await chrome.runtime.sendMessage({
        type: 'RENAME_WORKSPACE',
        workspaceId: id,
        newName
      });
      showToast('Workspace renamed');
      await loadData();
    } catch (error) {
      console.error('Failed to rename workspace:', error);
      showToast('Failed to rename workspace');
    }
  }
}

async function deleteWorkspace(id, name) {
  if (confirm(`Delete workspace "${name}"?`)) {
    try {
      await chrome.runtime.sendMessage({
        type: 'DELETE_WORKSPACE',
        workspaceId: id
      });
      showToast('Workspace deleted');
      await loadData();
    } catch (error) {
      console.error('Failed to delete workspace:', error);
      showToast('Failed to delete workspace');
    }
  }
}

// Save workspace modal
function showSaveModal() {
  const modal = document.getElementById('saveModal');
  const input = document.getElementById('workspaceNameInput');

  // Generate default name
  const now = new Date();
  const defaultName = `Workspace ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  input.value = defaultName;

  modal.classList.remove('hidden');
  input.select();
}

function hideSaveModal() {
  document.getElementById('saveModal').classList.add('hidden');
}

async function handleSaveWorkspace() {
  const name = document.getElementById('workspaceNameInput').value.trim();

  if (!name) {
    showToast('Please enter a workspace name');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_WORKSPACE',
      name
    });

    hideSaveModal();
    showToast('Workspace saved!');
    await loadData();
  } catch (error) {
    console.error('Failed to save workspace:', error);
    showToast('Failed to save workspace');
  }
}

// Auto-group tabs
async function handleAutoGroup() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AUTO_GROUP_TABS'
    });

    const count = response.groups.length;
    showToast(`Created ${count} group${count !== 1 ? 's' : ''}`);
  } catch (error) {
    console.error('Failed to auto-group:', error);
    showToast('Failed to auto-group tabs');
  }
}

// Settings modal
async function showSettingsModal() {
  const modal = document.getElementById('settingsModal');

  // Load current settings
  document.getElementById('autoGroupSetting').checked = settings.autoGroup;
  document.getElementById('hibernateSetting').checked = settings.hibernateEnabled;
  document.getElementById('themeSetting').value = settings.theme;

  // Load analytics
  const analyticsResponse = await chrome.runtime.sendMessage({ type: 'GET_ANALYTICS' });
  const analytics = analyticsResponse.analytics;

  document.getElementById('totalTabsStat').textContent = analytics.totalTabsSaved || 0;
  document.getElementById('totalRestoresStat').textContent = analytics.totalRestores || 0;

  modal.classList.remove('hidden');
}

function hideSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

async function handleSettingChange(e) {
  const setting = e.target.id.replace('Setting', '');
  const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

  try {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { [setting]: value }
    });

    settings[setting] = value;

    if (setting === 'theme') {
      applyTheme();
    }

    showToast('Settings updated');
  } catch (error) {
    console.error('Failed to update settings:', error);
    showToast('Failed to update settings');
  }
}

// Update stats bar
function updateStats() {
  document.getElementById('tabCount').textContent = currentTabs.length;
  document.getElementById('workspaceCount').textContent = workspaces.length;

  // Count groups in current window
  const groupIds = new Set(currentTabs.filter(t => t.groupId !== -1).map(t => t.groupId));
  document.getElementById('groupCount').textContent = groupIds.size;
}

// Apply theme
function applyTheme() {
  const theme = settings.theme || 'light';

  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    document.body.dataset.theme = theme;
  }
}

// Utility functions
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
