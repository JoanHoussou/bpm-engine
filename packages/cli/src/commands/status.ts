import chalk from 'chalk';
import { createApiClient } from '../api.js';

export async function statusCommand(executionId: string, options: { json?: boolean }) {
  const client = createApiClient();
  
  const response = await client.get(`/api/v1/workflow/${executionId}`);
  const result = response.data;

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(chalk.cyan(`\n📊 Statut de l'exécution\n`));
  
  console.log(chalk.white('  Execution ID: ') + chalk.yellow(result.execution_id));
  console.log(chalk.white('  Type: ') + chalk.gray(result.type));
  console.log(chalk.white('  Status: ') + getStatusColor(result.status));
  
  if (result.started_at) {
    console.log(chalk.white('  Démarré: ') + chalk.gray(new Date(result.started_at).toLocaleString()));
  }
  
  if (result.completed_at) {
    console.log(chalk.white('  Terminé: ') + chalk.gray(new Date(result.completed_at).toLocaleString()));
    console.log(chalk.white('  Durée: ') + chalk.gray(`${result.duration_ms}ms`));
  }

  if (result.result) {
    console.log(chalk.white('\n  Étapes complétées:'));
    for (const [step, data] of Object.entries(result.result)) {
      console.log(chalk.green('    ✓ ') + step);
    }
  }

  if (result.status === 'WAITING_HUMAN' && result.result?.actor) {
    console.log(chalk.yellow('\n  ⏸ En attente de: ') + result.result.actor);
    console.log(chalk.gray('    Décisions disponibles:'));
    for (const d of result.result.decisions || []) {
      console.log(chalk.gray(`      - ${d.label} (${d.key})`));
    }
  }

  console.log();
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'COMPLETED': return chalk.green(status);
    case 'FAILED': return chalk.red(status);
    case 'WAITING_HUMAN': return chalk.yellow(status);
    case 'RUNNING': return chalk.blue(status);
    default: return chalk.gray(status);
  }
}
