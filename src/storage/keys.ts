import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const SERVICE_NAME = 'sia-cli';

// Try to use keytar for secure storage, fall back to file-based
let keytar: any = null;
try {
  keytar = require('keytar');
} catch {
  // keytar not available, use file fallback
}

// File-based fallback: derives a key from machine identity.
// Note: this provides obfuscation against casual inspection only.
// Use keytar (preferred) for genuine secret-store security.
function getMachineKey(): Buffer {
  const machineId = os.hostname() + os.userInfo().username;
  return crypto.createHash('sha256').update(machineId).digest();
}

function encryptValue(value: string): string {
  const key = getMachineKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptValue(encrypted: string): string {
  const key = getMachineKey();
  const [ivHex, encHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encBuf = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(encBuf), decipher.final()]).toString('utf-8');
}

export class KeyStorage {
  private keysPath: string;
  private useKeytar: boolean;

  constructor(baseDir?: string) {
    const dir = path.join(baseDir || os.homedir(), '.sia-cli');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.keysPath = path.join(dir, 'keys.enc');
    this.useKeytar = keytar !== null;
  }

  async setKey(keyName: string, value: string): Promise<void> {
    if (this.useKeytar) {
      await keytar.setPassword(SERVICE_NAME, keyName, value);
    } else {
      const keys = this.loadLocalKeys();
      keys[keyName] = encryptValue(value);
      fs.writeFileSync(this.keysPath, JSON.stringify(keys), 'utf-8');
    }
  }

  async getKey(keyName: string): Promise<string | null> {
    if (this.useKeytar) {
      return keytar.getPassword(SERVICE_NAME, keyName);
    } else {
      const keys = this.loadLocalKeys();
      if (!keys[keyName]) return null;
      try {
        return decryptValue(keys[keyName]);
      } catch {
        return null;
      }
    }
  }

  async deleteKey(keyName: string): Promise<boolean> {
    if (this.useKeytar) {
      return keytar.deletePassword(SERVICE_NAME, keyName);
    } else {
      const keys = this.loadLocalKeys();
      if (!keys[keyName]) return false;
      delete keys[keyName];
      fs.writeFileSync(this.keysPath, JSON.stringify(keys), 'utf-8');
      return true;
    }
  }

  async listKeys(): Promise<string[]> {
    if (this.useKeytar) {
      const creds = await keytar.findCredentials(SERVICE_NAME);
      return creds.map((c: any) => c.account);
    } else {
      return Object.keys(this.loadLocalKeys());
    }
  }

  private loadLocalKeys(): Record<string, string> {
    if (!fs.existsSync(this.keysPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.keysPath, 'utf-8'));
    } catch {
      return {};
    }
  }
}
