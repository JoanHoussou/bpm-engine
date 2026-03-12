import chalk from 'chalk';
import { createApiClient } from '../api.js';

export async function schemaCommand(type: string, options: { json?: boolean }) {
  const client = createApiClient();
  
  const response = await client.get(`/api/v1/registry/${type}/schema`);
  const schema = response.data;

  if (options.json) {
    console.log(JSON.stringify(schema, null, 2));
    return;
  }

  console.log(chalk.cyan(`\n📝 Schéma du workflow: ${type}\n`));

  console.log(chalk.white('  Version: ') + chalk.gray(schema.version));
  
  console.log(chalk.white('\n  Champs requis:'));
  if (schema.required_payload_fields?.length > 0) {
    for (const field of schema.required_payload_fields) {
      console.log(chalk.red('    • ') + field);
    }
  } else {
    console.log(chalk.gray('    (aucun)'));
  }

  console.log(chalk.white('\n  Champs optionnels:'));
  if (schema.optional_payload_fields?.length > 0) {
    for (const field of schema.optional_payload_fields) {
      console.log(chalk.gray('    • ') + field);
    }
  } else {
    console.log(chalk.gray('    (aucun)'));
  }

  console.log(chalk.white('\n  Étapes humaines:'));
  if (schema.human_steps?.length > 0) {
    for (const step of schema.human_steps) {
      console.log(chalk.yellow(`    ◆ ${step.step}`));
      console.log(chalk.gray(`      Acteur: `) + step.actor);
      console.log(chalk.gray(`      Timeout: `) + `${step.timeout_hours}h`);
      if (step.decisions) {
        console.log(chalk.gray(`      Décisions: `) + step.decisions.join(', '));
      }
    }
  } else {
    console.log(chalk.gray('    (aucune)'));
  }

  console.log(chalk.white('\n  Exemple de payload:'));
  console.log(chalk.gray('    ') + JSON.stringify(schema.example_payload, null, 2).replace(/\n/g, '\n    '));

  console.log();
}
