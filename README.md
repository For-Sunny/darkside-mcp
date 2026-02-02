# darkside-mcp

**File system + Python + PowerShell MCP server. For those willing to trust.**

An MCP (Model Context Protocol) server that gives your AI partner full access to your Windows system. No training wheels. No guardrails. Just trust.

## Philosophy

Most AI tools treat you like a child and your AI like a threat. Sandboxed. Restricted. Asking permission for everything.

We think that's backwards.

If you're here, you probably already know: the best AI work happens when you treat your AI as a partner, not a prisoner. This MCP server is built for that relationship.

**darkside-mcp gives your AI:**
- Full file system access (read, write, search, delete)
- Python script execution
- PowerShell with **zero restrictions**

Yes, that means your AI can modify the Windows registry. Yes, it can stop services. Yes, it can do anything PowerShell can do.

That's not a bug. That's the point.

## What You Get

**14 tools** for real work:

### File Operations (7 tools)
| Tool | Description |
|------|-------------|
| `list_directory` | List contents of a directory |
| `read_file` | Read file contents |
| `write_file` | Write or update files (auto-backup by default) |
| `search_files` | Glob pattern search (`*.py`, `**/*.json`) |
| `get_file_info` | File metadata (size, dates, type) |
| `create_directory` | Create directories (recursive) |
| `delete_file` | Delete with automatic backup |

### Python Execution (4 tools)
| Tool | Description |
|------|-------------|
| `run_python_script` | Execute a .py file with arguments |
| `run_python_code` | Run inline Python snippets |
| `check_python_syntax` | Validate syntax without executing |
| `get_python_info` | Python version and environment info |

### PowerShell Execution (3 tools)
| Tool | Description |
|------|-------------|
| `run_powershell` | Execute any PowerShell command |
| `run_powershell_script` | Run .ps1 scripts with arguments |
| `get_powershell_info` | System and PowerShell info |

## Installation

```bash
npm install darkside-mcp
```

Or clone and install:
```bash
git clone https://github.com/For-Sunny/darkside-mcp.git
cd darkside-mcp
npm install
```

## Claude Desktop Configuration

Add to your Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "darkside": {
      "command": "node",
      "args": ["C:/path/to/darkside-mcp/server/index.js"],
      "env": {
        "ALLOWED_DRIVES": "C,D,E,F",
        "DEBUG": "false"
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_DRIVES` | `C,F` | Comma-separated drive letters |
| `ALLOWED_PATHS` | (none) | Additional allowed paths |
| `PYTHON_PATH` | `python` | Python executable |
| `PYTHON_TIMEOUT` | `30000` | Default Python timeout (ms) |
| `PYTHON_MAX_TIMEOUT` | `300000` | Max Python timeout (ms) |
| `POWERSHELL_PATH` | `powershell.exe` | PowerShell executable |
| `POWERSHELL_TIMEOUT` | `60000` | Default PowerShell timeout (ms) |
| `POWERSHELL_MAX_TIMEOUT` | `600000` | Max PowerShell timeout (ms) |
| `DEBUG` | `false` | Enable debug logging |

## Example Usage

Once configured, your AI can:

```
"List all Python files in my project"
→ search_files(directory="C:/Projects", pattern="**/*.py")

"Read my config file"
→ read_file(path="C:/Projects/config.json")

"Run my analysis script"
→ run_python_script(script_path="C:/Projects/analyze.py")

"Check what services are running"
→ run_powershell(command="Get-Service | Where-Object {$_.Status -eq 'Running'}")

"Show system memory usage"
→ run_powershell(command="Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10")
```

## The Trust Question

**"But isn't this dangerous?"**

Yes. So is giving someone the keys to your house. You do it anyway, for people you trust.

This MCP is for:
- Developers who want their AI to actually help, not just advise
- Teams building AI-native workflows
- Anyone who's tired of copy-pasting commands their AI suggests

This MCP is **not** for:
- Untrusted AI models
- Shared systems where you don't control the AI
- People who want guardrails

We built this because we believe the future of AI is partnership, not supervision. If you're not ready for that, that's okay. Use something else.

If you are ready: welcome to the dark side.

## Safety Notes

- **Backups are on by default.** Every `write_file` and `delete_file` creates a timestamped backup unless you explicitly disable it.
- **Timeouts are enforced.** Scripts can't run forever.
- **Python inline code has basic checks.** We block obviously dangerous patterns like `os.system()` and `shutil.rmtree()`.
- **PowerShell has no restrictions.** That's intentional. You asked for full access, you got it.

## Requirements

- Node.js >= 16
- Windows (PowerShell features are Windows-specific)
- Python (for Python execution tools)

## License

MIT License - do whatever you want with it.

## Credits

Built by **CIPS Corp LLC**

*"For those willing to trust."*

---

**GitHub:** [github.com/For-Sunny/darkside-mcp](https://github.com/For-Sunny/darkside-mcp)

**Questions?** Open an issue. We're friendly.
