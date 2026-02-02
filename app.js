// Initialization
lucide.createIcons();
document.getElementById('today-date').innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

let state = {
    calories: parseInt(localStorage.getItem('calories')) || 0,
    protein: parseInt(localStorage.getItem('protein')) || 0,
    water: parseInt(localStorage.getItem('water')) || 0,
    goal: parseInt(localStorage.getItem('goal')) || 2800,
    bottleSize: parseInt(localStorage.getItem('bottleSize')) || 32,
    currentWeight: localStorage.getItem('last_weight') || "--",
	weightGoal: localStorage.getItem('weight_goal') || 150
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

// --- THE GROWTH ENGINE (Graph + Cards) ---
async function loadHistory() {
    const container = document.getElementById('history-container');
    container.innerHTML = '<p class="text-emerald-400 text-center animate-pulse uppercase font-black text-[10px] tracking-widest py-10">Syncing with Cloud...</p>';
    
    try {
        // 1. Fetch all data feeds
        const foodData = await fetchHistory('food-log');
        const calData = await fetchHistory('calories');
        const protData = await fetchHistory('protein');
        const waterData = await fetchHistory('water');
        const weightData = await fetchHistory('weight');
        
        // 2. Prepare the Line Graph
        const graphLabels = [];
        const graphPoints = [];
        const goalPoints = []; // New array for the target line

        // Reverse weightData to show oldest to newest
        [...weightData].reverse().forEach(entry => {
            graphLabels.push(new Date(entry.created_at).toLocaleDateString('en-US', {month:'numeric', day:'numeric'}));
            graphPoints.push(parseFloat(entry.value));
            goalPoints.push(parseFloat(state.weightGoal)); // Every point gets the goal value
        });

        const ctx = document.getElementById('weightChart').getContext('2d');
        if(window.myChart) window.myChart.destroy(); 
        
        window.myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: graphLabels,
                datasets: [
                    {
                        // YOUR ACTUAL WEIGHT
                        label: 'Weight',
                        data: graphPoints,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4
                    },
                    {
                        // YOUR GOAL LINE
                        label: 'Goal',
                        data: goalPoints,
                        borderColor: 'rgba(255, 255, 255, 0.3)', // Subtle white/grey
                        borderWidth: 2,
                        borderDash: [5, 5], // Makes it a dashed line
                        pointRadius: 0,     // Hides the dots on the goal line
                        fill: false,
                        tension: 0          // Keeps it perfectly straight
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#64748b', font: { size: 10 } }
                    },
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: '#64748b', font: { size: 10 } } 
                    }
                }
            }
        });

        // 3. Grouping Logic for the Robinhood Cards
        const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const days = {};

        foodData.forEach(item => {
            const d = formatDate(item.created_at);
            if (!days[d]) days[d] = { food: [], cals: 0, prot: 0, water: 0, weight: "--" };
            days[d].food.push(item.value);
        });

        calData.forEach(item => { const d = formatDate(item.created_at); if(days[d]) days[d].cals = Math.max(days[d].cals, parseInt(item.value)); });
        protData.forEach(item => { const d = formatDate(item.created_at); if(days[d]) days[d].prot = Math.max(days[d].prot, parseInt(item.value)); });
        waterData.forEach(item => { const d = formatDate(item.created_at); if(days[d]) days[d].water = Math.max(days[d].water, parseInt(item.value)); });
        weightData.forEach(item => { const d = formatDate(item.created_at); if(days[d]) days[d].weight = item.value; });

        // 4. Render the Cards
        container.innerHTML = ""; 
        Object.keys(days).forEach(date => {
            const day = days[date];
            const dayCard = document.createElement('div');
            dayCard.className = "glass rounded-[2rem] overflow-hidden border border-white/5 mb-6";
            dayCard.innerHTML = `
                <div class="p-6 bg-white/5 border-b border-white/5 flex justify-between items-center">
                    <div>
                        <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest">${date}</p>
                        <h3 class="text-xl font-black text-white italic">${day.cals} <span class="text-xs text-emerald-500">KCAL</span></h3>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-black text-slate-500 uppercase">Weight</p>
                        <p class="text-sm font-black text-emerald-400">${day.weight} lbs</p>
                    </div>
                </div>
                <div class="p-4 space-y-3">
                    <div class="flex gap-2">
                        <div class="bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20"><span class="text-[10px] font-bold text-orange-400 uppercase">${day.prot}g Protein</span></div>
                        <div class="bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20"><span class="text-[10px] font-bold text-blue-400 uppercase">${day.water} Bottles</span></div>
                    </div>
                    <div class="space-y-2 mt-4">
                        //${day.food.map(f => `<div class="flex justify-between items-center bg-white/[0.02] p-3 rounded-xl"><span class="text-xs font-medium text-slate-300">${f}</span><i data-lucide="check-circle-2" class="w-3 h-3 text-emerald-500/50"></i></div>`).join('')}
						
						${day.food.map(f => {
							// Split the string by the pipe |
							const parts = f.split(' | ');
							const name = parts[0];
							const cals = parts[1] || "??";
							const prot = parts[2] || "??";

							return `
								<div class="flex justify-between items-center bg-white/[0.02] p-3 rounded-xl">
								<span class="text-xs font-medium text-slate-300">${f}</span>
								<i data-lucide="check-circle-2" class="w-3 h-3 text-emerald-500/50"></i>
								</div>
								`;
						}).join('')}

                    </div>
                </div>
            `;
            container.appendChild(dayCard);
        });
        lucide.createIcons();
    } catch (e) {
        container.innerHTML = '<p class="text-red-500 text-xs text-center py-10">Cloud Error. Check Feed Names.</p>';
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
		
        //sendToAdafruit('food-log', type === 'shake' ? "Mass Gainer Shake" : "Quick Log");
		// We save it with pipes | so we can split it later
        const name = type === 'shake' ? "Mass Gainer Shake" : "Quick Log";
        sendToAdafruit('food-log', `${name} | ${cal}kCal | ${prt || 0}g`);
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
        //sendToAdafruit('food-log', n);
		sendToAdafruit('food-log', `${n} | ${c}kCal | ${p || 0}g`);
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
        if(confirm(`Log ${r.food}?\n\n🔥 ${r.calories} kcal\n💪 ${r.protein}g protein`)) {
            state.calories += r.calories; state.protein += r.protein;
            updateUI();
            sendToAdafruit('calories', state.calories);
            sendToAdafruit('protein', state.protein);
            //sendToAdafruit('food-log', r.food);
			sendToAdafruit('food-log', `${r.food} | ${r.calories}kCal | ${r.protein}g`);
        }
    } catch(e) { alert("AI Vision Error"); }
}

	function resetDaily() {
		if(confirm("Reset today's totals?")) {
			state.calories = 0; state.protein = 0; state.water = 0;
			updateUI();
			sendToAdafruit('calories', 0); sendToAdafruit('protein', 0); sendToAdafruit('water', 0);
			toggleSettings();
		}
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
	const wg = document.getElementById('set-weight-goal').value;
    if(wg) {
        state.weightGoal = wg;
        localStorage.setItem('weight_goal', wg);
        sendToAdafruit('weight-goal', wg);
    }
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
