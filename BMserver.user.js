// ==UserScript==
// @name         BattleMetrics Server Monitor & Alert System
// @namespace    http://tampermonkey.net/
// @version      1.0.9
// @description  Real-time server monitoring with player alerts, activity logging, and player search for BattleMetrics Rust servers
// @author       jlaiii
// @match        https://www.battlemetrics.com/servers/*
// @updateURL    https://raw.githubusercontent.com/jlaiii/BattleMetrics-Rust-Analytics/main/BMserver.user.js
// @downloadURL  https://raw.githubusercontent.com/jlaiii/BattleMetrics-Rust-Analytics/main/BMserver.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // Constants - make them tab-specific to prevent cross-tab interference
    const SERVER_MONITOR_ID = `bms-server-monitor-${Math.random().toString(36).substr(2, 9)}`;
    const TOGGLE_BUTTON_ID = `bms-toggle-button-${Math.random().toString(36).substr(2, 9)}`;
    const ALERT_PANEL_ID = `bms-alert-panel-${Math.random().toString(36).substr(2, 9)}`;
    const MENU_VISIBLE_KEY = 'bms_menu_visible';
    
    // Server-specific storage keys (will be set after server ID is determined)
    let ALERTS_KEY = '';
    let ACTIVITY_LOG_KEY = '';
    let ALERT_SETTINGS_KEY = '';
    let SAVED_PLAYERS_KEY = '';
    let RECENT_ALERTS_KEY = '';
    let PLAYER_DATABASE_KEY = '';
    let POPULATION_HISTORY_KEY = '';
    let LAST_PLAYER_STATE_KEY = '';
    let SESSIONS_KEY = '';
    let NOTES_KEY = '';

    // Function to initialize server-specific keys
    const initializeStorageKeys = (serverID) => {
        ALERTS_KEY = `bms_player_alerts_${serverID}`;
        ACTIVITY_LOG_KEY = `bms_activity_log_${serverID}`;
        ALERT_SETTINGS_KEY = `bms_alert_settings_${serverID}`;
        SAVED_PLAYERS_KEY = `bms_saved_players_${serverID}`;
        RECENT_ALERTS_KEY = `bms_recent_alerts_${serverID}`;
        PLAYER_DATABASE_KEY = `bms_player_database_${serverID}`;
        POPULATION_HISTORY_KEY = `bms_population_history_${serverID}`;
        LAST_PLAYER_STATE_KEY = `bms_last_player_state_${serverID}`;
        SESSIONS_KEY = `bms_script_sessions_${serverID}`;
        NOTES_KEY = `bms_player_notes_${serverID}`;
    };

    // Update/check settings (global)
    const SCRIPT_VERSION = '1.0.9';
    const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/jlaiii/BattleMetrics-Rust-Analytics/main/BMserver.user.js';
    const INSTALL_URL = 'https://jlaiii.github.io/BattleMetrics-Rust-Analytics/';
    const AUTO_CHECK_KEY = 'bms_auto_check_updates';
    let updateAvailable = false;
    let updateAvailableVersion = null;

    const compareVersions = (a, b) => {
        try {
            const normalize = (s) => ('' + s).replace(/[^0-9.]/g, '').split('.').map(n => String(parseInt(n, 10) || 0)).join('.');
            const naStr = normalize(a);
            const nbStr = normalize(b);
            const pa = naStr.split('.').map(n => parseInt(n, 10) || 0);
            const pb = nbStr.split('.').map(n => parseInt(n, 10) || 0);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const na = pa[i] || 0;
                const nb = pb[i] || 0;
                if (na > nb) return 1;
                if (na < nb) return -1;
            }
            return 0;
        } catch (e) {
            return 0;
        }
    };

    const loadAutoCheckSetting = () => {
        const val = localStorage.getItem(AUTO_CHECK_KEY);
        if (val === null) return true; // default to ON
        return val === 'true';
    };
    const saveAutoCheckSetting = (v) => localStorage.setItem(AUTO_CHECK_KEY, v ? 'true' : 'false');
    // Note: auto-install behavior removed. Users must click the update banner/toast to install manually.

    // Debug Console System
    class DebugConsole {
        constructor() {
            this.logs = [];
            this.enabled = this.loadDebugSetting();
            this.verbose = this.loadVerboseSetting();
            this.autoExportOnError = this.loadAutoExportSetting();
            this.maxLogs = 1000;
            this.aggregates = {}; // signature -> {count, lastSeen, examples: []}
            this.version = '1.0.2';
            window.toggleAutoExportDebug = (enabled) => {
                console.log('[Debug Console] toggleAutoExportDebug called with:', enabled);
                if (debugConsole) {
                    debugConsole.saveAutoExportSetting(enabled);
                }
            };

            // Temporarily enable verbose capture of site errors for a duration (ms)
            // Usage: captureSiteErrorsFor(60000) — captures for 60s then restores previous setting
            window.captureSiteErrorsFor = (ms = 60000) => {
                if (!debugConsole) return alert('Debug console not initialized');
                try {
                    const prev = debugConsole.verbose;
                    debugConsole.saveVerboseSetting(true);
                    debugConsole.info('Temporary verbose capture enabled for ' + ms + 'ms');
                    setTimeout(() => {
                        debugConsole.saveVerboseSetting(!!prev);
                        debugConsole.info('Temporary verbose capture ended; restored previous setting');
                    }, ms);
                } catch (e) {
                    console.error('captureSiteErrorsFor failed', e);
                    alert('Failed to enable capture: ' + e.message);
                }
            };
        
            window.exportAggregatedErrors = () => {
                if (debugConsole) debugConsole.exportAggregates();
            };
        
            window.clearAggregatedErrors = () => {
                if (debugConsole) debugConsole.clearAggregates();
                setTimeout(() => debugConsole.updateDebugDisplay(), 100);
            };
        }

        loadDebugSetting() {
            const saved = localStorage.getItem('bms_debug_enabled');
            // Default to false (off by default)
            return saved === 'true';
        }

        saveDebugSetting(enabled) {
            localStorage.setItem('bms_debug_enabled', enabled.toString());
            this.enabled = enabled;
        }

        loadVerboseSetting() {
            const saved = localStorage.getItem('bms_debug_verbose');
            return saved === 'true';
        }

        saveVerboseSetting(enabled) {
            localStorage.setItem('bms_debug_verbose', enabled.toString());
            this.verbose = enabled;
        }

        loadAutoExportSetting() {
            const saved = localStorage.getItem('bms_debug_autoexport');
            return saved === 'true';
        }

        saveAutoExportSetting(enabled) {
            localStorage.setItem('bms_debug_autoexport', enabled.toString());
            this.autoExportOnError = enabled;
        }

        log(level, message, data = null) {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                level,
                message,
                data: data ? JSON.stringify(data, null, 2) : null,
                url: window.location.href,
                userAgent: navigator.userAgent
            };

            this.logs.push(logEntry);
            
            // Keep only last maxLogs entries
            if (this.logs.length > this.maxLogs) {
                this.logs = this.logs.slice(-this.maxLogs);
            }

            // Always log to browser console if debug is enabled
            if (this.enabled) {
                const consoleMessage = `[BMS Debug ${level.toUpperCase()}] ${message}`;
                switch (level) {
                    case 'error':
                        console.error(consoleMessage, data);
                        break;
                    case 'warn':
                        console.warn(consoleMessage, data);
                        break;
                    case 'info':
                        console.info(consoleMessage, data);
                        break;
                    default:
                        console.log(consoleMessage, data);
                }
            }

            // Update debug console display if it exists
            this.updateDebugDisplay();
        }

        error(message, data = null) {
            this.log('error', message, data);
        }

        warn(message, data = null) {
            this.log('warn', message, data);
        }

        info(message, data = null) {
            this.log('info', message, data);
        }

        debug(message, data = null) {
            this.log('debug', message, data);
        }

        exportLogs() {
            const exportData = {
                version: this.version,
                exportTime: new Date().toISOString(),
                serverID: currentServerID,
                serverName: currentServerName,
                totalLogs: this.logs.length,
                logs: this.logs
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bms_debug_log_${currentServerID}_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);

            this.info('Debug logs exported', { filename: a.download, logCount: this.logs.length });
        }

        // Aggregate errors by signature for quick triage
        recordAggregate(signature, entry) {
            try {
                if (!signature) signature = 'unknown';
                const agg = this.aggregates[signature] || { count: 0, lastSeen: null, examples: [] };
                agg.count += 1;
                agg.lastSeen = new Date().toISOString();
                if (agg.examples.length < 5) {
                    agg.examples.push(entry);
                }
                this.aggregates[signature] = agg;
            } catch (e) {
                console.warn('Failed to record aggregate', e);
            }
        }

        // Export aggregated error report
        exportAggregates() {
            const blob = new Blob([JSON.stringify({ version: this.version, aggregates: this.aggregates, exportTime: new Date().toISOString() }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `bms_error_aggregates_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
            this.info('Aggregates exported', { file: a.download });
        }

        clearAggregates() {
            this.aggregates = {};
            this.info('Aggregates cleared');
        }

        clearLogs() {
            this.logs = [];
            this.aggregates = {};
            this.updateDebugDisplay();
            this.updateDebugStats();
        }

        updateDebugStats() {
            const statsDiv = document.getElementById('debug-stats');
            if (!statsDiv) return;
            const stats = this.getStats();
            const oldestTime = stats.oldestLog ? new Date(stats.oldestLog).toLocaleString() : 'N/A';
            statsDiv.innerHTML = `Total Logs: ${stats.totalLogs} | Errors: <span style="color:#dc3545">${stats.errorCount}</span> | Warnings: <span style="color:#ffc107">${stats.warnCount}</span> | Info: ${stats.infoCount} | Debug: ${stats.debugCount}${stats.oldestLog ? `<br>Oldest: ${oldestTime}` : ''}`;
        }

        updateDebugDisplay() {
            const debugList = document.getElementById('debug-console-list');
            if (!debugList) return;

            this.updateDebugStats();

            const recentLogs = this.logs.slice(-50).reverse(); // Show last 50 logs

            if (recentLogs.length === 0) {
                debugList.innerHTML = '<div style="opacity: 0.7; font-style: italic; color: #6c757d; padding: 4px;">No debug logs</div>';
                return;
            }

            const esc = (s) => String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

            let debugHTML = '';
            recentLogs.forEach(log => {
                const levelColor = {
                    'error': '#dc3545',
                    'warn': '#ffc107',
                    'info': '#17a2b8',
                    'debug': '#6c757d'
                }[log.level] || '#6c757d';

                const time = new Date(log.timestamp).toLocaleTimeString();

                debugHTML += `<div style="padding: 4px 6px; margin-bottom: 2px; border-left: 3px solid ${levelColor}; background: rgba(255,255,255,0.04); font-size: 11px;">`
                    + `<span style="color:${levelColor}; font-weight:bold;">[${esc(log.level.toUpperCase())}]</span>`
                    + ` <span style="color:#6c757d;">${esc(time)}</span>`
                    + ` <span style="color:#e9ecef;">${esc(log.message)}</span>`
                    + (log.data ? `<div style="color:#6c757d; font-family:monospace; font-size:10px; margin-top:2px; max-height:80px; overflow-y:auto; white-space:pre-wrap;">${esc(log.data)}</div>` : '')
                    + `</div>`;
            });

            debugList.innerHTML = debugHTML;
        }

        getStats() {
            const stats = {
                totalLogs: this.logs.length,
                errorCount: this.logs.filter(l => l.level === 'error').length,
                warnCount: this.logs.filter(l => l.level === 'warn').length,
                infoCount: this.logs.filter(l => l.level === 'info').length,
                debugCount: this.logs.filter(l => l.level === 'debug').length,
                oldestLog: this.logs.length > 0 ? this.logs[0].timestamp : null,
                newestLog: this.logs.length > 0 ? this.logs[this.logs.length - 1].timestamp : null
            };
            return stats;
        }

        getLogsAsText() {
            const header = `BattleMetrics Server Monitor v${this.version} Debug Logs
Export Time: ${new Date().toISOString()}
Server ID: ${currentServerID || 'Unknown'}
Server Name: ${currentServerName || 'Unknown'}
Total Logs: ${this.logs.length}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}

=== DEBUG LOGS ===
`;

            const logsText = this.logs.map(log => {
                const timestamp = new Date(log.timestamp).toLocaleString();
                let logLine = `[${log.level.toUpperCase()}] ${timestamp}: ${log.message}`;
                if (log.data) {
                    logLine += `\nData: ${log.data}`;
                }
                return logLine;
            }).join('\n\n');

            return header + logsText;
        }
    }

    // Initialize debug console
    const debugConsole = new DebugConsole();
    
    // Log script startup
    debugConsole.info(`BattleMetrics Server Monitor v${SCRIPT_VERSION} loaded`, {
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    });
    
    // Debug console system initialized
    debugConsole.debug('Debug console system initialized');

    // Global variables - each tab will have its own instance
    let currentServerID = null;
    let serverMonitor = null;
    let monitoringInterval = null;
    let lastPlayerList = new Map();
    let currentServerName = '';
    let alertReminderInterval = null;
    let populationStatsInterval = null;
    let timestampRefreshInterval = null;
    let autoRefreshIntervalId = null;

    // Auto-refresh settings keys (global, not server-specific)
    const AUTO_REFRESH_ENABLED_KEY = 'bms_auto_refresh_enabled';
    const AUTO_REFRESH_MS_KEY = 'bms_auto_refresh_ms';
    const KEEP_ALIVE_KEY = 'bms_keep_alive_enabled';
    const KEEP_ALIVE_URL_KEY = 'bms_keep_alive_url';

    const loadAutoRefreshSettings = () => ({
        enabled: localStorage.getItem(AUTO_REFRESH_ENABLED_KEY) === 'true',
        ms: parseInt(localStorage.getItem(AUTO_REFRESH_MS_KEY), 10) || 120000
    });

    const saveAutoRefreshSettings = (enabled, ms) => {
        localStorage.setItem(AUTO_REFRESH_ENABLED_KEY, enabled ? 'true' : 'false');
        localStorage.setItem(AUTO_REFRESH_MS_KEY, String(ms));
    };

    const startAutoRefresh = (ms) => {
        stopAutoRefresh();
        autoRefreshIntervalId = setInterval(() => {
            suppressKeepAliveGuard = true;
            location.reload();
        }, ms);
    };

    const stopAutoRefresh = () => {
        if (autoRefreshIntervalId) {
            clearInterval(autoRefreshIntervalId);
            autoRefreshIntervalId = null;
        }
    };

    // ── Keep-Alive System ──────────────────────────────────────────────────────
    // Prevents background tab throttling, warns before close, and opens a
    // watchdog popup that auto-reopens this tab if it is accidentally closed.
    let keepAliveAudioCtx = null;
    let keepAliveBeforeUnload = null;
    let keepAlivePopup = null;
    let suppressKeepAliveGuard = false; // set true before intentional reloads

    const loadKeepAliveSetting = () => localStorage.getItem(KEEP_ALIVE_KEY) === 'true';
    const saveKeepAliveSetting = (v) => localStorage.setItem(KEEP_ALIVE_KEY, v ? 'true' : 'false');

    const startKeepAliveAudio = () => {
        try {
            if (keepAliveAudioCtx) return;
            keepAliveAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = keepAliveAudioCtx.createOscillator();
            const gainNode = keepAliveAudioCtx.createGain();
            gainNode.gain.setValueAtTime(0, keepAliveAudioCtx.currentTime);
            oscillator.connect(gainNode);
            gainNode.connect(keepAliveAudioCtx.destination);
            oscillator.start();
            // AudioContext may start suspended (browser autoplay policy) — resume on first interaction
            if (keepAliveAudioCtx.state === 'suspended') {
                const resume = () => { if (keepAliveAudioCtx) keepAliveAudioCtx.resume(); };
                document.addEventListener('click', resume, { once: true });
                document.addEventListener('keydown', resume, { once: true });
            }
        } catch (e) {
            console.warn('[KeepAlive] Audio anti-throttle failed:', e);
        }
    };

    const stopKeepAliveAudio = () => {
        try {
            if (keepAliveAudioCtx) { keepAliveAudioCtx.close(); keepAliveAudioCtx = null; }
        } catch (e) {}
    };

    const startKeepAliveGuard = () => {
        if (keepAliveBeforeUnload) return;
        keepAliveBeforeUnload = (e) => {
            if (suppressKeepAliveGuard) return;
            e.preventDefault();
            e.returnValue = 'BMS Keep-Alive is enabled. Are you sure you want to close this tab?';
            return e.returnValue;
        };
        window.addEventListener('beforeunload', keepAliveBeforeUnload, { capture: true });
    };

    const stopKeepAliveGuard = () => {
        if (keepAliveBeforeUnload) {
            window.removeEventListener('beforeunload', keepAliveBeforeUnload, { capture: true });
            keepAliveBeforeUnload = null;
        }
    };

    const openKeepAliveWatchdog = () => {
        if (keepAlivePopup && !keepAlivePopup.closed) return true;
        const tabUrl = localStorage.getItem(KEEP_ALIVE_URL_KEY) || window.location.href;
        const popupHTML = `<!DOCTYPE html>
<html><head>
<title>BMS Watchdog</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1e2736;color:#e9ecef;font-family:-apple-system,sans-serif;padding:14px;font-size:12px}
h4{color:#17a2b8;margin-bottom:10px;font-size:13px}
.row{display:flex;align-items:center;gap:7px;margin-bottom:8px;font-weight:600}
.dot{width:9px;height:9px;border-radius:50%;background:#28a745;flex-shrink:0;transition:background .4s}
.url{color:#6c757d;font-size:10px;margin-bottom:10px;word-break:break-all}
.btn{background:#dc3545;color:#fff;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;width:100%}
.btn:hover{opacity:.85}
.count{font-size:10px;color:#6c757d;margin-top:7px}
</style></head><body>
<h4>&#x1F6E1; BMS Watchdog</h4>
<div class="row"><div class="dot" id="dot"></div><span id="status">Monitoring tab</span></div>
<div class="url" id="url"></div>
<button class="btn" onclick="window.close()">Stop &amp; Close</button>
<div class="count" id="count"></div>
<script>
const fallback=${JSON.stringify(tabUrl)};
let reopenCount=0,lastReopen=0;
const dot=document.getElementById('dot');
const statusEl=document.getElementById('status');
const urlEl=document.getElementById('url');
const countEl=document.getElementById('count');
const getUrl=()=>{ try{ if(window.opener&&!window.opener.closed) return window.opener.location.href; }catch(e){} return fallback; };
const check=()=>{
  try{
    if(!window.opener||window.opener.closed){
      dot.style.background='#ffc107';
      statusEl.textContent='Tab closed — reopening\u2026';
      const targetUrl=getUrl();
      const now=Date.now();
      if(now-lastReopen>9000){ lastReopen=now; reopenCount++; countEl.textContent='Reopened '+reopenCount+'\xd7'; window.open(targetUrl,'_blank'); }
    } else {
      urlEl.textContent=getUrl(); dot.style.background='#28a745'; statusEl.textContent='Monitoring tab';
    }
  } catch(e){ statusEl.textContent='Watching (guard active)'; }
};
setInterval(check,2000);
<\/script></body></html>`;
        const wx = Math.max(0, window.screen.width - 265);
        keepAlivePopup = window.open('', 'bms_watchdog', `width=250,height=175,top=10,left=${wx},toolbar=no,menubar=no,scrollbars=no,resizable=yes`);
        if (!keepAlivePopup || keepAlivePopup.closed) return false;
        try {
            keepAlivePopup.document.open();
            keepAlivePopup.document.write(popupHTML);
            keepAlivePopup.document.close();
        } catch (e) { return false; }
        return true;
    };

    const closeKeepAliveWatchdog = () => {
        try { if (keepAlivePopup && !keepAlivePopup.closed) keepAlivePopup.close(); } catch (e) {}
        keepAlivePopup = null;
    };

    const startKeepAlive = () => {
        localStorage.setItem(KEEP_ALIVE_URL_KEY, window.location.href);
        startKeepAliveAudio();
        startKeepAliveGuard();
    };

    const stopKeepAlive = () => {
        stopKeepAliveAudio();
        stopKeepAliveGuard();
        closeKeepAliveWatchdog();
    };

    // Population tracking variables
    let populationHistory = [];
    let currentPopulation = 0;
    let lastHourChange = 0;
    let predictedNextHour = 0;
    
    // Search state tracking to prevent interference
    let activePlayerSearch = '';
    let activeDatabaseSearch = '';
    
    // Generate unique tab identifier to prevent cross-tab interference
    const tabId = Math.random().toString(36).substr(2, 9);

    // Utility functions
    const isMenuVisible = () => {
        return localStorage.getItem(MENU_VISIBLE_KEY) !== 'false';
    };

    // Normalize player names for comparison (trim and collapse spaces)
    const normalizeName = (s) => {
        if (!s) return '';
        return s.replace(/\s+/g, ' ').trim();
    };

    const namesEqual = (a, b) => normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();

    const setMenuVisibility = (visible) => {
        localStorage.setItem(MENU_VISIBLE_KEY, visible.toString());
        updateUIVisibility();
    };

    const updateUIVisibility = () => {
        const monitor = document.getElementById(SERVER_MONITOR_ID);
        const alertPanel = document.getElementById(ALERT_PANEL_ID);
        const visible = isMenuVisible();

        if (monitor) {
            monitor.style.display = visible ? 'block' : 'none';
        }
        if (alertPanel && !visible) {
            alertPanel.style.display = 'none';
        }

        updateToggleButton();
    };

    const updateToggleButton = () => {
        const toggleBtn = document.getElementById(TOGGLE_BUTTON_ID);
        if (toggleBtn) {
            const visible = isMenuVisible();
            toggleBtn.textContent = visible ? 'X' : 'SM';
            toggleBtn.title = visible ? 'Hide Server Monitor' : 'Show Server Monitor';
        }
    };

    const toRelativeTime = (timestamp) => {
        const now = Date.now();
        const diff = now - new Date(timestamp).getTime();
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'a few seconds ago';
    };

    // Parse ISO 8601 duration like PT14H53M51.565S -> milliseconds
    const parseISODurationToMs = (iso) => {
        if (!iso || typeof iso !== 'string') return null;
        // Expect format starting with 'PT'
        const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (!match) return null;
        const hours = parseInt(match[1] || '0', 10);
        const minutes = parseInt(match[2] || '0', 10);
        const seconds = parseFloat(match[3] || '0');
        return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
    };

    // Server Monitor Class
    class ServerMonitor {
        constructor() {
            this.alerts = this.loadAlerts();
            this.activityLog = this.loadActivityLog();
            this.settings = this.loadSettings();
            this.savedPlayers = this.loadSavedPlayers();
            this.recentAlerts = this.loadRecentAlerts();
            this.playerDatabase = this.loadPlayerDatabase();
            this.populationHistory = this.loadPopulationHistory();
            this.lastPlayerState = this.loadLastPlayerState();
            this.playerNotes = this.loadPlayerNotes();
            this.isMonitoring = false;
            this.currentPlayers = new Map();
            this.soundEnabled = this.settings.soundEnabled !== false;
        }

        loadAlerts() {
            try {
                return JSON.parse(localStorage.getItem(ALERTS_KEY) || '{}');
            } catch {
                return {};
            }
        }

        saveAlerts() {
            localStorage.setItem(ALERTS_KEY, JSON.stringify(this.alerts));
        }

        loadActivityLog() {
            try {
                const log = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]');
                // Keep full activity history (persist locally forever unless user clears)
                return log || [];
            } catch {
                return [];
            }
        }

        saveActivityLog() {
            // Save the full activity log to localStorage (no forced truncation)
            try {
                localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(this.activityLog));
            } catch (e) {
                console.error('Failed to save activity log to localStorage:', e);
            }
        }

        loadSettings() {
            try {
                return JSON.parse(localStorage.getItem(ALERT_SETTINGS_KEY) || '{}');
            } catch {
                return {};
            }
        }

        saveSettings() {
            localStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(this.settings));
        }

        loadSavedPlayers() {
            try {
                return JSON.parse(localStorage.getItem(SAVED_PLAYERS_KEY) || '{}');
            } catch {
                return {};
            }
        }

        saveSavedPlayers() {
            localStorage.setItem(SAVED_PLAYERS_KEY, JSON.stringify(this.savedPlayers));
        }

        savePlayer(playerName, playerId) {
            this.savedPlayers[playerId] = {
                name: playerName,
                saved: Date.now()
            };
            this.saveSavedPlayers();
        }

        removeSavedPlayer(playerId) {
            delete this.savedPlayers[playerId];
            this.saveSavedPlayers();
        }

        loadRecentAlerts() {
            try {
                return JSON.parse(localStorage.getItem(RECENT_ALERTS_KEY) || '{}');
            } catch {
                return {};
            }
        }

        saveRecentAlerts() {
            localStorage.setItem(RECENT_ALERTS_KEY, JSON.stringify(this.recentAlerts));
        }

        addRecentAlert(playerName, playerId, action) {
            const alertId = `${playerId}_${action}_${Date.now()}`;
            this.recentAlerts[alertId] = {
                playerName,
                playerId,
                action,
                timestamp: Date.now(),
                acknowledged: false
            };
            this.saveRecentAlerts();
            this.updateRecentAlertsDisplay();
            this.startAlertReminders();
        }

        acknowledgeAlert(alertId) {
            if (this.recentAlerts[alertId]) {
                this.recentAlerts[alertId].acknowledged = true;
                this.saveRecentAlerts();
                this.updateRecentAlertsDisplay();
                
                // Check if all alerts are acknowledged
                const unacknowledged = Object.values(this.recentAlerts).filter(alert => !alert.acknowledged);
                if (unacknowledged.length === 0) {
                    this.stopAlertReminders();
                    // Trigger reorder when all alerts are acknowledged
                    setTimeout(() => this.reorderSectionsIfNeeded(), 100);
                }
            }
        }

        clearOldAlerts() {
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
            Object.keys(this.recentAlerts).forEach(alertId => {
                if (this.recentAlerts[alertId].timestamp < oneDayAgo) {
                    delete this.recentAlerts[alertId];
                }
            });
            this.saveRecentAlerts();
        }

        acknowledgeAllAlerts() {
            Object.keys(this.recentAlerts).forEach(alertId => {
                this.recentAlerts[alertId].acknowledged = true;
            });
            this.saveRecentAlerts();
            this.stopAlertReminders();
            this.updateRecentAlertsDisplay();
            setTimeout(() => this.reorderSectionsIfNeeded(), 100);
        }

        clearAllRecentAlerts() {
            this.recentAlerts = {};
            this.saveRecentAlerts();
            this.stopAlertReminders();
            this.updateRecentAlertsDisplay();
            setTimeout(() => this.reorderSectionsIfNeeded(), 100);
        }

        startAlertReminders() {
            if (alertReminderInterval || this.settings.repeatAlerts === false) return;
            const interval = this.settings.repeatIntervalMs || 60000;
            alertReminderInterval = setInterval(() => {
                const unacknowledged = Object.values(this.recentAlerts).filter(alert => !alert.acknowledged);
                if (unacknowledged.length > 0 && this.soundEnabled && this.settings.repeatAlerts !== false) {
                    this.playAlertSound();
                }
            }, interval);
        }

        stopAlertReminders() {
            if (alertReminderInterval) {
                clearInterval(alertReminderInterval);
                alertReminderInterval = null;
            }
        }

        loadPlayerDatabase() {
            try {
                const saved = localStorage.getItem(PLAYER_DATABASE_KEY);
                if (saved) {
                    const database = JSON.parse(saved);
                    console.log(`Loaded ${Object.keys(database).length} players from database`);
                    return database;
                }
                return {};
            } catch (e) {
                console.error('Failed to load player database:', e);
                return {};
            }
        }

        savePlayerDatabase() {
            // Debounce database saves to reduce localStorage writes
            clearTimeout(this.databaseSaveTimeout);
            this.databaseSaveTimeout = setTimeout(() => {
                try {
                    localStorage.setItem(PLAYER_DATABASE_KEY, JSON.stringify(this.playerDatabase));
                    console.log('Player database saved to localStorage');
                } catch (e) {
                    console.error('Failed to save player database:', e);
                }
            }, 2000);
        }

        loadPopulationHistory() {
            try {
                const saved = localStorage.getItem(POPULATION_HISTORY_KEY);
                if (saved) {
                    const history = JSON.parse(saved);
                    // Keep only last 24 hours of data
                    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                    const filteredHistory = history.filter(entry => entry.timestamp > oneDayAgo);
                    
                    console.log(`Loaded population history: ${filteredHistory.length} entries from last 24 hours`);
                    if (filteredHistory.length > 0) {
                        const oldest = new Date(filteredHistory[0].timestamp).toLocaleString();
                        const newest = new Date(filteredHistory[filteredHistory.length - 1].timestamp).toLocaleString();
                        console.log(`Population data range: ${oldest} to ${newest}`);
                    }
                    
                    return filteredHistory;
                }
                console.log('No population history found in localStorage');
                return [];
            } catch (e) {
                console.error('Failed to load population history:', e);
                return [];
            }
        }

        savePopulationHistory() {
            try {
                // Keep only last 24 hours of data
                const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                const beforeCount = this.populationHistory.length;
                this.populationHistory = this.populationHistory.filter(entry => entry.timestamp > oneDayAgo);
                const afterCount = this.populationHistory.length;
                
                localStorage.setItem(POPULATION_HISTORY_KEY, JSON.stringify(this.populationHistory));
                
                if (beforeCount !== afterCount) {
                    console.log(`Population history cleaned: ${beforeCount} -> ${afterCount} entries`);
                }
            } catch (e) {
                console.error('Failed to save population history:', e);
            }
        }

        getActualPopulationFromUI() {
            // Method 1: Look for "X/Y" pattern (current/max) and take the first number
            try {
                const allText = document.body.textContent;
                const ratioMatches = allText.match(/(\d+)\/(\d+)/g);
                if (ratioMatches) {
                    for (const ratio of ratioMatches) {
                        const [current, max] = ratio.split('/').map(n => parseInt(n));
                        // Look for reasonable server population ratios
                        if (current >= 0 && current <= max && max >= 50 && max <= 500) {
                            console.log(`Found population ratio: ${current}/${max}`);
                            return current;
                        }
                    }
                }
            } catch (e) {
                // Continue
            }
            
            // Method 2: Count actual player rows in the table (most reliable)
            try {
                const playerRows = document.querySelectorAll('table tbody tr');
                let visibleRows = 0;
                playerRows.forEach(row => {
                    const nameCell = row.querySelector('td:first-child a');
                    if (nameCell && nameCell.textContent.trim() && nameCell.href && nameCell.href.includes('/players/')) {
                        visibleRows++;
                    }
                });
                
                if (visibleRows > 0) {
                    console.log(`Counted ${visibleRows} player rows in table`);
                    return visibleRows;
                }
            } catch (e) {
                // Continue
            }
            
            // Method 3: Look for population in page title
            try {
                const title = document.title;
                const match = title.match(/(\d+)\/(\d+)/);
                if (match) {
                    const current = parseInt(match[1]);
                    const max = parseInt(match[2]);
                    if (current <= max && max >= 50 && max <= 500) {
                        console.log(`Found population in title: ${current}/${max}`);
                        return current;
                    }
                }
            } catch (e) {
                // Continue
            }
            
            // Method 4: Look for specific BattleMetrics elements (be very selective)
            const specificSelectors = [
                'span[data-testid="server-population"]',
                '.server-population .current',
                '[class*="population"] .current'
            ];
            
            for (const selector of specificSelectors) {
                try {
                    const element = document.querySelector(selector);
                    if (element) {
                        const text = element.textContent.trim();
                        const match = text.match(/^(\d+)$/);
                        if (match) {
                            const count = parseInt(match[1]);
                            if (count >= 0 && count <= 200) { // Be conservative
                                console.log(`Found population via specific selector "${selector}": ${count}`);
                                return count;
                            }
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }
            
            console.log('Could not find actual population from UI, will use tracked count');
            return null; // Could not find actual population
        }

        recordPopulation(trackedCount) {
            const now = Date.now();
            
            // Try to get the actual population from BattleMetrics UI
            const actualPopulation = this.getActualPopulationFromUI();
            
            // Use actual population if available AND it makes sense, otherwise fall back to tracked count
            let populationToRecord = trackedCount;
            
            if (actualPopulation !== null) {
                // Only use actual population if it's reasonably close to tracked count
                // This prevents using wrong numbers like server capacity
                const difference = Math.abs(actualPopulation - trackedCount);
                
                if (difference <= 5 || trackedCount === 0) {
                    // Small difference or first run - use actual
                    populationToRecord = actualPopulation;
                    
                    if (difference > 0) {
                        console.log(`Population sync: Tracked=${trackedCount}, Actual=${actualPopulation}, Using actual (diff: ${difference})`);
                    }
                    
                    // Update our tracked count to match actual
                    currentPopulation = actualPopulation;
                } else {
                    // Large difference - probably wrong UI element, stick with tracked
                    console.log(`Population mismatch too large: Tracked=${trackedCount}, UI=${actualPopulation}, Using tracked (diff: ${difference})`);
                    populationToRecord = trackedCount;
                }
            } else {
                console.log(`Using tracked population: ${trackedCount} (could not find actual UI count)`);
            }
            
            const entry = {
                timestamp: now,
                count: populationToRecord,
                trackedCount: trackedCount, // Keep for debugging
                actualCount: actualPopulation, // Keep for debugging
                date: new Date(now).toLocaleString()
            };
            
            this.populationHistory.push(entry);
            
            // Log for debugging
            console.log(`Population recorded: ${populationToRecord} players at ${entry.date}`);
            
            // Calculate last hour change and prediction
            this.calculatePopulationStats();
            this.savePopulationHistory();
            this.updatePopulationDisplay();
        }

        loadLastPlayerState() {
            try {
                const saved = localStorage.getItem(LAST_PLAYER_STATE_KEY);
                if (saved) {
                    const state = JSON.parse(saved);
                    // Only use state if it's recent (within last 5 minutes)
                    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                    if (state.timestamp > fiveMinutesAgo) {
                        return new Map(state.players);
                    }
                }
                return new Map();
            } catch (e) {
                console.error('Failed to load last player state:', e);
                return new Map();
            }
        }

        saveLastPlayerState() {
            try {
                const state = {
                    timestamp: Date.now(),
                    players: Array.from(this.currentPlayers.entries())
                };
                localStorage.setItem(LAST_PLAYER_STATE_KEY, JSON.stringify(state));
            } catch (e) {
                console.error('Failed to save last player state:', e);
            }
        }

        loadPlayerNotes() {
            try {
                return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
            } catch {
                return {};
            }
        }

        savePlayerNotes() {
            localStorage.setItem(NOTES_KEY, JSON.stringify(this.playerNotes));
        }

        setPlayerNote(playerId, text) {
            if (!text || !text.trim()) {
                delete this.playerNotes[playerId];
            } else {
                this.playerNotes[playerId] = { text: text.trim(), updatedAt: Date.now() };
            }
            this.savePlayerNotes();
        }

        // ── In-memory set of alt pairs already logged this session (avoids duplicates)
        // Format: "minId|maxId"
        _loggedAltPairs = new Set();

        // Set of every playerId that appears in at least one detected alt pair.
        // Used to conditionally show the Alts button in the UI without re-running detectAlts.
        detectedAltPlayers = new Set();

        logAltDetection(targetId, targetName, candidateId, candidateName, matchCount, coverage) {
            // Suppress duplicate pair logs within the same page session
            const key = [targetId, candidateId].sort().join('|');
            if (this._loggedAltPairs.has(key)) return;
            this._loggedAltPairs.add(key);

            // Mark both sides so the UI can show the button without re-running the scan
            this.detectedAltPlayers.add(targetId);
            this.detectedAltPlayers.add(candidateId);

            const now = Date.now();
            const d = new Date(now);
            const entry = {
                timestamp: now,
                utcISO: d.toISOString(),
                dayOfWeek: d.getDay(),
                hourUTC: d.getUTCHours(),
                hourLocal: d.getHours(),
                playerName: targetName,
                playerId: targetId,
                altPlayerId: candidateId,
                altPlayerName: candidateName,
                altMatches: matchCount,
                altCoverage: coverage,
                action: 'alt_detected',
                serverName: currentServerName,
                serverID: currentServerID,
                time: d.toLocaleString()
            };
            this.activityLog.push(entry);
            this.saveActivityLog();

            clearTimeout(this.activityUpdateTimeout);
            this.activityUpdateTimeout = setTimeout(() => {
                this.updateActivityDisplay();
            }, 500);
        }

        calculatePopulationStats() {
            const now = Date.now();
            const twoHoursAgo = now - (2 * 60 * 60 * 1000);
            const oneHourAgo  = now - (60 * 60 * 1000);

            // Get current population
            const actualPopulation = this.getActualPopulationFromUI();
            if (actualPopulation !== null) {
                currentPopulation = actualPopulation;
            } else {
                currentPopulation = this.currentPlayers.size;
            }

            const recentHistory = this.populationHistory.filter(e => e.timestamp >= twoHoursAgo);

            if (recentHistory.length < 2) {
                lastHourChange      = 0;
                predictedNextHour   = currentPopulation;
                return;
            }

            // ── Last-hour change ────────────────────────────────────────────
            const oneHourEntry = recentHistory
                .filter(e => Math.abs(e.timestamp - oneHourAgo) < 10 * 60 * 1000)
                .sort((a, b) => Math.abs(a.timestamp - oneHourAgo) - Math.abs(b.timestamp - oneHourAgo))[0];
            lastHourChange = oneHourEntry ? currentPopulation - oneHourEntry.count : 0;

            // ── Linear regression over all 2-hour data points ───────────────
            // Include the live reading as the most recent point.
            const points = [...recentHistory, { timestamp: now, count: currentPopulation }];

            // Express time in hours from the oldest point (keeps numbers small)
            const t0   = points[0].timestamp;
            const toHr = ms => (ms - t0) / 3600000;
            const xs   = points.map(p => toHr(p.timestamp));
            const ys   = points.map(p => p.count);
            const n    = points.length;

            const sumX  = xs.reduce((s, x) => s + x, 0);
            const sumY  = ys.reduce((s, y) => s + y, 0);
            const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
            const sumXX = xs.reduce((s, x) => s + x * x, 0);
            const denom = n * sumXX - sumX * sumX;

            // slope = players/hour from the regression line
            const slope     = Math.abs(denom) > 0.0001 ? (n * sumXY - sumX * sumY) / denom : 0;
            const intercept = (sumY - slope * sumX) / n;

            // Raw prediction: where the regression line sits 1 hour from now
            const currentX     = toHr(now);
            const rawPredicted = intercept + slope * (currentX + 1);
            const rawDelta     = rawPredicted - currentPopulation;

            // ── Damping ─────────────────────────────────────────────────────
            // Pull the projected change 50% back toward 0 so short-term spikes
            // don't get carried all the way forward.
            const dampedDelta = rawDelta * 0.5;

            // Hard-cap the change at ±30% of current population (realistic hourly swing).
            // Floor the cap at ±8 so small servers still get a meaningful range.
            const maxSwing    = Math.max(8, Math.round(currentPopulation * 0.30));
            const clampedDelta = Math.max(-maxSwing, Math.min(maxSwing, dampedDelta));

            predictedNextHour = Math.max(0, Math.round(currentPopulation + clampedDelta));
        }

        updatePopulationDisplay() {
            const popDisplay = document.getElementById('population-stats');
            if (!popDisplay) return;
            
            const changeColor = lastHourChange > 0 ? '#28a745' : lastHourChange < 0 ? '#dc3545' : '#6c757d';
            const changeSymbol = lastHourChange > 0 ? '+' : '';
            
            const lastUpdated = new Date().toLocaleTimeString();
            const historyCount = this.populationHistory.length;
            const oldestEntry = this.populationHistory.length > 0 ? 
                new Date(this.populationHistory[0].timestamp).toLocaleTimeString() : 'None';

            // Unique players detected per time window (distinct playerIds in activity log)
            const _now = Date.now();
            const uniqueIn = (ms) => {
                const cutoff = _now - ms;
                const ids = new Set();
                for (const e of this.activityLog) {
                    if (e.timestamp >= cutoff && e.playerId) ids.add(e.playerId);
                }
                return ids.size;
            };
            const u1h  = uniqueIn(1  * 60 * 60 * 1000);
            const u3h  = uniqueIn(3  * 60 * 60 * 1000);
            const u6h  = uniqueIn(6  * 60 * 60 * 1000);
            
            popDisplay.innerHTML = `
                <div style="background: rgba(111, 66, 193, 0.1); padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div style="color: #6f42c1; font-weight: bold; font-size: 14px;">
                            Population Stats
                        </div>
                        <div style="color: #6c757d; font-size: 10px;">
                            Updated: ${lastUpdated}
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <div style="color: white; font-size: 18px; font-weight: bold;">
                                ${currentPopulation} players
                            </div>
                            <div style="color: ${changeColor}; font-size: 12px;">
                                ${changeSymbol}${lastHourChange} in the past hour
                            </div>
                            <div style="color: #6c757d; font-size: 10px;">
                                Data points: ${historyCount} | Oldest: ${oldestEntry}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="color: #17a2b8; font-size: 12px;">
                                Predicted next hour:
                            </div>
                            <div style="color: #17a2b8; font-size: 14px; font-weight: bold;">
                                ${predictedNextHour} players
                            </div>
                        </div>
                    </div>
                    <div style="border-top: 1px solid rgba(111,66,193,0.3); padding-top: 7px;">
                        <div style="color: #6f42c1; font-size: 11px; font-weight: bold; margin-bottom: 5px;">Unique Players</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; text-align: center;">
                            <div style="background: rgba(255,255,255,0.05); border-radius: 3px; padding: 4px 2px;">
                                <div style="color: white; font-size: 14px; font-weight: bold;">${u1h}</div>
                                <div style="color: #6c757d; font-size: 9px;">1h</div>
                            </div>
                            <div style="background: rgba(255,255,255,0.05); border-radius: 3px; padding: 4px 2px;">
                                <div style="color: white; font-size: 14px; font-weight: bold;">${u3h}</div>
                                <div style="color: #6c757d; font-size: 9px;">3h</div>
                            </div>
                            <div style="background: rgba(255,255,255,0.05); border-radius: 3px; padding: 4px 2px;">
                                <div style="color: white; font-size: 14px; font-weight: bold;">${u6h}</div>
                                <div style="color: #6c757d; font-size: 9px;">6h</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        refreshTimestamps() {
            // Refresh database display timestamps
            this.updateDatabaseDisplay();
            
            // Refresh activity log timestamps
            this.updateActivityDisplay();
            
            // Refresh recent alerts timestamps
            this.updateRecentAlertsDisplay();
        }

        addToDatabase(playerId, playerName, skipDisplayUpdate = false) {
            const now = Date.now();
            // Always ensure a record exists for the player and update timestamps
            try {
                const existing = this.playerDatabase[playerId];
                if (existing) {
                    // If name changed, record previous name history (avoid duplicates)
                        if (!namesEqual(existing.currentName, playerName)) {
                            // Silently resolve "Unknown Player" placeholder set by manual add —
                            // don't log a name-change event and don't push it to previousNames
                            const isPlaceholder = existing.manuallyAdded && existing.currentName === 'Unknown Player';
                            if (isPlaceholder) {
                                existing.currentName = playerName;
                                if (!existing.originalName || existing.originalName === 'Unknown Player') {
                                    existing.originalName = playerName;
                                }
                                existing.manuallyAdded = false; // resolved
                            } else {
                                existing.previousNames = existing.previousNames || [];
                                const existingNormalized = normalizeName(existing.currentName);
                                // Avoid duplicate previous names (case/whitespace-insensitive)
                                // Support both legacy plain strings and new timestamped objects
                                const nameStr = e => (typeof e === 'string' ? e : (e && e.name) || '');
                                if (existing.currentName && !existing.previousNames.some(n => normalizeName(nameStr(n)).toLowerCase() === existingNormalized.toLowerCase())) {
                                    existing.previousNames.push({ name: existing.currentName, changedAt: now, changedAtISO: new Date(now).toISOString() });
                                }
                                const oldName = existing.currentName;
                                existing.currentName = playerName;
                                existing.nameChanged = true;
                                existing.lastNameChange = now;
                                // Record name change in activity log (so it appears in All Activity)
                                try {
                                    this.logNameChange(playerId, oldName, playerName);
                                } catch (e) {
                                    console.warn('Failed to log name change', e);
                                }
                            }
                    }
                    existing.seenCount = (existing.seenCount || 0) + 1;
                    existing.lastSeen = now;
                } else {
                    // New player - always add to database
                    this.playerDatabase[playerId] = {
                        id: playerId,
                        currentName: playerName,
                        originalName: playerName,
                        firstSeen: now,
                        lastSeen: now,
                        nameChanged: false,
                        previousNames: [],
                        seenCount: 1
                    };
                }

                // Persist database (debounced inside savePlayerDatabase)
                this.savePlayerDatabase();

                // Skip display updates during batch operations (initial load)
                if (!skipDisplayUpdate) {
                    // Debounce database display updates
                    clearTimeout(this.databaseUpdateTimeout);
                    this.databaseUpdateTimeout = setTimeout(() => {
                        this.updateDatabaseDisplay();
                    }, 1000);
                }
            } catch (err) {
                console.error('addToDatabase failed for', playerId, playerName, err);
            }
        }

        updateDatabaseDisplay() {
            const databaseDiv = document.getElementById('player-database-list');
            if (!databaseDiv) return;

            // Don't update if user is actively searching - preserve search results
            if (activeDatabaseSearch && activeDatabaseSearch.length >= 2) {
                return;
            }

            // Only show if database section is visible to save performance
            const databaseSection = document.getElementById('player-database-list').parentElement;
            if (databaseSection && databaseSection.style.display === 'none') return;

            // Respect the active filter — if one is set, delegate to filterDatabase
            // so background updates don't blow away the user's chosen filter.
            const filterSelect = document.getElementById('database-filter');
            const activeFilter = filterSelect ? filterSelect.value : 'all';
            if (activeFilter && activeFilter !== 'all') {
                window.filterDatabase(activeFilter);
                return;
            }

            // Sort by online status first, then by last seen
            const players = Object.values(this.playerDatabase)
                .sort((a, b) => {
                    const aOnline = this.currentPlayers.has(a.id);
                    const bOnline = this.currentPlayers.has(b.id);
                    
                    // Online players first
                    if (aOnline && !bOnline) return -1;
                    if (!aOnline && bOnline) return 1;
                    
                    // Then by last seen
                    return b.lastSeen - a.lastSeen;
                }); // Show all players - no limit
            
            if (players.length === 0) {
                databaseDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic;">No players in database</div>';
                return;
            }

            this.renderDatabasePlayers(players, databaseDiv);
        }

        renderDatabasePlayers(players, container) {
            let databaseHTML = '';
            players.forEach(player => {
                const lastSeenTime = toRelativeTime(player.lastSeen);
                const hasAlert = this.alerts[player.id];
                const isSaved = this.savedPlayers[player.id];
                const isOnline = this.currentPlayers.has(player.id);
                const note = this.playerNotes && this.playerNotes[player.id];
                const hasNote = note && note.text;
                
                let nameDisplay = player.currentName;
                // Support both legacy strings and new timestamped objects in previousNames
                const _nameStr = e => (typeof e === 'string' ? e : (e && e.name) || '');
                if (player.nameChanged && player.previousNames.length > 0) {
                    nameDisplay = `${player.currentName} (was: ${_nameStr(player.previousNames[player.previousNames.length - 1])})`;
                }
                
                const onlineStatus = isOnline ? 
                    '<span style="color: #28a745; font-weight: bold;">[ONLINE]</span>' : 
                    '<span style="color: #dc3545; font-weight: bold;">[OFFLINE]</span>';
                
                databaseHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 5px; border-radius: 5px; background: rgba(111, 66, 193, 0.1); border-left: 3px solid ${isOnline ? '#28a745' : '#6f42c1'};">
                        <div style="flex: 1;">
                            <div style="color: #6f42c1; font-weight: bold; font-size: 12px;">
                                ${nameDisplay} ${onlineStatus}
                                ${hasAlert ? '<span style="color: #ffc107; margin-left: 5px;">[ALERT]</span>' : ''}
                                ${isSaved ? '<span style="color: #28a745; margin-left: 5px;">[SAVED]</span>' : ''}
                                ${hasNote ? '<span style="color: #17a2b8; margin-left: 5px;">[NOTE]</span>' : ''}
                            </div>
                            <div style="opacity: 0.7; font-size: 10px;">
                                ID: ${player.id} | Last seen: ${lastSeenTime} | Detections: ${player.seenCount || 1}×
                            </div>
                            ${player.nameChanged ? '<div style="color: #ffc107; font-size: 10px;">⚠ Name changed</div>' : ''}
                            ${hasNote ? `<div style="color: #17a2b8; font-size: 10px; margin-top: 2px; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;">📝 ${note.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}
                        </div>
                        <div style="display: flex; gap: 3px; flex-wrap: wrap;">
                            <button onclick="window.open('https://www.battlemetrics.com/players/${player.id}', '_blank')" 
                                    style="background: #17a2b8; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                    title="View Profile">
                                Profile
                            </button>
                            <button onclick="togglePlayerAlert('${player.currentName}', '${player.id}')" 
                                    style="background: ${hasAlert ? '#dc3545' : '#28a745'}; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                    title="${hasAlert ? 'Remove Alert' : 'Add Alert'}">
                                ${hasAlert ? 'Remove' : 'Add Alert'}
                            </button>
                            <button onclick="savePlayer('${player.currentName}', '${player.id}')" 
                                    style="background: ${isSaved ? '#6c757d' : '#28a745'}; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                    title="${isSaved ? 'Already Saved' : 'Save Player'}" ${isSaved ? 'disabled' : ''}>
                                ${isSaved ? 'Saved' : 'Save'}
                            </button>
                            <button onclick="showPlayerNote('${player.id}')"
                                    style="background: ${hasNote ? '#17a2b8' : '#495057'}; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                    title="${hasNote ? 'Edit Note' : 'Add Note'}">
                                Notes
                            </button>
                            ${this.detectedAltPlayers.has(player.id) ? `<button onclick="showPlayerAlts('${player.id}')" style="background:#856404;color:white;border:none;padding:2px 5px;border-radius:3px;cursor:pointer;font-size:9px;" title="Possible alts detected">Alts</button>` : ''}
                            <button onclick="showNameHistory('${player.id}')"
                                    style="background: #6f42c1; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                    title="View session history &amp; names">
                                History
                            </button>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = databaseHTML;
        }

        searchDatabase(query) {
            if (!query || query.length < 2) return [];
            
            const lowerQuery = query.toLowerCase();
            const results = [];
            
            // Use for...of loop for better performance than filter + multiple array operations
            for (const player of Object.values(this.playerDatabase)) {
                // Early exit conditions for better performance
                if (player.currentName.toLowerCase().includes(lowerQuery) ||
                    player.originalName.toLowerCase().includes(lowerQuery) ||
                    player.id.includes(query)) {
                    results.push(player);
                    continue;
                }
                
                // Only check previous names if we haven't found a match yet
                if (player.previousNames && player.previousNames.length > 0) {
                    for (const entry of player.previousNames) {
                        const n = typeof entry === 'string' ? entry : (entry && entry.name) || '';
                        if (n.toLowerCase().includes(lowerQuery)) {
                            results.push(player);
                            break; // Found match, no need to check other previous names
                        }
                    }
                }
                
                // Limit results to prevent UI lag with large datasets
                if (results.length >= 100) {
                    break;
                }
            }
            
            return results;
        }

        addAlert(playerName, playerId, alertType = 'both') {
            try {
                console.log('[Alert System] Adding alert for:', playerName, playerId);
                this.alerts[playerId] = {
                    name: playerName,
                    type: alertType, // 'join', 'leave', 'both'
                    added: Date.now()
                };
                this.saveAlerts();
                console.log('[Alert System] Alert added. Total alerts:', Object.keys(this.alerts).length);
                console.log('[Alert System] Current alerts:', this.alerts);
                
                // Immediately update the display
                console.log('[Alert System] Calling updateAlertDisplay...');
                this.updateAlertDisplay();
                
                console.log('[Alert System] Calling updateAlertCount...');
                this.updateAlertCount();
                
                // Ensure Alert Players section is expanded when alert is added
                console.log('[Alert System] Calling expandAlertSection...');
                this.expandAlertSection();
                
                console.log('[Alert System] addAlert completed successfully');
            } catch (error) {
                console.error('[Alert System] Error in addAlert:', error);
            }
        }

        removeAlert(playerId) {
            console.log('[Alert System] Removing alert for:', playerId);
            delete this.alerts[playerId];
            this.saveAlerts();
            console.log('[Alert System] Alert removed. Total alerts:', Object.keys(this.alerts).length);
            
            // Immediately update the display
            this.updateAlertDisplay();
            this.updateAlertCount();
        }

        logActivity(playerName, playerId, action) {
            const now = Date.now();
            const d = new Date(now);
            const entry = {
                timestamp: now,
                utcISO: d.toISOString(),
                dayOfWeek: d.getDay(),        // 0=Sun … 6=Sat
                hourUTC: d.getUTCHours(),     // 0-23 UTC hour
                hourLocal: d.getHours(),      // 0-23 local hour
                playerName,
                playerId,
                action, // 'joined' or 'left'
                serverName: currentServerName,
                serverID: currentServerID,
                time: d.toLocaleString()
            };
            this.activityLog.push(entry);
            this.saveActivityLog();

            // Check if we should alert for this player
            const alert = this.alerts[playerId];
            if (alert && (alert.type === 'both' || alert.type === action.replace('ed', ''))) {
                this.showAlert(playerName, action);
                this.addRecentAlert(playerName, playerId, action);
                if (this.soundEnabled) {
                    this.playAlertSound();
                }
            }

            // After every join/leave, run a quick alts scan for this player so
            // any newly-detectable handoff pairs get logged to the activity feed.
            // – On 'joined': catches the real-time B→A handoff (B left, A just joined).
            // – On 'left':   catches any A→B pattern that has built up over prior sessions.
            if (action === 'joined' || action === 'left') {
                setTimeout(() => {
                    try {
                        const alts = detectAlts(playerId);
                        for (const alt of alts) {
                            const altName = alt.player.currentName || `Player ${alt.playerId}`;
                            this.logAltDetection(playerId, playerName, alt.playerId, altName, alt.matches, alt.coverage);
                        }
                    } catch (_) { /* detectAlts not yet defined on very first event */ }
                }, 0);
            }

            // Debounce activity display updates to reduce lag
            clearTimeout(this.activityUpdateTimeout);
            this.activityUpdateTimeout = setTimeout(() => {
                this.updateActivityDisplay();
            }, 500);
        }

        // Log a name change event with old and new names
        logNameChange(playerId, oldName, newName) {
            const now = Date.now();
            const d = new Date(now);
            const entry = {
                timestamp: now,
                utcISO: d.toISOString(),
                dayOfWeek: d.getDay(),
                hourUTC: d.getUTCHours(),
                hourLocal: d.getHours(),
                playerId,
                playerName: newName,
                oldName: oldName,
                action: 'name_changed',
                serverName: currentServerName,
                serverID: currentServerID,
                time: d.toLocaleString()
            };
            this.activityLog.push(entry);
            this.saveActivityLog();

            // Debounce activity display updates to reduce lag
            clearTimeout(this.activityUpdateTimeout);
            this.activityUpdateTimeout = setTimeout(() => {
                this.updateActivityDisplay();
            }, 300);
        }

        showAlert(playerName, action) {
            const alertDiv = document.createElement('div');
            alertDiv.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: ${action === 'joined' ? '#28a745' : '#dc3545'};
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                z-index: 10001;
                font-size: 14px;
                font-weight: bold;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                animation: slideDown 0.3s ease-out;
            `;
            
            const actionText = action === 'joined' ? 'joined the game' : action === 'left' ? 'left the game' : action === 'name_changed' ? 'changed name' : `${action} the game`;

            alertDiv.innerHTML = `
                <div>${playerName} ${actionText}</div>
                <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">${toRelativeTime(Date.now())}</div>
            `;

            // Add CSS animation if not exists
            if (!document.getElementById('alert-animations')) {
                const style = document.createElement('style');
                style.id = 'alert-animations';
                style.textContent = `
                    @keyframes slideDown {
                        from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                        to { transform: translateX(-50%) translateY(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(alertDiv);

            setTimeout(() => {
                alertDiv.style.animation = 'slideDown 0.3s ease-out reverse';
                setTimeout(() => alertDiv.remove(), 300);
            }, 4000);
        }

        async playAlertSound() {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // Resume audio context if suspended (required by modern browsers)
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
                
                const choice = (this.settings && this.settings.soundChoice) ? this.settings.soundChoice : 'osc_sine';
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                // Default params
                let now = audioContext.currentTime;
                gainNode.gain.setValueAtTime(0.0, now);

                if (choice.startsWith('osc_')) {
                    // Simple oscillator types
                    const type = choice.split('_')[1] || 'sine';
                    oscillator.type = type;
                    oscillator.frequency.setValueAtTime(880, now);
                    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                    oscillator.start(now);
                    oscillator.stop(now + 0.45);
                } else if (choice === 'short_burst') {
                    // Two short beeps
                    oscillator.type = 'square';
                    oscillator.frequency.setValueAtTime(880, now);
                    gainNode.gain.linearRampToValueAtTime(0.35, now + 0.005);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                    oscillator.start(now);
                    oscillator.stop(now + 0.12);
                    // second beep
                    const osc2 = audioContext.createOscillator();
                    const gain2 = audioContext.createGain();
                    osc2.type = 'square';
                    osc2.frequency.setValueAtTime(660, now + 0.18);
                    gain2.gain.setValueAtTime(0.0, now + 0.18);
                    osc2.connect(gain2);
                    gain2.connect(audioContext.destination);
                    gain2.linearRampToValueAtTime(0.25, now + 0.185);
                    gain2.exponentialRampToValueAtTime(0.001, now + 0.35);
                    osc2.start(now + 0.18);
                    osc2.stop(now + 0.35);
                } else if (choice === 'long_wobble') {
                    // Frequency modulation wobble
                    oscillator.type = 'sine';
                    const mod = audioContext.createOscillator();
                    const modGain = audioContext.createGain();
                    mod.frequency.setValueAtTime(4, now);
                    modGain.gain.setValueAtTime(40, now);
                    mod.connect(modGain);
                    modGain.connect(oscillator.frequency);

                    oscillator.frequency.setValueAtTime(720, now);
                    gainNode.gain.linearRampToValueAtTime(0.25, now + 0.02);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
                    oscillator.start(now);
                    mod.start(now);
                    oscillator.stop(now + 1.4);
                    mod.stop(now + 1.4);
                } else if (choice === 'triple_ping') {
                    // Three ascending quick pings
                    const freqs = [660, 880, 1100];
                    const offsets = [0, 0.18, 0.36];
                    // Use the pre-created oscillator/gain for the first ping
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(freqs[0], now + offsets[0]);
                    gainNode.gain.linearRampToValueAtTime(0.3, now + offsets[0] + 0.01);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, now + offsets[0] + 0.14);
                    oscillator.start(now + offsets[0]);
                    oscillator.stop(now + offsets[0] + 0.14);
                    for (let i = 1; i < 3; i++) {
                        const pOsc = audioContext.createOscillator();
                        const pGain = audioContext.createGain();
                        pOsc.type = 'sine';
                        pOsc.frequency.setValueAtTime(freqs[i], now + offsets[i]);
                        pGain.gain.setValueAtTime(0.0, now + offsets[i]);
                        pGain.gain.linearRampToValueAtTime(0.3, now + offsets[i] + 0.01);
                        pGain.gain.exponentialRampToValueAtTime(0.001, now + offsets[i] + 0.14);
                        pOsc.connect(pGain);
                        pGain.connect(audioContext.destination);
                        pOsc.start(now + offsets[i]);
                        pOsc.stop(now + offsets[i] + 0.14);
                    }
                } else if (choice === 'deep_thud') {
                    // Low bass punch
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(120, now);
                    oscillator.frequency.exponentialRampToValueAtTime(40, now + 0.25);
                    gainNode.gain.linearRampToValueAtTime(0.5, now + 0.005);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                    oscillator.start(now);
                    oscillator.stop(now + 0.25);
                    // Add a mid-layer click for presence
                    const clickOsc = audioContext.createOscillator();
                    const clickGain = audioContext.createGain();
                    clickOsc.type = 'triangle';
                    clickOsc.frequency.setValueAtTime(300, now);
                    clickGain.gain.setValueAtTime(0.0, now);
                    clickGain.gain.linearRampToValueAtTime(0.2, now + 0.003);
                    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                    clickOsc.connect(clickGain);
                    clickGain.connect(audioContext.destination);
                    clickOsc.start(now);
                    clickOsc.stop(now + 0.08);
                } else if (choice === 'rising_sweep') {
                    // Frequency sweep from low to high
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(200, now);
                    oscillator.frequency.exponentialRampToValueAtTime(1400, now + 0.55);
                    gainNode.gain.linearRampToValueAtTime(0.28, now + 0.02);
                    gainNode.gain.setValueAtTime(0.28, now + 0.45);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
                    oscillator.start(now);
                    oscillator.stop(now + 0.6);
                } else {
                    // Fallback to a short sine
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(800, now);
                    gainNode.gain.linearRampToValueAtTime(0.25, now + 0.01);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                    oscillator.start(now);
                    oscillator.stop(now + 0.5);
                }

                console.log('Alert sound played successfully (choice:', choice, ')');
            } catch (e) {
                console.log('Could not play alert sound:', e);
                // Fallback: try to use a simple beep
                try {
                    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
                    audio.volume = 0.3;
                    audio.play();
                } catch (fallbackError) {
                    console.log('Fallback sound also failed:', fallbackError);
                }
            }
        }

        startMonitoring() {
            if (this.isMonitoring) return;
            
            this.isMonitoring = true;
            
            // Show loading indicator
            this.showLoadingIndicator();
            
            // Initial player list with optimized loading
            this.updatePlayerList(true); // Pass true for initial load
            
            // Calculate initial population stats from loaded history
            this.calculatePopulationStats();
            
            // Initial population display
            this.updatePopulationDisplay();
            
            // Monitor every 10 seconds to reduce load
            let syncCounter = 0;
            monitoringInterval = setInterval(() => {
                this.checkPlayerChanges();
                
                // Every 30 cycles (5 minutes), sync population to prevent drift
                syncCounter++;
                if (syncCounter >= 30) {
                    this.syncPopulationCount();
                    syncCounter = 0;
                }
            }, 10000);
            
            // Update population stats every minute for better predictions
            populationStatsInterval = setInterval(() => {
                this.calculatePopulationStats();
                this.updatePopulationDisplay();
            }, 60000); // 1 minute
            
            // Refresh timestamps every 30 seconds to keep "X minutes ago" current
            timestampRefreshInterval = setInterval(() => {
                this.refreshTimestamps();
            }, 30000); // 30 seconds
            
            console.log('Started monitoring server:', currentServerID);
        }

        stopMonitoring() {
            this.isMonitoring = false;
            if (monitoringInterval) {
                clearInterval(monitoringInterval);
                monitoringInterval = null;
            }
            if (populationStatsInterval) {
                clearInterval(populationStatsInterval);
                populationStatsInterval = null;
            }
            if (timestampRefreshInterval) {
                clearInterval(timestampRefreshInterval);
                timestampRefreshInterval = null;
            }
            console.log('Stopped monitoring');
        }

        updatePlayerList(isInitialLoad = false) {
            try {
                const playerRows = document.querySelectorAll('table tbody tr');
                const newPlayerList = new Map();
                
                // Batch process players to avoid blocking UI
                const batchSize = isInitialLoad ? 50 : playerRows.length; // Process in smaller batches on initial load
                let currentBatch = 0;
                
                const processBatch = () => {
                    const startIndex = currentBatch * batchSize;
                    const endIndex = Math.min(startIndex + batchSize, playerRows.length);
                    
                    // Process current batch
                    for (let i = startIndex; i < endIndex; i++) {
                        const row = playerRows[i];
                        const nameCell = row.querySelector('td:first-child a');
                        if (nameCell) {
                            const playerName = nameCell.textContent.trim();
                            const playerLink = nameCell.href;
                            const playerId = playerLink.split('/players/')[1]?.split('/')[0];
                            
                            if (playerId && playerName) {
                                // Try to extract session duration from a time element (BattleMetrics shows durations as PT...)
                                let sessionMs = null;
                                try {
                                    const timeEl = row.querySelector('time[datetime]');
                                    if (timeEl) {
                                        const dt = timeEl.getAttribute('datetime');
                                        sessionMs = parseISODurationToMs(dt);
                                    }
                                } catch (e) {
                                    console.warn('Failed to parse session duration', e);
                                }

                                newPlayerList.set(playerId, {
                                    name: playerName,
                                    id: playerId,
                                    lastSeen: Date.now(),
                                    sessionMs: sessionMs
                                });

                                // Add to database (batched, skip display updates during initial load)
                                this.addToDatabase(playerId, playerName, isInitialLoad);
                            }
                        }
                    }
                    
                    currentBatch++;
                    
                    // If there are more batches, schedule next batch
                    if (endIndex < playerRows.length) {
                        // Use requestAnimationFrame for smooth processing
                        requestAnimationFrame(processBatch);
                        return;
                    }
                    
                    // All batches processed, now handle the rest
                    this.finishPlayerListUpdate(newPlayerList, isInitialLoad);
                };
                
                // Start processing
                if (isInitialLoad && playerRows.length > batchSize) {
                    console.log(`Processing ${playerRows.length} players in batches of ${batchSize}...`);
                    processBatch();
                } else {
                    // Process all at once for smaller lists or regular updates
                    playerRows.forEach(row => {
                        const nameCell = row.querySelector('td:first-child a');
                        if (nameCell) {
                            const playerName = nameCell.textContent.trim();
                            const playerLink = nameCell.href;
                            const playerId = playerLink.split('/players/')[1]?.split('/')[0];
                            
                            if (playerId && playerName) {
                                // Try to extract session duration from a time element in the row
                                let sessionMs = null;
                                try {
                                    const timeEl = row.querySelector('time[datetime]');
                                    if (timeEl) {
                                        const dt = timeEl.getAttribute('datetime');
                                        sessionMs = parseISODurationToMs(dt);
                                    }
                                } catch (e) {
                                    console.warn('Failed to parse session duration', e);
                                }

                                newPlayerList.set(playerId, {
                                    name: playerName,
                                    id: playerId,
                                    lastSeen: Date.now(),
                                    sessionMs: sessionMs
                                });

                                // Add to database
                                this.addToDatabase(playerId, playerName, isInitialLoad);
                            }
                        }
                    });
                    
                    this.finishPlayerListUpdate(newPlayerList, isInitialLoad);
                }
            } catch (e) {
                console.error('Error updating player list:', e);
            }
        }
        
        finishPlayerListUpdate(newPlayerList, isInitialLoad) {
            try {
                // Check for changes
                let comparisonList = lastPlayerList;
                
                // On first run, use last saved state if available
                if (lastPlayerList.size === 0 && this.lastPlayerState.size > 0) {
                    comparisonList = this.lastPlayerState;
                    console.log('Using last saved player state for comparison');
                }
                
                if (comparisonList.size > 0) {
                    // Check for new joins
                    newPlayerList.forEach((player, playerId) => {
                        if (!comparisonList.has(playerId)) {
                            this.logActivity(player.name, playerId, 'joined');
                        }
                    });

                    // Check for leaves
                    comparisonList.forEach((player, playerId) => {
                        if (!newPlayerList.has(playerId)) {
                            // Use player name from comparison list if available
                            const playerName = player.name || player.playerName || `Player ${playerId}`;
                            this.logActivity(playerName, playerId, 'left');
                        }
                    });
                }

                lastPlayerList = new Map(newPlayerList);
                this.currentPlayers = new Map(newPlayerList);
                
                // Save current state for next page load
                this.saveLastPlayerState();
                
                // Record population for tracking
                this.recordPopulation(newPlayerList.size);
                
                // Debounce display updates during initial load to prevent lag
                if (isInitialLoad) {
                    this.scheduleDisplayUpdates();
                } else {
                    // Update all displays when player status changes (regular updates)
                    this.updatePlayerDisplay();
                    this.updateAlertDisplay();
                    this.updateSavedPlayersDisplay();
                }
                
                console.log(`Player list updated: ${newPlayerList.size} players processed`);
            } catch (e) {
                console.error('Error finishing player list update:', e);
            }
        }
        
        scheduleDisplayUpdates() {
            // Clear any existing update timers
            clearTimeout(this.displayUpdateTimeout);
            
            // Schedule display updates with a small delay to prevent blocking
            this.displayUpdateTimeout = setTimeout(() => {
                requestAnimationFrame(() => {
                    this.updatePlayerDisplay();
                    
                    requestAnimationFrame(() => {
                        this.updateAlertDisplay();
                        
                        requestAnimationFrame(() => {
                            this.updateSavedPlayersDisplay();
                            
                            // Hide loading indicator when done
                            this.hideLoadingIndicator();
                        });
                    });
                });
            }, 100);
        }
        
        showLoadingIndicator() {
            const playerListDiv = document.getElementById('current-players-list');
            if (playerListDiv) {
                playerListDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #ffc107;"><div style="font-size: 14px;">Loading players...</div><div style="font-size: 11px; opacity: 0.7; margin-top: 5px;">Processing large player list, please wait...</div></div>';
            }
        }
        
        hideLoadingIndicator() {
            // Loading indicator will be replaced by actual content in updatePlayerDisplay
            console.log('Initial loading completed');
        }

        syncPopulationCount() {
            const actualPopulation = this.getActualPopulationFromUI();
            const trackedPopulation = this.currentPlayers.size;
            
            if (actualPopulation !== null) {
                const difference = Math.abs(actualPopulation - trackedPopulation);
                
                console.log(`Population sync check: Tracked=${trackedPopulation}, UI=${actualPopulation}, Difference=${difference}`);
                
                // Only sync if the difference is small (1-3 players) to avoid using wrong UI elements
                if (difference >= 1 && difference <= 3) {
                    console.log(`Small drift detected, correcting: ${trackedPopulation} -> ${actualPopulation}`);
                    this.recordPopulation(trackedPopulation); // This will use actual population internally
                } else if (difference > 3) {
                    console.log(`Large difference detected, likely wrong UI element. Keeping tracked count.`);
                }
            }
        }

        checkPlayerChanges() {
            this.updatePlayerList();
        }

        updatePlayerDisplay() {
            const playerListDiv = document.getElementById('current-players-list');
            if (!playerListDiv) return;

            if (this.currentPlayers.size === 0) {
                playerListDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic;">No players online</div>';
                return;
            }

            // Use DocumentFragment for better performance with large player lists
            const fragment = document.createDocumentFragment();
            
            for (const [playerId, player] of this.currentPlayers) {
                
                const isAlerted = this.alerts[playerId];
                
                const playerDiv = document.createElement('div');
                playerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1);';
                
                const playerInfo = document.createElement('div');
                playerInfo.style.cssText = 'flex: 1;';
                
                const playerLink = document.createElement('a');
                playerLink.href = `https://www.battlemetrics.com/players/${playerId}`;
                playerLink.target = '_blank';
                playerLink.style.cssText = 'color: #17a2b8; text-decoration: none;';
                playerLink.textContent = player.name;
                
                playerInfo.appendChild(playerLink);

                // Show session playtime if available (format hours with one decimal, or minutes if <1h)
                try {
                    if (player && typeof player.sessionMs === 'number' && player.sessionMs !== null) {
                        const ms = player.sessionMs;
                        let sessionText = '';
                        if (ms >= 3600000) {
                            const hrs = ms / 3600000;
                            sessionText = `${hrs.toFixed(1)}h`;
                        } else {
                            const mins = Math.round(ms / 60000);
                            sessionText = `${mins}m`;
                        }

                        const sessionSpan = document.createElement('div');
                        sessionSpan.style.cssText = 'color: #6c757d; font-size: 11px; margin-top: 3px;';
                        sessionSpan.textContent = `Session: ${sessionText}`;
                        playerInfo.appendChild(sessionSpan);
                    }
                } catch (e) {
                    // Ignore non-critical display errors
                }
                
                if (isAlerted) {
                    const alertSpan = document.createElement('span');
                    alertSpan.style.cssText = 'color: #ffc107; margin-left: 5px;';
                    alertSpan.textContent = '[ALERT]';
                    playerInfo.appendChild(alertSpan);
                }
                
                const buttonsDiv = document.createElement('div');
                buttonsDiv.style.cssText = 'display: flex; gap: 5px;';
                
                const alertBtn = document.createElement('button');
                alertBtn.textContent = isAlerted ? 'Remove' : 'Add Alert';
                alertBtn.title = isAlerted ? 'Remove Alert' : 'Add Alert';
                alertBtn.style.cssText = `background: ${isAlerted ? '#dc3545' : '#28a745'}; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;`;
                alertBtn.onclick = () => togglePlayerAlert(player.name, playerId);
                
                const saveBtn = document.createElement('button');
                saveBtn.textContent = 'Save';
                saveBtn.title = 'Save Player';
                saveBtn.style.cssText = 'background: #6c757d; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;';
                saveBtn.onclick = () => savePlayer(player.name, playerId);
                
                buttonsDiv.appendChild(alertBtn);
                buttonsDiv.appendChild(saveBtn);
                
                playerDiv.appendChild(playerInfo);
                playerDiv.appendChild(buttonsDiv);
                fragment.appendChild(playerDiv);
            }

            // Clear and append all at once
            playerListDiv.innerHTML = '';
            playerListDiv.appendChild(fragment);
        }

        updateActivityDisplay() {
            const activityDiv = document.getElementById('recent-activity-list');
            if (!activityDiv) return;

            // If user is actively searching activity, prefer search results
            if (typeof activeActivitySearch !== 'undefined' && activeActivitySearch && activeActivitySearch.length >= 2) {
                try { performActivitySearch(activeActivitySearch); } catch (e) {}
                return;
            }

            // Delegate to unified filter renderer (handles both action + time filters)
            if (window.applyActivityFilters) {
                window.applyActivityFilters();
            }
        }

        updateAlertCount() {
            const alertCountSpan = document.getElementById('alert-count');
            if (alertCountSpan) {
                const count = Object.keys(this.alerts).length;
                alertCountSpan.textContent = count;
                console.log('[Alert System] Updated alert count to:', count);
            }
        }

        expandAlertSection() {
            const alertList = document.getElementById('alert-players-list');
            const alertToggle = document.getElementById('alertplayers-toggle');
            
            if (alertList && alertToggle) {
                if (alertList.style.display === 'none') {
                    alertList.style.display = 'block';
                    alertToggle.textContent = '▼';
                    console.log('[Alert System] Expanded Alert Players section');
                }
            }
        }

        updateAlertDisplay() {
            try {
                console.log('[Alert System] Updating alert display...');
                const alertDiv = document.getElementById('alert-players-list');
                if (!alertDiv) {
                    console.log('[Alert System] Alert div not found!');
                    return;
                }

                const alertedPlayers = Object.keys(this.alerts);
                console.log('[Alert System] Alerted players count:', alertedPlayers.length);
                console.log('[Alert System] Alerted players:', alertedPlayers);
                
                if (alertedPlayers.length === 0) {
                    alertDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic;">No players with alerts</div>';
                    console.log('[Alert System] No alerts to display');
                    return;
                }

                console.log('[Alert System] Generating HTML for alerts...');
                let alertHTML = '';
                alertedPlayers.forEach(playerId => {
                    const alert = this.alerts[playerId];
                    const addedDate = new Date(alert.added).toLocaleDateString();
                    const isOnline = this.currentPlayers.has(playerId);
                    const dbPlayer = this.playerDatabase[playerId];
                    const isSaved = this.savedPlayers[playerId];
                    
                    // Get current name and check for name changes
                    let displayName = alert.name;
                    let nameChangeInfo = '';
                    
                    if (dbPlayer) {
                        displayName = dbPlayer.currentName;
                        if (dbPlayer.nameChanged && dbPlayer.previousNames.length > 0) {
                            const originalAlertName = alert.name;
                            if (originalAlertName !== dbPlayer.currentName) {
                                nameChangeInfo = ` (was: ${originalAlertName})`;
                            }
                        }
                    }
                    
                    const onlineStatus = isOnline ? 
                        '<span style="color: #28a745; font-weight: bold;">[ONLINE]</span>' : 
                        '<span style="color: #dc3545; font-weight: bold;">[OFFLINE]</span>';
                    
                    const lastSeenLine = (!isOnline && dbPlayer && dbPlayer.lastSeen)
                        ? `<div style="opacity: 0.7; font-size: 10px; margin-top: 1px;">Last seen: ${toRelativeTime(dbPlayer.lastSeen)}</div>`
                        : '';

                    alertHTML += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 5px; border-radius: 5px; background: rgba(255, 193, 7, 0.1); border-left: 3px solid ${isOnline ? '#28a745' : '#ffc107'};">
                            <div style="flex: 1;">
                                <div style="color: #ffc107; font-weight: bold; font-size: 12px;">
                                    <a href="https://www.battlemetrics.com/players/${playerId}" target="_blank" style="color: #ffc107; text-decoration: none;">
                                        ${displayName}${nameChangeInfo}
                                    </a>
                                    ${onlineStatus}
                                    ${isSaved ? '<span style="color: #28a745; margin-left: 5px;">[SAVED]</span>' : ''}
                                </div>
                                <div style="opacity: 0.7; font-size: 10px;">
                                    Added: ${addedDate} | ID: ${playerId}
                                </div>
                                ${lastSeenLine}
                                ${dbPlayer && dbPlayer.nameChanged ? '<div style="color: #ffc107; font-size: 10px;">⚠ Name changed</div>' : ''}
                            </div>
                            <div style="display: flex; gap: 3px;">
                                <button onclick="window.open('https://www.battlemetrics.com/players/${playerId}', '_blank')" 
                                        style="background: #17a2b8; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                        title="View Profile">
                                    Profile
                                </button>
                                <button onclick="savePlayer('${displayName}', '${playerId}')" 
                                        style="background: ${isSaved ? '#6c757d' : '#28a745'}; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                        title="${isSaved ? 'Already Saved' : 'Save Player'}" ${isSaved ? 'disabled' : ''}>
                                    ${isSaved ? 'Saved' : 'Save'}
                                </button>
                                <button onclick="showNameHistory('${playerId}')"
                                        style="background: #6f42c1; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                        title="View history">
                                    History
                                </button>
                                <button onclick="confirmRemoveAlert('${displayName}', '${playerId}', this)" 
                                        style="background: #dc3545; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                        title="Remove Alert (click twice to confirm)">
                                    Remove Alert
                                </button>
                            </div>
                        </div>
                    `;
                });

                console.log('[Alert System] Setting innerHTML with', alertHTML.length, 'characters');
                alertDiv.innerHTML = alertHTML;
                console.log('[Alert System] Alert display updated successfully');
                
            } catch (error) {
                console.error('[Alert System] Error in updateAlertDisplay:', error);
                return;
            }
        }

        updateSavedPlayersDisplay() {
            const savedDiv = document.getElementById('saved-players-list');
            if (!savedDiv) return;

            const savedPlayers = Object.keys(this.savedPlayers);
            
            if (savedPlayers.length === 0) {
                savedDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic;">No saved players</div>';
                return;
            }

            let savedHTML = '';
            savedPlayers.forEach(playerId => {
                const saved = this.savedPlayers[playerId];
                const savedDate = new Date(saved.saved).toLocaleDateString();
                const hasAlert = this.alerts[playerId];
                const isOnline = this.currentPlayers.has(playerId);
                const dbPlayer = this.playerDatabase[playerId];
                
                // Get current name and check for name changes
                let displayName = saved.name;
                let nameChangeInfo = '';
                
                if (dbPlayer) {
                    displayName = dbPlayer.currentName;
                    if (dbPlayer.nameChanged && dbPlayer.previousNames && dbPlayer.previousNames.length > 0) {
                        const originalSavedName = saved.name;
                        if (!namesEqual(originalSavedName, dbPlayer.currentName)) {
                            nameChangeInfo = ` (was: ${originalSavedName})`;
                        }
                    }
                }
                
                const onlineStatus = isOnline ? 
                    '<span style="color: #28a745; font-weight: bold;">[ONLINE]</span>' : 
                    '<span style="color: #dc3545; font-weight: bold;">[OFFLINE]</span>';
                
                const lastSeenLine = (!isOnline && dbPlayer && dbPlayer.lastSeen)
                    ? `<div style="opacity: 0.7; font-size: 10px; margin-top: 1px;">Last seen: ${toRelativeTime(dbPlayer.lastSeen)}</div>`
                    : '';

                savedHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 5px; border-radius: 5px; background: rgba(108, 117, 125, 0.1); border-left: 3px solid ${isOnline ? '#28a745' : '#6c757d'};">
                        <div style="flex: 1;">
                            <div style="color: #6c757d; font-weight: bold; font-size: 12px;">
                                <a href="https://www.battlemetrics.com/players/${playerId}" target="_blank" style="color: #6c757d; text-decoration: none;">
                                    ${displayName}${nameChangeInfo}
                                </a>
                                ${onlineStatus}
                                ${hasAlert ? '<span style="color: #ffc107; margin-left: 5px;">[ALERT]</span>' : ''}
                            </div>
                            <div style="opacity: 0.7; font-size: 10px;">
                                Saved: ${savedDate} | ID: ${playerId}
                            </div>
                            ${lastSeenLine}
                            ${dbPlayer && dbPlayer.nameChanged ? '<div style="color: #ffc107; font-size: 10px;">⚠ Name changed</div>' : ''}
                        </div>
                        <div style="display: flex; gap: 3px;">
                            <button onclick="window.open('https://www.battlemetrics.com/players/${playerId}', '_blank')" 
                                    style="background: #17a2b8; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                    title="View Profile">
                                Profile
                            </button>
                            ${hasAlert
                                ? `<button disabled style="background: #6c757d; color: rgba(255,255,255,0.5); border: none; padding: 2px 5px; border-radius: 3px; font-size: 9px; cursor: default;" title="Alert active — manage in Alert Players tab">Alerted ✓</button>`
                                : `<button onclick="togglePlayerAlert('${displayName}', '${playerId}')" style="background: #28a745; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;" title="Add Alert">Add Alert</button>`
                            }
                            <button onclick="showNameHistory('${playerId}')"
                                    style="background: #6f42c1; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                    title="View history">
                                History
                            </button>
                            <button onclick="confirmDeleteSavedPlayer('${playerId}', this)" 
                                    style="background: #6c757d; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                    title="Remove from Saved (click twice to confirm)">
                                Delete
                            </button>
                        </div>
                    </div>
                `;
            });

            savedDiv.innerHTML = savedHTML;
        }

        updateRecentAlertsDisplay() {
            const alertsDiv = document.getElementById('recent-alerts-list');
            if (!alertsDiv) return;

            // Clean old alerts first
            this.clearOldAlerts();
            
            // Check if we need to reorder sections based on unacknowledged alerts
            this.reorderSectionsIfNeeded();

            const recentAlerts = Object.keys(this.recentAlerts)
                .map(id => ({ id, ...this.recentAlerts[id] }))
                .sort((a, b) => b.timestamp - a.timestamp);
            
            if (recentAlerts.length === 0) {
                alertsDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic;">No recent alerts</div>';
                return;
            }

            let alertsHTML = '';
            recentAlerts.forEach(alert => {
                const timeAgo = toRelativeTime(alert.timestamp);
                const actionColor = alert.action === 'joined' ? '#28a745' : '#dc3545';
                const bgColor = alert.acknowledged ? 'rgba(108, 117, 125, 0.1)' : 'rgba(220, 53, 69, 0.1)';
                const dbPlayer = this.playerDatabase[alert.playerId];
                
                // Get current name and check for name changes
                let displayName = alert.playerName;
                let nameChangeInfo = '';
                
                    if (dbPlayer) {
                    displayName = dbPlayer.currentName;
                    if (dbPlayer.nameChanged && dbPlayer.previousNames.length > 0) {
                        // Show the most recent previous name if current name is different from any previous name
                        const mostRecentPreviousName = dbPlayer.previousNames[dbPlayer.previousNames.length - 1];
                        
                        // Check if the alert name is different from current name OR if we should show previous name
                        if (alert.playerName !== dbPlayer.currentName) {
                            nameChangeInfo = ` (was: ${alert.playerName})`;
                        } else if (mostRecentPreviousName && mostRecentPreviousName !== dbPlayer.currentName) {
                            nameChangeInfo = ` (was: ${mostRecentPreviousName})`;
                        }
                    }
                }
                    const actionText = alert.action === 'joined' ? 'joined the game' : alert.action === 'left' ? 'left the game' : alert.action === 'name_changed' ? 'changed name' : `${alert.action} the game`;

                alertsHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 5px; border-radius: 5px; background: ${bgColor}; border-left: 3px solid ${actionColor};">
                        <div style="flex: 1;">
                            <div style="color: ${actionColor}; font-weight: bold; font-size: 12px;">
                                ${displayName}${nameChangeInfo} ${actionText}
                            </div>
                            <div style="opacity: 0.7; font-size: 10px;">${timeAgo} | ID: ${alert.playerId}</div>
                            ${dbPlayer && dbPlayer.nameChanged ? '<div style="color: #ffc107; font-size: 10px;">⚠ Name changed</div>' : ''}
                            ${alert.acknowledged ? '<div style="color: #28a745; font-size: 10px;">✓ Acknowledged</div>' : '<div style="color: #ffc107; font-size: 10px;">⚠ Needs acknowledgment</div>'}
                        </div>
                        <div style="display: flex; gap: 3px;">
                            ${!alert.acknowledged ? `
                                <button onclick="acknowledgeRecentAlert('${alert.id}')" 
                                        style="background: #28a745; color: white; border: none; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                        title="Acknowledge Alert">
                                    OK
                                </button>
                            ` : ''}
                            <button onclick="window.open('https://www.battlemetrics.com/players/${alert.playerId}', '_blank')" 
                                    style="background: #17a2b8; color: white; border: none; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                    title="View Profile">
                                Profile
                            </button>
                            <button onclick="showNameHistory('${alert.playerId}')" 
                                    style="background: #6f42c1; color: white; border: none; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                                    title="View name history">
                                History
                            </button>
                        </div>
                    </div>
                `;
            });

            alertsDiv.innerHTML = alertsHTML;
        }

        reorderSectionsIfNeeded() {
            const unacknowledged = Object.values(this.recentAlerts).filter(alert => !alert.acknowledged);
            const hasUnacknowledgedAlerts = unacknowledged.length > 0;
            
            const recentAlertsSection = document.getElementById('recent-alerts-section');
            const populationStats = document.getElementById('population-stats');
            const playerSearchSection = populationStats ? populationStats.nextElementSibling : null;
            
            if (!recentAlertsSection) return;
            
            // Check if Recent Alerts is currently at the top (right after population stats)
            const currentlyAtTop = playerSearchSection && recentAlertsSection.nextElementSibling === playerSearchSection;
            
            if (hasUnacknowledgedAlerts && !currentlyAtTop) {
                // Move Recent Alerts to top (after population stats, before player search)
                if (populationStats && playerSearchSection) {
                    populationStats.insertAdjacentElement('afterend', recentAlertsSection);
                }
                
                // Make it more prominent with pulsing effect
                recentAlertsSection.style.border = '2px solid #dc3545';
                recentAlertsSection.style.boxShadow = '0 0 15px rgba(220, 53, 69, 0.5)';
                recentAlertsSection.style.animation = 'pulse 2s infinite';
                
                // Add pulse animation if not exists
                if (!document.getElementById('alert-pulse-animation')) {
                    const style = document.createElement('style');
                    style.id = 'alert-pulse-animation';
                    style.textContent = `
                        @keyframes pulse {
                            0% { box-shadow: 0 0 15px rgba(220, 53, 69, 0.5); }
                            50% { box-shadow: 0 0 25px rgba(220, 53, 69, 0.8); }
                            100% { box-shadow: 0 0 15px rgba(220, 53, 69, 0.5); }
                        }
                    `;
                    document.head.appendChild(style);
                }
                
                // Auto-expand if collapsed
                const alertsList = document.getElementById('recent-alerts-list');
                const toggle = document.getElementById('recentalerts-toggle');
                if (alertsList && toggle && alertsList.style.display === 'none') {
                    alertsList.style.display = 'block';
                    toggle.textContent = '▼';
                }
                
                console.log('Moved Recent Alerts to top due to unacknowledged alerts');
                
            } else if (!hasUnacknowledgedAlerts && currentlyAtTop) {
                // Move Recent Alerts back to original position (after Player Database)
                const playerDatabaseSection = document.getElementById('player-database-section');
                if (playerDatabaseSection) {
                    playerDatabaseSection.insertAdjacentElement('afterend', recentAlertsSection);
                }
                
                // Remove prominence styling
                recentAlertsSection.style.border = '1px solid #dc3545';
                recentAlertsSection.style.boxShadow = 'none';
                recentAlertsSection.style.animation = 'none';
                
                console.log('Moved Recent Alerts back to original position');
            }
        }

        searchPlayers(query) {
            if (!query || query.length < 2) return [];
            
            const lowerQuery = query.toLowerCase();
            const results = [];
            
            // Use for...of for better performance than forEach
            for (const [playerId, player] of this.currentPlayers) {
                if (player.name.toLowerCase().includes(lowerQuery) || 
                    playerId.includes(query)) {
                    results.push(player);
                }
            }
            
            return results;
        }

        exportActivityLog() {
            const csv = ['Timestamp,Player Name,Player ID,Action,Server Name'];
            this.activityLog.forEach(entry => {
                csv.push(`"${entry.time}","${entry.playerName}","${entry.playerId}","${entry.action}","${entry.serverName}"`);
            });
            
            const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `server_activity_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }

        clearActivityLog() {
            this.activityLog = [];
            this.saveActivityLog();
            this.updateActivityDisplay();
        }
    }

    // Add global click handler for better Firefox compatibility
    document.addEventListener('click', (event) => {
        const target = event.target;
        console.log('[Click Handler] Button clicked:', target.textContent, target.onclick ? 'has onclick' : 'no onclick');
        
        // Handle alert buttons
        if (target.onclick && target.onclick.toString().includes('togglePlayerAlert')) {
            console.log('[Click Handler] Alert button detected');
            event.preventDefault();
            
            // Extract parameters from onclick attribute
            const onclickStr = target.onclick.toString();
            console.log('[Click Handler] onclick string:', onclickStr);
            const match = onclickStr.match(/togglePlayerAlert\('([^']+)',\s*'([^']+)'\)/);
            
            if (match) {
                const playerName = match[1];
                const playerId = match[2];
                console.log('[Click Handler] Extracted params:', playerName, playerId);
                window.togglePlayerAlert(playerName, playerId);
            } else {
                console.log('[Click Handler] Failed to extract parameters from onclick');
            }
        }
    });

    // Create Toggle Button
    const createToggleButton = () => {
        const existingToggleBtn = document.getElementById(TOGGLE_BUTTON_ID);
        if (existingToggleBtn) existingToggleBtn.remove();

        const toggleBtn = document.createElement("button");
        toggleBtn.id = TOGGLE_BUTTON_ID;
        toggleBtn.onclick = () => {
            const currentlyVisible = isMenuVisible();
            setMenuVisibility(!currentlyVisible);
        };

        Object.assign(toggleBtn.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: "10000",
            padding: "8px 12px",
            backgroundColor: "#6c757d",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "bold"
        });

        document.body.appendChild(toggleBtn);
        updateToggleButton();
    };

    // Create Server Monitor UI
    const createServerMonitor = () => {
        const existingMonitor = document.getElementById(SERVER_MONITOR_ID);
        if (existingMonitor) existingMonitor.remove();

        const monitor = document.createElement('div');
        monitor.id = SERVER_MONITOR_ID;
        
        Object.assign(monitor.style, {
            position: "fixed",
            top: "70px",
            right: "20px",
            backgroundColor: "#2c3e50",
            color: "#fff",
            padding: "20px",
            borderRadius: "10px",
            zIndex: "9999",
            fontSize: "14px",
            maxWidth: "450px",
            maxHeight: "80vh",
            overflowY: "auto",
            boxShadow: "0 8px 25px rgba(0,0,0,0.3)",
            border: "1px solid #34495e",
            lineHeight: "1.4"
        });

        monitor.innerHTML = `
            <div style="border-bottom: 2px solid rgba(255,255,255,0.2); padding-bottom: 12px; margin-bottom: 15px;">
                <div style="font-size: 18px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                    Server Monitor
                </div>
                <div style="font-size: 12px; opacity: 0.9;">
                    Real-time player tracking & alerts
                </div>
                <div style="font-size: 11px; opacity: 0.7; margin-top: 4px; color: #17a2b8;">
                    Server ID: <span id="current-server-id">${currentServerID || 'Loading...'}</span>
                </div>
                <div style="font-size: 11px; opacity: 0.7; margin-top: 2px; color: #28a745;">
                    Server: <span id="current-server-name">${currentServerName || 'Loading...'}</span>
                </div>
            </div>

            <!-- Population Stats -->
            <div id="population-stats">
                <!-- Population stats will be populated by updatePopulationDisplay() -->
            </div>

            <!-- Player Search -->
            <div style="background: rgba(0, 123, 255, 0.2); border: 1px solid #007bff; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: #007bff; margin-bottom: 8px;">
                    Player Search
                </div>
                <div style="display: flex; gap: 5px; align-items: center;">
                    <input type="text" id="player-search" placeholder="Search current players..." 
                           style="flex: 1; padding: 5px; border: none; border-radius: 3px; background: rgba(255,255,255,0.1); color: white; font-size: 12px;"
                           oninput="handlePlayerSearch(this.value)"
                           onblur="setTimeout(() => { if (!this.value) { activePlayerSearch = ''; } }, 200)">
                    <button onclick="clearPlayerSearch()" 
                            style="background: #6c757d; color: white; border: none; padding: 5px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;"
                            title="Clear Search">
                        ✕
                    </button>
                </div>
                <div id="search-results" style="margin-top: 8px; max-height: 150px; overflow-y: auto;"></div>
            </div>

            <!-- Current Online Players -->
            <div style="background: rgba(40, 167, 69, 0.2); border: 1px solid #28a745; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: #28a745; margin-bottom: 8px; cursor: pointer;" onclick="toggleSection('current-players')">
                    Current Online Players (<span id="player-count">0</span>) <span id="players-toggle">▼</span>
                </div>
                <div id="current-players-list" style="max-height: 200px; overflow-y: auto;">
                    Loading players...
                </div>
            </div>

            <!-- Alert Players -->
            <div style="background: rgba(255, 193, 7, 0.2); border: 1px solid #ffc107; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: #ffc107; margin-bottom: 8px; cursor: pointer;" onclick="toggleSection('alert-players')">
                    Alert Players (<span id="alert-count">0</span>) <span id="alertplayers-toggle">▼</span>
                </div>
                <div id="alert-players-list" style="max-height: 200px; overflow-y: auto;">
                    No players with alerts
                </div>
            </div>

            <!-- Saved Players -->
            <div style="background: rgba(108, 117, 125, 0.2); border: 1px solid #6c757d; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: #6c757d; margin-bottom: 8px; cursor: pointer;" onclick="toggleSection('saved-players')">
                    Saved Players (<span id="saved-count">0</span>) <span id="savedplayers-toggle">▼</span>
                </div>
                <div id="saved-players-list" style="max-height: 200px; overflow-y: auto;">
                    No saved players
                </div>
            </div>

            <!-- Player Database -->
            <div id="player-database-section" style="background: rgba(111, 66, 193, 0.2); border: 1px solid #6f42c1; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: #6f42c1; margin-bottom: 8px; cursor: pointer;" onclick="toggleSection('player-database')">
                    Player Database (<span id="database-count">0</span>) <span id="playerdatabase-toggle">▶</span>
                </div>
                <div style="margin-bottom: 8px; display: flex; gap: 5px; align-items: center;">
                    <input type="text" id="database-search" placeholder="Search database by name or ID..." 
                           style="flex: 1; padding: 5px; border: none; border-radius: 3px; background: rgba(255,255,255,0.1); color: white; font-size: 12px;"
                           oninput="handleDatabaseSearch(this.value)"
                           onblur="setTimeout(() => { if (!this.value) { activeDatabaseSearch = ''; if (serverMonitor) serverMonitor.updateDatabaseDisplay(); } }, 200)">
                    <button onclick="clearDatabaseSearch()" 
                            style="background: #6c757d; color: white; border: none; padding: 5px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;"
                            title="Clear Search">
                        ✕
                    </button>
                </div>
                <!-- Manual Add Player -->
                <div style="margin-bottom: 8px;">
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <input type="text" id="manual-add-id" placeholder="Player ID (required)" 
                               style="flex: 1; padding: 4px 6px; border: none; border-radius: 3px; background: rgba(255,255,255,0.1); color: white; font-size: 11px;"
                               onkeydown="if(event.key==='Enter') manuallyAddPlayer()">
                        <input type="text" id="manual-add-nickname" placeholder="Nickname (optional)" 
                               style="flex: 1; padding: 4px 6px; border: none; border-radius: 3px; background: rgba(255,255,255,0.1); color: white; font-size: 11px;"
                               onkeydown="if(event.key==='Enter') manuallyAddPlayer()">
                        <label style="display: flex; align-items: center; gap: 3px; font-size: 10px; white-space: nowrap; cursor: pointer;">
                            <input type="checkbox" id="manual-add-alert" style="cursor: pointer;"> Alert
                        </label>
                        <button onclick="manuallyAddPlayer()" 
                                style="background: #6f42c1; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; white-space: nowrap;">
                            + Add
                        </button>
                    </div>
                </div>
                <div style="margin-bottom: 8px; display: flex; gap: 5px; align-items: center;">
                    <select id="database-filter" onchange="filterDatabase(this.value)" 
                            style="padding: 3px; border: none; border-radius: 3px; background: rgba(255,255,255,0.1); color: white; font-size: 11px;">
                        <option value="all">All Players</option>
                        <option value="online">Online Only</option>
                        <option value="offline">Offline Only</option>
                        <option value="name-changed">Name Changed</option>
                    </select>
                    <button onclick="clearDatabaseFilter()" 
                            style="background: #6c757d; color: white; border: none; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;"
                            title="Clear Filter">
                        Clear
                    </button>
                </div>
                <div id="player-database-list" style="max-height: 250px; overflow-y: auto; display: none;">
                    No players in database
                </div>
            </div>

            <!-- Recent Alerts -->
            <div id="recent-alerts-section" style="background: rgba(220, 53, 69, 0.2); border: 1px solid #dc3545; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <div style="font-size: 14px; font-weight: bold; color: #dc3545; cursor: pointer; flex: 1;" onclick="toggleSection('recent-alerts')">
                        Recent Alerts (<span id="recent-alerts-count">0</span>) <span id="recentalerts-toggle">▼</span>
                    </div>
                    <div style="display:flex; gap:4px;">
                        <button onclick="acknowledgeAllRecentAlerts()" 
                                style="background: #28a745; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; white-space: nowrap;"
                                title="Mark all alerts as acknowledged">
                            ✓ Acknowledge All
                        </button>
                        <button onclick="clearAllRecentAlerts(this)" 
                                style="background: #dc3545; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; white-space: nowrap;"
                                title="Remove all recent alerts">
                            ✕ Clear All
                        </button>
                    </div>
                </div>
                <div id="recent-alerts-list" style="max-height: 200px; overflow-y: auto;">
                    No recent alerts
                </div>
            </div>

            <!-- Recent Activity -->
            <div style="background: rgba(23, 162, 184, 0.2); border: 1px solid #17a2b8; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: #17a2b8; margin-bottom: 8px; cursor: pointer;" onclick="toggleSection('recent-activity')">
                    All Activity (<span id="activity-count">0</span>) <span id="activity-toggle">▼</span>
                </div>
                <div style="margin-bottom: 8px;" id="activity-filters">
                    <div style="display: flex; gap: 5px; align-items: center; margin-bottom: 5px;">
                        <input type="text" id="activity-search" placeholder="Search activity (name, id, action)..." 
                               style="flex: 1; padding: 5px; border: none; border-radius: 3px; background: rgba(255,255,255,0.1); color: white; font-size: 12px;"
                               oninput="handleActivitySearch(this.value)">
                        <button onclick="clearActivityFilter()" 
                                style="background: #6c757d; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;"
                                title="Clear all filters">
                            Clear
                        </button>
                    </div>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <select id="activity-filter" onchange="applyActivityFilters()" 
                                style="flex: 1; padding: 3px; border: none; border-radius: 3px; background: rgba(255,255,255,0.1); color: white; font-size: 11px;">
                            <option value="all">All Actions</option>
                            <option value="joined">Joined Only</option>
                            <option value="left">Left Only</option>
                            <option value="name_changed">Name Changes</option>
                            <option value="new_players">New Players</option>
                        </select>
                        <select id="activity-time-filter" onchange="applyActivityFilters()" 
                                style="flex: 1; padding: 3px; border: none; border-radius: 3px; background: rgba(255,255,255,0.1); color: white; font-size: 11px;">
                            <option value="all">All Time</option>
                            <option value="1h">Last Hour</option>
                            <option value="3h">Last 3 Hours</option>
                            <option value="6h">Last 6 Hours</option>
                            <option value="24h">Last 24 Hours</option>
                            <option value="7d">Last 7 Days</option>
                        </select>
                    </div>
                    <div id="activity-result-count" style="font-size: 10px; color: #6c757d; margin-top: 4px;"></div>
                </div>
                <div id="recent-activity-list" style="max-height: 300px; overflow-y: auto; display: block;">
                    No recent activity
                </div>
            </div>

            <!-- Settings -->
            <div style="background: rgba(220, 53, 69, 0.2); border: 1px solid #dc3545; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: #dc3545; margin-bottom: 8px; cursor: pointer;" onclick="toggleSection('alert-settings')">
                    Settings <span id="alerts-toggle">▶</span>
                </div>
                <div id="alert-settings-content" style="display: none;">
                    <div style="margin-bottom: 10px;">
                        <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 8px;">
                            <input type="checkbox" id="sound-alerts" ${serverMonitor?.soundEnabled ? 'checked' : ''} 
                                   onchange="toggleSoundAlerts(this.checked)" style="margin-right: 8px;">
                            Enable sound alerts
                        </label>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                            <label style="color:inherit; margin:0;">Sound:</label>
                            <select id="sound-select" onchange="changeSoundChoice(this.value)" style="padding:4px; border-radius:4px; background: rgba(255,255,255,0.05); color: white; border: none;">
                                <option value="osc_sine">Sine beep</option>
                                <option value="osc_square">Square beep</option>
                                <option value="osc_triangle">Triangle beep</option>
                                <option value="short_burst">Short burst</option>
                                <option value="long_wobble">Long wobble</option>
                                <option value="triple_ping">Triple ping</option>
                                <option value="deep_thud">Deep thud</option>
                                <option value="rising_sweep">Rising sweep</option>
                            </select>
                        </div>
                        <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 4px;">
                            <input type="checkbox" id="repeat-alerts" ${serverMonitor?.settings.repeatAlerts !== false ? 'checked' : ''} 
                                   onchange="toggleRepeatAlerts(this.checked)" style="margin-right: 8px;">
                            Repeat alert sounds
                        </label>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-left:24px;">
                            <label style="color:inherit; margin:0; font-size:11px;">Every:</label>
                            <select id="repeat-interval" onchange="changeRepeatInterval(this.value)" style="padding:4px; border-radius:4px; background: rgba(255,255,255,0.05); color: white; border: none; font-size:11px;">
                                <option value="2000" ${(serverMonitor?.settings.repeatIntervalMs||60000)==2000?'selected':''}>2 seconds</option>
                                <option value="10000" ${(serverMonitor?.settings.repeatIntervalMs||60000)==10000?'selected':''}>10 seconds</option>
                                <option value="30000" ${(serverMonitor?.settings.repeatIntervalMs||60000)==30000?'selected':''}>30 seconds</option>
                                <option value="60000" ${(serverMonitor?.settings.repeatIntervalMs||60000)==60000?'selected':''}>1 minute</option>
                                <option value="120000" ${(serverMonitor?.settings.repeatIntervalMs||60000)==120000?'selected':''}>2 minutes</option>
                                <option value="180000" ${(serverMonitor?.settings.repeatIntervalMs||60000)==180000?'selected':''}>3 minutes</option>
                            </select>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                            <label style="color:inherit; margin:0; font-size:11px;">[NEW] badge wears off after:</label>
                            <select id="new-player-window" onchange="changeNewPlayerWindow(this.value)" style="padding:4px; border-radius:4px; background: rgba(255,255,255,0.05); color: white; border: none; font-size:11px;">
                                <option value="3600000"   ${(serverMonitor?.settings.newPlayerWindowMs||21600000)==3600000  ?'selected':''}>1 hour</option>
                                <option value="10800000"  ${(serverMonitor?.settings.newPlayerWindowMs||21600000)==10800000 ?'selected':''}>3 hours</option>
                                <option value="21600000"  ${(serverMonitor?.settings.newPlayerWindowMs||21600000)==21600000 ?'selected':''}>6 hours</option>
                                <option value="43200000"  ${(serverMonitor?.settings.newPlayerWindowMs||21600000)==43200000 ?'selected':''}>12 hours</option>
                                <option value="86400000"  ${(serverMonitor?.settings.newPlayerWindowMs||21600000)==86400000 ?'selected':''}>1 day</option>
                                <option value="172800000" ${(serverMonitor?.settings.newPlayerWindowMs||21600000)==172800000?'selected':''}>2 days</option>
                                <option value="604800000" ${(serverMonitor?.settings.newPlayerWindowMs||21600000)==604800000?'selected':''}>7 days</option>
                            </select>
                        </div>
                        <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 8px;">
                            <input type="checkbox" id="debug-mode" 
                                   onchange="toggleDebugMode(this.checked)" style="margin-right: 8px;">
                            Enable debug console mode
                        </label>
                                <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 8px;">
                                    <input type="checkbox" id="auto-check-updates" 
                                           onchange="toggleAutoCheckUpdates(this.checked)" style="margin-right: 8px;">
                                    Auto-check for updates
                                </label>
                                <div style="margin-top:6px; display:flex; gap:6px;">
                                    <button onclick="checkForUpdatesNow()"
                                            style="background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                                        Check for updates
                                    </button>
                                </div>
                        <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 4px; margin-top: 8px;">
                            <input type="checkbox" id="auto-refresh-toggle"
                                   ${loadAutoRefreshSettings().enabled ? 'checked' : ''}
                                   onchange="toggleAutoRefresh(this.checked)" style="margin-right: 8px;">
                            Auto-refresh page
                        </label>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-left:24px;">
                            <label style="color:inherit; margin:0; font-size:11px;">Every:</label>
                            <select id="auto-refresh-interval" onchange="changeAutoRefreshInterval(this.value)" style="padding:4px; border-radius:4px; background: rgba(255,255,255,0.05); color: white; border: none; font-size:11px;">
                                <option value="120000"  ${(loadAutoRefreshSettings().ms||120000)==120000  ?'selected':''}>2 minutes</option>
                                <option value="180000"  ${(loadAutoRefreshSettings().ms||120000)==180000  ?'selected':''}>3 minutes</option>
                                <option value="300000"  ${(loadAutoRefreshSettings().ms||120000)==300000  ?'selected':''}>5 minutes</option>
                                <option value="600000"  ${(loadAutoRefreshSettings().ms||120000)==600000  ?'selected':''}>10 minutes</option>
                                <option value="900000"  ${(loadAutoRefreshSettings().ms||120000)==900000  ?'selected':''}>15 minutes</option>
                                <option value="1800000" ${(loadAutoRefreshSettings().ms||120000)==1800000 ?'selected':''}>30 minutes</option>
                                <option value="3600000" ${(loadAutoRefreshSettings().ms||120000)==3600000 ?'selected':''}>1 hour</option>
                            </select>
                        </div>
                        <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0 8px; padding-top: 8px;">
                            <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 4px;">
                                <input type="checkbox" id="keep-alive-toggle" onchange="toggleKeepAlive(this.checked)" style="margin-right: 8px;">
                                Keep tab alive (watchdog)
                            </label>
                            <div style="font-size: 10px; color: #6c757d; padding-left: 20px; margin-bottom: 6px;">
                                Warns before closing &amp; opens a popup that auto-reopens this tab if closed.
                            </div>
                            <div id="keep-alive-controls" style="padding-left: 20px; display: none;">
                                <button onclick="openKeepAliveWatchdogManual()"
                                        style="background: #17a2b8; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">
                                    Open Watchdog Popup
                                </button>
                                <div id="keep-alive-notice" style="font-size: 10px; color: #ffc107; margin-top: 4px; display: none;"></div>
                            </div>
                        </div>
                        <button onclick="testSound()" 
                                style="background: #28a745; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; margin-top: 5px;">
                            Test Sound
                        </button>
                    </div>
                    <div style="font-size: 11px; font-weight: bold; color: rgba(255,255,255,0.5); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;">Export Data</div>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px;">
                        <button onclick="exportActivityLog()" 
                                style="background: #17a2b8; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Activity Log
                        </button>
                        <button onclick="exportPlayerDatabase()" 
                                style="background: #17a2b8; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Player Database
                        </button>
                        <button onclick="importPlayerDatabase()" 
                                style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Import Player DB
                        </button>
                        <button onclick="exportSavedPlayers()" 
                                style="background: #17a2b8; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Saved Players
                        </button>
                        <button onclick="exportAlerts()" 
                                style="background: #17a2b8; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Alert Players
                        </button>
                        <button onclick="exportCurrentServer()" 
                                style="background: #6f42c1; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Full Server Export
                        </button>
                        <button onclick="exportAllServers()" 
                                style="background: #6f42c1; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            All Servers Export
                        </button>
                    </div>
                    <div style="font-size: 11px; font-weight: bold; color: rgba(255,255,255,0.5); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;">Actions</div>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px;">
                        <button onclick="clearLog()" 
                                style="background: #ffc107; color: black; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Clear Log
                        </button>
                    </div>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        <button onclick="resetCurrentServer()" 
                                style="background: #fd7e14; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Reset Current Server
                        </button>
                        <button onclick="resetAllData()" 
                                style="background: #6c757d; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Reset All Servers
                        </button>
                        <button id="reset-defaults-btn" onclick="resetDefaultSettings()" 
                                style="background: #343a40; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Reset To Default Settings
                        </button>
                    </div>
                </div>
            </div>

            <!-- Debug Console -->
            <div id="debug-console-section" style="background: rgba(108, 117, 125, 0.2); border: 1px solid #6c757d; border-radius: 5px; padding: 12px; margin-bottom: 15px; display: none;">
                <div style="font-size: 14px; font-weight: bold; color: #6c757d; margin-bottom: 8px; cursor: pointer;" onclick="toggleSection('debug-console')">
                    Debug Console <span id="debugconsole-toggle">▼</span>
                </div>
                <div id="debug-console-content" style="display: block;">
                    <div style="margin-bottom: 10px; font-size: 11px; color: #6c757d;">
                        <div id="debug-stats">Loading debug stats...</div>
                    </div>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px;">
                        <button onclick="testDebugConsole()" 
                                style="background: #6f42c1; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Test Console
                        </button>

                        <button onclick="copyDebugLogs()" 
                                style="background: #6c757d; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Copy Text
                        </button>
                        <button onclick="exportDebugLogs()" 
                                style="background: #17a2b8; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Export JSON
                        </button>
                        <button onclick="clearDebugLogs()" 
                                style="background: #ffc107; color: black; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                            Clear Logs
                        </button>
                    </div>
                    <div id="debug-console-list" style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.3); border-radius: 3px; padding: 8px; font-family: monospace;">
                        No debug logs
                    </div>
                </div>
            </div>

            <!-- Version Info -->
            <div style="text-align: center; padding: 10px; border-top: 1px solid rgba(255,255,255,0.2); margin-top: 10px;">
                <div style="font-size: 11px; color: #6c757d; opacity: 0.9; margin-bottom:6px;">
                    ${`BattleMetrics Server Monitor v${SCRIPT_VERSION}`}
                </div>
                <div style="font-size: 12px;">
                    <a href="https://discord.gg/bEPn9UH9Xw" target="_blank" rel="noopener" style="color:#5865F2; font-weight:600; text-decoration:none; margin-right:12px;">Discord</a>
                    <a href="https://jlaiii.github.io/BattleMetrics-Rust-Analytics/" target="_blank" rel="noopener" style="color:#8892BF; font-weight:600; text-decoration:none;">GitHub</a>
                </div>
            </div>
        `;

        document.body.appendChild(monitor);
        updateUIVisibility();
        
        // Initialize debug console display
        setTimeout(() => {
            console.log('[Debug Console] Initializing debug console display...');
            const debugSection = document.getElementById('debug-console-section');
            const debugCheckbox = document.getElementById('debug-mode');
            
            if (debugConsole) {
                console.log('[Debug Console] Debug console enabled:', debugConsole.enabled);
                console.log('[Debug Console] Debug logs count:', debugConsole.logs.length);
                
                if (debugSection) {
                    debugSection.style.display = debugConsole.enabled ? 'block' : 'none';
                }
                
                if (debugCheckbox) {
                    debugCheckbox.checked = debugConsole.enabled;
                }
                
                // Always try to refresh display
                debugConsole.updateDebugDisplay();
                // Initialize update checkboxes
                const autoCheckCb = document.getElementById('auto-check-updates');
                if (autoCheckCb) autoCheckCb.checked = loadAutoCheckSetting();
                // Initialize keep-alive toggle
                try {
                    const keepAliveCb = document.getElementById('keep-alive-toggle');
                    if (keepAliveCb) {
                        const kaEnabled = loadKeepAliveSetting();
                        keepAliveCb.checked = kaEnabled;
                        const kaControls = document.getElementById('keep-alive-controls');
                        if (kaControls) kaControls.style.display = kaEnabled ? 'block' : 'none';
                    }
                } catch (e) { console.warn('Could not initialize keep-alive toggle', e); }
                // initialize sound select
                try {
                    const soundSelect = document.getElementById('sound-select');
                    if (soundSelect && serverMonitor) {
                        const choice = (serverMonitor.settings && serverMonitor.settings.soundChoice) ? serverMonitor.settings.soundChoice : 'osc_sine';
                        soundSelect.value = choice;
                    }
                } catch (e) {
                    console.warn('Could not initialize sound select', e);
                }
                // Attach safe blur handlers to prevent page-level onblur handlers from firing
                try {
                    const playerSearch = document.getElementById('player-search');
                    if (playerSearch) {
                        // Use capture to intercept before page handlers
                        playerSearch.addEventListener('blur', (ev) => {
                            try { ev.stopImmediatePropagation(); } catch (e) {}
                            setTimeout(() => { if (!playerSearch.value) { activePlayerSearch = ''; } }, 200);
                        }, true);
                    }

                    const dbSearch = document.getElementById('database-search');
                    if (dbSearch) {
                        dbSearch.addEventListener('blur', (ev) => {
                            try { ev.stopImmediatePropagation(); } catch (e) {}
                            setTimeout(() => { if (!dbSearch.value) { activeDatabaseSearch = ''; if (serverMonitor) serverMonitor.updateDatabaseDisplay(); } }, 200);
                        }, true);
                    }
                } catch (e) {
                    console.warn('Failed to attach safe blur handlers', e);
                }
            }
        }, 500);
    };

    // Global functions for UI interaction
    window.toggleSection = (sectionId) => {
        const content = document.getElementById(`${sectionId}-list`) || document.getElementById(`${sectionId}-content`);
        let toggle;
        
        // Handle different toggle ID patterns
        if (sectionId === 'recent-activity') {
            toggle = document.getElementById('activity-toggle');
        } else if (sectionId === 'player-database') {
            toggle = document.getElementById('playerdatabase-toggle');
        } else if (sectionId === 'current-players') {
            toggle = document.getElementById('players-toggle');
        } else if (sectionId === 'alert-settings') {
            toggle = document.getElementById('alerts-toggle');
        } else {
            toggle = document.getElementById(`${sectionId.replace('-', '')}-toggle`);
        }
        
        if (content && toggle) {
            if (content.style.display === 'none') {
                content.style.display = 'block';
                toggle.textContent = '▼';
                
                // Show filters when section is expanded
                if (sectionId === 'recent-activity') {
                    const filters = document.getElementById('activity-filters');
                    if (filters) filters.style.display = 'block';
                }
                
                // Refresh debug stats when debug console is opened
                if (sectionId === 'debug-console') {
                    setTimeout(() => refreshDebugStats(), 100);
                }
            } else {
                content.style.display = 'none';
                toggle.textContent = '▶';
                
                // Hide filters when section is collapsed
                if (sectionId === 'recent-activity') {
                    const filters = document.getElementById('activity-filters');
                    if (filters) filters.style.display = 'none';
                }
            }
        }
    };

    // Debounce timer for search
    let searchDebounceTimer = null;
    let lastSearchQuery = '';
    let cachedSearchResults = new Map();
    
    // Optimized search function with debouncing and caching
    const performPlayerSearch = (query) => {
        const resultsDiv = document.getElementById('search-results');
        if (!resultsDiv || !serverMonitor) return;

        // Check cache first
        if (cachedSearchResults.has(query)) {
            const cachedResults = cachedSearchResults.get(query);
            renderSearchResults(cachedResults, resultsDiv);
            return;
        }

        // Search both current players and database
        const currentResults = serverMonitor.searchPlayers(query);
        const databaseResults = serverMonitor.searchDatabase(query);
        
        // Combine results efficiently
        const allResults = [];
        const seenIds = new Set();
        
        // Add current players first (they're online)
        for (const player of currentResults) {
            allResults.push({
                ...player,
                isOnline: true,
                source: 'current'
            });
            seenIds.add(player.id);
        }
        
        // Add database players that aren't already in current players
        for (const player of databaseResults) {
            if (!seenIds.has(player.id)) {
                allResults.push({
                    ...player,
                    name: player.currentName,
                    isOnline: false,
                    source: 'database'
                });
                seenIds.add(player.id);
            }
        }
        
        // Sort by online status first, then by name
        allResults.sort((a, b) => {
            if (a.isOnline && !b.isOnline) return -1;
            if (!a.isOnline && b.isOnline) return 1;
            return a.name.localeCompare(b.name);
        });

        // Cache results for this query
        cachedSearchResults.set(query, allResults);
        
        // Limit cache size to prevent memory issues
        if (cachedSearchResults.size > 50) {
            const firstKey = cachedSearchResults.keys().next().value;
            cachedSearchResults.delete(firstKey);
        }

        renderSearchResults(allResults, resultsDiv);
    };

    // Separate function to render results (reduces code duplication)
    const renderSearchResults = (allResults, resultsDiv) => {
        if (allResults.length === 0) {
            resultsDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic; font-size: 11px;">No players found</div>';
            return;
        }

        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();
        
        allResults.forEach(player => {
            const isAlerted = serverMonitor.alerts[player.id];
            const isSaved = serverMonitor.savedPlayers[player.id];
            
            const playerDiv = document.createElement('div');
            playerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 11px;';
            
            const playerInfo = document.createElement('div');
            playerInfo.style.cssText = 'flex: 1; overflow: hidden;';
            
            const statusColor = player.isOnline ? '#28a745' : '#6c757d';
            const statusText = player.isOnline ? 'ONLINE' : 'OFFLINE';
            
            playerInfo.innerHTML = `
                <div style="color: white; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${player.name}
                </div>
                <div style="color: ${statusColor}; font-size: 9px; margin-top: 1px;">
                    ${statusText} • ID: ${player.id}
                </div>
            `;
            
            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.cssText = 'display: flex; gap: 3px; margin-left: 5px;';
            
            // Profile button
            const profileBtn = document.createElement('button');
            profileBtn.textContent = 'Profile';
            profileBtn.title = 'View Profile';
            profileBtn.style.cssText = 'background: #17a2b8; color: white; border: none; padding: 2px 5px; border-radius: 2px; cursor: pointer; font-size: 9px;';
            profileBtn.onclick = () => window.open(`https://www.battlemetrics.com/players/${player.id}`, '_blank');
            
            // Alert button
            const alertBtn = document.createElement('button');
            alertBtn.textContent = isAlerted ? 'Remove' : 'Add Alert';
            alertBtn.title = isAlerted ? 'Remove Alert' : 'Add Alert';
            alertBtn.style.cssText = `background: ${isAlerted ? '#dc3545' : '#28a745'}; color: white; border: none; padding: 2px 5px; border-radius: 2px; cursor: pointer; font-size: 9px;`;
            alertBtn.onclick = () => togglePlayerAlert(player.name, player.id);
            
            // Save button
            const saveBtn = document.createElement('button');
            saveBtn.textContent = isSaved ? 'Saved' : 'Save';
            saveBtn.title = isSaved ? 'Already Saved' : 'Save Player';
            saveBtn.style.cssText = `background: ${isSaved ? '#6c757d' : '#28a745'}; color: white; border: none; padding: 2px 5px; border-radius: 2px; cursor: pointer; font-size: 9px;`;
            saveBtn.disabled = isSaved;
            saveBtn.onclick = () => {
                if (!isSaved) {
                    savePlayer(player.name, player.id);
                }
            };
            
            buttonsDiv.appendChild(profileBtn);
            buttonsDiv.appendChild(alertBtn);
            buttonsDiv.appendChild(saveBtn);
            
            playerDiv.appendChild(playerInfo);
            playerDiv.appendChild(buttonsDiv);
            fragment.appendChild(playerDiv);
        });
        
        // Clear and append all at once for better performance
        resultsDiv.innerHTML = '';
        resultsDiv.appendChild(fragment);
    };

    window.handlePlayerSearch = (query) => {
        // Track active search state
        activePlayerSearch = query;

        // Clear previous timer
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        if (query.length < 2) {
            activePlayerSearch = '';
            const resultsDiv = document.getElementById('search-results');
            if (resultsDiv) {
                resultsDiv.innerHTML = '';
            }
            // Clear cache when search is cleared
            cachedSearchResults.clear();
            return;
        }

        // Debounce search to reduce lag
        searchDebounceTimer = setTimeout(() => {
            if (activePlayerSearch === query) { // Only search if query hasn't changed
                performPlayerSearch(query);
            }
        }, 150); // 150ms debounce delay
    };

    // Activity search (debounced, searches activity log for name/id/action)
    let activitySearchDebounceTimer = null;
    let activeActivitySearch = '';

    window.handleActivitySearch = (query) => {
        activeActivitySearch = query;
        if (activitySearchDebounceTimer) clearTimeout(activitySearchDebounceTimer);

        if (!query || query.length < 2) {
            activeActivitySearch = '';
            if (serverMonitor) serverMonitor.updateActivityDisplay();
            return;
        }

        activitySearchDebounceTimer = setTimeout(() => {
            if (activeActivitySearch === query) {
                performActivitySearch(query);
            }
        }, 150);
    };

    const performActivitySearch = (query) => {
        if (!serverMonitor) return;
        const lower = query.toLowerCase();
        const results = [];

        // Apply time filter alongside text search
        const timeFilter = (document.getElementById('activity-time-filter') || {}).value || 'all';
        const timeCutoff = getActivityTimeCutoff(timeFilter);

        // Search from most recent to oldest for better UX
        for (let i = serverMonitor.activityLog.length - 1; i >= 0; i--) {
            const e = serverMonitor.activityLog[i];
            try {
                // Time gate first (cheap)
                if (timeCutoff > 0) {
                    const ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
                    if (ts < timeCutoff) continue;
                }
                if ((e.playerName && e.playerName.toLowerCase().includes(lower)) ||
                    (e.playerId && e.playerId.toLowerCase().includes(lower)) ||
                    (e.action && e.action.toLowerCase().includes(lower)) ||
                    (e.oldName && String(e.oldName).toLowerCase().includes(lower))) {
                    results.push(e);
                }
            } catch (err) { /* ignore */ }
            if (results.length >= 500) break; // reasonable cap
        }

        const activityDiv = document.getElementById('recent-activity-list');
        if (!activityDiv) return;

        // Update result count
        const countEl = document.getElementById('activity-result-count');
        if (countEl) countEl.textContent = `${results.length} search result${results.length !== 1 ? 's' : ''}`;

        renderActivitySearchResults(results, activityDiv);
    };

    const renderActivitySearchResults = (results, container) => {
        if (!results || results.length === 0) {
            container.innerHTML = '<div style="opacity: 0.7; font-style: italic;">No activity found</div>';
            return;
        }

        let html = '';
        results.forEach(entry => {
            html += buildActivityEntryHTML(entry);
        });

        container.innerHTML = html;
    };

    // Debounce mechanism to prevent double-clicks
    let alertToggleTimeout = null;
    
    window.togglePlayerAlert = (playerName, playerId) => {
        // Prevent rapid double-clicks
        if (alertToggleTimeout) {
            console.log('[Alert System] Ignoring rapid click');
            return;
        }
        
        alertToggleTimeout = setTimeout(() => {
            alertToggleTimeout = null;
        }, 500);
        
        debugConsole.debug('togglePlayerAlert called', { playerName, playerId });
        
        if (!serverMonitor) {
            debugConsole.error('ServerMonitor not initialized');
            alert('Server Monitor not initialized. Please refresh the page.');
            return;
        }
        
        debugConsole.debug('Current alerts', serverMonitor.alerts);
        
        const isAlerted = serverMonitor.alerts[playerId];
        debugConsole.debug('Player is currently alerted:', !!isAlerted, isAlerted);
        
        try {
            if (isAlerted) {
                debugConsole.info('Removing alert for player: ' + playerName);
                serverMonitor.removeAlert(playerId);
            } else {
                debugConsole.info('Adding alert for player: ' + playerName);
                serverMonitor.addAlert(playerName, playerId, 'both');
            }
            
            debugConsole.debug('Alert operation completed', serverMonitor.alerts);
            
            // Immediately update displays (the addAlert/removeAlert methods already call updateAlertDisplay)
            serverMonitor.updatePlayerDisplay();
            serverMonitor.updateSavedPlayersDisplay();
            
            // Clear search cache to ensure fresh results
            if (typeof cachedSearchResults !== 'undefined') {
                cachedSearchResults.clear();
            }
            
            // Refresh search results to update button states
            const searchInput = document.getElementById('player-search');
            if (searchInput && searchInput.value.length >= 2) {
                handlePlayerSearch(searchInput.value);
            }
            
            // Also update with debouncing as backup
            clearTimeout(serverMonitor.alertUpdateTimeout);
            serverMonitor.alertUpdateTimeout = setTimeout(() => {
                serverMonitor.updateAlertDisplay();
            }, 300);
            
            clearTimeout(serverMonitor.savedUpdateTimeout);
            serverMonitor.savedUpdateTimeout = setTimeout(() => {
                serverMonitor.updateSavedPlayersDisplay();
            }, 300);
            
        } catch (error) {
            debugConsole.error('Error in togglePlayerAlert', error);
            alert('Error toggling alert: ' + error.message);
        }
    };

    window.acknowledgeRecentAlert = (alertId) => {
        if (serverMonitor) {
            serverMonitor.acknowledgeAlert(alertId);
        }
    };

    window.acknowledgeAllRecentAlerts = () => {
        if (serverMonitor) {
            serverMonitor.acknowledgeAllAlerts();
        }
    };

    window.clearAllRecentAlerts = (() => {
        let pending = false;
        let timer = null;
        return (btn) => {
            if (!pending) {
                pending = true;
                if (btn) { btn.textContent = 'Sure?'; btn.style.background = '#a71d2a'; }
                timer = setTimeout(() => {
                    pending = false;
                    if (btn) { btn.textContent = '\u2715 Clear All'; btn.style.background = '#dc3545'; }
                }, 2000);
            } else {
                clearTimeout(timer);
                pending = false;
                if (btn) { btn.textContent = '\u2715 Clear All'; btn.style.background = '#dc3545'; }
                if (serverMonitor) serverMonitor.clearAllRecentAlerts();
            }
        };
    })();

    window.handleDatabaseSearch = (query) => {
        if (!serverMonitor) return;
        
        const databaseDiv = document.getElementById('player-database-list');
        if (!databaseDiv) return;

        // Track active database search state
        activeDatabaseSearch = query;

        // Show the database list when user starts searching
        if (query.length >= 2 && databaseDiv.style.display === 'none') {
            databaseDiv.style.display = 'block';
            const toggle = document.getElementById('playerdatabase-toggle');
            if (toggle) toggle.textContent = '▼';
        }

        const results = serverMonitor.searchDatabase(query);
        const sortedResults = results.sort((a, b) => b.lastSeen - a.lastSeen);
        
        if (query.length < 2) {
            activeDatabaseSearch = '';
            databaseDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic;">Type 2+ characters to search</div>';
            return;
        }
        
        if (sortedResults.length === 0) {
            databaseDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic;">No players found</div>';
            return;
        }

        serverMonitor.renderDatabasePlayers(sortedResults, databaseDiv);
    };

    window.clearPlayerSearch = () => {
        const searchInput = document.getElementById('player-search');
        const resultsDiv = document.getElementById('search-results');
        if (searchInput) {
            searchInput.value = '';
            activePlayerSearch = '';
        }
        if (resultsDiv) {
            resultsDiv.innerHTML = '';
        }
    };

    window.clearDatabaseSearch = () => {
        const searchInput = document.getElementById('database-search');
        if (searchInput) {
            searchInput.value = '';
            activeDatabaseSearch = '';
        }
        if (serverMonitor) {
            serverMonitor.updateDatabaseDisplay();
        }
    };

    window.toggleSoundAlerts = (enabled) => {
        if (serverMonitor) {
            serverMonitor.soundEnabled = enabled;
            serverMonitor.settings.soundEnabled = enabled;
            serverMonitor.saveSettings();
        }
    };

    window.changeSoundChoice = (value) => {
        if (serverMonitor) {
            serverMonitor.settings = serverMonitor.settings || {};
            serverMonitor.settings.soundChoice = value;
            serverMonitor.saveSettings();
        }
    };

    window.testSound = () => {
        if (serverMonitor) {
            // Play the currently selected sound once
            try {
                serverMonitor.playAlertSound();
            } catch (e) {
                alert('Could not play test sound: ' + e.message);
            }
        } else {
            alert('Server monitor not initialized yet.');
        }
    };

    window.toggleRepeatAlerts = (enabled) => {
        if (serverMonitor) {
            serverMonitor.settings.repeatAlerts = enabled;
            serverMonitor.saveSettings();
            
            if (!enabled) {
                serverMonitor.stopAlertReminders();
            } else {
                // Check if there are unacknowledged alerts to start reminders
                const unacknowledged = Object.values(serverMonitor.recentAlerts).filter(alert => !alert.acknowledged);
                if (unacknowledged.length > 0) {
                    serverMonitor.startAlertReminders();
                }
            }
        }
    };

    window.changeNewPlayerWindow = (ms) => {
        if (serverMonitor) {
            serverMonitor.settings.newPlayerWindowMs = parseInt(ms, 10);
            serverMonitor.saveSettings();
            // Refresh activity display so [NEW] badges update immediately
            serverMonitor.updateActivityDisplay();
        }
    };

    window.changeRepeatInterval = (ms) => {
        if (serverMonitor) {
            serverMonitor.settings.repeatIntervalMs = parseInt(ms, 10);
            serverMonitor.saveSettings();
            // Restart the reminder timer with the new interval if it's running
            if (alertReminderInterval) {
                serverMonitor.stopAlertReminders();
                serverMonitor.startAlertReminders();
            }
        }
    };

    window.toggleAutoRefresh = (enabled) => {
        const { ms } = loadAutoRefreshSettings();
        saveAutoRefreshSettings(enabled, ms);
        if (enabled) {
            startAutoRefresh(ms);
        } else {
            stopAutoRefresh();
        }
    };

    window.changeAutoRefreshInterval = (ms) => {
        ms = parseInt(ms, 10) || 120000;
        const { enabled } = loadAutoRefreshSettings();
        saveAutoRefreshSettings(enabled, ms);
        if (enabled) {
            startAutoRefresh(ms); // restart with new interval
        }
    };

    window.toggleKeepAlive = (enabled) => {
        saveKeepAliveSetting(enabled);
        const controls = document.getElementById('keep-alive-controls');
        if (controls) controls.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            startKeepAlive();
            const opened = openKeepAliveWatchdog();
            const notice = document.getElementById('keep-alive-notice');
            if (notice) {
                if (!opened) {
                    notice.style.display = 'block';
                    notice.textContent = '\u26a0 Popup blocked \u2014 click "Open Watchdog Popup" to retry.';
                } else {
                    notice.style.display = 'none';
                }
            }
        } else {
            stopKeepAlive();
        }
    };

    window.openKeepAliveWatchdogManual = () => {
        const opened = openKeepAliveWatchdog();
        const notice = document.getElementById('keep-alive-notice');
        if (notice) {
            if (!opened) {
                notice.style.display = 'block';
                notice.textContent = '\u26a0 Popup still blocked \u2014 allow popups for battlemetrics.com in browser settings.';
            } else {
                notice.style.display = 'none';
            }
        }
    };

    window.toggleMonitoring = () => {
        const btn = document.getElementById('monitoring-btn');
        if (!serverMonitor || !btn) return;

        if (serverMonitor.isMonitoring) {
            serverMonitor.stopMonitoring();
            btn.textContent = 'Start Monitoring';
            btn.style.background = '#28a745';
        } else {
            serverMonitor.startMonitoring();
            btn.textContent = 'Stop Monitoring';
            btn.style.background = '#dc3545';
        }
    };

    window.exportLog = () => {
        if (serverMonitor) {
            serverMonitor.exportActivityLog();
        }
    };

    window.clearLog = () => {
        if (serverMonitor && confirm('Are you sure you want to clear the activity log?')) {
            serverMonitor.clearActivityLog();
        }
    };

    window.resetCurrentServer = () => {
        if (confirm('Are you sure you want to reset ALL data for THIS SERVER? This will clear:\n\n• All player alerts\n• Activity log\n• Settings\n• Saved players\n• Recent alerts\n• Player database\n• Population history\n\nThis action cannot be undone!')) {
            // Clear all server-specific localStorage data
            localStorage.removeItem(ALERTS_KEY);
            localStorage.removeItem(ACTIVITY_LOG_KEY);
            localStorage.removeItem(ALERT_SETTINGS_KEY);
            localStorage.removeItem(SAVED_PLAYERS_KEY);
            localStorage.removeItem(RECENT_ALERTS_KEY);
            localStorage.removeItem(PLAYER_DATABASE_KEY);
            localStorage.removeItem(POPULATION_HISTORY_KEY);
            localStorage.removeItem(LAST_PLAYER_STATE_KEY);
            
            // Reset serverMonitor if it exists
            if (serverMonitor) {
                serverMonitor.alerts = {};
                serverMonitor.activityLog = [];
                serverMonitor.settings = {};
                serverMonitor.savedPlayers = {};
                serverMonitor.recentAlerts = {};
                serverMonitor.playerDatabase = {};
                serverMonitor.populationHistory = [];
                serverMonitor.lastPlayerState = new Map();
                serverMonitor.soundEnabled = true;
                
                // Update displays
                serverMonitor.updatePlayerDisplay();
                serverMonitor.updateActivityDisplay();
                serverMonitor.updateAlertDisplay();
                serverMonitor.updateSavedPlayersDisplay();
                serverMonitor.updateRecentAlertsDisplay();
                serverMonitor.updateDatabaseDisplay();
                serverMonitor.updatePopulationDisplay();
                serverMonitor.stopAlertReminders();
                
                // Reset sound checkboxes
                const soundCheckbox = document.getElementById('sound-alerts');
                const repeatCheckbox = document.getElementById('repeat-alerts');
                if (soundCheckbox) {
                    soundCheckbox.checked = true;
                }
                if (repeatCheckbox) {
                    repeatCheckbox.checked = true;
                }
            }
            
            alert('Current server data has been reset successfully!');
        }
    };

    window.resetAllData = () => {
        if (confirm('⚠️ DANGER: Reset ALL data for ALL SERVERS?\n\nThis will permanently delete:\n• All server alerts and settings\n• All activity logs\n• All saved players\n• All player databases\n• All population history\n• UI preferences\n\nThis action cannot be undone!')) {
            // Get all localStorage keys that start with 'bms_'
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('bms_')) {
                    keysToRemove.push(key);
                }
            }
            
            // Remove all BattleMetrics Monitor data
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            // Reset current serverMonitor if it exists
            if (serverMonitor) {
                serverMonitor.alerts = {};
                serverMonitor.activityLog = [];
                serverMonitor.settings = {};
                serverMonitor.savedPlayers = {};
                serverMonitor.recentAlerts = {};
                serverMonitor.playerDatabase = {};
                serverMonitor.populationHistory = [];
                serverMonitor.lastPlayerState = new Map();
                serverMonitor.soundEnabled = true;
                
                // Update displays
                serverMonitor.updatePlayerDisplay();
                serverMonitor.updateActivityDisplay();
                serverMonitor.updateAlertDisplay();
                serverMonitor.updateSavedPlayersDisplay();
                serverMonitor.updateRecentAlertsDisplay();
                serverMonitor.updateDatabaseDisplay();
                serverMonitor.updatePopulationDisplay();
                serverMonitor.stopAlertReminders();
            }
            
            alert('All data for all servers has been permanently deleted!');
            
            // Reload page to ensure clean state
            setTimeout(() => {
                suppressKeepAliveGuard = true;
                location.reload();
            }, 1000);
        }
    };

    // ── Export helpers ─────────────────────────────────────────────────────────

    // Load and close any still-open session before exporting so the export
    // always reflects the full current session duration.
    const getSessionsForExport = (serverID) => {
        const key = `bms_script_sessions_${serverID}`;
        try {
            const sessions = JSON.parse(localStorage.getItem(key) || '[]');
            const now = Date.now();
            // Patch any still-open session with an up-to-date end time for the export
            // (doesn't actually close it — the live session stays open)
            return sessions.map(s => {
                if (s.end === null) {
                    return {
                        ...s,
                        end: now,
                        endISO: new Date(now).toISOString(),
                        durationSeconds: Math.round((now - s.start) / 1000),
                        note: 'session_still_active'
                    };
                }
                return s;
            });
        } catch (e) { return []; }
    };

    // Build the coverage gaps list from sessions (periods the script was closed)
    const buildGapsFromSessions = (sessions) => {
        if (!sessions || sessions.length < 2) return [];
        const sorted = [...sessions].sort((a, b) => a.start - b.start);
        const gaps = [];
        for (let i = 1; i < sorted.length; i++) {
            const gapStart = sorted[i - 1].end;
            const gapEnd = sorted[i].start;
            if (gapStart && gapEnd && gapEnd > gapStart) {
                const durationSeconds = Math.round((gapEnd - gapStart) / 1000);
                gaps.push({
                    gapStart,
                    gapStartISO: sorted[i - 1].endISO,
                    gapEnd,
                    gapEndISO: sorted[i].startISO,
                    durationSeconds,
                    note: 'script_was_closed_during_this_period'
                });
            }
        }
        return gaps;
    };

    window.exportCurrentServer = () => {
        if (!serverMonitor) {
            alert('No server monitor data available to export.');
            return;
        }

        const sessions = getSessionsForExport(currentServerID);

        const exportData = {
            _format: 'bms_server_export_v2',
            exportDate: new Date().toISOString(),
            serverID: currentServerID,
            serverName: currentServerName,
            analysis_hints: {
                activity_log: 'Each entry has timestamp (ms epoch), utcISO, dayOfWeek (0=Sun), hourUTC, hourLocal, action (joined/left/name_changed), playerName, playerId',
                script_sessions: 'Periods the script was actively running. Gaps between sessions = data was NOT being collected.',
                coverage_gaps: 'Explicit list of time ranges when the script was closed. Player activity during gaps was NOT logged.',
                player_database: 'All players ever seen. currentName = latest known name. previousNames = name history.'
            },
            script_sessions: sessions,
            coverage_gaps: buildGapsFromSessions(sessions),
            activity_log: serverMonitor.activityLog,
            player_database: serverMonitor.playerDatabase,
            population_history: serverMonitor.populationHistory,
            alerts: serverMonitor.alerts,
            saved_players: serverMonitor.savedPlayers,
            recent_alerts: serverMonitor.recentAlerts,
            settings: serverMonitor.settings
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bms_server_${currentServerID}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Server data exported successfully!');
    };

    window.exportAllServers = () => {
        // Collect all server IDs from localStorage keys
        const serverIDs = new Set();
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('bms_')) continue;
            const m = key.match(/bms_(?:player_alerts|activity_log|player_database|population_history)_(\d+)/);
            if (m) serverIDs.add(m[1]);
        }

        if (serverIDs.size === 0) {
            alert('No BattleMetrics Monitor data found to export.');
            return;
        }

        const loadKey = (key, defaultVal) => {
            try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultVal)); }
            catch (e) { return defaultVal; }
        };

        const servers = [];
        for (const sid of serverIDs) {
            const sessions  = getSessionsForExport(sid);
            const actLog    = loadKey(`bms_activity_log_${sid}`, []);
            const playerDB  = loadKey(`bms_player_database_${sid}`, {});
            const popHist   = loadKey(`bms_population_history_${sid}`, []);
            const alerts    = loadKey(`bms_player_alerts_${sid}`, {});
            const saved     = loadKey(`bms_saved_players_${sid}`, {});

            // Try to resolve server name from activity log or player DB
            let sName = '';
            if (sid === currentServerID) sName = currentServerName;
            if (!sName && actLog.length) sName = actLog[actLog.length - 1].serverName || '';
            if (!sName && sessions.length) sName = sessions[sessions.length - 1].serverName || '';
            if (!sName) sName = `Server ${sid}`;

            servers.push({
                serverID: sid,
                serverName: sName,
                script_sessions: sessions,
                coverage_gaps: buildGapsFromSessions(sessions),
                activity_log: actLog,
                player_database: playerDB,
                population_history: popHist,
                alerts,
                saved_players: saved
            });
        }

        const exportData = {
            _format: 'bms_all_servers_export_v2',
            exportDate: new Date().toISOString(),
            totalServers: servers.length,
            analysis_hints: {
                servers: 'Array of server objects. Each has activity_log, player_database, script_sessions, coverage_gaps.',
                activity_log: 'Chronological events: joined/left/name_changed. Fields: timestamp(ms), utcISO, dayOfWeek(0=Sun..6=Sat), hourUTC, hourLocal, playerName, playerId, action.',
                script_sessions: 'Time windows when the script was running. start/end are ms epoch. durationSeconds = how long that session lasted.',
                coverage_gaps: 'Time ranges between sessions when no data was collected (script was closed). Use these to exclude gaps from pattern analysis.',
                population_history: 'Array of {timestamp, count} snapshots of online player count over time.',
                player_database: 'Keyed by playerId. Fields: currentName, originalName, previousNames[], firstSeen(ms), lastSeen(ms), nameChanged, manuallyAdded.',
                usage_tips: [
                    'To find when a player is usually online: filter activity_log by playerId, extract hourLocal from "joined" actions, group by hour.',
                    'To find peak server hours: group activity_log joined events by hourLocal and count.',
                    'Ignore events inside coverage_gaps when computing absence patterns — the data is simply missing, not that they were offline.',
                    'dayOfWeek 0=Sunday, 1=Monday... 6=Saturday.'
                ]
            },
            servers
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bms_all_servers_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(`Exported data from ${servers.length} server(s).`);
    };

    window.exportActivityLog = () => {
        if (!serverMonitor) { alert('No server monitor data available.'); return; }
        const sessions = getSessionsForExport(currentServerID);
        const exportData = {
            _format: 'bms_activity_log_v2',
            serverID: currentServerID,
            serverName: currentServerName,
            exportDate: new Date().toISOString(),
            analysis_hints: {
                activity_log: 'Chronological events. Fields: timestamp(ms epoch), utcISO, dayOfWeek(0=Sun..6=Sat), hourUTC, hourLocal, action(joined/left/name_changed), playerName, playerId.',
                script_sessions: 'When the script was running. Use coverage_gaps to know when data was NOT being collected.',
                coverage_gaps: 'Periods the script was closed — no player events were captured during these times.'
            },
            script_sessions: sessions,
            coverage_gaps: buildGapsFromSessions(sessions),
            activity_log: serverMonitor.activityLog
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bms_activity_log_${currentServerID}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(`Activity log exported (${serverMonitor.activityLog.length} entries, ${sessions.length} sessions).`);
    };

    window.exportPlayerDatabase = () => {
        if (!serverMonitor) { alert('No server monitor data available.'); return; }
        const db = serverMonitor.playerDatabase || {};
        const count = Object.keys(db).length;
        if (!count) { alert('Player database is empty.'); return; }
        const exportData = {
            serverID: currentServerID,
            serverName: currentServerName,
            exportDate: new Date().toISOString(),
            playerDatabase: db
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bms_player_database_${currentServerID}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(`Player database exported (${count} players).`);
    };

    window.exportSavedPlayers = () => {
        if (!serverMonitor) { alert('No server monitor data available.'); return; }
        const saved = serverMonitor.savedPlayers || {};
        const count = Object.keys(saved).length;
        if (!count) { alert('No saved players found.'); return; }
        const exportData = {
            serverID: currentServerID,
            serverName: currentServerName,
            exportDate: new Date().toISOString(),
            savedPlayers: saved
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bms_saved_players_${currentServerID}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(`Saved players exported (${count} players).`);
    };

    window.exportAlerts = () => {
        if (!serverMonitor) { alert('No server monitor data available.'); return; }
        const alerts = serverMonitor.alerts || {};
        const count = Object.keys(alerts).length;
        if (!count) { alert('No alert players found.'); return; }
        const exportData = {
            serverID: currentServerID,
            serverName: currentServerName,
            exportDate: new Date().toISOString(),
            alerts: alerts
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bms_alert_players_${currentServerID}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(`Alert players exported (${count} players).`);
    };

    window.importPlayerDatabase = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            document.body.removeChild(input);
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                let parsed;
                try {
                    parsed = JSON.parse(e.target.result);
                } catch (err) {
                    alert('Failed to parse JSON file. Make sure it is a valid player database export.');
                    return;
                }

                // Accept either a raw {id: entry} map or an export envelope with a playerDatabase key
                const incoming = (parsed && typeof parsed.playerDatabase === 'object' && parsed.playerDatabase !== null)
                    ? parsed.playerDatabase
                    : (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null);

                if (!incoming) {
                    alert('Unrecognised format. Expected a player database export file.');
                    return;
                }

                // Validate that it looks like a player DB (values should have id/currentName)
                const entries = Object.entries(incoming);
                if (entries.length === 0) { alert('Imported file contains no player entries.'); return; }
                const sample = entries[0][1];
                if (!sample || (typeof sample.currentName === 'undefined' && typeof sample.originalName === 'undefined')) {
                    alert('Unrecognised format — entries do not look like player records.');
                    return;
                }

                if (!serverMonitor) { alert('No active server monitor.'); return; }

                const db = serverMonitor.playerDatabase;
                let added = 0, merged = 0;

                for (const [id, incoming_player] of entries) {
                    const existing = db[id];
                    if (!existing) {
                        // Brand new player — import as-is (sanitise fields we rely on)
                        db[id] = {
                            id: id,
                            currentName: incoming_player.currentName || incoming_player.originalName || id,
                            originalName: incoming_player.originalName || incoming_player.currentName || id,
                            firstSeen: incoming_player.firstSeen || Date.now(),
                            lastSeen: incoming_player.lastSeen || Date.now(),
                            nameChanged: !!(incoming_player.nameChanged || (incoming_player.previousNames && incoming_player.previousNames.length > 0)),
                            previousNames: Array.isArray(incoming_player.previousNames) ? [...incoming_player.previousNames] : []
                        };
                        added++;
                    } else {
                        // Merge into existing record
                        // 1. Merge previousNames — collect all unique names (case+whitespace insensitive)
                        const normalise = n => (n || '').trim().toLowerCase();
                        const nameStr = e => (typeof e === 'string' ? e : (e && e.name) || '');
                        const allNames = new Map(); // normalised -> entry (string or object)
                        // seed with existing names, preserving original entries
                        for (const e of (existing.previousNames || [])) allNames.set(normalise(nameStr(e)), e);
                        // add incoming previousNames
                        for (const e of (incoming_player.previousNames || [])) {
                            if (!allNames.has(normalise(nameStr(e)))) allNames.set(normalise(nameStr(e)), e);
                        }
                        // make sure neither currentName ends up in previousNames
                        const currentNorm = normalise(existing.currentName);
                        allNames.delete(currentNorm);

                        // 2. If incoming has a more-recent currentName, push the old current into history
                        const incomingLastSeen = incoming_player.lastSeen || 0;
                        if (incomingLastSeen > (existing.lastSeen || 0)) {
                            const incomingCurrent = incoming_player.currentName || '';
                            if (incomingCurrent && normalise(incomingCurrent) !== normalise(existing.currentName)) {
                                // old current name goes to history — use object format if we know when
                                if (!allNames.has(currentNorm)) {
                                    allNames.set(currentNorm, { name: existing.currentName, changedAt: existing.lastSeen || null, changedAtISO: existing.lastSeen ? new Date(existing.lastSeen).toISOString() : null });
                                }
                                existing.currentName = incomingCurrent;
                                existing.nameChanged = true;
                            }
                            existing.lastSeen = incomingLastSeen;
                        }

                        // 3. Keep earliest firstSeen
                        if (incoming_player.firstSeen && incoming_player.firstSeen < (existing.firstSeen || Infinity)) {
                            existing.firstSeen = incoming_player.firstSeen;
                            // originalName should reflect the earliest known name
                            existing.originalName = incoming_player.originalName || incoming_player.currentName || existing.originalName;
                        }

                        // 4. Remove current name from history again in case merge added it
                        allNames.delete(normalise(existing.currentName));

                        existing.previousNames = [...allNames.values()];
                        existing.nameChanged = existing.nameChanged || existing.previousNames.length > 0;
                        merged++;
                    }
                }

                serverMonitor.savePlayerDatabase();
                serverMonitor.updateDatabaseDisplay();
                alert(`Import complete!\n\nNew players added: ${added}\nExisting players merged: ${merged}\nTotal in database: ${Object.keys(db).length}`);
            };
            reader.readAsText(file);
        });
        input.click();
    };

    window.savePlayer = (playerName, playerId) => {
        if (serverMonitor) {
            serverMonitor.savePlayer(playerName, playerId);
            serverMonitor.updateSavedPlayersDisplay();
            
            // Clear search cache to ensure fresh results
            if (typeof cachedSearchResults !== 'undefined') {
                cachedSearchResults.clear();
            }
            
            // Refresh search results to update button states
            const searchInput = document.getElementById('player-search');
            if (searchInput && searchInput.value.length >= 2) {
                handlePlayerSearch(searchInput.value);
            }
        }
    };

    window.removeSavedPlayer = (playerId) => {
        if (serverMonitor) {
            serverMonitor.removeSavedPlayer(playerId);
            serverMonitor.updateSavedPlayersDisplay();
            
            // Clear search cache to ensure fresh results
            if (typeof cachedSearchResults !== 'undefined') {
                cachedSearchResults.clear();
            }
            
            // Refresh search results to update button states
            const searchInput = document.getElementById('player-search');
            if (searchInput && searchInput.value.length >= 2) {
                handlePlayerSearch(searchInput.value);
            }
        }
    };

    // Shared pending-confirm map for double-click confirmations
    const _pendingConfirm = new Map();

    window.confirmDeleteSavedPlayer = (playerId, btn) => {
        const key = 'del_' + playerId;
        if (_pendingConfirm.has(key)) {
            clearTimeout(_pendingConfirm.get(key));
            _pendingConfirm.delete(key);
            window.removeSavedPlayer(playerId);
        } else {
            const origText = btn.textContent;
            const origBg = btn.style.background;
            btn.textContent = 'Sure?';
            btn.style.background = '#a71d2a';
            const t = setTimeout(() => {
                _pendingConfirm.delete(key);
                if (btn) { btn.textContent = origText; btn.style.background = origBg; }
            }, 2000);
            _pendingConfirm.set(key, t);
        }
    };

    window.confirmRemoveAlert = (displayName, playerId, btn) => {
        const key = 'alert_' + playerId;
        if (_pendingConfirm.has(key)) {
            clearTimeout(_pendingConfirm.get(key));
            _pendingConfirm.delete(key);
            window.togglePlayerAlert(displayName, playerId);
        } else {
            const origText = btn.textContent;
            const origBg = btn.style.background;
            btn.textContent = 'Sure?';
            btn.style.background = '#a71d2a';
            const t = setTimeout(() => {
                _pendingConfirm.delete(key);
                if (btn) { btn.textContent = origText; btn.style.background = origBg; }
            }, 2000);
            _pendingConfirm.set(key, t);
        }
    };

    // Show player history modal (tabs: Session History, Name History, Notes)
    window.showNameHistory = (playerId) => {
        if (!serverMonitor) return;
        const dbPlayer = serverMonitor.playerDatabase[playerId];
        if (!dbPlayer) {
            alert('No player history found for ID: ' + playerId);
            return;
        }

        const existing = document.getElementById('bms-name-history-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'bms-name-history-modal';
        modal.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:20000;display:flex;align-items:center;justify-content:center;';
        modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });

        const box = document.createElement('div');
        box.style.cssText = 'background:#2c3e50;color:white;padding:16px;border-radius:8px;width:500px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,0.6);';

        // ── Header ──────────────────────────────────────────────────
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;';
        const isOnline = serverMonitor.currentPlayers.has(playerId);
        const onlineDot = isOnline ? '<span style="color:#28a745;margin-right:6px;">●</span>' : '<span style="color:#dc3545;margin-right:6px;">●</span>';
        header.innerHTML = `<div style="font-weight:bold;font-size:15px;">${onlineDot}${dbPlayer.currentName.replace(/</g,'&lt;')}</div>`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:transparent;color:#aaa;border:none;font-size:16px;cursor:pointer;padding:0 4px;';
        closeBtn.onclick = () => modal.remove();
        header.appendChild(closeBtn);
        box.appendChild(header);

        // ── Sub-info ─────────────────────────────────────────────────
        const subInfo = document.createElement('div');
        subInfo.style.cssText = 'font-size:11px;color:#adb5bd;margin-bottom:10px;flex-shrink:0;';
        subInfo.innerHTML = `ID: ${dbPlayer.id} &nbsp;|&nbsp; First seen: ${dbPlayer.firstSeen ? new Date(dbPlayer.firstSeen).toLocaleString() : 'N/A'} &nbsp;|&nbsp; Last seen: ${dbPlayer.lastSeen ? new Date(dbPlayer.lastSeen).toLocaleString() : 'N/A'} &nbsp;|&nbsp; Detections: ${dbPlayer.seenCount || 1}×`;
        box.appendChild(subInfo);

        // ── Tabs ─────────────────────────────────────────────────────
        const TABS = ['Session History', 'Name History', 'Notes', 'Possible Alts'];
        let activeTab = 'Session History';

        const tabBar = document.createElement('div');
        tabBar.style.cssText = 'display:flex;gap:4px;margin-bottom:10px;flex-shrink:0;';

        const tabContent = document.createElement('div');
        tabContent.style.cssText = 'overflow-y:auto;flex:1;font-size:12px;';

        const renderTab = (tab) => {
            activeTab = tab;
            // Update tab button styles
            tabBar.querySelectorAll('button').forEach(btn => {
                btn.style.background = btn.dataset.tab === tab ? '#6f42c1' : 'rgba(255,255,255,0.07)';
                btn.style.color = btn.dataset.tab === tab ? 'white' : '#adb5bd';
            });
            tabContent.innerHTML = '';

            if (tab === 'Session History') {
                // Build session pairs from the activity log for this player
                const playerLog = serverMonitor.activityLog.filter(e => e.playerId === playerId);
                if (playerLog.length === 0) {
                    tabContent.innerHTML = '<div style="opacity:0.6;padding:8px;">No activity recorded yet.</div>';
                    return;
                }

                // Pair joins with the next leave to show sessions
                const sessions = [];
                let pendingJoin = null;
                for (const entry of playerLog) {
                    if (entry.action === 'joined') {
                        pendingJoin = entry;
                    } else if (entry.action === 'left') {
                        const joinTime = pendingJoin ? pendingJoin.timestamp : null;
                        const duration = joinTime ? Math.round((entry.timestamp - joinTime) / 60000) : null;
                        sessions.push({ join: pendingJoin, leave: entry, duration });
                        pendingJoin = null;
                    } else if (entry.action === 'name_changed') {
                        sessions.push({ nameChange: entry });
                    }
                }
                if (pendingJoin) {
                    sessions.push({ join: pendingJoin, leave: null, duration: null, stillOnline: isOnline });
                }

                // Most recent first
                sessions.reverse();

                let html = `<div style="margin-bottom:6px;color:#adb5bd;">${sessions.length} session(s) / events recorded</div>`;
                for (const s of sessions) {
                    if (s.nameChange) {
                        html += `<div style="padding:6px 8px;margin-bottom:4px;border-radius:4px;background:rgba(255,193,7,0.08);border-left:3px solid #ffc107;">
                            <span style="color:#ffc107;">✏ Name changed</span>
                            <span style="color:#adb5bd;margin-left:6px;font-size:10px;">${s.nameChange.time || new Date(s.nameChange.timestamp).toLocaleString()}</span>
                            <div style="font-size:11px;color:#e9ecef;margin-top:2px;"><span style="text-decoration:line-through;opacity:0.6;">${(s.nameChange.oldName||'?').replace(/</g,'&lt;')}</span> → <strong>${s.nameChange.playerName.replace(/</g,'&lt;')}</strong></div>
                        </div>`;
                        continue;
                    }
                    const joinStr = s.join ? (s.join.time || new Date(s.join.timestamp).toLocaleString()) : '—';
                    const leaveStr = s.leave ? (s.leave.time || new Date(s.leave.timestamp).toLocaleString()) : (s.stillOnline ? '<span style="color:#28a745;">Still online</span>' : '—');
                    const durStr = s.duration !== null ? (s.duration < 60 ? `${s.duration}m` : `${(s.duration/60).toFixed(1)}h`) : '?';
                    const nameAtJoin = s.join ? s.join.playerName : (s.leave ? s.leave.playerName : '');
                    html += `<div style="padding:6px 8px;margin-bottom:4px;border-radius:4px;background:rgba(255,255,255,0.04);border-left:3px solid ${s.stillOnline ? '#28a745' : '#6c757d'};">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:#28a745;font-size:11px;">▶ ${joinStr}</span>
                            <span style="color:#6c757d;font-size:10px;">${s.duration !== null ? durStr : ''}</span>
                            <span style="color:#dc3545;font-size:11px;">◀ ${typeof leaveStr === 'string' ? leaveStr : ''}</span>
                        </div>
                        ${nameAtJoin && nameAtJoin !== dbPlayer.currentName ? `<div style="font-size:10px;color:#adb5bd;margin-top:2px;">Playing as: ${nameAtJoin.replace(/</g,'&lt;')}</div>` : ''}
                    </div>`;
                }
                tabContent.innerHTML = html;

            } else if (tab === 'Name History') {
                const _ns = e => (typeof e === 'string' ? e : (e && e.name) || '');
                const _ts = e => (e && e.changedAt ? new Date(e.changedAt).toLocaleString() : null);
                const prev = dbPlayer.previousNames && dbPlayer.previousNames.length ? dbPlayer.previousNames.slice().reverse() : [];

                let html = `<div style="margin-bottom:8px;"><strong>Current:</strong> ${dbPlayer.currentName.replace(/</g,'&lt;')}</div>
                            <div style="margin-bottom:8px;"><strong>Original:</strong> ${(dbPlayer.originalName || dbPlayer.currentName).replace(/</g,'&lt;')}</div>`;
                if (prev.length === 0) {
                    html += '<div style="opacity:0.6;">No previous names recorded.</div>';
                } else {
                    html += `<div style="font-weight:bold;margin-bottom:6px;">Previous names (${prev.length}):</div>`;
                    for (const entry of prev) {
                        const nameText = _ns(entry).replace(/</g,'&lt;');
                        const dateText = _ts(entry) || 'date unknown';
                        html += `<div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                            <span>${nameText}</span>
                            <span style="font-size:10px;color:#6c757d;white-space:nowrap;">${dateText}</span>
                        </div>`;
                    }
                }

                // Reset button inline at bottom
                html += `<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
                    <button onclick="window.resetNameHistory('${playerId}'); document.getElementById('bms-name-history-modal')?.remove();"
                            style="background:#dc3545;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Reset History</button>
                </div>`;
                tabContent.innerHTML = html;

            } else if (tab === 'Possible Alts') {
                const alts = detectAlts(playerId);
                if (alts.length === 0) {
                    tabContent.innerHTML = `<div style="opacity:0.6;padding:8px;">No alt handoffs detected.<br>
                        <span style="font-size:10px;">Looking for the relay pattern: this player leaves → candidate joins (or vice versa), ≥${MIN_HANDOFFS} times, at ≥${MIN_HANDOFF_RATE*100}% of sessions. They must not be online at the same time.</span></div>`;
                } else {
                    let html = `<div style="font-size:10px;color:#adb5bd;margin-bottom:8px;">Relay pattern detected: one account logs off and the other joins shortly after (up to 30 min). They are rarely online simultaneously.</div>`;
                    for (const alt of alts) {
                        const altOnline = serverMonitor.currentPlayers.has(alt.playerId);
                        const dot = altOnline ? '<span style="color:#28a745;">●</span>' : '<span style="color:#6c757d;">●</span>';
                        const safeAltId = String(alt.playerId);
                        const safeAltName = alt.player.currentName.replace(/'/g,"&#39;").replace(/</g,'&lt;');
                        const overlapBadge = alt.overlap === 0
                            ? '<span style="color:#28a745;font-size:9px;"> ✓ never overlap</span>'
                            : `<span style="color:#adb5bd;font-size:9px;"> · overlap: ${alt.overlap}x</span>`;
                        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 8px;margin-bottom:4px;border-radius:4px;background:rgba(255,193,7,0.07);border-left:3px solid #ffc107;">
                            <div>
                                <div style="font-weight:bold;">${dot} ${alt.player.currentName.replace(/</g,'&lt;')}</div>
                                <div style="font-size:10px;color:#adb5bd;">
                                    ID: ${safeAltId} &nbsp;|&nbsp;
                                    <span title="This player left → candidate joined">→ ${alt.atob}</span> &nbsp;
                                    <span title="Candidate left → this player joined">← ${alt.btoa}</span> &nbsp;handoffs &nbsp;|&nbsp;
                                    rate: ${alt.coverage}%${overlapBadge}
                                </div>
                            </div>
                            <div style="display:flex;gap:4px;">
                                <button onclick="window.open('https://www.battlemetrics.com/players/${safeAltId}','_blank')" style="background:#17a2b8;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;">Profile</button>
                                <button onclick="window.showNameHistory('${safeAltId}')" style="background:#6f42c1;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;">History</button>
                                <button onclick="togglePlayerAlert('${safeAltName}','${safeAltId}')" style="background:#28a745;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;">Alert</button>
                            </div>
                        </div>`;
                    }
                    tabContent.innerHTML = html;
                }

            } else if (tab === 'Notes') {
                const existing = serverMonitor.playerNotes && serverMonitor.playerNotes[playerId];
                const currentText = existing ? existing.text : '';
                const updatedAt = existing && existing.updatedAt ? new Date(existing.updatedAt).toLocaleString() : null;

                const wrapper = document.createElement('div');
                if (updatedAt) {
                    const ts = document.createElement('div');
                    ts.className = 'bms-note-ts';
                    ts.style.cssText = 'font-size:10px;color:#6c757d;margin-bottom:6px;';
                    ts.textContent = `Last updated: ${updatedAt}`;
                    wrapper.appendChild(ts);
                }
                const textarea = document.createElement('textarea');
                textarea.value = currentText;
                textarea.placeholder = 'Add your notes about this player here…';
                textarea.style.cssText = 'width:100%;height:130px;resize:vertical;background:rgba(255,255,255,0.07);color:white;border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:8px;font-size:12px;box-sizing:border-box;';
                wrapper.appendChild(textarea);

                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;';

                const saveNoteBtn = document.createElement('button');
                saveNoteBtn.textContent = 'Save Note';
                saveNoteBtn.style.cssText = 'background:#28a745;color:white;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:11px;';
                saveNoteBtn.onclick = () => {
                    serverMonitor.setPlayerNote(playerId, textarea.value);
                    serverMonitor.updateDatabaseDisplay();
                    saveNoteBtn.textContent = 'Saved ✓';
                    saveNoteBtn.style.background = '#17a2b8';
                    setTimeout(() => { saveNoteBtn.textContent = 'Save Note'; saveNoteBtn.style.background = '#28a745'; }, 1500);
                    // Update or create the timestamp div
                    let tsDiv = wrapper.querySelector('.bms-note-ts');
                    if (!tsDiv) {
                        tsDiv = document.createElement('div');
                        tsDiv.className = 'bms-note-ts';
                        tsDiv.style.cssText = 'font-size:10px;color:#6c757d;margin-bottom:6px;';
                        wrapper.insertBefore(tsDiv, textarea);
                    }
                    tsDiv.textContent = `Last updated: ${new Date().toLocaleString()}`;
                };

                const clearNoteBtn = document.createElement('button');
                clearNoteBtn.textContent = 'Clear';
                clearNoteBtn.style.cssText = 'background:#dc3545;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px;';
                clearNoteBtn.onclick = () => {
                    textarea.value = '';
                    serverMonitor.setPlayerNote(playerId, '');
                    serverMonitor.updateDatabaseDisplay();
                };

                btnRow.appendChild(clearNoteBtn);
                btnRow.appendChild(saveNoteBtn);
                wrapper.appendChild(btnRow);
                tabContent.appendChild(wrapper);
            }
        };

        TABS.forEach(tab => {
            const btn = document.createElement('button');
            btn.textContent = tab;
            btn.dataset.tab = tab;
            const isAltTab = tab === 'Possible Alts';
            btn.style.cssText = `background:rgba(255,255,255,0.07);color:${isAltTab ? '#ffc107' : '#adb5bd'};border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px;`;
            btn.onclick = () => renderTab(tab);
            tabBar.appendChild(btn);
        });

        box.appendChild(tabBar);
        box.appendChild(tabContent);
        modal.appendChild(box);
        document.body.appendChild(modal);
        renderTab('Session History');
    };

    window.resetNameHistory = (playerId) => {
        if (!serverMonitor) return;
        const dbPlayer = serverMonitor.playerDatabase[playerId];
        if (!dbPlayer) return;
        dbPlayer.previousNames = [];
        dbPlayer.nameChanged = false;
        serverMonitor.savePlayerDatabase();
        serverMonitor.updateDatabaseDisplay();
        serverMonitor.updateSavedPlayersDisplay();
        serverMonitor.updateAlertDisplay();
        alert('Name history reset for ' + (dbPlayer.currentName || playerId));
    };

    // Quick Notes shortcut — opens History modal directly on the Notes tab
    window.showPlayerNote = (playerId) => {
        window.showNameHistory(playerId);
        // After modal renders, switch to Notes tab
        setTimeout(() => {
            const tabBar = document.querySelector('#bms-name-history-modal [data-tab="Notes"]');
            if (tabBar) tabBar.click();
        }, 50);
    };

    window.showPlayerAlts = (playerId) => {
        window.showNameHistory(playerId);
        // After modal renders, switch to Possible Alts tab
        setTimeout(() => {
            const tabBtn = document.querySelector('#bms-name-history-modal [data-tab="Possible Alts"]');
            if (tabBtn) tabBtn.click();
        }, 50);
    };

    // ── Alts Detection ───────────────────────────────────────────────────────
    // Detects the HANDOFF pattern used by alt accounts:
    //   A leaves ──[0 – SWITCH_MAX min]──► B joins   (A→B handoff)
    //   B leaves ──[0 – SWITCH_MAX min]──► A joins   (B→A handoff)
    //
    // True alts swap accounts — they are almost never online simultaneously.
    // This is the opposite of "session mirroring" (players who play together).
    //
    // Thresholds tuned for real usage: fast switch ~3 min, slow switch ~30 min.
    // Requires ≥ MIN_HANDOFFS total handoffs AND a ≥ MIN_RATE fraction of the
    // target's leave events, and the candidate must NOT already be online when the
    // target leaves (otherwise they're just co-players, not alts).
    const SWITCH_MAX_MS    = 30 * 60 * 1000; // 30 min — covers slow/chilled switches
    const MIN_HANDOFFS     = 3;              // ≥3 total (A→B + B→A)
    const MIN_HANDOFF_RATE = 0.25;           // ≥25% of target's leave events

    // Build complete sessions (join→leave pairs) for a player.
    const buildSessions = (log, pid) => {
        const sessions = [];
        let pending = null;
        for (const e of log) {
            if (e.playerId !== pid) continue;
            if (e.action === 'joined') {
                pending = e;
            } else if (e.action === 'left' && pending) {
                sessions.push({ join: pending.timestamp, leave: e.timestamp });
                pending = null;
            }
        }
        if (pending) sessions.push({ join: pending.timestamp, leave: null }); // still online
        return sessions;
    };

    // Returns true if a player (given their sessions) was online at timestamp t.
    const wasOnlineAt = (sessions, t) => {
        for (const s of sessions) {
            const leaveT = s.leave ?? Date.now();
            if (s.join <= t && t <= leaveT) return true;
        }
        return false;
    };

    // Count how many of targetSessions temporally overlap with candSessions.
    // Used as an informational "how often were they on together" signal.
    const countOverlap = (targetSessions, candSessions) => {
        let n = 0;
        for (const tS of targetSessions) {
            if (!tS.leave) continue;
            for (const cS of candSessions) {
                const cLeave = cS.leave ?? Date.now();
                if (Math.max(tS.join, cS.join) < Math.min(tS.leave, cLeave)) {
                    n++;
                    break;
                }
            }
        }
        return n;
    };

    const detectAlts = (targetId) => {
        if (!serverMonitor) return [];
        const log = serverMonitor.activityLog;

        const targetLeaveEvts = log.filter(e => e.playerId === targetId && e.action === 'left');
        const targetJoinEvts  = log.filter(e => e.playerId === targetId && e.action === 'joined');
        if (targetLeaveEvts.length === 0) return [];

        const targetSessions = buildSessions(log, targetId);

        // Collect all other player IDs seen in the log
        const otherIds = new Set();
        for (const e of log) {
            if (e.playerId && e.playerId !== targetId) otherIds.add(e.playerId);
        }

        const results = [];
        for (const pid of otherIds) {
            const candJoinEvts  = log.filter(e => e.playerId === pid && e.action === 'joined');
            const candLeaveEvts = log.filter(e => e.playerId === pid && e.action === 'left');
            const candSessions  = buildSessions(log, pid);

            // ── A→B handoffs: target leaves (and candidate is NOT already online),
            //    then candidate joins within the switch window.
            let atob = 0;
            const usedCandJoins = new Set();
            for (const tLeave of targetLeaveEvts) {
                // Skip: candidate was already online when target left → they're co-players
                if (wasOnlineAt(candSessions, tLeave.timestamp)) continue;
                let bestIdx = -1, bestDiff = Infinity;
                for (let i = 0; i < candJoinEvts.length; i++) {
                    if (usedCandJoins.has(i)) continue;
                    const diff = candJoinEvts[i].timestamp - tLeave.timestamp;
                    if (diff >= 0 && diff <= SWITCH_MAX_MS && diff < bestDiff) {
                        bestDiff = diff;
                        bestIdx = i;
                    }
                }
                if (bestIdx !== -1) { atob++; usedCandJoins.add(bestIdx); }
            }

            // ── B→A handoffs: candidate leaves (and target is NOT already online),
            //    then target joins within the switch window.
            let btoa = 0;
            const usedTargetJoins = new Set();
            for (const cLeave of candLeaveEvts) {
                if (wasOnlineAt(targetSessions, cLeave.timestamp)) continue;
                let bestIdx = -1, bestDiff = Infinity;
                for (let i = 0; i < targetJoinEvts.length; i++) {
                    if (usedTargetJoins.has(i)) continue;
                    const diff = targetJoinEvts[i].timestamp - cLeave.timestamp;
                    if (diff >= 0 && diff <= SWITCH_MAX_MS && diff < bestDiff) {
                        bestDiff = diff;
                        bestIdx = i;
                    }
                }
                if (bestIdx !== -1) { btoa++; usedTargetJoins.add(bestIdx); }
            }

            const total = atob + btoa;
            if (total < MIN_HANDOFFS) continue;

            // Handoff rate: what fraction of the target's leave events triggered a handoff
            const rate = total / Math.max(targetLeaveEvts.length, 1);
            if (rate < MIN_HANDOFF_RATE) continue;

            // Overlap: how many of target's complete sessions had candidate also online
            const completeTgt = targetSessions.filter(s => s.leave !== null);
            const overlap = countOverlap(completeTgt, candSessions);

            results.push({
                playerId: pid,
                matches: total,
                atob,
                btoa,
                overlap,
                coverage: Math.round(rate * 100),
                player: serverMonitor.playerDatabase[pid] || { currentName: `Player ${pid}`, id: pid }
            });
        }

        return results.sort((a, b) => b.matches - a.matches);
    };

    window.showAltsModal = (playerId) => {
        if (!serverMonitor) return;
        const dbPlayer = serverMonitor.playerDatabase[playerId];
        const displayName = dbPlayer ? dbPlayer.currentName : `Player ${playerId}`;

        const existing = document.getElementById('bms-alts-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'bms-alts-modal';
        modal.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:20001;display:flex;align-items:center;justify-content:center;';
        modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });

        const box = document.createElement('div');
        box.style.cssText = 'background:#2c3e50;color:white;padding:16px;border-radius:8px;width:460px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,0.6);';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;';
        header.innerHTML = `<div style="font-weight:bold;font-size:14px;">🔍 Possible Alts — ${displayName.replace(/</g,'&lt;')}</div>`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:transparent;color:#aaa;border:none;font-size:16px;cursor:pointer;';
        closeBtn.onclick = () => modal.remove();
        header.appendChild(closeBtn);
        box.appendChild(header);

        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:10px;color:#adb5bd;margin-bottom:10px;flex-shrink:0;';
        desc.textContent = `Players who joined or left within ~5 minutes of ${displayName} at least twice — potential alts or frequent co-players.`;
        box.appendChild(desc);

        const content = document.createElement('div');
        content.style.cssText = 'overflow-y:auto;flex:1;font-size:12px;';

        const alts = detectAlts(playerId);
        if (alts.length === 0) {
            content.innerHTML = '<div style="opacity:0.6;padding:8px;">No suspicious timing matches found.</div>';
        } else {
            let html = '';
            for (const alt of alts) {
                const isOnline = serverMonitor.currentPlayers.has(alt.playerId);
                const dot = isOnline ? '<span style="color:#28a745;">●</span>' : '<span style="color:#6c757d;">●</span>';
                const safeId = String(alt.playerId);
                const safeName = alt.player.currentName.replace(/'/g,"&#39;").replace(/</g,'&lt;');
                html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 8px;margin-bottom:4px;border-radius:4px;background:rgba(255,193,7,0.07);border-left:3px solid #ffc107;">
                    <div>
                        <div style="font-weight:bold;">${dot} ${alt.player.currentName.replace(/</g,'&lt;')}</div>
                        <div style="font-size:10px;color:#adb5bd;">ID: ${safeId} &nbsp;|&nbsp; ${alt.matches} timing match${alt.matches > 1 ? 'es' : ''}</div>
                    </div>
                    <div style="display:flex;gap:4px;">
                        <button onclick="window.open('https://www.battlemetrics.com/players/${safeId}','_blank')" style="background:#17a2b8;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;">Profile</button>
                        <button onclick="window.showNameHistory('${safeId}')" style="background:#6f42c1;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;">History</button>
                        <button onclick="togglePlayerAlert('${safeName}','${safeId}')" style="background:#28a745;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:9px;">Alert</button>
                    </div>
                </div>`;
            }
            content.innerHTML = html;
        }

        box.appendChild(content);
        modal.appendChild(box);
        document.body.appendChild(modal);
    };

    // Filter functions

    // Shared helper: builds HTML for a single activity entry.
    // Used by both applyActivityFilters and renderActivitySearchResults so display is always consistent.
    // Cache for first-detection lookups — invalidated when activityLog grows
    let _fdCacheSize = -1;
    let _fdMap = new Map(); // playerId -> earliest timestamp in activityLog
    const getFirstDetectionMap = () => {
        if (!serverMonitor) return _fdMap;
        const log = serverMonitor.activityLog;
        if (log.length === _fdCacheSize) return _fdMap;
        _fdMap = new Map();
        for (const e of log) {
            if (e.playerId && (!_fdMap.has(e.playerId) || e.timestamp < _fdMap.get(e.playerId))) {
                _fdMap.set(e.playerId, e.timestamp);
            }
        }
        _fdCacheSize = log.length;
        return _fdMap;
    };

    // Returns the configured "new player" wear-off window in ms (default 6h)
    const getNewPlayerWindowMs = () => {
        return (serverMonitor && serverMonitor.settings && serverMonitor.settings.newPlayerWindowMs)
            ? serverMonitor.settings.newPlayerWindowMs
            : 6 * 60 * 60 * 1000;
    };

    // True if this entry is the player's very first detection AND it happened within the wear-off window
    const checkIsNewPlayer = (entry) => {
        if (!entry.playerId) return false;
        const fdMap = getFirstDetectionMap();
        const firstTs = fdMap.get(entry.playerId);
        if (firstTs === undefined || firstTs !== entry.timestamp) return false; // not first entry
        return (Date.now() - firstTs) < getNewPlayerWindowMs();
    };

    const buildActivityEntryHTML = (entry) => {
        const timeAgo  = toRelativeTime(entry.timestamp);
        const hasAlert = serverMonitor && serverMonitor.alerts[entry.playerId];
        const isSaved  = serverMonitor && serverMonitor.savedPlayers[entry.playerId];
        const dbPlayer = serverMonitor && serverMonitor.playerDatabase && serverMonitor.playerDatabase[entry.playerId];
        const fdMap    = getFirstDetectionMap();
        const isNewPlayer = checkIsNewPlayer(entry);

        // Escape single/double quotes so player names with apostrophes don't break onclick attributes
        const safeName = String(entry.playerName || '').replace(/'/g, '&#39;').replace(/"/g, '&#34;');
        const safeId   = String(entry.playerId || '');

        let mainLine = '';
        let actionColor = '#6c757d';
        let actionLabel = '';

        if (entry.action === 'joined') {
            mainLine = `▶ <strong>${entry.playerName}</strong> <span style="font-weight:normal;opacity:0.85">joined the game</span>`;
            actionColor = '#28a745';
            actionLabel = 'Joined';
        } else if (entry.action === 'left') {
            mainLine = `◀ <strong>${entry.playerName}</strong> <span style="font-weight:normal;opacity:0.85">left the game</span>`;
            actionColor = '#dc3545';
            actionLabel = 'Left';
        } else if (entry.action === 'name_changed') {
            const oldName = entry.oldName || '?';
            // Show: ✏  PreviousName  →  NewName
            // Strikethrough on old, bold on new so the change is obvious at a glance
            mainLine = `✏ <span style="opacity:0.65;text-decoration:line-through">${oldName}</span> <span style="opacity:0.75">→</span> <strong>${entry.playerName}</strong>`;
            actionColor = '#ffc107';
            actionLabel = 'Name Changed';
        } else if (entry.action === 'alt_detected') {
            const altName = entry.altPlayerName || `Player ${entry.altPlayerId}`;
            mainLine = `🔍 <strong>${entry.playerName}</strong> <span style="font-weight:normal;opacity:0.85">may be an alt of</span> <strong>${altName}</strong>`;
            actionColor = '#ffc107';
            actionLabel = `Alt Suspected · ${entry.altMatches} sessions · ${entry.altCoverage}%`;
        } else {
            mainLine = `${entry.playerName} ${entry.action}`;
            actionLabel = entry.action;
        }

        const timeStr = entry.time || new Date(entry.timestamp).toLocaleString();
        // Metadata row: action type · relative time · exact time · ID
        const metaLine = `${actionLabel} · ${timeAgo} · ${timeStr} · ID: ${safeId}`;

        // Show History for any name_changed entry — player is always in the DB at this point
        const showHistory = entry.action === 'name_changed' && !!dbPlayer;

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 12px;">
                <div style="flex: 1; min-width: 0; margin-right: 6px;">
                    <div style="color: ${actionColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${mainLine}
                        ${isNewPlayer ? '<span style="color: #17a2b8; margin-left: 5px; font-size: 10px;">[NEW]</span>' : ''}
                        ${hasAlert ? '<span style="color: #ffc107; margin-left: 5px; font-size: 10px;">[ALERT]</span>' : ''}
                        ${isSaved  ? '<span style="color: #28a745;  margin-left: 5px; font-size: 10px;">[SAVED]</span>'  : ''}
                    </div>
                    <div style="opacity: 0.55; font-size: 10px; margin-top: 2px; word-break: break-word;">${metaLine}</div>
                </div>
                <div style="display: flex; gap: 3px; flex-shrink: 0;">
                    <button onclick="window.open('https://www.battlemetrics.com/players/${safeId}', '_blank')"
                            style="background: #17a2b8; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                            title="View Profile">Profile</button>
                    <button onclick="togglePlayerAlert('${safeName}', '${safeId}')"
                            style="background: ${hasAlert ? '#dc3545' : '#28a745'}; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                            title="${hasAlert ? 'Remove Alert' : 'Add Alert'}">${hasAlert ? 'Remove' : 'Add Alert'}</button>
                    <button onclick="savePlayer('${safeName}', '${safeId}')"
                            style="background: ${isSaved ? '#6c757d' : '#28a745'}; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                            title="${isSaved ? 'Already Saved' : 'Save Player'}" ${isSaved ? 'disabled' : ''}>${isSaved ? 'Saved' : 'Save'}</button>
                    <button onclick="showPlayerNote('${safeId}')"
                            style="background: ${(serverMonitor && serverMonitor.playerNotes && serverMonitor.playerNotes[safeId]) ? '#17a2b8' : '#495057'}; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;"
                            title="Notes">Notes</button>
                    <button onclick="showNameHistory('${safeId}')" style="background: #6f42c1; color: white; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 9px;" title="View session history">History</button>
                </div>
            </div>
        `;
    };

    // Helper: convert time filter value to a cutoff timestamp (0 = no cutoff)
    const getActivityTimeCutoff = (timeFilter) => {
        const now = Date.now();
        switch (timeFilter) {
            case '1h':  return now - (1 * 60 * 60 * 1000);
            case '3h':  return now - (3 * 60 * 60 * 1000);
            case '6h':  return now - (6 * 60 * 60 * 1000);
            case '24h': return now - (24 * 60 * 60 * 1000);
            case '7d':  return now - (7 * 24 * 60 * 60 * 1000);
            default:    return 0;
        }
    };

    // Unified activity filter — reads both action select and time select, renders result
    window.applyActivityFilters = () => {
        if (!serverMonitor) return;

        const activityDiv = document.getElementById('recent-activity-list');
        if (!activityDiv) return;

        const actionFilter = (document.getElementById('activity-filter') || {}).value || 'all';
        const timeFilter  = (document.getElementById('activity-time-filter') || {}).value || 'all';
        const timeCutoff  = getActivityTimeCutoff(timeFilter);

        let filtered = serverMonitor.activityLog;

        // Apply action filter
        if (actionFilter === 'new_players') {
            // Show only each player's first-ever entry, and only if still within wear-off window
            const fdMap = getFirstDetectionMap();
            const windowMs = getNewPlayerWindowMs();
            filtered = filtered.filter(e => {
                if (!e.playerId) return false;
                const firstTs = fdMap.get(e.playerId);
                return firstTs === e.timestamp && (Date.now() - firstTs) < windowMs;
            });
        } else if (actionFilter !== 'all') {
            filtered = filtered.filter(e => e.action === actionFilter);
        }

        // Apply time filter
        if (timeCutoff > 0) {
            filtered = filtered.filter(e => {
                const ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime();
                return ts >= timeCutoff;
            });
        }

        // Sort most recent first (full list, no arbitrary cap)
        const sorted = filtered.slice().reverse();

        // Update result count
        const countEl = document.getElementById('activity-result-count');
        if (countEl) {
            const total = serverMonitor.activityLog.length;
            if (sorted.length === total) {
                countEl.textContent = `${total} total entries`;
            } else {
                countEl.textContent = `Showing ${sorted.length} of ${total} entries`;
            }
        }

        if (sorted.length === 0) {
            activityDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic;">No activity matches filter</div>';
            return;
        }

        let activityHTML = '';
        sorted.forEach(entry => {
            activityHTML += buildActivityEntryHTML(entry);
        });

        activityDiv.innerHTML = activityHTML;
    };

    // Backward-compat wrapper: callers passing 'joined'/'left'/etc. still work
    window.filterActivity = (actionType) => {
        const sel = document.getElementById('activity-filter');
        if (sel) sel.value = actionType || 'all';
        window.applyActivityFilters();
    };

    window.clearActivityFilter = () => {
        const filterSelect = document.getElementById('activity-filter');
        const timeSelect = document.getElementById('activity-time-filter');
        const searchInput = document.getElementById('activity-search');
        const countEl = document.getElementById('activity-result-count');

        if (filterSelect) filterSelect.value = 'all';
        if (timeSelect) timeSelect.value = 'all';
        if (countEl) countEl.textContent = '';

        activeActivitySearch = '';
        if (searchInput) searchInput.value = '';

        if (serverMonitor) serverMonitor.updateActivityDisplay();
    };


    window.filterDatabase = (filterType) => {
        if (!serverMonitor) return;
        
        const databaseDiv = document.getElementById('player-database-list');
        if (!databaseDiv) return;

        let filteredPlayers = Object.values(serverMonitor.playerDatabase);
        const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000);

        switch (filterType) {
            case 'online':
                filteredPlayers = filteredPlayers.filter(player => serverMonitor.currentPlayers.has(player.id));
                break;
            case 'offline':
                filteredPlayers = filteredPlayers.filter(player => !serverMonitor.currentPlayers.has(player.id));
                break;
            case 'name-changed':
                filteredPlayers = filteredPlayers.filter(player => player.nameChanged);
                break;
            case 'all':
            default:
                // Show all
                break;
        }

        // Sort by online status first, then by last seen
        filteredPlayers.sort((a, b) => {
            const aOnline = serverMonitor.currentPlayers.has(a.id);
            const bOnline = serverMonitor.currentPlayers.has(b.id);
            
            if (aOnline && !bOnline) return -1;
            if (!aOnline && bOnline) return 1;
            
            return b.lastSeen - a.lastSeen;
        });

        if (filteredPlayers.length === 0) {
            databaseDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic;">No players match filter</div>';
            return;
        }

        serverMonitor.renderDatabasePlayers(filteredPlayers, databaseDiv);
    };

    window.clearDatabaseFilter = () => {
        const filterSelect = document.getElementById('database-filter');
        if (filterSelect) {
            filterSelect.value = 'all';
            filterDatabase('all');
        }
    };

    window.manuallyAddPlayer = () => {
        const idInput = document.getElementById('manual-add-id');
        const nicknameInput = document.getElementById('manual-add-nickname');
        const alertCheckbox = document.getElementById('manual-add-alert');
        if (!idInput) return;

        const rawId = idInput.value.trim();
        if (!rawId) {
            idInput.focus();
            idInput.style.outline = '1px solid #dc3545';
            setTimeout(() => { idInput.style.outline = ''; }, 1500);
            return;
        }

        // Validate: only digits
        if (!/^\d+$/.test(rawId)) {
            idInput.style.outline = '1px solid #dc3545';
            setTimeout(() => { idInput.style.outline = ''; }, 1500);
            return;
        }

        if (!serverMonitor) return;

        const nickname = nicknameInput ? nicknameInput.value.trim() : '';
        const displayName = nickname || 'Unknown Player';
        const wantAlert = alertCheckbox && alertCheckbox.checked;

        // Add to database — flag as manually added so real-name updates preserve the nickname in history
        const existing = serverMonitor.playerDatabase[rawId];
        if (!existing) {
            serverMonitor.playerDatabase[rawId] = {
                id: rawId,
                currentName: displayName,
                originalName: displayName,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                nameChanged: false,
                previousNames: [],
                manuallyAdded: true,
                nickname: nickname || null
            };
            serverMonitor.savePlayerDatabase();
        }

        if (wantAlert) {
            if (!serverMonitor.alerts[rawId]) {
                serverMonitor.addAlert(displayName, rawId, 'both');
            }
        }

        serverMonitor.updateDatabaseDisplay();
        if (wantAlert) serverMonitor.updateAlertDisplay();

        // Clear inputs
        idInput.value = '';
        if (nicknameInput) nicknameInput.value = '';
        if (alertCheckbox) alertCheckbox.checked = false;
    };

    window.testSound = () => {
        if (serverMonitor) {
            console.log('Testing alert sound...');
            serverMonitor.playAlertSound();
        }
    };

    // Debug Console Functions
    window.toggleDebugMode = (enabled) => {
        console.log('[Debug Console] toggleDebugMode called with:', enabled);
        debugConsole.saveDebugSetting(enabled);
        const debugSection = document.getElementById('debug-console-section');
        console.log('[Debug Console] debugSection found:', !!debugSection);
        
        if (debugSection) {
            debugSection.style.display = enabled ? 'block' : 'none';
            console.log('[Debug Console] Section display set to:', enabled ? 'block' : 'none');
        }
        
        if (enabled) {
            debugConsole.info('Debug mode enabled by user');
            console.log('[Debug Console] Current logs count:', debugConsole.logs.length);
            // Force refresh the debug display
            setTimeout(() => {
                console.log('[Debug Console] Refreshing stats and display...');
                refreshDebugStats();
                debugConsole.updateDebugDisplay();
            }, 100);
        } else {
            debugConsole.info('Debug mode disabled by user');
        }
    };

    window.toggleVerboseDebug = (enabled) => {
        console.log('[Debug Console] toggleVerboseDebug called with:', enabled);
        if (debugConsole) {
            debugConsole.saveVerboseSetting(enabled);
            debugConsole.info('Verbose debug set to ' + enabled);
        }
    };

    window.toggleAutoExportDebug = (enabled) => {
        console.log('[Debug Console] toggleAutoExportDebug called with:', enabled);
        if (debugConsole) {
            debugConsole.saveAutoExportSetting(enabled);
            debugConsole.info('Auto-export on error set to ' + enabled);
        }
    };

    // Update check handlers
    window.toggleAutoCheckUpdates = (enabled) => {
        saveAutoCheckSetting(!!enabled);
        if (debugConsole) debugConsole.info('Auto-check updates: ' + !!enabled);
    };

    window.checkForUpdatesNow = async () => {
        try {
            await checkForUpdatesAvailable(true, true);
            if (updateAvailable) {
                showUpdateToast(`Update available v${updateAvailableVersion} — Click to install`, true, updateAvailableVersion);
            }
        } catch (e) {
            console.error('Update check failed', e);
            showUpdateToast('Update check failed: ' + (e && e.message ? e.message : ''), false);
        }
    };

    window.openInstall = () => {
        try {
            window.open(INSTALL_URL, '_blank');
        } catch (e) {
            console.error('Failed to open install URL', e);
        }
    };

    // Global error handlers to capture runtime errors into debug console
    window.addEventListener('error', (ev) => {
        try {
            const msg = ev.message || 'Window error';
            const src = ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : '';
            const err = ev.error || {};
            // Always filter obfuscated site errors (window["__f__..."] pattern)
            if (/window\[["']__f__/i.test(msg)) return;
            // Filter out noisy third-party/site errors unless verbose debug is enabled
            const isSiteError = !ev.filename || ev.filename.includes('battlemetrics.com') || ev.filename.includes('cdn.');
            if (isSiteError && debugConsole && !debugConsole.verbose) {
                // Do not log site errors in normal mode to reduce noise
                return;
            }

            // Build signature for aggregation
            let signature = msg;
            try {
                if (ev.filename) signature += ` @ ${ev.filename}`;
            } catch (e) {}

            const data = { stack: err.stack || null, error: err, src };
            if (debugConsole) {
                debugConsole.error(`Uncaught error: ${msg} ${src}`, data);
                debugConsole.recordAggregate(signature, { timestamp: new Date().toISOString(), message: msg, src, stack: err.stack || null });
                if (debugConsole.autoExportOnError) {
                    debugConsole.exportLogs();
                }
            }
        } catch (e) {
            console.error('Error in global error handler', e);
        }
    });

    window.addEventListener('unhandledrejection', (ev) => {
        try {
            const reason = ev.reason || {};
            // Ignore empty-object rejections (common noisy site behavior)
            const isEmptyObject = reason && typeof reason === 'object' && !Array.isArray(reason) && Object.keys(reason).length === 0;
            if (isEmptyObject) return;

            // Filter noisy rejections from site scripts unless verbose enabled
            const reasonStr = (reason && reason.stack) ? String(reason.stack) : (reason && reason.message) ? String(reason.message) : '';
            const isSiteRejection = reasonStr.includes('battlemetrics.com') || reasonStr.includes('cdn.battlemetrics.com') || /window\[\"__f__/i.test(reasonStr);
            if (isSiteRejection && debugConsole && !debugConsole.verbose) {
                return;
            }
            // Create a signature for aggregation
            let sig = 'UnhandledRejection';
            try {
                if (reason && reason.message) sig += `: ${reason.message}`;
            } catch (e) {}
            if (debugConsole) {
                debugConsole.error('Unhandled Promise Rejection', reason);
                debugConsole.recordAggregate(sig, { timestamp: new Date().toISOString(), reason: reasonStr || reason });
                if (debugConsole.autoExportOnError) {
                    debugConsole.exportLogs();
                }
            }
        } catch (e) {
            console.error('Error in unhandledrejection handler', e);
        }
    });

    const refreshDebugStats = () => {
        if (debugConsole) debugConsole.updateDebugStats();
    };

    window.exportDebugLogs = () => {
        debugConsole.exportLogs();
    };

    window.clearDebugLogs = () => {
        debugConsole.clearLogs();
        refreshDebugStats();
    };

    window.copyDebugLogs = () => {
        if (!debugConsole) {
            console.error('Debug console not initialized');
            return;
        }

        const debugText = debugConsole.getLogsAsText();
        
        navigator.clipboard.writeText(debugText).then(() => {
            // Show success feedback
            const copyBtn = document.querySelector('button[onclick="copyDebugLogs()"]');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                copyBtn.style.background = '#28a745';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.style.background = '#6c757d';
                }, 2000);
            }
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = debugText;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);

            const copyBtn = document.querySelector('button[onclick="copyDebugLogs()"]');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            }
        });
    };



    // Test function for debug console
    window.testDebugConsole = () => {
        console.log('[Debug Console] testDebugConsole called');
        if (!debugConsole) {
            alert('Debug console not initialized!');
            return;
        }
        
        console.log('[Debug Console] Adding test messages...');
        debugConsole.debug('Test debug message from user');
        debugConsole.info('Test info message from user');
        debugConsole.warn('Test warning message from user');
        debugConsole.error('Test error message from user');
        
        console.log('[Debug Console] Current logs after test:', debugConsole.logs.length);
        
        // Force refresh
        setTimeout(() => {
            console.log('[Debug Console] Forcing refresh...');
            refreshDebugStats();
        }, 100);
        
        console.log('Test messages added to debug console. Check the debug console section.');
    };

    // Global function to check debug console status
    window.checkDebugConsole = () => {
        console.log('=== Debug Console Status ===');
        console.log('debugConsole exists:', !!debugConsole);
        if (debugConsole) {
            console.log('debugConsole.enabled:', debugConsole.enabled);
            console.log('debugConsole.logs.length:', debugConsole.logs.length);
            console.log('Recent logs:', debugConsole.logs.slice(-5));
        }
        console.log('debug-console-section exists:', !!document.getElementById('debug-console-section'));
        console.log('debug-console-list exists:', !!document.getElementById('debug-console-list'));
        console.log('debug-stats exists:', !!document.getElementById('debug-stats'));
        console.log('============================');
    };

    // Reset settings to defaults (both global and server-specific where applicable)
    window.resetDefaultSettings = () => {
        if (!confirm('Reset all settings to defaults? This will clear debug and update prefs for this browser.')) return;

        // Global settings
        localStorage.removeItem('bms_debug_enabled');
        localStorage.removeItem('bms_debug_verbose');
        localStorage.removeItem('bms_debug_autoexport');
        localStorage.removeItem('bms_auto_check_updates');
        localStorage.removeItem(MENU_VISIBLE_KEY);
        localStorage.removeItem(AUTO_REFRESH_ENABLED_KEY);
        localStorage.removeItem(AUTO_REFRESH_MS_KEY);
        localStorage.removeItem(KEEP_ALIVE_KEY);
        localStorage.removeItem(KEEP_ALIVE_URL_KEY);
        stopAutoRefresh();
        stopKeepAlive();

        // Update auto-refresh UI
        const arToggle = document.getElementById('auto-refresh-toggle');
        if (arToggle) arToggle.checked = false;
        const arSelect = document.getElementById('auto-refresh-interval');
        if (arSelect) arSelect.value = '120000';
        // Update keep-alive UI
        const kaToggle = document.getElementById('keep-alive-toggle');
        if (kaToggle) kaToggle.checked = false;
        const kaControls = document.getElementById('keep-alive-controls');
        if (kaControls) kaControls.style.display = 'none';

        // Server-specific settings if serverMonitor exists
        if (typeof ALERT_SETTINGS_KEY !== 'undefined' && ALERT_SETTINGS_KEY) {
            localStorage.removeItem(ALERT_SETTINGS_KEY);
        }

        // Update UI and runtime objects
        if (debugConsole) {
            debugConsole.saveDebugSetting(false);
            debugConsole.saveVerboseSetting(false);
            debugConsole.saveAutoExportSetting(false);
        }

        if (serverMonitor) {
            serverMonitor.settings = {};
            serverMonitor.saveSettings();
            // refresh displays
            serverMonitor.updateDatabaseDisplay();
            serverMonitor.updateSavedPlayersDisplay();
            serverMonitor.updateAlertDisplay();
        }

        // Update settings UI checkboxes
        const debugCb = document.getElementById('debug-mode');
        const autoCheckCb = document.getElementById('auto-check-updates');
        if (debugCb) debugCb.checked = false;
        if (autoCheckCb) {
            autoCheckCb.checked = true; // default to ON
            saveAutoCheckSetting(true);
        }

        alert('Settings reset to defaults.');
    };

    // Global function to check UI elements
    window.checkAlertUI = () => {
        console.log('=== Alert UI Check ===');
        const alertDiv = document.getElementById('alert-players-list');
        const alertCount = document.getElementById('alert-count');
        const alertToggle = document.getElementById('alertplayers-toggle');
        
        console.log('alert-players-list exists:', !!alertDiv);
        console.log('alert-count exists:', !!alertCount);
        console.log('alertplayers-toggle exists:', !!alertToggle);
        
        if (alertDiv) {
            console.log('Alert div display:', alertDiv.style.display);
            console.log('Alert div innerHTML length:', alertDiv.innerHTML.length);
            console.log('Alert div content preview:', alertDiv.innerHTML.substring(0, 100));
        }
        
        if (alertCount) {
            console.log('Alert count text:', alertCount.textContent);
        }
        
        console.log('======================');
    };

    // Direct test function to force update alert display
    window.forceUpdateAlerts = () => {
        console.log('=== Force Update Alerts ===');
        if (!serverMonitor) {
            console.log('ServerMonitor not available');
            return;
        }
        
        console.log('Current alerts before update:', serverMonitor.alerts);
        console.log('Forcing updateAlertDisplay...');
        
        try {
            serverMonitor.updateAlertDisplay();
            console.log('updateAlertDisplay completed');
        } catch (error) {
            console.error('Error calling updateAlertDisplay:', error);
        }
        
        setTimeout(() => {
            checkAlertUI();
        }, 100);
        
        console.log('===============================');
    };

    // Function to manually add alert and update display
    window.manualAddAlert = (playerName, playerId) => {
        console.log('=== Manual Add Alert ===');
        if (!serverMonitor) {
            console.log('ServerMonitor not available');
            return;
        }
        
        console.log('Adding alert manually for:', playerName, playerId);
        
        // Add alert directly
        serverMonitor.alerts[playerId] = {
            name: playerName,
            type: 'both',
            added: Date.now()
        };
        serverMonitor.saveAlerts();
        
        console.log('Alert added. Current alerts:', serverMonitor.alerts);
        
        // Force update display
        const alertDiv = document.getElementById('alert-players-list');
        if (alertDiv) {
            const alertCount = Object.keys(serverMonitor.alerts).length;
            if (alertCount === 0) {
                alertDiv.innerHTML = '<div style="opacity: 0.7; font-style: italic;">No players with alerts</div>';
            } else {
                let alertHTML = '';
                Object.keys(serverMonitor.alerts).forEach(id => {
                    const alert = serverMonitor.alerts[id];
                    alertHTML += `
                        <div style="padding: 8px; margin-bottom: 5px; border-radius: 5px; background: rgba(255, 193, 7, 0.1); border-left: 3px solid #ffc107;">
                            <div style="color: #ffc107; font-weight: bold; font-size: 12px;">
                                ${alert.name} [MANUAL TEST]
                            </div>
                            <div style="font-size: 10px; opacity: 0.7;">ID: ${id}</div>
                        </div>
                    `;
                });
                alertDiv.innerHTML = alertHTML;
            }
            
            // Update count
            const alertCountSpan = document.getElementById('alert-count');
            if (alertCountSpan) {
                alertCountSpan.textContent = alertCount;
            }
            
            console.log('Display updated manually');
        } else {
            console.log('Alert div not found!');
        }
        
        console.log('========================');
    };



    // Cleanup function to remove UI elements when leaving server pages
    const cleanup = () => {
        // Stop monitoring
        if (serverMonitor) {
            serverMonitor.stopMonitoring();
            serverMonitor.stopAlertReminders();
        }
        
        // Clear intervals
        if (monitoringInterval) {
            clearInterval(monitoringInterval);
            monitoringInterval = null;
        }
        if (alertReminderInterval) {
            clearInterval(alertReminderInterval);
            alertReminderInterval = null;
        }
        if (populationStatsInterval) {
            clearInterval(populationStatsInterval);
            populationStatsInterval = null;
        }
        if (timestampRefreshInterval) {
            clearInterval(timestampRefreshInterval);
            timestampRefreshInterval = null;
        }
        
        // Remove UI elements
        const toggleBtn = document.getElementById(TOGGLE_BUTTON_ID);
        const monitor = document.getElementById(SERVER_MONITOR_ID);
        const alertPanel = document.getElementById(ALERT_PANEL_ID);
        
        if (toggleBtn) toggleBtn.remove();
        if (monitor) monitor.remove();
        if (alertPanel) alertPanel.remove();
        
        // Reset variables
        currentServerID = null;
        serverMonitor = null;
        lastPlayerList = new Map();
        currentServerName = '';
        activePlayerSearch = '';
        activeDatabaseSearch = '';
        
        console.log('BattleMetrics Monitor - Cleaned up UI elements');
    };

    // Initialize when page loads
    const initialize = () => {
        debugConsole.info('Starting initialization...');
        
        // Always cleanup first to remove any existing UI elements
        cleanup();
        
        // Check if we're on a server page - extract the actual server ID number
        const serverMatch = window.location.pathname.match(/\/servers\/[^\/]+\/(\d+)/);
        if (!serverMatch) {
            debugConsole.info('Not on a server page, skipping initialization');
            return;
        }

        const newServerID = serverMatch[1];
        
        // Debug logging
        debugConsole.debug('Current URL: ' + window.location.pathname);
        debugConsole.info('Extracted Server ID: ' + newServerID);
        
        // Check if we're already initialized for this server
        if (currentServerID === newServerID && serverMonitor) {
            debugConsole.info('Already initialized for this server, recreating UI...');
            // Recreate UI elements to ensure they're visible after navigation
            createToggleButton();
            createServerMonitor();
            
            // Update displays
            setTimeout(() => {
                if (serverMonitor) {
                    serverMonitor.updateAlertDisplay();
                    serverMonitor.updateSavedPlayersDisplay();
                    serverMonitor.updateRecentAlertsDisplay();
                    serverMonitor.updateDatabaseDisplay();
                }
            }, 500);
            return;
        }
        
        currentServerID = newServerID;
        
        // Initialize server-specific storage keys
        initializeStorageKeys(currentServerID);
        
        // Get server name from page with retry logic
        const getServerName = () => {
            // Helper function to clean extracted text from CSS and unwanted content
            const cleanServerName = (text) => {
                if (!text) return '';
                
                // Remove CSS content (anything that looks like CSS rules)
                let cleaned = text.replace(/\.css-[a-zA-Z0-9-]+\{[^}]*\}/g, '');
                
                // Remove any remaining CSS-like patterns
                cleaned = cleaned.replace(/\{[^}]*\}/g, '');
                cleaned = cleaned.replace(/\.css-[a-zA-Z0-9-]+/g, '');
                
                // Remove common CSS properties and values
                cleaned = cleaned.replace(/(display|margin|padding|font|color|background|border|width|height|position|top|left|right|bottom):[^;]*;?/gi, '');
                
                // Remove CSS pseudo-class/attribute selector sequences (e.g. :hover,:focus,.active,[disabled])
                cleaned = cleaned.replace(/(?::(?:hover|focus|active|disabled|checked|visited|focus-within|focus-visible|placeholder-shown)|\.(?:focus|active|disabled|hover)(?::[-\w]+)*|\[disabled\]|fieldset\[disabled\])[\s,]*(?:(?::[-\w]+|\.[\w-]+|\[[\w\s="'-]+\]|[\w-]+\[[\w\s="'-]+\])[\s,]*)*/gi, '');
                
                // Remove "Real-time player tracking & alerts" text
                cleaned = cleaned.replace(/Real-time\s+player\s+tracking\s*&\s*alerts/gi, '');
                
                // Remove "Server Monitor" text if it appears at the start
                cleaned = cleaned.replace(/^Server\s+Monitor/i, '');
                
                // Remove Server ID pattern
                cleaned = cleaned.replace(/Server\s+ID:\s*\d+/gi, '');
                
                // Clean up whitespace and special characters
                cleaned = cleaned.replace(/\s+/g, ' ').trim();
                
                // Remove any remaining non-printable characters
                cleaned = cleaned.replace(/[^\x20-\x7E]/g, '');
                
                return cleaned;
            };
            
            // Try multiple selectors for BattleMetrics server name
            const selectors = [
                'h2.css-u0fcdd',  // BattleMetrics specific server name class
                'h1',
                'h2',
                '.server-name',
                '[data-testid="server-name"]',
                'h1.server-title',
                'h2.server-title',
                '.server-header h1',
                '.server-header h2',
                '.server-info h1',
                '.server-info h2',
                'header h1',
                'header h2',
                '.page-header h1',
                '.page-header h2',
                '.server-details h1',
                '.server-details h2',
                'h1[class*="server"]',
                'h2[class*="server"]',
                'h1[class*="css-"]',
                'h2[class*="css-"]',
                '.server-name-display',
                '.title h1',
                '.title h2'
            ];
            
            let serverNameElement = null;
            let rawText = '';
            
            for (const selector of selectors) {
                serverNameElement = document.querySelector(selector);
                if (serverNameElement) {
                    rawText = serverNameElement.innerText || serverNameElement.textContent || '';
                    const cleanedName = cleanServerName(rawText);
                    
                    // Only accept if we have a reasonable server name (not empty, not just CSS)
                    if (cleanedName && cleanedName.length > 3 && !cleanedName.match(/^(css-|Server\s*$|undefined|null)/i)) {
                        currentServerName = cleanedName;
                        debugConsole.info('Server name found via selector "' + selector + '": ' + currentServerName);
                        debugConsole.debug('Raw text was: ' + rawText.substring(0, 100) + (rawText.length > 100 ? '...' : ''));
                        break;
                    }
                }
            }
            
            // If we still don't have a good server name, try page title
            if (!currentServerName || currentServerName.length < 3) {
                const title = document.title;
                if (title && title !== 'BattleMetrics') {
                    // Remove common suffixes from title
                    const cleanTitle = title.replace(/\s*-\s*BattleMetrics.*$/i, '').trim();
                    if (cleanTitle && cleanTitle !== 'Server' && cleanTitle.length > 3) {
                        currentServerName = cleanTitle;
                        debugConsole.info('Server name extracted from page title: ' + currentServerName);
                        // Update UI immediately
                        const serverNameSpan = document.getElementById('current-server-name');
                        if (serverNameSpan) {
                            serverNameSpan.textContent = currentServerName;
                        }
                        return;
                    }
                }
                
                currentServerName = `Server ${currentServerID}`;
                debugConsole.warn('Server name not found, using default');
            }
            
            // Update UI with the found server name
            const serverNameSpan = document.getElementById('current-server-name');
            if (serverNameSpan) {
                serverNameSpan.textContent = currentServerName;
            }
        };
        
        // Try to get server name immediately, then retry after a delay
        getServerName();
        setTimeout(getServerName, 1000);

        // Initialize components with error handling
        try {
            debugConsole.debug('Creating new ServerMonitor instance...');
            serverMonitor = new ServerMonitor();
            debugConsole.info('ServerMonitor initialized successfully');

            // ── Script Session Tracking ──────────────────────────────────────
            // Record that the script is now open so exports can show gaps when
            // the browser/tab was closed.
            const startScriptSession = () => {
                if (!SESSIONS_KEY) return;
                try {
                    const sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
                    const now = Date.now();
                    const d = new Date(now);
                    sessions.push({
                        start: now,
                        startISO: d.toISOString(),
                        end: null,
                        endISO: null,
                        durationSeconds: null,
                        serverID: currentServerID,
                        serverName: currentServerName
                    });
                    // Keep only last 500 sessions to avoid unbounded growth
                    if (sessions.length > 500) sessions.splice(0, sessions.length - 500);
                    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
                } catch (e) { /* non-fatal */ }
            };

            const closeScriptSession = () => {
                if (!SESSIONS_KEY) return;
                try {
                    const sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
                    // Find the last unclosed session for this server
                    for (let i = sessions.length - 1; i >= 0; i--) {
                        if (sessions[i].serverID === currentServerID && sessions[i].end === null) {
                            const now = Date.now();
                            sessions[i].end = now;
                            sessions[i].endISO = new Date(now).toISOString();
                            sessions[i].durationSeconds = Math.round((now - sessions[i].start) / 1000);
                            break;
                        }
                    }
                    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
                } catch (e) { /* non-fatal */ }
            };

            startScriptSession();

            // Close session when tab/window is closed or navigated away
            window.addEventListener('beforeunload', closeScriptSession);
            // Also catch tab hidden (covers many mobile + minimize cases)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    closeScriptSession();
                } else if (document.visibilityState === 'visible') {
                    // Re-open a session when tab becomes visible again
                    startScriptSession();
                }
            });
            // ─────────────────────────────────────────────────────────────────
            
            // Verify critical methods exist
            if (typeof serverMonitor.addAlert !== 'function') {
                throw new Error('ServerMonitor.addAlert method missing');
            }
            if (typeof serverMonitor.removeAlert !== 'function') {
                throw new Error('ServerMonitor.removeAlert method missing');
            }
            
            debugConsole.info('All ServerMonitor methods verified');
            
        } catch (error) {
            debugConsole.error('Failed to initialize ServerMonitor', error);
            alert('Server Monitor failed to initialize. Please refresh the page.');
            return;
        }
        
        // Create UI with retry logic
        const createUI = () => {
            try {
                debugConsole.debug('Creating toggle button...');
                createToggleButton();
                debugConsole.debug('Creating server monitor UI...');
                createServerMonitor();
                debugConsole.info('UI created successfully');
            } catch (error) {
                debugConsole.error('Error creating UI', error);
                // Retry after a short delay
                setTimeout(createUI, 1000);
            }
        };
        
        createUI();

        // Start auto-refresh if it was enabled before the last reload
        const _arSettings = loadAutoRefreshSettings();
        if (_arSettings.enabled) {
            startAutoRefresh(_arSettings.ms);
        }

        // Re-apply keep-alive protection if previously enabled.
        // Audio anti-throttle + beforeunload guard start immediately.
        // The watchdog popup cannot auto-reopen without a user gesture —
        // user must click "Open Watchdog Popup" in Settings after a reload.
        if (loadKeepAliveSetting()) {
            startKeepAlive();
        }

        // Update server ID and name display
        setTimeout(() => {
            const serverIdSpan = document.getElementById('current-server-id');
            if (serverIdSpan) {
                serverIdSpan.textContent = currentServerID;
            }
            
            const serverNameSpan = document.getElementById('current-server-name');
            if (serverNameSpan) {
                serverNameSpan.textContent = currentServerName || 'Loading...';
            }
        }, 500);
        
        // Start monitoring by default
        // Wait longer for page to fully load before starting monitoring
        setTimeout(() => {
            if (serverMonitor && !serverMonitor.isMonitoring) {
                console.log('Auto-starting monitoring after page load delay...');
                serverMonitor.startMonitoring();
                const btn = document.getElementById('monitoring-btn');
                if (btn) {
                    btn.textContent = 'Stop Monitoring';
                    btn.style.background = '#dc3545';
                }
            }
        }, 3000); // Increased from 2000ms to 3000ms
        
        // Update counts less frequently to reduce lag
        setInterval(() => {
            if (!serverMonitor) return;
            
            const playerCountSpan = document.getElementById('player-count');
            const alertCountSpan = document.getElementById('alert-count');
            const savedCountSpan = document.getElementById('saved-count');
            const recentAlertsCountSpan = document.getElementById('recent-alerts-count');
            const activityCountSpan = document.getElementById('activity-count');
            const databaseCountSpan = document.getElementById('database-count');
            
            if (playerCountSpan) playerCountSpan.textContent = serverMonitor.currentPlayers.size;
            if (alertCountSpan) alertCountSpan.textContent = Object.keys(serverMonitor.alerts).length;
            if (savedCountSpan) savedCountSpan.textContent = Object.keys(serverMonitor.savedPlayers).length;
            if (activityCountSpan) activityCountSpan.textContent = serverMonitor.activityLog.length;
            if (databaseCountSpan) databaseCountSpan.textContent = Object.keys(serverMonitor.playerDatabase).length;
            
            if (recentAlertsCountSpan) {
                const unacknowledged = Object.values(serverMonitor.recentAlerts).filter(alert => !alert.acknowledged);
                recentAlertsCountSpan.textContent = unacknowledged.length;
            }
            
            // Also update the alert and saved displays to show current online/offline status
            serverMonitor.updateAlertDisplay();
            serverMonitor.updateSavedPlayersDisplay();
        }, 3000); // Reduced from 1000ms to 3000ms

        // Initialize displays
        setTimeout(() => {
            if (serverMonitor) {
                console.log('Initializing server monitor displays...');
                serverMonitor.updateAlertDisplay();
                serverMonitor.updateSavedPlayersDisplay();
                serverMonitor.updateRecentAlertsDisplay();
                serverMonitor.updateDatabaseDisplay();
                
                // Start alert reminders if there are unacknowledged alerts
                const unacknowledged = Object.values(serverMonitor.recentAlerts).filter(alert => !alert.acknowledged);
                if (unacknowledged.length > 0) {
                    serverMonitor.startAlertReminders();
                }
                
                console.log('Server monitor initialized successfully');
            }
        }, 3000);

        console.log('BattleMetrics Server Monitor initialized for server:', currentServerID);
    };

    // Wait for page to load and initialize with better timing
    const initializeWhenReady = () => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(initialize, 1000);
            });
        } else {
            // Page already loaded, initialize immediately but with a small delay
            setTimeout(initialize, 500);
        }
    };
    
    // Try to initialize immediately if we're on a server page
    if (/\/servers\/[^\/]+\/\d+/.test(window.location.pathname)) {
        initializeWhenReady();
        

    }
    
    // Also set up a fallback initialization check
    setTimeout(() => {
        if (!document.getElementById(TOGGLE_BUTTON_ID) && /\/servers\/[^\/]+\/\d+/.test(window.location.pathname)) {
            console.log('BattleMetrics Monitor - Fallback initialization triggered');
            initialize();
        }
    }, 3000);

    // Periodic update checker
    const checkForUpdatesAvailable = async (force = false, showNoUpdateToast = false) => {
        const enabled = loadAutoCheckSetting() || force;
        if (!enabled) return;
        try {
            const resp = await fetch(GITHUB_RAW_URL, { cache: 'no-cache' });
            if (!resp || !resp.ok) return;
            const text = await resp.text();
            const m = text.match(/@version\s+([^\s\n\r]+)/i) || text.match(/const\s+SCRIPT_VERSION\s*=\s*['"]([^'"]+)['"]/i);
            if (m && m[1]) {
                const remoteVer = m[1].trim();
                if (compareVersions(remoteVer, SCRIPT_VERSION) === 1) {
                    updateAvailable = true;
                    updateAvailableVersion = remoteVer;
                    // Show banner in monitor
                    const monitor = document.getElementById(SERVER_MONITOR_ID);
                    if (monitor) {
                        let banner = document.getElementById('bms-update-banner');
                        if (!banner) {
                            banner = document.createElement('div');
                            banner.id = 'bms-update-banner';
                            banner.style.cssText = 'background:#ffc107;color:#000;padding:8px;border-radius:6px;margin-bottom:10px;cursor:pointer;font-weight:bold;text-align:center;';
                            banner.onclick = () => window.openInstall();
                            monitor.insertAdjacentElement('afterbegin', banner);
                        }
                        banner.textContent = `Update available v${remoteVer} — Click to install`;
                    }

                    // Auto-install behavior removed: users must click the update banner/toast to install.
                    // Show toast to user for forced checks or always for discovered update
                    showUpdateToast(`Update available v${remoteVer} — Click to install`, true, remoteVer);
                } else {
                    updateAvailable = false;
                    updateAvailableVersion = null;
                    const old = document.getElementById('bms-update-banner');
                    if (old) old.remove();
                    // Only show "no updates found" when explicitly requested to show (e.g., user clicked Check)
                    if (force && showNoUpdateToast) {
                        showUpdateToast(`No updates found — current v${SCRIPT_VERSION}`, false, SCRIPT_VERSION);
                    }
                }
            }
        } catch (e) {
            if (debugConsole) debugConsole.warn('Update check failed', e);
        }
    };

    // Initial check and periodic checks (every 1 minute)
    // Initial auto-check (do not show "no updates" toast on page load)
    setTimeout(() => checkForUpdatesAvailable(true, false), 2000);
    // Periodic auto-checks (quiet unless update available) - every 1 minute
    setInterval(() => checkForUpdatesAvailable(false, false), 60 * 1000);

    // Toast notification for updates
    const showUpdateToast = (message, isUpdate = false, version = '') => {
        try {
            // Remove existing toast
            const existing = document.getElementById('bms-update-toast');
            if (existing) existing.remove();

            const toast = document.createElement('div');
            toast.id = 'bms-update-toast';
            toast.style.cssText = `position: fixed; right: 20px; bottom: 20px; z-index: 20000; background: ${isUpdate ? '#ffc107' : '#6c757d'}; color: ${isUpdate ? '#000' : '#fff'}; padding: 12px 14px; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.35); cursor: pointer; font-weight:700;`;
            toast.textContent = message;

            toast.onclick = () => {
                if (isUpdate) {
                    window.openInstall();
                }
                toast.remove();
            };

            document.body.appendChild(toast);

            // Auto-hide after 8 seconds if not update; leave longer for update (15s)
            const timeout = isUpdate ? 15000 : 8000;
            setTimeout(() => {
                const t = document.getElementById('bms-update-toast');
                if (t) t.remove();
            }, timeout);
        } catch (e) {
            console.error('Failed to show update toast', e);
        }
    };

    // SIMPLE BRUTE FORCE APPROACH - Just reload if on server page without UI
    // Auto-initialization functionality (similar to player script)
    let lastURL = window.location.href;
    let autoInitInterval = null;
    
    const startAutoInit = () => {
        if (autoInitInterval) return; // Already running
        
        debugConsole.info('Starting auto-initialization functionality');
        
        // Check immediately if we're on a server page
        checkAndInitializeServer();
        
        // Set up interval to check for server page changes
        autoInitInterval = setInterval(() => {
            checkAndInitializeServer();
        }, 1000); // Check every 1 second
    };

    const stopAutoInit = () => {
        if (autoInitInterval) {
            clearInterval(autoInitInterval);
            autoInitInterval = null;
            debugConsole.info('Auto-initialization functionality stopped');
        }
    };

    const checkAndInitializeServer = () => {
        const currentURL = window.location.href;
        
        // Check if we're on a server page
        if (!currentURL.includes('/servers/')) {
            // Clear current server ID if we're not on a server page
            if (currentServerID) {
                debugConsole.info('Left server page, cleaning up');
                cleanup();
                currentServerID = null;
            }
            return;
        }
        
        // Extract server ID from URL (match any game slug, not just 'rust')
        const serverMatch = currentURL.match(/\/servers\/[^\/]+\/(\d+)/);
        if (!serverMatch) {
            return;
        }
        
        const serverID = serverMatch[1];
        
        // Check if this is a new server or URL changed
        if (currentServerID !== serverID || lastURL !== currentURL) {
            debugConsole.info(`Auto-initializing for server ${serverID}`);
            lastURL = currentURL;
            
            // Initialize for the new server
            setTimeout(() => {
                initialize();
            }, 500);
        }
    };
    
    // Start auto-initialization system
    console.log('BattleMetrics Monitor - Starting auto-initialization system...');
    startAutoInit();
    
    // That's it! Now it should catch SPA navigation!
    


})();
