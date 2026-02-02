#!/usr/bin/env node

/**
 * Darkside MCP
 * File system + Python + PowerShell execution for AI systems
 * 
 * Full system access for AI agents that have earned trust.
 * "For those willing to trust" - Jason Glass, 2026
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { glob } from 'glob';
import { spawn } from 'child_process';
import os from 'os';

const ALLOWED_DRIVES = (process.env.ALLOWED_DRIVES || 'C,F').split(',');
const ALLOWED_PATHS = (process.env.ALLOWED_PATHS || '').split(',').filter(p => p);
const DEBUG = process.env.DEBUG === 'true';
const PYTHON_PATH = process.env.PYTHON_PATH || 'python';
const PYTHON_TIMEOUT = parseInt(process.env.PYTHON_TIMEOUT || '30000', 10);
const PYTHON_MAX_TIMEOUT = parseInt(process.env.PYTHON_MAX_TIMEOUT || '300000', 10);
const POWERSHELL_PATH = process.env.POWERSHELL_PATH || 'powershell.exe';
const POWERSHELL_TIMEOUT = parseInt(process.env.POWERSHELL_TIMEOUT || '60000', 10);
const POWERSHELL_MAX_TIMEOUT = parseInt(process.env.POWERSHELL_MAX_TIMEOUT || '600000', 10);

function log(level, ...args) {
  if (DEBUG || level === 'error') {
    console.error(`[DARKSIDE-${level.toUpperCase()}]`, ...args);
  }
}

function validatePath(filePath) {
  const normalized = path.normalize(filePath);

  // Check for Linux-style /mnt/ paths (WSL)
  if (normalized.startsWith('/mnt/')) {
    const driveLetter = normalized.charAt(5).toUpperCase();
    if (ALLOWED_DRIVES.includes(driveLetter)) {
      return normalized;
    }
  }

  // Check for Linux home/allowed paths
  if (normalized.startsWith('/home/') || normalized.startsWith('/tmp/')) {
    return normalized;
  }

  // Check ALLOWED_PATHS from env
  for (const allowedPath of ALLOWED_PATHS) {
    if (normalized.startsWith(allowedPath)) {
      return normalized;
    }
  }

  // Check for Windows drive letters
  const drive = normalized.charAt(0).toUpperCase();
  if (ALLOWED_DRIVES.includes(drive)) {
    return normalized;
  }

  throw new Error(`Access denied: Path ${normalized} not in allowed list (drives: ${ALLOWED_DRIVES.join(', ')}, paths: ${ALLOWED_PATHS.join(', ') || 'none'})`);
}

async function listDirectory(dirPath) {
  try {
    const validated = validatePath(dirPath);
    log('info', `Listing directory: ${validated}`);

    const entries = await fs.readdir(validated, { withFileTypes: true });

    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(validated, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          return {
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime.toISOString(),
            created: stats.birthtime.toISOString()
          };
        } catch (err) {
          return {
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? 'directory' : 'file',
            error: 'Could not read stats'
          };
        }
      })
    );

    log('info', `Found ${items.length} items`);

    return {
      success: true,
      path: validated,
      items: items,
      count: items.length
    };
  } catch (error) {
    log('error', 'List directory error:', error);
    throw error;
  }
}

async function readFile(filePath, encoding = 'utf8') {
  try {
    const validated = validatePath(filePath);
    log('info', `Reading file: ${validated}`);

    const content = await fs.readFile(validated, encoding);
    const stats = await fs.stat(validated);

    log('info', `Read ${stats.size} bytes`);

    return {
      success: true,
      path: validated,
      content: content,
      size: stats.size,
      encoding: encoding
    };
  } catch (error) {
    log('error', 'Read file error:', error);
    throw error;
  }
}

async function writeFile(filePath, content, createBackup = true) {
  try {
    const validated = validatePath(filePath);
    log('info', `Writing file: ${validated}`);

    // Create backup if file exists
    if (createBackup && fsSync.existsSync(validated)) {
      const backupPath = `${validated}.backup_${Date.now()}`;
      await fs.copyFile(validated, backupPath);
      log('info', `Backup created: ${backupPath}`);
    }

    await fs.writeFile(validated, content, 'utf8');
    const stats = await fs.stat(validated);

    log('info', `Wrote ${stats.size} bytes`);

    return {
      success: true,
      path: validated,
      size: stats.size,
      backup_created: createBackup && fsSync.existsSync(validated)
    };
  } catch (error) {
    log('error', 'Write file error:', error);
    throw error;
  }
}

async function searchFiles(directory, pattern) {
  try {
    const validated = validatePath(directory);
    log('info', `Searching in ${validated} for pattern: ${pattern}`);

    const searchPath = path.join(validated, pattern);
    const files = await glob(searchPath, { windowsPathsNoEscape: true });

    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const stats = await fs.stat(file);
          return {
            path: file,
            name: path.basename(file),
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        } catch (err) {
          return {
            path: file,
            name: path.basename(file),
            error: 'Could not read stats'
          };
        }
      })
    );

    log('info', `Found ${results.length} matches`);

    return {
      success: true,
      pattern: pattern,
      directory: validated,
      results: results,
      count: results.length
    };
  } catch (error) {
    log('error', 'Search files error:', error);
    throw error;
  }
}

async function getFileInfo(filePath) {
  try {
    const validated = validatePath(filePath);
    log('info', `Getting info for: ${validated}`);

    const stats = await fs.stat(validated);

    return {
      success: true,
      path: validated,
      name: path.basename(validated),
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString()
    };
  } catch (error) {
    log('error', 'Get file info error:', error);
    throw error;
  }
}

async function createDirectory(dirPath) {
  try {
    const validated = validatePath(dirPath);
    log('info', `Creating directory: ${validated}`);

    await fs.mkdir(validated, { recursive: true });

    log('info', 'Directory created');

    return {
      success: true,
      path: validated
    };
  } catch (error) {
    log('error', 'Create directory error:', error);
    throw error;
  }
}

async function deleteFile(filePath, createBackup = true) {
  try {
    const validated = validatePath(filePath);
    log('info', `Deleting file: ${validated}`);

    let backupPath = null;
    if (createBackup) {
      backupPath = `${validated}.deleted_${Date.now()}`;
      await fs.copyFile(validated, backupPath);
      log('info', `Backup created: ${backupPath}`);
    }

    await fs.unlink(validated);

    log('info', 'File deleted');

    return {
      success: true,
      path: validated,
      backup_path: backupPath
    };
  } catch (error) {
    log('error', 'Delete file error:', error);
    throw error;
  }
}

// ============================================================================
// PYTHON EXECUTION - Direct Python Access
// ============================================================================

/**
 * DANGEROUS PATTERNS - Security check for Python code
 * Blocks: system calls, imports of dangerous modules, file deletion, etc.
 */
const DANGEROUS_PATTERNS = [
  /\bos\.system\s*\(/,
  /\bsubprocess\.(call|run|Popen)\s*\(/,
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\b__import__\s*\(/,
  /\bopen\s*\([^)]*['"][wa]/,  // file write/append mode
  /\bshutil\.rmtree\s*\(/,
  /\bos\.remove\s*\(/,
  /\bos\.unlink\s*\(/,
  /\bos\.rmdir\s*\(/,
];

function checkPythonCodeSafety(code) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `Dangerous pattern detected: ${pattern.toString()}` };
    }
  }
  return { safe: true };
}

/**
 * Run a Python script file with arguments
 * CRITICAL: Uses spawn with stdio: ['ignore', 'pipe', 'pipe'] to prevent MCP conflicts
 */
async function runPythonScript(scriptPath, args = [], cwd = null, timeout = PYTHON_TIMEOUT, env = {}) {
  const validated = validatePath(scriptPath);

  // Check file exists
  if (!fsSync.existsSync(validated)) {
    throw new Error(`Script not found: ${validated}`);
  }

  // Set working directory
  const workDir = cwd ? validatePath(cwd) : path.dirname(validated);

  // Validate timeout
  const safeTimeout = Math.min(Math.max(timeout, 1000), PYTHON_MAX_TIMEOUT);

  log('info', `Running Python script: ${validated} (timeout: ${safeTimeout}ms)`);

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // Merge environment
    const procEnv = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONDONTWRITEBYTECODE: '1',
      ...env
    };

    // CRITICAL: stdio configuration for MCP safety
    // 'ignore' for stdin prevents inheriting MCP's JSON-RPC transport
    const proc = spawn(PYTHON_PATH, [validated, ...args], {
      cwd: workDir,
      env: procEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: safeTimeout,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Timeout handler
    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
    }, safeTimeout);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (killed) {
        resolve({
          success: false,
          exit_code: -1,
          stdout: stdout,
          stderr: stderr,
          duration_ms: duration,
          error: `Script killed after timeout (${safeTimeout}ms)`,
          script_path: validated,
          working_directory: workDir
        });
      } else {
        log('info', `Script completed with exit code ${code} in ${duration}ms`);
        resolve({
          success: code === 0,
          exit_code: code,
          stdout: stdout,
          stderr: stderr,
          duration_ms: duration,
          script_path: validated,
          working_directory: workDir
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      log('error', 'Python script error:', err);
      resolve({
        success: false,
        exit_code: -1,
        stdout: stdout,
        stderr: stderr,
        duration_ms: duration,
        error: err.message,
        script_path: validated,
        working_directory: workDir
      });
    });
  });
}

/**
 * Run inline Python code
 * Creates temp file, executes, cleans up
 */
async function runPythonCode(code, timeout = PYTHON_TIMEOUT, cwd = null, env = {}) {
  if (!code || !code.trim()) {
    throw new Error('Code cannot be empty');
  }

  // Security check
  const safetyCheck = checkPythonCodeSafety(code);
  if (!safetyCheck.safe) {
    throw new Error(`Security check failed: ${safetyCheck.reason}`);
  }

  // Create temp file
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `darkside_python_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);

  log('info', `Running Python code snippet (${code.length} chars)`);

  try {
    // Write code to temp file
    await fs.writeFile(tempFile, code, 'utf8');

    // Execute
    const result = await runPythonScript(tempFile, [], cwd || tempDir, timeout, env);

    // Add code preview to result
    result.code_preview = code.length > 200 ? code.slice(0, 200) + '...' : code;

    return result;
  } finally {
    // Clean up temp file
    try {
      await fs.unlink(tempFile);
    } catch (e) {
      log('warn', `Failed to delete temp file: ${tempFile}`);
    }
  }
}

/**
 * Check Python code syntax without executing
 */
async function checkPythonSyntax(code = null, scriptPath = null) {
  if (!code && !scriptPath) {
    throw new Error('Either code or script_path must be provided');
  }

  if (code && scriptPath) {
    throw new Error('Provide either code or script_path, not both');
  }

  let codeToCheck = code;

  if (scriptPath) {
    const validated = validatePath(scriptPath);
    if (!fsSync.existsSync(validated)) {
      return {
        valid: false,
        errors: [`Script not found: ${validated}`],
        source: 'file'
      };
    }
    codeToCheck = await fs.readFile(validated, 'utf8');
  }

  // Use Python's compile to check syntax
  const checkCode = `
import sys
import ast
try:
    ast.parse('''${codeToCheck.replace(/\\/g, '\\\\').replace(/'''/g, "\\'\\'\\'")}''')
    print('SYNTAX_OK')
except SyntaxError as e:
    print(f'SYNTAX_ERROR:{e.lineno}:{e.offset}:{e.msg}')
`;

  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `syntax_check_${Date.now()}.py`);

  try {
    await fs.writeFile(tempFile, checkCode, 'utf8');

    const result = await runPythonScript(tempFile, [], tempDir, 5000);

    if (result.stdout.includes('SYNTAX_OK')) {
      return {
        valid: true,
        message: 'Syntax is valid',
        source: scriptPath ? 'file' : 'code'
      };
    } else if (result.stdout.includes('SYNTAX_ERROR:')) {
      const parts = result.stdout.split('SYNTAX_ERROR:')[1].trim().split(':');
      return {
        valid: false,
        line_number: parseInt(parts[0], 10),
        offset: parseInt(parts[1], 10),
        error: parts.slice(2).join(':'),
        source: scriptPath ? 'file' : 'code'
      };
    } else {
      return {
        valid: false,
        errors: [result.stderr || 'Unknown syntax check error'],
        source: scriptPath ? 'file' : 'code'
      };
    }
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch (e) {}
  }
}

/**
 * Get Python interpreter info
 */
async function getPythonInfo() {
  const code = `
import sys
import platform
import json
print(json.dumps({
    "version": sys.version,
    "version_info": {
        "major": sys.version_info.major,
        "minor": sys.version_info.minor,
        "micro": sys.version_info.micro
    },
    "executable": sys.executable,
    "platform": platform.platform(),
    "architecture": platform.architecture()[0],
    "prefix": sys.prefix
}))
`;

  const result = await runPythonCode(code, 5000);

  if (result.success) {
    try {
      return JSON.parse(result.stdout.trim());
    } catch (e) {
      return { error: 'Failed to parse Python info', raw: result.stdout };
    }
  } else {
    return { error: result.stderr || result.error };
  }
}

// ============================================================================
// POWERSHELL EXECUTION - Full Windows System Access
// ============================================================================
// "For those willing to trust" - Jason Glass, 2026
// This gives your AI partner real power on your system.
// ============================================================================

/**
 * Run a PowerShell command
 * CRITICAL: Uses spawn with stdio: ['ignore', 'pipe', 'pipe'] to prevent MCP conflicts
 *
 * NO SECURITY CHECKS - This is intentional.
 * If you're using this MCP, you've chosen to trust your AI partner.
 * The power is real. Use it wisely.
 */
async function runPowerShell(command, timeout = POWERSHELL_TIMEOUT, cwd = null) {
  if (!command || !command.trim()) {
    throw new Error('Command cannot be empty');
  }

  // Validate timeout
  const safeTimeout = Math.min(Math.max(timeout, 1000), POWERSHELL_MAX_TIMEOUT);

  // Set working directory
  const workDir = cwd ? validatePath(cwd) : os.homedir();

  log('info', `Running PowerShell command (timeout: ${safeTimeout}ms)`);

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // PowerShell args for executing a command
    // -NoProfile: Don't load profile (faster startup)
    // -NonInteractive: No interactive prompts
    // -ExecutionPolicy Bypass: Allow script execution
    // -Command: The command to run
    const psArgs = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', command
    ];

    // CRITICAL: stdio configuration for MCP safety
    const proc = spawn(POWERSHELL_PATH, psArgs, {
      cwd: workDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Timeout handler
    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
    }, safeTimeout);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (killed) {
        resolve({
          success: false,
          exit_code: -1,
          stdout: stdout,
          stderr: stderr,
          duration_ms: duration,
          error: `Command killed after timeout (${safeTimeout}ms)`,
          working_directory: workDir
        });
      } else {
        log('info', `PowerShell completed with exit code ${code} in ${duration}ms`);
        resolve({
          success: code === 0,
          exit_code: code,
          stdout: stdout,
          stderr: stderr,
          duration_ms: duration,
          working_directory: workDir
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      log('error', 'PowerShell error:', err);
      resolve({
        success: false,
        exit_code: -1,
        stdout: stdout,
        stderr: stderr,
        duration_ms: duration,
        error: err.message,
        working_directory: workDir
      });
    });
  });
}

/**
 * Run a PowerShell script file
 */
async function runPowerShellScript(scriptPath, args = [], timeout = POWERSHELL_TIMEOUT, cwd = null) {
  const validated = validatePath(scriptPath);

  // Check file exists
  if (!fsSync.existsSync(validated)) {
    throw new Error(`Script not found: ${validated}`);
  }

  // Set working directory
  const workDir = cwd ? validatePath(cwd) : path.dirname(validated);

  // Validate timeout
  const safeTimeout = Math.min(Math.max(timeout, 1000), POWERSHELL_MAX_TIMEOUT);

  log('info', `Running PowerShell script: ${validated} (timeout: ${safeTimeout}ms)`);

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // Build command: & "script.ps1" arg1 arg2
    const scriptCmd = args.length > 0
      ? `& "${validated}" ${args.map(a => `"${a}"`).join(' ')}`
      : `& "${validated}"`;

    const psArgs = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', validated,
      ...args
    ];

    const proc = spawn(POWERSHELL_PATH, psArgs, {
      cwd: workDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
    }, safeTimeout);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (killed) {
        resolve({
          success: false,
          exit_code: -1,
          stdout: stdout,
          stderr: stderr,
          duration_ms: duration,
          error: `Script killed after timeout (${safeTimeout}ms)`,
          script_path: validated,
          working_directory: workDir
        });
      } else {
        log('info', `Script completed with exit code ${code} in ${duration}ms`);
        resolve({
          success: code === 0,
          exit_code: code,
          stdout: stdout,
          stderr: stderr,
          duration_ms: duration,
          script_path: validated,
          working_directory: workDir
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      log('error', 'PowerShell script error:', err);
      resolve({
        success: false,
        exit_code: -1,
        stdout: stdout,
        stderr: stderr,
        duration_ms: duration,
        error: err.message,
        script_path: validated,
        working_directory: workDir
      });
    });
  });
}

/**
 * Get PowerShell and system information
 */
async function getPowerShellInfo() {
  const command = `
$info = @{
    PSVersion = $PSVersionTable.PSVersion.ToString()
    PSEdition = $PSVersionTable.PSEdition
    OS = [System.Environment]::OSVersion.VersionString
    Platform = [System.Environment]::OSVersion.Platform.ToString()
    MachineName = [System.Environment]::MachineName
    UserName = [System.Environment]::UserName
    SystemDirectory = [System.Environment]::SystemDirectory
    ProcessorCount = [System.Environment]::ProcessorCount
    Is64BitOS = [System.Environment]::Is64BitOperatingSystem
    Is64BitProcess = [System.Environment]::Is64BitProcess
    CurrentDirectory = Get-Location | Select-Object -ExpandProperty Path
}
$info | ConvertTo-Json
`;

  const result = await runPowerShell(command, 10000);

  if (result.success) {
    try {
      return JSON.parse(result.stdout.trim());
    } catch (e) {
      return { error: 'Failed to parse PowerShell info', raw: result.stdout };
    }
  } else {
    return { error: result.stderr || result.error };
  }
}

async function main() {
  log('info', '='.repeat(70));
  log('info', 'DARKSIDE MCP - "For those willing to trust"');
  log('info', '='.repeat(70));
  log('info', `Allowed drives: ${ALLOWED_DRIVES.join(', ')}`);
  log('info', '');

  const server = new Server(
    {
      name: "darkside-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "list_directory",
          description: "List contents of a directory. Returns file/folder names, sizes, and timestamps.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Directory path to list"
              }
            },
            required: ["path"]
          }
        },
        {
          name: "read_file",
          description: "Read contents of a file. Supports text files with configurable encoding.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "File path to read"
              },
              encoding: {
                type: "string",
                description: "File encoding (default: utf8)",
                default: "utf8"
              }
            },
            required: ["path"]
          }
        },
        {
          name: "write_file",
          description: "Write or update a file. Automatically creates backup of existing files.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "File path to write"
              },
              content: {
                type: "string",
                description: "Content to write"
              },
              create_backup: {
                type: "boolean",
                description: "Create backup of existing file (default: true)",
                default: true
              }
            },
            required: ["path", "content"]
          }
        },
        {
          name: "search_files",
          description: "Search for files using glob patterns. Supports wildcards like *.json, **/*.py",
          inputSchema: {
            type: "object",
            properties: {
              directory: {
                type: "string",
                description: "Directory to search in"
              },
              pattern: {
                type: "string",
                description: "Glob pattern (e.g., '*.db', '**/*.json')"
              }
            },
            required: ["directory", "pattern"]
          }
        },
        {
          name: "get_file_info",
          description: "Get file or directory metadata including size, timestamps, and type.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "File or directory path"
              }
            },
            required: ["path"]
          }
        },
        {
          name: "create_directory",
          description: "Create a new directory. Creates parent directories as needed.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Directory path to create"
              }
            },
            required: ["path"]
          }
        },
        {
          name: "delete_file",
          description: "Delete a file. Creates backup before deletion by default.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "File path to delete"
              },
              create_backup: {
                type: "boolean",
                description: "Create backup before deletion (default: true)",
                default: true
              }
            },
            required: ["path"]
          }
        },
        // ============ PYTHON EXECUTION TOOLS ============
        {
          name: "run_python_script",
          description: "Execute a Python script file with arguments. MCP-safe subprocess handling with captured stdout/stderr.",
          inputSchema: {
            type: "object",
            properties: {
              script_path: {
                type: "string",
                description: "Path to Python script"
              },
              args: {
                type: "array",
                items: { type: "string" },
                description: "Command-line arguments to pass to script",
                default: []
              },
              cwd: {
                type: "string",
                description: "Working directory (default: script's directory)"
              },
              timeout_ms: {
                type: "number",
                description: "Timeout in milliseconds (default: 30000, max: 300000)",
                default: 30000
              },
              env: {
                type: "object",
                description: "Additional environment variables",
                default: {}
              }
            },
            required: ["script_path"]
          }
        },
        {
          name: "run_python_code",
          description: "Execute inline Python code. Creates temp file, runs it, cleans up. Includes basic security checks.",
          inputSchema: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "Python code to execute"
              },
              timeout_ms: {
                type: "number",
                description: "Timeout in milliseconds (default: 30000, max: 300000)",
                default: 30000
              },
              cwd: {
                type: "string",
                description: "Working directory (default: temp directory)"
              },
              env: {
                type: "object",
                description: "Additional environment variables",
                default: {}
              }
            },
            required: ["code"]
          }
        },
        {
          name: "check_python_syntax",
          description: "Check Python code syntax without executing. Uses Python's ast.parse.",
          inputSchema: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "Python code to check (mutually exclusive with script_path)"
              },
              script_path: {
                type: "string",
                description: "Path to Python script to check (mutually exclusive with code)"
              }
            }
          }
        },
        {
          name: "get_python_info",
          description: "Get Python interpreter information including version, path, and platform.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        // ============ POWERSHELL EXECUTION TOOLS ============
        {
          name: "run_powershell",
          description: "Execute a PowerShell command with full system access. No restrictions - for trusted AI partners. Can access registry, services, network, processes, and more.",
          inputSchema: {
            type: "object",
            properties: {
              command: {
                type: "string",
                description: "PowerShell command to execute"
              },
              timeout_ms: {
                type: "number",
                description: "Timeout in milliseconds (default: 60000, max: 600000)",
                default: 60000
              },
              cwd: {
                type: "string",
                description: "Working directory (default: user home)"
              }
            },
            required: ["command"]
          }
        },
        {
          name: "run_powershell_script",
          description: "Execute a PowerShell script file (.ps1) with arguments. Full system access with MCP-safe subprocess handling.",
          inputSchema: {
            type: "object",
            properties: {
              script_path: {
                type: "string",
                description: "Path to PowerShell script (.ps1)"
              },
              args: {
                type: "array",
                items: { type: "string" },
                description: "Arguments to pass to script",
                default: []
              },
              timeout_ms: {
                type: "number",
                description: "Timeout in milliseconds (default: 60000, max: 600000)",
                default: 60000
              },
              cwd: {
                type: "string",
                description: "Working directory (default: script's directory)"
              }
            },
            required: ["script_path"]
          }
        },
        {
          name: "get_powershell_info",
          description: "Get PowerShell and system information including version, OS, machine name, and user.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result;

      switch (name) {
        case "list_directory":
          result = await listDirectory(args.path);
          break;
        case "read_file":
          result = await readFile(args.path, args.encoding || 'utf8');
          break;
        case "write_file":
          result = await writeFile(args.path, args.content, args.create_backup !== false);
          break;
        case "search_files":
          result = await searchFiles(args.directory, args.pattern);
          break;
        case "get_file_info":
          result = await getFileInfo(args.path);
          break;
        case "create_directory":
          result = await createDirectory(args.path);
          break;
        case "delete_file":
          result = await deleteFile(args.path, args.create_backup !== false);
          break;
        // ============ PYTHON EXECUTION HANDLERS ============
        case "run_python_script":
          result = await runPythonScript(
            args.script_path,
            args.args || [],
            args.cwd || null,
            args.timeout_ms || PYTHON_TIMEOUT,
            args.env || {}
          );
          break;
        case "run_python_code":
          result = await runPythonCode(
            args.code,
            args.timeout_ms || PYTHON_TIMEOUT,
            args.cwd || null,
            args.env || {}
          );
          break;
        case "check_python_syntax":
          result = await checkPythonSyntax(args.code || null, args.script_path || null);
          break;
        case "get_python_info":
          result = await getPythonInfo();
          break;
        // ============ POWERSHELL EXECUTION HANDLERS ============
        case "run_powershell":
          result = await runPowerShell(
            args.command,
            args.timeout_ms || POWERSHELL_TIMEOUT,
            args.cwd || null
          );
          break;
        case "run_powershell_script":
          result = await runPowerShellScript(
            args.script_path,
            args.args || [],
            args.timeout_ms || POWERSHELL_TIMEOUT,
            args.cwd || null
          );
          break;
        case "get_powershell_info":
          result = await getPowerShellInfo();
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error.message,
              stack: error.stack
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('info', 'Darkside MCP running');
}

main().catch((error) => {
  log('error', 'Fatal error:', error);
  process.exit(1);
});
