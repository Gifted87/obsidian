import OpenAI from "openai";
import { randomUUID } from "crypto";
import { FileLockManager } from "./file_lock_manager.ts";
import { AgentOutput, ExecutionEvent, TaskNode } from "./dag_types.ts";
import { appendAgentLog, runCommand } from "../tools/terminal_tools.ts";
import { listDir, readFile, writeFile } from "../tools/file_tools.ts";
import { addImport, applyLineEdits, insertFunction, replaceFunction } from "../tools/ast_tools.ts";

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

function getDeepSeekApiKey(): string {
  const keysStr = process.env.DEEPSEEK_API_KEYS || process.env.DEEPSEEK_API_KEY || "";
  const keys = keysStr.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
  if (keys.length === 0) {
    throw new Error("No API keys found for DeepSeek.");
  }
  return keys[Math.floor(Math.random() * keys.length)];
}

function makeClient(): OpenAI {
  return new OpenAI({
    apiKey: getDeepSeekApiKey(),
    baseURL: DEEPSEEK_BASE_URL,
  });
}

/**
 * Worker Agent — Granular ReAct loop execution agent for single tasks.
 * Has terminal access, file tools, AST tools, but NO browser access.
 * Must perform reconnaissance on filesToRead before making edits.
 */
export class WorkerAgent {
  public readonly agentId: string;
  private task: TaskNode;
  private fullSpec: string;
  private fileLockManager: FileLockManager;
  private cwd: string;
  private maxSteps: number;
  private onEvent?: (event: ExecutionEvent) => void;
  private filesModified: Set<string> = new Set();

  constructor(
    task: TaskNode,
    fullSpec: string,
    fileLockManager: FileLockManager,
    cwd: string = process.cwd(),
    maxSteps: number = 100,
    onEvent?: (event: ExecutionEvent) => void
  ) {
    this.agentId = `worker-${randomUUID().substring(0, 8)}`;
    this.task = task;
    this.fullSpec = fullSpec;
    this.fileLockManager = fileLockManager;
    this.cwd = cwd;
    this.maxSteps = maxSteps;
    this.onEvent = onEvent;
  }

  public async execute(): Promise<AgentOutput> {
    const startTime = Date.now();
    appendAgentLog(
      this.agentId,
      `WORKER STARTED: Task "${this.task.title}" (ID: ${this.task.id}, Batch: ${this.task.batchId})`
    );

    if (this.onEvent) {
      this.onEvent({
        type: "worker_started",
        payload: {
          agentId: this.agentId,
          taskId: this.task.id,
          taskTitle: this.task.title,
          batchId: this.task.batchId,
        },
        timestamp: startTime,
      });
    }

    const client = makeClient();

    const systemPrompt = `YOU ARE A GRANULAR WORKER AI AGENT IN AN AGENT SWARM SYSTEM.
YOUR AGENT ID: ${this.agentId}

YOUR MANDATE:
Execute the assigned task with total technical precision using your available terminal, file, and AST tools.

STRICT OPERATIONAL RULES:
1. RECONNAISSANCE FIRST: Before modifying any file, you MUST inspect and read all existing files listed under "Files to Read (Reconnaissance)". Thoroughly understand what was there before touching anything.
2. OVERWRITE PROHIBITION: You are STRICTLY PROHIBITED from overwriting existing files with "writeFile". The "writeFile" tool is exclusively for creating BRAND-NEW files.
3. SURGICAL AST EDITS: For modifying existing files, you MUST use surgical AST tools ("insertFunction", "replaceFunction", "addImport", "applyLineEdits").
4. CONCURRENCY FILE GUARDING & RE-READING: If another agent is editing the same file, your request waits in line via FileLockManager. Once lock access is granted, AST tools automatically re-read the fresh file content from disk before applying your surgical edit.
5. DETAILED CONSOLE LOGGING: You MUST output clear, detailed console log statements for every action, step, and execution detail for diagnostic tracking.
6. STAY IN YOUR SCOPE: Execute only your assigned task within the overall project spec.
7. FINISH SIGNAL: When you have fully completed the task, call the "taskComplete" tool with your summary and details.

ASSIGNED TASK DETAILS:
- Task ID: ${this.task.id}
- Title: ${this.task.title}
- Description: ${this.task.description}
- Files to Read (Reconnaissance): ${JSON.stringify(this.task.filesToRead)}
- Files to Write / Edit: ${JSON.stringify(this.task.filesToWrite)}
- Working Directory: ${this.cwd}

OVERARCHING PROJECT SPECIFICATION (YOUR PLACE IN THE ARCHITECTURE):
${this.fullSpec}`;

    // Available tools for Worker agent
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "readFile",
          description: "Read the complete content of a file from disk.",
          parameters: {
            type: "object",
            properties: {
              filePath: { type: "string", description: "Path to file to read" },
            },
            required: ["filePath"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "writeFile",
          description: "Create a BRAND-NEW file. STRICTLY PROHIBITED FROM OVERWRITING EXISTING FILES. For existing files, use AST surgical tools.",
          parameters: {
            type: "object",
            properties: {
              filePath: { type: "string", description: "Path to new file" },
              content: { type: "string", description: "File content string" },
            },
            required: ["filePath", "content"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "insertFunction",
          description: "Surgically insert a function or code block after a specific line number.",
          parameters: {
            type: "object",
            properties: {
              filePath: { type: "string" },
              functionCode: { type: "string" },
              insertAfterLine: { type: "number" },
            },
            required: ["filePath", "functionCode", "insertAfterLine"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "replaceFunction",
          description: "Surgically replace a named function or variable declaration in a file.",
          parameters: {
            type: "object",
            properties: {
              filePath: { type: "string" },
              functionName: { type: "string" },
              newFunctionCode: { type: "string" },
            },
            required: ["filePath", "functionName", "newFunctionCode"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "addImport",
          description: "Add an import statement to the top of a file safely.",
          parameters: {
            type: "object",
            properties: {
              filePath: { type: "string" },
              importStatement: { type: "string" },
            },
            required: ["filePath", "importStatement"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "applyLineEdits",
          description: "Apply surgical target-replacement line edits to a file.",
          parameters: {
            type: "object",
            properties: {
              filePath: { type: "string" },
              edits: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startLine: { type: "number" },
                    endLine: { type: "number" },
                    targetContent: { type: "string" },
                    replacementContent: { type: "string" },
                  },
                  required: ["startLine", "endLine", "targetContent", "replacementContent"],
                },
              },
            },
            required: ["filePath", "edits"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "runCommand",
          description: "Run a shell/terminal command in the workspace.",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string", description: "Shell command string" },
            },
            required: ["command"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "listDir",
          description: "List contents of a workspace directory.",
          parameters: {
            type: "object",
            properties: {
              dirPath: { type: "string" },
            },
            required: ["dirPath"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "taskComplete",
          description: "Signal that you have successfully completed your assigned task.",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "Detailed summary of completed work" },
              openQuestions: {
                type: "array",
                items: { type: "string" },
                description: "Any potential risks or open questions",
              },
            },
            required: ["summary"],
          },
        },
      },
    ];

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Start executing task: "${this.task.title}". Begin with reconnaissance by reading required files: ${JSON.stringify(
          this.task.filesToRead
        )}`,
      },
    ];

    let taskSummary = "Task completed by worker agent.";
    let openQuestions: string[] = [];
    let isTaskDone = false;

    // ReAct Loop (Up to maxSteps iterations)
    for (let step = 0; step < this.maxSteps && !isTaskDone; step++) {
      appendAgentLog(this.agentId, `--- ReAct Step ${step + 1}/${this.maxSteps} ---`);

      try {
        const response = await client.chat.completions.create({
          model: DEEPSEEK_MODEL,
          messages,
          tools,
          tool_choice: "auto",
        });

        const msg = response.choices[0]?.message;
        if (!msg) break;

        messages.push(msg);

        // Process text thoughts if present
        if (msg.content) {
          appendAgentLog(this.agentId, `THINK: ${msg.content}`);
        }

        // Process Tool Calls
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const toolCall of msg.tool_calls) {
            const fn = (toolCall as any).function;
            if (!fn) continue;
            const toolName = fn.name;
            const args = JSON.parse(fn.arguments || "{}");
            appendAgentLog(this.agentId, `TOOL CALL: ${toolName} with args: ${JSON.stringify(args)}`);

            let resultStr = "";

            // Each tool call is wrapped independently so a tool response is ALWAYS
            // appended to messages even on failure — preventing orphaned tool_calls errors.
            try {
              if (toolName === "readFile") {
                resultStr = await readFile(args.filePath, this.agentId, this.onEvent, this.cwd);
              } else if (toolName === "writeFile") {
                await writeFile(args.filePath, args.content, this.agentId, this.fileLockManager, this.onEvent, this.cwd);
                this.filesModified.add(args.filePath);
                resultStr = `Successfully wrote ${args.content.length} characters to ${args.filePath}`;
              } else if (toolName === "insertFunction") {
                await insertFunction(
                  args.filePath,
                  args.functionCode,
                  args.insertAfterLine,
                  this.agentId,
                  this.fileLockManager,
                  this.onEvent,
                  this.cwd
                );
                this.filesModified.add(args.filePath);
                resultStr = `Successfully inserted code after line ${args.insertAfterLine} in ${args.filePath}`;
              } else if (toolName === "replaceFunction") {
                await replaceFunction(
                  args.filePath,
                  args.functionName,
                  args.newFunctionCode,
                  this.agentId,
                  this.fileLockManager,
                  this.onEvent,
                  this.cwd
                );
                this.filesModified.add(args.filePath);
                resultStr = `Successfully replaced function "${args.functionName}" in ${args.filePath}`;
              } else if (toolName === "addImport") {
                await addImport(
                  args.filePath,
                  args.importStatement,
                  this.agentId,
                  this.fileLockManager,
                  this.onEvent,
                  this.cwd
                );
                this.filesModified.add(args.filePath);
                resultStr = `Successfully added import to ${args.filePath}`;
              } else if (toolName === "applyLineEdits") {
                await applyLineEdits(
                  args.filePath,
                  args.edits,
                  this.agentId,
                  this.fileLockManager,
                  this.onEvent,
                  this.cwd
                );
                this.filesModified.add(args.filePath);
                resultStr = `Successfully applied line edits to ${args.filePath}`;
              } else if (toolName === "runCommand") {
                const res = await runCommand(args.command, this.cwd, this.agentId, 60000, this.onEvent);
                resultStr = `[Exit Code ${res.exitCode}]\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`;
              } else if (toolName === "listDir") {
                const items = await listDir(args.dirPath, this.agentId, this.onEvent, this.cwd);
                resultStr = JSON.stringify(items);
              } else if (toolName === "taskComplete") {
                taskSummary = args.summary || "Task completed.";
                openQuestions = args.openQuestions || [];
                isTaskDone = true;
                resultStr = "Task complete recorded.";
              } else {
                resultStr = `Unknown tool: ${toolName}`;
              }
            } catch (toolErr: any) {
              resultStr = `ERROR executing tool "${toolName}": ${toolErr.message}`;
              appendAgentLog(this.agentId, `TOOL ERROR: ${resultStr}`);
            }

            // Always append a tool result message — even on error — to satisfy the API requirement
            // that every tool_call_id in an assistant message has a corresponding tool response.
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: resultStr.substring(0, 50000), // Cap payload for context window
            });
          }
        } else if (!isTaskDone) {
          // If no tool call was made and not complete, prompt the agent to take action
          messages.push({
            role: "user",
            content: "Please execute your next action using tool calls or call taskComplete if finished.",
          });
        }
      } catch (err: any) {
        appendAgentLog(this.agentId, `ERROR in ReAct loop: ${err.message}`);
        // If this was an API error (not a tool error), no assistant message was pushed,
        // so we can safely push a user message to recover.
        messages.push({
          role: "user",
          content: `API error encountered: ${err.message}. Please continue with your task.`,
        });
      }
    }

    const logPath = `logs/agents/${this.agentId}.log`;
    const finalOutput: AgentOutput = {
      agentId: this.agentId,
      taskId: this.task.id,
      status: isTaskDone ? "SUCCESS" : "PARTIAL",
      filesModified: Array.from(this.filesModified),
      summary: taskSummary,
      consoleLogPath: logPath,
      openQuestions,
      completedAt: Date.now(),
    };

    appendAgentLog(
      this.agentId,
      `WORKER FINISHED: Status ${finalOutput.status}. Modified files: ${JSON.stringify(finalOutput.filesModified)}`
    );

    if (this.onEvent) {
      this.onEvent({
        type: "worker_done",
        payload: {
          agentId: this.agentId,
          taskId: this.task.id,
          status: finalOutput.status,
          filesModified: finalOutput.filesModified,
          summary: finalOutput.summary,
        },
        timestamp: Date.now(),
      });
    }

    return finalOutput;
  }
}
