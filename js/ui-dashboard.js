import { auth, db, collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, onAuthStateChanged, signInWithEmailAndPassword, signOut, BRAND_CONFIG } from './core-firebase.js';

// --- 1. AUTHENTICATION ENGINE ---
const authGate = document.getElementById('authGate');
const dashboardApp = document.getElementById('dashboardApp');

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const idTokenResult = await user.getIdTokenResult();
        if (idTokenResult.claims.role === 'designer' || user.email.toLowerCase() === 'thomasoldroyd@yorkshirewindows.com') {
            if(authGate) authGate.classList.add('hidden');
            if(dashboardApp) dashboardApp.classList.remove('hidden');
            const displayName = idTokenResult.claims.displayName || "Tom | Senior Designer";
            const welcomeText = document.getElementById('designerWelcome');
            if(welcomeText) welcomeText.innerText = `Welcome, ${displayName}`;
        } else {
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
    } catch (err) {
        alert("Login Failed: " + err.message);
        btn.innerText = "Login";
    }
});

document.getElementById('btnLogout')?.addEventListener('click', () => signOut(auth));


// --- 2. KANBAN PIPELINE, HUD, & DRAWER ENGINE ---
const cloudinaryUrl = "https://api.cloudinary.com/v1_1/dqk1hz0f8/upload";

window.leadCache = {}; 
window.currentOpenLeadId = null;

function calculateRAG(lastActiveMs) {
    if (!lastActiveMs) return { color: 'text-gray-500', dot: '⚪', label: 'No Interaction', isActionRequired: true };
    const hoursSince = (Date.now() - lastActiveMs) / (1000 * 60 * 60);
    if (hoursSince < 24) return { color: 'text-emerald-400', dot: '🟢', label: 'Highly Engaged', isActionRequired: false };
    if (hoursSince < 72) return { color: 'text-amber-400', dot: '🟡', label: 'Action Required', isActionRequired: true };
    return { color: 'text-rose-500', dot: '🔴', label: 'Going Cold', isActionRequired: true };
}

onSnapshot(query(collection(db, "surveys"), orderBy("timestamps.updatedAt", "desc")), (snapshot) => {
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
    let wonRevenue = 0;

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        window.leadCache[id] = data; 
        
        const currentStage = data.pipelineStatus || "1. Consultation"; 
        
        // Handle Archived Deals (Keep out of Kanban, calculate revenue)
        if (currentStage === "Closed Won") {
            wonRevenue += parseInt(data.contractValue || 0);
            return; 
        } else if (currentStage === "Closed Lost") {
            return;
        }

        const targetCol = cols[currentStage] || cols["1. Consultation"];
        const rag = calculateRAG(data.vaultTelemetry?.lastActive);
        const brandData = BRAND_CONFIG[data.brand] || BRAND_CONFIG["YorkshireWindows"];

        activeLeads++;
        if (currentStage === "3. Technical Survey") surveysPending++;
        if (rag.isActionRequired) actionRequired++;

        const leadName = data.customerProfile?.leadName || 'Unnamed Lead';
        const postcode = data.customerProfile?.postcode || 'TBC';
        const contractValue = data.contractValue ? `£${parseInt(data.contractValue).toLocaleString()}` : 'Value TBC';
        const financeStatus = data.financeStatus || 'TBC';
        const owner = data.owner || 'Unassigned';
        const followUp = data.followUpDate ? `📅 ${data.followUpDate}` : '';

        const cardHTML = `
            <div class="lead-card glass-panel p-4 cursor-grab active:cursor-grabbing border-l-4 hover:bg-[#1e293b] transition-all relative group" 
                 style="border-left-color: ${brandData.theme}" 
                 draggable="true" 
                 ondragstart="window.dragStart(event, '${id}')"
                 onclick="window.openDrawer('${id}')"
                 data-search="${leadName.toLowerCase()} ${postcode.toLowerCase()} ${owner.toLowerCase()}">
                
                <div class="flex justify-between items-start mb-1 pointer-events-none">
                    <h4 class="text-md font-black text-white">${leadName}</h4>
                </div>
                
                <div class="flex justify-between text-[10px] text-gray-400 mb-2 uppercase tracking-widest pointer-events-none">
                    <span>${postcode}</span>
                    <span class="text-[#0dcaf0]">${owner}</span>
                </div>
                
                <div class="flex justify-between items-center mb-3 pointer-events-none">
                    <span class="text-xs font-black text-amber-400">${contractValue}</span>
                    <span class="text-[9px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-gray-300 uppercase">${financeStatus}</span>
                </div>
                
                <div class="bg-slate-900/80 p-2 rounded text-[10px] flex justify-between items-center mb-3 pointer-events-none">
                    <span class="${rag.color} font-bold">${rag.dot} ${rag.label}</span>
                    <span class="text-gray-300">${followUp}</span>
                </div>

                <div class="grid grid-cols-2 gap-2 mt-2">
                    <a href="quotes.html?leadId=${id}" onclick="event.stopPropagation()" class="bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/50 text-[10px] py-1.5 rounded text-center font-bold transition z-10 relative">🔨 Quote</a>
                    <a href="vault.html?id=${id}" target="_blank" onclick="event.stopPropagation()" class="bg-[#0dcaf0]/20 hover:bg-[#0dcaf0] text-[#0dcaf0] hover:text-black border border-[#0dcaf0]/50 text-[10px] py-1.5 rounded text-center font-bold transition z-10 relative">🔒 Vault</a>
                </div>
                
                <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                    <button onclick="event.stopPropagation(); window.replyToClient('${id}')" class="bg-slate-800 hover:bg-[#0dcaf0] text-gray-300 hover:text-black p-1 rounded text-xs transition" title="Fast Reply">💬</button>
                    <button onclick="event.stopPropagation(); document.getElementById('up_${id}').click()" class="bg-slate-800 hover:bg-emerald-500 text-gray-300 hover:text-white p-1 rounded text-xs transition" title="Override PDF">📄</button>
                </div>
                <input type="file" id="up_${id}" class="hidden" accept=".pdf" onclick="event.stopPropagation()" onchange="window.uploadQuote('${id}', this)">
            </div>
        `;
        
        if(targetCol) targetCol.innerHTML += cardHTML;
    });

    // Update HUD 
    if(document.getElementById('hudActiveLeads')) document.getElementById('hudActiveLeads').innerText = activeLeads;
    if(document.getElementById('hudSurveys')) document.getElementById('hudSurveys').innerText = surveysPending;
    if(document.getElementById('hudAction')) document.getElementById('hudAction').innerText = actionRequired;
    if(document.getElementById('hudRevenueWon')) document.getElementById('hudRevenueWon').innerText = `£${wonRevenue.toLocaleString()}`;

    if(cols["1. Consultation"]) document.getElementById('count-stage1').innerText = cols["1. Consultation"].children.length;
    if(cols["2. Quote Sent"]) document.getElementById('count-stage2').innerText = cols["2. Quote Sent"].children.length;
    if(cols["3. Technical Survey"]) document.getElementById('count-stage3').innerText = cols["3. Technical Survey"].children.length;
    if(cols["4. Handover"]) document.getElementById('count-stage4').innerText = cols["4. Handover"].children.length;
    
    window.filterLeads(); 
});

// --- TECHNICAL DRAWER ENGINE ---
window.openDrawer = (id) => {
    window.currentOpenLeadId = id;
    const data = window.leadCache[id];
    if(!data) return;

    document.getElementById('drawerLeadName').innerText = data.customerProfile?.leadName || 'Unnamed Lead';
    
    const brandData = BRAND_CONFIG[data.brand] || BRAND_CONFIG["YorkshireWindows"];
    const brandBadge = document.getElementById('drawerBrand');
    brandBadge.innerText = brandData.name;
    brandBadge.style.color = brandData.theme;

    // Populate Fields
    document.getElementById('ownerInput').value = data.owner || 'Unassigned';
    document.getElementById('followUpInput').value = data.followUpDate || '';
    document.getElementById('financeValueInput').value = data.contractValue || '';
    document.getElementById('financeStatusInput').value = data.financeStatus || 'TBC';
    document.getElementById('techNotesInput').value = data.technicalNotes || '';

    const rillaInput = document.getElementById('rillaInput');
    const rillaBtn = document.getElementById('rillaOpenBtn');
    if(data.rillaLink) {
        rillaInput.value = data.rillaLink;
        rillaBtn.href = data.rillaLink;
        rillaBtn.classList.remove('hidden');
    } else {
        rillaInput.value = '';
        rillaBtn.classList.add('hidden');
    }

    // --- AUTO-PULL SNIPER MARKUPS FROM SURVEY ---
    const gallery = document.getElementById('sniperGallery');
    // We look for arrays named surveyPhotos or sniperMarkups in the database
    const markups = data.surveyPhotos || data.sniperMarkups || []; 
    
    if (markups.length > 0) {
        gallery.innerHTML = ''; // Clear placeholder
        gallery.classList.remove('p-4', 'border-dashed', 'text-center', 'text-gray-500', 'italic');
        
        markups.forEach(url => {
            gallery.innerHTML += `
                <a href="${url}" target="_blank" class="block">
                    <img src="${url}" class="w-full h-24 object-cover rounded-lg border border-slate-700 hover:border-[#0dcaf0] transition cursor-pointer shadow-md">
                </a>
            `;
        });
    } else {
        gallery.innerHTML = 'No site photos or markups synced from survey yet.';
        gallery.classList.add('p-4', 'border-dashed', 'text-center', 'text-gray-500', 'italic');
    }

    document.getElementById('drawerOverlay').classList.remove('hidden');
    document.getElementById('techDrawer').classList.remove('translate-x-full');
};

window.closeDrawer = () => {
    window.currentOpenLeadId = null;
    document.getElementById('drawerOverlay').classList.add('hidden');
    document.getElementById('techDrawer').classList.add('translate-x-full');
};

window.saveDrawerData = async (type) => {
    const id = window.currentOpenLeadId;
    if(!id) return;
    
    const updates = {};
    if(type === 'management') {
        updates.owner = document.getElementById('ownerInput').value;
        updates.followUpDate = document.getElementById('followUpInput').value;
        alert("Management Details Updated!");
    } else if(type === 'rilla') {
        updates.rillaLink = document.getElementById('rillaInput').value.trim();
        alert("Rilla Link Synced!");
    } else if (type === 'notes') {
        updates.technicalNotes = document.getElementById('techNotesInput').value.trim();
        alert("Structural Specifications Saved!");
    } else if (type === 'finance') {
        updates.contractValue = document.getElementById('financeValueInput').value.trim();
        updates.financeStatus = document.getElementById('financeStatusInput').value;
        alert("Financials Updated!");
    }
    
    updates["timestamps.updatedAt"] = new Date().toISOString();
    
    try {
        await updateDoc(doc(db, "surveys", id), updates);
    } catch(e) {
        console.error("Error saving drawer data:", e);
        alert("Failed to save changes.");
    }
};

window.closeDeal = async (status) => {
    const id = window.currentOpenLeadId;
    if(!id) return;
    if(confirm(`Are you sure you want to mark this deal as ${status}? It will be removed from the active pipeline.`)) {
        try {
            await updateDoc(doc(db, "surveys", id), { 
                pipelineStatus: status,
                "timestamps.updatedAt": new Date().toISOString()
            });
            window.closeDrawer();
        } catch (err) {
            console.error("Failed to close deal:", err);
            alert("Failed to close deal.");
        }
    }
};

// --- LIVE SEARCH ENGINE ---
window.filterLeads = () => {
    const query = document.getElementById('searchInput')?.value.toLowerCase() || '';
    document.querySelectorAll('.lead-card').forEach(card => {
        const searchData = card.getAttribute('data-search');
        if (searchData.includes(query)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
};

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
