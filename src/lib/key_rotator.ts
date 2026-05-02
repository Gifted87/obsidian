import dotenv from 'dotenv';

// Ensure dotenv is configured ONLY in Node environments
if (typeof process !== 'undefined' && process.env) {
  dotenv.config();
}

class KeyRotator {
  private keys: string[] = [];
  private currentIndex = 0;

  constructor() {
    this.reloadKeys();
  }

  /**
   * Loads or reloads keys from environment variables.
   * Prioritizes GEMINI_API_KEYS (comma separated), falls back to GEMINI_API_KEY.
   */
  public reloadKeys() {
    const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    this.keys = keysEnv.split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    if (this.keys.length === 0) {
      console.warn("KeyRotator: No API keys found in environment variables GEMINI_API_KEYS or GEMINI_API_KEY.");
    } else {
      console.log(`KeyRotator: Initialized with ${this.keys.length} keys.`);
    }
  }

  /**
   * Returns the next key in the rotation.
   */
  public getNextKey(): string {
    if (this.keys.length === 0) {
      return process.env.GEMINI_API_KEY || "";
    }
    const key = this.keys[this.currentIndex];
    const displayIndex = this.currentIndex + 1;
    const totalKeys = this.keys.length;
    
    // Masked key for terminal visibility
    const maskedKey = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    console.log(`[KeyRotator] Rotating to key ${displayIndex}/${totalKeys} [${maskedKey}]`);
    
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    return key;
  }

  /**
   * Checks if any keys are available.
   */
  public hasKeys(): boolean {
    return this.keys.length > 0;
  }

  /**
   * Returns the current key index (1-based).
   */
  public getCurrentIndex(): number {
    return this.currentIndex + 1;
  }

  /**
   * Returns total number of keys.
   */
  public getKeyCount(): number {
    return this.keys.length;
  }
}

// Export a singleton instance
export const keyRotator = new KeyRotator();
