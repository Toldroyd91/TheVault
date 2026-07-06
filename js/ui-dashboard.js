import { 
    auth, db, collection, query, orderBy, onSnapshot, doc, updateDoc, 
    addDoc, serverTimestamp, onAuthStateChanged, signInWithEmailAndPassword, 
    signOut, BRAND_CONFIG 
} from './core-firebase.js';

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
            alert("Access Denied: You do not have Designer privileges on this system.");
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
    if(!email || !pass) return alert("Please enter both your secure email and password.");
    
    const btn = document.getElementById('btnLogin');
    const originalText = btn.innerText;
    btn.innerText = "Authenticating...";
    
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        alert("Login Failed: " + err.message);
        btn.innerText = originalText;
    }
});

document.getElementById('btnLogout')?.addEventListener('click', () => signOut(auth));

const cloudinaryUrl = "https://api.cloudinary.com/v1_1/dqkhhz0f9/upload";

// --- GLOBAL APP STATE ---
window.leadCache = {}; 
window.currentOpenLeadId = null;
window.currentFilterMode = 'all';
window.allLeadsData = []; 

// --- TELEMETRY HELPERS ---
function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((new Date() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function formatViewTime(seconds) {
    if (!seconds) return '0m';
    if (seconds < 60) return '< 1m';
    const m = Math.floor(seconds / 60);
    if (m > 60) return `${Math.floor(m/60)}h ${m%60}m`;
    return `${m}m`;
}

function calculateRAG(lastActiveMs) {
    if (!lastActiveMs) return { color: 'text-gray-500', dot: '⚪', label: 'No Interaction', isActionRequired: true };
    const hoursSince = (Date.now() - lastActiveMs) / (1000 * 60 * 60);
    if (hoursSince < 24) return { color: 'text-emerald-400', dot: '🟢', label: 'Highly Engaged', isActionRequired: false };
    if (hoursSince < 72) return { color: 'text-amber-400', dot: '🟡', label: 'Action Required', isActionRequired: true };
    return { color: 'text-rose-500', dot: '🔴', label: 'Going Cold', isActionRequired: true };
}

// --- INIT FINANCIAL SETTINGS ---
const initFinances = () => {
    const prefs = JSON.parse(localStorage.getItem('cohi_finances') || '{}');
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const sd = document.getElementById('finStartDate');
    const ed = document.getElementById('finEndDate');
    
    if(sd) sd.value = prefs.start || firstDay.toISOString().split('T')[0];
    if(ed) ed.value = prefs.end || lastDay.toISOString().split('T')[0];
    
    const mt = document.getElementById('finMonthlyTarget');
    const yt = document.getElementById('finYearlyTarget');
    const cp = document.getElementById('finCommProfile');
    
    if(mt) mt.value = prefs.monthly || 50000;
    if(yt) yt.value = prefs.yearly || 600000;
    if(cp) cp.value = prefs.comm || "1";
};
document.addEventListener("DOMContentLoaded", initFinances);

window.calcFinances = () => {
    const sDateInput = document.getElementById('finStartDate')?.value;
    const eDateInput = document.getElementById('finEndDate')?.value;
    
    if(!sDateInput || !eDateInput) return; 
    
    const sDate = new Date(sDateInput);
    const eDate = new Date(eDateInput);
    eDate.setHours(23, 59, 59, 999); 
    
    const mTarget = parseFloat(document.getElementById('finMonthlyTarget')?.value) || 0;
    const yTarget = parseFloat(document.getElementById('finYearlyTarget')?.value) || 0;
    const commRate = parseFloat(document.getElementById('finCommProfile')?.value) / 100;

    localStorage.setItem('cohi_finances', JSON.stringify({
        start: sDateInput, end: eDateInput, monthly: mTarget, yearly: yTarget, comm: document.getElementById('finCommProfile')?.value
    }));

    let pipeline = 0, soldPeriod = 0, soldYTD = 0;
    const currentYear = new Date().getFullYear();

    window.allLeadsData.forEach(data => {
        const val = parseFloat(data.contractValue) || 0;
        const status = data.pipelineStatus || "1. Consultation";
        
        if (status !== "Closed Won" && status !== "Closed Lost") {
            pipeline += val;
        } else if (status === "Closed Won") {
            const updatedStr = data.timestamps?.updatedAt;
            if(updatedStr) {
                const d = new Date(updatedStr);
                if (d >= sDate && d <= eDate) soldPeriod += val;
                if (d.getFullYear() === currentYear) soldYTD += val;
            }
        }
    });

    const commPeriod = (soldPeriod / 1.2) * commRate;

    const elPipe = document.getElementById('hudPipeline'); const elSold = document.getElementById('hudSoldPeriod'); const elComm = document.getElementById('hudCommPeriod');
    if(elPipe) elPipe.innerText = `£${pipeline.toLocaleString()}`;
    if(elSold) elSold.innerText = `£${soldPeriod.toLocaleString()}`;
    if(elComm) elComm.innerText = `£${commPeriod.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    
    const mPerc = mTarget > 0 ? ((soldPeriod / mTarget) * 100).toFixed(1) : 0;
    const yPerc = yTarget > 0 ? ((soldYTD / yTarget) * 100).toFixed(1) : 0;
    
    const elMVs = document.getElementById('hudMonthlyVs'); const elMBar = document.getElementById('barMonthly');
    const elYVs = document.getElementById('hudYearlyVs'); const elYBar = document.getElementById('barYearly');
    
    if(elMVs) elMVs.innerText = `${mPerc}%`; if(elMBar) elMBar.style.width = `${Math.min(mPerc, 100)}%`;
    if(elYVs) elYVs.innerText = `${yPerc}%`; if(elYBar) elYBar.style.width = `${Math.min(yPerc, 100)}%`;
};

// --- REAL-TIME DATABASE SYNC (WITH LEGACY BRIDGE) ---
onSnapshot(query(collection(db, "surveys"), orderBy("timestamps.updatedAt", "desc")), (snapshot) => {
    
    const colIds = ['col-stage1', 'col-stage2', 'col-stage3', 'col-stage4'];
    colIds.forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = ''; });

    let activeLeads = 0, surveysPending = 0, actionRequired = 0, allTimeWon = 0;
    window.allLeadsData = []; 

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        
        window.leadCache[id] = data; 
        window.allLeadsData.push({ id, ...data }); 

        // Read both old and new statuses to prevent data loss
        const legacyStatus = data.pipelineStatus || '';
        const newAccessLevel = data.vaultAccessLevel || 'survey_only';
        
        if (legacyStatus === "Closed Won") { allTimeWon++; return; } 
        else if (legacyStatus === "Closed Lost") { return; }

        const rag = calculateRAG(data.vaultTelemetry?.lastActive);
        const viewTime = data.vaultTelemetry?.totalViewTimeSeconds || 0;
        const brandData = BRAND_CONFIG[data.brand] || BRAND_CONFIG["YorkshireWindows"];

        activeLeads++;
        if (legacyStatus === "3. Technical Survey" || newAccessLevel === 'full_access') surveysPending++;
        if (rag.isActionRequired) actionRequired++;

        const leadName = data.customerProfile?.leadName || 'Unnamed Lead';
        const postcode = data.customerProfile?.postcode || 'TBC';
        const contractValue = data.contractValue ? `£${parseInt(data.contractValue).toLocaleString()}` : 'Value TBC';
        const financeStatus = data.financeStatus || 'TBC';
        const owner = data.owner || 'Unassigned';
        const isHot = viewTime > 300 && data.vaultTelemetry?.lastActive && (Date.now() - data.vaultTelemetry.lastActive < 86400000 * 2);

        const cardHTML = `
            <div class="lead-card glass-panel p-4 cursor-grab active:cursor-grabbing border-l-4 hover:bg-[#1e293b] transition-all relative group ${isHot ? 'hot-lead border-r-2 border-r-[#E50914]' : ''}" 
                 style="border-left-color: ${brandData.theme}" 
                 draggable="true" 
                 ondragstart="window.dragStart(event, '${id}')"
                 onclick="window.openDrawer('${id}')"
                 data-search="${leadName.toLowerCase()} ${postcode.toLowerCase()} ${owner.toLowerCase()}"
                 data-action="${rag.isActionRequired ? 'true' : 'false'}"
                 data-survey="${(legacyStatus === "3. Technical Survey" || newAccessLevel === 'full_access') ? 'true' : 'false'}">
                
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
                    <span class="font-mono text-gray-400" title="Viewing Time">👁️ ${formatViewTime(viewTime)}</span>
                </div>

                <div class="grid grid-cols-2 gap-2 mt-2">
                    <a href="quotes.html?leadId=${id}" onclick="event.stopPropagation()" class="bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/50 text-[10px] py-1.5 rounded text-center font-bold transition z-10 relative">🔨 Quote</a>
                    <a href="vault.html?id=${id}" target="_blank" onclick="event.stopPropagation()" class="bg-[#0dcaf0]/20 hover:bg-[#0dcaf0] text-[#0dcaf0] hover:text-black border border-[#0dcaf0]/50 text-[10px] py-1.5 rounded text-center font-bold transition z-10 relative">🔒 Vault</a>
                </div>
                
                <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                    <button onclick="event.stopPropagation(); window.replyToClient('${id}')" class="bg-slate-800 hover:bg-[#0dcaf0] text-gray-300 hover:text-black p-1 rounded text-xs transition" title="Fast Reply">💬</button>
                    <button onclick="event.stopPropagation(); window.open('admin-gatekeeper.html?id=${id}', '_blank')" class="bg-slate-800 hover:bg-[#E50914] text-gray-300 hover:text-white p-1 rounded text-xs transition" title="Gatekeeper">⚙️</button>
                </div>
            </div>
        `;
        
        // Routing Bridge: Maps Old Data and New Data to the correct column
        if (legacyStatus === '4. Handover' || newAccessLevel === 'closed') {
            document.getElementById('col-stage4').innerHTML += cardHTML;
        } else if (legacyStatus === '3. Technical Survey' || newAccessLevel === 'full_access') {
            document.getElementById('col-stage3').innerHTML += cardHTML;
        } else if (legacyStatus === '2. Quote Sent' || newAccessLevel === 'design_tease') {
            document.getElementById('col-stage2').innerHTML += cardHTML;
        } else {
            document.getElementById('col-stage1').innerHTML += cardHTML;
        }
    });

    const elActive = document.getElementById('hudActiveLeads'); const elSurv = document.getElementById('hudSurveys');
    const elAct = document.getElementById('hudAction'); const elWon = document.getElementById('hudTotalWon');

    if(elActive) elActive.innerText = activeLeads; if(elSurv) elSurv.innerText = surveysPending;
    if(elAct) elAct.innerText = actionRequired; if(elWon) elWon.innerText = allTimeWon;

    colIds.forEach((id, index) => {
        const countEl = document.getElementById(`count-stage${index + 1}`);
        const colEl = document.getElementById(id);
        if(countEl && colEl) countEl.innerText = colEl.children.length;
    });
    
    window.applyFilters(); 
    window.calcFinances();
});

// --- FILTERING ENGINE ---
window.filterByMetric = (mode) => {
    window.currentFilterMode = mode;
    document.getElementById('btnClearFilters')?.classList.remove('hidden');
    window.applyFilters();
};

window.clearFilters = () => {
    window.currentFilterMode = 'all';
    const sInput = document.getElementById('searchInput');
    if(sInput) sInput.value = '';
    document.getElementById('btnClearFilters')?.classList.add('hidden');
    window.applyFilters();
};

window.applyFilters = () => {
    const query = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const mode = window.currentFilterMode;

    document.querySelectorAll('.lead-card').forEach(card => {
        const searchData = card.getAttribute('data-search');
        const isAction = card.getAttribute('data-action') === 'true';
        const isSurvey = card.getAttribute('data-survey') === 'true';
        
        let show = true;
        if (query && !searchData.includes(query)) show = false;
        if (mode === 'action' && !isAction) show = false;
        if (mode === 'survey' && !isSurvey) show = false;
        if (mode === 'won') show = false; 

        card.style.display = show ? 'block' : 'none';
    });
};

window.filterLeads = () => {
    if(document.getElementById('searchInput')?.value.trim() !== '') {
        document.getElementById('btnClearFilters')?.classList.remove('hidden');
    }
    window.applyFilters();
};

// --- TECHNICAL DRAWER CONTROLS ---
window.calculateVAT = () => {
    const val = parseFloat(document.getElementById('financeValueInput')?.value) || 0;
    const net = val / 1.2;
    const vat = val - net;
    
    const nc = document.getElementById('netCalc'); const vc = document.getElementById('vatCalc');
    if(nc) nc.innerText = `£${net.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if(vc) vc.innerText = `£${vat.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
};

window.openDrawer = (id) => {
    window.currentOpenLeadId = id;
    const data = window.leadCache[id];
    if(!data) return;

    document.getElementById('drawerLeadName').innerText = data.customerProfile?.leadName || 'Unnamed Lead';
    const brandData = BRAND_CONFIG[data.brand] || BRAND_CONFIG["YorkshireWindows"];
    const brandBadge = document.getElementById('drawerBrand');
    if(brandBadge) { brandBadge.innerText = brandData.name; brandBadge.style.color = brandData.theme; }

    const oIn = document.getElementById('ownerInput'); const fIn = document.getElementById('followUpInput');
    const fvIn = document.getElementById('financeValueInput'); const fsIn = document.getElementById('financeStatusInput');
    const tnIn = document.getElementById('techNotesInput');

    if(oIn) oIn.value = data.owner || 'Unassigned';
    if(fIn) fIn.value = data.followUpDate || '';
    if(fvIn) fvIn.value = data.contractValue || '';
    if(fsIn) fsIn.value = data.financeStatus || 'TBC';
    if(tnIn) tnIn.value = data.technicalNotes || '';
    
    window.calculateVAT();

    const rillaInput = document.getElementById('rillaInput'); const rillaBtn = document.getElementById('rillaOpenBtn');
    if(rillaInput && rillaBtn) {
        if(data.rillaLink) {
            rillaInput.value = data.rillaLink; rillaBtn.href = data.rillaLink; rillaBtn.classList.remove('hidden');
        } else {
            rillaInput.value = ''; rillaBtn.classList.add('hidden');
        }
    }

    const gatekeeperBtn = document.getElementById('btnOpenGatekeeper');
    if(gatekeeperBtn) {
        gatekeeperBtn.onclick = () => window.open(`admin-gatekeeper.html?id=${id}`, '_blank');
    }

    const gallery = document.getElementById('sniperGallery');
    if(gallery) {
        const markups = data.surveyPhotos || data.sniperMarkups || []; 
        if (markups.length > 0) {
            gallery.innerHTML = ''; gallery.classList.remove('p-4', 'border-dashed', 'text-center', 'text-gray-500', 'italic');
            markups.forEach(url => {
                gallery.innerHTML += `<a href="${url}" target="_blank" class="block"><img src="${url}" class="w-full h-24 object-cover rounded-lg border border-slate-700 hover:border-[#0dcaf0] transition cursor-pointer shadow-md"></a>`;
            });
        } else {
            gallery.innerHTML = 'No site photos synced yet.'; gallery.classList.add('p-4', 'border-dashed', 'text-center', 'text-gray-500', 'italic');
        }
    }

    document.getElementById('drawerOverlay')?.classList.remove('hidden');
    document.getElementById('techDrawer')?.classList.remove('translate-x-full');
};

window.closeDrawer = () => {
    window.currentOpenLeadId = null;
    document.getElementById('drawerOverlay')?.classList.add('hidden');
    document.getElementById('techDrawer')?.classList.add('translate-x-full');
};

window.saveDrawerData = async (type) => {
    const id = window.currentOpenLeadId;
    if(!id) return;
    
    const updates = {};
    if(type === 'management') {
        updates.owner = document.getElementById('ownerInput')?.value; updates.followUpDate = document.getElementById('followUpInput')?.value;
    } else if(type === 'rilla') {
        updates.rillaLink = document.getElementById('rillaInput')?.value.trim();
    } else if (type === 'notes') {
        updates.technicalNotes = document.getElementById('techNotesInput')?.value.trim();
    } else if (type === 'finance') {
        updates.contractValue = document.getElementById('financeValueInput')?.value.trim(); updates.financeStatus = document.getElementById('financeStatusInput')?.value;
    }
    updates["timestamps.updatedAt"] = new Date().toISOString();
    
    try {
        await updateDoc(doc(db, "surveys", id), updates);
        alert("System Updated Successfully!");
    } catch(e) { console.error("Error saving drawer data:", e); }
};

window.closeDeal = async (status) => {
    const id = window.currentOpenLeadId;
    if(!id) return;
    if(confirm(`Mark deal as ${status}? It will be removed from the active kanban pipeline.`)) {
        try {
            await updateDoc(doc(db, "surveys", id), { pipelineStatus: status, "timestamps.updatedAt": new Date().toISOString() });
            window.closeDrawer();
        } catch (err) { console.error("Failed to close deal:", err); }
    }
};

// --- DRAG AND DROP ---
window.dragStart = (e, id) => { e.dataTransfer.setData("text/plain", id); e.target.style.opacity = "0.5"; };
document.addEventListener("dragend", (e) => { e.target.style.opacity = "1"; });

document.querySelectorAll('.kanban-dropzone').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('bg-slate-800/60', 'border-[#0dcaf0]', 'border-dashed', 'border-2'); });
    zone.addEventListener('dragleave', e => { zone.classList.remove('bg-slate-800/60', 'border-[#0dcaf0]', 'border-dashed', 'border-2'); });
    zone.addEventListener('drop', async e => {
        e.preventDefault();
        zone.classList.remove('bg-slate-800/60', 'border-[#0dcaf0]', 'border-dashed', 'border-2');
        const leadId = e.dataTransfer.getData("text/plain");
        const newStage = zone.getAttribute('data-stage');
        
        let newStatus = "1. Consultation";
        if(newStage === 'tease') newStatus = "2. Quote Sent";
        if(newStage === 'unlocked') newStatus = "3. Technical Survey";
        if(newStage === 'closed') newStatus = "4. Handover";

        if (leadId && newStage) {
            try { await updateDoc(doc(db, "surveys", leadId), { pipelineStatus: newStatus, "timestamps.updatedAt": new Date().toISOString() }); } 
            catch (err) { console.error("Failed to move lead:", err); }
        }
    });
});

window.replyToClient = async (id) => {
    const msg = prompt("Fast Reply to Vault Comm Center:", "Hi, just checking in to see if you had any questions on the design?");
    if(!msg) return;
    try {
        await addDoc(collection(db, `surveys/${id}/messages`), { sender: 'Designer', text: msg, timestamp: serverTimestamp() });
        await updateDoc(doc(db, "surveys", id), { "vaultTelemetry.lastActive": Date.now(), "timestamps.updatedAt": new Date().toISOString() });
    } catch (e) { console.error(e); }
};
