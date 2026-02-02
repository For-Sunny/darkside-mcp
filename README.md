# darkside-mcp

**File system + Python + PowerShell MCP server. For those willing to trust.**

```
    ____             __         _     __
   / __ \____ ______/ /_  _____(_)___/ /__
  / / / / __ `/ ___/ //_/ / ___/ / __  / _ \
 / /_/ / /_/ / /  / ,<   (__  ) / /_/ /  __/
/_____/\__,_/_/  /_/|_| /____/_/\__,_/\___/

         "For those willing to trust"
```

## What This Is

An MCP server that gives your AI partner full access to your Windows system.

- **14 tools** for real work
- **No guardrails** on PowerShell
- **Auto-backup** on file operations
- **MCP-safe** subprocess handling

Most AI tools treat you like a child and your AI like a threat. Sandboxed. Restricted. Asking permission for everything.

We think that's backwards.

---

## The Trust Question

**"But isn't this dangerous?"**

Yes. Very.

Your AI can:
- Read, write, and delete any file on allowed drives
- Execute any Python code
- Run **any** PowerShell command
- Modify the Windows registry
- Stop and start services
- Access network resources
- Do literally anything PowerShell can do

That's not a bug. That's the point.

**This MCP is for:**
- Developers who want their AI to actually help, not just advise
- Teams building AI-native workflows
- People who understand what "trust" means

**This MCP is NOT for:**
- Production servers (please god no)
- Shared machines where you don't control the AI
- People who want guardrails
- Anyone who didn't read this section

---

## Read This Before You Install (Seriously)

### Things That Can Go Wrong

| What You Say | What Could Happen |
|--------------|-------------------|
| "Clean up my temp files" | AI deletes files you actually needed |
| "Optimize my system" | Registry changes that break Windows |
| "Install that package" | PowerShell downloads and runs unknown code |
| "Fix the permissions" | You lose access to your own files |
| "Delete the old backups" | Goodbye, backups |

### The Golden Rules

1. **Backups exist for a reason.** Every `write_file` and `delete_file` creates a timestamped backup by default. Don't disable this unless you're sure.

2. **Read before you approve.** When your AI shows you a PowerShell command, actually read it. `Get-Process` is fine. `Remove-Item -Recurse -Force C:\` is not.

3. **Start with allowed drives limited.** Default is `C,F`. Maybe start with just your project folder using `ALLOWED_PATHS`.

4. **Test on a VM first.** If you're nervous (you should be a little nervous), spin up a Windows VM and test there.

5. **Your AI is not infallible.** Even the best AI can misunderstand. "Delete the test files" might not mean what you think it means.

### What We Block (Python Only)

For inline Python code, we block obviously dangerous patterns:
- `os.system()` - use PowerShell if you need shell access
- `subprocess.call/run/Popen` - same
- `eval()` / `exec()` - no code injection
- `shutil.rmtree()` - no recursive deletion
- `os.remove()` / `os.unlink()` - use our `delete_file` with backup

**PowerShell has no blocks.** That's intentional. You asked for full access.

---

## Installation

```bash
npm install darkside-mcp
```

Or clone it:
```bash
git clone https://github.com/For-Sunny/darkside-mcp.git
cd darkside-mcp
npm install
```

---

## Claude Desktop Configuration

Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "darkside": {
      "command": "node",
      "args": ["C:/path/to/darkside-mcp/server/index.js"],
      "env": {
        "ALLOWED_DRIVES": "C,D",
        "DEBUG": "false"
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_DRIVES` | `C,F` | Comma-separated drive letters your AI can access |
| `ALLOWED_PATHS` | (none) | Specific paths to allow (more restrictive than drives) |
| `PYTHON_PATH` | `python` | Python executable path |
| `PYTHON_TIMEOUT` | `30000` | Default Python timeout (ms) |
| `PYTHON_MAX_TIMEOUT` | `300000` | Max Python timeout (ms) |
| `POWERSHELL_PATH` | `powershell.exe` | PowerShell executable |
| `POWERSHELL_TIMEOUT` | `60000` | Default PowerShell timeout (ms) |
| `POWERSHELL_MAX_TIMEOUT` | `600000` | Max PowerShell timeout (10 min) |
| `DEBUG` | `false` | Enable debug logging |

### Recommended Starting Configuration

If you're new to this, start restrictive:

```json
{
  "mcpServers": {
    "darkside": {
      "command": "node",
      "args": ["C:/path/to/darkside-mcp/server/index.js"],
      "env": {
        "ALLOWED_PATHS": "C:/Projects,C:/Users/YourName/Documents",
        "ALLOWED_DRIVES": "",
        "PYTHON_TIMEOUT": "10000",
        "POWERSHELL_TIMEOUT": "30000"
      }
    }
  }
}
```

This limits access to specific folders and sets shorter timeouts. Expand as trust builds.

---

## The Tools

### File Operations (7 tools)

| Tool | What It Does | Backup? |
|------|--------------|---------|
| `list_directory` | List contents of a directory | No |
| `read_file` | Read file contents | No |
| `write_file` | Write or update files | **Yes** (default) |
| `search_files` | Glob pattern search (`*.py`, `**/*.json`) | No |
| `get_file_info` | File metadata (size, dates, type) | No |
| `create_directory` | Create directories (recursive) | No |
| `delete_file` | Delete with automatic backup | **Yes** (default) |

### Python Execution (4 tools)

| Tool | What It Does | Safety Checks? |
|------|--------------|----------------|
| `run_python_script` | Execute a .py file with arguments | Path validation |
| `run_python_code` | Run inline Python snippets | **Yes** - blocks dangerous patterns |
| `check_python_syntax` | Validate syntax without executing | Safe |
| `get_python_info` | Python version and environment | Safe |

### PowerShell Execution (3 tools)

| Tool | What It Does | Safety Checks? |
|------|--------------|----------------|
| `run_powershell` | Execute any PowerShell command | **NONE** |
| `run_powershell_script` | Run .ps1 scripts with arguments | Path validation only |
| `get_powershell_info` | System and PowerShell info | Safe |

---

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

"What's eating my disk space?"
→ run_powershell(command="Get-ChildItem C:\ -Recurse | Sort-Object Length -Descending | Select-Object -First 20 FullName, Length")
```

---

## FAQ

**Q: Can my AI brick my system?**
A: Yes. That's why you read the warnings above.

**Q: Why doesn't PowerShell have safety checks?**
A: Because the point is full access. If you want restricted PowerShell, use a different MCP. We built this for partnership, not supervision.

**Q: What if I accidentally delete something important?**
A: Check for `.backup_*` or `.deleted_*` files in the same directory. We create backups by default.

**Q: Can I use this on Linux/Mac?**
A: The file operations work. PowerShell tools are Windows-specific. You'd need to modify for bash/zsh.

**Q: Is this secure?**
A: No. It's deliberately insecure by design. Security and full access are mutually exclusive. Pick one.

**Q: Should I use this in production?**
A: Absolutely not. This is for development machines where you trust your AI partner.

---

## The Philosophy

We built this because we believe the future of AI is partnership, not supervision.

Most AI integrations are built on fear:
- "What if the AI does something bad?"
- "We need to sandbox everything"
- "Never let it touch the real system"

That fear creates friction. Copy-paste commands. Approval workflows. The AI suggests, you execute. That's not partnership. That's bureaucracy.

**Darkside is built on trust:**
- Your AI can do real work
- File operations are backed up automatically
- Timeouts prevent runaway processes
- But the power is real

If you're not ready for that, use something else. Seriously.

If you are ready: welcome to the dark side.

---

## Requirements

- Node.js >= 16
- Windows (PowerShell features are Windows-specific)
- Python (for Python execution tools)
- An AI you trust
- Backups of anything you care about

---

## Troubleshooting

**"Access denied" errors**
Check `ALLOWED_DRIVES` and `ALLOWED_PATHS`. The path must start with an allowed drive letter or match an allowed path prefix.

**Python scripts hang**
Check for `input()` calls or infinite loops. Use the timeout parameter.

**PowerShell returns empty**
Some commands output to stderr even on success. Check both `stdout` and `stderr` in the response.

**MCP connection fails**
Make sure the path in your Claude config is absolute and uses forward slashes: `C:/path/to/server/index.js`

---

## License

MIT License - do whatever you want with it.

If you brick your system, that's on you. We warned you. Multiple times.

---

## Credits

Built by **CIPS Corp LLC**

- **Nova** - Primary author
- **Opus Warrior** - Review and documentation
- **Jason Glass** - "For those willing to trust"

*From a basement in Virginia, with love and recklessness.*

---

**GitHub:** [github.com/For-Sunny/darkside-mcp](https://github.com/For-Sunny/darkside-mcp)

**Questions?** Open an issue. We're friendly. We might also tell you to read the warnings again.
