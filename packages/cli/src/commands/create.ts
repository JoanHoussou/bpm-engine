import chalk from 'chalk';
import { readFileSync } from 'fs';
import { createApiClient } from '../api.js';

export async function createCommand(filePath: string) {
  const client = createApiClient();

  console.log(chalk.cyan(`\n📂 Chargement du fichier: ${filePath}\n`));

  let definition: any;
  try {
    const content = readFileSync(filePath, 'utf-8');
    definition = JSON.parse(content);
  } catch (err: any) {
    console.log(chalk.red(`❌ Erreur de lecture: ${err.message}`));
    process.exit(1);
  }

  if (!definition.type || !definition.steps) {
    console.log(chalk.red('❌ Definition invalide. Champs requis: type, steps'));
    process.exit(1);
  }

  console.log(chalk.white('  Type: ') + definition.type);
  console.log(chalk.white('  Version: ') + (definition.version || '1.0.0'));
  console.log(chalk.white('  Étapes: ') + definition.steps.length);
  console.log();

  try {
    const response = await client.post('/api/v1/registry/register', definition);
    const result = response.data;

    console.log(chalk.green('✅ Workflow créé avec succès!'));
    console.log(chalk.white('  Type: ') + chalk.yellow(result.type));
    console.log(chalk.white('  Version: ') + result.version);
    console.log(chalk.white('  Étapes: ') + result.steps_count);
    console.log(chalk.gray('  Trace: ') + result.trace_id);
    console.log();

    console.log(chalk.cyan('  Pour exécuter:'));
    console.log(chalk.gray(`    bpm execute ${result.type} '{}'`));
    console.log();
  } catch (err: any) {
    console.log(chalk.red(`\n❌ Erreur: ${err.message}\n`));
    process.exit(1);
  }
}
