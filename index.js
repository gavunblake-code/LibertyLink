const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// 1. Initialize Express App for our Backend API
const app = express();
app.use(cors());
app.use(express.json());

// 2. Initialize Discord Client
const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// 3. Database Schema: Added 'isWhitelisted' flag
const serverSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    serverName: { type: String, default: "ER:LC Server" },
    players: { type: Number, default: 0 },
    isWhitelisted: { type: Boolean, default: false } // Tracks active WL override sessions
});
const ServerStatus = mongoose.model('ServerStatus', serverSchema);

// 4. API Endpoint: Automatically calculates status & overrides counts if WL is active
app.get('/api/status/:guildId', async (req, res) => {
    try {
        const data = await ServerStatus.findOne({ guildId: req.params.guildId });
        if (!data) return res.status(404).json({ error: "Server status not found." });

        let displayStatus = "Offline";
        let displayPlayers = 0;

        // Apply whitelist override or auto-status rules
        if (data.isWhitelisted) {
            displayStatus = "Whitelisted";
            displayPlayers = 0; // Look like 0 players
        } else {
            if (data.players >= 1) {
                displayStatus = "Online";
                displayPlayers = data.players;
            } else {
                displayStatus = "Offline";
                displayPlayers = 0;
            }
        }

        res.json({
            guildId: data.guildId,
            serverName: data.serverName,
            status: displayStatus,
            players: displayPlayers
        });
    } catch (err) {
        res.status(500).json({ error: "Server error fetching status." });
    }
});

// 5. Register Slash Commands on Bot Ready
bot.once('ready', async () => {
    console.log(`Bot logged in as ${bot.user.tag}!`);
    
    try {
        // Registers commands globally across Discord
        await bot.application.commands.set([
            {
                name: 'setup',
                description: 'Get your custom dashboard link'
            },
            {
                name: 'setplayers',
                description: 'Update the active player count (Auto sets Online/Offline status)',
                options: [
                    {
                        name: 'count',
                        type: 4, // INTEGER
                        description: 'Current number of players online',
                        required: true
                    }
                ]
            },
            {
                name: 'start',
                description: 'Start a session override',
                options: [
                    {
                        name: 'session',
                        type: 3, // STRING
                        description: 'Type of session to start',
                        required: true,
                        choices: [
                            { name: 'wl', value: 'wl' }
                        ]
                    }
                ]
            },
            {
                name: 'end',
                description: 'End a session override',
                options: [
                    {
                        name: 'session',
                        type: 3, // STRING
                        description: 'Type of session to end',
                        required: true,
                        choices: [
                            { name: 'wl', value: 'wl' }
                        ]
                    }
                ]
            }
        ]);
        console.log("Slash commands registered successfully!");
    } catch (error) {
        console.error("Failed to register slash commands:", error);
    }
});

// 6. Handle Slash Commands (Interactions)
bot.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guildId, guild } = interaction;
    if (!guildId) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });

    // /setup
    if (commandName === 'setup') {
        const dashboardUrl = `https://gavunblake-code.github.io/LibertyLink/?guild=${guildId}`;
        return interaction.reply({
            content: `✅ **Setup Successful!**\nYour ER:LC server is now linked. Here is your dashboard link:\n${dashboardUrl}`
        });
    }

    // /setplayers [count]
    if (commandName === 'setplayers') {
        const count = interaction.options.getInteger('count');
        if (count < 0) return interaction.reply({ content: "❌ Player count cannot be negative.", ephemeral: true });
        
        try {
            const data = await ServerStatus.findOneAndUpdate(
                { guildId },
                { 
                    players: count,
                    serverName: guild.name 
                },
                { upsert: true, new: true }
            );

            let statusMessage = "";
            if (data.isWhitelisted) {
                statusMessage = `Whitelisted (but player tracking updated to ${count} internally)`;
            } else {
                statusMessage = count >= 1 ? `Online with **${count}** players` : `Offline`;
            }

            return interaction.reply({
                content: `🚨 Server updated to **${statusMessage}**!`
            });
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: "❌ Error updating player count.", ephemeral: true });
        }
    }

    // /start wl
    if (commandName === 'start') {
        const session = interaction.options.getString('session');
        if (session === 'wl') {
            try {
                await ServerStatus.findOneAndUpdate(
                    { guildId },
                    { isWhitelisted: true, serverName: guild.name },
                    { upsert: true }
                );
                return interaction.reply({
                    content: `🔒 **Whitelisted (WL) Session Started!**\nThe dashboard will now show the server as **Whitelisted** with **0 players** online, even if players join.`
                });
            } catch (err) {
                console.error(err);
                return interaction.reply({ content: "❌ Error starting whitelist session.", ephemeral: true });
            }
        }
    }

    // /end wl
    if (commandName === 'end') {
        const session = interaction.options.getString('session');
        if (session === 'wl') {
            try {
                const data = await ServerStatus.findOneAndUpdate(
                    { guildId },
                    { isWhitelisted: false, serverName: guild.name },
                    { upsert: true, new: true }
                );

                const currentPlayers = data.players;
                const statusText = currentPlayers >= 1 ? "Online" : "Offline";

                return interaction.reply({
                    content: `🔓 **Whitelisted (WL) Session Ended!**\nNormal tracking resumed. The server is now showing as **${statusText}** with **${currentPlayers}** players.`
                });
            } catch (err) {
                console.error(err);
                return interaction.reply({ content: "❌ Error ending whitelist session.", ephemeral: true });
            }
        }
    }
});

// 7. Connect to Database & Start everything
mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log("Connected to MongoDB!");
    app.listen(process.env.PORT || 3000, () => {
        console.log(`Web API running on port ${process.env.PORT || 3000}!`);
    });
    bot.login(process.env.DISCORD_TOKEN);
}).catch(err => {
    console.error("Database connection error:", err);
});