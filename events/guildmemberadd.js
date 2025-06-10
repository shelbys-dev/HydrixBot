const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'guildMemberAdd', // Nom de l'événement
    once: false, // true si l'événement ne se déclenche qu'une fois
    execute(member) {
        // Envoie un message direct au nouveau membre
        member.send(`Salut ${member.user.username}, bienvenue dans **${member.guild.name}** ! Si tu as des questions, n’hésite pas à demander. 😊`).catch((error) => {
            console.error(`Impossible d'envoyer un DM à ${member.user.tag} :`, error.message);
        });

        // Accès au serveur via member.guild
        const logChannel = member.guild.channels.cache.find(ch => ch.name.toLowerCase() === 'logs');

        if (logChannel) {
            // Création de l'embed
            const embed = new EmbedBuilder()
                .setColor(0x00FF00) // Vert (tu peux utiliser une couleur HEX ou une constante comme 'Green')
                .setTitle('👋 **Nouveau membre**')
                .setDescription(`${member.user.tag} a rejoint le serveur ! 🎉`)
                .addFields(
                    { name: '🔗 ID du membre', value: `${member.id}` },
                    { name: '📊 Nombre total de membres', value: `${member.guild.memberCount}` }
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
                .setFooter({ text: 'Bot codé par Shelby S. ! 🚀', iconURL: member.guild.iconURL({ dynamic: true }) })
                .setTimestamp();

            // Envoie de l'embed dans le channel "logs"
            logChannel.send({ embeds: [embed] });
        } else {
            console.error('Channel "logs" introuvable dans le serveur.');
        }
    },
};
