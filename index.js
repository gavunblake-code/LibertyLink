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
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 3. Simple Database Schema & Model for Server Status
const serverSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    serverName: { type: String, default: "ER:LC Server" },
    status: { type: String, default: "Offline" },
    players: { type: Number, default: 0 }
});
const ServerStatus = mongoose.model('ServerStatus', serverSchema);

// 4. API Endpoints for your HTML Dashboard to Fetch Data
app.get('/api/status/:guildId', async (req, res) => {
    try {
        const data = await ServerStatus.findOne({ guildId: req.params.guildId });
        if (!data) return res.status(404).json({ error: "Server status not found." });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Server error fetching status." });
    }
});

// 5. Discord Bot Events & Commands
bot.once('ready', () => {
    console.log(`Bot logged in as ${bot.user.tag}!`);
});

bot.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Command: !setup (Sends the user their custom dashboard link)
    if (message.content.startsWith('!setup')) {
        const guildId = message.guildId;
        if (!guildId) return message.reply("This command can only be used in a Discord Server.");

        // Your custom GitHub Pages URL! 
        const dashboardUrl = `https://gavunblake-code.github.io/LibertyLink/?guild=${guildId}`;

        await message.reply({
            content: `✅ **Setup Successful!**\nYour ER:LC server is now linked. Here is your dashboard link:\n${dashboardUrl}`
        });
    }

    // Command: !setstatus [Online/Offline] [Players] (Updates database)
    if (message.content.startsWith('!setstatus')) {
        const args = message.content.split(' ').slice(1);
        const newStatus = args[0] || 'Offline';
        const playerCount = parseInt(args[1], 10) || 0;
        const guildId = message.guildId;

        if (!guildId) return message.reply("This command must be run in a server.");

        try {
            await ServerStatus.findOneAndUpdate(
                { guildId },
                { 
                    status: newStatus, 
                    players: playerCount,
                    serverName: message.guild.name 
                },
                { upsert: true, new: true }
            );

            message.reply(`🚨 Status updated to **${newStatus}**! The website will now show **${playerCount}** players online.`);
        } catch (err) {
            console.error("Failed to update database status:", err);
            message.reply("❌ Error saving status to the database.");
        }
    }
});

// 6. Connect to Database & Start everything
mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log("Connected to MongoDB!");
    app.listen(process.env.PORT || 3000, () => {
        console.log(`Web API running on port ${process.env.PORT || 3000}!`);
    });
    bot.login(process.env.DISCORD_TOKEN);
}).catch(err => {
    console.error("Database connection error:", err);
});