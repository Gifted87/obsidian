import fs from "fs";
import path from "path";
import { FileLockManager } from "../executor/file_lock_manager.ts";
import { appendAgentLog } from "./terminal_tools.ts";
import { ExecutionEvent } from "../executor/dag_types.ts";
import { resolvePath } from "./file_tools.ts";

export interface LineEdit {
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed, inclusive
  targetContent: string;
  replacementContent: string;
}

/**
 * Inserts a function or code block after a specific 1-indexed line number in a file.
 * Uses FileLockManager for thread-safe execution.
 */
export async function insertFunction(
  filePath: string,
  functionCode: string,
  insertAfterLine: number,
  agentId: string,
  lockManager: FileLockManager,
  onEvent?: (event: ExecutionEvent) => void,
  cwd?: string
): Promise<void> {
  const normalized = resolvePath(filePath, cwd);
  appendAgentLog(agentId, `AST EDIT (insertFunction) in ${normalized} after line ${insertAfterLine}`);

  if (onEvent) {
    onEvent({
      type: "worker_tool_call",
      payload: {
        agentId,
        tool: "insertFunction",
        argsSummary: `${normalized} (after line ${insertAfterLine})`,
      },
      timestamp: Date.now(),
    });
  }

  await lockManager.acquire(normalized, agentId);

  try {
    if (!fs.existsSync(normalized)) {
      throw new Error(`File does not exist: ${normalized}`);
    }

    const lines = fs.readFileSync(normalized, "utf-8").split("\n");
    const targetIdx = Math.min(Math.max(0, insertAfterLine), lines.length);

    const insertedLines = functionCode.split("\n");
    lines.splice(targetIdx, 0, ...insertedLines);

    fs.writeFileSync(normalized, lines.join("\n"), "utf-8");
    appendAgentLog(agentId, `AST EDIT SUCCESS: Inserted ${insertedLines.length} lines into ${normalized}`);

    if (onEvent) {
      onEvent({
        type: "worker_tool_result",
        payload: {
          agentId,
          tool: "insertFunction",
          resultSummary: `Inserted ${insertedLines.length} lines into ${normalized}`,
        },
        timestamp: Date.now(),
      });
    }
  } finally {
    lockManager.release(normalized, agentId);
  }
}

/**
 * Replaces a named function/const/class declaration in a TypeScript/JavaScript file using regex block bounds.
 * Uses FileLockManager for thread-safe execution.
 */
export async function replaceFunction(
  filePath: string,
  functionName: string,
  newFunctionCode: string,
  agentId: string,
  lockManager: FileLockManager,
  onEvent?: (event: ExecutionEvent) => void,
  cwd?: string
): Promise<void> {
  const normalized = resolvePath(filePath, cwd);
  appendAgentLog(agentId, `AST EDIT (replaceFunction) "${functionName}" in ${normalized}`);

  if (onEvent) {
    onEvent({
      type: "worker_tool_call",
      payload: {
        agentId,
        tool: "replaceFunction",
        argsSummary: `${normalized} -> replace ${functionName}`,
      },
      timestamp: Date.now(),
    });
  }

  await lockManager.acquire(normalized, agentId);

  try {
    if (!fs.existsSync(normalized)) {
      throw new Error(`File does not exist: ${normalized}`);
    }

    const content = fs.readFileSync(normalized, "utf-8");
    // Match function declaration or const/let export function
    const regex = new RegExp(
      `(?:export\\s+)?(?:async\\s+)?(?:function\\s+${functionName}|const\\s+${functionName}\\s*=|let\\s+${functionName}\\s*=)[^{]*\\{[\\s\\S]*?\\n\\}`,
      "m"
    );

    if (!regex.test(content)) {
      throw new Error(`Symbol/Function "${functionName}" not found in ${normalized}`);
    }

    const updatedContent = content.replace(regex, newFunctionCode.trim());
    fs.writeFileSync(normalized, updatedContent, "utf-8");
    appendAgentLog(agentId, `AST EDIT SUCCESS: Replaced function "${functionName}" in ${normalized}`);

    if (onEvent) {
      onEvent({
        type: "worker_tool_result",
        payload: {
          agentId,
          tool: "replaceFunction",
          resultSummary: `Replaced function ${functionName} in ${normalized}`,
        },
        timestamp: Date.now(),
      });
    }
  } finally {
    lockManager.release(normalized, agentId);
  }
}

/**
 * Adds an import statement at the top of a file if it doesn't already exist.
 */
export async function addImport(
  filePath: string,
  importStatement: string,
  agentId: string,
  lockManager: FileLockManager,
  onEvent?: (event: ExecutionEvent) => void,
  cwd?: string
): Promise<void> {
  const normalized = resolvePath(filePath, cwd);
  appendAgentLog(agentId, `AST EDIT (addImport) "${importStatement}" in ${normalized}`);

  if (onEvent) {
    onEvent({
      type: "worker_tool_call",
      payload: {
        agentId,
        tool: "addImport",
        argsSummary: `${normalized} -> ${importStatement}`,
      },
      timestamp: Date.now(),
    });
  }

  await lockManager.acquire(normalized, agentId);

  try {
    if (!fs.existsSync(normalized)) {
      throw new Error(`File does not exist: ${normalized}`);
    }

    const content = fs.readFileSync(normalized, "utf-8");
    const cleanImport = importStatement.trim();

    if (content.includes(cleanImport)) {
      appendAgentLog(agentId, `AST EDIT SKIP: Import already present in ${normalized}`);
      return;
    }

    const lines = content.split("\n");
    // Find last existing import line
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("import ")) {
        lastImportIdx = i;
      }
    }

    if (lastImportIdx !== -1) {
      lines.splice(lastImportIdx + 1, 0, cleanImport);
    } else {
      lines.unshift(cleanImport);
    }

    fs.writeFileSync(normalized, lines.join("\n"), "utf-8");
    appendAgentLog(agentId, `AST EDIT SUCCESS: Added import to ${normalized}`);

    if (onEvent) {
      onEvent({
        type: "worker_tool_result",
        payload: {
          agentId,
          tool: "addImport",
          resultSummary: `Added import to ${normalized}`,
        },
        timestamp: Date.now(),
      });
    }
  } finally {
    lockManager.release(normalized, agentId);
  }
}

/**
 * Applies surgical line edits to a file.
 */
export async function applyLineEdits(
  filePath: string,
  edits: LineEdit[],
  agentId: string,
  lockManager: FileLockManager,
  onEvent?: (event: ExecutionEvent) => void,
  cwd?: string
): Promise<void> {
  const normalized = resolvePath(filePath, cwd);
  appendAgentLog(agentId, `AST EDIT (applyLineEdits) ${edits.length} edits in ${normalized}`);

  if (onEvent) {
    onEvent({
      type: "worker_tool_call",
      payload: {
        agentId,
        tool: "applyLineEdits",
        argsSummary: `${normalized} -> ${edits.length} edits`,
      },
      timestamp: Date.now(),
    });
  }

  await lockManager.acquire(normalized, agentId);

  try {
    if (!fs.existsSync(normalized)) {
      throw new Error(`File does not exist: ${normalized}`);
    }

    let content = fs.readFileSync(normalized, "utf-8");

    for (const edit of edits) {
      if (content.includes(edit.targetContent)) {
        content = content.replace(edit.targetContent, edit.replacementContent);
      } else {
        appendAgentLog(
          agentId,
          `AST EDIT WARNING: targetContent not found in ${normalized}. Attempting direct line replacement.`
        );
        const lines = content.split("\n");
        const start = Math.max(0, edit.startLine - 1);
        const count = Math.max(1, edit.endLine - edit.startLine + 1);
        lines.splice(start, count, edit.replacementContent);
        content = lines.join("\n");
      }
    }

    fs.writeFileSync(normalized, content, "utf-8");
    appendAgentLog(agentId, `AST EDIT SUCCESS: Applied ${edits.length} line edits to ${normalized}`);

    if (onEvent) {
      onEvent({
        type: "worker_tool_result",
        payload: {
          agentId,
          tool: "applyLineEdits",
          resultSummary: `Applied ${edits.length} line edits`,
        },
        timestamp: Date.now(),
      });
    }
  } finally {
    lockManager.release(normalized, agentId);
  }
}
