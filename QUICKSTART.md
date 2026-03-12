# BPM Engine - Guide Rapide

## Installation Rapide

### Java
```java
// Copier BpmClient.java dans votre projet
// Configurer dans application.properties:
bpm.engine.url=http://localhost:3000
bpm.engine.api-key=xxx
```

### Python
```bash
pip install requests
# OU copier bpm_client.py
```

### Node.js
```bash
npm install -g bpm-engine-cli
bpm init
```

---

## Commandes Essentielles

| Action | Java | Python | CLI |
|--------|------|--------|-----|
| **Lister workflows** | `bpm.listWorkflows()` | `bpm.list_workflows()` | `bpm list` |
| **Schéma** | `bpm.getSchema("type")` | `bpm.get_schema("type")` | `bpm schema type` |
| **Exécuter** | `bpm.execute("type", payload)` | `bpm.execute("type", payload)` | `bpm execute type '{}'` |
| **Statut** | `bpm.getStatus(id).getStatus()` | `bpm.get_status(id)` | `bpm status id` |
| **Approuver** | `bpm.approve(id)` | `bpm.approve(id)` | `bpm approve id` |
| **Rejeter** | `bpm.reject(id)` | `bpm.reject(id)` | `bpm reject id` |

---

## Exemple Simple

```java
// Java
BpmClient bpm = new BpmClient("http://localhost:3000", "api_key");
ExecutionResult result = bpm.execute("demande_stage", Map.of("user_id", 123));
System.out.println(result.getExecutionId());
```

```python
# Python
bpm = BpmClient("http://localhost:3000", "api_key")
result = bpm.execute("demande_stage", {"user_id": 123})
print(result["execution_id"])
```

```bash
# CLI
bpm execute demande_stage '{"user_id": 123}'
```

---

## Obtenir API Key

1. Dashboard: `http://localhost:3000/admin/`
2. Onglet "Clients"
3. Copier la clé API

---

## Erreurs Courantes

| Erreur | Solution |
|--------|----------|
| `401 Unauthorized` | Vérifier l'API key |
| `404 Not Found` | Vérifier le nom du workflow |
| `Connection refused` | Vérifier l'URL du serveur |
