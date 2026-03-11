# BPM Engine - Technical Specification

## Stack Technique

Utilisez Node.js / TypeScript pour le moteur.

Le stack exact pour votre moteur :
- Runtime → Node.js 20 LTS (Long Term Support — stable)
- Langage → TypeScript 5.x (typage fort, détection d'erreurs avant exécution)
- Framework HTTP → Fastify (2x plus rapide qu'Express, idéal pour APIs)
- ORM / DB → Prisma + PostgreSQL (le plus lisible pour l'IA agentique)
- Queue → BullMQ (jobs asynchrones, retry, delayed jobs pour human steps)
- Cache → ioredis + Valkey (optionnel au démarrage)
- Validation → Zod (validation des schémas JSON en TypeScript)
- Tests → Vitest (rapide, moderne)
- Déploiement → Docker + docker-compose

---

## Structure du Projet

La structure de votre projet en TypeScript : nous sommes déjà dans le bpm-engine que nous avons appelé bpm-core :

```
bpm-engine/                          ← racine du monorepo
│
├── 📁 src/                          ← BACKEND (Node.js TypeScript)
│   │
│   ├── 📁 core/                     ← Moteur générique — jamais de logique métier
│   │   ├── PipelineRunner.ts        ← orchestre les 7 étapes
│   │   ├── ExecutionContext.ts      ← contexte partagé entre étapes
│   │   ├── WorkflowRegistry.ts     ← dispatcher + factory (point PIVOT)
│   │   └── SagaManager.ts          ← compensation rollback inverse
│   │
│   ├── 📁 phases/
│   │   ├── 📁 phase1-reception/
│   │   │   ├── NormalizerAdapter.ts ← DTO standard + trace_id
│   │   │   └── TraceInitializer.ts  ← OpenTelemetry span init
│   │   │
│   │   ├── 📁 phase2-validation/
│   │   │   ├── GuardChain.ts        ← exécute les 4 guards en séquence
│   │   │   ├── AuthGuard.ts         ← vérifie l'API Key (SHA256 lookup)
│   │   │   ├── SchemaGuard.ts       ← validation Zod du payload
│   │   │   ├── SanitizeGuard.ts     ← nettoyage XSS
│   │   │   └── RateLimitGuard.ts    ← compteur Redis/Valkey
│   │   │
│   │   ├── 📁 phase3-execution/
│   │   │   ├── AutoStepExecutor.ts  ← POST vers backend client + retry
│   │   │   ├── HumanStepExecutor.ts ← suspend + email + BullMQ delay
│   │   │   ├── ConditionEvaluator.ts← évalue JSONPath + branche next
│   │   │   └── ParallelExecutor.ts  ← Promise.all sur étapes parallèles
│   │   │
│   │   └── 📁 phase4-output/
│   │       ├── EventPublisher.ts    ← publie event dans le bus
│   │       ├── NotificationService.ts← email, Slack, SMS
│   │       └── ArchiveService.ts    ← Event Store + KPI + index replay
│   │
│   ├── 📁 api/
│   │   ├── 📁 routes/
│   │   │   ├── workflow.routes.ts   ← /execute /status /resume
│   │   │   ├── registry.routes.ts   ← /registry/register
│   │   │   └── admin.routes.ts      ← /admin/clients /keys
│   │   │
│   │   └── 📁 middleware/
│   │       ├── auth.middleware.ts   ← vérifie API Key sur chaque route
│   │       └── rateLimit.middleware.ts
│   │
│   ├── 📁 queue/
│   │   ├── queues.ts                ← définition des queues BullMQ
│   │   ├── workers/
│   │   │   ├── workflow.worker.ts   ← traite les jobs d'exécution
│   │   │   ├── humanTimeout.worker.ts← vérifie timeouts human steps
│   │   │   └── reminder.worker.ts   ← envoie les relances programmées
│   │   └── scheduler.ts             ← programme les jobs différés
│   │
│   ├── 📁 db/
│   │   ├── schema.prisma            ← définition des tables PostgreSQL
│   │   ├── 📁 migrations/           ← migrations auto générées par Prisma
│   │   └── seed.ts                  ← données initiales (admin, config)
│   │
│   ├── 📁 services/
│   │   ├── ApiKeyService.ts         ← génération, hash, vérification
│   │   ├── IdempotencyService.ts    ← check Redis avant exécution
│   │   ├── NotificationService.ts   ← email SMTP + Slack webhook
│   │   └── StepCallService.ts       ← appel HTTP vers backends clients
│   │
│   └── main.ts                      ← point d'entrée Fastify
│
│
├── 📁 admin/                        ← FRONTEND (HTML/CSS/JS pur)
│   │
│   ├── 📁 pages/
│   │   ├── index.html               ← dashboard (page d'accueil)
│   │   ├── executions.html           ← liste + détail des exécutions
│   │   ├── workflows.html            ← registry des workflows
│   │   ├── clients.html              ← gestion des clients
│   │   ├── apikeys.html              ← gestion des API Keys
│   │   ├── logs.html                ← audit trail temps réel
│   │   └── settings.html            ← configuration du moteur
│   │
│   ├── 📁 js/
│   │   ├── api.js                   ← toutes les fonctions fetch() vers le backend
│   │   ├── auth.js                  ← gestion session admin (login/logout)
│   │   ├── components.js            ← composants réutilisables (badges, tables)
│   │   ├── charts.js                ← graphiques du dashboard
│   │   └── realtime.js              ← polling ou SSE pour les logs live
│   │
│   ├── 📁 css/
│   │   ├── main.css                 ← variables, reset, typographie
│   │   ├── layout.css               ← sidebar, topbar, grid
│   │   ├── components.css           ← badges, cards, tables, modals
│   │   └── pages.css                ← styles spécifiques par page
│   │
│   └── 📁 assets/
│       └── logo.svg
│
│
├── 📁 docs/
│   ├── BPM_ENGINE_ARCHITECTURE.md   ← prompt IA agentique (déjà fait ✓)
│   ├── API_REFERENCE.md             ← documentation des endpoints
│   ├── WORKFLOW_SCHEMA.md           ← guide JSON (déjà fait ✓)
│   └── DEPLOYMENT.md                ← guide de déploiement
│
├── 📁 workflows-examples/           ← exemples JSON pour les clients
│   ├── internship-request.json      ← (déjà fait ✓)
│   ├── order.json
│   ├── loan-request.json
│   └── hr-onboarding.json
│
├── 📁 tests/
│   ├── 📁 unit/
│   │   ├── PipelineRunner.test.ts
│   │   ├── WorkflowRegistry.test.ts
│   │   └── GuardChain.test.ts
│   ├── 📁 integration/
│   │   ├── workflow-execute.test.ts
│   │   └── human-step.test.ts
│   └── 📁 fixtures/
│       └── workflows/               ← JSON de test
│
├── .env                             ← variables d'environnement (jamais dans Git)
├── .env.example                     ← template à committer
├── .gitignore
├── docker-compose.yml               ← PostgreSQL + Valkey + moteur + admin
├── Dockerfile                       ← image de production
├── package.json
└── tsconfig.json
```

---

## Communication Frontend / Backend

Le backend Fastify sert les fichiers HTML statiques ET expose l'API. Un seul serveur, un seul port.

```typescript
// src/main.ts — Fastify sert le frontend ET l'API
import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import path from 'path'

const app = Fastify()

// Sert le frontend admin depuis /admin
app.register(staticPlugin, {
  root: path.join(__dirname, '../admin'),
  prefix: '/admin/'
})

// Routes API
app.register(workflowRoutes, { prefix: '/api/v1' })
app.register(adminRoutes,    { prefix: '/admin/api' })

// Redirige / vers le dashboard
app.get('/', (req, reply) => reply.redirect('/admin/pages/index.html'))

app.listen({ port: 3000 })
```

```javascript
// admin/js/api.js — toutes les interactions avec le backend
const API_BASE = '/admin/api'

// Headers automatiques sur chaque requête
function headers() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
  }
}

// Fonctions réutilisables dans toutes les pages
const API = {

  // Exécutions
  getExecutions: () =>
    fetch(`${API_BASE}/executions`, { headers: headers() }).then(r => r.json()),

  getExecution: (id) =>
    fetch(`${API_BASE}/executions/${id}`, { headers: headers() }).then(r => r.json()),

  cancelExecution: (id) =>
    fetch(`${API_BASE}/executions/${id}/cancel`, {
      method: 'POST', headers: headers()
    }).then(r => r.json()),

  // Clients
  getClients: () =>
    fetch(`${API_BASE}/clients`, { headers: headers() }).then(r => r.json()),

  createClient: (data) =>
    fetch(`${API_BASE}/clients`, {
      method: 'POST', headers: headers(), body: JSON.stringify(data)
    }).then(r => r.json()),

  // API Keys
  generateKey: (clientId, data) =>
    fetch(`${API_BASE}/clients/${clientId}/keys`, {
      method: 'POST', headers: headers(), body: JSON.stringify(data)
    }).then(r => r.json()),

  revokeKey: (clientId, keyId) =>
    fetch(`${API_BASE}/clients/${clientId}/keys/${keyId}`, {
      method: 'DELETE', headers: headers()
    }).then(r => r.json()),

  // Stats dashboard
  getStats: () =>
    fetch(`${API_BASE}/stats`, { headers: headers() }).then(r => r.json()),

  // Logs temps réel (Server-Sent Events)
  streamLogs: (onLog) => {
    const es = new EventSource(`${API_BASE}/logs/stream`)
    es.onmessage = (e) => onLog(JSON.parse(e.data))
    return es  // retourne pour pouvoir fermer avec es.close()
  }
}
```

**Ce que Fastify sert selon l'URL**
```
https://bpm.votredomaine.com/              → redirige vers /admin/pages/index.html
https://bpm.votredomaine.com/admin/        → dashboard admin (HTML/CSS/JS)
https://bpm.votredomaine.com/api/v1/       → API publique (clients externes)
https://bpm.votredomaine.com/admin/api/   → API privée (dashboard uniquement)
```

---

## Docker Compose

```yaml
version: '3.9'

services:

  # Moteur BPM (backend + frontend admin servis ensemble)
  bpm-engine:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://bpm:bpm@postgres:5432/bpm_engine
      REDIS_URL: redis://valkey:6379
      ADMIN_SECRET: ${ADMIN_SECRET}
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - postgres
      - valkey
    volumes:
      - ./admin:/app/admin    # hot reload du frontend en dev

  # Base de données
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: bpm
      POSTGRES_PASSWORD: bpm
      POSTGRES_DB: bpm_engine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # Cache + Queue
  valkey:
    image: valkey/valkey:latest
    ports:
      - "6379:6379"
    volumes:
      - valkey_data:/data

volumes:
  postgres_data:
  valkey_data:
```

---

## Variables d'Environnement

**.env.example à committer :**

```bash
# Base de données
DATABASE_URL=postgresql://bpm:bpm@localhost:5432/bpm_engine

# Cache
REDIS_URL=redis://localhost:6379

# Sécurité
ADMIN_SECRET=changez-moi-en-production-32-chars-min
JWT_SECRET=changez-moi-aussi-32-chars-min

# Email (pour les notifications human steps)
SMTP_HOST=smtp.entreprise.com
SMTP_PORT=587
SMTP_USER=bpm@entreprise.com
SMTP_PASS=

# Slack (optionnel)
SLACK_WEBHOOK_URL=

# Environnement
NODE_ENV=development
PORT=3000
```

---

## CONTEXTE DU PROJET

Nous construisons un moteur d'orchestration BPM (Business Process Management) 
générique, exposé comme un service HTTP autonome, consommable par plusieurs 
applications de nature différente (RH, e-commerce, crédit bancaire, support, etc.) 
quel que soit leur langage backend (Python, Java, Node.js, PHP...).

---

## ARCHITECTURE GLOBALE

Le moteur est un SERVICE INDÉPENDANT déployé séparément de toutes les applications 
clientes. Les applications ne s'installent rien — elles appellent le moteur via 
HTTP avec une API Key.

[App Cliente (n'importe quel langage)]
│
│ POST /api/v1/workflow/execute
│ Authorization: Bearer bpm_live_xxxxx
▼

[BPM ENGINE — Service HTTP autonome]
│
├── Phase 1 : Réception + Validation
├── Phase 2 : Dispatcher + Init Context
├── Phase 3 : Exécution Workflow
└── Phase 4 : Notification + Archive
│
│ Pour chaque étape déclarée :
│ POST https://app-cliente.com/steps/nom-etape
▼

[Backend Client — exécute SA logique métier]
│
└── retourne { success: true/false, data: {...} }

Le moteur ORCHESTRE. Les backends clients EXÉCUTENT.
Le moteur ne connaît JAMAIS la logique métier des applications.

---

## LES 7 ÉTAPES DU PIPELINE (immuables pour toutes les apps)

### PHASE 1 — ENTRÉE & SÉCURITÉ

**01 · Réception Requête** (Pattern: Adapter)
- Point d'entrée unique : API REST, Webhook, Formulaire
- Normalisation vers un DTO interne standard
- Timestamp + ouverture du span de tracing (trace_id)

**02 · Validation & Sanitize** (Pattern: Guard Chain)
- 2.1 Vérification Auth / JWT ou API Key
- 2.2 Schema Validation (structure et types du payload)
- 2.3 Sanitize & XSS Filter (nettoyage des inputs)
- 2.4 Rate Limiting (quotas par client)
- Les 4 guards s'exécutent en CHAÎNE SÉQUENTIELLE
- Si un guard échoue → réponse 400/401/403/429 immédiate

### PHASE 2 — ROUTAGE & CONTEXTE

**03 · Dispatcher [PIVOT]** (Pattern: Registry + Factory)
- Lit le champ "type" du payload normalisé
- Cherche dans le Registry la définition du workflow correspondant
- Route vers le bon workflow ou fallback 422 si type inconnu
- C'est LE point d'extension : ajouter un type = ajouter une entrée Registry
- Ne jamais mettre de if/else sur le type dans le code du moteur

**04 · Init Context** (Pattern: Context Object)
- 4.1 Génère un execution_id unique chronologique (UUID v7)
- 4.2 Snapshot immutable du payload original (pour replay)
- 4.3 Clé d'idempotence (évite les doublons)
- 4.4 Ouverture de la transaction
- Le contexte est transmis à TOUTES les étapes suivantes

### PHASE 3 — EXÉCUTION MÉTIER

**05 · Exécution Workflow** (Pattern: Pipeline / Chain of Responsibility)
- 5.1 Charge les règles/étapes depuis le Registry pour ce type
- 5.2 Exécute chaque étape déclarée dans le JSON workflow :
  - Type AUTO → POST vers l'URL du backend client
  - Type HUMAN → suspend l'exécution, envoie email au valideur, attend /resume
  - Type CONDITION → évalue un JSONPath et branche vers next correspondant
  - Type PARALLEL → exécute plusieurs étapes simultanément, attend all ou any
- 5.3 Gestion retry exponentiel + timeout par étape
- 5.4 Si échec → Compensation Saga (rollback inverse des étapes complétées)
- 5.5 Enrichit le contexte avec les résultats de chaque étape
- Chaque étape reçoit : { execution_id, step, payload, context: {résultats précédents} }
- Chaque étape retourne : { success: true/false, data: {...}, error: {...} }

### PHASE 4 — SORTIE & CLÔTURE

**06 · Notification / Actionneur** (Pattern: Observer / Publisher)
- 6.1 Publie un event dans le bus (Kafka / RabbitMQ / simulation)
- 6.2 Notifie les acteurs (email, Slack, SMS selon config)
- 6.3 Appelle les webhooks externes abonnés avec retry
- Les 3 se font en PARALLÈLE

**07 · Archive & Feedback** (Pattern: Event Sourcing)
- 7.1 Clôture le contexte (durée totale, statut final, ferme la transaction)
- 7.2 Écrit dans l'Event Store (append-only, immuable)
- 7.3 Met à jour les KPIs temps réel
- 7.4 Indexe pour replay futur
- Les 3 (7.2, 7.3, 7.4) se font en PARALLÈLE après 7.1

---

## FORMAT DE DÉCLARATION D'UN WORKFLOW (JSON)

Chaque application cliente déclare son workflow en JSON et l'enregistre via 
POST /api/v1/registry/register au démarrage de l'app.

```json
{
  "type": "internship_request",
  "version": "1.0.0",
  "base_url": "https://hr-app.internal.com",
  "steps": [
    {
      "name": "check-budget",
      "type": "auto",
      "url": "/steps/internship/check-budget",
      "timeout_ms": 3000,
      "retry": 2,
      "compensate_url": "/steps/internship/check-budget/compensate",
      "on_failure": "compensate"
    },
    {
      "name": "approval-n1",
      "type": "human",
      "actor": "$.payload.n1_email",
      "action_url": "/approval/{execution_id}/n1",
      "timeout_hours": 48,
      "on_timeout": "escalate",
      "escalate_to": "$.payload.n2_email",
      "reminder_hours": [24, 40],
      "decisions": [
        { "key": "approved", "label": "Approuver", "next": "approval-rh" },
        { "key": "rejected", "label": "Refuser",   "next": "notify-rejection" }
      ]
    },
    {
      "name": "route-by-score",
      "type": "condition",
      "evaluate": "$.results.score-auto.data.score",
      "branches": [
        { "condition": ">= 750", "next": "auto-approve" },
        { "condition": "< 500",  "next": "auto-reject" },
        { "condition": "default","next": "advisor-review" }
      ]
    }
  ],
  "on_complete": { "notify": ["email"], "callback_url": "/bpm/callback" },
  "on_failure":  { "notify": ["slack"], "callback_url": "/bpm/callback", "strategy": "compensate" }
}
```

---

## SÉCURITÉ — AUTHENTIFICATION

**Seul modèle supporté : API Key (serveur à serveur)**
- Les apps mobiles ou frontends ne contactent JAMAIS le moteur directement
- Le flux est toujours : Mobile/Front → Backend Client → Moteur BPM

**Génération d'une API Key :**
1. Admin appelle POST /admin/clients avec les scopes et types autorisés
2. Le moteur génère une clé format : bpm_live_[32 chars aléatoires]
3. La clé est affichée UNE SEULE FOIS — jamais stockée en clair (SHA256 en base)
4. Le client stocke la clé dans ses variables d'environnement (.env)

**Vérification à chaque appel :**
- Hash SHA256 de la clé reçue → lookup en base
- Vérification des scopes pour l'endpoint appelé
- Vérification que le type de workflow est dans les allowed_types du client
- Log de chaque accès pour audit

**Scopes disponibles :**
- workflow:execute → lancer un workflow
- workflow:read → consulter le statut
- workflow:resume → reprendre après action humaine

---

## CONTRAT API COMPLET

```
POST   /api/v1/workflow/execute              → Lancer un workflow
GET    /api/v1/workflow/{execution_id}       → Consulter le statut
POST   /api/v1/workflow/{execution_id}/resume → Reprendre (human step)
POST   /api/v1/registry/register             → Déclarer un workflow
GET    /api/v1/registry/{type}               → Lire un workflow déclaré
POST   /admin/clients                        → Créer un client
POST   /admin/clients/{id}/keys              → Générer une API Key
DELETE /admin/clients/{id}/keys/{key_id}     → Révoquer une API Key
GET    /admin/executions                     → Dashboard admin
```

**Format de réponse standard (toujours respecté) :**
```json
{
  "execution_id": "exec-1234567890-abc",
  "trace_id":     "trace-1234567890-xyz",
  "status":       "RUNNING | COMPLETED | WAITING_HUMAN | FAILED | REJECTED",
  "type":         "internship_request",
  "result":       { ... } | null,
  "error":        null | { "code": "...", "message": "...", "step": "..." }
}
```

**Format de réponse d'une étape backend client :**
```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "STOCK_UNAVAILABLE", "retryable": false } }
```

---

## RÈGLES D'ARCHITECTURE ABSOLUES

1. Le moteur ne contient AUCUNE logique métier applicative
2. Le moteur ne fait JAMAIS de requête directe en base des apps clientes
3. Une étape ne connaît que son input et son output — pas les autres étapes
4. Jamais de if/else sur le type dans le cœur du moteur — tout passe par le Registry
5. Le context object est la seule source de vérité pendant une exécution
6. Toute compensation (Saga) s'exécute en ordre INVERSE des étapes complétées
7. Les APIs bancaires ou tierces protégées restent DERRIÈRE le backend client
8. Le token BPM ne sort jamais du serveur — jamais côté mobile ou frontend

---

## CE QUE TU DOIS FAIRE

Quand je te demande de générer du code ou de l'architecture pour ce projet :

- Respecte strictement la séparation moteur / logique métier
- Utilise toujours le format de réponse standard { success, data, error }
- Transmets toujours execution_id et trace_id dans les headers des appels
- Nomme les étapes avec des kebab-case descriptifs (check-budget, approval-n1)
- Pour les étapes humaines, gère toujours le timeout et l'escalade
- Pour les étapes auto, implémente toujours retry + compensate_url
- Valide toujours le JSON de workflow contre le schéma avant enregistrement
- Ne stocke JAMAIS une API Key en clair — toujours SHA256
- Préfixe les API Keys production par bpm_live_ et sandbox par bpm_test_
- Commente le code en expliquant POURQUOI, pas juste QUOI

Si une demande viole les règles d'architecture absolues, signale-le avant 
d'exécuter et propose l'approche correcte.
