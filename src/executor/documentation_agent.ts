import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import OpenAI from "openai";
import { appendAgentLog } from "../tools/terminal_tools.ts";
import { ExecutionEvent } from "./dag_types.ts";

function makeClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEYS?.split(",")[0] || "";
  const baseURL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  return new OpenAI({ apiKey, baseURL });
}

export interface DocumentationResult {
  documentationReport: string;
  zipPath: string;
  downloadUrl: string;
}

/**
 * Scans source files in job workspace (excluding heavy dirs)
 */
function scanWorkspaceFiles(dir: string, baseDir: string = dir): { relativePath: string; contentSnippet: string }[] {
  const files: { relativePath: string; contentSnippet: string }[] = [];
  const ignoredDirs = new Set(["node_modules", ".git", "dist", "build", ".tmp", "coverage"]);

  function scan(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          scan(path.join(currentDir, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".js", ".ts", ".jsx", ".tsx", ".py", ".html", ".css", ".json", ".md"].includes(ext)) {
          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            files.push({
              relativePath: relPath,
              contentSnippet: content.length > 2000 ? content.substring(0, 2000) + "\n...[truncated]" : content,
            });
          } catch {
            // ignore read error
          }
        }
      }
    }
  }

  if (fs.existsSync(dir)) {
    scan(dir);
  }
  return files;
}

/**
 * Documentation Agent: Analyzes the codebase, writes documentation files, and packages project zip.
 */
export async function runDocumentationStep(
  jobId: string,
  jobCwd: string,
  fullSpec: string,
  onEvent?: (event: ExecutionEvent) => void
): Promise<DocumentationResult> {
  const agentId = `doc-agent-${jobId.substring(0, 8)}`;
  appendAgentLog(agentId, `[DocumentationAgent] Researching and documenting project in ${jobCwd}...`);

  if (onEvent) {
    onEvent({
      type: "worker_started",
      payload: { agentId, title: "Project Documentation & Packaging", batchId: "documentation" },
      timestamp: Date.now(),
    });
  }

  const files = scanWorkspaceFiles(jobCwd);
  const fileSummary = files
    .map((f) => `### File: ${f.relativePath}\n\`\`\`\n${f.contentSnippet}\n\`\`\``)
    .join("\n\n");

  const systemPrompt = `YOU ARE A PRINCIPAL SOFTWARE ARCHITECT AND TECHNICAL WRITER AI AGENT.
Your goal is to inspect the completed repository, write clean production-grade documentation (README.md & PROJECT_DOCUMENTATION.md), and summarize your architectural findings.`;

  const userPrompt = `ORIGINAL SPECIFICATION:
${fullSpec}

REPOSITORY FILE STRUCTURE AND CODE SNIPPETS:
${fileSummary || "No custom code files found."}

INSTRUCTIONS:
Provide a detailed markdown documentation report for the project including:
1. Executive Summary & Architecture Overview
2. Component & Module Breakdown
3. Setup, Configuration & How-To-Run Guide
4. API / Interface Documentation

Your output MUST start with a "# Project Architecture & Documentation" heading.`;

  let documentationReport = "";
  try {
    const client = makeClient();
    const modelName = process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });
    documentationReport = response.choices[0]?.message?.content || "# Project Documentation\nGenerated documentation for completed project.";
  } catch (err: any) {
    appendAgentLog(agentId, `[DocumentationAgent] LLM documentation error: ${err.message}. Using fallback template.`);
    documentationReport = `# Project Documentation\n\n## Overview\nCompleted multi-agent task execution for Job ${jobId}.\n\n## Structure\n- Files generated in workspace: ${files.length}\n- Project directory: ${jobCwd}`;
  }

  // 1. Write README.md and PROJECT_DOCUMENTATION.md into jobCwd
  try {
    fs.writeFileSync(path.join(jobCwd, "PROJECT_DOCUMENTATION.md"), documentationReport, "utf-8");
    const readmeContent = `# Generated Project\n\n${documentationReport.substring(0, 1500)}\n\n*See [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) for complete details.*`;
    fs.writeFileSync(path.join(jobCwd, "README.md"), readmeContent, "utf-8");
    appendAgentLog(agentId, `[DocumentationAgent] Written README.md & PROJECT_DOCUMENTATION.md to ${jobCwd}`);
  } catch (err: any) {
    appendAgentLog(agentId, `[DocumentationAgent] Error writing documentation files: ${err.message}`);
  }

  // 2. Package Zip Archive of jobCwd
  const publicDownloadDir = path.join(process.cwd(), "public", "downloads");
  if (!fs.existsSync(publicDownloadDir)) {
    fs.mkdirSync(publicDownloadDir, { recursive: true });
  }

  const zipFilename = `project-${jobId}.zip`;
  const zipPath = path.join(publicDownloadDir, zipFilename);

  try {
    const zip = new AdmZip();
    zip.addLocalFolder(jobCwd, `project-${jobId}`);
    zip.writeZip(zipPath);
    appendAgentLog(agentId, `[DocumentationAgent] Created project zip at ${zipPath}`);
  } catch (err: any) {
    appendAgentLog(agentId, `[DocumentationAgent] Error creating zip archive: ${err.message}`);
  }

  const downloadUrl = `/api/download/${jobId}`;

  if (onEvent) {
    onEvent({
      type: "worker_done",
      payload: {
        agentId,
        summary: `Created documentation and packaged zip download at ${downloadUrl}`,
        downloadUrl,
      },
      timestamp: Date.now(),
    });
  }

  return {
    documentationReport,
    zipPath,
    downloadUrl,
  };
}
