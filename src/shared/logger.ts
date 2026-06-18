// DriftLens - Structured logger using chalk

import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

let _verbose = false;

export function setVerbose(v: boolean): void {
  _verbose = v;
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (_verbose) {
      console.log(chalk.gray(`[debug] ${message}`), ...args);
    }
  },

  info(message: string, ...args: unknown[]): void {
    console.log(chalk.blue('ℹ'), message, ...args);
  },

  success(message: string, ...args: unknown[]): void {
    console.log(chalk.green('✓'), message, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(chalk.yellow('⚠'), chalk.yellow(message), ...args);
  },

  error(message: string, ...args: unknown[]): void {
    console.error(chalk.red('✗'), chalk.red(message), ...args);
  },

  heading(message: string): void {
    console.log(chalk.bold.cyan('\n' + message));
    console.log(chalk.cyan('─'.repeat(message.length)));
  },

  table(rows: Record<string, string | number>[]): void {
    if (rows.length === 0) return;
    const firstRow = rows[0];
    if (!firstRow) return;
    const keys = Object.keys(firstRow);
    const widths = keys.map((k) =>
      Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length))
    );
    const header = keys.map((k, i) => k.padEnd(widths[i] ?? k.length)).join('  ');
    console.log(chalk.bold(header));
    console.log(chalk.gray('─'.repeat(header.length)));
    for (const row of rows) {
      console.log(keys.map((k, i) => String(row[k] ?? '').padEnd(widths[i] ?? 0)).join('  '));
    }
  },
};
