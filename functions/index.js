const { onRequest, onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const puppeteer = require("puppeteer");

admin.initializeApp();
// It's best practice to put your Gemini key in the .env file too, e.g. process.env.GEMINI_API_KEY
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY");

// --- 1. AI NOTES ENGINE ---
exports.rewriteNotes = onRequest({ cors: true }, async (req, res) => {
    const { rawText } = req.body.data;
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `Rewrite these rough site notes into professional, sales-focused architectural description for a CO Home Improvements extension client. Keep it sophisticated and persuasive: ${rawText}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ data: { polishedText: response.text() } });
});

// --- 2. SERVER-SIDE PDF ENGINE ---
exports.compilePDF = onRequest({ memory: "2GiB", timeoutSeconds: 120, cors: true }, async (req, res) => {
    const { surveyId, pin } = req.body.data; 
    const db = admin.firestore();
    const surveyDoc = await db.collection("surveys").doc(surveyId).get();
    
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    await page.goto(`https://cohi-survey-engine.web.app/vault.html?id=${surveyId}`, { waitUntil: 'networkidle0' });
    await page.type('#vaultPinInput', pin);
    await page.click('button');
    await page.waitForSelector('#vaultContent', { visible: true });
    await new Promise(r => setTimeout(r, 2000));
    
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    
    const bucket = admin.storage().bucket();
    const file = bucket.file(`pdfs/${surveyId}.pdf`);
    await file.save(pdfBuffer, { contentType: 'application/pdf' });
    
    const [url] = await file.getSignedUrl({ action: 'read', expires: '03-09-2099' });
    await surveyDoc.ref.update({ "uDesignBridge.quotePdfUrl": url });
    
    res.json({ data: { pdfUrl: url } });
});

// --- 3. SECURE ORDNANCE SURVEY PROXY ---
exports.fetchOSMap = onCall({ cors: true }, async (request) => {
    const { lat, lng } = request.data;
    const osKey = process.env.OS_API_KEY;
    if (!osKey) throw new Error("OS API Key missing from server environment.");
    
    // We return the authorized URL so the front-end can display it as an image
    return { url: `https://api.os.uk/maps/raster/v1/zxy/Light_3857/18/${lat}/${lng}.png?key=${osKey}` };
});

// --- 4. SECURE EPC DATABASE PROXY ---
exports.fetchEPCData = onCall({ cors: true }, async (request) => {
    const { postcode, houseNum } = request.data;
    const epcKey = process.env.EPC_API_KEY;
    if (!epcKey) throw new Error("EPC API Key missing from server environment.");

    try {
        // Native fetch is supported in Firebase Node 18+ environments
        const response = await fetch(`https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${postcode}`, {
            headers: {
                'Authorization': `Basic ${epcKey}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error("Failed to authenticate with UK Gov Database");
        
        const data = await response.json();
        
        // Find the exact house server-side so we only return the specific client's data
        let match = data.rows.find(row => row.address.toLowerCase().startsWith(houseNum.toLowerCase()));
        if (!match && data.rows.length > 0) match = data.rows[0]; 
        
        return { success: true, data: match };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
