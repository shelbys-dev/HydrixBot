const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    category: 'Fun',
    data: new SlashCommandBuilder()
        .setName('chats') // Nom de la commande
        .setDescription('Obtiens une image aléatoire de chat 🐱'), // Description

    async execute(interaction) {
        try {
            // Appeler l'API pour obtenir une image aléatoire de chat
            const response = await fetch('https://api.thecatapi.com/v1/images/search');
            const data = await response.json();
            const catImageUrl = data[0].url; // URL de l'image

            // Créer un embed pour envoyer l'image
            const embed = new EmbedBuilder()
                .setColor('#FFA500') // Couleur orange (exemple)
                .setTitle('Voici un adorable chat ! 😺')
                .setImage(catImageUrl) // Ajouter l'image
                .setFooter({ 
                    text: 'Tu aimes les chats ? Viens à l\'atelier des chats !',
                    iconURL: 'https://gem-chat-typique.fr/wp-content/uploads/2025/01/icon.png' 
                })
                .setTimestamp();

            // Répondre avec l'embed
            await interaction.reply({
                embeds: [embed],
                ephemeral: true, // Privé pour éviter l'embarras en public
            });
        } catch (error) {
            console.error('Erreur lors de l’appel à TheCatAPI :', error);
            // Envoyer une réponse d’erreur à l’utilisateur
            await interaction.reply({
                content: '😿 Oups ! Je n’ai pas réussi à trouver un chat cette fois. Réessaie plus tard !',
                ephemeral: true, // Privé pour éviter l'embarras en public
            });
        }
    },
};
