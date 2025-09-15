const { EmbedBuilder } = require("discord.js");
const mysql = require("mysql2/promise");

require('dotenv').config(); // Charger les variables d'environnement depuis le fichier .env

// Connexion MySQL
const db = mysql.createPool({
    host: process.env.DB_HOST, // Host de la base de données
    user: process.env.DB_USER, // Nom d'utilisateur MySQL
    password: process.env.DB_PASSWORD, // Mot de passe MySQL
    database: process.env.DB_NAME, // Nom de la base de données définie dans hydradev.sql
});

// Cache temporaire pour les rôles admin
const adminRoleCache = new Map();

module.exports = {
    name: "messageReactionAdd",
    once: false,

    async execute(reaction, user) {
        if (user.bot) return;

        // --- GESTION DES PARTIALS ---
        try {
            if (reaction.partial) await reaction.fetch();             // récupère la réaction + message
            if (user.partial) await user.fetch();                     // récupère l'utilisateur si partiel
            if (reaction.message && reaction.message.partial) await reaction.message.fetch(); // récupère le message
        } catch (e) {
            console.error('[messageReactionAdd] Fetch partials failed:', e);
            return; // impossible de continuer sans données complètes
        }

        const { message } = reaction;
        const guild = message.guild;
        if (!guild) return;

        // Récupérer la config du serveur
        const [configs] = await db.query(
            "SELECT * FROM serverconfig WHERE server_id = ?",
            [guild.id]
        );
        if (configs.length === 0) {
            console.error(`Aucune configuration trouvée pour le serveur ${guild.id}`);
            return;
        }
        const config = configs[0];

        const flagEmoji = "🏳️";
        const reportThreshold = 5;
        const mutedRoleName = config.muted_role || "mute";
        const adminRoleName = config.admin_role || "admin";
        const reportResetTime = 10 * 60 * 1000;
        const logChannel = guild.channels.cache.find((ch) => ch.name.toLowerCase() === "logs");

        if (reaction.emoji.name === flagEmoji) {
            const member = await guild.members.fetch(message.author.id).catch(() => null);
            if (!member) return;

            // Récupérer ou créer l'entrée dans `reactioncounts`
            const [rows] = await db.query(
                "SELECT * FROM reactioncounts WHERE message_id = ?",
                [message.id]
            );
            let reactionId;
            let count = 0;

            if (rows.length === 0) {
                const [result] = await db.query(
                    "INSERT INTO reactioncounts (message_id, count) VALUES (?, ?)",
                    [message.id, 0]
                );
                reactionId = result.insertId;
            } else {
                reactionId = rows[0].id;
                count = rows[0].count;
            }

            // Vérifie si l'utilisateur a déjà réagi
            const [alreadyReacted] = await db.query(
                "SELECT * FROM users_reaction WHERE reactioncounts_id = ? AND user_id = ?",
                [reactionId, user.id]
            );

            if (alreadyReacted.length === 0) {
                count++;
                await db.query(
                    "UPDATE reactioncounts SET count = ? WHERE id = ?",
                    [count, reactionId]
                );

                await db.query(
                    "INSERT INTO users_reaction (reactioncounts_id, user_id) VALUES (?, ?)",
                    [reactionId, user.id]
                );

                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor("f08f19")
                        .setTitle("🚨 Signalement ajouté 🚨")
                        .setDescription(`Le message de ${member.user.tag} pose problème.`)
                        .addFields(
                            { name: "Message", value: message.content || "Aucun contenu trouvé" },
                            { name: "Total des signalements", value: `${count}` }
                        )
                        .setTimestamp();
                    logChannel.send({ embeds: [embed] });
                }

                try {
                    await reaction.users.remove(user.id);
                } catch (error) {
                    console.error("Impossible de supprimer la réaction :", error);
                }

                if (count >= reportThreshold) {
                    const muteRole = guild.roles.cache.find((r) => r.name === mutedRoleName);
                    const adminRole = guild.roles.cache.find((r) => r.name === adminRoleName);

                    if (!muteRole) {
                        console.error(`Le rôle "${mutedRoleName}" est introuvable.`);
                        return;
                    }

                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setColor("FF0000")
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
                        await member.roles.add(muteRole);

                        if (adminRole && member.roles.cache.has(adminRole.id)) {
                            adminRoleCache.set(member.id, true);
                            await member.roles.remove(adminRole);
                        }

                        await member.send(`🔇 Vous avez été mute sur **${guild.name}** après avoir reçu ${reportThreshold} signalements.`)
                            .catch(() => {
                                if (logChannel) {
                                    logChannel.send(`Impossible d'envoyer un MP à ${member.user.tag}`);
                                }
                            });

                        await message.delete();

                        setTimeout(async () => {
                            await member.roles.remove(muteRole);

                            if (adminRoleCache.get(member.id)) {
                                await member.roles.add(adminRole);
                            }

                            adminRoleCache.delete(member.id);
                        }, reportResetTime);
                    } catch (error) {
                        console.error("Erreur lors de l'action de mute :", error);
                    }

                    await db.query("DELETE FROM reactioncounts WHERE id = ?", [reactionId]);
                    await db.query("DELETE FROM users_reaction WHERE reactioncounts_id = ?", [reactionId]);
                }
            }
        }
    },
};
