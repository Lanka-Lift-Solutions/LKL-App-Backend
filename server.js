const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');
const cheerio = require('cheerio'); 

const app = express();

// --- 1. SECURITY: CORS Configuration ---
const allowedOrigins = [
    'https://lkl-app-essentials-b7f0c4.gitlab.io', 
    'http://localhost:3000', 
    'http://127.0.0.1:5500',
    'http://localhost',       // Android Capacitor App සඳහා
    'https://localhost',
    'capacitor://localhost'   // iOS Capacitor App සඳහා
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
      
      // 🧹 BUG FIX: Database Cleanup Script
      // This explicitly deletes the "Dirty Data" (Draw 3073) that accidentally 
      // saved under other lotteries during initial web scraping tests.
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
                    // REMOVED: The SP1 4-digit number section has been deleted here.
                } 
                else if (lottery.code === 'jaya' || lottery.code === 'mahajana-sampatha') {
                    engLetter = winInfo.CHAR || "";
                    if (winInfo.RECD) numbersArray = String(winInfo.RECD).split(''); 
                    
                    // SUNDAY SPECIAL FIX: Pad and add special number if exists (for Jaya)
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
                else {
                    // Standard logic (Dhana Nidhanaya, Govi Setha, Mega Power)
                    engLetter = winInfo.CHAR || ""; // Removed SUN from here to prevent letter bug
                    for (let i = 1; i <= 8; i++) {
                        if (winInfo[`N${i}`] !== undefined && String(winInfo[`N${i}`]).trim() !== "") {
                            numbersArray.push(String(winInfo[`N${i}`]));
                        }
                    }
                    
                    // SUNDAY SPECIAL FIX: (For Dhana Nidhanaya)
                    if (winInfo.SUN !== undefined && winInfo.SUN !== null && String(winInfo.SUN).trim() !== "") {
                        numbersArray.push(String(winInfo.SUN).padStart(4, '0'));
                    } else if (winInfo.SP1 !== undefined && winInfo.SP1 !== null && String(winInfo.SP1).trim() !== "") {
                        numbersArray.push(String(winInfo.SP1).padStart(4, '0'));
                    }
                }

                await Lottery.findOneAndUpdate(
                    { lotteryCode: lottery.code, drawNo: drawNo },
                    { lotteryName: lottery.name, date: draw.DrawDate, numbers: numbersArray, letter: engLetter, fetchedAt: new Date() },
                    { upsert: true, returnDocument: 'after' }
                );
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

            if (numbersArray.length > 0 || engLetter !== "") {
                await Lottery.findOneAndUpdate(
                    { lotteryCode: lottery.code, drawNo: drawNo },
                    { lotteryName: lottery.name, date: drawDate, numbers: numbersArray, letter: engLetter, fetchedAt: new Date() },
                    { upsert: true, returnDocument: 'after' }
                );
                console.log(`✅ DLB Scraped & Updated: ${lottery.name} (Draw: ${drawNo})`);
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

// 1. DLB Exclusive Checks: 7:00 AM and 6:30 PM (18:30)
cron.schedule('0 7,18 * * *', runDLBScraperOnly, { timezone: "Asia/Colombo" });

// 2. Combined Check (NLB + DLB) at 1:30 PM (13:30)
cron.schedule('30 13 * * *', runAllScrapers, { timezone: "Asia/Colombo" });

// 3. Night Polling (9:30 PM to 1:00 AM) - Every 15 minutes for both NLB & DLB
cron.schedule('30,45 21 * * *', runAllScrapers, { timezone: "Asia/Colombo" });
cron.schedule('0,15,30,45 22,23,0 * * *', runAllScrapers, { timezone: "Asia/Colombo" });
cron.schedule('0 1 * * *', runAllScrapers, { timezone: "Asia/Colombo" });


// --- 7. API Endpoints ---

// Endpoint for UptimeRobot
app.get('/api/ping', (req, res) => {
    res.status(200).send('Server is Awake and Running!');
});

// Endpoint 1: Get the absolute latest result
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

// Endpoint 2: Get History
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

// Endpoint 3: Search Specific Result
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

// --- 8. Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}...`);
    await runAllScrapers(); 
});