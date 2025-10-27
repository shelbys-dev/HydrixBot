const { ChannelType, PermissionFlagsBits } = require('discord.js');

// DB
const db = require('../data/db');

module.exports = {
    name: 'guildCreate',
    async execute(guild, client) {
        console.log(`Nouveau serveur ajouté : ${guild.name} (id: ${guild.id})`);

        try {
            // INSERT idempotent : si déjà présent, ne change rien
            await db.query(
                `INSERT INTO serverconfig (server_id) VALUES (?) ON DUPLICATE KEY UPDATE server_id = server_id`,
                [guild.id]
            );

            // (Optionnel) logger dans un salon de logs ou dans la console
            console.log(`[guildCreate] Initialisé la config pour ${guild.name} (${guild.id})`);
        } catch (err) {
            console.error(`[guildCreate] Erreur d'init config pour ${guild.id}`, err);
        }
    },
};
