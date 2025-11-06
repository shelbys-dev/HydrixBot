const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
require('dotenv').config(); // Charger les variables d'environnement depuis le fichier .env

// DB (pool ou wrapper)
const db = require('../data/db');

// Cache temporaire pour les rôles admin (laisse tel quel pour l’instant)
const adminRoleCache = new Map();

// Fenêtre de validité des signalements
const WINDOW_SQL = "INTERVAL 24 HOUR";

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

        // Vérif permission "ReadMessageHistory" (utile pour anciens messages)
        const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);

        const isAdmin = me?.permissions?.has(PermissionFlagsBits.Administrator) ?? false;
        const canManageInChannel = message.channel?.permissionsFor?.(me)?.has(PermissionFlagsBits.ManageMessages, true) ?? false;
        const canManage = isAdmin || canManageInChannel;
        const canReadHistory = isAdmin || (message.channel?.permissionsFor?.(me)?.has(PermissionFlagsBits.ReadMessageHistory, true) ?? false);

        if (!canReadHistory) return;


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
        const reportThreshold = 5; // si tu as une colonne `report_threshold`, remplace par Number(config.report_threshold ?? 5)
        const mutedRoleName = config.muted_role || "mute";
        const adminRoleName = config.admin_role || "admin";
        const reportResetTime = 10 * 60 * 1000; // (encore utile tant que tu es en mode rôle mute)
        const logChannel = guild.channels.cache.find((ch) => ch.name?.toLowerCase() === "logs");

        if (reaction.emoji.name !== flagEmoji) return;

        const member = await guild.members.fetch(message.author.id).catch(() => null);
        if (!member) return;

        // --- Récupérer / créer l'entrée dans `reactioncounts` ---
        const [rows] = await db.query(
            "SELECT * FROM reactioncounts WHERE message_id = ?",
            [message.id]
        );

        let reactionId;
        if (rows.length === 0) {
            // essaie insert; si uq_message_id existe déjà (course), on relit
            try {
                const [result] = await db.query(
                    "INSERT INTO reactioncounts (message_id, count) VALUES (?, ?)",
                    [message.id, 0]
                );
                reactionId = result.insertId;
            } catch {
                const [backRead] = await db.query("SELECT * FROM reactioncounts WHERE message_id = ?", [message.id]);
                if (!backRead.length) return;
                reactionId = backRead[0].id;
            }
        } else {
            reactionId = rows[0].id;
        }

        // --- Compte des signalements frais (24h) ---
        const [[fresh]] = await db.query(
            `SELECT COUNT(*) AS freshCount
         FROM users_reaction
        WHERE reactioncounts_id = ?
          AND created_at >= DATE_SUB(NOW(), ${WINDOW_SQL})`,
            [reactionId]
        );
        let freshCount = Number(fresh.freshCount) || 0;

        // --- Déjà signalé par cet utilisateur dans la fenêtre 24h ? ---
        const [alreadyRecent] = await db.query(
            `SELECT id
         FROM users_reaction
        WHERE reactioncounts_id = ?
          AND user_id = ?
          AND created_at >= DATE_SUB(NOW(), ${WINDOW_SQL})
        LIMIT 1`,
            [reactionId, user.id]
        );

        if (alreadyRecent.length > 0) {
            // 🔒 Re-signalement bloqué (dans les 24h) : retire la réaction + DM
            if (canManage) { try { await reaction.users.remove(user.id); } catch (e) { /* ignore */ } }
            try { await user.send("❌ Vous avez déjà signalé ce message (dans les 24 dernières heures)."); } catch { }
            return;
        }

        // --- C’est un nouveau signalement dans la fenêtre : on enregistre ---
        await db.query(
            `INSERT INTO users_reaction (reactioncounts_id, user_id, created_at)
       VALUES (?, ?, NOW())`,
            [reactionId, user.id]
        );
        freshCount += 1;

        // (Optionnel) Synchroniser la vue "count" avec le frais, pour cohérence d’affichage
        await db.query(
            `UPDATE reactioncounts SET count = ? WHERE id = ?`,
            [freshCount, reactionId]
        );

        // Log “signalement ajouté”
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setColor("f08f19")
                .setTitle("🚨 Signalement ajouté 🚨")
                .setDescription(`Le message de ${member.user.tag} pose problème.`)
                .addFields(
                    { name: "Message", value: message.content || "Aucun contenu trouvé" },
                    { name: "Total des signalements (24h)", value: `${freshCount}` }
                )
                .setTimestamp();
            logChannel.send({ embeds: [embed] }).catch(() => { });
        }

        // Option visuelle : retirer la réaction pour éviter le “spam” d’icônes (garde si tu veux)
        if (canManage) {
            try { await reaction.users.remove(user.id); } catch (error) { /* pas critique */ }
        }

        // --- Seuil atteint ? ---
        if (freshCount >= reportThreshold) {
            const muteRole = guild.roles.cache.find((r) => r.name === mutedRoleName);
            const adminRole = guild.roles.cache.find((r) => r.name === adminRoleName);

            if (!muteRole) {
                console.error(`Le rôle "${mutedRoleName}" est introuvable.`);
                return;
            }

            // Log modération
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor("FF0000")
                    .setTitle("🚨 Signalement Modération")
                    .setDescription(`Le message de ${member.user.tag} a atteint le seuil et a été traité.`)
                    .addFields(
                        { name: "✅ Action", value: `Utilisateur muté ${Math.round(reportResetTime / 60000)} min et message supprimé` },
                        { name: "📄 Message", value: message.content || "Aucun contenu trouvé" }
                    )
                    .setTimestamp();
                logChannel.send({ embeds: [embed] }).catch(() => { });
            }

            try {
                await member.roles.add(muteRole);

                if (adminRole && member.roles.cache.has(adminRole.id)) {
                    adminRoleCache.set(member.id, true);
                    await member.roles.remove(adminRole);
                }

                await member.send(
                    `🔇 Vous avez été mute sur **${guild.name}** après avoir reçu ${reportThreshold} signalements (fenêtre 24h).`
                ).catch(() => {
                    if (logChannel) {
                        logChannel.send(`Impossible d'envoyer un MP à ${member.user.tag}`).catch(() => { });
                    }
                });

                await message.delete().catch(() => { });

                // (Ancien système) dé-mute après N minutes (tant que tu n’es pas passé en timeout natif)
                setTimeout(async () => {
                    try {
                        await member.roles.remove(muteRole);
                        if (adminRoleCache.get(member.id)) {
                            await member.roles.add(adminRole).catch(() => { });
                        }
                    } finally {
                        adminRoleCache.delete(member.id);
                    }
                }, reportResetTime);
            } catch (error) {
                console.error("Erreur lors de l'action de mute :", error);
            }

            // Nettoyage DB du bundle pour ce message (optionnel si tu veux libérer tout de suite)
            await db.query("DELETE FROM reactioncounts WHERE id = ?", [reactionId]);
            await db.query("DELETE FROM users_reaction WHERE reactioncounts_id = ?", [reactionId]);
        }
    },
};
