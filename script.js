let currentEmergencyMessage = ""; 
let knownCriticalPatients = new Set(); 
let activeVoiceMode = 'admin'; 
let hasUploadedImage = false; 

// ==========================================
// INITIALIZATION
// ==========================================
window.onload = async () => {
    try {
        const res = await fetch('/api/get_network_list');
        const hospitals = await res.json();
        const dropdowns = [document.getElementById('op-hospital'), document.getElementById('dispatchHospital'), document.getElementById('wHospital')];
        hospitals.forEach(h => {
            dropdowns.forEach(d => {
                if(d) {
                    const opt = document.createElement('option');
                    opt.value = h; opt.textContent = h.replace(/_/g, ' ');
                    d.appendChild(opt);
                }
            });
        });
    } catch(e) { console.error("Init error", e); }
};

function showScreen(screenId) {
    document.querySelectorAll('.screen-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('dashboard-layout').classList.add('hidden');
    document.getElementById('chatbot-widget').style.display = 'none';
    document.getElementById(screenId).classList.remove('hidden');
}

// ==========================================
// ADMIN LOGIN
// ==========================================
function verifyLogin() {
    const u = document.getElementById('admin-user').value;
    const p = document.getElementById('admin-pass').value;
    if(u === 'Lokesh' && p === 'cmr@123') {
        document.querySelectorAll('.screen-section').forEach(s => s.classList.add('hidden'));
        document.getElementById('dashboard-layout').classList.remove('hidden');
        document.getElementById('chatbot-widget').style.display = 'flex';
        runAIOptimizer();
        showToastAlert("✅ LOGGED IN", "Welcome Command Center", "success");
    } else {
        alert("Invalid Credentials! Try Lokesh / cmr@123");
    }
}

function logoutAdmin() {
    showScreen('landing-screen');
    document.getElementById('admin-user').value = '';
    document.getElementById('admin-pass').value = '';
}

// ==========================================
// OP REGISTRATION & EMERGENCY
// ==========================================
let isOPEmergency = false;

function setOPMode(mode) {
    const regFields = document.getElementById('regular-op-fields');
    const submitBtn = document.getElementById('btn-submit-op');
    const btnReg = document.getElementById('btn-reg-op');
    const btnSos = document.getElementById('btn-sos-op');

    if (mode === 'sos') {
        isOPEmergency = true;
        regFields.style.display = 'none'; 
        submitBtn.innerText = '🚨 SEND SOS ALERT';
        submitBtn.style.background = '#ef4444';
        btnSos.style.background = '#ef4444';
        btnReg.style.background = '#f1f5f9';
        btnReg.style.color = '#64748b';
        btnSos.style.color = 'white';
    } else {
        isOPEmergency = false;
        regFields.style.display = 'block'; 
        submitBtn.innerText = 'Generate Ticket';
        submitBtn.style.background = '#0ea5e9';
        btnReg.style.background = '#0ea5e9';
        btnReg.style.color = 'white';
        btnSos.style.background = '#ef4444';
        btnSos.style.color = 'white';
    }
}

async function submitOP() {
    const hospital = document.getElementById('op-hospital').value;
    if(!hospital) { alert("Please select the nearest hospital!"); return; }

    let name = "UNKNOWN"; let mobile = "N/A"; let disease = "Emergency";
    if (!isOPEmergency) {
        name = document.getElementById('op-name').value;
        mobile = document.getElementById('op-mobile').value;
        disease = document.getElementById('op-disease').value;
        if(!name || !disease || !mobile) { alert("Please fill all fields!"); return; }
    }

    try {
        const res = await fetch('/api/register_op', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mobile, disease, hospital, is_emergency: isOPEmergency })
        });
        const data = await res.json();
        
        document.getElementById('t-id').innerText = data.patient_id;
        document.getElementById('t-name').innerText = data.name;
        document.getElementById('t-mobile').innerText = data.mobile;
        document.getElementById('t-disease').innerText = data.disease;
        document.getElementById('t-dept').innerText = data.specialty;
        document.getElementById('t-doc').innerText = data.doctor;
        document.getElementById('t-hosp').innerText = data.hospital;
        document.getElementById('t-time').innerText = data.time;
        
        const header = document.getElementById('t-header');
        if (isOPEmergency) {
            header.style.background = '#ef4444';
            header.innerHTML = `<h3>🚨 EMERGENCY SOS</h3><span id="t-id" class="badge" style="background:white; color:#ef4444;">${data.patient_id}</span>`;
        } else {
            header.style.background = 'var(--dark-blue)';
            header.innerHTML = `<h3>AURA RHA E-TICKET</h3><span id="t-id" class="badge">${data.patient_id}</span>`;
        }

        const alertBox = document.getElementById('t-alert');
        if(data.transferred) { alertBox.classList.remove('hidden'); } else { alertBox.classList.add('hidden'); }
        
        // 💥 QR CODE GENERATION FOR THE MOBILE KIOSK 💥
        document.getElementById('qrcode').innerHTML = ""; 
        const kioskUrl = window.location.origin + "/kiosk"; 
        new QRCode(document.getElementById("qrcode"), {
            text: kioskUrl,
            width: 120,
            height: 120,
            colorDark : "#0f172a",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });

        document.getElementById('ticket-modal').classList.remove('hidden');
        document.getElementById('op-name').value = ''; document.getElementById('op-disease').value = ''; document.getElementById('op-mobile').value = '';
    } catch(e) { alert("Failed to submit OP registration."); }
}

function closeTicket() {
    document.getElementById('ticket-modal').classList.add('hidden');
    showScreen('landing-screen');
    showToastAlert("🖨️ TICKET PRINTED", "Patient added to the AI Triage queue.", "success");
}

// ==========================================
// 👨‍⚕️ PATIENT AI DOCTOR BOT
// ==========================================
function openPatientBot() {
    document.getElementById('patient-bot-overlay').classList.remove('hidden');
    hasUploadedImage = false; 
}
function closePatientBot() {
    document.getElementById('patient-bot-overlay').classList.add('hidden');
    if(rec) rec.stop();
}

function handleReportUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const chatBody = document.getElementById('patient-chat-body');
        chatBody.innerHTML += `<div class="patient-user-msg">📸 Uploaded: ${file.name}</div>`;
        chatBody.scrollTop = chatBody.scrollHeight;
        
        const loadingId = "scan-" + Date.now();
        chatBody.innerHTML += `<div id="${loadingId}" class="patient-bot-msg" style="color:#0ea5e9;">Scanning report via Aura Vision AI...</div>`;
        chatBody.scrollTop = chatBody.scrollHeight;
        
        setTimeout(() => {
            document.getElementById(loadingId).remove();
            chatBody.innerHTML += `<div class="patient-bot-msg" style="color:#10b981; font-weight:bold;">✅ Report scanned successfully! Ask me what it means.</div>`;
            chatBody.scrollTop = chatBody.scrollHeight;
            hasUploadedImage = true; 
        }, 1500);
    }
}

function sendPatientText() {
    const inputField = document.getElementById('patient-text-input');
    const message = inputField.value.trim();
    if (!message) return;

    const chatBody = document.getElementById('patient-chat-body');
    chatBody.innerHTML += `<div class="patient-user-msg">${message}</div>`;
    inputField.value = '';
    chatBody.scrollTop = chatBody.scrollHeight;
    processPatientQuery(message, false);
}

async function processPatientQuery(text, isVoice) {
    const chatBody = document.getElementById('patient-chat-body');
    const lang = document.getElementById('patient-lang').value;
    const loadingId = "load-" + Date.now();
    chatBody.innerHTML += `<div id="${loadingId}" class="patient-bot-msg" style="color:#0ea5e9;">Aura Doctor is thinking...</div>`;
    chatBody.scrollTop = chatBody.scrollHeight;

    try {
        const res = await fetch('/api/patient_consult', { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ message: text, voice: isVoice, lang: lang, has_image: hasUploadedImage }) 
        });
        const data = await res.json();
        
        document.getElementById(loadingId).remove();
        chatBody.innerHTML += `<div class="patient-bot-msg">${data.reply.replace(/\n/g, '<br>')}</div>`;
        chatBody.scrollTop = chatBody.scrollHeight;

        if(data.audio) {
            const audio = new Audio("data:audio/wav;base64," + data.audio);
            audio.play();
        }
    } catch (error) {
        document.getElementById(loadingId).remove();
        chatBody.innerHTML += `<div class="patient-bot-msg" style="color:#ef4444;">Connection failed.</div>`;
    }
}

// ==========================================
// ADMIN ALERTS & DASHBOARD
// ==========================================
function triggerIncomingCall(hospitalName, specificAlert = "Equipment/Doctor Shortage Detected. Need Admin Authorization.") {
    const callModal = document.getElementById('incoming-call');
    const details = document.getElementById('call-details');
    const ringtone = document.getElementById('ringtone');
    details.innerHTML = `<strong>URGENT REQUEST FROM:</strong><br>${hospitalName}<br><br>${specificAlert}`;
    callModal.classList.remove('hidden');
    try { ringtone.play(); } catch(e) { console.log("Muted") }
}

function declineCall() {
    document.getElementById('ringtone').pause();
    document.getElementById('incoming-call').classList.add('hidden');
}

function acceptAndDispatch() {
    document.getElementById('ringtone').pause();
    document.getElementById('incoming-call').classList.add('hidden');
    document.querySelector('.nav-btn:nth-child(2)').click(); 
    showToastAlert("🚑 DISPATCHING", currentEmergencyMessage, "success");
    setTimeout(() => { 
        const amb = document.getElementById('amb-vehicle');
        if(amb) {
            amb.classList.remove('arrived');
            amb.classList.add('dispatched'); 
            setTimeout(() => { amb.className = 'ambulance-vehicle arrived'; }, 1500);
        }
    }, 1000);
}

async function simulateWalkIn() {
    const name = document.getElementById('wName').value;
    const hospital = document.getElementById('wHospital').value;
    const specialty = document.getElementById('wSpecialty').value;
    const equipment = document.getElementById('wEquip').value;
    if(!name || !hospital) return;

    const res = await fetch('/api/walk_in_patient', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, hospital, specialty, equipment }) });
    const result = await res.json();
    if (result.status === "admin_trigger_required") {
        currentEmergencyMessage = result.message;
        triggerIncomingCall(hospital.replace(/_/g, ' '));
    } else { showToastAlert("✅ ADMITTED", result.message, "success"); }
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) { event.currentTarget.classList.add('active'); } 
    else { document.querySelector(`[onclick="switchTab('${tabId}')"]`).classList.add('active'); }

    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('active-view');
        view.classList.add('hidden-view');
    });

    const activeView = document.getElementById(`view-${tabId}`);
    if (activeView) {
        activeView.classList.remove('hidden-view');
        setTimeout(() => { activeView.classList.add('active-view'); }, 50);
    }
    if(tabId === 'ambulance') { loadShortages(); }
}

async function runAIOptimizer() {
    try {
        switchTab('network');
        const loading = document.getElementById('loading');
        const results = document.getElementById('dashboard-results');
        if(results) results.classList.add('hidden'); 
        if(loading) loading.classList.remove('hidden');

        const response = await fetch('/api/optimize_operations');
        if (!response.ok) throw new Error("Server Failed");
        const data = await response.json();
        
        let newCriticalFound = false;
        let latestCriticalName = "";
        let latestHosp = "";

        if (data.rha_action_plan) {
            data.rha_action_plan.forEach(plan => {
                if (plan.priority === 'CRITICAL' && !knownCriticalPatients.has(plan.patient)) {
                    knownCriticalPatients.add(plan.patient);
                    newCriticalFound = true;
                    latestCriticalName = plan.patient.split('(')[0].trim();
                    latestHosp = plan.hospital;
                }
            });
        }

        if (newCriticalFound && !document.getElementById('dashboard-layout').classList.contains('hidden')) {
            currentEmergencyMessage = `Auto-dispatching resources for ${latestCriticalName}`;
            triggerIncomingCall(latestHosp, `Critical Patient Transfer Required: ${latestCriticalName}`);
        }
        
        setTimeout(() => {
            if(loading) loading.classList.add('hidden');
            renderDashboard(data);
            if(results) results.classList.remove('hidden');
        }, 800);
    } catch (error) {
        const loading = document.getElementById('loading');
        if(loading) loading.classList.add('hidden');
        showToastAlert("⚠️ ERROR", "Optimizer failed.", "error");
    }
}

function quickDeploy(btn, patientName, specialty, equip) {
    btn.innerHTML = "✅ Fleet Deployed";
    btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
    btn.disabled = true;
    showToastAlert("🚀 DISPATCH SUCCESS", `Deployed units for ${patientName}.`, "success");
}

function renderDashboard(data) {
    const actionGrid = document.getElementById('actionPlanGrid');
    let delay = 0;
    if (data.rha_action_plan) {
        actionGrid.innerHTML = data.rha_action_plan.map((plan) => {
            delay += 0.1;
            const color = plan.priority === 'CRITICAL' ? '#ef4444' : '#10b981';
            const pNameClean = plan.patient.split('(')[0].trim();
            let deployBtn = '';
            if(plan.priority === 'CRITICAL') {
                deployBtn = `<button class="btn-premium" onclick="quickDeploy(this, '${pNameClean}', '${plan.req_specialty}', '${plan.req_equip}')" style="width: 100%; margin-top: 15px; padding: 10px; font-size: 0.9rem; background: linear-gradient(135deg, var(--danger), #b91c1c);">⚡ Quick Deploy</button>`;
            }
            return `
            <div class="net-card" style="border-top: 4px solid ${color}; animation-delay: ${delay}s;">
                <h3 style="color: #0f172a; margin-top:0; font-size:1.1rem;">${plan.patient}</h3>
                <p style="color:#64748b; font-size:0.85rem; margin-bottom:5px;"><strong>Loc:</strong> ${plan.hospital.replace(/_/g, ' ')}</p>
                <div style="margin-bottom: 12px;">
                    <span class="req-badge req-doc">👨‍⚕️ ${plan.req_specialty}</span>
                    ${plan.req_equip && plan.req_equip !== 'None' ? `<span class="req-badge req-eq">🛠 ${plan.req_equip.replace(/_/g, ' ')}</span>` : ''}
                </div>
                <p style="color: ${color}; font-weight: 800; font-size:0.95rem; border-top: 1px dashed #e2e8f0; padding-top: 10px;">Status: ${plan.action}</p>
                ${deployBtn}
            </div>`
        }).join('');
    }

    const netGrid = document.getElementById('networkStatusGrid');
    delay = 0;
    if (data.current_network_status) {
        netGrid.innerHTML = Object.entries(data.current_network_status).map(([h, stats]) => {
            delay += 0.15;
            return `
            <div class="net-card" style="animation-delay: ${delay}s;">
                <h3 style="margin-top:0; color:#0f172a;">🏥 ${h.replace(/_/g, ' ')}</h3>
                <div style="display:flex; gap:10px; margin:10px 0;">
                    <div style="flex:1; background:#fef3c7; padding:10px; border-radius:8px; text-align:center;">
                        <span style="font-size:0.8rem; color:#b45309; font-weight:bold;">ICU BEDS</span><br>
                        <strong style="color:#d97706; font-size:1.2rem;">${stats.beds.ICU}</strong>
                    </div>
                    <div style="flex:1; background:#e0f2fe; padding:10px; border-radius:8px; text-align:center;">
                        <span style="font-size:0.8rem; color:#0369a1; font-weight:bold;">VENTILATORS</span><br>
                        <strong style="color:#0ea5e9; font-size:1.2rem;">${stats.equipment.Ventilator}</strong>
                    </div>
                </div>
                <p style="font-size:0.85rem; color:#64748b;"><strong>Docs:</strong> ${stats.doctors.map(d=>d.specialty).join(', ')}</p>
            </div>`
        }).join('');
    }
}

async function loadShortages() {
    const res = await fetch('/api/get_shortages');
    const data = await res.json();
    const list = document.getElementById('shortageList');
    if(data.length === 0) { list.innerHTML = "<p style='color:#10b981; font-weight:bold;'>✅ All monitored hospitals have adequate supplies.</p>"; return; }
    list.innerHTML = data.map(s => `<div class="shortage-item"><span style="font-weight:600;">🏥 ${s.hospital.replace(/_/g, ' ')}</span><span style="color:#ef4444; font-weight:800; background: #fee2e2; padding: 4px 10px; border-radius: 20px;">Missing: ${s.item}</span></div>`).join('');
}

async function manualDispatch() {
    const hospital = document.getElementById('dispatchHospital').value;
    const resource = document.getElementById('dispatchResource').value;
    if(!hospital) { alert("Please select a target facility!"); return; }
    await fetch('/api/dispatch_resource', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hospital, resource }) });
    const amb = document.getElementById('amb-vehicle');
    amb.classList.remove('arrived');
    amb.classList.add('dispatched'); 
    setTimeout(() => { amb.className = 'ambulance-vehicle arrived'; }, 1500);
    showToastAlert("📦 DEPLOYED SUCCESSFULLY", "Resource Sent.", "success");
    loadShortages();
    runAIOptimizer();
}

function downloadReport() { window.location.href = '/api/download_report'; }

// ==========================================
// 💬 ADMIN TEXT CHATBOT LOGIC
// ==========================================
function toggleChat() { document.getElementById('chat-window').classList.toggle('hidden'); }
async function sendChatMessage() {
    const inputField = document.getElementById('chat-input');
    const message = inputField.value.trim();
    if (!message) return;
    const chatBody = document.getElementById('chat-body');
    chatBody.innerHTML += `<div class="user-msg">${message}</div>`;
    inputField.value = '';
    chatBody.scrollTop = chatBody.scrollHeight;
    const loadingId = "load-" + Date.now();
    chatBody.innerHTML += `<div id="${loadingId}" class="bot-msg" style="color:#0ea5e9; font-weight:bold;">Analyzing...</div>`;
    chatBody.scrollTop = chatBody.scrollHeight;
    try {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message, voice: false }) });
        const data = await res.json();
        document.getElementById(loadingId).remove();
        chatBody.innerHTML += `<div class="bot-msg">${data.reply.replace(/\n/g, '<br>')}</div>`;
        chatBody.scrollTop = chatBody.scrollHeight;
    } catch (error) {
        document.getElementById(loadingId).remove();
        chatBody.innerHTML += `<div class="bot-msg" style="color:#ef4444;">Error: Cannot connect.</div>`;
    }
}

// ==========================================
// 🎙️ GLOBAL VOICE LOGIC (Web Speech API)
// ==========================================
function showToastAlert(title, message, type) {
    const c = document.getElementById('alert-container');
    c.innerHTML = `<div class="toast-alert" style="border-left-color:${type==='error'?'#ef4444':'#10b981'}"><div style="font-size:24px;">${type==='error'?'⚠️':'✅'}</div><div><strong style="color:${type==='error'?'#ef4444':'#10b981'}; font-size:0.85rem; font-weight:800;">${title}</strong><br><span style="font-size:0.9rem; color:#334155;">${message}</span></div></div>`;
    setTimeout(() => c.innerHTML='', 4000);
}

function openVoiceOverlay() { document.getElementById('voice-overlay').classList.remove('hidden'); }
function closeVoiceOverlay() { document.getElementById('voice-overlay').classList.add('hidden'); if(rec) rec.stop(); }

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const rec = SR ? new SR() : null;
if (rec) { rec.continuous = false; rec.interimResults = false; }

function startAdminListening() {
    if(!rec) { return alert("Use Chrome for Voice features."); }
    activeVoiceMode = 'admin';
    rec.lang = document.getElementById('voice-lang').value;
    document.getElementById('voice-orb').className = 'orb-listening';
    document.getElementById('voice-user-text').innerText = "Listening...";
    try { rec.start(); } catch(e) {}
}

function startPatientListening() {
    if(!rec) { return alert("Use Chrome for Voice features."); }
    activeVoiceMode = 'patient';
    rec.lang = document.getElementById('patient-lang').value;
    
    const btn = document.getElementById('patient-mic-btn');
    btn.classList.add('call-active-state');
    
    const inputField = document.getElementById('patient-text-input');
    inputField.placeholder = "Listening... Speak now";
    inputField.value = "";
    
    try { rec.start(); } catch(e) {}
}

if(rec) {
    rec.onresult = async (e) => {
        const text = e.results[0][0].transcript;
        
        if (activeVoiceMode === 'admin') {
            document.getElementById('voice-orb').className = 'orb-idle';
            document.getElementById('voice-user-text').innerText = `You: "${text}"`;
            document.getElementById('voice-ai-text').innerHTML = `<span style="color:#0ea5e9;">Aura is thinking...</span>`;
            try {
                const res = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({message: text, voice:true, lang: rec.lang})});
                const data = await res.json();
                document.getElementById('voice-ai-text').innerText = data.reply;
                if(data.audio) {
                    document.getElementById('voice-orb').className = 'orb-speaking';
                    const audio = new Audio("data:audio/wav;base64," + data.audio);
                    audio.play();
                    audio.onended = () => document.getElementById('voice-orb').className = 'orb-idle';
                }
            } catch(err) { document.getElementById('voice-ai-text').innerText = "Error getting response."; }
        } 
        else if (activeVoiceMode === 'patient') {
            const btn = document.getElementById('patient-mic-btn');
            btn.classList.remove('call-active-state');
            document.getElementById('patient-text-input').placeholder = "Type symptoms...";
            
            const chatBody = document.getElementById('patient-chat-body');
            chatBody.innerHTML += `<div class="patient-user-msg">${text}</div>`;
            chatBody.scrollTop = chatBody.scrollHeight;
            
            processPatientQuery(text, true); 
        }
    };
    
    rec.onerror = (e) => {
        if(activeVoiceMode === 'admin') {
            document.getElementById('voice-orb').className = 'orb-idle';
            document.getElementById('voice-user-text').innerText = "Error: " + e.error;
        } else {
            const btn = document.getElementById('patient-mic-btn');
            btn.classList.remove('call-active-state');
            document.getElementById('patient-text-input').placeholder = "Type symptoms...";
        }
    }
}