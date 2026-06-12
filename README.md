# Tab Workspace Manager 📊

A Chrome extension (Manifest V3) that helps you organize, group, and manage browser tabs into workspaces. Switch context instantly and boost productivity.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Chrome](https://img.shields.io/badge/Chrome-114%2B-yellow)

## ✨ Features

### MVP Features (Current)
- 🗂️ **Auto-Group Tabs** - Automatically group tabs by domain (e.g., all GitHub repos together)
- 💾 **Save & Restore Workspaces** - Save your current tab state and restore it later
- 🔍 **Tab Search** - Fuzzy search across all open tabs to jump instantly
- 🎨 **Side Panel UI** - Persistent sidebar for workspace management
- 📊 **Quick Statistics** - See tab count, groups, and workspaces at a glance
- ⌨️ **Keyboard Shortcuts** - Quick actions without mouse
- 🌙 **Dark/Light Theme** - Auto or manual theme switching

### Planned Features
- 🧠 **Smart Auto-Grouping** - ML-based grouping based on content
- 🐌 **Tab Hibernation** - Suspend inactive tabs to save memory
- 🔄 **Cross-Device Sync** - Access workspaces across devices
- 📈 **Productivity Insights** - Analytics on your browsing habits
- 🔗 **Export/Import** - Share workspaces with others
- 📅 **Scheduled Switching** - Auto-switch workspaces by time

## 🚀 Quick Start

### Installation

#### Option 1: From Chrome Web Store (Coming Soon)

1. Visit Chrome Web Store
2. Click "Add to Chrome"
3. Grant permissions
4. Get started!

#### Option 2: Load Unpacked (Development)

1. Download or clone this repository:
   ```bash
   git clone https://github.com/yourusername/tab-workspace-manager.git
   cd tab-workspace-manager
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer Mode** (top right toggle)

4. Click **Load unpacked** and select the `build` folder

5. The extension is now installed!

### Building from Source

```bash
# Install Python dependencies (for icon generation)
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install Pillow

# Generate icons and build extension
./build.sh

# Output:
# - build/ (unpacked extension for loading)
# - tab-workspace-manager.zip (for Chrome Web Store)
```

## 📖 Usage Guide

### First-Time User Experience

1. **Welcome Screen** - When you first install, open the side panel to see a welcome message
2. **Auto-Group** - Click "Auto-Group" to organize your existing tabs by domain
3. **Save Workspace** - Click "Save Workspace" to save your current tabs
4. **Access Anytime** - Click the extension icon or use keyboard shortcuts

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + K` | Open workspace sidebar |
| `Cmd/Ctrl + Shift + F` | Search tabs |
| `Cmd/Ctrl + Shift + S` | Save current tabs as workspace |

> 💡 Change shortcuts at `chrome://extensions/shortcuts`

### Managing Workspaces

**Create a Workspace:**
- Click "Save Workspace" in the side panel
- Enter a name (e.g., "Morning Routine", "Dev Environment")
- Click "Save"

**Restore a Workspace:**
- Click on any workspace card in the side panel
- All tabs will be opened in your current window

**Rename/Delete:**
- Hover over a workspace card
- Click the ✏️ icon to rename
- Click the 🗑️ icon to delete

### Tab Search

1. Click in the search bar (or press `Cmd/Ctrl + Shift + F`)
2. Type to search across tab titles and URLs
3. Press Enter or click to switch to a tab
4. Press × to close a tab directly from search results

### Auto-Grouping

- **Manual**: Click "Auto-Group" button to group tabs by domain
- **Automatic**: Enable in settings to auto-group when you open tabs

## 🏗️ Architecture

### Project Structure

```
tab-workspace-manager/
├── manifest.json              # Manifest V3 config
├── background/
│   └── service-worker.js     # Background logic (event-driven)
├── sidepanel/
│   ├── sidepanel.html        # Main UI
│   ├── sidepanel.css         # Styling
│   └── sidepanel.js          # UI logic
├── popup/
│   ├── popup.html            # Quick actions popup
│   └── popup.js
├── lib/
│   ├── storage.js            # Chrome storage abstraction
│   ├── workspace-manager.js  # Workspace CRUD
│   └── tabs-manager.js       # Tab operations & grouping
├── assets/
│   └── icons/                # Extension icons (16, 32, 48, 128)
├── generate_icons.py         # Icon generation script
├── build.sh                  # Build script
├── PRODUCT_STRATEGY.md       # Product roadmap
└── TECHNICAL_SPEC.md         # Architecture doc
```

### Key Technologies

- **Manifest V3** - Latest extension framework
- **Chrome Side Panel API** - Modern persistent UI (Chrome 114+)
- **Chrome Storage API** - Local data persistence
- **Chrome Tab Groups API** - Native tab grouping
- **Vanilla JavaScript** - No frameworks, minimal overhead

### Data Model

```javascript
// Workspace
{
  id: "ws-uuid",
  name: "Morning Routine",
  createdAt: timestamp,
  lastUsed: timestamp,
  tabs: [{ url, title, pinned, groupId, ... }],
  groups: [{ id, title, color, collapsed }]
}

// Settings
{
  autoGroup: true,
  theme: "light",
  hibernateEnabled: false,
  hibernateAfter: 30
}
```

## 🔧 Configuration

### Settings

Access settings via the ⚙️ icon in the sidebar:

- **Auto-group tabs by domain** - Automatically organize tabs
- **Hibernate inactive tabs** - Save memory by unloading old tabs
- **Theme** - Light, Dark, or Auto (matches system)

### Permissions

The extension only requests minimal permissions:
- `tabs` - Read/create/manage tabs
- `tabGroups` - Create/manage tab groups
- `storage` - Save workspaces and settings
- `sidePanel` - Show the sidebar UI
- `alarms` - Schedule hibernation checks

**No host permissions** - Cannot read webpage content or make external requests.

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/AmazingFeature`
3. Make your changes
4. Build and test locally
5. Commit your changes: `git commit -m 'Add AmazingFeature'`
6. Push to branch: `git push origin feature/AmazingFeature`
7. Open a Pull Request

### Development Workflow

```bash
# Clone the repo
git clone <your-fork>
cd tab-workspace-manager

# Build for development
./build.sh

# Load in Chrome:
# chrome://extensions/ → Load unpacked → select build/

# Make changes to source files
# Edit files in sidepanel/, lib/, background/, etc.

# Rebuild
./build.sh

# Reload in Chrome (click 🔄 on extension card)
```

## 📝 Roadmap

See [PRODUCT_STRATEGY.md](./PRODUCT_STRATEGY.md) for the complete roadmap.

### Near Term (Next Month)
- [ ] Tab hibernation
- [ ] Cross-device sync
- [ ] Workspace templates
- [ ] Duplicate tab detection

### Medium Term (Next Quarter)
- [ ] Smart auto-grouping (ML)
- [ ] Productivity insights dashboard
- [ ] Workspace export/import
- [ ] Community template sharing

### Long Term
- [ ] AI-powered organization
- [ ] Collaboration features
- [ ] Cloud storage options
- [ ] Mobile companion app

## 🐛 Troubleshooting

### Extension not showing?

- Verify you're using Chrome 114 or higher
- Make sure Developer Mode is enabled
- Check the extension panel for errors

### Side panel not opening?

- Make sure side panel is enabled in Chrome flags (`chrome://flags/#enable-side-panel`)
- Restart Chrome after loading extension

### Workspaces not saving?

- Check Chrome storage quota (extension can store up to 10MB)
- Try loading the unpacked extension again

### Keyboard shortcuts not working?

- Verify shortcuts are set correctly at `chrome://extensions/shortcuts`
- Some shortcuts may conflict with other extensions

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Chrome Extension Documentation
- Design inspiration from productivity tools like Toby, OneTab, Workona

## 📚 Resources

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel/)

## 📧 Support

- Open an issue on GitHub
- Email: support@example.com
- Twitter: [@tabworkspacemanager](https://twitter.com/tabworkspacemanager)

---

Made with ❤️ by the Tab Workspace Manager team