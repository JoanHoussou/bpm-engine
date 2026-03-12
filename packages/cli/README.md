# BPM Engine CLI

Command-line interface pour gérer vos workflows BPM depuis votre terminal.

## Installation

```bash
npm install -g bpm-engine-cli
```

## Configuration

```bash
bpm init
```

Cela vous demandera:
- URL du serveur BPM (ex: http://localhost:3000)
- API Key (disponible depuis le dashboard)

## Commandes

### Lister les workflows

```bash
bpm list
```

### Voir le schéma d'un workflow

```bash
bpm schema internship_request
```

Affiche:
- Champs requis
- Étapes humaines
- Exemple de payload

### Exécuter un workflow

```bash
bpm execute <type> '<payload_json>'
```

Exemple:
```bash
bpm execute internship_request '{"n1_email":"supervisor@company.com","n2_email":"manager@company.com"}'
```

### Vérifier le statut

```bash
bpm status <execution_id>
```

### Approuver une étape humaine

```bash
bpm approve <execution_id> --comment "Approved"
```

### Rejeter une étape humaine

```bash
bpm reject <execution_id> --comment "Reason for rejection"
```

### Créer un workflow

```bash
bpm create workflow.json
```

## Options

| Option | Description |
|--------|-------------|
| `-j, --json` | Output au format JSON |
| `-c, --comment` | Commentaire pour approve/reject |
| `-h, --help` | Aide |
| `-V, --version` | Version |

## Configuration

La configuration est stockée dans `~/.bpm/config.json`:

```json
{
  "url": "http://localhost:3000",
  "apiKey": "bpm_live_xxx"
}
```
