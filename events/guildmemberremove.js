const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'guildMemberRemove',
    once: false,
    async execute(member) {
        // Essayer de trouver le salon "logs"
        const logChannel = member.guild.channels.cache.find(ch => ch.name.toLowerCase() === 'logs');

        if (logChannel) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000) // Rouge
                .setTitle('❌ **Membre parti**')
                .setDescription(`${member.user.tag} a quitté le serveur.`)
                .addFields(
                    { name: '🔗 ID du membre', value: `${member.id}` },
                    { name: '📊 Nombre total de membres', value: `${member.guild.memberCount}` }
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
                .setFooter({ text: 'Bot codé par Shelby S. ! 🚀', iconURL: member.guild.iconURL({ dynamic: true }) })
                .setTimestamp();

            logChannel.send({ embeds: [embed] });
        } else {
            console.error('Channel "logs" introuvable dans le serveur.');
        }
    }
};
