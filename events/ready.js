const { ActivityType } = require('discord.js');
const { serverConfigs } = require('../data/serverconfigs.js');
const { clearXpCache } = require('./messagecreate.js');

// DB
const db = require('../data/db');

async function cleanupOldReports() {
    try {
        // 1) purge des signalements > 24h
        await db.query(
            `DELETE FROM users_reaction
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        );

        // 2) purge des reactioncounts orphelins
        await db.query(
            `DELETE rc
         FROM reactioncounts rc
    LEFT JOIN users_reaction ur ON ur.reactioncounts_id = rc.id
        WHERE ur.id IS NULL`
        );

        console.log('🧹 Nettoyage signalements > 24h effectué');
    } catch (e) {
        console.error('Cleanup reports failed:', e);
    }
}

module.exports = {
    name: 'clientReady', // Nom de l'événement
    once: false, // true si l'événement ne se déclenche qu'une fois
    async execute(client) {
        console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
        cleanupOldReports();

        try {
            const guildIds = client.guilds.cache.map(g => g.id);

            if (guildIds.length) {
                // Préparer un INSERT IGNORE en bulk
                const values = guildIds.map(() => '(?)').join(',');
                const sql = `INSERT IGNORE INTO serverconfig (server_id) VALUES ${values}`;
                await db.query(sql, guildIds);
                console.log(`🔧 Backfill: ${guildIds.length} guild(s) vérifiés/insérés dans serverconfig`);
            }
        } catch (err) {
            console.error('[ready] Erreur backfill serverconfig:', err);
        }

        // 🟣 Phase de démarrage : statut "Se met à jour…"
        client.user.setPresence({
            activities: [{ type: ActivityType.Custom, name: 'Se met à jour…' }],
            status: 'idle',
        });

        // Après 20 secondes, démarrer la rotation de statuts
        setTimeout(() => {
            let i = 0;

            const updateStatus = () => {
                const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
                const guilds = client.guilds.cache.size;

                const statuses = [
                    { name: `Surveille ${totalMembers} membres 👥`, type: ActivityType.Custom },
                    { name: `${guilds} serveurs gérés 🛜`, type: ActivityType.Custom },
                    { name: '/help pour commencer', type: ActivityType.Custom },
                    { name: 'Nouveau site 🚀', type: ActivityType.Custom },
                ];

                const status = statuses[i];
                client.user.setPresence({ activities: [status], status: 'online' });
                i = (i + 1) % statuses.length;
            };

            updateStatus();
            setInterval(updateStatus, 10000);
        }, 20_000); // délai avant rotation

        // Stockage des intervals en cours
        const intervals = new Map();

        // Fonction : Synchroniser les messages automatiques
        const syncAutoMessages = (guildId) => {
            const config = serverConfigs.get(guildId);

            if (!config) return;
            const { autoMessageChannel, autoMessageContent, autoMessageInterval, autoMessageEnabled } = config;

            // Arrêter l'intervalle existant en cas de désactivation
            if (!autoMessageEnabled || !autoMessageChannel || !autoMessageContent || !autoMessageInterval) {
                if (intervals.has(guildId)) {
                    clearInterval(intervals.get(guildId));
                    intervals.delete(guildId);
                    console.log(`❌ Les messages automatiques pour ${guildId} ont été désactivés.`);
                }
                return;
            }

            // Si un intervalle existe déjà, ne pas en recréer un
            if (intervals.has(guildId)) return;

            // Créer un nouvel intervalle pour le serveur configuré
            client.channels.fetch(autoMessageChannel)
                .then((channel) => {
                    if (!channel) {
                        console.warn(`⚠️ Le canal (${autoMessageChannel}) pour ${guildId} est introuvable.`);
                        return;
                    }

                    console.log(`▶️ Lancement des messages automatiques pour ${guildId}.`);
                    const intervalId = setInterval(() => {
                        channel.send(autoMessageContent).catch((err) => {
                            console.error(`❌ Erreur d'envoi pour ${guildId} :`, err);
                        });
                    }, autoMessageInterval);

                    intervals.set(guildId, intervalId);
                })
                .catch((err) => {
                    console.error(`❌ Erreur de récupération du canal ${autoMessageChannel} pour ${guildId} :`, err);
                });
        };

        // Lancer les messages automatiques pour tous les serveurs configurés au démarrage
        serverConfigs.forEach((_, guildId) => syncAutoMessages(guildId));

        // Réagir dynamiquement aux changements de configuration
        client.on('configUpdate', (guildId) => {
            console.log(`🔄 Mise à jour de la configuration pour ${guildId}.`);
            syncAutoMessages(guildId);
            clearXpCache(guildId);
        });

        // Nettoyer les intervalles si un serveur est supprimé
        client.on('guildDelete', (guild) => {
            const intervalId = intervals.get(guild.id);
            if (intervalId) {
                clearInterval(intervalId);
                intervals.delete(guild.id);
                console.log(`🚮 Intervalle des messages automatiques arrêté pour le serveur ${guild.id}.`);
            }
        });
    },
};
