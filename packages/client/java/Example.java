// ============================================================
// BPM Engine - Guide d'intégration Java/Spring Boot
// ============================================================

// ============================================================
// OPTION 1: Copier le fichier BpmClient.java dans votre projet
// ============================================================

// Créez un dossier: src/main/java/com/bpmengine/client/
// Copiez BpmClient.java dans ce dossier

// ============================================================
// OPTION 2: Créer un Bean Spring (recommandé)
// ============================================================

package com.maprojet.config;

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

// ============================================================
// UTILISATION DANS UN SERVICE
// ============================================================

package com.maprojet.service;

import com.bpmengine.client.BpmClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class DemandeService {

    @Autowired
    private BpmClient bpmClient;

    public String soumettreDemande(Long userId, String type, String description) {
        try {
            // Exécuter le workflow
            BpmClient.ExecutionResult result = bpmClient.execute(
                "demande_stage",
                Map.of(
                    "user_id", userId,
                    "type", type,
                    "description", description
                )
            );
            
            return result.getExecutionId();
            
        } catch (Exception e) {
            throw new RuntimeException("Erreur BPM: " + e.getMessage());
        }
    }

    public void approuverDemande(String executionId) {
        try {
            bpmClient.approve(executionId);
        } catch (Exception e) {
            throw new RuntimeException("Erreur BPM: " + e.getMessage());
        }
    }

    public void rejeterDemande(String executionId) {
        try {
            bpmClient.reject(executionId);
        } catch (Exception e) {
            throw new RuntimeException("Erreur BPM: " + e.getMessage());
        }
    }

    public String getStatut(String executionId) {
        try {
            return bpmClient.getStatus(executionId).getStatus();
        } catch (Exception e) {
            throw new RuntimeException("Erreur BPM: " + e.getMessage());
        }
    }
}

// ============================================================
// DANS UN CONTROLLER
// ============================================================

package com.maprojet.controller;

import com.maprojet.service.DemandeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/demandes")
public class DemandeController {

    @Autowired
    private DemandeService demandeService;

    @PostMapping
    public String soumettre(@RequestBody Map<String, String> body) {
        Long userId = Long.parseLong(body.get("user_id"));
        return demandeService.soumettreDemande(
            userId,
            body.get("type"),
            body.get("description")
        );
    }

    @PostMapping("/{executionId}/approuver")
    public void approuver(@PathVariable String executionId) {
        demandeService.approuverDemande(executionId);
    }

    @PostMapping("/{executionId}/rejeter")
    public void rejeter(@PathVariable String executionId) {
        demandeService.rejeterDemande(executionId);
    }

    @GetMapping("/{executionId}/statut")
    public String statut(@PathVariable String executionId) {
        return demandeService.getStatut(executionId);
    }
}

// ============================================================
// APPLICATION.PROPERTIES
// ============================================================

bpm.engine.url=http://localhost:3000
bpm.engine.api-key=bpm_live_xxx
