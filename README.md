# Bot Discord

**Bot Discord** est un bot multifonction pour Discord, développé avec Node.js et la bibliothèque [discord.js](https://discord.js.org). Ce dépôt contient le code source du bot utilisé par mes différentes communautés (Hydaria, BountyFac, LGBT Ensemble, etc.).

> Dernière mise à jour : 22 septembre 2025

---

## ⚡️ Aperçu

Fonctionnalités principales :

- Gestion centralisée de la configuration serveur (SQL, pool MySQL)
- Commandes slash et interactions (modals, boutons, select menus)
- Système d'autorole, autoroles configurables par serveur
- Messages automatiques planifiés (enable/disable/config)
- Gestion de liens dynamique (ajout / suppression / affichage)
- Système de niveaux / XP et leaderboard
- Modération & gestion des reports via réactions
- Création dynamique de salons vocaux privés

---

## 🧰 Prérequis

- Node.js >= 18
- MySQL 5.7+ (ou compatible)
- Un token de bot Discord et un Application ID
- (Optionnel) PM2 / Docker pour le déploiement

---

## 🚀 Installation rapide

```bash
# cloner le repo
git clone git@git.lehub.tf:ShelbyDev.fr/HydrixBot.git
cd HydrixBot

# installer les dépendances
npm install
```

Copiez ensuite `.env.example` en `.env` et configurez les variables (exemples ci‑dessous).

---

## ⚙️ Variables d'environnement (exemple)

```env
# Discord
TOKEN=your_discord_bot_token
CLIENT_ID=your_client_id
GUILD_ID=optional_guild_for_dev

# MySQL
DB_HOST=127.0.0.1
DB_USER=bot_user
DB_PASSWORD=secret
DB_NAME=hydradev
DB_PORT=3306

# Options
NODE_ENV=production
PREFIX=! # si vous utilisez un prefix fallback
```

> Remarque : le projet utilise un pool MySQL (`mysql2/promise`) pour la stabilité en production.

---

## 🗂️ Base de données

Le schéma SQL initial (hydradev.sql) contient les tables nécessaires :
- `servers` : configuration par serveur (salons, rôles, options)
- `links` : liens configurables
- `users_xp` : XP et niveaux
- `automessages` : configuration des messages automatisés

Importer le fichier SQL fourni pour initialiser la base :

```bash
mysql -u root -p hydra < hydra.sql
```

---

## 🧭 Commandes principales

La majorité des commandes sont des slash-commands. Exemple :

- `/config setup` — initialise une configuration serveur (création des entrées en DB)
- `/config liens add|remove|list` — gestion des liens publics
- `/config automessage` — config d'envoi automatique
- `/enableautomessage` / `/disableautomessage` — activer/désactiver
- `/config roles` — définir rôles Admin / Mute
- `/config autorole` — définir rôle à assigner aux nouveaux membres
- `/ping` — latence du bot
- `/leaderboard` — classement des utilisateurs par XP
- `/purge` — suppression massive (nuke/soft) — nécessite permissions administrateur

> Voir le dossier `commands/` pour la liste complète et la documentation interne.

---

## 🛠️ Lancement & Développement

En local (mode développement) :

```bash
# pour lancer le bot
npm start

# ou si vous avez un script dev (nodemon)
npm run dev
```

Déploiement recommandé : PM2 ou Docker.

Exemple PM2 :

```bash
pm install -g pm2
pm run build # si vous avez un step build
pm start
pm2 start ecosystem.config.js
```

Exemple Docker (basique) :

```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node","index.js"]
```

---

## ✅ Tests & Debug

- Activez les logs (console) pour surveiller les erreurs de connection MySQL ou permissions Discord.
- Vérifiez que les intents et partials nécessaires sont activés dans le portail Discord (GUILD_MEMBERS, MESSAGE_CONTENT si nécessaire pour certaines fonctionnalités).
- Erreurs fréquentes : `TypeError: Cannot read properties of undefined (reading 'channels')` — vérifier que `interaction.guild` n'est pas null et que la configuration serveur est initialisée.

---

## ♻️ Migration JSON → MySQL

Si vous venez d'une version qui utilisait des fichiers JSON pour stocker la config, un script de migration est prévu dans `data/migrations`. Ce script lit les JSON et les insère dans la base MySQL. Testez d'abord sur une instance de dev.

---

## 🤝 Contribution

Contributions, issues et suggestions sont bienvenues !

1. Forkez le dépôt
2. Créez une branche (`git checkout -b feature/ma-fonctionnalite`)
3. Soumettez une pull request

Merci de respecter le guide de style (ESLint, conventions) et d'ajouter des tests si possible.

---

## 🧾 Licence

Ce projet est distribué sous licence **MIT**.

---

## 📬 Contact

Pour les questions techniques ou report de bugs : ouvrez une issue sur GitHub ou contactez Shelby (mainteneur).

*Fait avec ❤️ par Shelby S.*