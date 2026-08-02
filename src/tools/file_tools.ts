import fs from "fs";
import path from "path";
import { FileLockManager } from "../executor/file_lock_manager.ts";
import { appendAgentLog } from "./terminal_tools.ts";
import { ExecutionEvent } from "../executor/dag_types.ts";

/**
 * Resolves a file path strictly within the specified working directory (cwd).
 * Prevents worker/manager agents from accidentally escaping their sandbox directory or editing system source files.
 */
export function resolvePath(filePath: string, cwd?: string): string {
  const baseDir = cwd ? path.resolve(cwd) : process.cwd();
  if (path.isAbsolute(filePath)) {
    const absPath = path.resolve(filePath);
    if (cwd && !absPath.startsWith(baseDir)) {
      const rel = path.relative(process.cwd(), absPath).replace(/^(\.\.[\/\\])+/, "");
      return path.resolve(baseDir, rel);
    }
    return absPath;
  }
  return path.resolve(baseDir, filePath);
}

/**
 * Reads a file's content cleanly. Non-exclusive access (no lock required).
 */
export async function readFile(
  filePath: string,
  agentId: string,
  onEvent?: (event: ExecutionEvent) => void,
  cwd?: string
): Promise<string> {
  const normalized = resolvePath(filePath, cwd);
  appendAgentLog(agentId, `READ FILE: ${normalized}`);

  if (onEvent) {
    onEvent({
      type: "worker_tool_call",
      payload: { agentId, tool: "readFile", argsSummary: normalized },
      timestamp: Date.now(),
    });
  }

  if (!fs.existsSync(normalized)) {
    const errorMsg = `File not found: ${normalized}`;
    appendAgentLog(agentId, `READ FILE ERROR: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const content = fs.readFileSync(normalized, "utf-8");
  appendAgentLog(agentId, `READ FILE SUCCESS: ${content.length} bytes`);

  if (onEvent) {
    onEvent({
      type: "worker_tool_result",
      payload: {
        agentId,
        tool: "readFile",
        resultSummary: `Read ${content.length} characters`,
      },
      timestamp: Date.now(),
    });
  }

  return content;
}

/**
 * Writes content to a file. Acquires a lock from FileLockManager before writing and releases it after.
 * Ensures parent directories are created automatically.
 */
export async function writeFile(
  filePath: string,
  content: string,
  agentId: string,
  lockManager: FileLockManager,
  onEvent?: (event: ExecutionEvent) => void,
  cwd?: string
): Promise<void> {
  const normalized = resolvePath(filePath, cwd);
  appendAgentLog(agentId, `WRITE FILE (Request Lock): ${normalized}`);

  if (onEvent) {
    onEvent({
      type: "worker_tool_call",
      payload: {
        agentId,
        tool: "writeFile",
        argsSummary: `${normalized} (${content.length} chars)`,
      },
      timestamp: Date.now(),
    });
  }

  // 1. Check if file already exists — OVERWRITE IS PROHIBITED
  if (fs.existsSync(normalized)) {
    const errorMsg = `OVERWRITE PROHIBITED: File "${normalized}" already exists. Agents are strictly prohibited from overwriting files with writeFile. You MUST use surgical AST tools (insertFunction, replaceFunction, addImport, applyLineEdits) to edit existing files!`;
    appendAgentLog(agentId, `WRITE FILE ERROR: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // 2. Acquire Lock
  await lockManager.acquire(normalized, agentId);
  appendAgentLog(agentId, `WRITE FILE (Lock Acquired): ${normalized}`);

  try {
    // 3. Ensure directory exists
    const dir = path.dirname(normalized);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 4. Write New File
    fs.writeFileSync(normalized, content, "utf-8");
    appendAgentLog(agentId, `WRITE FILE SUCCESS: ${normalized} (${content.length} bytes)`);

    if (onEvent) {
      onEvent({
        type: "worker_tool_result",
        payload: {
          agentId,
          tool: "writeFile",
          resultSummary: `Wrote ${content.length} bytes to ${normalized}`,
        },
        timestamp: Date.now(),
      });
    }
  } catch (err: any) {
    appendAgentLog(agentId, `WRITE FILE ERROR on ${normalized}: ${err.message}`);
    throw err;
  } finally {
    // 5. Release Lock
    lockManager.release(normalized, agentId);
    appendAgentLog(agentId, `WRITE FILE (Lock Released): ${normalized}`);
  }
}

/**
 * Lists the contents of a directory.
 */
export async function listDir(
  dirPath: string,
  agentId: string,
  onEvent?: (event: ExecutionEvent) => void,
  cwd?: string
): Promise<string[]> {
  const normalized = resolvePath(dirPath, cwd);
  appendAgentLog(agentId, `LIST DIR: ${normalized}`);

  if (onEvent) {
    onEvent({
      type: "worker_tool_call",
      payload: { agentId, tool: "listDir", argsSummary: normalized },
      timestamp: Date.now(),
    });
  }

  if (!fs.existsSync(normalized)) {
    throw new Error(`Directory not found: ${normalized}`);
  }

  const items = fs.readdirSync(normalized);
  appendAgentLog(agentId, `LIST DIR SUCCESS: ${items.length} items in ${normalized}`);

  if (onEvent) {
    onEvent({
      type: "worker_tool_result",
      payload: {
        agentId,
        tool: "listDir",
        resultSummary: `Found ${items.length} entries`,
      },
      timestamp: Date.now(),
    });
  }

  return items;
}

/**
 * Checks if a file or directory exists.
 */
export async function exists(filePath: string, cwd?: string): Promise<boolean> {
  return fs.existsSync(resolvePath(filePath, cwd));
}

/**
 * Gets file stats (size, modified time, etc.).
 */
export async function stat(filePath: string, cwd?: string): Promise<fs.Stats> {
  return fs.statSync(resolvePath(filePath, cwd));
}
