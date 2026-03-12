#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readConfig, saveConfig } from './config.js';
import { listCommand } from './commands/list.js';
import { schemaCommand } from './commands/schema.js';
import { executeCommand } from './commands/execute.js';
import { statusCommand } from './commands/status.js';
import { approveCommand } from './commands/approve.js';
import { rejectCommand } from './commands/reject.js';
import { initCommand } from './commands/init.js';
import { createCommand } from './commands/create.js';

const program = new Command();

program
  .name('bpm')
  .description(chalk.cyan('BPM Engine CLI') + ' - Manage workflows from command line')
  .version('1.0.0');

program
  .hook('preAction', async (thisCommand) => {
    const config = readConfig();
    if (!config.url && thisCommand.name() !== 'init') {
      console.log(chalk.yellow('⚠️  CLI non configuré. Exécutez: ') + chalk.cyan('bpm init'));
      console.log();
    }
  });

program
  .command('init')
  .description('Configurer la connexion au serveur BPM')
  .action(initCommand);

program
  .command('list')
  .description('Lister tous les workflows disponibles')
  .option('-j, --json', 'Output JSON')
  .action(listCommand);

program
  .command('schema <type>')
  .description('Voir le schéma d\'un workflow (champs requis, étapes humaines)')
  .option('-j, --json', 'Output JSON')
  .action(schemaCommand);

program
  .command('execute <type> [payload]')
  .description('Exécuter un workflow')
  .option('-j, --json', 'Output JSON')
  .action(executeCommand);

program
  .command('status <executionId>')
  .description('Obtenir le statut d\'une exécution')
  .option('-j, --json', 'Output JSON')
  .action(statusCommand);

program
  .command('approve <executionId>')
  .description('Approuver une étape humaine')
  .option('-c, --comment <text>', 'Commentaire')
  .action(approveCommand);

program
  .command('reject <executionId>')
  .description('Rejeter une étape humaine')
  .option('-c, --comment <text>', 'Commentaire')
  .action(rejectCommand);

program
  .command('create <file>')
  .description('Créer un nouveau workflow depuis un fichier JSON')
  .action(createCommand);

program.parse();
