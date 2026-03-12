# BPM Engine - Améliorations et Documentation

## Problèmes Corrigés

### 1. Support des méthodes HTTP (GET, POST, PUT, DELETE, PATCH)
**Fichier:** `src/phases/phase3-execution/AutoStepExecutor.ts`

**Problème:** Le moteur utilisait uniquement POST pour toutes les étapes automatiques.

**Solution:** Ajout du support pour toutes les méthodes HTTP:
```typescript
// Dans WorkflowStep interface (src/core/WorkflowRegistry.ts)
method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// Dans AutoStepExecutor.ts
const method = step.method || 'POST';
const fetchOptions: RequestInit = { method, ... };
```

---

## Améliorations Implémentées

### 1. Support des méthodes HTTP (GET, POST, PUT, DELETE, PATCH) ✅
**Fichier:** `src/phases/phase3-execution/AutoStepExecutor.ts`

Ajout du support pour toutes les méthodes HTTP.

### 2. Headers personnalisés ✅
**Fichier:** `src/core/WorkflowRegistry.ts`

Permettre d'ajouter des headers personnalisés dans les steps:
```typescript
interface WorkflowStep {
  // ... existing fields
  headers?: Record<string, string>;
}
```

**Exemple d'utilisation:**
```json
{
  "name": "call_api",
  "type": "auto",
  "method": "GET",
  "url": "/api/data",
  "headers": {
    "X-Custom-Header": "value",
    "Accept": "application/json"
  }
}
```

### 3. Authentification pour les appels HTTP ✅
**Fichier:** `src/phases/phase3-execution/AutoStepExecutor.ts`

Le moteur peut maintenant authentifier automatiquement les appels HTTP:
```typescript
interface WorkflowStep {
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'api_key' | 'client_credentials';
    token?: string;
    username?: string;
    password?: string;
    api_key_name?: string;
    api_key_header?: string;
    token_url?: string;
    client_id?: string;
    client_secret?: string;
    scope?: string;
  };
}
```

**Exemples d'utilisation:**

```json
// Bearer Token
{
  "name": "call_with_bearer",
  "type": "auto",
  "method": "GET",
  "url": "/api/protected",
  "auth": {
    "type": "bearer",
    "token": "your-token-here"
  }
}
```

```json
// Basic Auth
{
  "name": "call_with_basic",
  "type": "auto",
  "method": "POST",
  "url": "/api/login",
  "auth": {
    "type": "basic",
    "username": "user",
    "password": "pass"
  }
}
```

```json
// API Key
{
  "name": "call_with_api_key",
  "type": "auto",
  "method": "GET",
  "url": "/api/data",
  "auth": {
    "type": "api_key",
    "api_key_name": "your-api-key",
    "api_key_header": "X-API-Key"
  }
}
```

**Note:** Pour l'authentification API Key, vous pouvez utiliser:
- `token`: la valeur de la clé
- `api_key_name`: alias pour `token`
- `api_key_header`: le nom du header (défaut: `X-API-Key`)

**Support des variables dans les URLs:**
Le moteur supporte maintenant les syntaxes suivantes dans les URLs:
```json
{
  "url": "/users/{$.payload.user_id}/demands/{$.payload.demand_id}/validate"
}
```

Les variables supportées:
- `{execution_id}` - ID de l'exécution
- `{trace_id}` - ID du trace
- `{type}` - Type du workflow
- `{$.payload.field}` - Champs du payload
- `{$.results.step_name.data.field}` - Résultats des étapes précédentes

```json
// OAuth 2.0 Client Credentials
{
  "name": "call_with_oauth",
  "type": "auto",
  "method": "GET",
  "url": "/api/oauth-protected",
  "auth": {
    "type": "client_credentials",
    "token_url": "https://oauth.example.com/token",
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "scope": "read write"
  }
}
```

---

## Améliorations Implémentées

### 4. Retry automatique avec stratégies configurables ✅
**Fichier:** `src/phases/phase3-execution/AutoStepExecutor.ts`

Trois stratégies de retry disponibles:
- `fixed`: Délai constant
- `exponential`: Délai double à chaque tentative (défaut)
- `linear`: Délai augmente linéairement

```json
{
  "name": "api_call",
  "type": "auto",
  "method": "GET",
  "url": "/api/data",
  "retry": 3,
  "retry_delay_ms": 1000,
  "retry_strategy": "exponential",
  "max_retry_delay_ms": 30000
}
```

### 5. Variables d'environnement pour configuration ✅
**Fichier:** `src/config.ts`

Toutes les options configurables:
```bash
# Serveur
BPM_PORT=3000
BPM_HOST=localhost

# Base de données
DATABASE_URL=postgresql://user:pass@localhost:5432/bpm_engine

# Redis
REDIS_URL=redis://localhost:6379

# Sécurité
BPM_ADMIN_SECRET=votre-secret-admin
BPM_JWT_SECRET=votre-secret-jwt
BPM_API_KEY_PREFIX=bpm_live_

# Workflows
BPM_DEFAULT_TIMEOUT_MS=30000
BPM_DEFAULT_RETRY=3
BPM_DEFAULT_RETRY_DELAY_MS=1000
BPM_DEFAULT_RETRY_STRATEGY=exponential

# Queue
BPM_QUEUE_CONCURRENCY=10
BPM_QUEUE_MAX_RETRIES=5
```

---

## Améliorations à Faire

### 5. Middleware d'authentification simplifié ✅
Déjà implémenté dans le moteur actuel.

### 6. Webhook de callback structuré ✅
**Fichiers:** 
- `src/types/callback.types.ts` - Types TypeScript
- `src/services/CallbackService.ts` - Service de callback

Le moteur envoie maintenant des payloads structurés aux webhooks.

### 7. Dashboard d'administration ✅
Le dashboard existant inclut toutes les fonctionnalités.

---

## Guide d'Intégration

### Option 1: Utiliser le SDK Client (Recommandé)

```bash
npm install @bpm-engine/client
```

```javascript
import { BpmClient } from '@bpm-engine/client';

const bpm = new BpmClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'bpm_live_xxx'
});

// Exécuter un workflow
const result = await bpm.execute('demande_stage', { user_id: 123 });

// Approuver
await bpm.approve(executionId);

// Rejeter
await bpm.reject(executionId);
```

### Option 2: API REST directe

```bash
curl -X POST http://localhost:3000/api/v1/workflow/execute \
  -H "Authorization: Bearer bpm_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "demande_stage",
    "payload": { "user_id": 123 }
  }'
```

### Option 3: Intégration Backend (Spring Boot, etc.)

Voir la section "Projet Existant" ci-dessous.

1. **Installer le moteur:**
```bash
npm install bpm-engine
# ou
docker pull bpm-engine:latest
```

2. **Configurer:**
```typescript
// config.ts
export const config = {
  port: process.env.BPM_PORT || 3000,
  adminSecret: process.env.BPM_ADMIN_SECRET,
  prisma: {
    // configuration base de données
  }
};
```

3. **Démarrer:**
```typescript
import { startEngine } from 'bpm-engine';
startEngine(config);
```

### Projet Existant

1. **Ajouter comme microservice:**
   - Déployer le BPM Engine séparément
   - Communiquer via API REST

2. **Intégration Backend:**
```typescript
// Appel depuis votre backend
const response = await fetch('http://bpm-engine:3000/api/v1/workflow/execute', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${BPM_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'mon_workflow',
    payload: { ... }
  })
});
```

3. **Callbacks:**
```typescript
// Votre endpoint de callback
app.post('/bpm/callback', async (req, res) => {
  const { execution_id, step_name, decision } = req.body;
  // Traiter le callback
});
```

---

## Exemple de Workflow

```json
{
  "type": "approval_request",
  "version": "1.0.0",
  "base_url": "https://api.monprojet.com",
  "steps": [
    {
      "name": "create_request",
      "type": "auto",
      "method": "POST",
      "url": "/requests",
      "timeout_ms": 10000,
      "retry": 2
    },
    {
      "name": "human_approval",
      "type": "human",
      "actor": "manager@entreprise.com",
      "action_url": "/bpm/callback",
      "timeout_hours": 48,
      "decisions": [
        { "key": "approved", "label": "Approuver", "next": "notify_approval" },
        { "key": "rejected", "label": "Rejeter", "next": "notify_rejection" }
      ]
    },
    {
      "name": "notify_approval",
      "type": "auto",
      "method": "POST",
      "url": "/notifications",
      "timeout_ms": 5000
    }
  ],
  "on_complete": {
    "callback_url": "/bpm/complete"
  }
}
```

---

## Commandes Utiles

```bash
# Démarrer le moteur
npm run dev

# Construire pour production
npm run build

# Lancer les tests
npm test

# Lancer avec Docker
docker-compose up -d

# Créer un client
curl -X POST http://localhost:3000/admin/api/clients \
  -H "X-Admin-Secret: ${ADMIN_SECRET}" \
  -d '{"name": "mon-app"}'

# Exécuter un workflow
curl -X POST http://localhost:3000/api/v1/workflow/execute \
  -H "Authorization: Bearer ${API_KEY}" \
  -d '{"type": "approval_request", "payload": {...}}'
```

---

## Dépannage

### Erreur: "Unexpected end of JSON input"
- Vérifier que le endpoint retourne du JSON valide
- Augmenter le timeout: `timeout_ms: 180000`

### Erreur: "Connection timeout"
- Vérifier que le service backend est joignable
- Vérifier les règles de firewall

### Erreur: "401 Unauthorized"
- Vérifier l'API Key du client
- Vérifier que le client a le scope `workflow:execute`

---

## Roadmap

- [ ] Support des variables d'environnement pour la configuration
- [ ] Dashboard d'administration visuel
- [ ] Support des websockets pour les notifications en temps réel
- [ ] Plugin system pour extensions
- [ ] Support de GraphQL
- [ ] Tests de performance et charge
