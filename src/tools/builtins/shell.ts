import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool } from '../types';

const execAsync = promisify(exec);

export const shellTool: Tool = {
  name: 'shell',
  description: 'Execute a shell command and return its output',
  async execute(args: string[]): Promise<string> {
    const command = args.join(' ');
    if (!command) {
      return 'Error: No command provided';
    }
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      if (stderr) {
        return `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
      }
      return stdout || '(no output)';
    } catch (error: any) {
      return `Error executing command: ${error.message}`;
    }
  }
};
