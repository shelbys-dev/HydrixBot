const fs = require('fs');
const path = require('path');

// Chemin vers le fichier JSON
const REACTION_COUNTS_FILE = path.join(__dirname, 'reactionCounts.json');
// Stockage temporaire des signalements
let reactionCounts = new Map(); // Exemple : Map<messageId, { count, users }>

// Charger les données depuis le fichier JSON (au démarrage)
function loadReactionCounts() {
    if (fs.existsSync(REACTION_COUNTS_FILE)) {
        try {
            const data = fs.readFileSync(REACTION_COUNTS_FILE, 'utf-8');

            if (data.trim() === '') {
                console.warn(`${REACTION_COUNTS_FILE} est vide. La Map reactionCounts sera initialisée vide.`);
                reactionCounts = new Map();
                return;
            }

            const jsonData = JSON.parse(data);

            reactionCounts = new Map(
                Object.entries(jsonData).map(([messageId, counts]) => [
                    messageId,
                    {
                        count: counts.count,
                        users: new Set(counts.users), // Reconvertir Array en Set
                        // Timeout n'est pas chargé depuis le fichier
                    },
                ])
            );

            console.log(`Données chargées depuis ${REACTION_COUNTS_FILE}`);
        } catch (error) {
            console.error(`Erreur lors du chargement de ${REACTION_COUNTS_FILE} :`, error.message);
            reactionCounts = new Map(); // Initialisation vide si erreur
        }
    } else {
        console.warn(`Le fichier ${REACTION_COUNTS_FILE} n'existe pas. Un nouveau fichier vide sera créé.`);
        reactionCounts = new Map(); // Initialisation vide
        saveReactionCounts();
    }
}

// Sauvegarder les données dans le fichier JSON
function saveReactionCounts() {
    if (reactionCounts.size === 0) {
        console.log('Aucune donnée à sauvegarder (reactionCounts est vide). Annulation de l’écriture.');
        return;
    }

    const jsonData = Object.fromEntries(
        Array.from(reactionCounts.entries()).map(([messageId, counts]) => [
            messageId,
            {
                count: counts.count,
                users: Array.from(counts.users), // Convertir Set en tableau
                // Exclure timeout de la sérialisation
            },
        ])
    );

    console.log('Contenu de reactionCounts avant sauvegarde :', jsonData);

    try {
        fs.writeFileSync(REACTION_COUNTS_FILE, JSON.stringify(jsonData, null, 2), 'utf-8');
        console.log(`Données sauvegardées dans ${REACTION_COUNTS_FILE}`);
    } catch (error) {
        console.error(`Erreur lors de la sauvegarde dans ${REACTION_COUNTS_FILE} :`, error.message);
    }
}


// Exporter les fonctions et la Map
module.exports = {
    reactionCounts,
    loadReactionCounts,
    saveReactionCounts
};
