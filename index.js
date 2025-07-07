const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

require('dotenv').config(); // Charger les variables d'environnement depuis le fichier .env

// Créer un client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates, // Ce champ est CRUCIAL pour détecter les changements vocaux
    ],
    partials: [
        Partials.Message,
        Partials.Reaction,
        Partials.User
    ],
});

// Collection pour stocker les commandes
client.commands = new Collection();

// Lecture des commandes dans le dossier "commands"
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

// Enregistrement des commandes auprès de l'API Discord
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
// Fonction pour enregistrer les commandes
(async () => {
    try {
        const commands = client.commands.map(command => command.data.toJSON());
        console.log(`Commandes à enregistrer : ${client.commands.map(cmd => cmd.data.name).join(', ')}`);
        console.log('Début de l\'enregistrement des commandes slash...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID), // Enregistre les commandes globalement
            { body: commands }
        );
        console.log('Commandes enregistrées globalement et disponibles sur tous les serveurs. ✅');
    } catch (error) {
        console.error(error);
    }
})();

// Charger les événements
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

const { loadReactionCounts, saveReactionCounts } = require('./data/reactionCount.js');

// Charger les données au démarrage
loadReactionCounts();

process.on('SIGINT', () => {
    // Sauvegarder les données en cas de fermeture avec Ctrl + C
    saveReactionCounts();
    process.exit();
});

process.on('exit', (code) => {
    console.log(`Processus terminé avec le code : ${code}. Sauvegarde des données avant de quitter.`);
    saveReactionCounts();
});


// Connexion du bot
client.login(process.env.TOKEN);
