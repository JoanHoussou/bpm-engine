# Guide d'Intégration BPM Engine - Pour les Développeurs

## Introduction

Le BPM Engine permet d'automatiser vos processus métier avec des workflows. Ce guide explique comment l'intégrer dans votre application selon votre langage de programmation.

---

## Option 1: Java / Spring Boot

### Installation

Copiez le fichier `BpmClient.java` dans votre projet:

```
src/main/java/com/votreprojet/bpm/BpmClient.java
```

Aucune dépendance supplémentaire requise (Jackson est inclus dans Spring Boot).

### Configuration

**application.properties:**
```properties
bpm.engine.url=http://localhost:3000
bpm.engine.api-key=votre_api_key
```

**BpmConfig.java:**
```java
package com.votreprojet.config;

import com.votreprojet.bpm.BpmClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BpmConfig {

    @Value("${bpm.engine.url}")
    private String bpmUrl;

    @Value("${bpm.engine.api-key}")
    private String bpmApiKey;

    @Bean
    public BpmClient bpmClient() {
        return new BpmClient(bpmUrl, bpmApiKey);
    }
}
```

### Utilisation

```java
@Autowired
private BpmClient bpmClient;

// Exécuter un workflow
ExecutionResult result = bpmClient.execute("nom_workflow", 
    Map.of("champ1", "valeur1", "champ2", "valeur2"));

String executionId = result.getExecutionId();

// Obtenir le statut
String status = bpmClient.getStatus(executionId).getStatus();

// Approuver
bpmClient.approve(executionId, "Commentaire optionnel");

// Rejeter
bpmClient.reject(executionId, "Raison du rejet");
```

### Obtenir le schéma d'un workflow

```java
WorkflowSchema schema = bpmClient.getSchema("nom_workflow");
System.out.println(schema.getRequiredFields());  // ["n1_email", "n2_email"]
System.out.println(schema.getHumanSteps());       // Étapes humaines
System.out.println(schema.getExamplePayload());   // Exemple de payload
```

---

## Option 2: Python (Flask/Django/FastAPI)

### Installation

```bash
pip install requests
```

Ou utilisez le client BPM fourni dans `packages/client/python/bpm_client.py`.

### Configuration

```python
from bpm_client import BpmClient

bpm = BpmClient(
    base_url="http://localhost:3000",
    api_key="votre_api_key"
)
```

### Utilisation

```python
# Exécuter un workflow
result = bpm.execute("nom_workflow", {
    "champ1": "valeur1",
    "champ2": "valeur2"
})

execution_id = result["execution_id"]

# Obtenir le statut
status = bpm.get_status(execution_id)

# Approuver
bpm.approve(execution_id, "Commentaire optionnel")

# Rejeter  
bpm.reject(execution_id, "Raison du rejet")

# Obtenir le schéma
schema = bpm.get_schema("nom_workflow")
print(schema["required_payload_fields"])  # ["n1_email", "n2_email"]
```

### Gestion des erreurs

```python
from bpm_client import BpmClientError

try:
    result = bpm.execute("workflow", {"champ": "valeur"})
except BpmClientError as e:
    print(f"Erreur: {e.message}")  # [401] Invalid key (trace: xxx)
```

---

## Option 3: CLI (Terminal) - Tous langages

Le CLI fonctionne sur n'importe quelle machine avec Node.js:

```bash
# Installation
npm install -g bpm-engine-cli

# Configuration
bpm init
# URL: http://localhost:3000
# API Key: votre_api_key

# Commandes
bpm list                           # Liste workflows
bpm schema workflow_name            # Voir schéma
bpm execute workflow_name '{"champ":"valeur"}'  # Exécuter
bpm status execution_id            # Statut
bpm approve execution_id            # Approuver
bpm reject execution_id             # Rejeter
bpm create workflow.json            # Créer workflow
```

---

## Option 4: Java avec JitPack

Ajoutez cette dépendance dans votre `pom.xml`:

```xml
<dependency>
    <groupId>com.github.JoanHoussou</groupId>
    <artifactId>bpm-engine</artifactId>
    <version>1.0.0</version>
</dependency>
```

**Attention:** Cette dépendance inclut tout le projet. Pour une version légère, copiez uniquement `BpmClient.java` dans votre projet.

---

## Option 5: Via API REST (tous langages)

Vous pouvez appeler l'API directement avec votre langage:

```bash
# Exécuter un workflow
curl -X POST http://localhost:3000/api/v1/workflow/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer votre_api_key" \
  -d '{"type":"nom_workflow","payload":{"champ":"valeur"}}'
```

---

## Exemple Complet: Demande de Stage

### 1. Voir le schéma du workflow

```bash
bpm schema internship_request
```

Résultat:
```
  Champs requis:
    • n1_email
    • n2_email

  Étapes humaines:
    ◆ approval-n1
      Timeout: 48h
      Décisions: Approuver, Refuser
```

### 2. Exécuter le workflow

```bash
bpm execute internship_request '{"n1_email":"superviseur@bridgebankgroup.com","n2_email":"manager@bridgebankgroup.com"}'
```

### 3. Suivre le statut

```bash
bpm status exec-xxx
```

### 4. Approuver ou rejeter

```bash
bpm approve exec-xxx -c "Demande validée"
# ou
bpm reject exec-xxx -c "Documents incomplets"
```

---

## Comment obtenir votre API Key?

1. Connectez-vous au dashboard BPM: `http://localhost:3000/admin/`
2. Allez dans l'onglet **"Clients"**
3. Créez un nouveau client ou sélectionnez un client existant
4. Copiez la clé API

---

## Comment connaître les workflows disponibles?

### Via API

```bash
curl -H "Authorization: Bearer votre_api_key" \
  http://localhost:3000/api/v1/registry
```

### Via CLI

```bash
bpm list
```

---

## Comment exécuter un workflow?

### 1. Récupérer le schéma

```bash
bpm schema internship_request
```

Résultat:
```
  Champs requis:
    • n1_email
    • n2_email

  Étapes humaines:
    ◆ approval-n1
      Timeout: 48h
      Décisions: Approuver, Refuser
```

### 2. Exécuter avec les bons champs

```bash
bpm execute internship_request '{"n1_email":"superviseur@entreprise.com","n2_email":"manager@entreprise.com"}'
```

### 3. Suivre le statut

```bash
bpm status exec-xxx
```

---

## Authentification & Sécurité

### Durée de vie des API Keys

- Les API keys n'expirent pas par défaut
- Pour sécurité, créez des clients dédiés par application
- En cas de compromission, supprimez la clé depuis le dashboard

### Bonnes pratiques

**NE JAMAIS:**
- ❌ Exposer la clé dans le code source
- ❌ Exposer la clé dans les logs
- ❌ Exposer la clé dans des URLs publiques

**TOUJOURS:**
- ✅ Utiliser des variables d'environnement
- ✅ Stocker dans un vault/secret manager
- ✅ Restreindre les permissions par client

### Variables d'environnement

```bash
# .env
BPM_URL=http://localhost:3000
BPM_API_KEY=votre_api_key
```

```java
// Java
@Value("${BPM_URL:http://localhost:3000}")
private String bpmUrl;

@Value("${BPM_API_KEY}")
private String bpmApiKey;
```

```python
# Python
import os
bpm = BpmClient(
    base_url=os.environ.get("BPM_URL", "http://localhost:3000"),
    api_key=os.environ["BPM_API_KEY"]
)
```

### Gestion des tokens expirés

Le client retourne une erreur claire en cas de clé invalide:

```java
// Java
try {
    result = bpmClient.execute("workflow", payload);
} catch (RuntimeException e) {
    if (e.getMessage().contains("[401]")) {
        // Clé expirée ou invalide
        // -> Contacter l'admin pour nouvelle clé
    }
}
```

```bash
# CLI
$ bpm list
Erreur: [401] Invalid key format (trace: xxx)
```

---

## Gestion des Erreurs

### Codes d'erreur HTTP

| Code | Signification | Action |
|------|--------------|--------|
| 400 | Requête invalide | Vérifier le payload |
| 401 | Clé API invalide/expired | Obtenir une nouvelle clé |
| 403 | Permissions insuffisantes | Vérifier les scopes du client |
| 404 | Workflow ou exécution non trouvée | Vérifier l'ID |
| 429 | Trop de requêtes | Patienter et réessayer |
| 500 | Erreur serveur interne | Contacter l'administrateur |

### Java - Gestion d'erreurs

```java
try {
    ExecutionResult result = bpmClient.execute("workflow", payload);
} catch (RuntimeException e) {
    String message = e.getMessage();
    
    if (message.contains("[401]")) {
        // Clé invalide
        throw new RuntimeException("API Key invalide. Veuillez contacter l'administrateur.");
    } else if (message.contains("[404]")) {
        // Workflow non trouvé
        throw new RuntimeException("Workflow non trouvé: " + message);
    } else if (message.contains("Connection")) {
        // Problème de connexion
        throw new RuntimeException("Impossible de se connecter au serveur BPM");
    } else {
        throw new RuntimeException("Erreur BPM: " + message);
    }
}
```

### CLI - Gestion d'erreurs

```bash
$ bpm execute workflow '{}'
Erreur: [404] Workflow type "workflow" not found (trace: xxx)
# -> Vérifier le nom du workflow avec: bpm list

$ bpm status exec-xxx
Erreur: [401] Invalid key (trace: xxx)
# -> Vérifier la clé avec: bpm init

$ bpm approve exec-xxx
Erreur: [403] Insufficient scope: workflow:resume required
# -> Demander le scope "resume" à l'admin
```

### Stratégies de retry

**Java:**
```java
int maxRetries = 3;
int delayMs = 1000;

for (int i = 0; i < maxRetries; i++) {
    try {
        return bpmClient.execute(type, payload);
    } catch (RuntimeException e) {
        if (i == maxRetries - 1) throw e;
        if (e.getMessage().contains("[5")) {
            Thread.sleep(delayMs * (i + 1)); // Exponential backoff
        }
    }
}
```

**Python:**
```python
import time

max_retries = 3
for i in range(max_retries):
    try:
        return bpm.execute("workflow", payload)
    except BpmClientError as e:
        if i == max_retries - 1 or "[5" not in str(e):
            raise
        time.sleep(1 * (i + 1))  # Exponential backoff
```

---

##Environnements

### Configuration par environnement

```bash
# Développement
bpm init
# URL: http://localhost:3000

# Staging
bpm init
# URL: https://bpm-staging.votreentreprise.com

# Production
bpm init  
# URL: https://bpm.votreentreprise.com
```

### Java - Profils Spring

```properties
# application-dev.properties
bpm.engine.url=http://localhost:3000
bpm.engine.api-key=dev_key_xxx

# application-prod.properties
bpm.engine.url=https://bpm.votreentreprise.com
bpm.engine.api-key=prod_key_xxx
```

Activez avec:
```bash
java -jar app.jar --spring.profiles.active=prod
```

### Production - SSL/HTTPS

**OBLIGATOIRE en production:**
- Utilisez HTTPS uniquement
- Désactivez HTTP
- Validez le certificat SSL

```bash
# Vérifier le certificat
curl -v https://bpm.votreentreprise.com/health
```

---

## Lifecycle Complet d'un Workflow

### Statuts possibles

| Statut | Description |
|---------|-------------|
| `QUEUED` | En attente de traitement |
| `RUNNING` | En cours d'exécution |
| `WAITING_HUMAN` | En attente d'une action humaine (approbation/rejet) |
| `COMPLETED` | Terminé avec succès |
| `FAILED` | Échec (erreur ou rejected) |
| `CANCELLED` | Annulé par l'utilisateur |

### Timeout des étapes humaines

Quand une étape humaine timeout:

1. **Si `on_timeout: escalate`** → La demande est escaladée vers `escalate_to`
2. **Si `on_timeout: auto_approve`** → Approbation automatique
3. **Si `on_timeout: reject`** → Rejet automatique

Exemple de configuration:
```json
{
  "name": "approval",
  "type": "human",
  "actor": "$.payload.n1_email",
  "timeout_hours": 48,
  "on_timeout": "escalate",
  "escalate_to": "$.payload.n2_email",
  "reminder_hours": [24, 40]
}
```

---

## Option REST - Exemples Complets

### Exécuter un workflow

```bash
curl -X POST http://localhost:3000/api/v1/workflow/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer votre_api_key" \
  -d '{
    "type": "internship_request",
    "payload": {
      "n1_email": "superviseur@entreprise.com",
      "n2_email": "manager@entreprise.com"
    }
  }'
```

### Obtenir le statut

```bash
curl http://localhost:3000/api/v1/workflow/exec-xxx \
  -H "Authorization: Bearer votre_api_key"
```

### Approuver une étape (POST body)

```bash
curl -X POST http://localhost:3000/api/v1/workflow/exec-xxx/resume \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer votre_api_key" \
  -d '{
    "decision": "approved",
    "comment": "Demande validée"
  }'
```

### Rejeter une étape

```bash
curl -X POST http://localhost:3000/api/v1/workflow/exec-xxx/resume \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer votre_api_key" \
  -d '{
    "decision": "rejected",
    "comment": "Documents incomplets"
  }'
```

### Annuler une exécution

```bash
curl -X POST http://localhost:3000/api/v1/workflow/exec-xxx/cancel \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer votre_api_key" \
  -d '{}'
```

---

## JavaScript / Node.js

### Via fetch (natif)

```javascript
const BPM_URL = process.env.BPM_URL || 'http://localhost:3000';
const BPM_API_KEY = process.env.BPM_API_KEY;

async function executeWorkflow(type, payload) {
    const response = await fetch(`${BPM_URL}/api/v1/workflow/execute`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${BPM_API_KEY}`
        },
        body: JSON.stringify({ type, payload })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`[${response.status}] ${error.error?.error || error.message}`);
    }
    
    return response.json();
}

async function approve(executionId, comment) {
    const response = await fetch(`${BPM_URL}/api/v1/workflow/${executionId}/resume`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${BPM_API_KEY}`
        },
        body: JSON.stringify({ decision: 'approved', comment })
    });
    
    return response.json();
}
```

### Via axios

```javascript
import axios from 'axios';

const bpm = axios.create({
    baseURL: process.env.BPM_URL || 'http://localhost:3000',
    headers: {
        'Authorization': `Bearer ${process.env.BPM_API_KEY}`
    }
});

const result = await bpm.post('/workflow/execute', {
    type: 'workflow_name',
    payload: { champ: 'valeur' }
});
```

---

## PHP

```php
<?php

class BpmClient {
    private $baseUrl;
    private $apiKey;
    
    public function __construct($baseUrl, $apiKey) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->apiKey = $apiKey;
    }
    
    private function request($method, $endpoint, $data = null) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->baseUrl . $endpoint);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->apiKey
        ]);
        
        if ($data) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode >= 400) {
            $error = json_decode($response, true);
            throw new Exception($error['error']['error'] ?? $response);
        }
        
        return json_decode($response, true);
    }
    
    public function execute($type, $payload) {
        return $this->request('POST', '/api/v1/workflow/execute', [
            'type' => $type,
            'payload' => $payload
        ]);
    }
    
    public function approve($executionId, $comment = null) {
        return $this->request('POST', "/api/v1/workflow/{$executionId}/resume", [
            'decision' => 'approved',
            'comment' => $comment
        ]);
    }
    
    public function reject($executionId, $comment = null) {
        return $this->request('POST', "/api/v1/workflow/{$executionId}/resume", [
            'decision' => 'rejected',
            'comment' => $comment
        ]);
    }
    
    public function getStatus($executionId) {
        return $this->request('GET', "/api/v1/workflow/{$executionId}");
    }
}

// Utilisation
$bpm = new BpmClient('http://localhost:3000', 'votre_api_key');
$result = $bpm->execute('internship_request', [
    'n1_email' => 'superviseur@entreprise.com',
    'n2_email' => 'manager@entreprise.com'
]);
echo $result['execution_id'];
```

---

## Création de Workflow

### Format du fichier JSON

Créez un fichier `workflow.json`:

```json
{
  "type": "demande_conge",
  "version": "1.0.0",
  "base_url": "https://httpbin.org",
  "steps": [
    {
      "name": "check-solde",
      "type": "auto",
      "url": "/post",
      "method": "POST",
      "timeout_ms": 5000,
      "retry": 2,
      "retry_strategy": "exponential"
    },
    {
      "name": "validation_n1",
      "type": "human",
      "actor": "$.payload.superviseur_email",
      "decisions": [
        {
          "key": "approved",
          "next": "notification",
          "label": "Approuver"
        },
        {
          "key": "rejected",
          "next": "rejet",
          "label": "Rejeter"
        }
      ],
      "timeout_hours": 48,
      "on_timeout": "escalate",
      "escalate_to": "$.payload.drh_email",
      "reminder_hours": [24, 40]
    },
    {
      "name": "notification",
      "type": "auto",
      "url": "/post",
      "method": "POST"
    },
    {
      "name": "rejet",
      "type": "auto",
      "url": "/post",
      "method": "POST",
      "status": "REJECTED"
    }
  ],
  "on_complete": {
    "callback_url": "https://mon-app.com/webhook/bpm"
  },
  "on_failure": {
    "strategy": "abort",
    "callback_url": "https://mon-app.com/webhook/error"
  }
}
```

### Déployer le workflow

```bash
bpm create workflow.json
```

### Types d'étapes

| Type | Description |
|------|-------------|
| `auto` | Étape automatique (appel HTTP) |
| `human` | Étape nécessitant une action humaine |
| `condition` | Branchement conditionnel |
| `parallel` | Exécution parallèle de plusieurs steps |

### Options des étapes

```json
{
  "name": "nom_step",
  "type": "auto",
  "url": "https://api.externe.com/endpoint",
  "method": "POST",
  "headers": {
    "X-Custom-Header": "valeur"
  },
  "auth": {
    "type": "bearer",
    "token": "$.env.API_TOKEN"
  },
  "timeout_ms": 10000,
  "retry": 3,
  "retry_delay_ms": 1000,
  "retry_strategy": "exponential",
  "on_failure": "abort"
}
```

---

## Résumé des endpoints API

| Action | Endpoint | Méthode |
|--------|----------|---------|
| Lister workflows | `/api/v1/registry` | GET |
| Schéma workflow | `/api/v1/registry/{type}/schema` | GET |
| Exécuter | `/api/v1/workflow/execute` | POST |
| Statut | `/api/v1/workflow/{id}` | GET |
| Approuver/Rejeter | `/api/v1/workflow/{id}/resume` | POST |
| Annuler | `/api/v1/workflow/{id}/cancel` | POST |
| Créer workflow | `/api/v1/registry/register` | POST |

---

## Besoin d'aide?

Consultez la documentation complète dans `IMPROVEMENTS.md` ou contactez l'administrateur BPM.
