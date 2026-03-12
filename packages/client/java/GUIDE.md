# Guide d'Intégration BPM Engine - Java

## Introduction

### Qu'est-ce que BPM Engine?

BPM Engine est un moteur de workflows qui permet d'automatiser vos processus métier. Il gère:
- L'exécution de workflows (suite d'étapes automatisées)
- Les validations humaines (approbation/rejet)
- Les retries automatiques en cas d'échec
- Les notifications et callbacks

### À quoi sert le BPM Client?

Le **BPM Client** est une bibliothèque Java qui permet à votre application de communiquer facilement avec le moteur BPM. Sans ce client, vous devriez:
- Faire des appels HTTP manuels
- Gérer l'authentification
- Gérer les erreurs
- Sérialiser/désérialiser le JSON

**Avec le client, c'est simple comme:**
```java
bpm.execute("demande_stage", Map.of("user_id", 123));
```

---

## Installation

### Étape 1: Récupérer le fichier

Copiez le fichier `BpmClient.java` dans votre projet.

**Emplacement recommandé:**
```
src/main/java/com/bpmengine/client/BpmClient.java
```

### Étape 2: Aucune dépendance supplémentaire!

Le client utilise uniquement **Jackson** (déjà inclus dans Spring Boot).

Si vous avez Spring Boot, vous n'avez rien à ajouter dans votre `pom.xml`.

---

## Configuration

### Option A: Utilisation directe (Sans Spring)

```java
public class MonService {
    
    private BpmClient bpm;
    
    public MonService() {
        // Initialiser le client
        this.bpm = new BpmClient(
            "http://localhost:3000",  // URL du moteur BPM
            "bpm_live_xxx"            // Votre clé API
        );
    }
}
```

### Option B: Intégration Spring Boot (Recommandée)

#### 1. Créez la configuration

```java
// src/main/java/com/votreprojet/config/BpmConfig.java

package com.votreprojet.config;

import com.bpmengine.client.BpmClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BpmConfig {

    @Value("${bpm.engine.url:http://localhost:3000}")
    private String bpmUrl;

    @Value("${bpm.engine.api-key}")
    private String bpmApiKey;

    @Bean
    public BpmClient bpmClient() {
        return new BpmClient(bpmUrl, bpmApiKey);
    }
}
```

#### 2. Configurez les propriétés

```properties
# src/main/resources/application.properties

# URL du moteur BPM
bpm.engine.url=http://localhost:3000

# Clé API (obtenue depuis le dashboard admin)
bpm.engine.api-key=bpm_live_votre_cle_api
```

---

## Utilisation

### Exécuter un workflow

```java
@Autowired
private BpmClient bpmClient;

public String soumettreDemande(Long utilisateurId, String type, String description) {
    try {
        // Exécuter le workflow
        BpmClient.ExecutionResult result = bpmClient.execute(
            "demande_stage",                              // Type du workflow
            Map.of(
                "utilisateur_id", utilisateurId,
                "type", type,
                "description", description
            )
        );
        
        System.out.println("Execution ID: " + result.getExecutionId());
        System.out.println("Status: " + result.getStatus());
        
        return result.getExecutionId();
        
    } catch (Exception e) {
        throw new RuntimeException("Erreur BPM: " + e.getMessage());
    }
}
```

### Approuver une demande

```java
public void approuver(String executionId) {
    try {
        bpmClient.approve(executionId);
        System.out.println("Demande approuvée!");
    } catch (Exception e) {
        throw new RuntimeException("Erreur: " + e.getMessage());
    }
}
```

### Rejeter une demande

```java
public void rejeter(String executionId) {
    try {
        bpmClient.reject(executionId);
        System.out.println("Demande rejetée!");
    } catch (Exception e) {
        throw new RuntimeException("Erreur: " + e.getMessage());
    }
}
```

### Vérifier le statut

```java
public String getStatut(String executionId) {
    try {
        BpmClient.ExecutionResult result = bpmClient.getStatus(executionId);
        return result.getStatus();  // QUEUED, RUNNING, WAITING_HUMAN, COMPLETED, FAILED
    } catch (Exception e) {
        throw new RuntimeException("Erreur: " + e.getMessage());
    }
}
```

---

## Exemple Complet: Service de Demandes

```java
package com.votreprojet.service;

import com.bpmengine.client.BpmClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class DemandeService {

    @Autowired
    private BpmClient bpmClient;

    /**
     * Soumettre une nouvelle demande de stage
     */
    public String soumettreDemandeStage(Map<String, Object> donnees) {
        try {
            BpmClient.ExecutionResult result = bpmClient.execute(
                "demande_stage",
                Map.of(
                    "utilisateur_id", donnees.get("utilisateur_id"),
                    "type", donnees.get("type"),
                    "description", donnees.get("description"),
                    "date_debut", donnees.get("date_debut"),
                    "duree", donnees.get("duree")
                )
            );
            
            return result.getExecutionId();
            
        } catch (Exception e) {
            throw new RuntimeException("Échec de soumission: " + e.getMessage());
        }
    }

    /**
     * Valider une demande (approuver)
     */
    public void valider(String executionId) {
        try {
            bpmClient.approve(executionId);
        } catch (Exception e) {
            throw new RuntimeException("Échec de validation: " + e.getMessage());
        }
    }

    /**
     * Rejeter une demande
     */
    public void rejeter(String executionId) {
        try {
            bpmClient.reject(executionId);
        } catch (Exception e) {
            throw new RuntimeException("Échec du rejet: " + e.getMessage());
        }
    }

    /**
     * Obtenir le statut d'une demande
     */
    public String getStatut(String executionId) {
        try {
            return bpmClient.getStatus(executionId).getStatus();
        } catch (Exception e) {
            throw new RuntimeException("Erreur: " + e.getMessage());
        }
    }
}
```

---

## Exemple avec Controller REST

```java
package com.votreprojet.controller;

import com.votreprojet.service.DemandeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/demandes")
public class DemandeController {

    @Autowired
    private DemandeService demandeService;

    @PostMapping("/stage")
    public ResponseEntity<?> soumettreDemande(@RequestBody Map<String, Object> body) {
        try {
            String executionId = demandeService.soumettreDemandeStage(body);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "execution_id", executionId
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    @PostMapping("/{executionId}/valider")
    public ResponseEntity<?> valider(@PathVariable String executionId) {
        try {
            demandeService.valider(executionId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    @PostMapping("/{executionId}/rejeter")
    public ResponseEntity<?> rejeter(@PathVariable String executionId) {
        try {
            demandeService.rejeter(executionId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }

    @GetMapping("/{executionId}/statut")
    public ResponseEntity<?> getStatut(@PathVariable String executionId) {
        try {
            String statut = demandeService.getStatut(executionId);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "statut", statut
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }
}
```

---

## Récupérer la clé API

1. Connectez-vous au dashboard BPM: `http://localhost:3000/admin/`
2. Allez dans l'onglet "Clients"
3. Sélectionnez votre client (ou créez-en un nouveau)
4. Copiez la clé API

---

## Résumé des méthodes

| Méthode | Description |
|---------|-------------|
| `execute(type, payload)` | Exécuter un workflow |
| `approve(executionId)` | Approuver une étape humaine |
| `reject(executionId)` | Rejeter une étape humaine |
| `getStatus(executionId)` | Obtenir le statut |
| `cancel(executionId)` | Annuler une exécution |
| `listWorkflows()` | Lister les workflows disponibles |

---

## Dépannage

### Erreur: "401 Unauthorized"
- Vérifiez votre clé API dans `application.properties`

### Erreur: "Connection refused"
- Vérifiez que le moteur BPM est démarré
- Vérifiez l'URL dans la configuration

### Erreur: "Workflow not found"
- Le type de workflow n'existe pas dans le registre
- Vérifiez le nom du workflow (sensible à la casse)

---

## Besoin d'aide?

Consultez la documentation complète du BPM Engine dans `IMPROVEMENTS.md` ou contactez l'administrateur.
