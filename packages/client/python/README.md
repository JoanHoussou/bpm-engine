# BPM Engine - Python Client

## Installation

```bash
pip install requests
```

## Utilisation Simple

```python
from bpm_client import BpmClient

bpm = BpmClient(
    base_url="http://localhost:3000",
    api_key="bpm_live_xxx"
)

# Exécuter un workflow
result = bpm.execute("demande_stage", {
    "user_id": 123,
    "type": "stage",
    "description": "Ma demande"
})

print(result["execution_id"])  # exec-xxx
print(result["status"])         # WAITING_HUMAN, COMPLETED, FAILED
```

## Approuver / Rejeter

```python
# Approuver
bpm.approve("exec-xxx")

# Rejeter
bpm.reject("exec-xxx")
```

## Avec Flask

```python
from flask import Flask, request, jsonify
from bpm_client import BpmClient

app = Flask(__name__)
bpm = BpmClient("http://localhost:3000", "bpm_live_xxx")

@app.route('/demande', methods=['POST'])
def soumettre():
    data = request.json
    result = bpm.execute('demande_stage', data)
    return jsonify(result)

@app.route('/valider/<execution_id>', methods=['POST'])
def valider(execution_id):
    decision = request.json.get('decision')
    if decision == 'approved':
        return jsonify(bpm.approve(execution_id))
    return jsonify(bpm.reject(execution_id))
```

## Avec FastAPI

```python
from fastapi import FastAPI, HTTPException
from bpm_client import BpmClient

app = FastAPI()
bpm = BpmClient("http://localhost:3000", "bpm_live_xxx")

@app.post("/demande")
async def soumettre(data: dict):
    return bpm.execute('demande_stage', data)

@app.post("/valider/{execution_id}")
async def valider(execution_id: str, decision: str):
    if decision == "approved":
        return bpm.approve(execution_id)
    return bpm.reject(execution_id)
```

## Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `401` | Mauvaise API Key | Vérifier la clé |
| `Workflow not found` | Type incorrect | Vérifier le type |
| `timeout` | Serveur lent | Augmenter timeout |
