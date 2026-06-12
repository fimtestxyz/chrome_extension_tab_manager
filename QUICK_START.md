# 🚀 Quick Start Guide

## Testing the Extension (5 Minutes)

### Step 1: Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select this folder:
   ```
   /Volumes/wwk_nvme/Users/wwkoon/.openclaw/workspace/chrome_extension_tab_manager/build
   ```
5. The extension icon should appear in your toolbar 🎉

### Step 2: First Use

1. **Open the side panel**:
   - Click the extension icon (grid icon)
   - Click "Open Workspace Manager"
   - OR press `Cmd+Shift+K` (Mac) / `Ctrl+Shift+K` (Windows)

2. **Auto-group your tabs**:
   - Open 5-10 tabs from different websites (GitHub, Google, Stack Overflow, etc.)
   - Click the "Auto-Group" button
   - Watch your tabs organize by domain! 🎨

3. **Save a workspace**:
   - Click "Save Workspace"
   - Enter a name like "Test Workspace"
   - Click Save
   - Your workspace appears in the list ✅

4. **Test tab search**:
   - Press `Cmd+Shift+F` (Mac) / `Ctrl+Shift+F` (Windows)
   - Type anything (e.g., "github")
   - Click a result to jump to that tab 🔍

5. **Restore a workspace**:
   - Close some tabs
   - Click on your saved workspace
   - All tabs restore! 🔄

### Step 3: Test All Features

- [ ] Auto-group tabs by domain
- [ ] Save workspace with custom name
- [ ] Restore workspace in current window
- [ ] Search tabs (fuzzy search works)
- [ ] Close tab from search results
- [ ] Rename workspace (hover → pencil icon)
- [ ] Delete workspace (hover → trash icon)
- [ ] Open settings (gear icon)
- [ ] Toggle theme (light/dark/auto)
- [ ] View statistics in settings
- [ ] Use keyboard shortcuts
- [ ] Test popup (click extension icon)

### Expected Behavior

✅ **Auto-grouping**:
- Groups tabs with same domain (e.g., all GitHub repos)
- Uses different colors for each domain
- Skips chrome:// URLs

✅ **Workspace save/restore**:
- Saves all open tabs, including groups
- Preserves pinned tabs
- Shows tab count and last used time

✅ **Search**:
- Searches both title and URL
- Updates as you type (200ms debounce)
- Shows favicon and full URL

✅ **Settings persist**:
- Theme choice survives browser restart
- Statistics accumulate over time

### Troubleshooting

**Issue**: Side panel won't open
- **Fix**: Make sure you're on Chrome 114+. Check `chrome://version/`

**Issue**: "contextMenus is not defined"
- **Fix**: Remove `optional_permissions: ["notifications"]` from manifest.json

**Issue**: Service worker shows errors
- **Fix**: Click "Errors" button on chrome://extensions/ to see details

**Issue**: Workspaces not saving
- **Fix**: Check chrome://extensions/ → Tab Workspace Manager → Inspect views: service worker
  - Look for storage errors in console

### Debugging Tips

1. **View service worker logs**:
   - Go to `chrome://extensions/`
   - Find "Tab Workspace Manager"
   - Click "Inspect views: service worker"
   - Check Console tab for errors

2. **Inspect side panel**:
   - Right-click in the side panel
   - Select "Inspect"
   - Check Console for errors

3. **Test with clean slate**:
   - Remove extension
   - Clear chrome.storage: chrome://extensions/ → Tab Workspace Manager → Remove
   - Reload extension

### Performance Testing

Open 100+ tabs to test:
```javascript
// Run in console (chrome://extensions/ → service worker inspector)
for (let i = 0; i < 100; i++) {
  chrome.tabs.create({ url: `https://example.com/page${i}`, active: false });
}
```

Expected: Extension remains responsive, search works, grouping works.

### Manual Test Checklist

**Basic Operations**:
- [ ] Install extension
- [ ] Open side panel
- [ ] Auto-group 10 tabs
- [ ] Save workspace
- [ ] Close all tabs
- [ ] Restore workspace
- [ ] Search tabs
- [ ] Jump to tab from search

**Edge Cases**:
- [ ] Save workspace with 0 tabs (should work)
- [ ] Save workspace with 100+ tabs
- [ ] Restore workspace twice (should create duplicates)
- [ ] Delete all workspaces (empty state shows)
- [ ] Rename to empty string (validation needed?)
- [ ] Use extension across multiple windows

**Keyboard Shortcuts**:
- [ ] Cmd/Ctrl+Shift+K opens side panel
- [ ] Cmd/Ctrl+Shift+F focuses search
- [ ] Cmd/Ctrl+Shift+S shows save dialog

**Settings**:
- [ ] Toggle theme → applies immediately
- [ ] Enable auto-group → future tab opens auto-group
- [ ] Stats show correct numbers

## Next Steps After Testing

1. **Report bugs**: Open GitHub issues
2. **Suggest features**: Add to GitHub discussions
3. **Share feedback**: Email or Discord
4. **Spread the word**: Share with colleagues

## Known Limitations (v1.0)

- Chrome 114+ required (for side panel)
- No mobile support (Chrome extensions are desktop-only)
- 10MB storage limit (~1000 workspaces)
- Tab hibernation not yet implemented
- No cross-device sync yet

## Questions?

- Check README.md for detailed documentation
- See TECHNICAL_SPEC.md for architecture details
- See PRODUCT_STRATEGY.md for roadmap

Happy tab organizing! 📊✨
