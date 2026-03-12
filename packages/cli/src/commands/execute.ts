import chalk from 'chalk';
import { createApiClient } from '../api.js';

export async function executeCommand(type: string, payloadArg: string | undefined, options: { json?: boolean }) {
  const client = createApiClient();

  let payload: Record<string, any> = {};
  
  if (payloadArg) {
    try {
      payload = JSON.parse(payloadArg);
    } catch {
      console.log(chalk.red('❌ Payload JSON invalide'));
      process.exit(1);
    }
  }

  console.log(chalk.cyan(`\n▶ Exécution du workflow: ${type}\n`));
  
  if (Object.keys(payload).length > 0) {
    console.log(chalk.gray('  Payload: ') + JSON.stringify(payload));
  }

  try {
    const response = await client.post('/api/v1/workflow/execute', {
      type,
      payload
    });

    const result = response.data;

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(chalk.green('  ✅ Exécution démarrée!'));
    console.log(chalk.white('  Execution ID: ') + chalk.yellow(result.execution_id));
    console.log(chalk.white('  Status: ') + getStatusColor(result.status));
    console.log(chalk.gray('  Trace: ') + result.trace_id);
    console.log();

    if (result.status === 'WAITING_HUMAN') {
      console.log(chalk.yellow('  ⏸ En attente d\'approbation humaine'));
      console.log(chalk.gray('    Pour approuver: ') + chalk.cyan(`bpm approve ${result.execution_id}`));
      console.log(chalk.gray('    Pour rejeter: ') + chalk.cyan(`bpm reject ${result.execution_id}`));
      console.log();
    }
  } catch (err: any) {
    console.log(chalk.red(`\n❌ Erreur: ${err.message}\n`));
    process.exit(1);
  }
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
