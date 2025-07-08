const { VoiceChannel } = require('discord.js');
const mysql = require('mysql2/promise');

require('dotenv').config(); // Charger les variables d'environnement depuis le fichier .env

// Configuration de la base de données
const dbConfig = {
    host: process.env.DB_HOST, // Host de la base de données
    user: process.env.DB_USER, // Nom d'utilisateur MySQL
    password: process.env.DB_PASSWORD, // Mot de passe MySQL
    database: process.env.DB_NAME, // Nom de la base de données définie dans hydradev.sql
};

const serverConfigs = new Map();

// Objets utilisés pour mapper les clés camelCase et snake_case
const keyMapping = {
    VoiceChannel: 'voice_channel',
    adminRoleName: 'admin_role',
    mutedRoleName: 'muted_role',
    autoMessageChannel: 'auto_message_channel',
    autoMessageContent: 'auto_message_content',
    autoMessageInterval: 'auto_message_interval',
    autoMessageEnabled: 'auto_message_enable',
};

// Créer une version inversée du mappage pour la conversion dans l'autre sens
const reverseKeyMapping = Object.fromEntries(
    Object.entries(keyMapping).map(([camel, snake]) => [snake, camel])
);

// Charger toutes les configurations des serveurs depuis la base de données
async function loadConfigs() {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute('SELECT * FROM serverconfig');
        const serverConfigs = new Map();

        rows.forEach((row) => {
            const config = {};
            // Traduire les colonnes snake_case vers camelCase en utilisant reverseKeyMapping
            for (const [sqlKey, value] of Object.entries(row)) {
                const camelKey = reverseKeyMapping[sqlKey] || sqlKey; // Utilise la clé telle quelle si non mappée
                config[camelKey] = value;
            }

            // Assurez-vous que "links" est initialisé
            config.links = [];

            // Ajouter à la Map
            serverConfigs.set(row.server_id, config);
        });

        // Charger les liens des serveurs
        for (const [serverId, config] of serverConfigs.entries()) {
            const [linkRows] = await connection.execute(
                'SELECT name, url FROM links_servers WHERE serverconfig_id = ?',
                [config.id]
            );
            config.links = linkRows.map((link) => ({
                name: link.name,
                url: link.url,
            }));
        }

        console.log('Configurations chargées avec succès.');
        return serverConfigs;
    } catch (error) {
        console.error('Erreur lors du chargement des configurations :', error);
        throw error;
    } finally {
        await connection.end();
    }
}

async function saveConfig(serverId, config) {
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Convertir camelCase en snake_case
        const config = {};
        for (const [camelKey, value] of Object.entries(config)) {
            const sqlKey = keyMapping[camelKey] || camelKey; // Utilise la clé telle quelle si non mappée
            config[sqlKey] = value;
        }

        // Supprimer "links" (car c'est géré dans une table séparée)
        const links = config.links || [];
        delete config.links;

        // Vérifie si la configuration existe déjà
        const [existing] = await connection.execute(
            'SELECT id FROM serverconfig WHERE server_id = ?',
            [serverId]
        );

        let serverConfigId;
        if (existing.length > 0) {
            // Mettre à jour si le serveur existe
            serverConfigId = existing[0].id;
            const updateQuery = `
                UPDATE serverconfig
                SET ${Object.keys(config).map((key) => `${key} = ?`).join(', ')}
                WHERE server_id = ?
            `;
            await connection.execute(updateQuery, [...Object.values(config), serverId]);
        } else {
            // Insérer une nouvelle configuration
            const insertQuery = `
                INSERT INTO serverconfig (${Object.keys(config).join(', ')}, server_id)
                VALUES (${Object.keys(config).map(() => '?').join(', ')}, ?)
            `;
            const result = await connection.execute(insertQuery, [
                ...Object.values(config),
                serverId,
            ]);
            serverConfigId = result[0].insertId;
        }

        // Gérer les liens (table séparée)
        await connection.execute('DELETE FROM links_servers WHERE serverconfig_id = ?', [
            serverConfigId,
        ]);
        const insertLinkQuery =
            'INSERT INTO links_servers (serverconfig_id, name, url) VALUES (?, ?, ?)';
        for (const link of links) {
            await connection.execute(insertLinkQuery, [serverConfigId, link.name, link.url]);
        }

        console.log(`Configuration sauvegardée pour le serveur ${serverId}`);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la configuration :', error);
    } finally {
        await connection.end();
    }
}

async function updateServerConfig(serverId, key, value) {
    // Vérifie si la clé existe dans le mappage
    if (!keyMapping[key]) {
        throw new Error(`La clé '${key}' n'est pas valide.`);
    }

    const sqlKey = keyMapping[key];

    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.execute(
            `UPDATE serverconfig SET ${sqlKey} = ? WHERE server_id = ?`,
            [value, serverId]
        );
        console.log(`Configuration mise à jour : ${sqlKey} = ${value} pour le serveur ${serverId}`);
    } catch (error) {
        console.error(
            `Erreur lors de la mise à jour de ${sqlKey} pour le serveur ${serverId} :`,
            error
        );
    } finally {
        await connection.end();
    }
}

// Exporter les fonctions pour les utiliser dans d'autres fichiers
module.exports = {
    serverConfigs,
    loadConfigs,
    saveConfig,
    updateServerConfig,
};
