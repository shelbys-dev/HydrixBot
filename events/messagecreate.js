const mysql = require('mysql2/promise');

require('dotenv').config(); // Charger les variables d'environnement depuis le fichier .env

// Configuration de la base de données
const dbConfig = {
    host: process.env.DB_HOST, // Host de la base de données
    user: process.env.DB_USER, // Nom d'utilisateur MySQL
    password: process.env.DB_PASSWORD, // Mot de passe MySQL
    database: process.env.DB_NAME, // Nom de la base de données définie dans hydradev.sql
};

// Chargement des données utilisateurs spécifiques à un serveur
async function loadUserData(guildId) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(
            `
            SELECT l.user_id, l.xp, l.level 
            FROM levels l
            JOIN levels_has_serverconfig ls ON ls.levels_id = l.id
            JOIN serverconfig sc ON sc.id = ls.serverconfig_id
            WHERE sc.server_id = ?
            `,
            [guildId]
        );

        // Convertir en structure compatible avec l'ancien fichier JSON
        const guildData = {};
        rows.forEach((row) => {
            guildData[row.user_id] = {
                xp: row.xp,
                level: row.level,
            };
        });

        console.log(`Données utilisateur chargées pour le serveur ${guildId}.`);
        return guildData;
    } catch (error) {
        console.error('Erreur lors du chargement des données utilisateur :', error);
        throw error;
    } finally {
        await connection.end();
    }
}

async function saveUserData(guildId, userId, xp, level) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Vérification ou création de l'enregistrement serveur
        const [serverRows] = await connection.execute(
            'SELECT id FROM serverconfig WHERE server_id = ?',
            [guildId]
        );

        if (serverRows.length === 0) {
            console.error('Erreur : Le serveur n’est pas trouvé dans la base de données.');
            throw new Error('Le serveur spécifié n’a pas été trouvé.');
        }
        const serverConfigId = serverRows[0].id;

        // Vérification ou création d’un utilisateur dans `levels`
        const [levelRows] = await connection.execute(
            'SELECT id FROM levels WHERE user_id = ?',
            [userId]
        );

        let levelId;
        if (levelRows.length === 0) {
            // Insérer un nouvel utilisateur
            const [insertResult] = await connection.execute(
                'INSERT INTO levels (user_id, xp, level) VALUES (?, ?, ?)',
                [userId, xp, level]
            );
            levelId = insertResult.insertId;

            // Créer un lien avec le serveur (levels_has_serverconfig)
            await connection.execute(
                'INSERT INTO levels_has_serverconfig (levels_id, serverconfig_id) VALUES (?, ?)',
                [levelId, serverConfigId]
            );
        } else {
            // Mettre à jour un utilisateur existant
            levelId = levelRows[0].id;
            await connection.execute(
                'UPDATE levels SET xp = ?, level = ? WHERE id = ?',
                [xp, level, levelId]
            );
        }

        console.log(`Données sauvegardées pour l'utilisateur ${userId} sur le serveur ${guildId}.`);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des données utilisateur :', error);
        throw error;
    } finally {
        await connection.end();
    }
}

async function addXP(userId, xpGained, message) {
    const guildId = message.guild.id;

    // Charger les données utilisateur pour le serveur
    const userData = await loadUserData(guildId);

    // Initialisation des données utilisateur si nécessaire
    if (!userData[userId]) {
        userData[userId] = { xp: 0, level: 1 };
    }

    // Ajouter l'XP
    userData[userId].xp += xpGained;

    const currentLevel = userData[userId].level;
    const nextLevelXP = 5 * Math.pow(currentLevel, 2) + 50; // Formule pour prochain niveau

    // Vérifier si l'utilisateur passe au niveau suivant
    if (userData[userId].xp >= nextLevelXP) {
        userData[userId].level++;
        userData[userId].xp = 0; // Réinitialisation de l'XP
        message.channel.send(
            `🎉 **${message.author.username}** passe au **niveau ${userData[userId].level}** ! Félicitations !`
        );
    }

    // Sauvegarder les données mises à jour dans la base
    await saveUserData(
        guildId,
        userId,
        userData[userId].xp,
        userData[userId].level
    );
}

module.exports = {
    name: 'messageCreate',
    once: false, // Cet événement se déclenche plusieurs fois
    execute(message) {
        if (message.author.bot) return; // Ignore les messages des bots

        // Ajouter 10 XP pour chaque message
        addXP(message.author.id, 10, message).catch((error) => {
            console.error('Erreur dans addXP :', error);
        });
    },
};