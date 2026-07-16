require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const cors = require('cors');

// 1. Create the Bot client FIRST so it is defined for the rest of the file
const bot = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

// 2. Set up Express Web Server
const app = express();
app.use(cors());
app.use(express.json());

// 3. Database Schema
const ServerConfig = mongoose.model('ServerConfig', new mongoose.Schema({
    discordGuildId: String,
    erlcApiKey: String,
    statusDisplay: { type: String, default: "Offline" }
}));

// 4. API Endpoint for your website
app.get('/api/status/:guildId', async (req, res) => {
    try {
        const config = await ServerConfig.findOne({ discordGuildId: req.params.guildId });
        if (!config) return res.status(404).json({ error: "No API key found." });

        const response = await fetch("https://api.erlc.gg/v2/server?Players=true", {
            headers: { "server-key": config.erlcApiKey }
        });
        const data = await response.json();
        
        res.json({
            erlcData: data,
            displayStatus: config.statusDisplay
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch ER:LC data." });
    }
});

// 5. Discord Bot Events & Commands
bot.on('ready', () => {
    console.log(`Bot logged in as ${bot.user.tag}!`);
});

bot.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Setup Command
    if (message.content.startsWith('!setup')) {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply("❌ You must be an Administrator to configure this bot.");
        }

        const args = message.content.split(' ');
        const apiKey = args[1];

        if (!apiKey) {
            return message.reply("❌ Please provide your ER:LC API key. Example: `!setup your_key_here` \n*(The bot will immediately delete your message to protect your key)*");
        }

        try {
            await message.delete();
        } catch (err) {
            console.log("Could not delete message. Check bot permissions.");
        }

        await ServerConfig.findOneAndUpdate(
            { discordGuildId: message.guild.id }, 
            { erlcApiKey: apiKey },
            { upsert: true, new: true }
        );

        message.channel.send(`✅ **Setup Successful!**\nYour ER:LC server is now linked. Here is your dashboard link:\nhttps://your-website.vercel.app/?guild=${message.guild.id}`);
    }

    // Set Status Command
    if (message.content.startsWith('!setstatus')) {
        const args = message.content.split(' ');
        const newStatus = args[1];

        if (!newStatus) {
            return message.reply("Please specify a status. Example: `!setstatus Green`");
        }

        const updated = await ServerConfig.findOneAndUpdate(
            { discordGuildId: message.guild.id }, 
            { statusDisplay: newStatus },
            { new: true }
        );

        if (!updated) {
            return message.reply("❌ This server has not been set up yet. Use `!setup <key>` first.");
        }

        message.reply(`🚦 Status updated to **${newStatus}**! The website will update in a few seconds.`);
    }
});

// 6. Connect to Database & Start everything
mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log("Connected to MongoDB!");
    app.listen(process.env.PORT || 3000, () => console.log(`Web API running!`));
    bot.login(process.env.DISCORD_TOKEN);
}).catch(err => {
    console.error("Database connection error:", err);
});