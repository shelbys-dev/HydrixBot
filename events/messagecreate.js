const mysql = require("mysql2/promise");

require("dotenv").config(); // Charger les variables d'environnement

// Configuration de la base de données
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};

// Chargement des données utilisateur spécifiques à un serveur
async function loadUserData(guildId, userId) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(
            `
      SELECT l.xp, l.level
      FROM levels l
      JOIN levels_has_serverconfig ls ON ls.levels_id = l.id
      JOIN serverconfig sc ON sc.id = ls.serverconfig_id
      WHERE sc.server_id = ? AND l.user_id = ?
      `,
            [guildId, userId]
        );

        if (rows.length > 0) {
            // Retourner les données de l'utilisateur si elles existent pour ce serveur
            return { xp: rows[0].xp, level: rows[0].level };
        } else {
            // Si aucune donnée n'existe, renvoyer une structure initialisée
            return { xp: 0, level: 1 };
        }
    } catch (error) {
        console.error("Erreur lors du chargement des données utilisateur :", error);
        throw error;
    } finally {
        await connection.end();
    }
}

// Sauvegarde des données utilisateur pour un serveur spécifique
async function saveUserData(guildId, userId, xp, level) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Vérifier si le serveur existe dans `serverconfig`
        const [serverRows] = await connection.execute(
            "SELECT id FROM serverconfig WHERE server_id = ?",
            [guildId]
        );

        if (serverRows.length === 0) {
            throw new Error(`Le serveur ${guildId} n'existe pas dans la base.`);
        }
        const serverConfigId = serverRows[0].id;

        // Vérifier si l'utilisateur a des données dans ce serveur spécifique via `levels_has_serverconfig`
        const [levelRows] = await connection.execute(
            `
      SELECT l.id FROM levels l
      JOIN levels_has_serverconfig ls ON ls.levels_id = l.id
      WHERE l.user_id = ? AND ls.serverconfig_id = ?
      `,
            [userId, serverConfigId]
        );

        if (levelRows.length === 0) {
            // Si l'utilisateur n'existe pas encore pour ce serveur, créer une entrée
            const [insertResult] = await connection.execute(
                "INSERT INTO levels (user_id, xp, level) VALUES (?, ?, ?)",
                [userId, xp, level]
            );

            const levelId = insertResult.insertId;

            // Associer l'entrée à ce serveur dans `levels_has_serverconfig`
            await connection.execute(
                "INSERT INTO levels_has_serverconfig (levels_id, serverconfig_id) VALUES (?, ?)",
                [levelId, serverConfigId]
            );
        } else {
            // Sinon, mettre à jour les données existantes
            const levelId = levelRows[0].id;
            await connection.execute(
                "UPDATE levels SET xp = ?, level = ? WHERE id = ?",
                [xp, level, levelId]
            );
        }

        console.log(
            `Données sauvegardées pour l'utilisateur ${userId} sur le serveur ${guildId}.`
        );
    } catch (error) {
        console.error("Erreur lors de la sauvegarde des données utilisateur :", error);
        throw error;
    } finally {
        await connection.end();
    }
}

// Ajout d'XP à un utilisateur pour un serveur spécifique
async function addXP(userId, guildId, xpGained, message) {
    // Charger les données utilisateur spécifiques au serveur
    const userData = await loadUserData(guildId, userId);

    // Ajouter de l'XP
    userData.xp += xpGained;

    const currentLevel = userData.level;
    const nextLevelXP = 5 * Math.pow(currentLevel, 2) + 50; // Formule pour prochain niveau

    // Vérifier si l'utilisateur passe au niveau suivant
    if (userData.xp >= nextLevelXP) {
        userData.level++;
        userData.xp = 0; // Réinitialisation XP après changement de niveau

        message.channel.send(
            `🎉 **${message.author.username}** passe au **niveau ${userData.level}** ! Félicitations !`
        );
    }

    // Sauvegarder les données mises à jour
    await saveUserData(
        guildId,
        userId,
        userData.xp,
        userData.level
    );
}

module.exports = {
    name: "messageCreate",
    async execute(message) {
        if (message.author.bot) return; // Ignorer les bots

        try {
            const xpGain = 10; // XP gagné par message
            await addXP(message.author.id, message.guild.id, xpGain, message);
        } catch (error) {
            console.error("Erreur lors de l'ajout d'XP :", error);
        }
    },
};
