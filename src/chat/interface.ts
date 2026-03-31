import * as readline from 'readline';
import chalk from 'chalk';
import { ChatSession } from './session';
import { HistoryStorage } from '../storage/history';

const BANNER = `
${chalk.cyan('╔══════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.cyan('Sia')} ${chalk.gray('- Terminal AI Assistant')}      ${chalk.cyan('║')}
${chalk.cyan('╚══════════════════════════════════╝')}
`;

const HELP_TEXT = `
${chalk.bold('Commands:')}
  ${chalk.yellow('/help')}          Show this help
  ${chalk.yellow('/clear')}         Clear screen
  ${chalk.yellow('/history')}       List recent conversations  
  ${chalk.yellow('/new')}           Start a new conversation
  ${chalk.yellow('/model <name>')}  Switch AI model
  ${chalk.yellow('/provider <n>')} Switch provider (openai|ollama)
  ${chalk.yellow('/key <name>')}    Set an API key
  ${chalk.yellow('/keys')}          List stored keys
  ${chalk.yellow('/prefs')}         Show current preferences
  ${chalk.yellow('/exit')}          Exit Sia

${chalk.bold('Context Tags:')}
  ${chalk.green('@<file>')}        Inject file content (e.g., @src/index.ts)
  ${chalk.green('#<dir>')}         Inject directory listing (e.g., #src)
  ${chalk.green('#system')}        Inject system info (OS, CPU, memory)
  ${chalk.green('#env')}           Inject environment variables
  ${chalk.green('#git')}           Inject git status/log
  ${chalk.green('#cwd')}           Inject current directory path
`;

export class ChatInterface {
  private rl!: readline.Interface;
  private session: ChatSession;
  private historyStorage: HistoryStorage;

  constructor() {
    this.session = new ChatSession();
    this.historyStorage = new HistoryStorage();
  }

  async start(): Promise<void> {
    await this.session.initialize();

    console.log(BANNER);
    
    const prefs = this.session.getPrefs();
    const provider = prefs.get('provider');
    const model = prefs.get('model');
    console.log(chalk.gray(`Provider: ${provider} | Model: ${model}`));
    console.log(chalk.gray('Type /help for commands, /exit to quit\n'));

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      historySize: 100
    });

    this.rl.on('close', () => {
      console.log(chalk.gray('\nGoodbye! 👋'));
      process.exit(0);
    });

    await this.prompt();
  }

  private async prompt(): Promise<void> {
    this.rl.question(chalk.green('you> '), async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        await this.prompt();
        return;
      }

      if (trimmed.startsWith('/')) {
        await this.handleCommand(trimmed);
      } else {
        await this.handleMessage(trimmed);
      }

      await this.prompt();
    });
  }

  private async handleMessage(input: string): Promise<void> {
    process.stdout.write(chalk.blue('sia> '));
    
    try {
      await this.session.sendMessage(input, (delta: string) => {
        process.stdout.write(delta);
      });
      process.stdout.write('\n\n');
    } catch (error: any) {
      process.stdout.write('\n');
      if (error.response?.status === 401) {
        console.error(chalk.red('Error: Invalid or missing API key. Use /key <keyname> to set your API key.'));
      } else if (error.code === 'ECONNREFUSED') {
        console.error(chalk.red('Error: Cannot connect to AI provider. Check your provider settings with /prefs.'));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
    }
  }

  private async handleCommand(input: string): Promise<void> {
    const parts = input.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        console.log(HELP_TEXT);
        break;

      case 'clear':
        console.clear();
        break;

      case 'history':
        this.showHistory();
        break;

      case 'new':
        await this.startNewSession();
        break;

      case 'model':
        if (args[0]) {
          this.session.setModel(args[0]);
          console.log(chalk.green(`✓ Model set to: ${args[0]}`));
        } else {
          console.log(chalk.yellow('Usage: /model <model-name>'));
        }
        break;

      case 'provider':
        if (args[0] === 'openai' || args[0] === 'ollama') {
          await this.session.switchProvider(args[0]);
          console.log(chalk.green(`✓ Provider switched to: ${args[0]}`));
        } else {
          console.log(chalk.yellow('Usage: /provider <openai|ollama>'));
        }
        break;

      case 'key':
        await this.setKey(args);
        break;

      case 'keys':
        await this.listKeys();
        break;

      case 'prefs':
        this.showPrefs();
        break;

      case 'exit':
      case 'quit':
        console.log(chalk.gray('Goodbye! 👋'));
        process.exit(0);
        break;

      default:
        console.log(chalk.yellow(`Unknown command: /${cmd}. Type /help for available commands.`));
    }
  }

  private showHistory(): void {
    const sessions = this.historyStorage.listSessions();
    if (sessions.length === 0) {
      console.log(chalk.gray('No conversation history found.'));
      return;
    }
    console.log(chalk.bold('\nRecent conversations:'));
    sessions.slice(0, 10).forEach((s, i) => {
      const date = new Date(s.updatedAt).toLocaleString();
      const msgCount = s.messages.length;
      const rawMsg = s.messages.find(m => m.role === 'user')?.content || '(empty)';
      const firstMsg = rawMsg.slice(0, 60);
      console.log(`  ${chalk.cyan(i + 1 + '.')} ${chalk.gray(date)} (${msgCount} messages)`);
      console.log(`     ${chalk.white(firstMsg)}${rawMsg.length > 60 ? '...' : ''}`);
    });
    console.log();
  }

  private async startNewSession(): Promise<void> {
    this.session = new ChatSession();
    await this.session.initialize();
    console.log(chalk.green('✓ Started new conversation session'));
  }

  private async setKey(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log(chalk.yellow('Usage: /key <keyname>'));
      console.log(chalk.gray('Example: /key openai'));
      return;
    }
    const keyName = args[0];
    
    // Temporarily disable echo for secure input
    const rl2 = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });
    
    return new Promise((resolve) => {
      process.stdout.write(chalk.yellow(`Enter value for '${keyName}' (input hidden): `));
      // Mute output — setRawMode is only available on TTY streams
      if (process.stdin.isTTY) {
        (process.stdin as NodeJS.ReadStream & { setRawMode(mode: boolean): void }).setRawMode(true);
      }
      
      let value = '';
      const onData = (char: Buffer) => {
        const c = char.toString();
        type RawTTY = NodeJS.ReadStream & { setRawMode(mode: boolean): void };
        const rawStdin = process.stdin as RawTTY;
        if (c === '\r' || c === '\n') {
          process.stdin.removeListener('data', onData);
          if (process.stdin.isTTY) {
            rawStdin.setRawMode(false);
          }
          process.stdout.write('\n');
          rl2.close();
          
          this.session.getKeys().setKey(keyName, value).then(() => {
            console.log(chalk.green(`✓ Key '${keyName}' stored securely`));
            resolve();
          }).catch((err: any) => {
            console.error(chalk.red(`Failed to store key: ${err.message}`));
            resolve();
          });
        } else if (c === '\u0003') {
          // Ctrl+C
          process.stdin.removeListener('data', onData);
          if (process.stdin.isTTY) {
            rawStdin.setRawMode(false);
          }
          process.stdout.write('\n');
          rl2.close();
          resolve();
        } else if (c === '\u007f' || c === '\b') {
          value = value.slice(0, -1);
        } else {
          value += c;
        }
      };
      
      process.stdin.on('data', onData);
    });
  }

  private async listKeys(): Promise<void> {
    try {
      const keys = await this.session.getKeys().listKeys();
      if (keys.length === 0) {
        console.log(chalk.gray('No API keys stored. Use /key <name> to add one.'));
      } else {
        console.log(chalk.bold('\nStored API keys:'));
        keys.forEach(k => console.log(`  ${chalk.green('•')} ${k}`));
        console.log();
      }
    } catch (err: any) {
      console.error(chalk.red(`Failed to list keys: ${err.message}`));
    }
  }

  private showPrefs(): void {
    const prefs = this.session.getPrefs().getAll();
    console.log(chalk.bold('\nCurrent Preferences:'));
    Object.entries(prefs).forEach(([key, val]) => {
      if (key === 'systemPrompt') {
        console.log(`  ${chalk.cyan(key)}: ${chalk.white(String(val).slice(0, 60))}...`);
      } else {
        console.log(`  ${chalk.cyan(key)}: ${chalk.white(String(val))}`);
      }
    });
    console.log();
  }
}
