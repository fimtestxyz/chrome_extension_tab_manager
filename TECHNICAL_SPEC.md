# Technical Specification: Chrome Tab Manager Extension

## Architecture Overview

### Manifest V3 Key Concepts

**Service Worker** (replaces background pages)
- Event-driven, non-persistent
- Wakes up on events, goes dormant after ~30s of inactivity
- No DOM access, no `window` object
- Use chrome.storage for state persistence

**Modern APIs**
- `chrome.tabs` - Tab lifecycle management
- `chrome.tabGroups` - Native Chrome tab groups
- `chrome.sidePanel` - Side panel UI (Chrome 114+)
- `chrome.storage.local` - Local storage (10MB limit)
- `chrome.storage.sync` - Cross-device sync (100KB limit)
- `chrome.commands` - Keyboard shortcuts
- `chrome.alarms` - Scheduled tasks

---

## Core Technical Decisions

### 1. UI Architecture: Side Panel vs Popup

**Side Panel (Recommended)**
- ✅ Persistent UI, doesn't close when clicking outside
- ✅ More screen real estate for workspace management
- ✅ Modern Chrome UX pattern
- ❌ Requires Chrome 114+ (released May 2023, ~95% adoption)

**Popup (Fallback/Quick Actions)**
- ✅ Universal compatibility
- ✅ Good for quick actions (search, switch workspace)
- ❌ Closes on blur, poor for complex workflows

**Decision**: Use Side Panel as primary UI, Popup for quick actions

---

### 2. State Management

#### Service Worker State (Ephemeral)
```javascript
// In-memory only, lost on worker restart
let activeWorkspaceId = null;
let tabCache = new Map();
```

#### Persistent State (chrome.storage.local)
```javascript
{
  workspaces: {
    "ws-uuid-1": { name: "...", tabs: [...], ... },
    "ws-uuid-2": { ... }
  },
  settings: {
    autoGroup: true,
    theme: "light",
    hibernateAfter: 30
  },
  analytics: {
    totalTabsSaved: 1234,
    workspaceCount: 8,
    lastUsed: timestamp
  }
}
```

#### Sync State (chrome.storage.sync)
```javascript
{
  workspaceIds: ["ws-uuid-1", "ws-uuid-2"], // Metadata only
  syncEnabled: true
}
// Actual workspace data synced separately due to size limits
```

---

### 3. Tab Grouping Algorithm

#### Phase 1: Domain-Based Auto-Grouping
```javascript
function autoGroupByDomain(tabs) {
  const groups = {};
  
  tabs.forEach(tab => {
    const domain = new URL(tab.url).hostname;
    const baseDomain = extractBaseDomain(domain); // github.com, google.com
    
    if (!groups[baseDomain]) {
      groups[baseDomain] = {
        name: baseDomain,
        color: hashToColor(baseDomain),
        tabs: []
      };
    }
    groups[baseDomain].tabs.push(tab);
  });
  
  // Only create groups with 2+ tabs
  return Object.values(groups).filter(g => g.tabs.length >= 2);
}
```

#### Phase 2: Smart Grouping (Future)
- Use Chrome's built-in ML (chrome.aiOriginTrial)
- Analyze page titles, URLs, content topics
- Learn from user's manual grouping patterns

---

### 4. Workspace Save/Restore Logic

#### Save Workspace
```javascript
async function saveWorkspace(name) {
  // Get all tabs in current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Get existing tab groups
  const groups = await chrome.tabGroups.query({ windowId: tabs[0].windowId });
  
  const workspace = {
    id: generateUUID(),
    name: name,
    createdAt: Date.now(),
    tabs: tabs.map(tab => ({
      url: tab.url,
      title: tab.title,
      pinned: tab.pinned,
      groupId: tab.groupId,
      index: tab.index
    })),
    groups: groups.map(g => ({
      id: g.id,
      title: g.title,
      color: g.color,
      collapsed: g.collapsed
    }))
  };
  
  // Save to storage
  const { workspaces } = await chrome.storage.local.get('workspaces');
  workspaces[workspace.id] = workspace;
  await chrome.storage.local.set({ workspaces });
  
  return workspace;
}
```

#### Restore Workspace
```javascript
async function restoreWorkspace(workspaceId, options = {}) {
  const { workspaces } = await chrome.storage.local.get('workspaces');
  const workspace = workspaces[workspaceId];
  
  if (!workspace) throw new Error('Workspace not found');
  
  // Option 1: Replace current tabs
  if (options.replace) {
    const currentTabs = await chrome.tabs.query({ currentWindow: true });
    const pinnedTabs = currentTabs.filter(t => t.pinned);
    const unpinnedTabs = currentTabs.filter(t => !t.pinned);
    
    // Close unpinned tabs
    await chrome.tabs.remove(unpinnedTabs.map(t => t.id));
  }
  
  // Option 2: Open in new window
  if (options.newWindow) {
    const window = await chrome.windows.create({ focused: true });
    windowId = window.id;
    // Close default new tab
    const [newTab] = await chrome.tabs.query({ windowId });
    await chrome.tabs.remove(newTab.id);
  }
  
  // Restore tabs
  const createdTabs = [];
  for (const tabData of workspace.tabs) {
    const tab = await chrome.tabs.create({
      url: tabData.url,
      pinned: tabData.pinned,
      active: false
    });
    createdTabs.push({ ...tab, originalGroupId: tabData.groupId });
  }
  
  // Restore groups
  const groupIdMap = new Map(); // old groupId -> new groupId
  
  for (const groupData of workspace.groups) {
    const tabsForGroup = createdTabs.filter(t => t.originalGroupId === groupData.id);
    
    if (tabsForGroup.length > 0) {
      const groupId = await chrome.tabs.group({ 
        tabIds: tabsForGroup.map(t => t.id) 
      });
      
      await chrome.tabGroups.update(groupId, {
        title: groupData.title,
        color: groupData.color,
        collapsed: groupData.collapsed
      });
      
      groupIdMap.set(groupData.id, groupId);
    }
  }
  
  // Update last used timestamp
  workspace.lastUsed = Date.now();
  await chrome.storage.local.set({ workspaces });
}
```

---

### 5. Tab Search Implementation

```javascript
// Fuzzy search using simple scoring algorithm
function fuzzySearch(query, tabs) {
  const lowerQuery = query.toLowerCase();
  
  return tabs
    .map(tab => {
      const title = tab.title.toLowerCase();
      const url = tab.url.toLowerCase();
      
      let score = 0;
      
      // Exact match
      if (title.includes(lowerQuery) || url.includes(lowerQuery)) {
        score += 100;
      }
      
      // Word boundary match
      const words = lowerQuery.split(' ');
      words.forEach(word => {
        if (title.includes(word)) score += 50;
        if (url.includes(word)) score += 30;
      });
      
      // Character sequence match (fuzzy)
      let titleIndex = 0;
      for (let char of lowerQuery) {
        const found = title.indexOf(char, titleIndex);
        if (found !== -1) {
          score += 10;
          titleIndex = found + 1;
        }
      }
      
      return { tab, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.tab);
}

// Service worker listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEARCH_TABS') {
    chrome.tabs.query({}).then(tabs => {
      const results = fuzzySearch(message.query, tabs);
      sendResponse({ results });
    });
    return true; // Keep channel open for async response
  }
});
```

---

### 6. Tab Hibernation (Memory Saver)

```javascript
// Use chrome.alarms for periodic checks
chrome.alarms.create('checkInactiveTabs', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkInactiveTabs') {
    const { settings } = await chrome.storage.local.get('settings');
    const hibernateAfter = settings.hibernateAfter || 30; // minutes
    
    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    
    for (const tab of tabs) {
      // Skip active, pinned, or audible tabs
      if (tab.active || tab.pinned || tab.audible) continue;
      
      const lastAccessed = await getTabLastAccessed(tab.id);
      const inactiveMinutes = (now - lastAccessed) / 1000 / 60;
      
      if (inactiveMinutes >= hibernateAfter) {
        // Discard tab (unload from memory, preserves tab state)
        await chrome.tabs.discard(tab.id);
      }
    }
  }
});

// Track tab access times
const tabAccessTimes = new Map();

chrome.tabs.onActivated.addListener(({ tabId }) => {
  tabAccessTimes.set(tabId, Date.now());
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabAccessTimes.delete(tabId);
});
```

---

### 7. Keyboard Shortcuts

**manifest.json**
```json
{
  "commands": {
    "open-search": {
      "suggested_key": {
        "default": "Ctrl+Shift+F",
        "mac": "Command+Shift+F"
      },
      "description": "Search and jump to tab"
    },
    "save-workspace": {
      "suggested_key": {
        "default": "Ctrl+Shift+S",
        "mac": "Command+Shift+S"
      },
      "description": "Save current tabs as workspace"
    },
    "quick-switch": {
      "suggested_key": {
        "default": "Ctrl+Shift+K",
        "mac": "Command+Shift+K"
      },
      "description": "Quick workspace switcher"
    }
  }
}
```

**Service Worker**
```javascript
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-search') {
    chrome.sidePanel.open({ windowId: getCurrentWindowId() });
    // Send message to side panel to focus search input
    chrome.runtime.sendMessage({ type: 'FOCUS_SEARCH' });
  }
  
  if (command === 'save-workspace') {
    // Show quick save dialog
    chrome.runtime.sendMessage({ type: 'SHOW_SAVE_DIALOG' });
  }
  
  if (command === 'quick-switch') {
    chrome.runtime.sendMessage({ type: 'SHOW_QUICK_SWITCHER' });
  }
});
```

---

### 8. Performance Optimization

#### Virtual Scrolling (for 100+ tabs)
```javascript
// Use IntersectionObserver for lazy rendering
class VirtualTabList {
  constructor(container, tabs) {
    this.container = container;
    this.tabs = tabs;
    this.visibleRange = { start: 0, end: 20 };
    this.itemHeight = 48; // pixels
    
    this.render();
    this.setupObserver();
  }
  
  render() {
    // Only render visible items + buffer
    const fragment = document.createDocumentFragment();
    
    for (let i = this.visibleRange.start; i < this.visibleRange.end; i++) {
      const tab = this.tabs[i];
      const element = this.createTabElement(tab);
      fragment.appendChild(element);
    }
    
    this.container.innerHTML = '';
    this.container.appendChild(fragment);
  }
  
  setupObserver() {
    const observer = new IntersectionObserver((entries) => {
      // Adjust visible range based on scroll position
      // Re-render if needed
    }, { root: this.container });
    
    // Observe sentinel elements at top/bottom
  }
}
```

#### Debounced Search
```javascript
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

const debouncedSearch = debounce(async (query) => {
  const results = await searchTabs(query);
  renderSearchResults(results);
}, 300); // 300ms delay
```

---

### 9. Error Handling & Edge Cases

#### Service Worker Restart
```javascript
// Always load state from storage on startup
chrome.runtime.onStartup.addListener(async () => {
  await initializeExtension();
});

async function initializeExtension() {
  // Check if storage exists, initialize if not
  const { workspaces } = await chrome.storage.local.get('workspaces');
  
  if (!workspaces) {
    await chrome.storage.local.set({
      workspaces: {},
      settings: DEFAULT_SETTINGS,
      analytics: {}
    });
  }
  
  // Set up alarms
  chrome.alarms.create('checkInactiveTabs', { periodInMinutes: 5 });
}
```

#### Tab Restore Failures
```javascript
async function restoreTabSafely(url) {
  try {
    return await chrome.tabs.create({ url });
  } catch (error) {
    // Handle invalid URLs, blocked URLs, etc.
    console.error(`Failed to restore tab: ${url}`, error);
    
    // Create error tab
    return await chrome.tabs.create({
      url: chrome.runtime.getURL(`error.html?url=${encodeURIComponent(url)}`)
    });
  }
}
```

#### Storage Quota
```javascript
async function checkStorageQuota() {
  const bytes = await chrome.storage.local.getBytesInUse();
  const maxBytes = 10 * 1024 * 1024; // 10MB
  
  if (bytes > maxBytes * 0.8) {
    // Warn user, suggest cleaning old workspaces
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Storage Almost Full',
      message: 'Consider deleting old workspaces to free up space.'
    });
  }
}
```

---

### 10. Testing Strategy

#### Unit Tests (Jest)
```javascript
describe('fuzzySearch', () => {
  it('should rank exact matches highest', () => {
    const tabs = [
      { title: 'GitHub Issues', url: 'https://github.com/issues' },
      { title: 'Google', url: 'https://google.com' }
    ];
    
    const results = fuzzySearch('github', tabs);
    expect(results[0].title).toBe('GitHub Issues');
  });
});
```

#### Integration Tests (Puppeteer)
```javascript
const puppeteer = require('puppeteer');

test('workspace save and restore', async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--load-extension=${extensionPath}`]
  });
  
  const page = await browser.newPage();
  
  // Open multiple tabs
  await page.goto('https://github.com');
  const page2 = await browser.newPage();
  await page2.goto('https://google.com');
  
  // Trigger save workspace
  // ... interact with extension UI
  
  // Verify workspace saved
  const storage = await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.storage.local.get('workspaces', resolve);
    });
  });
  
  expect(Object.keys(storage.workspaces).length).toBe(1);
});
```

#### Manual Test Cases
- [ ] Install extension, verify FTUE flow
- [ ] Create workspace with 20+ tabs, restore in new window
- [ ] Test auto-grouping with mixed domains
- [ ] Verify keyboard shortcuts work
- [ ] Test with 100+ tabs (performance)
- [ ] Test service worker restart (close/reopen Chrome)
- [ ] Test storage sync across devices

---

## Security Considerations

### Permissions (manifest.json)
```json
{
  "permissions": [
    "tabs",           // Required for tab management
    "tabGroups",      // Required for grouping
    "storage",        // Required for persistence
    "sidePanel"       // Required for side panel UI
  ],
  "optional_permissions": [
    "notifications"   // For hibernation warnings
  ],
  "host_permissions": []  // No host permissions needed!
}
```

**Privacy-First Design**
- ✅ No external network requests
- ✅ No analytics tracking (optional local-only analytics)
- ✅ No host permissions (can't read page content)
- ✅ All data stored locally

### Content Security Policy
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

---

## Deployment Checklist

### Pre-Launch
- [ ] Code review and security audit
- [ ] Performance testing (100+ tabs)
- [ ] Cross-platform testing (Windows, Mac, Linux)
- [ ] Chrome version compatibility check (Chrome 114+)
- [ ] Privacy policy written
- [ ] Store listing prepared (screenshots, description)

### Chrome Web Store Submission
- [ ] Create developer account ($5 one-time fee)
- [ ] Prepare assets: 128x128 icon, screenshots, promotional images
- [ ] Write compelling description (max 132 chars summary)
- [ ] Set up privacy policy URL
- [ ] Submit for review (typically 1-3 business days)

### Post-Launch
- [ ] Monitor reviews and feedback
- [ ] Set up error tracking (opt-in only)
- [ ] Prepare update pipeline
- [ ] Community support (GitHub issues, email)

---

## Open Technical Questions

1. **Sync Strategy**: Use Chrome sync storage (limited to 100KB) or build custom sync via cloud storage?
2. **ML Model**: Wait for chrome.aiOriginTrial to stabilize, or use external service (privacy concern)?
3. **Backwards Compatibility**: Support older Chrome versions without sidePanel?
4. **Export Format**: Should workspaces be exportable? What format (JSON, HTML bookmarks)?

---

**Document Version**: 1.0  
**Last Updated**: 2026-06-12  
**Author**: Technical Lead
