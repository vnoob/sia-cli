#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { ChatInterface } from './chat/interface';
import { PreferencesStorage } from './storage/preferences';
import { KeyStorage } from './storage/keys';
import { HistoryStorage } from './storage/history';

const HISTORY_PREVIEW_LENGTH = 70;

const program = new Command();

program
  .name('sia')
  .description('Terminal-based AI assistant for developers')
  .version('1.0.0');

// Default command: start interactive chat
program
  .command('chat', { isDefault: true })
  .description('Start interactive chat (default)')
  .action(async () => {
    const ui = new ChatInterface();
    await ui.start();
  });

// Config commands
program
  .command('config')
  .description('Manage configuration')
  .option('--provider <name>', 'Set AI provider (openai|ollama)')
  .option('--model <name>', 'Set AI model')
  .option('--stream <bool>', 'Enable/disable streaming')
  .option('--system-prompt <text>', 'Set system prompt')
  .option('--ollama-url <url>', 'Set Ollama base URL')
  .option('--show', 'Show current configuration')
  .action((opts) => {
    const prefs = new PreferencesStorage();
    
    if (opts.show || Object.keys(opts).length === 0) {
      console.log(chalk.bold('Current Configuration:'));
      const all = prefs.getAll();
      Object.entries(all).forEach(([k, v]) => {
        if (k === 'systemPrompt') {
          console.log(`  ${chalk.cyan(k)}: ${String(v).slice(0, 80)}...`);
        } else {
          console.log(`  ${chalk.cyan(k)}: ${chalk.white(String(v))}`);
        }
      });
      return;
    }

    if (opts.provider) {
      if (opts.provider !== 'openai' && opts.provider !== 'ollama') {
        console.error(chalk.red('Provider must be "openai" or "ollama"'));
        process.exit(1);
      }
      prefs.set('provider', opts.provider);
      console.log(chalk.green(`✓ Provider set to: ${opts.provider}`));
    }
    if (opts.model) {
      prefs.set('model', opts.model);
      console.log(chalk.green(`✓ Model set to: ${opts.model}`));
    }
    if (opts.stream !== undefined) {
      prefs.set('streamResponse', opts.stream === 'true');
      console.log(chalk.green(`✓ Streaming set to: ${opts.stream}`));
    }
    if (opts.systemPrompt) {
      prefs.set('systemPrompt', opts.systemPrompt);
      console.log(chalk.green(`✓ System prompt updated`));
    }
    if (opts.ollamaUrl) {
      prefs.set('ollamaBaseUrl', opts.ollamaUrl);
      console.log(chalk.green(`✓ Ollama URL set to: ${opts.ollamaUrl}`));
    }
  });

// Key management
program
  .command('key')
  .description('Manage API keys')
  .argument('[action]', 'Action: set, get, delete, list')
  .argument('[name]', 'Key name')
  .argument('[value]', 'Key value (for set action)')
  .action(async (action, name, value) => {
    const keys = new KeyStorage();
    
    if (!action || action === 'list') {
      const keyList = await keys.listKeys();
      if (keyList.length === 0) {
        console.log(chalk.gray('No API keys stored.'));
      } else {
        console.log(chalk.bold('Stored API keys:'));
        keyList.forEach(k => console.log(`  ${chalk.green('•')} ${k}`));
      }
      return;
    }

    if (action === 'set' && name && value) {
      await keys.setKey(name, value);
      console.log(chalk.green(`✓ Key '${name}' stored`));
    } else if (action === 'delete' && name) {
      const deleted = await keys.deleteKey(name);
      console.log(deleted ? chalk.green(`✓ Key '${name}' deleted`) : chalk.yellow(`Key '${name}' not found`));
    } else {
      console.log(chalk.yellow('Usage: sia key [list|set <name> <value>|delete <name>]'));
    }
  });

// History commands
program
  .command('history')
  .description('Manage conversation history')
  .option('--list', 'List recent sessions')
  .option('--clear', 'Clear all history')
  .action((opts) => {
    const history = new HistoryStorage();
    
    if (opts.clear) {
      history.clearAll();
      console.log(chalk.green('✓ Conversation history cleared'));
      return;
    }

    const sessions = history.listSessions();
    if (sessions.length === 0) {
      console.log(chalk.gray('No conversation history found.'));
      return;
    }
    
    console.log(chalk.bold('Conversation History:'));
    sessions.slice(0, 20).forEach((s, i) => {
      const date = new Date(s.updatedAt).toLocaleString();
      const msgCount = s.messages.length;
      const rawMsg = s.messages.find(m => m.role === 'user')?.content || '(empty)';
      const firstMsg = rawMsg.slice(0, HISTORY_PREVIEW_LENGTH);
      console.log(`\n  ${chalk.cyan((i + 1) + '.')} ${chalk.gray(date)} | ${msgCount} messages`);
      console.log(`     ${chalk.white(firstMsg)}${rawMsg.length > HISTORY_PREVIEW_LENGTH ? '...' : ''}`);
    });
    console.log();
  });

program.parse(process.argv);
