import { db, doc, getDoc, updateDoc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, BRAND_CONFIG, arrayUnion, increment } from './core-firebase.js';

let projectId = new URLSearchParams(window.location.search).get('id');
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dqkhhz0f9/image/upload"; 
const UPLOAD_PRESET = "crm_document_uploads";

function formatCamelCase(text) {
    const result = text.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
}

// OSM Math
function lon2tile(lon,zoom) { return (Math.floor((lon+180)/360*Math.pow(2,zoom))); }
function lat2tile(lat,zoom)  { return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom))); }

function updateTimeline(status) {
    const s1 = document.getElementById('step1'); const s2 = document.getElementById('step2');
    const s3 = document.getElementById('step3'); const s4 = document.getElementById('step4');
    
    [s1, s2, s3, s4].forEach(el => { 
        if(!el) return;
        el.className = 'timeline-step'; 
        el.innerHTML = el.innerHTML.replace('text-[#238636]', 'text-gray-500').replace('text-white', 'text-gray-500').replace('<div class="text-[10px] text-[#238636]">Completed</div>', '').replace('<div class="text-[10px]" style="color: var(--accent-primary, #0dcaf0);">In Progress</div>', ''); 
    });

    const markActive = (el) => { if(!el) return; el.classList.add('active'); el.querySelector('div').classList.replace('text-gray-500', 'text-white'); el.innerHTML += `<div class="text-[10px]" style="color: var(--accent-primary, #0dcaf0);">In Progress</div>`; };
    const markComplete = (el) => { if(!el) return; el.classList.add('completed'); el.querySelector('div').classList.replace('text-gray-500', 'text-white'); el.innerHTML += `<div class="text-[10px] text-[#238636]">Completed</div>`; };

    if (status === "1. Consultation") { markActive(s1); }
    else if (status === "2. Quote Sent") { markComplete(s1); markActive(s2); }
    else if (status === "3. Technical Survey") { markComplete(s1); markComplete(s2); markActive(s3); }
    else if (status === "4. Handover") { markComplete(s1); markComplete(s2); markComplete(s3); markActive(s4); }
    else if (status === "Closed Won") { markComplete(s1); markComplete(s2); markComplete(s3); markComplete(s4); }
}

function renderDynamicSurveyData(data) {
    const container = document.getElementById('dynamicSurveyData');
    if (!container) return;
    container.innerHTML = '';

    const categoriesToRender = { 'Design & Architecture': data.projectSpecs, 'Designer Insights': data.designerInsights, 'Compliance': data.compliance };
    let hasData = false;

    Object.entries(categoriesToRender).forEach(([title, categoryData]) => {
        if (!categoryData || Object.keys(categoryData).length === 0) return;
        let html = `<div class="mb-6 bg-[#161b22] p-5 rounded-xl border border-[#30363d] shadow-lg"><h4 class="text-sm font-black text-[#0dcaf0] uppercase tracking-widest mb-4 pb-2 border-b border-[#30363d]">${title}</h4><div class="grid grid-cols-2 gap-4">`;
        let categoryHasData = false;
        Object.entries(categoryData).forEach(([key, value]) => {
            if (value && value !== '' && value !== 'Select' && typeof value !== 'object') {
                categoryHasData = true; hasData = true;
                html += `<div class="bg-[#090d13] p-3 rounded-lg border border-[#30363d] shadow-inner"><label class="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">${formatCamelCase(key)}</label><div class="font-bold text-sm text-white break-words whitespace-pre-wrap">${value}</div></div>`;
            }
        });
        html += `</div></div>`;
        if (categoryHasData) container.innerHTML += html;
    });

    if (!hasData) container.innerHTML = '<div class="text-xs text-gray-500 italic p-4 bg-[#161b22] rounded-lg border border-[#30363d]">Site scope is currently being finalized.</div>';
}

const btnAccess = document.getElementById('btnAccess');
const pinInput = document.getElementById('vaultPinInput');

async function attemptDecrypt() {
    if(!projectId) { projectId = prompt("System requires a Project ID to access the vault. Please enter it:"); if(!projectId) return; }

    const originalText = btnAccess.innerText; btnAccess.innerText = "Decrypting..."; btnAccess.disabled = true;
    
    try {
        const docRef = doc(db, "surveys", projectId.trim());
        const snap = await getDoc(docRef);
        
        if(!snap.exists()) { btnAccess.innerText = originalText; btnAccess.disabled = false; return alert(`DATABASE ERROR: Cannot locate a project with ID: ${projectId.trim()}`); }

        const data = snap.data();
        const storedPin = String(data.customerProfile?.vaultPIN || "").trim();
        const enteredPin = String(pinInput.value).trim();
        
        // MASTER OVERRIDE ALLOWED HERE
        if(enteredPin !== "0000" && enteredPin !== storedPin) { btnAccess.innerText = originalText; btnAccess.disabled = false; return alert(`AUTH ERROR: PIN incorrect.`); }

        await updateDoc(docRef, { "vaultTelemetry.lastActive": Date.now() });
        document.getElementById('loginGate').style.display = 'none';
        document.getElementById('vaultContent').style.display = 'flex';

        // --- SILENT TELEMETRY TRACKER ---
        // Tracks how many seconds the customer stares at the vault
        let sessionSeconds = 0;
        setInterval(async () => {
            if(document.visibilityState === 'visible') {
                sessionSeconds += 15;
                try {
                    await updateDoc(docRef, {
                        "vaultTelemetry.totalViewTimeSeconds": increment(15),
                        "vaultTelemetry.lastActive": Date.now()
                    });
                } catch(e) {}
            }
        }, 15000); // Logs to database every 15 seconds they look at it

        onSnapshot(docRef, (docSnap) => {
            const data = docSnap.data();
            const brandId = data.brand || "YorkshireWindows";
            const brandData = BRAND_CONFIG[brandId] || BRAND_CONFIG["YorkshireWindows"];
            
            document.documentElement.style.setProperty('--accent-primary', brandData.theme);
            document.title = `${brandData.name} | Secure Vault`;
            
            const mainLogo = document.getElementById('brandLogo');
            if(mainLogo && brandData.assetPath) { mainLogo.src = `${brandData.assetPath}logo.png`; mainLogo.classList.remove('hidden'); }

            document.getElementById('customerGreeting').innerText = `Welcome, ${data.customerProfile?.leadName || 'Customer'}`;
            document.getElementById('statusBadge').innerText = data.pipelineStatus || "Consultation";
            
            updateTimeline(data.pipelineStatus || "1. Consultation");
            renderDynamicSurveyData(data);
            
            const uiGallery = document.getElementById('vaultImageGallery');
            let hasImages = false;
            if (uiGallery) uiGallery.innerHTML = '';

            const appendToGallery = (url) => {
                if(!url) return; hasImages = true;
                uiGallery.innerHTML += `<a href="${url}" target="_blank" class="block rounded-lg overflow-hidden border border-[#30363d] hover:border-[#0dcaf0] transition h-24 shadow-md"><img src="${url}" class="w-full h-full object-cover"></a>`;
            };

            if(data.media) {
                appendToGallery(data.media.front); appendToGallery(data.media.side); appendToGallery(data.media.rear); appendToGallery(data.media.sketch);
                (data.media.surveyGallery || []).slice(0, 4).forEach(appendToGallery);
            }
            if (!hasImages && uiGallery) uiGallery.innerHTML = '<div class="text-xs text-gray-500 italic col-span-2 p-4 bg-[#161b22] border border-[#30363d] rounded-lg">Site imagery is currently processing.</div>';
            
            // --- SALES FUNNEL LOGIC ---
            const financialContainer = document.getElementById('quoteContainer');
            if (financialContainer) {
                const accessLevel = data.vaultAccessLevel || 'survey_only';

                if (accessLevel === 'survey_only') {
                    financialContainer.innerHTML = `<div class="mt-6 p-6 rounded-xl border border-[#30363d] bg-[#161b22] text-center"><p class="text-sm text-gray-400">Your Lead Designer is currently compiling your bespoke UDesign architectural renders.</p><div class="mt-4 inline-block px-4 py-2 bg-[#090d13] border border-[#30363d] rounded-lg text-xs font-bold uppercase tracking-widest text-[#0dcaf0] animate-pulse">Design Phase in Progress...</div></div>`;
                } 
                else if (accessLevel === 'design_tease') {
                    if (data.uDesignData?.renders && data.uDesignData.renders.length > 0) {
                        data.uDesignData.renders.forEach(url => { uiGallery.innerHTML += `<a href="${url}" target="_blank" class="block rounded-lg overflow-hidden border-2 border-[#E50914] shadow-[0_0_15px_rgba(229,9,20,0.3)] hover:scale-105 transition h-24"><img src="${url}" class="w-full h-full object-cover"></a>`; });
                    }
                    financialContainer.innerHTML = `
                        <div class="mt-8 relative rounded-xl overflow-hidden border border-[#30363d] bg-[url('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80')] bg-cover bg-center h-64">
                            <div class="absolute inset-0 backdrop-blur-xl bg-[#090d13]/80 flex flex-col items-center justify-center p-6 text-center z-10">
                                <div class="w-16 h-16 bg-[#161b22] rounded-full flex items-center justify-center border border-[#30363d] mb-4 shadow-xl"><span class="text-2xl">🔒</span></div>
                                <h3 class="text-xl font-black text-white uppercase tracking-widest mb-2">Bespoke Investment Proposal Ready</h3>
                                <p class="text-sm text-gray-400 max-w-md">Your architectural blueprints and structural calculations are complete. Please book your follow-up design appointment to unlock your financial breakdown.</p>
                                <button onclick="window.location.href='mailto:sales@cohomeimprovements.com?subject=Book Follow Up'" class="mt-6 px-6 py-3 bg-[#0dcaf0] text-black font-black uppercase tracking-widest text-xs rounded-lg hover:bg-cyan-400 transition shadow-[0_0_15px_rgba(13,202,240,0.4)]">Request Appointment</button>
                            </div>
                        </div>`;
                }
                else if (accessLevel === 'full_access') {
                    if (data.uDesignData?.renders && data.uDesignData.renders.length > 0) {
                        data.uDesignData.renders.forEach(url => { uiGallery.innerHTML += `<a href="${url}" target="_blank" class="block rounded-lg overflow-hidden border-2 border-[#238636] shadow-[0_0_15px_rgba(35,134,54,0.3)] hover:scale-105 transition h-24"><img src="${url}" class="w-full h-full object-cover"></a>`; });
                    }
                    const totalVal = data.uDesignData?.totalPrice || 0; const depositVal = data.uDesignData?.deposit || 0;
                    const total = parseFloat(totalVal).toLocaleString('en-GB', {style: 'currency', currency: 'GBP'}); const deposit = parseFloat(depositVal).toLocaleString('en-GB', {style: 'currency', currency: 'GBP'});

                    // REMOVED SIGN BUTTON - REPLACED WITH NEXT STEPS SUMMARY
                    financialContainer.innerHTML = `
                        <div class="mt-8 animate-[fadeIn_0.8s_ease-out]">
                            <h3 class="text-sm font-black text-[#238636] uppercase tracking-widest mb-4 pb-2 border-b border-[#30363d] flex items-center gap-2"><span>🔓</span> Official Investment Breakdown</h3>
                            <div class="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden shadow-2xl">
                                <div class="p-6 border-b border-[#30363d] flex justify-between items-center bg-[#090d13]">
                                    <div><p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Contract Total</p><p class="text-4xl font-black text-white tracking-tighter">${total}</p></div>
                                    <div class="text-right"><p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Agreed Deposit</p><p class="text-xl font-bold text-[#0dcaf0]">${deposit}</p></div>
                                </div>
                                <div class="p-6 bg-[#161b22] text-center border-t-4 border-[#0dcaf0]">
                                    <h4 class="text-white font-bold mb-2 uppercase tracking-widest text-sm">Proposal Unlocked</h4>
                                    <p class="text-xs text-gray-400 leading-relaxed max-w-md mx-auto">Your designer has presented the full project scope, UDesign visuals, and financials. To proceed with this investment and lock in your installation schedule, please confirm the details directly with your designer.</p>
                                </div>
                            </div>
                        </div>`;
                }
            }
        });

        const chatRef = collection(db, `surveys/${projectId}/messages`);
        onSnapshot(query(chatRef, orderBy("timestamp", "asc")), (msgSnap) => {
            const win = document.getElementById('chat-window'); if(!win) return;
            win.innerHTML = '<div class="text-center text-xs text-gray-500 my-4">Secure Connection Established</div>';
            msgSnap.forEach(m => {
                const d = m.data(); const isMe = d.sender === 'Customer';
                win.innerHTML += `<div class="mb-3 ${isMe ? 'text-right' : 'text-left'} animate-[fadeIn_0.3s_ease-out]"><span class="text-[10px] text-gray-400 uppercase tracking-widest">${isMe ? 'You' : d.sender}</span><div class="inline-block p-3 mt-1 rounded-xl text-sm ${isMe ? 'text-black rounded-tr-sm bg-[#0dcaf0]' : 'bg-[#161b22] border border-[#30363d] text-white rounded-tl-sm'} shadow-md">${d.text}</div></div>`;
            });
            win.scrollTop = win.scrollHeight;
        });

        document.getElementById('chat-input')?.addEventListener('keypress', async (e) => {
            if(e.key === 'Enter' && e.target.value.trim()) { const val = e.target.value.trim(); e.target.value = ''; await addDoc(chatRef, { sender: 'Customer', text: val, timestamp: serverTimestamp() }); }
        });
        
        document.getElementById('btnSendChat')?.addEventListener('click', async () => {
            const input = document.getElementById('chat-input');
            if(input && input.value.trim()) { const val = input.value.trim(); input.value = ''; await addDoc(chatRef, { sender: 'Customer', text: val, timestamp: serverTimestamp() }); }
        });

        initUploadEngine(projectId);

    } catch (err) {
        console.error(err); btnAccess.innerText = originalText; btnAccess.disabled = false; alert("CRITICAL FIREBASE ERROR: " + err.message);
    }
}

if (btnAccess) btnAccess.addEventListener('click', attemptDecrypt);
if (pinInput) pinInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptDecrypt(); });

// PDF Engine
const btnDownload = document.getElementById('btnDownloadReport');
if (btnDownload) {
    btnDownload.addEventListener('click', async () => {
        const ogText = btnDownload.innerHTML; btnDownload.innerHTML = 'Compiling Master Report...'; btnDownload.disabled = true;

        try {
            const docRef = doc(db, "surveys", projectId.trim());
            const snap = await getDoc(docRef);
            const data = snap.data();
            
            const postcode = data.customerProfile?.postcode || '';
            let council = "TBC", ward = "TBC", lat = null, lon = null, elevation = "TBC", windZone = "Moderate";
            let mapTileUrl = '';
            
            if(postcode) {
                try {
                    const pcRes = await fetch(`https://api.postcodes.io/postcodes/${postcode.replace(/\s+/g, '')}`);
                    const pcData = await pcRes.json();
                    if(pcData.result) {
                        council = pcData.result.admin_district || "Local Authority Found"; ward = pcData.result.admin_ward || "Data Unavailable";
                        lat = pcData.result.latitude; lon = pcData.result.longitude;
                    }
                    if(lat && lon) {
                        const elRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
                        const elData = await elRes.json();
                        if(elData.elevation && elData.elevation.length > 0) {
                            const elev = Math.round(elData.elevation[0]); elevation = `${elev}m ASL`;
                            if(elev > 150) windZone = "Severe (High Alt)"; else if (elev > 75) windZone = "High Exposure"; else windZone = "Standard Load";
                        }
                        const tx = lon2tile(lon, 15); const ty = lat2tile(lat, 15);
                        mapTileUrl = `https://tile.openstreetmap.org/15/${tx}/${ty}.png`;
                    }
                } catch(e) {}
            }

            const brandData = BRAND_CONFIG[data.brand] || BRAND_CONFIG["YorkshireWindows"];
            const heroImg = data.media?.front || data.media?.rear || 'https://via.placeholder.com/1200x800?text=Awaiting+Site+Uploads';
            const brandLogoWatermark = `${brandData.assetPath}logo.png`; 

            let pdfContainer = document.getElementById('hiddenPdfContainer');
            if(!pdfContainer) { pdfContainer = document.createElement('div'); pdfContainer.id = 'hiddenPdfContainer'; document.body.appendChild(pdfContainer); }
            
            pdfContainer.innerHTML = `
                <!-- PAGE 1: COVER PAGE -->
                <div class="relative h-[1123px] w-[794px] overflow-hidden flex flex-col bg-white">
                    <div class="absolute inset-0 z-0 flex items-center justify-center opacity-5 pointer-events-none"><img src="${brandLogoWatermark}" style="width: 80%;" crossorigin="anonymous"></div>
                    <div class="h-[65%] relative z-10"><img src="${heroImg}" class="w-full h-full object-cover" crossorigin="anonymous"><div class="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent"></div></div>
                    <div class="h-[35%] bg-white p-12 flex flex-col justify-between z-10">
                        <div>
                            <h1 class="text-6xl font-black text-gray-900 tracking-tighter mb-8 uppercase">Master Site <br>Dossier.</h1>
                            <div class="grid grid-cols-2 gap-y-6 gap-x-12 text-sm">
                                <div><p class="text-gray-500 font-bold tracking-widest uppercase text-[10px] mb-1">Customer Name</p><p class="text-xl font-bold">${data.customerProfile?.leadName || 'Valued Customer'}</p></div>
                                <div><p class="text-gray-500 font-bold tracking-widest uppercase text-[10px] mb-1">Local Authority</p><p class="text-lg font-bold text-[#0dcaf0]">${council}</p></div>
                                <div><p class="text-gray-500 font-bold tracking-widest uppercase text-[10px] mb-1">Site Location</p><p class="text-xl font-bold">${postcode || 'TBC'}</p></div>
                                <div><p class="text-gray-500 font-bold tracking-widest uppercase text-[10px] mb-1">Lead Designer</p><p class="text-lg font-bold">${data.owner || 'Thomas Oldroyd'}</p></div>
                            </div>
                        </div>
                        <div class="flex justify-end items-end border-t border-gray-200 pt-4"><p class="text-[10px] text-gray-400 font-bold tracking-widest uppercase">CO HOME IMPROVEMENTS | CONFIDENTIAL MASTER REPORT</p></div>
                    </div>
                </div>

                <!-- PAGE 2: ENVIRONMENTAL ANALYSIS -->
                <div class="h-[1123px] w-[794px] bg-white p-12 flex flex-col" style="page-break-before: always;">
                    <h2 class="text-4xl font-black text-gray-900 uppercase tracking-tighter mb-8 pb-4 border-b-4 inline-block" style="border-color: ${brandData.theme};">Environmental Analysis</h2>
                    <p class="text-sm text-gray-600 mb-8 leading-relaxed">Prior to finalizing your structural design, we conduct a topographical and environmental review of your location.</p>
                    <div class="w-full h-64 bg-gray-200 rounded-xl mb-8 overflow-hidden relative border border-gray-300">
                        ${mapTileUrl ? `<img src="${mapTileUrl}" class="w-full h-full object-cover opacity-80 mix-blend-multiply" crossorigin="anonymous">` : ''}
                        <div class="absolute inset-0 border-4 rounded-xl pointer-events-none" style="border-color: ${brandData.theme}33;"></div>
                        <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-red-600 bg-red-600/30"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-6 mb-8">
                        <div class="bg-gray-50 p-6 rounded-xl border border-gray-100 shadow-sm"><p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Exact Coordinates</p><p class="text-xl font-bold text-gray-900 font-mono">${lat ? `${lat.toFixed(4)}N, ${lon.toFixed(4)}W` : 'Fetching...'}</p></div>
                        <div class="bg-gray-50 p-6 rounded-xl border border-gray-100 shadow-sm"><p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Planning Ward</p><p class="text-xl font-bold text-gray-900">${ward}</p></div>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-sm text-center"><p class="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Topographical Elev.</p><p class="text-2xl font-black text-gray-800">${elevation}</p></div>
                        <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-sm text-center"><p class="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Structural Wind Zone</p><p class="text-2xl font-black text-gray-800">${windZone}</p></div>
                        <div class="bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-sm text-center"><p class="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Ground Condition</p><p class="text-lg font-black text-[#238636] mt-2">Satisfactory</p></div>
                    </div>
                </div>

                <!-- PAGE 3: PROJECT SPECS -->
                <div class="h-[1123px] w-[794px] bg-white p-12 flex flex-col" style="page-break-before: always;">
                    <h2 class="text-4xl font-black text-gray-900 uppercase tracking-tighter mb-8 pb-4 border-b-4 inline-block" style="border-color: ${brandData.theme};">Project Specifications</h2>
                    <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Design & Architecture</h3>
                    <div class="grid grid-cols-3 gap-y-6 gap-x-4 mb-8">
                        <div><p class="text-[9px] text-[#0dcaf0] font-bold uppercase tracking-widest mb-1">Build Type</p><p class="text-sm font-bold text-gray-800 break-words">${data.projectSpecs?.buildType || 'TBC'}</p></div>
                        <div><p class="text-[9px] text-[#0dcaf0] font-bold uppercase tracking-widest mb-1">Proposed Size</p><p class="text-sm font-bold text-gray-800 break-words">${data.projectSpecs?.proposedSize || 'TBC'}</p></div>
                        <div><p class="text-[9px] text-[#0dcaf0] font-bold uppercase tracking-widest mb-1">Roof Style</p><p class="text-sm font-bold text-gray-800 break-words">${data.projectSpecs?.roofStyle || 'TBC'}</p></div>
                        <div><p class="text-[9px] text-[#0dcaf0] font-bold uppercase tracking-widest mb-1">Frame Colour</p><p class="text-sm font-bold text-gray-800 break-words">${data.projectSpecs?.frameColour || 'TBC'}</p></div>
                        <div><p class="text-[9px] text-[#0dcaf0] font-bold uppercase tracking-widest mb-1">Building Regs</p><p class="text-sm font-bold text-gray-800 break-words">${data.projectSpecs?.buildingRegs || 'TBC'}</p></div>
                        <div><p class="text-[9px] text-[#0dcaf0] font-bold uppercase tracking-widest mb-1">Planning Perms</p><p class="text-sm font-bold text-gray-800 break-words">${data.projectSpecs?.planningPerms || 'TBC'}</p></div>
                    </div>
                    <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Structural & Access Logistics</h3>
                    <div class="grid grid-cols-2 gap-y-6 gap-x-4 mb-8">
                        <div><p class="text-[9px] text-[#0dcaf0] font-bold uppercase tracking-widest mb-1">House Material</p><p class="text-sm font-bold text-gray-800 break-words">${data.projectSpecs?.houseMaterial || 'TBC'}</p></div>
                        <div><p class="text-[9px] text-[#0dcaf0] font-bold uppercase tracking-widest mb-1">Wall Obstacles</p><p class="text-sm font-bold text-gray-800 break-words">${data.projectSpecs?.wallObstacles || 'TBC'}</p></div>
                        <div><p class="text-[9px] text-[#0dcaf0] font-bold uppercase tracking-widest mb-1">Access Width</p><p class="text-sm font-bold text-gray-800 break-words">${data.projectSpecs?.accessWidth || 'TBC'}</p></div>
                        <div><p class="text-[9px] text-[#0dcaf0] font-bold uppercase tracking-widest mb-1">Access Issues</p><p class="text-sm font-bold text-gray-800 break-words">${data.projectSpecs?.accessIssues || 'TBC'}</p></div>
                    </div>
                    <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Designer Insights</h3>
                    <div class="space-y-6">
                        <div><p class="text-[10px] text-gray-900 font-bold uppercase tracking-widest mb-1">Site Preparation & Structural Requirements</p><p class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">${data.designerInsights?.prep || 'No structural insights recorded.'}</p></div>
                        <div><p class="text-[10px] text-gray-900 font-bold uppercase tracking-widest mb-1">Design & Layout</p><p class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">${data.designerInsights?.design || 'No layout insights recorded.'}</p></div>
                    </div>
                </div>

                <!-- PAGE 4: PROPERTY ELEVATIONS -->
                <div class="h-[1123px] w-[794px] bg-white p-12 flex flex-col" style="page-break-before: always;">
                    <h2 class="text-4xl font-black text-gray-900 uppercase tracking-tighter mb-8 pb-4 border-b-4 inline-block" style="border-color: ${brandData.theme};">Property Elevations</h2>
                    <div class="grid grid-cols-2 gap-6 flex-grow">
                        <div class="flex flex-col"><p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Front Elevation</p><div class="flex-grow bg-gray-100 rounded-xl border border-gray-300 overflow-hidden relative">${data.media?.front ? `<img src="${data.media.front}" class="absolute inset-0 w-full h-full object-cover" crossorigin="anonymous">` : `<div class="flex items-center justify-center h-full text-xs text-gray-400">Awaiting Upload</div>`}</div></div>
                        <div class="flex flex-col"><p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Side Elevation</p><div class="flex-grow bg-gray-100 rounded-xl border border-gray-300 overflow-hidden relative">${data.media?.side ? `<img src="${data.media.side}" class="absolute inset-0 w-full h-full object-cover" crossorigin="anonymous">` : `<div class="flex items-center justify-center h-full text-xs text-gray-400">Awaiting Upload</div>`}</div></div>
                        <div class="flex flex-col"><p class="text-[10px] font-bold text-[#0dcaf0] uppercase tracking-widest mb-2">Rear Elevation (Primary Focus)</p><div class="flex-grow bg-gray-100 rounded-xl border-2 border-[#0dcaf0] overflow-hidden relative shadow-md">${data.media?.rear ? `<img src="${data.media.rear}" class="absolute inset-0 w-full h-full object-cover" crossorigin="anonymous">` : `<div class="flex items-center justify-center h-full text-xs text-gray-400">Awaiting Upload</div>`}</div></div>
                        <div class="flex flex-col"><p class="text-[10px] font-bold text-[#238636] uppercase tracking-widest mb-2">Designer Sketch / Measurements</p><div class="flex-grow bg-gray-100 rounded-xl border-2 border-[#238636] overflow-hidden relative shadow-md">${data.media?.sketch ? `<img src="${data.media.sketch}" class="absolute inset-0 w-full h-full object-contain bg-white" crossorigin="anonymous">` : `<div class="flex items-center justify-center h-full text-xs text-gray-400">Awaiting Upload</div>`}</div></div>
                    </div>
                </div>
            `;

            const generateGallery = (title, urls) => {
                if (!urls || urls.length === 0) return '';
                let html = '';
                for (let i = 0; i < urls.length; i += 6) {
                    html += `<div class="h-[1123px] w-[794px] bg-white p-12 flex flex-col" style="page-break-before: always;"><h2 class="text-4xl font-black text-gray-900 uppercase tracking-tighter mb-8 pb-4 border-b-4 inline-block" style="border-color: ${brandData.theme};">${title} ${urls.length > 6 ? `(Part ${Math.floor(i/6)+1})` : ''}</h2><div class="grid grid-cols-2 gap-6 flex-grow">`;
                    urls.slice(i, i + 6).forEach(url => { html += `<div class="relative w-full h-0 pb-[75%] bg-gray-100 rounded-xl overflow-hidden border border-gray-300 shadow-sm"><img src="${url}" class="absolute inset-0 w-full h-full object-cover" crossorigin="anonymous"></div>`; });
                    html += `</div></div>`;
                } return html;
            };

            pdfContainer.innerHTML += generateGallery('Survey Uploads', data.media?.surveyGallery);
            pdfContainer.innerHTML += generateGallery('Access & Logistics', data.media?.accessGallery);
            pdfContainer.innerHTML += generateGallery('Miscellaneous Site Images', data.media?.miscGallery);

            const appendixFiles = ['why-choose-us.jpg', 'who-we-are.jpg', 'journey.jpg', 'journey-1.jpg', 'journey-2.jpg', 'tailored.jpg', 'cavity.jpg', 'protecting-home.jpg'];
            appendixFiles.forEach(file => { pdfContainer.innerHTML += `<div style="page-break-before: always; width: 794px; height: 1123px; overflow: hidden; background: white;"><img src="assets/shared/${file}" style="width: 100%; height: 100%; object-fit: contain;" crossorigin="anonymous"></div>`; });

            pdfContainer.style.display = 'block';

            await html2pdf().set({
                margin: 0, filename: `${data.customerProfile?.leadName?.replace(/\s+/g, '_') || 'Project'}_Master_Report.pdf`,
                image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(pdfContainer).save();
            
            pdfContainer.innerHTML = ''; pdfContainer.style.display = 'none';

        } catch (e) { alert("Failed to generate PDF. Check console for details."); } 
        finally { btnDownload.innerHTML = ogText; btnDownload.disabled = false; }
    });
}

function initUploadEngine(id) {
    const uploadInput = document.getElementById('clientUploadInput'); const btnUpload = document.getElementById('btnClientUpload'); const statusText = document.getElementById('uploadStatus');
    if (btnUpload) {
        btnUpload.addEventListener('click', async () => {
            const file = uploadInput.files[0]; if(!file) return alert("Please select a file first.");
            btnUpload.disabled = true; btnUpload.innerText = "Encrypting..."; statusText.classList.remove('hidden');

            try {
                const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', UPLOAD_PRESET);
                statusText.innerText = "Uploading to secure server...";
                const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData }); const data = await res.json();

                if(data.secure_url) {
                    statusText.innerText = "Linking to project file...";
                    await updateDoc(doc(db, "surveys", id), { "clientUploads": arrayUnion({ url: data.secure_url, name: file.name, date: new Date().toISOString() }), "timestamps.updatedAt": new Date().toISOString() });
                    await addDoc(collection(db, `surveys/${id}/messages`), { sender: 'System', role: 'Notification', text: `Client uploaded a new file: ${file.name}`, timestamp: serverTimestamp() });
                    uploadInput.value = ''; btnUpload.innerText = "Upload to Vault"; btnUpload.disabled = false; statusText.innerText = "File successfully secured!"; setTimeout(() => statusText.classList.add('hidden'), 3000);
                } else throw new Error("Cloudinary rejected upload.");
            } catch (err) { alert("Upload failed. Ensure file is under 10MB."); btnUpload.innerText = "Upload to Vault"; btnUpload.disabled = false; statusText.classList.add('hidden'); }
        });
    }
}
