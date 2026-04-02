# Phase 8: Local Deployment & Testing

## Understanding MCP Server Deployment

MCP servers are designed to run **locally** on the same machine as the client (Cline, Cursor, Claude Desktop, etc.). They communicate via stdin/stdout - no HTTP server, no ports, no authentication layer.

```
┌─────────────────┐      stdin/stdout      ┌─────────────────┐
│  MCP Client     │ ◄──────────────────► │  MCP Server     │
│  (Cline/Cursor) │      (same process)   │  (Node.js)      │
└─────────────────┘                       └─────────────────┘
```

**This is the natural pattern for MCP** - the client spawns the server process, talks to it, and kills it when done.

## Why Local Deployment?

| Factor | Local | Remote |
|--------|-------|--------|
| Setup complexity | ✅ Simple | ❌ SSH, LXC, networking |
| Latency | ✅ None | ⚠️ SSH overhead |
| API key management | ✅ Your own | ⚠️ Shared or complex |
| History | ✅ Per-user | ⚠️ Shared (confusing) |
| Computation | ✅ I/O bound anyway | ⚠️ Unnecessary |

konsilio is **I/O bound** (waiting on OpenRouter API). There's no heavy computation to offload. Local deployment is the natural fit.

## Prerequisites

**All dependencies are handled through npm** - no system packages needed:

- **Node.js 20.x** - The only system requirement
- **better-sqlite3** - Prebuilt binaries included for all major platforms (no compilation needed)
- **All other deps** - Pure JavaScript, installed via `npm install`

### Installing Node.js

**Windows**: Download from [nodejs.org](https://nodejs.org/) or use `winget install OpenJS.NodeJS.LTS`

**macOS**: `brew install node@20` or download from [nodejs.org](https://nodejs.org/)

**Linux (Debian/Ubuntu)**:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

**Linux (Arch)**: `sudo pacman -S nodejs npm`

**Linux (Fedora)**: `sudo dnf install nodejs`

## Step 8.1: Clone and Build

```bash
# Clone the repository
git clone https://github.com/yourusername/konsilio.git
cd konsilio

# Install dependencies (includes better-sqlite3 prebuilt)
npm install

# Build TypeScript
npm run build

# Verify build
ls build/index.js
```

> **Note**: `better-sqlite3` includes prebuilt binaries for Windows, macOS, and Linux (x64 and ARM64). No compilation tools needed for standard platforms.

## Step 8.2: Configure API Key

```bash
# Copy example config
cp .env.example .env

# Edit with your OpenRouter API key
nano .env  # Or use your preferred editor
```

The `.env` file should contain:
```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

**Get your API key**: Sign up at [openrouter.ai](https://openrouter.ai/) and create a key.

## Step 8.3: Configure Cline MCP

Add to your Cline MCP configuration (in VS Code settings or `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "konsilio": {
      "command": "node",
      "args": ["/path/to/konsilio/build/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-..."
      }
    }
  }
}
```

**Alternative**: Use the `.env` file instead of passing the key in config:

```json
{
  "mcpServers": {
    "konsilio": {
      "command": "node",
      "args": ["/path/to/konsilio/build/index.js"]
    }
  }
}
```

The server will read `OPENROUTER_API_KEY` from the `.env` file in the project directory.

## Step 8.4: Verify Installation

1. **Restart Cline** (or reload VS Code window)
2. **Check tools appear**: Cline should show `konsilio` with 3 tools:
   - `consult_council`
   - `list_personas`
   - `ping`
3. **Test ping**: Call `ping` → "🏓 Council MCP is running!"
4. **Test council**: Call `consult_council` with a simple plan

## Step 8.5: Final Testing Checklist

- [ ] `npm run build` succeeds
- [ ] Cline sees `konsilio` tools after restart
- [ ] `ping` returns success
- [ ] `consult_council` with a simple plan returns structured blueprint
- [ ] `consult_council` with `debate_mode: true` works (slower)
- [ ] `get_session_history` returns previous sessions (if Phase 7 done)
- [ ] Empty `draft_plan` returns clear error
- [ ] Wrong API key returns "Unauthorized" error
- [ ] `list_personas` shows 5 personas
- [ ] SQLite database file exists at configured path (if Phase 7 done)

## Updating

```bash
cd konsilio
git pull
npm install      # In case dependencies changed
npm run build

# Restart Cline to pick up changes
```

## Sharing with Others

To share konsilio with a friend:

1. **Share the repository**: They clone the same repo
2. **They get their own API key**: Each person uses their own OpenRouter account
3. **They configure locally**: Same steps as above

```bash
# Friend's setup
git clone https://github.com/yourusername/konsilio.git
cd konsilio
npm install
npm run build
cp .env.example .env
# Edit .env with THEIR OpenRouter API key
```

**Benefits of this approach**:
- Each person pays for their own API usage
- Each person has their own session history
- No shared credentials or security concerns
- Simple, self-contained setup

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Cline can't find `konsilio` | Wrong path in config | Use absolute path: `/home/user/konsilio/build/index.js` |
| `ENOENT` on start | Missing build | Run `npm run build` |
| `better-sqlite3` compile error | Exotic platform, no prebuilt | Install Node.js 20.x (has prebuilts) or `npm install --build-from-source` |
| "Missing OPENROUTER_API_KEY" | Key not configured | Add to `.env` or Cline `env` block |
| No output from council | stdout captured | Ensure no wrapper script (PM2, screen, etc.) |
| Permission denied on data/ | Write permissions | `chmod 755 data/` or check ownership |
| Prebuilt download fails | Network/proxy issues | Check internet, or use `--build-from-source` |

## Platform-Specific Notes

### Windows
- Use forward slashes or escaped backslashes in path: `C:/Users/you/konsilio/build/index.js`
- PowerShell or CMD both work

### macOS
- If using Homebrew Node.js, ensure it's in PATH
- Apple Silicon (M1/M2): prebuilt ARM64 binaries available

### Linux
- Most distributions have prebuilt binaries
- musl-based (Alpine): use `node:alpine` Docker image or compile from source

## Optional: Running from Source Directory

For development, you can run directly from the source:

```json
{
  "mcpServers": {
    "konsilio": {
      "command": "node",
      "args": ["--experimental-strip-types", "src/index.ts"],
      "cwd": "/path/to/konsilio"
    }
  }
}
```

This requires Node.js 22+ with experimental TypeScript support. For production, use the compiled `build/index.js`.