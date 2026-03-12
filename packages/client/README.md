# Guide d'Utilisation - BPM Engine SDK

## Installation

```bash
npm install @bpm-engine/client
```

## Utilisation Simple

### 1. Configuration du client

```javascript
import { BpmClient } from '@bpm-engine/client';

const bpm = new BpmClient({
  baseUrl: 'http://localhost:3000',  // URL du moteur BPM
  apiKey: 'bpm_live_xxx',            // Clé API
  timeout: 30000                      // Timeout optionnel (30s par défaut)
});
```

### 2. Exécuter un workflow

```javascript
// Simple comme ça!
const result = await bpm.execute('demande_stage', {
  user_id: 123,
  type: 'stage',
  demande: 'Je veux faire un stage'
});

console.log(result.execution_id);  // exec-xxx
console.log(result.status);         // WAITING_HUMAN, COMPLETED, FAILED
```

### 3. Approuver ou rejeter (pour les étapes humaines)

```javascript
// Approuver
await bpm.approve('exec-xxx');

// ou rejeter
await bpm.reject('exec-xxx');
```

### 4. Vérifier le statut

```javascript
const status = await bpm.getStatus('exec-xxx');
console.log(status.status);
```

## Exemple Complet - Formulaire de Demande

```javascript
import { BpmClient } from '@bpm-engine/client';

const bpm = new BpmClient({
  baseUrl: process.env.BPM_URL,
  apiKey: process.env.BPM_API_KEY
});

async function soumettreDemande(donnees) {
  try {
    // 1. Soumettre la demande
    const result = await bpm.execute('demande_stage', {
      utilisateur: donnees.email,
      type: donnees.type,
      description: donnees.description
    });

    return {
      success: true,
      executionId: result.execution_id,
      message: 'Demande soumise avec succès!'
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

async function validerDemande(executionId, decision) {
  try {
    if (decision === 'approuver') {
      await bpm.approve(executionId);
    } else {
      await bpm.reject(executionId);
    }
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
}
```

## Avec React

```javascript
import { BpmClient, createBpmHook } from '@bpm-engine/client';

const bpm = new BpmClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'bpm_live_xxx'
});

const useBpm = createBpmHook(bpm);

function MaComposant() {
  const { execute, approve, reject, loading, error } = useBpm();

  const handleSoumettre = async () => {
    const result = await execute('demande_stage', { user_id: 1 });
    console.log('Execution ID:', result.execution_id);
  };

  const handleValider = async () => {
    await approve('exec-xxx');
  };

  return (
    <button onClick={handleSoumettre} disabled={loading}>
      Soumettre
    </button>
  );
}
```

## Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `401 Unauthorized` | Mauvaise API Key | Vérifier la clé API |
| `Workflow not found` | Type de workflow incorrect | Vérifier le type dans le registre |
| `Request timeout` | Le serveur met trop de temps | Augmenter le timeout |
| `Execution not found` | Mauvais execution_id | Vérifier l'ID d'exécution |

## Configuration pour les Devs

Les devs internes n'ont qu'à:
1. Récupérer l'API Key depuis le dashboard admin
2. Configurer l'URL du moteur BPM
3. Utiliser le SDK!

```javascript
// Fichier config.js
export const bpmConfig = {
  baseUrl: process.env.BPM_URL || 'http://localhost:3000',
  apiKey: process.env.BPM_API_KEY  // Variable d'environnement
};
```
