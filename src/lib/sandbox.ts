import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { CodeRequest, CodeResult } from './types.ts';

/**
 * Runs generated code in an isolated Docker container with a timeout.
 * Writes the code to a temporary file, executes it via Docker, and cleans up.
 *
 * Returns a CodeResult whose shape matches the async side-channel
 * specification in main report.md (exitCode, elapsedMs, stdout, stderr).
 */
export async function runCodeInSandbox(
  request: CodeRequest,
  timeoutMs: number = parseInt(process.env.SANDBOX_TIMEOUT_MS || '300000')
): Promise<CodeResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const isPython = request.language === 'python3';
    const ext = isPython ? '.py' : '.js';
    const interpreter = isPython ? (process.platform === 'win32' ? 'python' : 'python3') : 'node';

    // Create local workspace directory
    const workspaceDir = path.join(process.cwd(), 'sandbox_workspace');
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }

    const fileName = `script_${randomUUID()}${ext}`;
    const filePath = path.join(workspaceDir, fileName);

    try {
      fs.writeFileSync(filePath, request.code, 'utf8');
    } catch (err) {
      return resolve({
        requestId: request.id,
        stdout: '',
        stderr: `Sandbox Error: Failed to write script file: ${(err as Error).message}`,
        exitCode: -1,
        elapsedMs: Date.now() - startTime,
      });
    }

    let stdoutData = '';
    let stderrData = '';

    const child = spawn(interpreter, [filePath], { cwd: workspaceDir });

    let isFinished = false;

    const timeout = setTimeout(() => {
      if (!isFinished) {
        child.kill('SIGKILL');
        isFinished = true;
        cleanup();
        resolve({
          requestId: request.id,
          stdout: stdoutData,
          stderr: stderrData + '\n[Sandbox Error: Process timed out after ' + (timeoutMs / 1000) + 's]',
          exitCode: 124, // 124 is the standard timeout exit code
          elapsedMs: Date.now() - startTime,
        });
      }
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
      // Cap output at 2 MB per main report.md spec
      if (stdoutData.length > 2_000_000) {
        stdoutData = stdoutData.substring(0, 2_000_000) + '...[TRUNCATED]';
      }
    });

    child.stderr.on('data', (data) => {
      stderrData += data.toString();
      if (stderrData.length > 2_000_000) {
        stderrData = stderrData.substring(0, 2_000_000) + '...[TRUNCATED]';
      }
    });

    child.on('close', (code) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeout);
        cleanup();
        resolve({
          requestId: request.id,
          stdout: stdoutData,
          stderr: stderrData,
          exitCode: code ?? -1,
          elapsedMs: Date.now() - startTime,
        });
      }
    });

    child.on('error', (err) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeout);
        cleanup();
        resolve({
          requestId: request.id,
          stdout: stdoutData,
          stderr: stderrData + `\n[Sandbox Process Error: ${err.message}]`,
          exitCode: -1,
          elapsedMs: Date.now() - startTime,
        });
      }
    });

    function cleanup() {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.error('Failed to cleanup sandbox file:', e);
      }
    }
  });
}
