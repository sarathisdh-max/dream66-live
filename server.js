const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());
// 🛠️ Updated path to match your folder structure (mani-app/public)
app.use(express.static(path.join(__dirname, 'mani-app', 'public')));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sarathisdh_db_user:Sarathi2007@cluster0.qmjrufz.mongodb.net/dream66?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('🔥 Connected to MongoDB Atlas Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Schemas & Models
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    totalDeposit: { type: Number, default: 0 },
    totalTurnover: { type: Number, default: 0 },
    vipLevel: { type: Number, default: 1 },
    isBlocked: { type: Boolean, default: false },
    bankDetails: {
        accountHolderName: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        ifscCode: { type: String, default: '' }
    }
});

const transactionSchema = new mongoose.Schema({
    phone: { type: String, required: true },
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    utrNumber: { type: String },
    status: { type: String, default: 'Pending' },
    date: { type: Date, default: Date.now }
});

const chatSchema = new mongoose.Schema({
    phone: { type: String, required: true },
    sender: { type: String, required: true }, // 'user' or 'admin'
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Chat = mongoose.model('Chat', chatSchema);

const otpStorage = {};
let globalAnnouncement = "Welcome to DREAM 66! Play Aviator & JetX safely.";
let activeOnlineUsers = 0;

// Game History & Multipliers
let aviatorHistory = [1.50, 2.10, 1.12, 3.40];
let jetxHistory = [1.80, 1.30, 2.50, 1.05];

let aviatorNextTarget = 2.00;
let jetxNextTarget = 2.00;
let aviatorManualSet = false;
let jetxManualSet = false;

// Static & Game Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'mani-app', 'public', 'index.html')));
app.get('/payment.html', (req, res) => res.sendFile(path.join(__dirname, 'mani-app', 'public', 'payment.html')));

app.get('/:page', (req, res, next) => {
    let pageName = req.params.page;
    if (!pageName.endsWith('.html')) pageName += '.html';
    const filePath = path.join(__dirname, 'mani-app', 'public', pageName);
    
    res.sendFile(filePath, (err) => {
        if (err) {
            const gamePath = path.join(__dirname, 'mani-app', 'public', 'games', pageName);
            res.sendFile(gamePath, (err2) => { if (err2) next(); });
        }
    });
});

// APIs & Auth
app.post('/api/send-otp', (req, res) => {
    const { phone } = req.body;
    if (!phone || phone.length !== 10) {
        return res.status(400).json({ success: false, message: 'சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும்.' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStorage[phone] = otp;
    res.status(200).json({ success: true, message: 'OTP வெற்றிகரமாக அனுப்பப்பட்டது!' });
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, otp, password } = req.body;
        if (!name || !phone || !otp || !password) {
            return res.status(400).json({ success: false, message: 'அனைத்து விவரங்களையும் நிரப்பவும்.' });
        }
        if (otpStorage[phone] != otp) {
            return res.status(400).json({ success: false, message: 'தவறான OTP!' });
        }

        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'இந்த எண் ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது!' });
        }

        const newUser = new User({ name, phone, password, balance: 0, vipLevel: 1 });
        await newUser.save();
        delete otpStorage[phone];
        res.status(200).json({ success: true, message: 'பதிவு வெற்றிகரமாக முடிந்தது!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        const user = await User.findOne({ phone, password });
        if (!user) {
            return res.status(400).json({ success: false, message: 'தவறான மொபைல் எண் அல்லது கடவுச்சொல்!' });
        }
        if (user.isBlocked) {
            return res.status(403).json({ success: false, message: 'உங்கள் கணக்கு நிர்வாகியால் முடக்கப்பட்டுள்ளது!' });
        }
        res.status(200).json({ 
            success: true, 
            message: 'Login successful', 
            balance: user.balance,
            vipLevel: user.vipLevel,
            bankDetails: user.bankDetails 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USER || "admin";
    const adminPass = process.env.ADMIN_PASS || "Sarathi@2007";

    if (username === adminUser && password === adminPass) {
        res.status(200).json({ success: true, message: 'Admin Login successful' });
    } else {
        res.status(400).json({ success: false, message: 'தவறான அட்மின் யூசர் பெயர் அல்லது கடவுச்சொல்!' });
    }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { phone, amount, utrNumber } = req.body;
        const existingTx = await Transaction.findOne({ utrNumber });
        if (existingTx) {
            return res.status(400).json({ success: false, message: 'இந்த UTR எண் ஏற்கனவே பயன்படுத்தப்பட்டுள்ளது!' });
        }

        const newTx = new Transaction({ phone, type: 'Deposit', amount: Number(amount), utrNumber, status: 'Pending' });
        await newTx.save();
        res.status(200).json({ success: true, message: 'டெபாசிட் கோரிக்கை சமர்ப்பிக்கப்பட்டது!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// VIP WITHDRAWAL API
app.post('/api/withdraw', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        const numAmount = Number(amount);

        if (numAmount < 110) {
            return res.status(400).json({ success: false, message: 'குறைந்தபட்ச வித்ராவ் தொகை ₹110 இருக்க வேண்டும்!' });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(400).json({ success: false, message: 'பயனர் கிடைக்கவில்லை.' });
        }

        let maxPerWithdraw = 1000;
        let maxDailyCount = 2;

        switch (user.vipLevel) {
            case 1: maxPerWithdraw = 1000; maxDailyCount = 2; break;
            case 2: maxPerWithdraw = 3000; maxDailyCount = 3; break;
            case 3: maxPerWithdraw = 5000; maxDailyCount = 4; break;
            case 4: maxPerWithdraw = 10000; maxDailyCount = 5; break;
            case 5: maxPerWithdraw = 20000; maxDailyCount = 7; break;
            case 6: maxPerWithdraw = 30000; maxDailyCount = 10; break;
            case 7: maxPerWithdraw = 50000; maxDailyCount = 15; break;
            case 8: maxPerWithdraw = 70000; maxDailyCount = 20; break;
            case 9: maxPerWithdraw = 80000; maxDailyCount = 25; break;
            case 10: maxPerWithdraw = 100000; maxDailyCount = 30; break;
            case 11: maxPerWithdraw = 150000; maxDailyCount = 35; break;
            case 12: maxPerWithdraw = 200000; maxDailyCount = 40; break;
            case 13: maxPerWithdraw = 250000; maxDailyCount = 45; break;
            case 14: maxPerWithdraw = 300000; maxDailyCount = 50; break;
            default: maxPerWithdraw = 500000; maxDailyCount = 60; break;
        }

        if (numAmount > maxPerWithdraw) {
            return res.status(400).json({ 
                success: false, 
                message: `உங்கள் VIP Level ${user.vipLevel}-க்கு ஒரு முறைக்கு அனுமதிக்கப்பட்ட அதிகபட்ச வித்ராவ் வரம்பு ₹${maxPerWithdraw} மட்டுமே!` 
            });
        }

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const todayWithdrawalsCount = await Transaction.countDocuments({
            phone: phone,
            type: 'Withdrawal',
            status: { $in: ['Pending', 'Approved'] },
            date: { $gte: startOfDay }
        });

        if (todayWithdrawalsCount >= maxDailyCount) {
            return res.status(400).json({ 
                success: false, 
                message: `இன்றைய நாளுக்கான வித்ராவ் வரம்பு முடிந்துவிட்டது! உங்கள் VIP Level ${user.vipLevel}-க்கு ஒரு நாளைக்கு ${maxDailyCount} முறை மட்டுமே அனுமதிக்கப்படும்.` 
            });
        }

        if (user.balance < numAmount) {
            return res.status(400).json({ success: false, message: 'கணக்கில் போதுமான பேலன்ஸ் இல்லை!' });
        }

        user.balance -= numAmount;
        await user.save();

        const newTx = new Transaction({ phone, type: 'Withdrawal', amount: numAmount, status: 'Pending' });
        await newTx.save();

        res.status(200).json({ success: true, message: 'வித்ராவ் கோரிக்கை வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது!', newBalance: user.balance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Chat History API
app.get('/api/chat/history/:phone', async (req, res) => {
    try {
        const chats = await Chat.find({ phone: req.params.phone }).sort({ timestamp: 1 });
        res.status(200).json({ success: true, chats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin Control APIs
app.post('/api/admin/set-target', (req, res) => {
    const { game, target } = req.body;
    if (!game || target === undefined) {
        return res.status(400).json({ success: false, message: 'விவரங்கள் போதாது.' });
    }
    if (game === 'jetx') {
        jetxNextTarget = parseFloat(target);
        jetxManualSet = true;
        io.emit('jetxNextTargetUpdate', jetxNextTarget.toFixed(2));
    } else if (game === 'aviator') {
        aviatorNextTarget = parseFloat(target);
        aviatorManualSet = true;
        io.emit('aviatorNextTargetUpdate', aviatorNextTarget.toFixed(2));
    }
    res.status(200).json({ success: true, message: `${game.toUpperCase()} டார்கெட் ${target}x ஆக பிக்ஸ் செய்யப்பட்டது!` });
});

app.post('/api/admin/block-user', async (req, res) => {
    try {
        const { phone, isBlocked } = req.body;
        const user = await User.findOne({ phone });
        if (!user) return res.status(400).json({ success: false, message: 'பயனர் கிடைக்கவில்லை.' });
        user.isBlocked = isBlocked;
        await user.save();
        res.status(200).json({ success: true, message: `பயனர் வெற்றிகரமாக ${isBlocked ? 'முடக்கப்பட்டுள்ளார்' : 'விடுவிக்கப்பட்டுள்ளார்'}!` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/set-vip', async (req, res) => {
    try {
        const { phone, vipLevel } = req.body;
        const user = await User.findOne({ phone });
        if (!user) return res.status(400).json({ success: false, message: 'பயனர் கிடைக்கவில்லை.' });
        user.vipLevel = Number(vipLevel);
        await user.save();
        res.status(200).json({ success: true, message: `பயனரின் VIP Level ${vipLevel} என மாற்றப்பட்டது!` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/adjust-balance', async (req, res) => {
    try {
        const { phone, amount, type } = req.body;
        const user = await User.findOne({ phone });
        if (!user) return res.status(400).json({ success: false, message: 'பயனர் கிடைக்கவில்லை.' });

        const numAmount = Number(amount);
        if (type === 'add') {
            user.balance += numAmount;
        } else if (type === 'subtract') {
            user.balance = Math.max(0, user.balance - numAmount);
        }
        await user.save();
        res.status(200).json({ success: true, message: `பயனர் வாலட் வெற்றிகரமாக மாற்றப்பட்டது! புதிய பேலன்ஸ்: ₹${user.balance}` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/announcement', (req, res) => {
    const { message } = req.body;
    if (message) {
        globalAnnouncement = message;
        io.emit('announcementUpdate', globalAnnouncement);
        res.status(200).json({ success: true, message: 'அறிவிப்பு வெற்றிகரமாக வெளியிடப்பட்டது!' });
    } else {
        res.status(400).json({ success: false, message: 'செய்தி காலியாக இருக்கக்கூடாது.' });
    }
});

app.get('/api/announcement', (req, res) => {
    res.status(200).json({ success: true, announcement: globalAnnouncement });
});

// TRANSACTION ACTION API
app.post('/api/admin/action', async (req, res) => {
    try {
        const { transactionId, status } = req.body;
        const tx = await Transaction.findById(transactionId);
        if (!tx) return res.status(400).json({ success: false, message: 'பரிவர்த்தனை கிடைக்கவில்லை.' });

        const user = await User.findOne({ phone: tx.phone });

        if (tx.type === 'Deposit' && status === 'Approved' && user) {
            user.balance += tx.amount;
            user.totalDeposit = (user.totalDeposit || 0) + tx.amount;
            
            if (user.totalDeposit >= 500000) user.vipLevel = 15;
            else if (user.totalDeposit >= 300000) user.vipLevel = 14;
            else if (user.totalDeposit >= 250000) user.vipLevel = 13;
            else if (user.totalDeposit >= 200000) user.vipLevel = 12;
            else if (user.totalDeposit >= 150000) user.vipLevel = 11;
            else if (user.totalDeposit >= 100000) user.vipLevel = 10;
            else if (user.totalDeposit >= 80000) user.vipLevel = 9;
            else if (user.totalDeposit >= 70000) user.vipLevel = 8;
            else if (user.totalDeposit >= 50000) user.vipLevel = 7;
            else if (user.totalDeposit >= 30000) user.vipLevel = 6;
            else if (user.totalDeposit >= 20000) user.vipLevel = 5;
            else if (user.totalDeposit >= 10000) user.vipLevel = 4;
            else if (user.totalDeposit >= 5000) user.vipLevel = 3;
            else if (user.totalDeposit >= 2000) user.vipLevel = 2;

            await user.save();
        } 
        else if (tx.type === 'Withdrawal' && status === 'Rejected' && user) {
            user.balance += tx.amount;
            await user.save();
        }

        tx.status = status;
        await tx.save();
        res.status(200).json({ success: true, message: `பரிவர்த்தனை ${status} செய்யப்பட்டுள்ளது!` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/admin/detailed-stats', async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const todayDeposits = await Transaction.find({ type: 'Deposit', status: 'Approved', date: { $gte: startOfDay } });
        const todayWithdrawals = await Transaction.find({ type: 'Withdrawal', status: 'Approved', date: { $gte: startOfDay } });

        const todayTotalDeposit = todayDeposits.reduce((sum, tx) => sum + tx.amount, 0);
        const todayTotalWithdrawal = todayWithdrawals.reduce((sum, tx) => sum + tx.amount, 0);
        const commission6Percent = todayTotalDeposit * 0.06;
        const netProfit = (todayTotalDeposit - todayTotalWithdrawal) + commission6Percent;

        const users = await User.find({}, { password: 0 });
        const totalUsersCount = users.length;

        const topDepositors = [...users].filter(u => (u.totalDeposit || 0) > 0).sort((a, b) => b.totalDeposit - a.totalDeposit).slice(0, 5);

        res.status(200).json({
            success: true,
            todayTotalDeposit,
            todayTotalWithdrawal,
            commission6Percent: commission6Percent.toFixed(2),
            netProfit: netProfit.toFixed(2),
            totalUsersCount,
            activeOnlineUsers,
            users,
            topDepositors,
            aviatorNextTarget: aviatorNextTarget.toFixed(2),
            jetxNextTarget: jetxNextTarget.toFixed(2)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/admin/pending-transactions', async (req, res) => {
    try {
        const pendingDeposits = await Transaction.find({ type: 'Deposit', status: 'Pending' }).sort({ date: -1 });
        const pendingWithdrawals = await Transaction.find({ type: 'Withdrawal', status: 'Pending' }).sort({ date: -1 });
        res.status(200).json({ success: true, pendingDeposits, pendingWithdrawals });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Real-time Sockets
io.on('connection', (socket) => {
    activeOnlineUsers++;
    io.emit('onlineUsersUpdate', activeOnlineUsers);

    socket.on('disconnect', () => {
        activeOnlineUsers = Math.max(0, activeOnlineUsers - 1);
        io.emit('onlineUsersUpdate', activeOnlineUsers);
    });

    socket.on('sendChatMessage', async (data) => {
        const { phone, sender, message } = data;
        const newChat = new Chat({ phone, sender, message });
        await newChat.save();
        io.emit(`chatMessage_${phone}`, newChat);
        io.emit('newAdminNotification', { type: 'chat', phone });
    });

    socket.emit('initHistory', jetxHistory);
    socket.emit('initAviatorHistory', aviatorHistory);
    socket.emit('aviatorNextTargetUpdate', aviatorNextTarget.toFixed(2));
    socket.emit('jetxNextTargetUpdate', jetxNextTarget.toFixed(2));
});

// 60% Profit Algorithm & 40% User Win
function generate60_40Target() {
    const rand = Math.random();
    if (rand < 0.60) {
        return parseFloat((1.01 + Math.random() * 0.99).toFixed(2));
    } else {
        return parseFloat((2.01 + Math.random() * 7.99).toFixed(2));
    }
}

// 🔄 AVIATOR GAME LOGIC (Next Round Countdown: 9 to 1)
function startAviatorGame() {
    if (!aviatorManualSet) {
        aviatorNextTarget = generate60_40Target();
    }
    aviatorManualSet = false;
    io.emit('aviatorNextTargetUpdate', aviatorNextTarget.toFixed(2));

    let countdown = 9;
    io.emit('aviatorCountdown', countdown);

    let timer = setInterval(() => {
        countdown--;
        io.emit('aviatorCountdown', countdown);
        if (countdown <= 0) {
            clearInterval(timer);
            runAviatorFlight();
        }
    }, 1000);
}

function runAviatorFlight() {
    let current = 1.00;
    const targetCrash = aviatorNextTarget;
    io.emit('aviatorStarted');

    let flightInterval = setInterval(() => {
        current += 0.04;
        io.emit('aviatorMultiplier', current.toFixed(2));

        if (current >= targetCrash) {
            current = targetCrash;
            clearInterval(flightInterval);
            aviatorHistory.unshift(targetCrash);
            if (aviatorHistory.length > 10) aviatorHistory.pop();
            io.emit('aviatorCrashed', { crashPoint: targetCrash, history: aviatorHistory });
            
            setTimeout(startAviatorGame, 2000);
        }
    }, 100);
}

// 🔄 JETX GAME LOGIC (Next Round Countdown: 9 to 1)
function startJetxGame() {
    if (!jetxManualSet) {
        jetxNextTarget = generate60_40Target();
    }
    jetxManualSet = false;
    io.emit('jetxNextTargetUpdate', jetxNextTarget.toFixed(2));

    let countdown = 9;
    io.emit('countdownUpdate', countdown);

    let timer = setInterval(() => {
        countdown--;
        io.emit('countdownUpdate', countdown);
        if (countdown <= 0) {
            clearInterval(timer);
            runJetxFlight();
        }
    }, 1000);
}

function runJetxFlight() {
    let current = 1.00;
    const targetCrash = jetxNextTarget;
    io.emit('roundStarted');

    let flightInterval = setInterval(() => {
        current += 0.05;
        io.emit('multiplierUpdate', current.toFixed(2));

        if (current >= targetCrash) {
            current = targetCrash;
            clearInterval(flightInterval);
            jetxHistory.unshift(targetCrash);
            if (jetxHistory.length > 10) jetxHistory.pop();
            io.emit('gameCrashed', { crashPoint: targetCrash, history: jetxHistory });

            setTimeout(startJetxGame, 2000);
        }
    }, 100);
}

// Start Games Loop
startAviatorGame();
startJetxGame();

server.listen(PORT, () => {
    console.log(`🚀 DREAM 66 Server running smoothly on port ${PORT}`);
});
