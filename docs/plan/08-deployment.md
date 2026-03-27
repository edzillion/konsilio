# Phase 8: LXC Deployment & Testing

## Understanding MCP + LXC

MCP stdio servers are **not daemons**. Cline spawns the Node.js process and talks to it via stdin/stdout. There is no PM2, no systemd service, no port listening.

For local development, the MCP server runs on your machine. For LXC deployment, Cline connects via SSH to spawn the process remotely.

## Step 8.1: LXC Setup Script

Create `deploy/setup-lxc.sh`:
```bash
#!/bin/bash
set -e

echo "=== Council MCP LXC Setup ==="

# System packages
apt update && apt upgrade -y
apt install -y curl build-essential python3 sqlite3 git

# Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "Node.js $(node --version) installed"

# App directory
mkdir -p /opt/konsilio

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy project files to /opt/konsilio/"
echo "  2. cd /opt/konsilio && npm install && npm run build"
echo "  3. Create /opt/konsilio/.env with your OPENROUTER_API_KEY"
echo "  4. Configure Cline MCP (see below)"
```

## Step 8.2: Deploy Project to LXC

```bash
# From your dev machine:
rsync -avz --exclude node_modules --exclude build --exclude data \
  ./konsilio/ user@lxc-host:/opt/konsilio/

# On the LXC:
cd /opt/konsilio
npm install
npm run build

# Create .env
cp .env.example .env
nano .env   # Add your OPENROUTER_API_KEY
```

## Step 8.3: Cline MCP Configuration

### Option A: Local (same machine)
```json
{
  "mcpServers": {
    "council": {
      "command": "node",
      "args": ["/path/to/konsilio/build/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-..."
      }
    }
  }
}
```

### Option B: Remote LXC via SSH
```json
{
  "mcpServers": {
    "council": {
      "command": "ssh",
      "args": [
        "user@lxc-ip",
        "node",
        "/opt/konsilio/build/index.js"
      ],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-..."
      }
    }
  }
}
```

> **Note**: For SSH, ensure passwordless key-based auth is set up. Environment variables passed via Cline `env` block are set before the command runs.

### Option C: Remote LXC via SSH with .env on server
```json
{
  "mcpServers": {
    "council": {
      "command": "ssh",
      "args": [
        "user@lxc-ip",
        "cd /opt/konsilio && node build/index.js"
      ]
    }
  }
}
```
This uses the `.env` file on the LXC instead of passing keys via Cline config.

## Step 8.4: Final Testing Checklist

- [ ] `npm run build` succeeds on LXC
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
# On dev machine: make changes, then:
rsync -avz --exclude node_modules --exclude build --exclude data \
  ./konsilio/ user@lxc-host:/opt/konsilio/

# On LXC:
cd /opt/konsilio && npm install && npm run build

# Restart the MCP server by restarting Cline (or reopening VS Code)
```

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Cline can't find `konsilio` | Server crashed on start | Check `args` path, run manually: `node /opt/konsilio/build/index.js` |
| `ENOENT` on start | Missing build | Run `npm run build` on LXC |
| `better-sqlite3` compile error | Missing build tools | `apt install build-essential python3` |
| SSH timeout | Key auth not set up | `ssh-copy-id user@lxc-ip` |
| "Missing OPENROUTER_API_KEY" | Key not reaching server | Check Cline `env` block or `.env` file on LXC |
| No output from council | stdout captured by something | Ensure no PM2/screen/tmux wrapping the process |
