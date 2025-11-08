const { EmbedBuilder } = require('discord.js');

// DB
const db = require('../data/db');

module.exports = {
    name: 'guildMemberAdd',
    once: false,

    async execute(member) {
        // 2) Embed dans #logs si présent
        const logChannel = member.guild.channels.cache.find(
            (ch) => ch.name && ch.name.toLowerCase() === 'logs'
        );

        if (logChannel) {
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('👋 Nouveau membre')
                .setDescription(`${member.user.tag} a rejoint le serveur ! 🎉`)
                .addFields(
                    { name: '🔗 ID du membre', value: `${member.id}` },
                    { name: '📊 Nombre total de membres', value: `${member.guild.memberCount}` }
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
                .setFooter({ text: 'Bot codé par Shelby S. ! 🚀', iconURL: member.guild.iconURL({ dynamic: true }) })
                .setTimestamp();

            // on ignore les erreurs d’envoi pour ne pas bloquer la suite
            logChannel.send({ embeds: [embed] }).catch(() => { });
        } else {
            console.error('Channel "logs" introuvable dans le serveur.');
        }

        // 3) Autorole depuis la DB (db.query)
        const guildId = member.guild.id;
        try {
            const [rows] = await db.query(
                'SELECT autorole FROM serverconfig WHERE server_id = ? LIMIT 1',
                [guildId]
            );

            if (!rows.length || !rows[0].autorole) {
                console.log(`Aucun rôle automatique configuré pour le serveur ${guildId}.`);
                return;
            }

            const roleId = rows[0].autorole;
            const role = member.guild.roles.cache.get(roleId);

            if (!role) {
                console.error(`Le rôle avec l'ID ${roleId} est introuvable sur ${guildId}.`);
                return;
            }

            await member.roles.add(role);
            console.log(`Rôle automatique "${role.name}" attribué à ${member.user.tag} sur ${member.guild.name}.`);
        } catch (error) {
            console.error("Erreur lors de l'attribution de l'autorole :", error);
        }
    },
};