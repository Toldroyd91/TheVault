import { auth, db, collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, onAuthStateChanged, signInWithEmailAndPassword, signOut, BRAND_CONFIG } from './core-firebase.js';

// --- 1. AUTHENTICATION ENGINE ---
const authGate = document.getElementById('authGate');
const dashboardApp = document.getElementById('dashboardApp');

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const idTokenResult = await user.getIdTokenResult();
        
        // MASTER KEY: Let them in if they have the stamp, OR if it's your exact email
        if (idTokenResult.claims.role === 'designer' || user.email.toLowerCase() === 'thomasoldroyd@yorkshirewindows.com') {
            if(authGate) authGate.classList.add('hidden');
            if(dashboardApp) dashboardApp.classList.remove('hidden');
            
            const displayName = idTokenResult.claims.displayName || "Tom | Senior Designer";
            const welcomeText = document.getElementById('designerWelcome');
            if(welcomeText) welcomeText.innerText = `Welcome, ${displayName}`;
        } else {
            console.log("Access Denied: Not a designer.");
            alert("Access Denied: You do not have Designer privileges.");
            signOut(auth);
        }
    } else {
        if(authGate) authGate.classList.remove('hidden');
        if(dashboardApp) dashboardApp.classList.add('hidden');
    }
});

document.getElementById('btnLogin')?.addEventListener('click', async () => {
    const email = document.getElementById('authEmail')?.value.trim();
    const pass = document.getElementById('authPassword')?.value;
    if(!email || !pass) return alert("Please enter both email and password.");
    
    const btn = document.getElementById('btnLogin');
    btn.innerText = "Authenticating...";
    
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        // Clean login. The Master Key above handles the rest!
    } catch (err) {
        alert("Login Failed: " + err.message);
        btn.innerText = "Login";
    }
});

document.getElementById('btnLogout')?.addEventListener('click', () => signOut(auth));


// --- 2. KANBAN PIPELINE & HUD ENGINE ---
const cloudinaryUrl = "https://api.cloudinary.com/v1_1/dqk1hz0f8/upload";

function calculateRAG(lastActiveMs) {
    if (!lastActiveMs) return { color: 'text-gray-500', dot: '⚪', label: 'No Interaction', isActionRequired: true };
    const hoursSince = (Date.now() - lastActiveMs) / (1000 * 60 * 60);
    if (hoursSince < 24) return { color: 'text-emerald-400', dot: '🟢', label: 'Highly Engaged', isActionRequired: false };
    if (hoursSince < 72) return { color: 'text-amber-400', dot: '🟡', label: 'Action Required', isActionRequired: true };
    return { color: 'text-rose-500', dot: '🔴', label: 'Going Cold', isActionRequired: true };
}

onSnapshot(query(collection(db, "surveys"), orderBy("timestamps.updatedAt", "desc")), (snapshot) => {
    // 1. Clear the board columns
    const cols = {
        "1. Consultation": document.getElementById('col-stage1'),
        "2. Quote Sent": document.getElementById('col-stage2'),
        "3. Technical Survey": document.getElementById('col-stage3'),
        "4. Handover": document.getElementById('col-stage4')
    };
    
    Object.values(cols).forEach(col => { if(col) col.innerHTML = ''; });

    let activeLeads = 0;
    let surveysPending = 0;
    let actionRequired = 0;

    // 2. Populate the board with leads
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        
        // Define default stage if missing
        const currentStage = data.pipelineStatus || "1. Consultation"; 
        const targetCol = cols[currentStage] || cols["1. Consultation"];
        
        const rag = calculateRAG(data.vaultTelemetry?.lastActive);
        const brandData = BRAND_CONFIG[data.brand] || BRAND_CONFIG["YorkshireWindows"];

        // HUD Math Calculation
        activeLeads++;
        if (currentStage === "3. Technical Survey") surveysPending++;
        if (rag.isActionRequired) actionRequired++;

        // Build the Kanban Card HTML
        const cardHTML = `
            <div class="glass-panel p-4 cursor-grab active:cursor-grabbing border-l-4 hover:bg-[#1e293b] transition-all relative group" 
                 style="border-left-color: ${brandData.theme}" 
                 draggable="true" 
                 ondragstart="window.dragStart(event, '${id}')">
                
                <div class="flex justify-between items-start mb-2">
                    <h4 class="text-md font-black text-white">${data.customerProfile?.leadName || 'Unnamed Lead'}</h4>
                </div>
                
                <div class="text-[10px] text-gray-400 mb-3 uppercase tracking-widest">${data.customerProfile?.postcode || 'TBC'}</div>
                
                <div class="bg-slate-900/80 p-2 rounded text-[10px] flex justify-between items-center mb-3">
                    <span class="${rag.color} font-bold">${rag.dot} ${rag.label}</span>
                </div>

                <div class="grid grid-cols-2 gap-2 mt-2">
                    <a href="quotes.html?leadId=${id}" class="bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/50 text-[10px] py-1.5 rounded text-center font-bold transition">🔨 Quote</a>
                    <a href="vault.html?id=${id}" target="_blank" class="bg-[#0dcaf0]/20 hover:bg-[#0dcaf0] text-[#0dcaf0] hover:text-black border border-[#0dcaf0]/50 text-[10px] py-1.5 rounded text-center font-bold transition">🔒 Vault</a>
                </div>
                
                <!-- Quick Action Overlay (Appears on Hover) -->
                <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button onclick="window.replyToClient('${id}')" class="bg-slate-800 hover:bg-[#0dcaf0] text-gray-300 hover:text-black p-1 rounded text-xs transition" title="Fast Reply">💬</button>
                    <button onclick="document.getElementById('up_${id}').click()" class="bg-slate-800 hover:bg-emerald-500 text-gray-300 hover:text-white p-1 rounded text-xs transition" title="Override PDF">📄</button>
                </div>
                <!-- Hidden PDF Uploader -->
                <input type="file" id="up_${id}" class="hidden" accept=".pdf" onchange="window.uploadQuote('${id}', this)">
            </div>
        `;
        
        if(targetCol) targetCol.innerHTML += cardHTML;
    });

    // 3. Update HUD UI Metrics
    if(document.getElementById('hudActiveLeads')) document.getElementById('hudActiveLeads').innerText = activeLeads;
    if(document.getElementById('hudSurveys')) document.getElementById('hudSurveys').innerText = surveysPending;
    if(document.getElementById('hudAction')) document.getElementById('hudAction').innerText = actionRequired;

    // 4. Update Kanban Column Counters
    if(cols["1. Consultation"]) document.getElementById('count-stage1').innerText = cols["1. Consultation"].children.length;
    if(cols["2. Quote Sent"]) document.getElementById('count-stage2').innerText = cols["2. Quote Sent"].children.length;
    if(cols["3. Technical Survey"]) document.getElementById('count-stage3').innerText = cols["3. Technical Survey"].children.length;
    if(cols["4. Handover"]) document.getElementById('count-stage4').innerText = cols["4. Handover"].children.length;
});

// --- DRAG AND DROP ENGINE ---
window.dragStart = (e, id) => {
    e.dataTransfer.setData("text/plain", id);
    e.target.style.opacity = "0.5";
};

document.addEventListener("dragend", (e) => {
    e.target.style.opacity = "1";
});

document.querySelectorAll('.kanban-dropzone').forEach(zone => {
    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('bg-slate-800/60');
        zone.classList.add('border-[#0dcaf0]');
    });
    
    zone.addEventListener('dragleave', e => {
        zone.classList.remove('bg-slate-800/60');
        zone.classList.remove('border-[#0dcaf0]');
    });
    
    zone.addEventListener('drop', async e => {
        e.preventDefault();
        zone.classList.remove('bg-slate-800/60');
        zone.classList.remove('border-[#0dcaf0]');
        
        const leadId = e.dataTransfer.getData("text/plain");
        const newStage = zone.getAttribute('data-stage');
        
        if (leadId && newStage) {
            try {
                await updateDoc(doc(db, "surveys", leadId), { 
                    pipelineStatus: newStage,
                    "timestamps.updatedAt": new Date().toISOString()
                });
                console.log(`Lead ${leadId} moved to ${newStage}`);
            } catch (err) {
                console.error("Failed to move lead:", err);
            }
        }
    });
});

// --- MANUAL ACTIONS ---
window.uploadQuote = async (id, inputEl) => {
    const file = inputEl.files[0];
    if(!file) return;
    
    // Find the quick action button to show loading state
    const overrideBtn = inputEl.previousElementSibling.querySelector('button[title="Override PDF"]');
    const ogText = overrideBtn.innerText;
    overrideBtn.innerText = "⏳";
    
    const fd = new FormData();
    fd.append('file', file); 
    fd.append('upload_preset', "crm_document_uploads");
    
    try {
        const res = await fetch(cloudinaryUrl, { method: 'POST', body: fd });
        const json = await res.json();
        await updateDoc(doc(db, "surveys", id), { 
            "uDesignBridge.quotePdfUrl": json.secure_url, 
            pipelineStatus: "2. Quote Sent" 
        });
        alert("Quote securely deployed!");
    } catch(e) { 
        console.error(e); 
        alert("Upload failed."); 
    } finally { 
        overrideBtn.innerText = ogText;
    }
};

window.replyToClient = async (id) => {
    const msg = prompt("Fast Reply:");
    if(!msg) return;
    await addDoc(collection(db, `surveys/${id}/messages`), { 
        sender: 'Designer', 
        text: msg, 
        timestamp: serverTimestamp() 
    });
};
