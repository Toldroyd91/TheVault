import { auth, db, doc, setDoc, getDoc, collection, serverTimestamp, functions, httpsCallable, onAuthStateChanged, BRAND_CONFIG } from './core-firebase.js';
import { SurveyState, validateState } from './core-state.js';
import { SniperEngine } from './engine-sniper.js';
import { generatePerfectPDF } from './engine-pdf.js';

console.log("🟢 ui-survey.js loaded successfully");

let sniper;

// --- DYNAMIC BRAND UI INITIALIZATION ---
const brandSelect = document.getElementById('brandSelect');
if (brandSelect) {
    brandSelect.innerHTML = Object.entries(BRAND_CONFIG)
        .map(([key, data]) => `<option value="${key}">${data.name}</option>`).join('');
}

// --- INITIALIZE SYSTEM & SNIPER ---
onAuthStateChanged(auth, async (user) => {
    if(!user) {
        console.warn("🔴 No user logged in - buttons will fail.");
        return; 
    }
    console.log("🟢 User Authenticated:", user.email);
    
    // Boot up the canvas
    sniper = new SniperEngine('sniperCanvas');
    console.log("🟢 Sniper Engine initialized");
    
    if(SurveyState.id) {
        console.log("Fetching existing survey:", SurveyState.id);
        const snap = await getDoc(doc(db, "surveys", SurveyState.id));
        if(snap.exists()) {
            Object.assign(SurveyState, snap.data());
        }
    }
    bindStateToUI(); 
});

// --- THE MISSING SNIPER LISTENER ---
// This listens for the photo upload from survey.html and pushes it to the canvas
window.addEventListener('loadSniperImage', (e) => {
    console.log("📸 Sniper image received from HTML button!");
    if(sniper) {
        sniper.setBackground(e.detail);
    } else {
        console.error("🔴 Sniper engine not ready yet.");
    }
});


// --- UI TO STATE BINDING ---
const el = (id) => document.getElementById(id);
const val = (id) => el(id)?.value || "";

function bindStateToUI() {
    if (el('brandSelect')) el('brandSelect').value = SurveyState.brand;
    if (el('clientName')) el('clientName').value = SurveyState.customerProfile?.leadName || "";
    if (el('postCode')) el('postCode').value = SurveyState.customerProfile?.postcode || "";
    if (el('roofSystem')) el('roofSystem').value = SurveyState.technicalSurvey?.roofSystem || "";
    if (el('designerNotes')) el('designerNotes').value = SurveyState.technicalSurvey?.designerNotes || "";
    
    if(SurveyState.rawAssets?.frontElevationImage && sniper) {
        sniper.setBackground(SurveyState.rawAssets.frontElevationImage);
    }
}

function updateStateFromUI() {
    console.log("Updating State from UI Inputs...");
    SurveyState.brand = val('brandSelect') || SurveyState.brand;
    
    // Ensure objects exist before assigning
    if(!SurveyState.customerProfile) SurveyState.customerProfile = {};
    if(!SurveyState.technicalSurvey) SurveyState.technicalSurvey = {};
    
    SurveyState.customerProfile.leadName = val('clientName');
    SurveyState.customerProfile.postcode = val('postCode');
    SurveyState.technicalSurvey.roofSystem = val('roofSystem');
    SurveyState.technicalSurvey.designerNotes = val('designerNotes');
}

// --- BUTTON WIRING ---

// 1. SAVE & SYNC
el('btn-sync')?.addEventListener('click', async (e) => {
    console.log("▶️ Sync Button Clicked");
    const btn = e.target;
    btn.innerText = "Syncing..."; btn.disabled = true;

    try {
        updateStateFromUI();
        if(sniper) SurveyState.rawAssets.frontElevationImage = sniper.exportCompressedBase64();
        
        const cleanState = validateState();
        cleanState.timestamps = { updatedAt: serverTimestamp() };
        if(!cleanState.id) cleanState.timestamps.createdAt = serverTimestamp();
        
        // Use the logged-in user's ID to prevent cross-contamination!
        cleanState.userId = auth.currentUser.uid; 

        console.log("Attempting to save to Firebase...", cleanState);
        const docRef = cleanState.id ? doc(db, "surveys", cleanState.id) : doc(collection(db, "surveys"));
        await setDoc(docRef, cleanState, { merge: true });
        
        SurveyState.id = docRef.id;
        console.log("✅ Saved successfully! ID:", SurveyState.id);
        alert("Deployed to Command Center");
    } catch(err) {
        console.error("🔴 Sync Failed:", err); 
        alert("Sync Failed - Check Console");
    } finally {
        btn.innerText = "Save & Sync"; btn.disabled = false;
    }
});

// 2. AI POLISH
el('btn-ai-polish')?.addEventListener('click', async (e) => {
    console.log("▶️ AI Polish Clicked");
    const rawText = val('designerNotes').trim();
    if (!rawText) return alert("Please type some notes first.");
    
    const btn = e.target;
    btn.innerText = "Polishing..."; btn.disabled = true;

    try {
        const rewriteNotes = httpsCallable(functions, 'rewriteNotes');
        const result = await rewriteNotes({ rawText });
        if (result.data?.polishedText) {
            el('designerNotes').value = result.data.polishedText;
            updateStateFromUI();
            console.log("✅ Notes Polished");
        }
    } catch (err) {
        console.error("🔴 AI Engine Error:", err);
        alert("AI Engine Error - Are your Firebase Functions deployed?");
    } finally {
        btn.innerText = "✨ AI Polish Notes"; btn.disabled = false;
    }
});

// 3. GENERATE PDF
el('btn-generate-pdf')?.addEventListener('click', async (e) => {
    console.log("▶️ Generate PDF Clicked");
    const btn = e.target;
    btn.innerText = "Compiling PDF..."; btn.disabled = true;

    try {
        updateStateFromUI();
        if(sniper) SurveyState.rawAssets.frontElevationImage = sniper.exportCompressedBase64();
        
        console.log("Handing off to engine-pdf.js...");
        await generatePerfectPDF(SurveyState, BRAND_CONFIG);
        console.log("✅ PDF Generated");
    } catch (err) {
        console.error("🔴 PDF Generation Failed:", err); 
        alert("PDF Generation Failed - Check Console");
    } finally {
        btn.innerText = "Generate PDF Pack"; btn.disabled = false;
    }
});
