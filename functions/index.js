const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const puppeteer = require("puppeteer");

admin.initializeApp();
const genAI = new GoogleGenerativeAI("YOUR_GEMINI_API_KEY");

// --- 1. AI NOTES ENGINE ---
// Added CORS so the iPad is allowed to talk to the server
exports.rewriteNotes = onRequest({ cors: true }, async (req, res) => {
    const { rawText } = req.body.data;
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `Rewrite these rough site notes into professional, sales-focused architectural description for a CO Home Improvements extension client. Keep it sophisticated and persuasive: ${rawText}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json({ data: { polishedText: response.text() } });
});

// --- 2. SERVER-SIDE PDF ENGINE ---
// Upgraded memory to 2GB to prevent Puppeteer from crashing
exports.compilePDF = onRequest({ memory: "2GiB", timeoutSeconds: 120, cors: true }, async (req, res) => {
    const { surveyId, pin } = req.body.data; 
    const db = admin.firestore();
    const surveyDoc = await db.collection("surveys").doc(surveyId).get();
    
    // Launch headless browser in the cloud
    const browser = await puppeteer.launch({ 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Go to the vault and wait for the network to stop loading assets
    await page.goto(`https://cohi-survey-engine.web.app/vault.html?id=${surveyId}`, { waitUntil: 'networkidle0' });
    
    // THE FIX: Programmatically bypass the Vault security gate
    await page.type('#vaultPinInput', pin);
    await page.click('button');
    
    // Wait for the luxury showroom to become visible
    await page.waitForSelector('#vaultContent', { visible: true });
    
    // Give the brand logos (Trent Valley Windows, Planet, etc.) an extra 2 seconds to fully render
    await new Promise(r => setTimeout(r, 2000));
    
    // Generate the PDF
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    
    // Upload to the London Storage Bucket
    const bucket = admin.storage().bucket();
    const file = bucket.file(`pdfs/${surveyId}.pdf`);
    await file.save(pdfBuffer, { contentType: 'application/pdf' });
    
    // Generate secure link and update database
    const [url] = await file.getSignedUrl({ action: 'read', expires: '03-09-2099' });
    await surveyDoc.ref.update({ "uDesignBridge.quotePdfUrl": url });
    
    res.json({ data: { pdfUrl: url } });
});
