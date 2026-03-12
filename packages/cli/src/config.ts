import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.bpm');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface BpmConfig {
  url: string;
  apiKey: string;
}

export function readConfig(): BpmConfig {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return { url: '', apiKey: '' };
    }
    const data = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { url: '', apiKey: '' };
  }
}

export function saveConfig(config: BpmConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getApiClient() {
  const config = readConfig();
  if (!config.url || !config.apiKey) {
    throw new Error('CLI non configuré. Exécutez: bpm init');
  }
  return config;
}
