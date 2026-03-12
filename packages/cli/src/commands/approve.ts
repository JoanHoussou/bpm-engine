import chalk from 'chalk';
import { createApiClient } from '../api.js';

export async function approveCommand(executionId: string, options: { comment?: string }) {
  const client = createApiClient();
  
  console.log(chalk.cyan(`\n✅ Approbation de: ${executionId}\n`));

  const body: any = { decision: 'approved' };
  if (options.comment) {
    body.comment = options.comment;
    console.log(chalk.gray('  Commentaire: ') + options.comment);
  }

  try {
    const response = await client.post(`/api/v1/workflow/${executionId}/resume`, body);
    const result = response.data;

    console.log(chalk.green('  ✅ Approuvé!'));
    console.log(chalk.white('  Nouveau status: ') + getStatusColor(result.status));
    
    if (result.next_step) {
      console.log(chalk.gray('  Prochaine étape: ') + result.next_step);
    }
    
    console.log(chalk.gray('  Trace: ') + result.trace_id);
    console.log();
  } catch (err: any) {
    console.log(chalk.red(`\n❌ Erreur: ${err.message}\n`));
    process.exit(1);
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'COMPLETED': return chalk.green(status);
    case 'FAILED': return chalk.red(status);
    default: return chalk.gray(status);
  }
}
