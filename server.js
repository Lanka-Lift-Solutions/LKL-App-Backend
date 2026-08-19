const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');
const cheerio = require('cheerio'); 

const app = express();

// --- 0. JSON PARSER FOR ADMIN API ---
app.use(express.json());

// --- 1. SECURITY: CORS Configuration ---
const allowedOrigins = [
    'https://lkl-app-essentials-b7f0c4.gitlab.io', 
    'http://localhost:3000', 
    'http://127.0.0.1:5500',
    'http://localhost',       // Android Capacitor App
    'https://localhost',
    'capacitor://localhost'   // iOS Capacitor App
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
  .then(async () => {
      console.log("✅ Database Connected Successfully!");
      
      try {
          const deleteResult = await Lottery.deleteMany({ 
              drawNo: '3073', 
              lotteryCode: { $ne: 'ada-kotipathi' } 
          });
          if (deleteResult.deletedCount > 0) {
              console.log(`🧹 Cleaned up ${deleteResult.deletedCount} invalid records for draw 3073.`);
          }
      } catch (err) {
          console.error("Cleanup Error:", err.message);
      }
  })
  .catch(err => console.error("❌ Database Connection Error:", err));

// --- 3. Database Schema ---
const LotterySchema = new mongoose.Schema({
    lotteryCode: String,
    lotteryName: String,
    drawNo: String,
    date: String,
    numbers: [String],
    letter: String,
    fetchedAt: { type: Date, default: Date.now },
    isManual: { type: Boolean, default: false } // Manual Lock Field
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
    console.log(`[${new Date().toLocaleString()}] 🔄 Running NLB Scraper (Latest 3 draws)...`);
    for (const lottery of nlbLotteries) {
        try {
            const API_URL = `https://app.gtw.884.lk/gateway/LotteryManagement-app1952/SearchLotteryResults?page=1&limit=3&productId=${lottery.id}`;
            const response = await axios.get(API_URL);
            const recentDraws = response.data.data || [];

            for (const draw of recentDraws) {
                const drawNo = draw.LotteryDrawId;
                const winInfo = draw.LotteryWiningInfo;
                let numbersArray = [];
                let engLetter = "";
                
                if (lottery.code === 'ada-sampatha') {
                    engLetter = winInfo.CHAR || "";
                    if (winInfo.ARANGE) numbersArray.push(String(winInfo.ARANGE));
                    if (winInfo.BRANGE) numbersArray.push(String(winInfo.BRANGE));
                    if (winInfo.CRANGE) numbersArray.push(String(winInfo.CRANGE));
                } 
                else if (lottery.code === 'suba-dawasak') {
                    engLetter = winInfo.LG1 ? getZodiacName(winInfo.LG1) : "";
                    if (winInfo.N1 !== undefined) numbersArray.push(String(winInfo.N1));
                    if (winInfo.N2 !== undefined) numbersArray.push(String(winInfo.N2));
                    if (winInfo.N3 !== undefined) numbersArray.push(String(winInfo.N3));
                } 
                else if (lottery.code === 'jaya' || lottery.code === 'mahajana-sampatha') {
                    engLetter = winInfo.CHAR || "";
                    if (winInfo.RECD) numbersArray = String(winInfo.RECD).split(''); 
                    
                    if (winInfo.SUN !== undefined && winInfo.SUN !== null && String(winInfo.SUN).trim() !== "") {
                        numbersArray.push(String(winInfo.SUN).padStart(4, '0'));
                    } else if (winInfo.SP1 !== undefined && winInfo.SP1 !== null && String(winInfo.SP1).trim() !== "") {
                        numbersArray.push(String(winInfo.SP1).padStart(4, '0'));
                    }
                } 
                else if (lottery.code === 'handahana') {
                    engLetter = winInfo.LAGNA ? getZodiacName(winInfo.LAGNA) : "";
                    if (winInfo.N1 !== undefined) numbersArray.push(String(winInfo.N1));
                    if (winInfo.N2 !== undefined) numbersArray.push(String(winInfo.N2));
                    if (winInfo.N3 !== undefined) numbersArray.push(String(winInfo.N3));
                    if (winInfo.N4 !== undefined) numbersArray.push(String(winInfo.N4));
                }
                else if (lottery.code === 'mega-power') {
                    engLetter = winInfo.CHAR || "";
                    let specialNum = winInfo.SNO || winInfo.MAC || winInfo.M; 
                    
                    if (specialNum != null && String(specialNum).trim() !== "") {
                        numbersArray.push(String(specialNum).trim());
                    }

                    for (let i = 1; i <= 4; i++) {
                        if (winInfo[`N${i}`] != null && String(winInfo[`N${i}`]).trim() !== "") {
                            numbersArray.push(String(winInfo[`N${i}`]).trim());
                        }
                    }
                }
                else {
                    engLetter = winInfo.CHAR || ""; 
                    for (let i = 1; i <= 8; i++) {
                        if (winInfo[`N${i}`] !== undefined && String(winInfo[`N${i}`]).trim() !== "") {
                            numbersArray.push(String(winInfo[`N${i}`]));
                        }
                    }
                    if (winInfo.SUN !== undefined && winInfo.SUN !== null && String(winInfo.SUN).trim() !== "") {
                        numbersArray.push(String(winInfo.SUN).padStart(4, '0'));
                    } else if (winInfo.SP1 !== undefined && winInfo.SP1 !== null && String(winInfo.SP1).trim() !== "") {
                        numbersArray.push(String(winInfo.SP1).padStart(4, '0'));
                    }
                }

                // --- NLB Update Logic (With Lock) ---
                const existingDraw = await Lottery.findOne({ lotteryCode: lottery.code, drawNo: drawNo });
                
                if (existingDraw && existingDraw.isManual === true) {
                    console.log(`🔒 Skipped NLB Update: ${lottery.name} Draw ${drawNo} is manually locked.`);
                } else {
                    await Lottery.findOneAndUpdate(
                        { lotteryCode: lottery.code, drawNo: drawNo },
                        { lotteryName: lottery.name, date: draw.DrawDate, numbers: numbersArray, letter: engLetter, fetchedAt: new Date(), isManual: false },
                        { upsert: true, returnDocument: 'after' }
                    );
                }
            }
            console.log(`✅ NLB Updated: ${lottery.name} (Top 3 draws check complete)`);
        } catch (error) {
            console.error(`❌ NLB Error (${lottery.name}):`, error.message);
        }
        await delay(1500); 
    }
}

async function fetchAndSaveDLBData() {
    console.log(`[${new Date().toLocaleString()}] 🔄 Running DLB Scraper...`);
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

            // --- DLB Update Logic (With Lock) ---
            if (numbersArray.length > 0 || engLetter !== "") {
                const existingDraw = await Lottery.findOne({ lotteryCode: lottery.code, drawNo: drawNo });
                
                if (existingDraw && existingDraw.isManual === true) {
                    console.log(`🔒 Skipped DLB Update: ${lottery.name} Draw ${drawNo} is manually locked.`);
                } else {
                    await Lottery.findOneAndUpdate(
                        { lotteryCode: lottery.code, drawNo: drawNo },
                        { lotteryName: lottery.name, date: drawDate, numbers: numbersArray, letter: engLetter, fetchedAt: new Date(), isManual: false },
                        { upsert: true, returnDocument: 'after' }
                    );
                    console.log(`✅ DLB Scraped & Updated: ${lottery.name} (Draw: ${drawNo})`);
                }
            }
        }
    } catch (error) {
        console.error(`❌ DLB Master Fetch Error:`, error.message);
    }
}

// Helper Wrappers for Cron
async function runAllScrapers() {
    await fetchAndSaveNLBData();
    await fetchAndSaveDLBData();
}
async function runDLBScraperOnly() {
    await fetchAndSaveDLBData();
}

// --- 6. Cron Jobs ---
cron.schedule('0 7,18 * * *', runDLBScraperOnly, { timezone: "Asia/Colombo" });
cron.schedule('30 13 * * *', runAllScrapers, { timezone: "Asia/Colombo" });
cron.schedule('30,45 21 * * *', runAllScrapers, { timezone: "Asia/Colombo" });
cron.schedule('0,15,30,45 22,23,0 * * *', runAllScrapers, { timezone: "Asia/Colombo" });
cron.schedule('0 1 * * *', runAllScrapers, { timezone: "Asia/Colombo" });


// --- 7. API Endpoints ---
app.get('/api/ping', (req, res) => {
    res.status(200).send('Server is Awake and Running!');
});

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

app.get('/api/search-result', async (req, res) => {
    try {
        const { lottery, drawNo } = req.query;
        if(!lottery || !drawNo) return res.status(400).json({ error: "Lottery code and Draw Number are required." });

        const result = await Lottery.findOne({ lotteryCode: lottery, drawNo: drawNo });
        if(result) res.json(result);
        else res.status(404).json({ message: "No data found." });
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
});

// --- 7.5 Statistics API (Hot & Cold Logic) ---
const statsConfig = {
    'govi-setha': { numRange: '01-80', letterType: 'A-Z', numLimit: 4 },
    'suba-dawasak': { numRange: '01-80', letterType: 'Zodiac', numLimit: 3 },
    'mahajana-sampatha': { numRange: '0-9', letterType: 'A-Z', numLimit: 6 },
    'dhana-nidhanaya': { numRange: '01-80', letterType: 'A-Z', numLimit: 4 },
    'mega-power': { numRange: '01-80', letterType: 'A-Z', numLimit: 5 },
    'handahana': { numRange: '01-80', letterType: 'Zodiac', numLimit: 4 },
    'ada-sampatha': { numRange: '0-9', letterType: 'A-Z', numLimit: 9 },
    'jaya': { numRange: '0-9', letterType: 'A-Z', numLimit: 4 },
    'ada-kotipathi': { numRange: '01-80', letterType: 'A-Z', numLimit: 4 },
    'shanida': { numRange: '01-80', letterType: 'A-Z', numLimit: 4 },
    'lagna-wasana': { numRange: '01-80', letterType: 'Zodiac', numLimit: 4 },
    'dhana-sampatha': { numRange: '0-9', letterType: 'A-Z', numLimit: 6 },
    'super-ball': { numRange: '01-80', letterType: 'A-Z', numLimit: 4 },
    'kapruka': { numRange: '01-80', letterType: 'A-Z', numLimit: 5 },
    'sasiri': { numRange: '01-80', letterType: 'None', numLimit: 3 },
    'jaya-sampatha': { numRange: '0-9', letterType: 'A-Z', numLimit: 4 }
};

app.get('/api/statistics', async (req, res) => {
    try {
        const reqCode = req.query.lottery;
        if (!reqCode || !statsConfig[reqCode]) return res.status(400).json({ error: "Valid Lottery code is required." });

        const conf = statsConfig[reqCode];
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const draws = await Lottery.find({ 
            lotteryCode: reqCode,
            fetchedAt: { $gte: thirtyDaysAgo } 
        });

        let numFreq = {};
        let letterFreq = {};

        draws.forEach(d => {
            const nums = d.numbers.slice(0, conf.numLimit);
            nums.forEach(n => {
                let parsed = String(n).trim();
                if (conf.numRange === '01-80') {
                    parsed = String(parseInt(parsed)).padStart(2, '0');
                }
                numFreq[parsed] = (numFreq[parsed] || 0) + 1;
            });

            if (conf.letterType !== 'None' && d.letter && d.letter.trim() !== "") {
                letterFreq[d.letter] = (letterFreq[d.letter] || 0) + 1;
            }
        });

        let fullNumRange = [];
        if (conf.numRange === '01-80') {
            for (let i = 1; i <= 80; i++) fullNumRange.push(String(i).padStart(2, '0'));
        } else {
            for (let i = 0; i <= 9; i++) fullNumRange.push(String(i));
        }

        let allNumsWithCount = fullNumRange.map(v => ({ val: v, count: numFreq[v] || 0 }));
        let hotNumbers = [...allNumsWithCount]
            .sort((a, b) => b.count !== a.count ? b.count - a.count : Math.random() - 0.5)
            .slice(0, 5);

        let coldNumbers = [...allNumsWithCount]
            .sort((a, b) => a.count !== b.count ? a.count - b.count : Math.random() - 0.5)
            .slice(0, 5);

        let hotLetters = [];
        if (conf.letterType !== 'None') {
            let fullLetterRange = [];
            if (conf.letterType === 'A-Z') {
                for (let i = 65; i <= 90; i++) fullLetterRange.push(String.fromCharCode(i));
            } else {
                fullLetterRange = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
            }

            let allLettersWithCount = fullLetterRange.map(v => ({ val: v, count: letterFreq[v] || 0 }));
            hotLetters = [...allLettersWithCount]
                .sort((a, b) => b.count !== a.count ? b.count - a.count : Math.random() - 0.5)
                .slice(0, 5);
        }

        res.json({
            hotNumbers,
            coldNumbers,
            hotLetters,
            letterType: conf.letterType
        });

    } catch (error) {
        res.status(500).json({ error: "Server Error calculating statistics." });
    }
});

// --- 7.8 ADMIN API (Manual Data Entry & Lock) ---
const ADMIN_PASSWORD = "LKL#TOL525*";

app.post('/api/admin/update-result', async (req, res) => {
    try {
        const { password, lotteryCode, lotteryName, drawNo, date, numbers, letter } = req.body;

        // 1. Validate Password
        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ success: false, message: "Unauthorized: Incorrect Password" });
        }

        // 2. Validate essential fields
        if (!lotteryCode || !drawNo || !date) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        // 3. Upsert data and flag as manually entered
        const updated = await Lottery.findOneAndUpdate(
            { lotteryCode: lotteryCode, drawNo: String(drawNo) },
            { 
                lotteryName: lotteryName, 
                date: new Date(date).toISOString(), 
                numbers: numbers || [], 
                letter: letter || "", 
                fetchedAt: new Date(),
                isManual: true 
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, message: "Successfully updated and locked!", data: updated });

    } catch (error) {
        console.error("Admin API Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// --- 8. Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}...`);
    await runAllScrapers(); 
});