// Side Panel JavaScript — Workspaces + Quick Launch Groups
let workspaces = [];
let launchGroups = [];
let currentTabs = [];
let settings = {};
let searchTimeout = null;
let activeView = 'workspaces'; // 'workspaces' or 'launchGroups'

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
    const [workspacesResp, tabsResp, settingsResp, launchGroupsResp] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_WORKSPACES' }),
      chrome.runtime.sendMessage({ type: 'GET_CURRENT_WINDOW_TABS' }),
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
      chrome.runtime.sendMessage({ type: 'GET_LAUNCH_GROUPS' })
    ]);

    workspaces = workspacesResp.workspaces || [];
    currentTabs = tabsResp.tabs || [];
    settings = settingsResp.settings || {};
    launchGroups = launchGroupsResp.groups || [];

    renderWorkspaces();
    renderLaunchGroups();
    updateStats();
  } catch (error) {
    console.error('Failed to load data:', error);
    showToast('Failed to load data');
  }
}

// ── View switching ──
function switchView(view) {
  activeView = view;
  const workspacesContent = document.getElementById('workspaceList');
  const launchContent = document.getElementById('launchGroupList');
  const workspacesActions = document.getElementById('workspacesActions');
  const launchActions = document.getElementById('launchGroupsActions');

  if (view === 'workspaces') {
    document.getElementById('tabWorkspacesBtn').classList.add('active');
    document.getElementById('tabLaunchGroupsBtn').classList.remove('active');
    workspacesContent.classList.remove('hidden');
    launchContent.classList.add('hidden');
    workspacesActions.classList.remove('hidden');
    launchActions.classList.add('hidden');
  } else {
    document.getElementById('tabWorkspacesBtn').classList.remove('active');
    document.getElementById('tabLaunchGroupsBtn').classList.add('active');
    workspacesContent.classList.add('hidden');
    launchContent.classList.remove('hidden');
    workspacesActions.classList.add('hidden');
    launchActions.classList.remove('hidden');
  }
}

// ── Event Listeners ──
function attachEventListeners() {
  // Nav tabs
  document.getElementById('tabWorkspacesBtn').addEventListener('click', () => switchView('workspaces'));
  document.getElementById('tabLaunchGroupsBtn').addEventListener('click', () => switchView('launchGroups'));

  // Search
  document.getElementById('searchInput').addEventListener('input', handleSearch);

  // Workspace actions
  document.getElementById('saveWorkspaceBtn').addEventListener('click', showSaveModal);
  document.getElementById('emptyStateSaveBtn').addEventListener('click', showSaveModal);
  document.getElementById('autoGroupBtn').addEventListener('click', handleAutoGroup);

  // Launch Group actions
  document.getElementById('createLaunchGroupBtn').addEventListener('click', showCreateGroupModal);
  document.getElementById('useTemplatesBtn').addEventListener('click', showTemplatesModal);
  document.getElementById('createFirstGroupBtn').addEventListener('click', showCreateGroupModal);
  document.getElementById('templatesBtn').addEventListener('click', showTemplatesModal);

  // Save workspace modal
  document.getElementById('cancelSaveBtn').addEventListener('click', hideSaveModal);
  document.getElementById('confirmSaveBtn').addEventListener('click', handleSaveWorkspace);
  document.getElementById('workspaceNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSaveWorkspace();
  });

  // Create launch group modal
  document.getElementById('cancelCreateGroupBtn').addEventListener('click', hideCreateGroupModal);
  document.getElementById('confirmCreateGroupBtn').addEventListener('click', handleCreateLaunchGroup);

  // Templates modal
  document.getElementById('closeTemplatesBtn').addEventListener('click', hideTemplatesModal);

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', showSettingsModal);
  document.getElementById('closeSettingsBtn').addEventListener('click', hideSettingsModal);
  document.getElementById('autoGroupSetting').addEventListener('change', handleSettingChange);
  document.getElementById('hibernateSetting').addEventListener('change', handleSettingChange);
  document.getElementById('themeSetting').addEventListener('change', handleSettingChange);

  // Click outside modals to close
  ['saveModal', 'createLaunchGroupModal', 'templatesModal', 'settingsModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
      if (e.target.id === id) {
        document.getElementById(id).classList.add('hidden');
      }
    });
  });
}

// Message listener for keyboard shortcut commands from background
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'FOCUS_SEARCH':
        document.getElementById('searchInput').focus();
        break;
      case 'SHOW_SAVE_DIALOG':
        switchView('workspaces');
        showSaveModal();
        break;
      case 'SHOW_LAUNCH_PICKER':
        switchView('launchGroups');
        document.getElementById('searchInput').focus();
        break;
    }
  });
}

// ── Search ──
function handleSearch(e) {
  const query = e.target.value.trim();
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    if (query === '') {
      document.getElementById('tabList').classList.add('hidden');
      if (activeView === 'workspaces') {
        document.getElementById('workspaceList').classList.remove('hidden');
      } else {
        document.getElementById('launchGroupList').classList.remove('hidden');
      }
    } else {
      document.getElementById('workspaceList').classList.add('hidden');
      document.getElementById('launchGroupList').classList.add('hidden');
      document.getElementById('tabList').classList.remove('hidden');
      const response = await chrome.runtime.sendMessage({ type: 'SEARCH_TABS', query });
      renderTabList(response.results);
    }
  }, 200);
}

function renderTabList(tabs) {
  const container = document.getElementById('tabList');
  container.innerHTML = '';
  if (tabs.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">No tabs found</div>';
    return;
  }
  tabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'tab-item';
    item.innerHTML = `
      <img class="tab-favicon" src="${tab.favIconUrl || ''}" alt="" onerror="this.style.display='none'">
      <div class="tab-info">
        <div class="tab-title">${escapeHtml(tab.title)}</div>
        <div class="tab-url">${escapeHtml(tab.url)}</div>
      </div>
      <button class="tab-close" title="Close tab">×</button>
    `;
    item.addEventListener('click', async (e) => {
      if (!e.target.classList.contains('tab-close')) {
        await chrome.runtime.sendMessage({ type: 'SWITCH_TO_TAB', tabId: tab.id, windowId: tab.windowId });
      }
    });
    item.querySelector('.tab-close').addEventListener('click', async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: tab.id });
      item.remove();
      showToast('Tab closed');
    });
    container.appendChild(item);
  });
}

// ── Workspace rendering ──
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="workspace-action-btn" data-action="delete" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
      <div class="workspace-meta">
        <span class="workspace-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>
          ${workspace.tabCount} tabs
        </span>
        <span>•</span>
        <span class="workspace-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          ${timeAgo}
        </span>
      </div>
    `;
    card.addEventListener('click', async (e) => {
      if (!e.target.closest('.workspace-action-btn')) {
        await restoreWorkspace(workspace.id);
      }
    });
    card.querySelector('[data-action="rename"]').addEventListener('click', (e) => { e.stopPropagation(); renameWorkspace(workspace.id, workspace.name); });
    card.querySelector('[data-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); deleteWorkspace(workspace.id, workspace.name); });
    container.appendChild(card);
  });
}

// ── Launch Group rendering ──
function renderLaunchGroups() {
  const container = document.getElementById('launchGroupItems');
  const emptyState = document.getElementById('launchEmptyState');

  if (launchGroups.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  container.innerHTML = '';

  launchGroups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'launch-group-card';
    card.dataset.groupId = group.id;

    const refreshLabel = group.defaultRefresh > 0 ? `${group.defaultRefresh}s` : 'Off';
    const launchedAgo = group.lastLaunched ? formatTimeAgo(group.lastLaunched) : 'Never launched';
    const urlCount = group.urls ? group.urls.length : 0;

    // Build collapsed URL preview (first 3)
    const urlPreview = group.urls.slice(0, 3).map(u => {
      const domain = extractDomain(u.url);
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      const refreshClass = u.autoRefresh ? 'on' : 'off';
      const refreshSymbol = u.autoRefresh ? '🔄' : '—';
      return `<div class="launch-url-item">
        <img src="${favicon}" alt="" onerror="this.style.display='none'">
        <span class="url-text" title="${escapeHtml(u.url)}">${escapeHtml(u.url)}</span>
        <span class="refresh-indicator ${refreshClass}" title="${u.autoRefresh ? `Refresh every ${u.refreshInterval}s` : 'No auto-refresh'}">${refreshSymbol}</span>
      </div>`;
    }).join('');

    const remaining = urlCount - 3;
    const expandBtn = remaining > 0 ? `<div class="launch-group-toggle"><button class="expand-urls-btn" data-expanded="false">+ ${remaining} more URLs</button></div>` : '';

    card.innerHTML = `
      <div class="launch-group-header">
        <div class="launch-group-icon">${group.icon || '🚀'}</div>
        <div class="launch-group-info">
          <div class="launch-group-name">${escapeHtml(group.name)}</div>
          <div class="launch-group-meta">
            <span>${urlCount} URLs</span>
            <span class="launch-group-badge" style="background:${group.color === 'grey' ? 'var(--bg-tertiary)' : 'var(--primary)'};color:white;">Refresh: ${refreshLabel}</span>
            <span>${launchedAgo}</span>
          </div>
        </div>
        <div class="launch-group-actions">
          <button class="refresh-btn" data-action="refresh" title="Refresh all tabs now">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
          </button>
          <button class="launch-btn" data-action="launch">🚀 Launch</button>
        </div>
      </div>
      <div class="launch-group-urls" id="urls-${group.id}">
        ${urlPreview}
      </div>
      ${expandBtn}
      <div style="display:flex;gap:4px;padding:0 14px 10px;">
        <button class="workspace-action-btn" data-action="edit" title="Edit" style="width:24px;height:24px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="workspace-action-btn" data-action="delete" title="Delete" style="width:24px;height:24px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    // Launch button
    card.querySelector('[data-action="launch"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleLaunchGroup(group.id);
    });

    // Refresh button
    card.querySelector('[data-action="refresh"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.classList.add('spinning');
      try {
        const result = await chrome.runtime.sendMessage({ type: 'REFRESH_GROUP_NOW', groupId: group.id });
        showToast(`Refreshed ${result.refreshedCount} tabs`);
      } catch (err) {
        showToast('Refresh failed');
      }
      setTimeout(() => btn.classList.remove('spinning'), 800);
    });

    // Edit button
    card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
      e.stopPropagation();
      showEditGroupModal(group);
    });

    // Delete button
    card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${group.name}"?`)) {
        await chrome.runtime.sendMessage({ type: 'DELETE_LAUNCH_GROUP', groupId: group.id });
        showToast('Group deleted');
        await loadData();
      }
    });

    // Expand URLs button
    const expandBtnEl = card.querySelector('.expand-urls-btn');
    if (expandBtnEl) {
      expandBtnEl.addEventListener('click', async (e) => {
        const expanded = e.target.dataset.expanded === 'true';
        if (!expanded) {
          // Show all URLs
          const urlsContainer = document.getElementById(`urls-${group.id}`);
          const allUrls = group.urls.map(u => {
            const domain = extractDomain(u.url);
            const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
            const refreshClass = u.autoRefresh ? 'on' : 'off';
            const refreshSymbol = u.autoRefresh ? '🔄' : '—';
            return `<div class="launch-url-item">
              <img src="${favicon}" alt="" onerror="this.style.display='none'">
              <span class="url-text" title="${escapeHtml(u.url)}">${escapeHtml(u.url)}</span>
              <span class="refresh-indicator ${refreshClass}">${refreshSymbol}</span>
            </div>`;
          }).join('');
          urlsContainer.innerHTML = allUrls;
          e.target.textContent = '− Show less';
          e.target.dataset.expanded = 'true';
        } else {
          // Collapse back to first 3
          await loadData();
        }
      });
    }

    container.appendChild(card);
  });
}

// ── Launch a group ──
async function handleLaunchGroup(groupId) {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'LAUNCH_GROUP',
      groupId: groupId,
      newWindow: false,
      replace: false
    });
    showToast(`🚀 Launched ${result.tabCount} tabs — ${result.groupName}`);
    await loadData();
  } catch (error) {
    console.error('Failed to launch group:', error);
    showToast('Failed to launch group');
  }
}

// ── Create Launch Group Modal ──
function showCreateGroupModal() {
  document.getElementById('launchGroupNameInput').value = '';
  document.getElementById('launchGroupUrlsInput').value = '';
  document.getElementById('launchGroupIconInput').value = '🚀';
  document.getElementById('launchGroupColorInput').value = 'blue';
  document.getElementById('launchGroupRefreshInput').value = '0';
  document.getElementById('createLaunchGroupModal').classList.remove('hidden');
  document.getElementById('launchGroupNameInput').focus();
}

function hideCreateGroupModal() {
  document.getElementById('createLaunchGroupModal').classList.add('hidden');
}

function showEditGroupModal(group) {
  document.getElementById('launchGroupNameInput').value = group.name;
  document.getElementById('launchGroupUrlsInput').value = group.urls.map(u => u.url).join('\n');
  document.getElementById('launchGroupIconInput').value = group.icon || '🚀';
  document.getElementById('launchGroupColorInput').value = group.color || 'blue';
  document.getElementById('launchGroupRefreshInput').value = group.defaultRefresh || 0;
  document.getElementById('createLaunchGroupModal').classList.remove('hidden');

  // Override the confirm button to update instead of create
  const confirmBtn = document.getElementById('confirmCreateGroupBtn');
  confirmBtn.textContent = 'Update';
  confirmBtn.onclick = async () => {
    const name = document.getElementById('launchGroupNameInput').value.trim();
    const urlsText = document.getElementById('launchGroupUrlsInput').value.trim();
    if (!name || !urlsText) { showToast('Name and URLs required'); return; }
    const urls = urlsText.split('\n').filter(u => u.trim());
    const icon = document.getElementById('launchGroupIconInput').value.trim() || '🚀';
    const color = document.getElementById('launchGroupColorInput').value;
    const defaultRefresh = parseInt(document.getElementById('launchGroupRefreshInput').value) || 0;

    // Create new group data, then update the existing group
    const newGroupData = new LaunchGroupManager(null).createGroup(name, icon, color, urls, defaultRefresh);
    // We can't instantiate LaunchGroupManager here (it's in background), so manually build
    await chrome.runtime.sendMessage({
      type: 'UPDATE_LAUNCH_GROUP',
      groupId: group.id,
      updates: {
        name, icon, color,
        urls: urls.map((url, i) => ({
          url: url.trim(),
          title: '',
          pinned: false,
          autoRefresh: defaultRefresh > 0,
          refreshInterval: defaultRefresh,
          order: i
        })),
        defaultRefresh
      }
    });
    hideCreateGroupModal();
    confirmBtn.textContent = 'Create';
    confirmBtn.onclick = handleCreateLaunchGroup;
    showToast('Group updated!');
    await loadData();
  };
}

async function handleCreateLaunchGroup() {
  const name = document.getElementById('launchGroupNameInput').value.trim();
  const urlsText = document.getElementById('launchGroupUrlsInput').value.trim();

  if (!name || !urlsText) {
    showToast('Name and URLs are required');
    return;
  }

  const urls = urlsText.split('\n').filter(u => u.trim());
  const icon = document.getElementById('launchGroupIconInput').value.trim() || '🚀';
  const color = document.getElementById('launchGroupColorInput').value;
  const defaultRefresh = parseInt(document.getElementById('launchGroupRefreshInput').value) || 0;

  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_LAUNCH_GROUP',
      name, icon, color, urls, defaultRefresh
    });
    hideCreateGroupModal();
    showToast(`Created "${name}" with ${urls.length} URLs`);
    await loadData();
  } catch (error) {
    console.error('Failed to create group:', error);
    showToast('Failed to create group');
  }
}

// ── Templates Modal ──
async function showTemplatesModal() {
  const modal = document.getElementById('templatesModal');
  const listEl = document.getElementById('templateList');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_TEMPLATES' });
    const templates = response.templates || [];

    listEl.innerHTML = '';
    templates.forEach(tpl => {
      const item = document.createElement('div');
      item.className = 'template-item';
      const refreshLabel = tpl.defaultRefresh > 0 ? `Auto-refresh: ${tpl.defaultRefresh}s` : 'No auto-refresh';
      item.innerHTML = `
        <div class="template-item-icon">${tpl.icon}</div>
        <div class="template-item-info">
          <div class="template-item-name">${escapeHtml(tpl.name)}</div>
          <div class="template-item-desc">${tpl.urlCount} URLs · ${refreshLabel}</div>
        </div>
        <span class="template-item-action">Use →</span>
      `;
      item.addEventListener('click', async () => {
        try {
          await chrome.runtime.sendMessage({ type: 'CREATE_FROM_TEMPLATE', templateKey: tpl.key });
          hideTemplatesModal();
          showToast(`Created "${tpl.name}" from template`);
          await loadData();
        } catch (err) {
          showToast('Failed to create from template');
        }
      });
      listEl.appendChild(item);
    });

    modal.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load templates:', error);
    showToast('Failed to load templates');
  }
}

function hideTemplatesModal() {
  document.getElementById('templatesModal').classList.add('hidden');
}

// ── Workspace actions (unchanged from original) ──
async function restoreWorkspace(id) {
  try {
    await chrome.runtime.sendMessage({ type: 'RESTORE_WORKSPACE', workspaceId: id, replace: false, newWindow: false });
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
      await chrome.runtime.sendMessage({ type: 'RENAME_WORKSPACE', workspaceId: id, newName });
      showToast('Workspace renamed');
      await loadData();
    } catch (error) {
      showToast('Failed to rename workspace');
    }
  }
}

async function deleteWorkspace(id, name) {
  if (confirm(`Delete workspace "${name}"?`)) {
    try {
      await chrome.runtime.sendMessage({ type: 'DELETE_WORKSPACE', workspaceId: id });
      showToast('Workspace deleted');
      await loadData();
    } catch (error) {
      showToast('Failed to delete workspace');
    }
  }
}

function showSaveModal() {
  const modal = document.getElementById('saveModal');
  const input = document.getElementById('workspaceNameInput');
  const now = new Date();
  input.value = `Workspace ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  modal.classList.remove('hidden');
  input.select();
}

function hideSaveModal() {
  document.getElementById('saveModal').classList.add('hidden');
}

async function handleSaveWorkspace() {
  const name = document.getElementById('workspaceNameInput').value.trim();
  if (!name) { showToast('Please enter a workspace name'); return; }
  try {
    await chrome.runtime.sendMessage({ type: 'SAVE_WORKSPACE', name });
    hideSaveModal();
    showToast('Workspace saved!');
    await loadData();
  } catch (error) {
    showToast('Failed to save workspace');
  }
}

async function handleAutoGroup() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'AUTO_GROUP_TABS' });
    showToast(`Created ${response.groups.length} group(s)`);
  } catch (error) {
    showToast('Failed to auto-group tabs');
  }
}

// ── Settings ──
async function showSettingsModal() {
  document.getElementById('autoGroupSetting').checked = settings.autoGroup;
  document.getElementById('hibernateSetting').checked = settings.hibernateEnabled;
  document.getElementById('themeSetting').value = settings.theme;

  const analyticsResponse = await chrome.runtime.sendMessage({ type: 'GET_ANALYTICS' });
  const analytics = analyticsResponse.analytics;
  document.getElementById('totalTabsStat').textContent = analytics.totalTabsSaved || 0;
  document.getElementById('totalRestoresStat').textContent = analytics.totalRestores || 0;

  document.getElementById('settingsModal').classList.remove('hidden');
}

function hideSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

async function handleSettingChange(e) {
  const setting = e.target.id.replace('Setting', '');
  const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  try {
    await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { [setting]: value } });
    settings[setting] = value;
    if (setting === 'theme') applyTheme();
    showToast('Settings updated');
  } catch (error) {
    showToast('Failed to update settings');
  }
}

// ── Stats ──
function updateStats() {
  document.getElementById('tabCount').textContent = currentTabs.length;
  document.getElementById('workspaceCount').textContent = workspaces.length;
  const groupIds = new Set(currentTabs.filter(t => t.groupId !== -1).map(t => t.groupId));
  document.getElementById('groupCount').textContent = groupIds.size;
}

// ── Theme ──
function applyTheme() {
  const theme = settings.theme || 'light';
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    document.body.dataset.theme = theme;
  }
}

// ── Utility ──
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Never';
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

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
