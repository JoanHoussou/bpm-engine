import inquirer from 'inquirer';
import chalk from 'chalk';
import { saveConfig } from '../config.js';

export async function initCommand() {
  console.log(chalk.cyan('\n🔧 Configuration du CLI BPM Engine\n'));
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: 'URL du serveur BPM:',
      default: 'http://localhost:3000',
      validate: (input: string) => {
        if (!input.startsWith('http://') && !input.startsWith('https://')) {
          return 'L\'URL doit commencer par http:// ou https://';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'apiKey',
      message: 'API Key:',
      validate: (input: string) => {
        if (!input || input.length < 10) {
          return 'Veuillez entrer une API Key valide';
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'test',
      message: 'Voulez-vous tester la connexion?',
      default: true
    }
  ]);

  saveConfig({
    url: answers.url.replace(/\/$/, ''),
    apiKey: answers.apiKey
  });

  console.log(chalk.green('\n✅ Configuration enregistrée!\n'));

  if (answers.test) {
    const { default: axios } = await import('axios');
    try {
      const response = await axios.get(`${answers.url}/api/v1/registry`, {
        headers: { Authorization: `Bearer ${answers.apiKey}` },
        timeout: 10000
      });
      console.log(chalk.green(`✅ Connexion OK! ${response.data.count} workflows disponibles.\n`));
    } catch (err: any) {
      console.log(chalk.red(`❌ Erreur de connexion: ${err.message}\n`));
    }
  }
}
