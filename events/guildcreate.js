const { ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'guildCreate',
    execute(guild, client) {
        console.log(`Nouveau serveur ajouté : ${guild.name} (id: ${guild.id})`);

        // Trouver un salon texte par défaut
        const defaultChannel = guild.channels.cache.find((channel) =>
            channel.type === ChannelType.GuildText && // Vérifie que c'est un salon texte
            channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages) // Vérifie si le bot peut écrire
        );

        // Si un salon texte est trouvé, envoyer un message de bienvenue
        if (defaultChannel) {
            defaultChannel.send(
                "Merci de m'avoir ajouté à votre serveur ! Utilisez `/help` pour voir les commandes disponibles. Configurez-moi en utilisant les commandes Slash comme `/setup, /setMuteRole` ou `/setThreshold`. 🚀"
            ).catch((err) => {
                console.error(`Impossible d'envoyer un message dans le salon ${defaultChannel.name} :`, err);
            });
        } else {
            console.warn(`Aucun salon texte accessible pour le bot sur le serveur ${guild.name}`);
        }
    },
};
