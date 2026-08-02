import { appendAgentLog } from "./terminal_tools.ts";
import { ExecutionEvent } from "../executor/dag_types.ts";

export interface BrowserSession {
  open(url: string): Promise<void>;
  readDOM(): Promise<string>;
  readConsoleErrors(): Promise<string[]>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  scroll(direction: "up" | "down", px: number): Promise<void>;
  screenshot(): Promise<string>; // Base64 string
  close(): Promise<void>;
}

export class PlaywrightBrowserSession implements BrowserSession {
  private agentId: string;
  private browser: any = null;
  private context: any = null;
  private page: any = null;
  private consoleErrors: string[] = [];
  private fallbackHtml: string = "";
  private onEvent?: (event: ExecutionEvent) => void;

  constructor(agentId: string, onEvent?: (event: ExecutionEvent) => void) {
    this.agentId = agentId;
    this.onEvent = onEvent;
  }

  private async ensurePage(): Promise<any> {
    if (this.page) return this.page;

    appendAgentLog(this.agentId, `BROWSER INIT: Launching Playwright browser instance`);
    try {
      // Dynamic import to prevent hard build errors if playwright is not present
      // @ts-ignore
      const playwright = await import("playwright");
      const isHeadless = process.env.BROWSER_HEADLESS !== "false";
      this.browser = await playwright.chromium.launch({
        headless: isHeadless,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();

      // Capture browser console error logs
      this.page.on("console", (msg: any) => {
        if (msg.type() === "error") {
          const text = msg.text();
          this.consoleErrors.push(text);
          appendAgentLog(this.agentId, `[BROWSER CONSOLE ERROR] ${text}`);
        }
      });

      this.page.on("pageerror", (err: Error) => {
        this.consoleErrors.push(err.message);
        appendAgentLog(this.agentId, `[BROWSER UNCAUGHT ERROR] ${err.message}`);
      });

      return this.page;
    } catch (err: any) {
      appendAgentLog(
        this.agentId,
        `BROWSER INIT WARNING: Playwright launch failed (${err.message}). HTTP fallback will be used.`
      );
      throw err;
    }
  }

  public async open(url: string): Promise<void> {
    appendAgentLog(this.agentId, `BROWSER OPEN: ${url}`);
    if (this.onEvent) {
      this.onEvent({
        type: "worker_tool_call",
        payload: { agentId: this.agentId, tool: "browser.open", argsSummary: url },
        timestamp: Date.now(),
      });
    }

    try {
      const page = await this.ensurePage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      appendAgentLog(this.agentId, `BROWSER OPEN SUCCESS: ${url}`);
    } catch (err: any) {
      appendAgentLog(this.agentId, `BROWSER OPEN Playwright unavailable (${err.message}). Attempting HTTP fetch fallback for ${url}...`);
      try {
        const res = await fetch(url);
        this.fallbackHtml = await res.text();
        appendAgentLog(this.agentId, `BROWSER OPEN HTTP FALLBACK SUCCESS for ${url} (${this.fallbackHtml.length} chars)`);
      } catch (httpErr: any) {
        appendAgentLog(this.agentId, `BROWSER OPEN ERROR on ${url}: ${httpErr.message}`);
        this.fallbackHtml = `<html><body>Failed to fetch ${url}: ${httpErr.message}</body></html>`;
      }
    }
  }

  public async readDOM(): Promise<string> {
    appendAgentLog(this.agentId, `BROWSER readDOM`);
    try {
      if (this.page) {
        const html = await this.page.content();
        appendAgentLog(this.agentId, `BROWSER readDOM SUCCESS (${html.length} chars)`);
        return html;
      }
      if (this.fallbackHtml) {
        appendAgentLog(this.agentId, `BROWSER readDOM (HTTP Fallback): (${this.fallbackHtml.length} chars)`);
        return this.fallbackHtml;
      }
      return "<html><body>No active DOM content available.</body></html>";
    } catch (err: any) {
      appendAgentLog(this.agentId, `BROWSER readDOM ERROR: ${err.message}`);
      return this.fallbackHtml || `<html><body>Error reading DOM: ${err.message}</body></html>`;
    }
  }

  public async readConsoleErrors(): Promise<string[]> {
    appendAgentLog(
      this.agentId,
      `BROWSER readConsoleErrors (${this.consoleErrors.length} errors recorded)`
    );
    return [...this.consoleErrors];
  }

  public async click(selector: string): Promise<void> {
    appendAgentLog(this.agentId, `BROWSER CLICK: ${selector}`);
    try {
      if (this.page) {
        await this.page.click(selector, { timeout: 10000 });
        appendAgentLog(this.agentId, `BROWSER CLICK SUCCESS: ${selector}`);
      } else {
        appendAgentLog(this.agentId, `BROWSER CLICK SKIPPED (HTTP Fallback mode active)`);
      }
    } catch (err: any) {
      appendAgentLog(this.agentId, `BROWSER CLICK ERROR: ${err.message}`);
    }
  }

  public async type(selector: string, text: string): Promise<void> {
    appendAgentLog(this.agentId, `BROWSER TYPE into ${selector}: "${text}"`);
    try {
      if (this.page) {
        await this.page.fill(selector, text, { timeout: 10000 });
        appendAgentLog(this.agentId, `BROWSER TYPE SUCCESS`);
      } else {
        appendAgentLog(this.agentId, `BROWSER TYPE SKIPPED (HTTP Fallback mode active)`);
      }
    } catch (err: any) {
      appendAgentLog(this.agentId, `BROWSER TYPE ERROR: ${err.message}`);
    }
  }

  public async scroll(direction: "up" | "down", px: number): Promise<void> {
    appendAgentLog(this.agentId, `BROWSER SCROLL: ${direction} by ${px}px`);
    try {
      if (this.page) {
        const deltaY = direction === "down" ? px : -px;
        await this.page.evaluate((y: number) => window.scrollBy(0, y), deltaY);
        appendAgentLog(this.agentId, `BROWSER SCROLL SUCCESS`);
      }
    } catch (err: any) {
      appendAgentLog(this.agentId, `BROWSER SCROLL ERROR: ${err.message}`);
    }
  }

  public async screenshot(): Promise<string> {
    appendAgentLog(this.agentId, `BROWSER SCREENSHOT`);
    try {
      if (this.page) {
        const buffer = await this.page.screenshot({ fullPage: true });
        const base64 = buffer.toString("base64");
        appendAgentLog(this.agentId, `BROWSER SCREENSHOT SUCCESS (${base64.length} chars base64)`);
        return base64;
      }
      return "";
    } catch (err: any) {
      appendAgentLog(this.agentId, `BROWSER SCREENSHOT ERROR: ${err.message}`);
      return "";
    }
  }

  public async close(): Promise<void> {
    appendAgentLog(this.agentId, `BROWSER CLOSE`);
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.context = null;
        this.page = null;
      }
    } catch (err: any) {
      console.error(`[BrowserTools] Error closing browser for ${this.agentId}:`, err);
    }
  }
}

/**
 * Creates a browser verification session for Manager Agents.
 */
export function createBrowserSession(
  agentId: string,
  onEvent?: (event: ExecutionEvent) => void
): BrowserSession {
  return new PlaywrightBrowserSession(agentId, onEvent);
}
