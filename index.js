const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// 1. Initialize Express App
const app = express();
app.use(cors());
app.use(express.json());

// 2. Initialize Discord Client
const bot = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// 3. Database Schema (Added Styling & Permissions!)
const serverSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    serverName: { type: String, default: "ER:LC Server" },
    players: { type: Number, default: 0 },
    isWhitelisted: { type: Boolean, default: false },
    adminRoleId: { type: String, default: null },         // Stores the allowed Staff Role
    themeColor: { type: String, default: "#2b2d31" },     // Default Discord dark gray
    fontFamily: { type: String, default: "Arial, sans-serif" } // Default font
});
const ServerStatus = mongoose.model('ServerStatus', serverSchema);

// 4. API Endpoint (Now sends the customization data too)
app.get('/api/status/:guildId', async (req, res) => {
    try {
        const data = await ServerStatus.findOne({ guildId: req.params.guildId });
        if (!data) return res.status(404).json({ error: "Server status not found. Run /setup in Discord." });

        let displayStatus = data.isWhitelisted ? "Whitelisted" : (data.players >= 1 ? "Online" : "Offline");
        let displayPlayers = data.isWhitelisted ? 0 : data.players;

        res.json({
            guildId: data.guildId,
            serverName: data.serverName,
            status: displayStatus,
            players: displayPlayers,
            themeColor: data.themeColor,
            fontFamily: data.fontFamily
        });
    } catch (err) {
        res.status(500).json({ error: "Server error fetching status." });
    }
});

// Root endpoint to keep Render awake
app.get('/', (req, res) => {
    res.send("🚀 LibertyLink API is online and running!");
});

// 5. Register Slash Commands
bot.once('ready', async () => {
    console.log(`Bot logged in as ${bot.user.tag}!`);
    try {
        await bot.application.commands.set([
            {
                name: 'setup',
                description: 'Set up the dashboard and define the Staff Role',
                options: [{
                    name: 'staff_role',
                    type: 8, // ROLE type
                    description: 'The role allowed to change server status',
                    required: true
                }]
            },
            {
                name: 'customize',
                description: 'Change your dashboard look (Staff Only)',
                options: [
                    { name: 'color', type: 3, description: 'Hex color code (e.g., #ff0000 for red)', required: false },
                    { name: 'font', type: 3, description: 'Choose a font style', required: false, choices: [
                        { name: 'Modern (Sans-serif)', value: 'Arial, sans-serif' },
                        { name: 'Classic (Serif)', value: 'Georgia, serif' },
                        { name: 'Coding (Monospace)', value: '"Courier New", monospace' }
                    ]}
                ]
            },
            {
                name: 'setplayers',
                description: 'Update the active player count (Staff Only)',
                options: [{ name: 'count', type: 4, description: 'Number of players', required: true }]
            },
            {
                name: 'start',
                description: 'Start a session override (Staff Only)',
                options: [{ name: 'session', type: 3, description: 'Type', required: true, choices: [{ name: 'wl', value: 'wl' }]}]
            },
            {
                name: 'end',
                description: 'End a session override (Staff Only)',
                options: [{ name: 'session', type: 3, description: 'Type', required: true, choices: [{ name: 'wl', value: 'wl' }]}]
            }
        ]);
        console.log("Slash commands registered!");
    } catch (error) {
        console.error("Failed to register commands:", error);
    }
});

// Helper Function: Check Permissions
async function checkPermission(interaction, guildData) {
    // Server Administrators ALWAYS have permission
    if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    // If a staff role is set, check if the user has it
    if (guildData && guildData.adminRoleId && interaction.member.roles.cache.has(guildData.adminRoleId)) return true;
    return false;
}

// 6. Handle Commands
bot.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, guildId, guild } = interaction;
    if (!guildId) return interaction.reply({ content: "Commands only work in servers.", ephemeral: true });

    // Fetch current db data
    let guildData = await ServerStatus.findOne({ guildId });

    // /setup (Requires Discord Administrator to initially run)
    if (commandName === 'setup') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ Only Server Administrators can run the initial setup.", ephemeral: true });
        }
        
        const staffRole = interaction.options.getRole('staff_role');
        
        await ServerStatus.findOneAndUpdate(
            { guildId },
            { serverName: guild.name, adminRoleId: staffRole.id },
            { upsert: true, new: true }
        );

        const dashboardUrl = `https://gavunblake-code.github.io/LibertyLink/?guild=${guildId}`;
        return interaction.reply({
            content: `✅ **Setup Complete!**\nMembers with the **${staffRole.name}** role can now manage the bot.\n🔗 Dashboard: ${dashboardUrl}`
        });
    }

    // Permission check for all commands below this line
    if (!await checkPermission(interaction, guildData)) {
        return interaction.reply({ content: "🚫 You do not have the required Staff role to use this command.", ephemeral: true });
    }

    // /customize
    if (commandName === 'customize') {
        const color = interaction.options.getString('color') || guildData?.themeColor || '#2b2d31';
        const font = interaction.options.getString('font') || guildData?.fontFamily || 'Arial, sans-serif';

        await ServerStatus.findOneAndUpdate(
            { guildId },
            { themeColor: color, fontFamily: font },
            { upsert: true }
        );
        return interaction.reply(`🎨 **Dashboard Updated!**\nColor: \`${color}\`\nFont: \`${font}\``);
    }

    // /setplayers
    if (commandName === 'setplayers') {
        const count = interaction.options.getInteger('count');
        const data = await ServerStatus.findOneAndUpdate(
            { guildId }, { players: count }, { upsert: true, new: true }
        );
        return interaction.reply(`🚨 Updated! Players: **${count}**`);
    }

    // /start wl
    if (commandName === 'start' && interaction.options.getString('session') === 'wl') {
        await ServerStatus.findOneAndUpdate({ guildId }, { isWhitelisted: true }, { upsert: true });
        return interaction.reply(`🔒 **Whitelisted Session Started!** Displaying as 0 players.`);
    }

    // /end wl
    if (commandName === 'end' && interaction.options.getString('session') === 'wl') {
        await ServerStatus.findOneAndUpdate({ guildId }, { isWhitelisted: false }, { upsert: true });
        return interaction.reply(`🔓 **Whitelisted Session Ended!** Normal tracking resumed.`);
    }
});

// 7. Connect & Start
mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log("Connected to MongoDB!");
    app.listen(process.env.PORT || 3000, () => console.log(`API running!`));
    bot.login(process.env.DISCORD_TOKEN);
});