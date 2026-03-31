import * as os from 'os';
import { ContextTag } from './parser';
import { ContextContent } from './files';

export function getSystemContext(tag: ContextTag): ContextContent {
  const value = tag.value.toLowerCase();
  
  switch (value) {
    case 'system':
    case 'os':
      return {
        tag,
        content: `System Info:
- OS: ${os.type()} ${os.release()} (${os.platform()})
- Arch: ${os.arch()}
- Hostname: ${os.hostname()}
- CPUs: ${os.cpus().length}x ${os.cpus()[0]?.model || 'unknown'}
- Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB total, ${Math.round(os.freemem() / 1024 / 1024 / 1024)}GB free
- Node: ${process.version}`
      };
    
    case 'env': {
      const safeEnv = Object.entries(process.env)
        .filter(([k]) => !k.toLowerCase().includes('key') && !k.toLowerCase().includes('secret') && !k.toLowerCase().includes('token') && !k.toLowerCase().includes('password'))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      return { tag, content: `Environment Variables (sensitive keys omitted):\n${safeEnv}` };
    }
    
    case 'pwd':
    case 'cwd':
      return { tag, content: `Current Directory: ${process.cwd()}` };
    
    case 'git': {
      try {
        const { execSync } = require('child_process');
        const branch = execSync('git branch --show-current 2>/dev/null', { encoding: 'utf-8' }).trim();
        const status = execSync('git status --short 2>/dev/null', { encoding: 'utf-8' }).trim();
        const log = execSync('git log --oneline -5 2>/dev/null', { encoding: 'utf-8' }).trim();
        return {
          tag,
          content: `Git Context:
Branch: ${branch}
Recent commits:
${log}
Status:
${status || '(clean)'}`
        };
      } catch {
        return { tag, content: '', error: 'Not in a git repository or git not available' };
      }
    }
    
    default:
      return { tag, content: '', error: `Unknown system context: ${value}` };
  }
}
