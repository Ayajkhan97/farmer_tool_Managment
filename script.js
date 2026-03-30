// script.js
/**
 * ========================================
 * किसान टूल प्रबंधक - SQLite + JSON Edition
 * ========================================
 */

// ========================================
// SQLITE DATABASE SETUP
// ========================================
let SQL;
let sqliteDB;
let sqliteInitialized = false;

const DB_NAME = 'KisanToolDB';
const STORE_NAME = 'sqlite';
const DB_VERSION = 1;

// Initialize SQL.js
async function initSQLite() {
    try {
        updateDBStatus('🟡', 'डेटाबेस लोड हो रहा है...');
        
        SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        
        const savedData = await loadDBFromIndexedDB();
        
        if (savedData) {
            sqliteDB = new SQL.Database(savedData);
            console.log('SQLite: Existing database loaded');
        } else {
            sqliteDB = new SQL.Database();
            createTables();
            console.log('SQLite: New database created');
        }
        
        sqliteInitialized = true;
        updateDBStatus('🟢', 'डेटाबेस तैयार');
        
        // Load initial data
        loadRates();
        loadHistory();
        loadUdhaar();
        checkRunningState();
        
        // Set default date
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('udhaarDate').value = today;
        
    } catch (error) {
        console.error('SQLite initialization failed:', error);
        updateDBStatus('🔴', 'डेटाबेस त्रुटि');
        alert('डेटाबेस लोड करने में त्रुटि!');
    }
}

// Create database tables
function createTables() {
    // Rates table
    sqliteDB.run(`
        CREATE TABLE IF NOT EXISTS rates (
            tool TEXT PRIMARY KEY,
            rate INTEGER DEFAULT 0
        )
    `);
    
    // History table
    sqliteDB.run(`
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            tool TEXT,
            toolHindi TEXT,
            minutes INTEGER,
            cost INTEGER,
            ratePerHour INTEGER,
            date TEXT,
            timestamp INTEGER
        )
    `);
    
    // Udhaar table
    sqliteDB.run(`
        CREATE TABLE IF NOT EXISTS udhaar (
            id TEXT PRIMARY KEY,
            name TEXT,
            mobile TEXT,
            amount INTEGER,
            date TEXT,
            timestamp INTEGER
        )
    `);
    
    // Running state table
    sqliteDB.run(`
        CREATE TABLE IF NOT EXISTS running_state (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);
    
    // Initialize default rates
    const tools = ['Cultivator', 'Rotavator', 'Leveler', 'Sprayer', 'Trolley'];
    const stmt = sqliteDB.prepare("INSERT OR IGNORE INTO rates (tool, rate) VALUES (?, 0)");
    tools.forEach(tool => stmt.run([tool]));
    stmt.free();
    
    persistDB();
}

// Save database to IndexedDB
async function persistDB() {
    if (!sqliteInitialized) return;
    
    try {
        const data = sqliteDB.export();
        await saveDBToIndexedDB(data);
    } catch (error) {
        console.error('Failed to persist database:', error);
    }
}

// IndexedDB operations
function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function saveDBToIndexedDB(data) {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(data, 'database');
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function loadDBFromIndexedDB() {
    try {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get('database');
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        return null;
    }
}

// ========================================
// JSON EXPORT/IMPORT FUNCTIONS
// ========================================

// Export database to JSON
function exportDatabase() {
    if (!sqliteInitialized) {
        alert('डेटाबेस अभी तैयार नहीं है!');
        return;
    }
    
    // Get all data from SQLite
    const data = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        rates: {},
        history: [],
        udhaar: []
    };
    
    // Export rates
    const ratesResult = sqliteDB.exec("SELECT tool, rate FROM rates");
    if (ratesResult.length > 0) {
        ratesResult[0].values.forEach(row => {
            data.rates[row[0]] = row[1];
        });
    }
    
    // Export history
    const historyResult = sqliteDB.exec(`
        SELECT id, tool, toolHindi, minutes, cost, ratePerHour, date, timestamp 
        FROM history 
        ORDER BY timestamp DESC
    `);
    if (historyResult.length > 0) {
        data.history = historyResult[0].values.map(row => ({
            id: row[0],
            tool: row[1],
            toolHindi: row[2],
            minutes: row[3],
            cost: row[4],
            ratePerHour: row[5],
            date: row[6],
            timestamp: row[7]
        }));
    }
    
    // Export udhaar
    const udhaarResult = sqliteDB.exec(`
        SELECT id, name, mobile, amount, date, timestamp 
        FROM udhaar 
        ORDER BY timestamp DESC
    `);
    if (udhaarResult.length > 0) {
        data.udhaar = udhaarResult[0].values.map(row => ({
            id: row[0],
            name: row[1],
            mobile: row[2],
            amount: row[3],
            date: row[4],
            timestamp: row[5]
        }));
    }
    
    // Create JSON file
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `kisan_tool_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('JSON डेटाबेस सफलतापूर्वक एक्सपोर्ट हो गया!');
}

// Import database from JSON
async function importDatabase(input) {
    const file = input.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate JSON structure
        if (!data.rates || !data.history || !data.udhaar) {
            throw new Error('Invalid JSON format');
        }
        
        // Confirm import
        if (!confirm(`बैकअप इम्पोर्ट करें?\n\nरेट्स: ${Object.keys(data.rates).length}\nइतिहास: ${data.history.length} रिकॉर्ड\nउधार: ${data.udhaar.length} रिकॉर्ड`)) {
            input.value = '';
            return;
        }
        
        // Clear existing data
        sqliteDB.run("DELETE FROM rates");
        sqliteDB.run("DELETE FROM history");
        sqliteDB.run("DELETE FROM udhaar");
        
        // Import rates
        const rateStmt = sqliteDB.prepare("INSERT INTO rates (tool, rate) VALUES (?, ?)");
        Object.entries(data.rates).forEach(([tool, rate]) => {
            rateStmt.run([tool, rate]);
        });
        rateStmt.free();
        
        // Import history
        if (data.history.length > 0) {
            const histStmt = sqliteDB.prepare(`
                INSERT INTO history (id, tool, toolHindi, minutes, cost, ratePerHour, date, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            data.history.forEach(record => {
                histStmt.run([
                    record.id,
                    record.tool,
                    record.toolHindi,
                    record.minutes,
                    record.cost,
                    record.ratePerHour,
                    record.date,
                    record.timestamp
                ]);
            });
            histStmt.free();
        }
        
        // Import udhaar
        if (data.udhaar.length > 0) {
            const udhaarStmt = sqliteDB.prepare(`
                INSERT INTO udhaar (id, name, mobile, amount, date, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            data.udhaar.forEach(record => {
                udhaarStmt.run([
                    record.id,
                    record.name,
                    record.mobile,
                    record.amount,
                    record.date,
                    record.timestamp
                ]);
            });
            udhaarStmt.free();
        }
        
        // Save to IndexedDB
        await persistDB();
        
        alert('डेटाबेस सफलतापूर्वक इम्पोर्ट हो गया! पेज रिफ्रेश हो रहा है...');
        location.reload();
        
    } catch (error) {
        console.error('Import failed:', error);
        alert('JSON इम्पोर्ट में त्रुटि: ' + error.message);
    }
    
    input.value = '';
}

// ========================================
// APP STATE
// ========================================
const APP_STATE = {
    currentTool: null,
    currentToolHindi: null,
    startTime: null,
    isRunning: false,
    rates: {},
    timerInterval: null
};

const TOOLS = {
    'Cultivator': 'कल्टिवेटर',
    'Rotavator': 'रोटावेटर',
    'Leveler': 'लेवलर',
    'Sprayer': 'स्प्रेयर',
    'Trolley': 'ट्रॉली'
};

const TOOL_KEYS = Object.keys(TOOLS);

// ========================================
// UI HELPERS
// ========================================
function updateDBStatus(indicator, text) {
    const ind = document.getElementById('dbIndicator');
    const txt = document.getElementById('dbStatusText');
    if (ind && txt) {
        ind.textContent = indicator;
        txt.textContent = text;
    }
}

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    initSQLite();
});

// ========================================
// NAVIGATION
// ========================================
function navigateTo(pageId) {
    if (APP_STATE.isRunning && pageId !== 'runningScreen') {
        showLockOverlay();
        return;
    }
    
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    closeMenu();
    
    if (pageId === 'history') loadHistory();
    else if (pageId === 'udhaar') loadUdhaar();
    else if (pageId === 'rates') loadRates();
}

// ========================================
// SIDE MENU
// ========================================
function toggleMenu() {
    if (APP_STATE.isRunning) {
        showLockOverlay();
        return;
    }
    
    const sideMenu = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    
    sideMenu.classList.toggle('open');
    menuOverlay.classList.toggle('show');
}

function closeMenu() {
    const sideMenu = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    
    sideMenu.classList.remove('open');
    menuOverlay.classList.remove('show');
}

// ========================================
// LOCK OVERLAY
// ========================================
function showLockOverlay() {
    const lockOverlay = document.getElementById('lockOverlay');
    lockOverlay.style.display = 'flex';
}

function hideLockOverlay() {
    const lockOverlay = document.getElementById('lockOverlay');
    lockOverlay.style.display = 'none';
}

// ========================================
// DASHBOARD - TOOL SELECTION
// ========================================
function openStartScreen(toolKey, toolHindiName) {
    if (APP_STATE.isRunning) {
        showLockOverlay();
        return;
    }
    
    APP_STATE.currentTool = toolKey;
    APP_STATE.currentToolHindi = toolHindiName;
    
    document.getElementById('startToolNameHindi').textContent = toolHindiName;
    
    const rate = APP_STATE.rates[toolKey] || 0;
    document.getElementById('startRateValue').textContent = '₹' + rate;
    
    const warning = document.getElementById('rateWarning');
    const startBtn = document.getElementById('startBtn');
    
    if (rate === 0) {
        warning.style.display = 'block';
        startBtn.disabled = true;
    } else {
        warning.style.display = 'none';
        startBtn.disabled = false;
    }
    
    navigateTo('startScreen');
}

// ========================================
// TOOL START
// ========================================
function startTool() {
    const rate = APP_STATE.rates[APP_STATE.currentTool] || 0;
    
    if (rate === 0) {
        alert('कृपया पहले इस टूल का रेट सेट करें!');
        return;
    }
    
    APP_STATE.isRunning = true;
    APP_STATE.startTime = Date.now();
    
    saveRunningState();
    
    document.getElementById('runningToolNameHindi').textContent = APP_STATE.currentToolHindi;
    
    startTimer();
    lockApp();
    navigateTo('runningScreen');
}

// ========================================
// TIMER FUNCTIONS
// ========================================
function startTimer() {
    updateTimerDisplay();
    APP_STATE.timerInterval = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
    const elapsed = Date.now() - APP_STATE.startTime;
    const formatted = formatTime(elapsed);
    document.getElementById('timerDisplay').textContent = formatted;
}

function formatTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

function stopTimer() {
    if (APP_STATE.timerInterval) {
        clearInterval(APP_STATE.timerInterval);
        APP_STATE.timerInterval = null;
    }
}

// ========================================
// TOOL STOP
// ========================================
function stopTool() {
    const endTime = Date.now();
    const elapsedMs = endTime - APP_STATE.startTime;
    const totalMinutes = Math.floor(elapsedMs / 60000);
    
    const ratePerHour = APP_STATE.rates[APP_STATE.currentTool] || 0;
    const ratePerMinute = ratePerHour / 60;
    const totalCost = Math.round(ratePerMinute * totalMinutes);
    
    const record = {
        id: Date.now().toString(),
        tool: APP_STATE.currentTool,
        toolHindi: APP_STATE.currentToolHindi,
        minutes: totalMinutes,
        cost: totalCost,
        ratePerHour: ratePerHour,
        date: new Date().toISOString(),
        timestamp: Date.now()
    };
    
    saveHistoryRecord(record);
    stopTimer();
    clearRunningState();
    unlockApp();
    showResult(record);
}

// ========================================
// SHOW RESULT
// ========================================
function showResult(record) {
    document.getElementById('resultToolName').textContent = record.toolHindi;
    document.getElementById('resultTime').textContent = record.minutes + ' मिनट';
    document.getElementById('resultRate').textContent = '₹' + record.ratePerHour + ' / घंटा';
    document.getElementById('resultCost').textContent = '₹' + record.cost;
    
    setupWhatsAppShare(record);
    navigateTo('resultScreen');
}

// ========================================
// WHATSAPP SHARE
// ========================================
function setupWhatsAppShare(record) {
    const whatsappBtn = document.getElementById('whatsappShareBtn');
    
    const billMessage = `🚜 कृषि कार्य बिल

टूल: ${record.toolHindi}
समय: ${record.minutes} मिनट
दर: ₹${record.ratePerHour} / घंटा
कुल राशि: ₹${record.cost}

धन्यवाद`;
    
    const whatsappUrl = 'https://wa.me/?text=' + encodeURIComponent(billMessage);
    whatsappBtn.href = whatsappUrl;
}

// ========================================
// BACK TO DASHBOARD
// ========================================
function backToDashboard() {
    APP_STATE.currentTool = null;
    APP_STATE.currentToolHindi = null;
    APP_STATE.isRunning = false;
    APP_STATE.startTime = null;
    
    navigateTo('dashboard');
}

// ========================================
// APP LOCK/UNLOCK
// ========================================
function lockApp() {
    document.getElementById('menuBtn').disabled = true;
    APP_STATE.isRunning = true;
}

function unlockApp() {
    document.getElementById('menuBtn').disabled = false;
    hideLockOverlay();
    APP_STATE.isRunning = false;
}

// ========================================
// SQLITE DATA OPERATIONS
// ========================================

// Running State
function saveRunningState() {
    if (!sqliteInitialized) return;
    
    const state = JSON.stringify({
        currentTool: APP_STATE.currentTool,
        currentToolHindi: APP_STATE.currentToolHindi,
        startTime: APP_STATE.startTime,
        isRunning: true
    });
    
    sqliteDB.run(`INSERT OR REPLACE INTO running_state (key, value) VALUES (?, ?)`, 
        ['running', state]);
    persistDB();
}

function checkRunningState() {
    if (!sqliteInitialized) return;
    
    const result = sqliteDB.exec("SELECT value FROM running_state WHERE key = 'running'");
    if (result.length > 0 && result[0].values.length > 0) {
        const state = JSON.parse(result[0].values[0][0]);
        if (state.isRunning && state.startTime) {
            restoreRunningState(state);
        }
    }
}

function restoreRunningState(state) {
    APP_STATE.currentTool = state.currentTool;
    APP_STATE.currentToolHindi = state.currentToolHindi;
    APP_STATE.startTime = state.startTime;
    APP_STATE.isRunning = true;
    
    lockApp();
    document.getElementById('runningToolNameHindi').textContent = state.currentToolHindi;
    startTimer();
    navigateTo('runningScreen');
}

function clearRunningState() {
    if (!sqliteInitialized) return;
    
    sqliteDB.run("DELETE FROM running_state WHERE key = 'running'");
    persistDB();
}

// Rates
function loadRates() {
    if (!sqliteInitialized) return;
    
    APP_STATE.rates = {};
    const result = sqliteDB.exec("SELECT tool, rate FROM rates");
    
    if (result.length > 0) {
        result[0].values.forEach(row => {
            APP_STATE.rates[row[0]] = row[1];
        });
    }
    
    updateRatesForm();
}

function updateRatesForm() {
    document.getElementById('rateCultivator').value = APP_STATE.rates['Cultivator'] || '';
    document.getElementById('rateRotavator').value = APP_STATE.rates['Rotavator'] || '';
    document.getElementById('rateLeveler').value = APP_STATE.rates['Leveler'] || '';
    document.getElementById('rateSprayer').value = APP_STATE.rates['Sprayer'] || '';
    document.getElementById('rateTrolley').value = APP_STATE.rates['Trolley'] || '';
}

function saveRates() {
    if (!sqliteInitialized) {
        alert('डेटाबेस तैयार नहीं है!');
        return;
    }
    
    const rates = {
        Cultivator: parseInt(document.getElementById('rateCultivator').value) || 0,
        Rotavator: parseInt(document.getElementById('rateRotavator').value) || 0,
        Leveler: parseInt(document.getElementById('rateLeveler').value) || 0,
        Sprayer: parseInt(document.getElementById('rateSprayer').value) || 0,
        Trolley: parseInt(document.getElementById('rateTrolley').value) || 0
    };
    
    APP_STATE.rates = rates;
    
    const stmt = sqliteDB.prepare("INSERT OR REPLACE INTO rates (tool, rate) VALUES (?, ?)");
    Object.entries(rates).forEach(([tool, rate]) => {
        stmt.run([tool, rate]);
    });
    stmt.free();
    
    persistDB();
    alert('रेट सफलतापूर्वक सेव हुए!');
    navigateTo('dashboard');
}

// History
function loadHistory() {
    if (!sqliteInitialized) return;
    
    const historyList = document.getElementById('historyList');
    const emptyHistory = document.getElementById('emptyHistory');
    
    const result = sqliteDB.exec(`
        SELECT id, toolHindi, minutes, cost, date 
        FROM history 
        ORDER BY timestamp DESC
    `);
    
    let records = [];
    if (result.length > 0) {
        records = result[0].values.map(row => ({
            id: row[0],
            toolHindi: row[1],
            minutes: row[2],
            cost: row[3],
            date: row[4]
        }));
    }
    
    renderHistory(records);
}

function renderHistory(records) {
    const historyList = document.getElementById('historyList');
    const emptyHistory = document.getElementById('emptyHistory');
    
    if (records.length === 0) {
        historyList.innerHTML = '';
        emptyHistory.style.display = 'block';
        return;
    }
    
    emptyHistory.style.display = 'none';
    
    historyList.innerHTML = records.map(record => `
        <div class="history-item">
            <input type="checkbox" class="history-checkbox" value="${record.id}" data-id="${record.id}">
            <div class="history-content">
                <div class="history-tool">${record.toolHindi}</div>
                <div class="history-details">
                    ${formatDate(record.date)} • ${record.minutes} मिनट
                </div>
            </div>
            <div class="history-cost">₹${record.cost}</div>
        </div>
    `).join('');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('hi-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function saveHistoryRecord(record) {
    if (!sqliteInitialized) return;
    
    sqliteDB.run(`
        INSERT INTO history (id, tool, toolHindi, minutes, cost, ratePerHour, date, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [record.id, record.tool, record.toolHindi, record.minutes, record.cost, 
        record.ratePerHour, record.date, record.timestamp]);
    
    persistDB();
}

function deleteSelectedHistory() {
    if (!sqliteInitialized) return;
    
    const checkboxes = document.querySelectorAll('.history-checkbox:checked');
    
    if (checkboxes.length === 0) {
        alert('कृपया हटाने के लिए कम से कम एक रिकॉर्ड चुनें।');
        return;
    }
    
    if (!confirm('क्या आप वाकई चयनित रिकॉर्ड हटाना चाहते हैं?')) {
        return;
    }
    
    const idsToDelete = Array.from(checkboxes).map(cb => cb.value);
    const placeholders = idsToDelete.map(() => '?').join(',');
    
    sqliteDB.run(`DELETE FROM history WHERE id IN (${placeholders})`, idsToDelete);
    persistDB();
    
    loadHistory();
}

// Udhaar
function loadUdhaar() {
    if (!sqliteInitialized) return;
    
    const udhaarList = document.getElementById('udhaarList');
    const emptyUdhaar = document.getElementById('emptyUdhaar');
    
    const result = sqliteDB.exec(`
        SELECT id, name, mobile, amount, date 
        FROM udhaar 
        ORDER BY timestamp DESC
    `);
    
    let records = [];
    if (result.length > 0) {
        records = result[0].values.map(row => ({
            id: row[0],
            name: row[1],
            mobile: row[2],
            amount: row[3],
            date: row[4]
        }));
    }
    
    renderUdhaar(records);
}

function renderUdhaar(records) {
    const udhaarList = document.getElementById('udhaarList');
    const emptyUdhaar = document.getElementById('emptyUdhaar');
    
    if (records.length === 0) {
        udhaarList.innerHTML = '';
        emptyUdhaar.style.display = 'block';
        return;
    }
    
    emptyUdhaar.style.display = 'none';
    
    udhaarList.innerHTML = records.map(record => `
        <div class="udhaar-card">
            <div class="udhaar-header">
                <span class="udhaar-name">${record.name}</span>
                <span class="udhaar-amount">₹${record.amount}</span>
            </div>
            <div class="udhaar-details">
                <span>${record.mobile}</span> • 
                <span>${formatDate(record.date)}</span>
            </div>
        </div>
    `).join('');
}

function saveUdhaar() {
    if (!sqliteInitialized) {
        alert('डेटाबेस तैयार नहीं है!');
        return;
    }
    
    const name = document.getElementById('udhaarName').value.trim();
    const mobile = document.getElementById('udhaarMobile').value.trim();
    const amount = parseInt(document.getElementById('udhaarAmount').value) || 0;
    const date = document.getElementById('udhaarDate').value;
    
    if (!name) {
        alert('कृपया नाम दर्ज करें।');
        return;
    }
    
    if (!mobile) {
        alert('कृपया मोबाइल नंबर दर्ज करें।');
        return;
    }
    
    if (amount <= 0) {
        alert('कृपया वैध राशि दर्ज करें।');
        return;
    }
    
    if (!date) {
        alert('कृपया तारीख चुनें।');
        return;
    }
    
    const record = {
        id: Date.now().toString(),
        name: name,
        mobile: mobile,
        amount: amount,
        date: date,
        timestamp: Date.now()
    };
    
    sqliteDB.run(`
        INSERT INTO udhaar (id, name, mobile, amount, date, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [record.id, record.name, record.mobile, record.amount, record.date, record.timestamp]);
    
    persistDB();
    
    document.getElementById('udhaarName').value = '';
    document.getElementById('udhaarMobile').value = '';
    document.getElementById('udhaarAmount').value = '';
    
    loadUdhaar();
    alert('उधार सफलतापूर्वक जोड़ा गया!');
}

// Debug helpers
window.ftmDebug = {
    state: APP_STATE,
    db: () => sqliteDB,
    export: exportDatabase,
    clear: async function() {
        if (confirm('सारा डेटा हटाएं?')) {
            indexedDB.deleteDatabase(DB_NAME);
            location.reload();
        }
    }
};
