// Initialization
lucide.createIcons();
document.getElementById('today-date').innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

let state = {
    calories: parseInt(localStorage.getItem('calories')) || 0,
    protein: parseInt(localStorage.getItem('protein')) || 0,
    water: parseInt(localStorage.getItem('water')) || 0,
    goal: parseInt(localStorage.getItem('goal')) || 2800,
    bottleSize: parseInt(localStorage.getItem('bottleSize')) || 32,
    currentWeight: localStorage.getItem('last_weight') || "--"
};

// --- ADAFRUIT CLOUD ENGINE ---
async function sendToAdafruit(feed, val) {
    const u = localStorage.getItem('adafruit_user');
    const k = localStorage.getItem('adafruit_key');
    if(!u || !k) return;
    try {
        await fetch(`https://io.adafruit.com/api/v2/${u}/feeds/${feed}/data`, {
            method: 'POST',
            headers: { 'X-AIO-Key': k, 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: val })
        });
    } catch(e) { console.error("Cloud Sync Error:", e); }
}

async function fetchHistory(feed) {
    const u = localStorage.getItem('adafruit_user');
    const k = localStorage.getItem('adafruit_key');
    const res = await fetch(`https://io.adafruit.com/api/v2/${u}/feeds/${feed}/data?limit=50`, { 
        headers: {'X-AIO-Key': k}
    });
    return await res.json();
}

// --- CALENDAR LOGIC (The New Part) ---
async function loadHistory() {
    const container = document.getElementById('history-container');
    container.innerHTML = '<p class="text-emerald-500 text-center animate-pulse uppercase font-black text-xs">Accessing Cloud Feeds...</p>';
    
    try {
        const foodData = await fetchHistory('food-log');
        
        // Group data by Date
        const groups = {};
        foodData.forEach(item => {
            const date = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            if (!groups[date]) groups[date] = [];
            groups[date].push(item.value);
        });

        container.innerHTML = ""; // Clear loader

        // Generate the Calendar-style UI
        Object.keys(groups).forEach(date => {
            const dateSection = document.createElement('div');
            dateSection.className = "space-y-3";
            
            let itemsHtml = groups[date].map(food => `
                <div class="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span class="text-sm font-bold text-slate-200">${food}</span>
                    <span class="text-[10px] font-black text-emerald-500 uppercase">Logged</span>
                </div>
            `).join('');

            dateSection.innerHTML = `
                <div class="flex items-center gap-4 mb-2">
                    <div class="h-[1px] flex-1 bg-slate-800"></div>
                    <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">${date}</span>
                    <div class="h-[1px] flex-1 bg-slate-800"></div>
                </div>
                <div class="space-y-2">${itemsHtml}</div>
            `;
            container.appendChild(dateSection);
        });

    } catch (e) {
        container.innerHTML = '<p class="text-red-500 text-xs text-center">Failed to load history.</p>';
    }
}

// --- DASHBOARD UI LOGIC ---
function updateUI() {
    document.getElementById('current-cal').innerText = state.calories.toLocaleString();
    document.getElementById('protein-count').innerText = state.protein;
    document.getElementById('water-count').innerText = state.water;
    document.getElementById('goal-display').innerText = `/ ${state.goal} KCAL`;
    document.getElementById('bottle-size-label').innerText = `${state.bottleSize}oz bottles`;
    
    const ring = document.getElementById('calorie-ring');
    const pct = Math.min((state.calories / state.goal) * 100, 100);
    ring.style.strokeDashoffset = 565 - (565 * (pct / 100));

    localStorage.setItem('calories', state.calories);
    localStorage.setItem('protein', state.protein);
    localStorage.setItem('water', state.water);
}

function showPage(p) {
    document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
    document.getElementById(p + '-page').classList.add('active');
    document.getElementById('nav-dashboard').className = p === 'dashboard' ? 'p-3 rounded-full bg-emerald-500 text-slate-950' : 'p-3 rounded-full text-slate-400';
    document.getElementById('nav-progress').className = p === 'progress' ? 'p-3 rounded-full bg-emerald-500 text-slate-950' : 'p-3 rounded-full text-slate-400';
    
    if(p === 'progress') loadHistory();
}

// --- ALL BUTTON ACTIONS ---
function toggleSettings() { document.getElementById('settings-modal').classList.toggle('hidden'); }
function closeModals() { document.querySelectorAll('#log-choice-modal, #manual-entry-modal, #settings-modal').forEach(m => m.classList.add('hidden')); }
function openLogChoice() { document.getElementById('log-choice-modal').classList.remove('hidden'); }
function openManualEntry() { closeModals(); document.getElementById('manual-entry-modal').classList.remove('hidden'); }

function logWeight() {
    const w = prompt("Weight (lbs):", state.currentWeight);
    if (w) {
        state.currentWeight = w;
        localStorage.setItem('last_weight', w);
        sendToAdafruit('weight', w);
    }
}

function confirmWater() {
    if(confirm(`Log ${state.bottleSize}oz?`)) {
        state.water++; updateUI();
        sendToAdafruit('water', state.water);
        sendToAdafruit('food-log', `Water (${state.bottleSize}oz)`);
    }
}

function manualLog(type) {
    const cal = prompt("Calories:", type === 'shake' ? "1000" : "");
    const prt = prompt("Protein:", type === 'shake' ? "50" : "");
    if(cal) {
        state.calories += parseInt(cal); state.protein += parseInt(prt || 0);
        updateUI();
        sendToAdafruit('calories', state.calories);
        sendToAdafruit('protein', state.protein);
        sendToAdafruit('food-log', type === 'shake' ? "Mass Gainer Shake" : "Quick Log");
    }
}

function submitManualEntry() {
    const n = document.getElementById('food-name').value || "Manual Log";
    const c = document.getElementById('food-cal').value;
    const p = document.getElementById('food-prot').value;
    if(c) {
        state.calories += parseInt(c); state.protein += parseInt(p || 0);
        updateUI();
        sendToAdafruit('calories', state.calories);
        sendToAdafruit('protein', state.protein);
        sendToAdafruit('food-log', n);
    }
    closeModals();
}

async function analyzeImage(img) {
    const key = localStorage.getItem('gemini_api_key');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: "Identify food. Respond JSON ONLY: {'food': 'name', 'calories': 0, 'protein': 0}" }, { inline_data: { mime_type: "image/jpeg", data: img.split(',')[1] } }] }] })
        });
        const d = await res.json();
        const r = JSON.parse(d.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim());
        if(confirm(`Log ${r.food}?`)) {
            state.calories += r.calories; state.protein += r.protein;
            updateUI();
            sendToAdafruit('calories', state.calories);
            sendToAdafruit('protein', state.protein);
            sendToAdafruit('food-log', r.food);
        }
    } catch(e) { alert("AI Vision Error"); }
}

// --- SETUP & CAMERA ---
function saveOnboarding() {
    localStorage.setItem('adafruit_user', document.getElementById('setup-user').value.trim());
    localStorage.setItem('adafruit_key', document.getElementById('setup-key').value.trim());
    location.reload();
}

function saveSettings() {
    state.goal = parseInt(document.getElementById('set-goal').value) || state.goal;
    state.bottleSize = parseInt(document.getElementById('set-bottle').value) || state.bottleSize;
    updateUI(); toggleSettings();
}

window.addEventListener('load', () => {
    if(!localStorage.getItem('adafruit_user')) document.getElementById('onboarding-screen').classList.remove('hidden');
    updateUI();
});

let stream = null;
async function startCamera() {
    closeModals();
    document.getElementById('camera-viewport').classList.remove('hidden');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('video').srcObject = stream;
}
function stopCamera() { if(stream) stream.getTracks().forEach(t => t.stop()); document.getElementById('camera-viewport').classList.add('hidden'); }
function captureImage() {
    const can = document.getElementById('canvas');
    can.width = 500; can.height = 500;
    can.getContext('2d').drawImage(document.getElementById('video'), 0, 0, 500, 500);
    stopCamera();
    analyzeImage(can.toDataURL('image/jpeg', 0.8));
}