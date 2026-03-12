import chalk from 'chalk';
import { createApiClient } from '../api.js';

export async function listCommand(options: { json?: boolean }) {
  const client = createApiClient();
  
  const response = await client.get('/api/v1/registry');
  const workflows = response.data.workflows;

  if (options.json) {
    console.log(JSON.stringify(workflows, null, 2));
    return;
  }

  console.log(chalk.cyan('\n📋 Workflows disponibles:\n'));
  console.log(
    '  ' + chalk.gray('─'.repeat(50))
  );
  console.log(
    chalk.white('  Type') + chalk.gray(' '.repeat(30)) + 'Version  Étapes'
  );
  console.log(
    chalk.gray('─'.repeat(50))
  );

  for (const wf of workflows) {
    const type = wf.type.padEnd(30);
    const version = (wf.version || '1.0.0').padEnd(8);
    const steps = wf.steps_count;
    console.log(`  ${chalk.white(type)} ${chalk.gray(version)} ${chalk.yellow(steps)}`);
  }

  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.green(`\n✓ Total: ${workflows.length} workflows\n`));
}
