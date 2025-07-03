const { ChannelType, PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'voiceStateUpdate', // Nom de l'événement
    async execute(oldState, newState) {
        const guild = newState.guild;

        // Vérifie si l'utilisateur rejoint un salon vocal
        if (!newState.channelId || newState.channelId === oldState.channelId) return;

        const createChannelId = '1390410735200239626'; // Remplace par l'ID du salon "Crée ton salon"

        // Si l'utilisateur rejoint bien le salon "Crée ton salon"
        if (newState.channelId === createChannelId) {
            const member = newState.member;

            // Créer un nouveau salon vocal sous la catégorie du salon original
            const privateVoiceChannel = await guild.channels.create({
                name: `Salon de ${member.user.username}`, // "Salon de [pseudo]"
                type: ChannelType.GuildVoice,
                parent: newState.channel.parentId, // Même catégorie que le salon "Crée ton salon"
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionsBitField.Flags.Connect] // Bloquer l'accès public
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.ManageChannels
                        ] // Donne les permissions au créateur
                    }
                ]
            });

            // Déplacer l'utilisateur dans le nouveau salon vocal
            await member.voice.setChannel(privateVoiceChannel);

            // Supprimer le salon automatiquement s'il reste vide
            const checkEmpty = setInterval(async () => {
                if (privateVoiceChannel.members.size === 0) {
                    clearInterval(checkEmpty); // Arrêter la vérification
                    setTimeout(async () => {
                        if (privateVoiceChannel.members.size === 0) {
                            await privateVoiceChannel.delete()
                                .catch(console.error); // Supprime le salon si toujours vide
                            console.log(`Salon vocal privé "${privateVoiceChannel.name}" supprimé pour cause d'inactivité.`);
                        }
                    });
                }
            }, 10 * 1000); // Vérifie toutes les 10 secondes
        }
    }
};
