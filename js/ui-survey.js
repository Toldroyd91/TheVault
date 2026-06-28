import { auth, db, doc, setDoc, getDoc, collection, serverTimestamp, functions, httpsCallable, onAuthStateChanged, BRAND_CONFIG } from './core-firebase.js';
import { SurveyState, validateState } from './core-state.js';
import { SniperEngine } from './engine-sniper.js';
import { generatePerfectPDF } from './engine-pdf.js'; // The new Client-Side PDF Engine

let sniper;

// --- 1. DYNAMIC BRAND UI INITIALIZATION ---
const brandSelect = document.getElementById('brandSelect');
if (brandSelect) {
    brandSelect.innerHTML = Object.entries(BRAND_CONFIG)
        .map(([key, data]) => `<option value="${key}">${data.name}</option>`).join('');
}

// Initialize System
onAuthStateChanged(auth, async (user) => {
    if(!user) return; 
    
    sniper = new SniperEngine('sniperCanvas');
    
    if(SurveyState.id) {
        const snap = await getDoc(doc(db, "surveys", SurveyState.id));
        if(snap.exists()) {
            Object.assign(SurveyState, snap.data());
        }
    }
    bindStateToUI(); 
});

// --- 2. UI TO STATE BINDING (Shortened & Optimized) ---
const el = (id) => document.getElementById(id);
const val = (id) => el(id)?.value || "";

function bindStateToUI() {
    if (el('brandSelect')) el('brandSelect').value = SurveyState.brand;
    if (el('clientName')) el('clientName').value = SurveyState.customerProfile.leadName;
    if (el('postCode')) el('postCode').value = SurveyState.customerProfile.postcode;
    if (el('roofSystem')) el('roofSystem').value = SurveyState.technicalSurvey.roofSystem;
    if (el('designerNotes')) el('designerNotes').value = SurveyState.technicalSurvey.designerNotes;
    
    Object.keys(SurveyState.pamphlets).forEach(k => {
        if(el(`check-${k}`)) el(`check-${k}`).checked = SurveyState.pamphlets[k];
    });

    if(SurveyState.rawAssets.frontElevationImage) {
        sniper.setBackground(SurveyState.rawAssets.frontElevationImage);
    }
}

function updateStateFromUI() {
    SurveyState.brand = val('brandSelect') || SurveyState.brand;
    SurveyState.customerProfile.leadName = val('clientName');
    SurveyState.customerProfile.postcode = val('postCode');
    SurveyState.technicalSurvey.roofSystem = val('roofSystem');
    SurveyState.technicalSurvey.designerNotes = val('designerNotes');
    
    Object.keys(SurveyState.pamphlets).forEach(k => {
        if(el(`check-${k}`)) SurveyState.pamphlets[k] = el(`check-${k}`).checked;
    });
}

// --- 3. CORE ENGINES ---
el('btn-sync')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.innerText = "Syncing..."; btn.disabled = true;

    try {
        updateStateFromUI();
        SurveyState.rawAssets.frontElevationImage = sniper.exportCompressedBase64();
        
        const cleanState = validateState();
        cleanState.timestamps = { updatedAt: serverTimestamp() };
        if(!cleanState.id) cleanState.timestamps.createdAt = serverTimestamp();

        const docRef = cleanState.id ? doc(db, "surveys", cleanState.id) : doc(collection(db, "surveys"));
        await setDoc(docRef, cleanState, { merge: true });
        
        SurveyState.id = docRef.id;
        alert("Deployed to Command Center");
    } catch(err) {
        console.error(err); alert("Sync Failed");
    } finally {
        btn.innerText = "Save & Sync"; btn.disabled = false;
    }
});

el('btn-ai-polish')?.addEventListener('click', async (e) => {
    const rawText = val('designerNotes').trim();
    if (!rawText) return;
    
    const btn = e.target;
    btn.innerText = "Polishing..."; btn.disabled = true;

    try {
        const rewriteNotes = httpsCallable(functions, 'rewriteNotes');
        const result = await rewriteNotes({ rawText });
        if (result.data?.polishedText) {
            el('designerNotes').value = result.data.polishedText;
            updateStateFromUI();
        }
    } catch (err) {
        alert("AI Engine Error");
    } finally {
        btn.innerText = "✨ AI Polish"; btn.disabled = false;
    }
});

el('btn-generate-pdf')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.innerText = "Compiling Perfect PDF..."; btn.disabled = true;

    try {
        updateStateFromUI();
        SurveyState.rawAssets.frontElevationImage = sniper.exportCompressedBase64();
        
        // Triggers the client-side jsPDF generator instead of the cloud function
        await generatePerfectPDF(SurveyState, BRAND_CONFIG);
        
        alert("PDF Compiled & Exported Successfully!");
    } catch (err) {
        console.error(err); alert("PDF Generation Failed");
    } finally {
        btn.innerText = "Generate PDF Pack"; btn.disabled = false;
    }
});
