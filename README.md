# **Hydra**

![Node.js](https://img.shields.io/badge/Node.js-v16+-green.svg) ![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue.svg)

## **Table des matières**
- [Présentation](#présentation)
- [Fonctionnalités](#fonctionnalités)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Structure du projet](#structure-du-projet)
- [Commandes](#commandes)
- [Contribuer](#contribuer)
- [Licence](#licence)

---

## **Présentation**

Bienvenue dans **CHAT Typique**, un bot Discord conçu pour faciliter la modération, ajouter une touche de fun à vos serveurs et répondre à vos besoins spécifiques ! 🎉

Ce bot utilise la bibliothèque [Discord.js](https://discord.js.org) et est structuré pour être facile à étendre et à maintenir.

---

## **Fonctionnalités**

- Configuration automatique d’un canal de **logs** avec la commande `/setup`.
- Commande `/ping` pour tester si le bot est opérationnel.
- Commande d'aide interactive : Récupérez une liste des commandes avec /help.
- Prise en charge des commandes slash modernes avec une structure modulaire.
- Facile à étendre grâce à une architecture bien organisée.

---

## **Prérequis**

Avant d'installer et de faire fonctionner le bot, assurez-vous d’avoir les éléments suivants :

- **Node.js** version 16 ou supérieure
  - [Télécharger Node.js](https://nodejs.org)
- Une clé **bot token** de l’API Discord
  - Obtention d’un token sur le [portail des développeurs Discord](https://discord.com/developers/applications)
- **npm** ou **yarn** (inclus avec Node.js)

---

## **Installation**

1. Clonez ce projet depuis GitHub :
   ```bash
   git clone https://github.com/votre-utilisateur/nom-du-repo.git
   cd nom-du-repo
   ```

2. Installez les dépendances :
   ```bash
   npm install
   ```

3. Créez un fichier `.env` pour stocker vos informations sensibles :
   ```bash
   touch .env
   ```
   Ajoutez-y vos variables :
   ```
   TOKEN=Votre_Token_Ici
   CLIENT_ID=Votre_Client_ID_Ici
   GUILD_ID=Votre_Guild_ID_Ici
   ```

4. Démarrez le bot :
   ```bash
   node index.js
   ```

---

## **Structure du projet**

Voici comment le projet est organisé :

```
.
├── commands/                  # Commandes du bot (modulaires)
│   ├── ping.js                # Commande "ping"
│   ├── setup.js               # Commande "setup"
├── events/                    # Gestion des événements Discord.js
│   ├── interactionCreate.js   # Interaction avec les commandes
│   ├── ready.js               # Événement "ready"
├── utils/                     # Fonctionnalités utilitaires (facultatif)
│   └── logger.js              # Gestion des logs
├── index.js                   # Point d'entrée principal
├── .env                       # Fichier des variables sensibles
├── package.json               # Dépendances du projet
└── README.md                  # Documentation
```

---

## **Commandes**

| Commande      | Description                                        | Permissions Requises      |
|---------------|----------------------------------------------------|---------------------------|
| `/ping`       | Répond "Pong !" pour vérifier le statut du bot.    | *Aucune*                  |
| `/setup`      | Configure un salon "logs" pour surveiller les actions de modération. | **Administrateur**        |

---

## **Contribuer**

Les contributions sont les bienvenues ! 🙌 Si vous souhaitez suggérer des améliorations ou signaler des bugs :

1. Forkez ce repo.
2. Créez une nouvelle branche pour vos modifications.
3. Soumettez une pull request (PR).

---

## **Licence**

Ce projet est sous [Licence MIT](LICENSE). Vous pouvez librement l'utiliser, le modifier et le distribuer !

---

## **Auteur**

Conçu et développé par **Shelby**.  
[Voir le dépôt Gitea](https://git.gitpushf.uk/SeguraS/Bot_CHAT_Typique) pour plus de détails.

---

### **Améliorations futures**

Quelques idées pour développer ce bot à l'avenir :
- Ajouter plus de commandes (modération avancée, jeux, utilitaires).
- Gérer des variables sauvegardées via une base de données (MongoDB, SQLite…).
- Créer des rapports d’activités hebdomadaires pour les administrateurs.

Si vous avez des suggestions, vous pouvez [ouvrir une issue ici](https://git.gitpushf.uk/SeguraS/Bot_CHAT_Typique/issues).
