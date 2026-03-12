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
