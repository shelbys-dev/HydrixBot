const { EmbedBuilder } = require("discord.js");

// Configuration par serveur (Map ou base de données pour une personnalisation avancée)
const serverConfigs = new Map(); // Ex: Map<guildId, { mutedRoleName, adminRoleName, flagEmoji, reportThreshold }>
// Configuration de Shelbydev :
serverConfigs.set("766660674453110814", {
    mutedRoleName: "Muted",
    adminRoleName: "「🛑」ᴀᴅᴍɪɴ",
    flagEmoji: "🏳️",
    reportThreshold: 4,
    reportResetTime: 10 * 60 * 1000, // Temps en ms
});

// Stockage temporaire des signalements
const reactionCounts = new Map(); // Exemple: Map<messageId, { count, users, timeout }>

// Cache pour le rôle admin supprimé lors d'un mute
const adminRoleCache = new Map();

module.exports = {
    name: "messageReactionAdd", // Nom de l'événement
    once: false, // Cet événement se déclenche plusieurs fois
    async execute(reaction, user) {
        // Ignorer les réactions du bot
        if (user.bot) return;

        const { message } = reaction;
        const guild = message.guild;

        if (!guild) return; // Se déclenche uniquement pour les serveurs

        // Charger la configuration du serveur
        const config = serverConfigs.get(guild.id);
        if (!config) {
            console.error(`Aucune configuration trouvée pour le serveur ${guild.id}`);
            return;
        }

        const flagEmoji = config.flagEmoji || "🏳️";
        const reportThreshold = config.reportThreshold || 5;
        const mutedRoleName = config.mutedRoleName || "mute";
        const adminRoleName = config.adminRoleName || "admin";

        // Vérifier si l'emoji correspond au drapeau défini
        if (reaction.emoji.name === flagEmoji) {
            const member = await guild.members.fetch(message.author.id).catch(() => null);
            if (!member) {
                console.error(`Impossible d'obtenir le membre pour ${message.author.id}`);
                return;
            }

            // Obtenir ou initialiser le compteur de réactions
            const counts = reactionCounts.get(message.id) || { count: 0, users: new Set() };

            if (!counts.timeout) {
                counts.timeout = setTimeout(() => {
                    reactionCounts.delete(message.id);
                }, config.reportResetTime || 10 * 60 * 1000);
            }

            // Éviter les doublons
            if (!counts.users.has(user.id)) {
                counts.count++;
                counts.users.add(user.id);
                reactionCounts.set(message.id, counts);

                console.log(`Signalement ajouté pour le message ${message.id}. Total : ${counts.count}.`);

                // Supprimer la réaction pour garder l'anonymat
                try {
                    await reaction.users.remove(user.id);
                } catch (error) {
                    console.error("Impossible de supprimer la réaction :", error);
                }

                // Vérifier si le seuil est atteint
                if (counts.count >= reportThreshold) {
                    console.log(`Seuil atteint pour le message de ${member.user.tag}.`);

                    // Chercher les rôles
                    const muteRole = guild.roles.cache.find((r) => r.name === mutedRoleName);
                    const adminRole = guild.roles.cache.find((r) => r.name === adminRoleName);

                    if (!muteRole) {
                        console.error(`Le rôle "${mutedRoleName}" est introuvable.`);
                        return;
                    }

                    const logChannel = guild.channels.cache.find((ch) => ch.name.toLowerCase() === "logs");
                    if (logChannel) {
                        // Log de l'intervention
                        const embed = new EmbedBuilder()
                            .setColor("FF0000") // Rouge
                            .setTitle("🚨 Signalement Modération")
                            .setDescription(`Le message de ${member.user.tag} a été signalé plusieurs fois et traité.`)
                            .addFields(
                                { name: "✅ Action", value: "Utilisateur muté et message supprimé" },
                                { name: "📄 Message", value: message.content || "Aucun contenu trouvé" }
                            )
                            .setTimestamp();
                        logChannel.send({ embeds: [embed] });
                    }

                    try {
                        // Ajouter le rôle de mute
                        await member.roles.add(muteRole);

                        // Gérer le rôle admin
                        if (adminRole && member.roles.cache.has(adminRole.id)) {
                            adminRoleCache.set(member.id, true);
                            await member.roles.remove(adminRole);
                        }

                        // Notifier l'utilisateur
                        await member.send(
                            `🔇 Vous avez été mute sur **${guild.name}** après avoir reçu ${reportThreshold} signalements.`
                        ).catch(() => {
                            const logChannel = member.guild.channels.cache.find(ch => ch.name.toLowerCase() === 'logs');
                            if (logChannel) {
                                logChannel.send(`Impossible d'envoyer un MP à ${member.user.tag}`);
                            } else {
                                console.error(`Impossible d'envoyer un MP à ${member.user.tag} et le salon "logs" est introuvable.`);
                            };
                        });

                        // Supprimer le message signalé
                        await message.delete();

                        // Démuter automatiquement
                        setTimeout(async () => {
                            await member.roles.remove(muteRole);

                            if (adminRoleCache.get(member.id)) {
                                await member.roles.add(adminRole);
                            }

                            adminRoleCache.delete(member.id);
                        }, config.reportResetTime);
                    } catch (error) {
                        console.error("Erreur lors de l'action de mute :", error);
                    }

                    reactionCounts.delete(message.id);
                    clearTimeout(counts.timeout);
                }
            }
        }
    },
};
