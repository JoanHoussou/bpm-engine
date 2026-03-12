/**
 * BPM Engine - Java Client
 * Pour intégration Spring Boot / Java
 * 
 * Usage:
 *   BpmClient bpm = new BpmClient("http://localhost:3000", "bpm_live_xxx");
 *   
 *   // Exécuter un workflow
 *   ExecutionResult result = bpm.execute("demande_stage", Map.of("user_id", 123));
 *   
 *   // Approuver
 *   bpm.approve(result.getExecutionId());
 */

package com.bpmengine.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

public class BpmClient {
    private final String baseUrl;
    private final String apiKey;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final int timeout = 30;
    
    public BpmClient(String baseUrl, String apiKey) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.apiKey = apiKey;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(timeout))
            .build();
        this.objectMapper = new ObjectMapper();
    }
    
    private String parseErrorMessage(String responseBody, int statusCode) {
        try {
            Map<String, Object> error = objectMapper.readValue(responseBody, new TypeReference<Map<String, Object>>() {});
            String errorMsg = (String) error.getOrDefault("error", error.getOrDefault("message", "Unknown error"));
            String traceId = (String) error.get("trace_id");
            
            if (traceId != null) {
                return String.format("[%d] %s (trace: %s)", statusCode, errorMsg, traceId);
            }
            return String.format("[%d] %s", statusCode, errorMsg);
        } catch (Exception e) {
            return String.format("[%d] %s", statusCode, responseBody);
        }
    }
    
    /**
     * Exécuter un workflow
     */
    public ExecutionResult execute(String workflowType, Map<String, Object> payload) throws Exception {
        return execute(workflowType, payload, null);
    }
    
    public ExecutionResult execute(String workflowType, Map<String, Object> payload, String idempotencyKey) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("type", workflowType);
        body.put("payload", payload);
        if (idempotencyKey != null) {
            body.put("idempotency_key", idempotencyKey);
        }
        
        String json = objectMapper.writeValueAsString(body);
        
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/api/v1/workflow/execute"))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + apiKey)
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .timeout(Duration.ofSeconds(timeout))
            .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        
        if (response.statusCode() >= 400) {
            throw new RuntimeException(parseErrorMessage(response.body(), response.statusCode()));
        }
        
        return objectMapper.readValue(response.body(), ExecutionResult.class);
    }
    
    /**
     * Approuver une étape humaine
     */
    public ExecutionResult approve(String executionId) throws Exception {
        return approve(executionId, null);
    }
    
    public ExecutionResult approve(String executionId, String comment) throws Exception {
        return resume(executionId, "approved", comment);
    }
    
    /**
     * Rejeter une étape humaine
     */
    public ExecutionResult reject(String executionId) throws Exception {
        return reject(executionId, null);
    }
    
    public ExecutionResult reject(String executionId, String comment) throws Exception {
        return resume(executionId, "rejected", comment);
    }
    
    /**
     * Reprendre après une décision humaine
     */
    public ExecutionResult resume(String executionId, String decision, String comment) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("decision", decision);
        if (comment != null) {
            body.put("comment", comment);
        }
        
        String json = objectMapper.writeValueAsString(body);
        
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/api/v1/workflow/" + executionId + "/resume"))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + apiKey)
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .timeout(Duration.ofSeconds(timeout))
            .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        
        if (response.statusCode() >= 400) {
            throw new RuntimeException(parseErrorMessage(response.body(), response.statusCode()));
        }
        
        return objectMapper.readValue(response.body(), ExecutionResult.class);
    }
    
    /**
     * Obtenir le statut d'une exécution
     */
    public ExecutionResult getStatus(String executionId) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/api/v1/workflow/" + executionId))
            .header("Authorization", "Bearer " + apiKey)
            .GET()
            .timeout(Duration.ofSeconds(timeout))
            .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        
        if (response.statusCode() >= 400) {
            throw new RuntimeException(parseErrorMessage(response.body(), response.statusCode()));
        }
        
        return objectMapper.readValue(response.body(), ExecutionResult.class);
    }
    
    /**
     * Annuler une exécution
     */
    public ExecutionResult cancel(String executionId) throws Exception {
        Map<String, Object> body = new HashMap<>();
        String json = objectMapper.writeValueAsString(body);
        
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/api/v1/workflow/" + executionId + "/cancel"))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + apiKey)
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .timeout(Duration.ofSeconds(timeout))
            .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        
        if (response.statusCode() >= 400) {
            throw new RuntimeException(parseErrorMessage(response.body(), response.statusCode()));
        }
        
        return objectMapper.readValue(response.body(), ExecutionResult.class);
    }
    
    /**
     * Lister les workflows disponibles
     */
    public WorkflowList listWorkflows() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/api/v1/registry"))
            .header("Authorization", "Bearer " + apiKey)
            .GET()
            .timeout(Duration.ofSeconds(timeout))
            .build();
        
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        
        if (response.statusCode() >= 400) {
            throw new RuntimeException(parseErrorMessage(response.body(), response.statusCode()));
        }
        
        return objectMapper.readValue(response.body(), WorkflowList.class);
    }
    
    // Classes de réponse
    public static class ExecutionResult {
        @JsonProperty("execution_id")
        public String executionId;
        
        public String status;
        public String message;
        
        public String getExecutionId() { return executionId; }
        public String getStatus() { return status; }
        public String getMessage() { return message; }
        
        @Override
        public String toString() {
            return "ExecutionResult{executionId='" + executionId + "', status='" + status + "', message='" + message + "'}";
        }
    }
    
    public static class WorkflowList {
        public java.util.List<WorkflowInfo> workflows;
        
        public java.util.List<WorkflowInfo> getWorkflows() { return workflows; }
    }
    
    public static class WorkflowInfo {
        public String type;
        public String version;
        
        public String getType() { return type; }
        public String getVersion() { return version; }
    }
}
