module.exports = {
    name: 'guildCreate',
    execute(guild, client) {
        const config = getServerConfig(guild.id); // Crée une configuration pour ce serveur
        console.log(`Nouveau serveur ajouté : ${guild.name} (id: ${guild.id})`);

        // Envoyer un message de bienvenue dans un canal texte (si disponible)
        const defaultChannel = guild.channels.cache.find(
            (channel) => channel.type === 0 && channel.permissionsFor(guild.me).has('SEND_MESSAGES') // Vérifie si le bot peut écrire
        );
        if (defaultChannel) {
            defaultChannel.send(
                "Merci de m'avoir ajouté à votre serveur ! Utilisez `/help` pour voir les commandes disponibles. Configurez-moi en utilisant les commandes Slash comme `/setup, /setMuteRole` ou `/setThreshold`. 🚀"
            );
        }
    },
};
