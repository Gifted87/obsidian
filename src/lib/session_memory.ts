import fs from 'fs';
import path from 'path';
import { ReasoningGraph } from './types.ts';

export interface SavedSession {
  id: string;
  name: string;
  createdAt: number;
  graph: ReasoningGraph;
}

const MEMORY_DIR = path.join(process.cwd(), 'memory', 'sessions');

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

export const SessionMemory = {
  save(session: SavedSession): void {
    ensureDir();
    const filePath = path.join(MEMORY_DIR, `${session.id}.json`);
    
    // Convert Map to array of pairs for JSON serialization
    const serializableGraph = {
      ...session.graph,
      nodes: Array.from(session.graph.nodes.entries())
    };
    
    const serializableSession = {
      ...session,
      graph: serializableGraph
    };
    
    fs.writeFileSync(filePath, JSON.stringify(serializableSession, null, 2), 'utf-8');
  },

  load(sessionId: string): SavedSession | null {
    ensureDir();
    const filePath = path.join(MEMORY_DIR, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Convert array of pairs back to Map
      parsed.graph.nodes = new Map(parsed.graph.nodes);
      
      return parsed as SavedSession;
    } catch (e) {
      console.error(`Failed to load session ${sessionId}:`, e);
      return null;
    }
  },

  list(): Array<{ id: string; name: string; createdAt: number }> {
    ensureDir();
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
    const sessions = [];
    
    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf-8');
        const parsed = JSON.parse(data);
        sessions.push({
          id: parsed.id,
          name: parsed.name,
          createdAt: parsed.createdAt
        });
      } catch (e) {
        console.error(`Failed to read session file ${file}:`, e);
      }
    }
    
    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  }
};
