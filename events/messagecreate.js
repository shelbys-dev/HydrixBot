const fs = require('fs');
const path = require('path');

const USER_DATA_FILE = path.join(__dirname, '../data/userData.json');

// Fonction pour charger les données utilisateur
function loadUserData() {
    if (!fs.existsSync(USER_DATA_FILE)) {
        console.warn(`Fichier ${USER_DATA_FILE} non trouvé. Un nouveau fichier vide sera créé.`);
        fs.writeFileSync(USER_DATA_FILE, '{}', 'utf-8'); // Crée un fichier JSON vide
        return {}; // Renvoie un objet vide
    }

    try {
        const data = fs.readFileSync(USER_DATA_FILE, 'utf-8');
        return JSON.parse(data || '{}');
    } catch (error) {
        console.error(`Erreur lors du chargement de ${USER_DATA_FILE} :`, error);

        // Réinitialisation du fichier JSON cassé
        fs.writeFileSync(USER_DATA_FILE, '{}', 'utf-8'); 
        console.warn(`${USER_DATA_FILE} a été corrompu et a été remplacé par un fichier vide.`);
        return {};
    }
}

// Sauvegarde des données utilisateur dans un fichier JSON
function saveUserData(userData) {
    try {
        fs.writeFileSync(USER_DATA_FILE, JSON.stringify(userData, null, 2), 'utf-8');
        console.log(`Données sauvegardées.`);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de userData.json :', error);
    }
}

// Initialisation
let userData = loadUserData();

const cooldowns = new Map(); // Cooldowns pour limiter les gains d'XP

function addXP(userId, xpGained, message) {
    const guildId = message.guild.id; // ID du serveur

    // Initialisation des données pour le serveur si nécessaire
    if (!userData[guildId]) {
        userData[guildId] = {}; // Objet pour stocker les utilisateurs du serveur
    }

    // Initialisation des données utilisateur si nécessaire
    if (!userData[guildId][userId]) {
        userData[guildId][userId] = { xp: 0, level: 1 };
    }

    userData[guildId][userId].xp += xpGained;

    const currentLevel = userData[guildId][userId].level;
    const nextLevelXP = 5 * Math.pow(currentLevel, 2) + 50; // Formule pour prochain niveau

    if (userData[guildId][userId].xp >= nextLevelXP) {
        userData[guildId][userId].level++;
        userData[guildId][userId].xp = 0; // Réinitialisation de l'XP
        message.channel.send(`🎉 **${message.author.username}** passe au **niveau ${userData[guildId][userId].level}** ! Félicitations !`);

        // Attribution automatique des rôles aux milestones (plus flexible)
        /*
        const rewards = {
            5: "Actif",
            10: "VIP",
            15: "Légendaire"
        };
        const roleName = rewards[userData[userId].level];
        if (roleName) {
            const role = message.guild.roles.cache.find(role => role.name === roleName);
            if (role) {
                const member = message.guild.members.cache.get(userId);
                member.roles.add(role).catch(console.error); // Ajout du rôle
                message.channel.send(`🌟 **${message.author.username}** a reçu le rôle **${roleName}** !`);
            }
        }
        */
    }

    // Sauvegarde des données
    saveUserData(userData);
}

module.exports = {
    name: 'messageCreate',
    once: false, // Cet événement se déclenche plusieurs fois
    userData,
    execute(message) {
        if (message.author.bot) return; // Ignore les messages des bots
        addXP(message.author.id, 10, message); // Ajoute 10 XP par message
    },
};
