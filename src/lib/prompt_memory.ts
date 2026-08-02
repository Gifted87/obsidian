import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const MEMORY_DIR = path.join(process.cwd(), "memory");
const MUTATIONS_FILE = path.join(MEMORY_DIR, "prompt_mutations.json");

export interface PromptMutation {
  id: string;                        // UUID
  agentRole: "controller" | "questioner" | "answerer-internal" | "answerer-archival" | "answerer-external" | "synthesizer" | "grounding";
  proposedAddition: string;          // The text to append to the target prompt
  rationale: string;                 // Why Meta-Cognition proposed this
  sessionId: string;                 // Session that produced this mutation
  createdAt: number;
  appliedCount: number;              // How many sessions have used it
  effectivenessVotes: number;        // Future: voting mechanism
  status: "ACTIVE" | "RETIRED";
}

export class PromptMemory {

  static load(): PromptMutation[] {
    if (!existsSync(MUTATIONS_FILE)) return [];
    try {
      return JSON.parse(readFileSync(MUTATIONS_FILE, "utf-8"));
    } catch {
      return [];
    }
  }

  static save(mutations: PromptMutation[]): void {
    if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
    writeFileSync(MUTATIONS_FILE, JSON.stringify(mutations, null, 2));
  }

  static getActive(agentRole: PromptMutation["agentRole"]): string[] {
    return PromptMemory.load()
      .filter(m => m.status === "ACTIVE" && m.agentRole === agentRole)
      .map(m => m.proposedAddition);
  }

  static addMutation(mutation: Omit<PromptMutation, "id" | "appliedCount" | "effectivenessVotes" | "status">): void {
    const mutations = PromptMemory.load();
    mutations.push({
      ...mutation,
      id: randomUUID(),
      appliedCount: 0,
      effectivenessVotes: 0,
      status: "ACTIVE",
    });
    PromptMemory.save(mutations);
  }

  static incrementApplied(agentRole: PromptMutation["agentRole"]): void {
    const mutations = PromptMemory.load();
    mutations.filter(m => m.status === "ACTIVE" && m.agentRole === agentRole)
      .forEach(m => m.appliedCount++);
    PromptMemory.save(mutations);
  }
}
