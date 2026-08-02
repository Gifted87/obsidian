import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { ExecutionEvent } from "../executor/dag_types.ts";

export interface TerminalResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  elapsedMs: number;
}

/**
 * Ensures the log directory for agent execution exists and appends output to the agent's log file.
 */
export function appendAgentLog(agentId: string, message: string): void {
  try {
    const logDir = path.join(process.cwd(), "logs", "agents");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, `${agentId}.log`);
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`, "utf-8");
  } catch (err) {
    console.error(`[TerminalTools] Failed to write agent log for ${agentId}:`, err);
  }
}

/**
 * Runs a terminal/shell command within a specified current working directory.
 * Streams all stdout/stderr to the agent's dedicated log file and emits SSE events.
 */
export async function runCommand(
  command: string,
  cwd: string,
  agentId: string,
  timeoutMs: number = 60000,
  onEvent?: (event: ExecutionEvent) => void
): Promise<TerminalResult> {
  const startTime = Date.now();
  appendAgentLog(agentId, `EXEC COMMAND: "${command}" (cwd: ${cwd})`);

  if (onEvent) {
    onEvent({
      type: "worker_tool_call",
      payload: {
        agentId,
        tool: "runCommand",
        argsSummary: `cmd: "${command}" | cwd: ${cwd}`,
      },
      timestamp: startTime,
    });
  }

  return new Promise((resolve) => {
    let stdoutData = "";
    let stderrData = "";
    let isFinished = false;

    // Use bash on Unix/WSL or cmd.exe / powershell on Windows based on environment
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/bash";
    const shellArgs = isWin ? ["/d", "/s", "/c", command] : ["-c", command];

    const child = spawn(shell, shellArgs, { cwd });

    const timeout = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        child.kill("SIGKILL");
        const elapsedMs = Date.now() - startTime;
        const timeoutMsg = `\n[Process timed out after ${timeoutMs / 1000}s]`;
        stderrData += timeoutMsg;
        appendAgentLog(agentId, `COMMAND TIMED OUT after ${elapsedMs}ms`);

        if (onEvent) {
          onEvent({
            type: "worker_tool_result",
            payload: {
              agentId,
              tool: "runCommand",
              resultSummary: `TIMED OUT (${elapsedMs}ms)`,
            },
            timestamp: Date.now(),
          });
        }

        resolve({
          stdout: stdoutData,
          stderr: stderrData,
          exitCode: 124,
          elapsedMs,
        });
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdoutData += text;
      appendAgentLog(agentId, `[STDOUT] ${text.trimEnd()}`);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrData += text;
      appendAgentLog(agentId, `[STDERR] ${text.trimEnd()}`);
    });

    child.on("close", (code) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeout);
        const elapsedMs = Date.now() - startTime;
        const exitCode = code ?? -1;

        appendAgentLog(
          agentId,
          `COMMAND FINISHED with exitCode ${exitCode} (${elapsedMs}ms)`
        );

        if (onEvent) {
          onEvent({
            type: "worker_tool_result",
            payload: {
              agentId,
              tool: "runCommand",
              resultSummary: `Exit ${exitCode} (${elapsedMs}ms)`,
            },
            timestamp: Date.now(),
          });
        }

        resolve({
          stdout: stdoutData,
          stderr: stderrData,
          exitCode,
          elapsedMs,
        });
      }
    });

    child.on("error", (err) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeout);
        const elapsedMs = Date.now() - startTime;
        stderrData += `\n[Spawn Error: ${err.message}]`;
        appendAgentLog(agentId, `COMMAND ERROR: ${err.message}`);

        if (onEvent) {
          onEvent({
            type: "worker_tool_result",
            payload: {
              agentId,
              tool: "runCommand",
              resultSummary: `Error: ${err.message}`,
            },
            timestamp: Date.now(),
          });
        }

        resolve({
          stdout: stdoutData,
          stderr: stderrData,
          exitCode: -1,
          elapsedMs,
        });
      }
    });
  });
}
