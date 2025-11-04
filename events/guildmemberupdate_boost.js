const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../data/db');

module.exports = {
    name: 'guildMemberUpdate',
    once: false,

    /**
     * Détecte le début d’un boost (premiumSince passe de null -> date)
     * et envoie un message dans le salon configuré si la feature est activée.
     */
    async execute(oldMember, newMember, client) {
        try {
            // On ne traite que les boosts (début)
            const wasBoosting = Boolean(oldMember.premiumSince);
            const isBoosting = Boolean(newMember.premiumSince);
            if (wasBoosting || !isBoosting) return;

            const guild = newMember.guild;
            if (!guild) return;

            // Récup config
            const [rows] = await db.query(
                'SELECT boost_channel, boost_enabled FROM serverconfig WHERE server_id = ? LIMIT 1',
                [guild.id]
            );
            if (!rows?.length) return;
            const { boost_channel, boost_enabled } = rows[0];

            if (!boost_enabled) return;                // désactivé
            if (!boost_channel) return;                // aucun salon choisi → on n’envoie rien

            // Récup salon
            let channel = guild.channels.cache.get(String(boost_channel));
            if (!channel) {
                try { channel = await guild.channels.fetch(String(boost_channel)); } catch { }
            }

            // Vérifs
            const valid = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
            if (!channel || !valid.includes(channel.type)) return;

            const me = guild.members.me;
            const perms = channel.permissionsFor(me);
            if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages)) return;

            // Embed
            const emb = new EmbedBuilder()
                .setColor(0xff73fa)
                .setTitle('💎 Merci pour le boost !')
                .setDescription(`Un énorme merci à ${newMember} pour avoir **boosté ${guild.name}** !\nVous faites briller le serveur ✨`)
                .setThumbnail(newMember.displayAvatarURL({ size: 256 }))
                .setTimestamp();

            const msg = await channel.send({ embeds: [emb] }).catch(() => null);

            // Crosspost si salon d’annonces
            if (msg && channel.type === ChannelType.GuildAnnouncement && msg.crosspost) {
                try { await msg.crosspost(); } catch { }
            }

            // Logs (si #logs existe)
            const log = guild.channels.cache.find(c => c.name?.toLowerCase() === 'logs');
            if (log) {
                const logEmb = new EmbedBuilder()
                    .setColor(0x9b59b6)
                    .setTitle('💎 Nouveau boost')
                    .setDescription(`${newMember.user.tag} a boosté le serveur.`)
                    .setTimestamp();
                log.send({ embeds: [logEmb] }).catch(() => { });
            }
        } catch (err) {
            console.error('[boost] guildMemberUpdate error:', err);
        }
    },
};
