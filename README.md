# Kali-V2

> Environnement de développement agentique desktop pour développeurs.

Kali-V2 réunit dans un seul outil :

- **Développement agentique orchestré** — tâches parallèles isolées en git worktrees, agents Claude/Codex/Gemini pilotables, skills personnalisables, lifecycle automatisé.
- **Tracking & review MR/PR** (GitLab + GitHub) assisté par IA, Kanban enrichi.
- **Refinement & Issue Trackers** pour lier les tickets (Jira, GitHub Issues) aux tâches dev et aux MR.

> **Statut :** 🚧 En développement actif — **v0.0.0** (pre-scaffold).

---

## Pour qui ?

Développeurs qui veulent :
- Centraliser le suivi des MR/PR multi-providers (GitHub + GitLab)
- Automatiser les reviews avec une IA en gardant la main (chat interactif)
- Orchestrer plusieurs tâches dev en parallèle sans polluer la working copy
- Gérer leurs skills Claude et MCP servers depuis une UI

Stack principal : **Electron + TypeScript + React + Drizzle + SQLite chiffré (SQLCipher)**.

---

## Installation

> ⚠️ **Pré-scaffold** — l'app ne se lance pas encore. Revenez à `v0.0.1` pour installer les premières builds Linux.

### Pré-requis

- **Linux** (Ubuntu 22+, Debian 12+, Fedora 40+) — macOS et Windows post-MVP
- **Node.js ≥ 20**, **pnpm ≥ 10**
- **git ≥ 2.40**
- **Claude Code CLI** (ou équivalent Codex/Gemini) installé et authentifié
- **libsecret-1-0** + GNOME Keyring / KWallet (pour stockage sécurisé des tokens)

### Dev local

```bash
git clone <repo-url>
cd kali-v2
pnpm install
pnpm dev
```

---

## Contribuer

Les contributions sont les bienvenues. Voir [`CONTRIBUTING.md`](CONTRIBUTING.md) *(à venir)*.

En attendant : ouvrir une issue pour discuter de ce que tu veux apporter.

### Code de conduite

Ce projet adhère au [Contributor Covenant](CODE_OF_CONDUCT.md) *(à venir)*.

### Sécurité

Pour signaler une vulnérabilité, voir [`SECURITY.md`](SECURITY.md) *(à venir)*. Ne pas ouvrir d'issue publique.

---

## Licence

[**GNU AGPL-3.0-or-later**](LICENSE) — Copyright © 2026 Audrey.

Kali-V2 est sous licence copyleft forte : tout dérivé (y compris SaaS) doit rester open-source sous AGPL.
