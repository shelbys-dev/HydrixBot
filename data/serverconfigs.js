const fs = require('fs');
const path = require('path');

// Chemin vers le fichier JSON
const CONFIG_FILE = path.join(__dirname, 'serverConfigs.json');
// Charger les données depuis le fichier
let serverConfigs = new Map();

function loadConfigs() {
    if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const jsonData = JSON.parse(data);
        // Transforme les données de l'objet en une Map
        serverConfigs = new Map(
            Object.entries(jsonData).map(([guildId, config]) => [
                guildId,
                {
                    links: config.links || [],
                    autoMessageChannel: config.autoMessageChannel || null,
                    autoMessageContent: config.autoMessageContent || null,
                    autoMessageInterval: config.autoMessageInterval || null,
                    autoMessageEnabled: config.autoMessageEnabled || false,
                },
            ])
        );
    }
}

function saveConfigs() {
    const jsonData = Object.fromEntries(
        Array.from(serverConfigs.entries()).map(([guildId, config]) => [
            guildId,
            {
                links: config.links || [],
                autoMessageChannel: config.autoMessageChannel || null,
                autoMessageContent: config.autoMessageContent || null,
                autoMessageInterval: config.autoMessageInterval || null,
                autoMessageEnabled: config.autoMessageEnabled || false,
            },
        ])
    ); // Convertir en objet JSON
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(jsonData, null, 2), 'utf-8');
}

// Charger les données au démarrage
loadConfigs();

// Exporter la Map et les fonctions
module.exports = {
    serverConfigs,
    saveConfigs,
};
