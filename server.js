const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');
const cheerio = require('cheerio'); 

const app = express();

// --- 1. SECURITY: CORS Configuration ---
// Only your GitLab frontend and local development servers can access this API
const allowedOrigins = [
    'https://lkl-app-essentials-b7f0c4.gitlab.io', 
    'http://localhost:3000', 
    'http://127.0.0.1:5500'
];

app.use(cors({
    origin: function(origin, callback){
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1){
            return callback(new Error('CORS Policy: Access Denied'), false);
        }
        return callback(null, true);
    }
}));

// --- 2. Database Connection ---
const MONGO_URI = "mongodb+srv://lanka_lift_solutions:LxXW74Xt1QzGLt46@cluster0.lz5w8jt.mongodb.net/LankaLiftDB?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Database Connected Successfully!"))
  .catch(err => console.error("❌ Database Connection Error:", err));

// --- 3. Database Schema ---
const LotterySchema = new mongoose.Schema({
    lotteryCode: String,
    lotteryName: String,
    drawNo: String,
    date: String,
    numbers: [String],
    letter: String,
    fetchedAt: { type: Date, default: Date.now }
});
const Lottery = mongoose.model('LotteryResult', LotterySchema);

// --- 4. Lotteries Configuration ---
const nlbLotteries = [
    { code: 'dhana-nidhanaya', name: 'Dhana Nidhanaya', id: '29022b19-c690-42d6-aacf-4128b4802bfa' },
    { code: 'ada-sampatha', name: 'Ada Sampatha', id: 'b4518a72-573e-4145-82c9-4c6dd91f8ec5' },
    { code: 'suba-dawasak', name: 'Suba Dawasak', id: '4fdecc2b-6ee8-4fab-a5bc-292aba290f14' },
    { code: 'mahajana-sampatha', name: 'Mahajana Sampatha', id: '913c1c52-0ab4-405d-9298-a6c6d22f0dda' },
    { code: 'govi-setha', name: 'Govi Setha', id: 'f0316f4f-2248-407e-a3ba-5869ae30b31b' },
    { code: 'jaya', name: 'Jaya', id: '0c34ca75-5c79-4433-ac6c-bb5a48a9cdad' },
    { code: 'handahana', name: 'Handahana', id: '892402a1-54ed-4628-a688-30ac983675f1' },
    { code: 'mega-power', name: 'Mega Power', id: '3dffba79-cd73-445f-a9ca-be430ce81da7' }
];

const dlbLotteries = [
    { code: 'ada-kotipathi', name: 'Ada Kotipathi', divId: '#lottery0' },
    { code: 'shanida', name: 'Shanida', divId: '#lottery1' },
    { code: 'lagna-wasana', name: 'Lagna Wasana', divId: '#lottery2' },
    { code: 'dhana-sampatha', name: 'Supiri Dhana Sampatha', divId: '#lottery3' }, 
    { code: 'super-ball', name: 'Super Ball', divId: '#lottery4' },
    { code: 'kapruka', name: 'Kapruka', divId: '#lottery5' },
    { code: 'sasiri', name: 'Sasiri', divId: '#lottery6' },
    { code: 'jaya-sampatha', name: 'Jaya Sampatha', divId: '#lottery7' }
];

const delay = ms => new Promise(res => setTimeout(res, ms));

function getZodiacName(id) {
    const zodiacs = { "1": "Aries", "2": "Taurus", "3": "Gemini", "4": "Cancer", "5": "Leo", "6": "Virgo", "7": "Libra", "8": "Scorpio", "9": "Sagittarius", "10": "Capricorn", "11": "Aquarius", "12": "Pisces" };
    return zodiacs[String(id)] || String(id);
}

function extractZodiacFromUrl(url) {
    const u = url.toLowerCase();
    if (u.includes('mesha')) return 'Aries';
    if (u.includes('wushaba') || u.includes('vrushabha')) return 'Taurus';
    if (u.includes('mithuna')) return 'Gemini';
    if (u.includes('kataka')) return 'Cancer';
    if (u.includes('sinha')) return 'Leo';
    if (u.includes('kanya')) return 'Virgo';
    if (u.includes('thula')) return 'Libra';
    if (u.includes('vruchika') || u.includes('vrushchika')) return 'Scorpio';
    if (u.includes('dhanu')) return 'Sagittarius';
    if (u.includes('makara')) return 'Capricorn';
    if (u.includes('kumba') || u.includes('kumbha')) return 'Aquarius';
    if (u.includes('meena')) return 'Pisces';
    return "";
}

// --- 5. Data Fetching Functions ---

async function fetchAndSaveNLBData() {
    console.log("🔄 Running NLB Scraper...");
    for (const lottery of nlbLotteries) {
        try {
            const API_URL = `https://app.gtw.884.lk/gateway/LotteryManagement-app1952/SearchLotteryResults?page=1&limit=1&productId=${lottery.id}`;
            const response = await axios.get(API_URL);
            const latestDraw = response.data.data ? response.data.data[0] : null;

            if (latestDraw) {
                const drawNo = latestDraw.LotteryDrawId;
                const winInfo = latestDraw.LotteryWiningInfo;
                let numbersArray = [];
                let engLetter = "";
                
                if (lottery.code === 'ada-sampatha') {
                    engLetter = winInfo.CHAR || "";
                    if (winInfo.ARANGE) numbersArray.push(winInfo.ARANGE);
                    if (winInfo.BRANGE) numbersArray.push(winInfo.BRANGE);
                    if (winInfo.CRANGE) numbersArray.push(winInfo.CRANGE);
                } else if (lottery.code === 'suba-dawasak') {
                    engLetter = winInfo.LG1 ? getZodiacName(winInfo.LG1) : "";
                    if (winInfo.N1) numbersArray.push(winInfo.N1);
                    if (winInfo.N2) numbersArray.push(winInfo.N2);
                    if (winInfo.N3) numbersArray.push(winInfo.N3);
                    if (winInfo.SP1) numbersArray.push(winInfo.SP1);
                } else if (lottery.code === 'jaya' || lottery.code === 'mahajana-sampatha') {
                    engLetter = winInfo.CHAR || "";
                    if (winInfo.RECD) numbersArray = String(winInfo.RECD).split(''); 
                } else if (lottery.code === 'handahana') {
                    engLetter = winInfo.LAGNA ? getZodiacName(winInfo.LAGNA) : "";
                    if (winInfo.N1) numbersArray.push(winInfo.N1);
                    if (winInfo.N2) numbersArray.push(winInfo.N2);
                    if (winInfo.N3) numbersArray.push(winInfo.N3);
                    if (winInfo.N4) numbersArray.push(winInfo.N4);
                } else {
                    engLetter = winInfo.CHAR || winInfo.SUN || "";
                    for (let i = 1; i <= 8; i++) {
                        if (winInfo[`N${i}`] && String(winInfo[`N${i}`]).trim() !== "") numbersArray.push(winInfo[`N${i}`]);
                    }
                }

                await Lottery.findOneAndUpdate(
                    { lotteryCode: lottery.code, drawNo: drawNo },
                    { lotteryName: lottery.name, date: latestDraw.DrawDate, numbers: numbersArray, letter: engLetter, fetchedAt: new Date() },
                    { upsert: true, returnDocument: 'after' }
                );
            }
        } catch (error) {
            console.error(`❌ NLB Error (${lottery.name}):`, error.message);
        }
        await delay(1500); 
    }
}

async function fetchAndSaveDLBData() {
    console.log("🔄 Running DLB Scraper...");
    try {
        const response = await axios.get('https://www.dlb.lk/result/en', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        
        const $ = cheerio.load(response.data);
        
        for (const lottery of dlbLotteries) {
            const latestBlock = $(lottery.divId).find('.lot_main_result').first();
            if (latestBlock.length === 0) continue;

            let rawDrawInfo = latestBlock.find('h3.lot_m_re_date').text().trim();
            let drawNo = "N/A";
            let drawDate = new Date().toISOString(); 
            
            if (rawDrawInfo) {
                const drawMatch = rawDrawInfo.match(/Draw Number\s*-\s*(\d+)/i) || rawDrawInfo.match(/\d+/);
                if (drawMatch && drawMatch[1]) {
                    drawNo = drawMatch[1];
                } else if (drawMatch) {
                    drawNo = drawMatch[0];
                }
                const dateMatch = rawDrawInfo.match(/\d{4}-[a-zA-Z]{3}-\d{2}/);
                if (dateMatch) drawDate = new Date(dateMatch[0]).toISOString();
            }

            let numbersArray = [];
            let engLetter = "";
            const firstResultList = latestBlock.find('ul.result_detail_result').first();

            const zodiacImg = firstResultList.find('img').first();
            if (zodiacImg.length > 0) {
                const src = zodiacImg.attr('src');
                if (src) {
                    const zodiac = extractZodiacFromUrl(src);
                    if (zodiac) engLetter = zodiac;
                }
            }
            
            firstResultList.find('h6').each((index, element) => {
                let text = $(element).text().trim();
                if (text) {
                    if ($(element).hasClass('eng_letter')) {
                        engLetter = text;
                    } else if (/^[a-zA-Z]+$/.test(text) && engLetter === "") {
                        engLetter = text; 
                    } else if (!/^[a-zA-Z]+$/.test(text)) {
                        numbersArray.push(text);
                    }
                }
            });

            if (numbersArray.length > 0 || engLetter !== "") {
                await Lottery.findOneAndUpdate(
                    { lotteryCode: lottery.code, drawNo: drawNo },
                    { lotteryName: lottery.name, date: drawDate, numbers: numbersArray, letter: engLetter, fetchedAt: new Date() },
                    { upsert: true, returnDocument: 'after' }
                );
            }
        }
    } catch (error) {
        console.error(`❌ DLB Master Fetch Error:`, error.message);
    }
}

async function runAllScrapers() {
    console.log(`[${new Date().toLocaleString()}] Initiating Scheduled Scrape...`);
    await fetchAndSaveNLBData();
    await fetchAndSaveDLBData();
    console.log(`[${new Date().toLocaleString()}] Scrape Completed.`);
}

// --- 6. Cron Jobs (9:30 PM to 1:00 AM Polling) ---
// We use 3 separate cron schedules to cover this exact window every 15 minutes.

// Schedule 1: 9:30 PM and 9:45 PM
cron.schedule('30,45 21 * * *', runAllScrapers, { timezone: "Asia/Colombo" });

// Schedule 2: Every 15 minutes during 10:00 PM, 11:00 PM, and 12:00 AM
cron.schedule('0,15,30,45 22,23,0 * * *', runAllScrapers, { timezone: "Asia/Colombo" });

// Schedule 3: Exactly at 1:00 AM (Final Check)
cron.schedule('0 1 * * *', runAllScrapers, { timezone: "Asia/Colombo" });


// --- 7. API Endpoints ---

// Endpoint for UptimeRobot (Keeps Render Awake)
app.get('/api/ping', (req, res) => {
    res.status(200).send('Server is Awake and Running!');
});

// Endpoint 1: Get the absolute latest result (For main cards)
app.get('/api/latest-result', async (req, res) => {
    try {
        const reqCode = req.query.lottery;
        if(!reqCode) return res.status(400).json({ error: "Lottery code is required." });

        const latest = await Lottery.findOne({ lotteryCode: reqCode }).sort({ date: -1, fetchedAt: -1 });
        if(latest) res.json(latest);
        else res.status(404).json({ message: "No data found for this lottery." });
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
});

// Endpoint 2: Get History (Last X draws)
app.get('/api/history', async (req, res) => {
    try {
        const reqCode = req.query.lottery;
        const limit = parseInt(req.query.limit) || 5;
        if(!reqCode) return res.status(400).json({ error: "Lottery code is required." });

        const history = await Lottery.find({ lotteryCode: reqCode }).sort({ date: -1, fetchedAt: -1 }).limit(limit);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
});

// Endpoint 3: Search Specific Result (By Draw Number)
app.get('/api/search-result', async (req, res) => {
    try {
        const { lottery, drawNo } = req.query;
        if(!lottery || !drawNo) return res.status(400).json({ error: "Lottery code and Draw Number are required." });

        // Searching primarily by drawNo as it is globally unique per lottery
        const result = await Lottery.findOne({ lotteryCode: lottery, drawNo: drawNo });
        
        if(result) res.json(result);
        else res.status(404).json({ message: "No data found." });
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
});

// --- 8. Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}...`);
    // Run fetch process once when the server starts
    await runAllScrapers(); 
});