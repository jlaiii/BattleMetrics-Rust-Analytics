// ==UserScript==
// @name         BattleMetrics Rust Analytics
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  analytics tool for BattleMetrics that displays comprehensive Rust player statistics including total playtime, first seen date, and server history
// @author       jlaiii
// @match        https://www.battlemetrics.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const INFO_BOX_ID = 'bmt-info-box';
    const BUTTON_ID = 'bmt-hour-button';
    const RELOAD_FLAG = 'bmt_force_recalc_after_load';

    let currentPlayerID = null;
    let lastURL = window.location.href;

    const removeResults = () => {
        const infoBox = document.getElementById(INFO_BOX_ID);
        if (infoBox) infoBox.remove();
    };

    const showInfoBox = (playerName, playerID, totalHours, firstSeenData, topServers, totalRustServers = 0, isError = false, errorMessage = "") => {
        removeResults();

        const infoBox = document.createElement("div");
        infoBox.id = INFO_BOX_ID;

        // Create collapsible sections
        let content = `
            <div style="border-bottom: 2px solid rgba(255,255,255,0.2); padding-bottom: 12px; margin-bottom: 15px;">
                <div style="font-size: 18px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                    Rust Player Information
                </div>
                <div style="font-size: 14px; opacity: 0.9;">
                    <strong>Player:</strong> ${playerName}<br>
                    <small>ID: ${playerID}</small>
                </div>
            </div>
        `;

        if (isError) {
            content += `
                <div style="background: rgba(220, 53, 69, 0.2); border: 1px solid #dc3545; border-radius: 5px; padding: 10px; margin-bottom: 15px;">
                    <div style="color: #ff6b6b; font-weight: bold;">Error</div>
                    <div style="font-size: 13px; margin-top: 5px;">${errorMessage}</div>
                </div>
            `;
        } else {
            // Hours section
            content += `
                <div style="background: rgba(40, 167, 69, 0.2); border: 1px solid #28a745; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                    <div style="font-size: 16px; font-weight: bold; color: #28a745; margin-bottom: 5px;">
                        True Rust Hours: ${totalHours}
                    </div>
                </div>
            `;

            // First seen section
            content += `
                <div style="background: rgba(0, 123, 255, 0.2); border: 1px solid #007bff; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                    <div style="font-size: 14px; font-weight: bold; color: #007bff; margin-bottom: 8px;">
                        First Time Seen on Rust
                    </div>
                    <div style="font-size: 13px; margin-bottom: 3px;">${firstSeenData.relative}</div>
                    ${firstSeenData.full ? `<div style="font-size: 11px; opacity: 0.8;">${firstSeenData.full}</div>` : ''}
                </div>
            `;

            // Rust servers count section
            content += `
                <div style="background: rgba(255, 193, 7, 0.2); border: 1px solid #ffc107; border-radius: 5px; padding: 12px; margin-bottom: 15px;">
                    <div style="font-size: 14px; font-weight: bold; color: #ffc107; margin-bottom: 5px;">
                        Total Rust Servers Played: ${totalRustServers}
                    </div>
                </div>
            `;

            // Top servers section
            content += `
                <div style="background: rgba(23, 162, 184, 0.2); border: 1px solid #17a2b8; border-radius: 5px; padding: 12px;">
                    <div style="font-size: 13px; font-weight: bold; color: #17a2b8; margin-bottom: 10px; cursor: pointer;" onclick="toggleServers()">
                        Top 10 Servers <span id="servers-toggle">▼</span>
                    </div>
                    <div id="servers-list" style="display: block;">
            `;

            if (topServers.length === 0) {
                content += `<div style="font-size: 13px; opacity: 0.8;">No Rust server hours found.</div>`;
            } else {
                content += `<ol style="padding-left: 20px; margin: 0; font-family: 'Courier New', Courier, monospace; font-size: 13px;">`;
                topServers.forEach(({ name, hours }) => {
                    content += `<li style="margin-bottom: 4px; line-height: 1.3;">${name} — ${hours.toFixed(2)} hrs</li>`;
                });
                content += `</ol>`;
            }

            content += `
                    </div>
                </div>
            `;
        }

        infoBox.innerHTML = content;

        Object.assign(infoBox.style, {
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

        document.body.appendChild(infoBox);

        // Add toggle functionality for servers section
        window.toggleServers = () => {
            const serversList = document.getElementById('servers-list');
            const toggle = document.getElementById('servers-toggle');
            if (serversList && toggle) {
                if (serversList.style.display === 'none') {
                    serversList.style.display = 'block';
                    toggle.textContent = '▼';
                } else {
                    serversList.style.display = 'none';
                    toggle.textContent = '▶';
                }
            }
        };
    };

    function toRelativeTime(timestamp) {
        const now = new Date();
        const past = new Date(timestamp);
        const diffInSeconds = Math.round((now - past) / 1000);

        if (diffInSeconds < 30) return 'just now';

        // Years (with decimal precision)
        if (diffInSeconds >= 31536000) {
            const years = diffInSeconds / 31536000;
            return `${years.toFixed(1)} year${years >= 2 ? 's' : ''} ago`;
        }

        // Months (with decimal precision for less than a year)
        if (diffInSeconds >= 2592000) {
            const months = diffInSeconds / 2592000;
            return `${months.toFixed(1)} month${months >= 2 ? 's' : ''} ago`;
        }

        // Days (show exact days for less than a month)
        if (diffInSeconds >= 86400) {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days} day${days > 1 ? 's' : ''} ago`;
        }

        // Hours
        if (diffInSeconds >= 3600) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }

        // Minutes
        if (diffInSeconds >= 60) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        }

        return 'a moment ago';
    }

    const calculateOrReload = (retryCount = 0) => {
        const button = document.getElementById(BUTTON_ID);
        if (button) {
            button.disabled = true;
            button.textContent = retryCount > 0 ? `Waiting for data... (${retryCount}/5)` : "Fetching data...";
        }
        removeResults();

        // Helper function to check if data is ready
        const isDataReady = () => {
            const dataScript = document.getElementById('storeBootstrap');
            if (!dataScript) return { ready: false, reason: "Missing BattleMetrics data script" };

            try {
                const pageData = JSON.parse(dataScript.textContent);
                
                // Debug logging
                console.log("BM Script Debug: pageData structure:", {
                    hasState: !!pageData?.state,
                    hasPlayers: !!pageData?.state?.players,
                    hasServerInfo: !!pageData?.state?.players?.serverInfo,
                    serverInfoKeys: pageData?.state?.players?.serverInfo ? Object.keys(pageData.state.players.serverInfo) : [],
                    hasServers: !!pageData?.state?.servers,
                    hasServersData: !!pageData?.state?.servers?.servers,
                    currentURL: window.location.href
                });
                
                if (!pageData || !pageData.state) {
                    return { ready: false, reason: "Invalid page data structure" };
                }
                
                if (!pageData.state.players || !pageData.state.players.serverInfo) {
                    return { ready: false, reason: "Player data not available" };
                }

                const serverInfoKeys = Object.keys(pageData.state.players.serverInfo);
                if (serverInfoKeys.length === 0) {
                    return { ready: false, reason: "No server information found" };
                }

                if (!pageData.state.servers || !pageData.state.servers.servers) {
                    return { ready: false, reason: "Server data not available" };
                }

                return { ready: true, pageData };
            } catch (e) {
                return { ready: false, reason: `Data parsing error: ${e.message}` };
            }
        };

        const dataCheck = isDataReady();
        
        // If data isn't ready, retry up to 8 times (longer wait for navigation)
        if (!dataCheck.ready) {
            if (retryCount < 8) {
                console.log(`BM Script: ${dataCheck.reason}, retrying in 2 seconds... (attempt ${retryCount + 1}/8)`);
                setTimeout(() => calculateOrReload(retryCount + 1), 2000);
                return;
            } else {
                // After 8 retries, try to force reload the page data
                console.log("BM Script: Data not ready after retries, attempting page reload...");
                sessionStorage.setItem(RELOAD_FLAG, 'true');
                window.location.reload();
                return;
            }
        }

        // Data is ready, proceed with processing
        try {
            const urlPlayerID = window.location.pathname.split('/players/')[1]?.split('/')[0];
            if (!urlPlayerID) throw new Error("Invalid player URL format.");

            const pageData = dataCheck.pageData;
            const serverInfoKeys = Object.keys(pageData.state.players.serverInfo);
            
            const dataPlayerID = serverInfoKeys[0];

            // Get player name for display
            let playerName = 'Unknown Player';
            if (pageData.state.players.players && pageData.state.players.players[urlPlayerID]) {
                playerName = pageData.state.players.players[urlPlayerID].name;
            } else {
                // Try to get name from page title or other sources
                const titleElement = document.querySelector('h1, .player-name, [data-testid="player-name"]');
                if (titleElement) {
                    playerName = titleElement.textContent.trim();
                }
            }

            // Update current player tracking
            currentPlayerID = urlPlayerID;

            if (urlPlayerID === dataPlayerID) {
                const serverInfo = pageData.state.players.serverInfo[urlPlayerID];
                const allServers = pageData.state.servers.servers;

                if (!serverInfo) {
                    const firstSeenData = { relative: "N/A", full: null };
                    showInfoBox(playerName, urlPlayerID, "0.00", firstSeenData, [], 0);
                } else {
                    let totalSeconds = 0;
                    let earliestRustFirstSeen = null;
                    const rustServersPlayed = [];

                    Object.values(serverInfo).forEach(playerStats => {
                        const serverId = playerStats.serverId;
                        const serverDetails = allServers[serverId];
                        if (serverDetails && serverDetails.game_id === 'rust') {
                            const timePlayed = playerStats.timePlayed || 0;
                            totalSeconds += timePlayed;

                            if (earliestRustFirstSeen === null || playerStats.firstSeen < earliestRustFirstSeen) {
                                earliestRustFirstSeen = playerStats.firstSeen;
                            }

                            rustServersPlayed.push({
                                name: serverDetails.name || "Unnamed Server",
                                seconds: timePlayed
                            });
                        }
                    });

                    const totalHours = (totalSeconds / 3600).toFixed(2);

                    let firstSeenData;
                    if (earliestRustFirstSeen) {
                        const firstSeenDate = new Date(earliestRustFirstSeen);
                        const relativeTime = toRelativeTime(earliestRustFirstSeen);
                        const fullDateString = firstSeenDate.toLocaleString();
                        firstSeenData = { relative: relativeTime, full: fullDateString };
                    } else {
                        firstSeenData = { relative: "N/A", full: null };
                    }

                    rustServersPlayed.sort((a, b) => b.seconds - a.seconds);
                    const top10 = rustServersPlayed.slice(0, 10).map(s => ({
                        name: s.name,
                        hours: s.seconds / 3600
                    }));

                    showInfoBox(playerName, urlPlayerID, totalHours, firstSeenData, top10, rustServersPlayed.length);
                    
                    // Reset button on success
                    if (button) {
                        button.disabled = false;
                        button.textContent = "Get Rust Analytics";
                    }
                }
            } else {
                // Data mismatch - wait a bit and try again, or refresh if needed
                console.log("BM Script: Data mismatch detected. Player ID from URL:", urlPlayerID, "Data ID:", dataPlayerID);
                
                // Try to use the data we have anyway if it exists
                const availableServerInfo = pageData.state.players.serverInfo[dataPlayerID];
                if (availableServerInfo) {
                    console.log("BM Script: Using available data for player:", dataPlayerID);
                    const allServers = pageData.state.servers.servers;
                    
                    let totalSeconds = 0;
                    let earliestRustFirstSeen = null;
                    const rustServersPlayed = [];

                    Object.values(availableServerInfo).forEach(playerStats => {
                        const serverId = playerStats.serverId;
                        const serverDetails = allServers[serverId];
                        if (serverDetails && serverDetails.game_id === 'rust') {
                            const timePlayed = playerStats.timePlayed || 0;
                            totalSeconds += timePlayed;

                            if (earliestRustFirstSeen === null || playerStats.firstSeen < earliestRustFirstSeen) {
                                earliestRustFirstSeen = playerStats.firstSeen;
                            }

                            rustServersPlayed.push({
                                name: serverDetails.name || "Unnamed Server",
                                seconds: timePlayed
                            });
                        }
                    });

                    const totalHours = (totalSeconds / 3600).toFixed(2);

                    let firstSeenData;
                    if (earliestRustFirstSeen) {
                        const firstSeenDate = new Date(earliestRustFirstSeen);
                        const relativeTime = toRelativeTime(earliestRustFirstSeen);
                        const fullDateString = firstSeenDate.toLocaleString();
                        firstSeenData = { relative: relativeTime, full: fullDateString };
                    } else {
                        firstSeenData = { relative: "N/A", full: null };
                    }

                    rustServersPlayed.sort((a, b) => b.seconds - a.seconds);
                    const top10 = rustServersPlayed.slice(0, 10).map(s => ({
                        name: s.name,
                        hours: s.seconds / 3600
                    }));

                    showInfoBox(playerName, urlPlayerID, totalHours, firstSeenData, top10, rustServersPlayed.length);
                    
                    // Reset button on success
                    if (button) {
                        button.disabled = false;
                        button.textContent = "Get Rust Analytics";
                    }
                } else {
                    // Last resort - refresh the page
                    console.log("BM Script: No usable data found. Auto-refreshing to load correct user data.");
                    const firstSeenData = { relative: "Loading...", full: null };
                    showInfoBox(playerName, urlPlayerID, "Loading...", firstSeenData, [], 0, false, "Loading data for current user...");
                    sessionStorage.setItem(RELOAD_FLAG, 'true');
                    setTimeout(() => {
                        window.location.reload();
                    }, 500);
                    return;
                }
            }
        } catch (e) {
            console.error("BM Script Error:", e);
            const firstSeenData = { relative: "Error", full: null };
            showInfoBox("Unknown Player", "N/A", "Error", firstSeenData, [], 0, true, e.message);
            
            // Reset button
            if (button) {
                button.disabled = false;
                button.textContent = "Get Rust Analytics";
            }
        }
    };

    const createButton = () => {
        // Remove existing button if it exists
        const existingBtn = document.getElementById(BUTTON_ID);
        if (existingBtn) existingBtn.remove();

        const btn = document.createElement("button");
        btn.id = BUTTON_ID;
        btn.textContent = "Get Rust Analytics";
        btn.onclick = calculateOrReload;
        Object.assign(btn.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: "9999",
            padding: "10px 20px",
            backgroundColor: "#007bff",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
        });
        document.body.appendChild(btn);
    };

    const waitForDataAndCreateButton = (attempt = 0) => {
        const maxAttempts = 15; // Wait longer for navigation
        
        // Check if data is ready
        const dataScript = document.getElementById('storeBootstrap');
        if (dataScript) {
            try {
                const pageData = JSON.parse(dataScript.textContent);
                if (pageData && pageData.state && pageData.state.players && pageData.state.players.serverInfo) {
                    const serverInfoKeys = Object.keys(pageData.state.players.serverInfo);
                    if (serverInfoKeys.length > 0 && pageData.state.servers && pageData.state.servers.servers) {
                        console.log("BM Script: Data is ready, creating button");
                        createButton();
                        return;
                    }
                }
            } catch (e) {
                // Data not ready yet
            }
        }
        
        // If data not ready and we haven't exceeded max attempts, try again
        if (attempt < maxAttempts) {
            console.log(`BM Script: Waiting for data to load... (${attempt + 1}/${maxAttempts})`);
            setTimeout(() => waitForDataAndCreateButton(attempt + 1), 1000);
        } else {
            console.log("BM Script: Data not ready after waiting, creating button anyway (will auto-reload when clicked)");
            createButton();
        }
    };

    const checkForURLChange = () => {
        const currentURL = window.location.href;
        if (currentURL !== lastURL) {
            console.log("BM Script: URL change detected. Clearing old results and recreating button.");
            lastURL = currentURL;
            currentPlayerID = null;
            removeResults();
            
            // Only create button on player pages, wait for data to be ready
            if (currentURL.includes('/players/')) {
                waitForDataAndCreateButton();
            }
        }
    };

    const initializePageObserver = () => {
        // Watch for URL changes (navigation between profiles)
        const urlObserver = new MutationObserver(() => {
            checkForURLChange();
        });

        // Watch for content changes
        const contentObserver = new MutationObserver((mutations) => {
            // Check if storeBootstrap script was added/modified
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.id === 'storeBootstrap') {
                        console.log("BM Script: storeBootstrap script detected, checking for button creation");
                        if (window.location.href.includes('/players/') && !document.getElementById(BUTTON_ID)) {
                            setTimeout(createButton, 500);
                        }
                    }
                });
            });
            
            // Ensure button exists after content changes on player pages
            if (window.location.href.includes('/players/') && !document.getElementById(BUTTON_ID)) {
                setTimeout(() => {
                    if (!document.getElementById(BUTTON_ID)) {
                        createButton();
                    }
                }, 1000);
            }
        });

        const targetNode = document.getElementById('content-container') || document.body;
        urlObserver.observe(targetNode, { childList: true, subtree: true });
        contentObserver.observe(document.body, { childList: true });

        // Also check for URL changes periodically
        setInterval(checkForURLChange, 1000);
        
        // Listen for browser navigation events
        window.addEventListener('popstate', checkForURLChange);
        
        // Override pushState and replaceState to catch programmatic navigation
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function() {
            originalPushState.apply(history, arguments);
            setTimeout(checkForURLChange, 100);
        };
        
        history.replaceState = function() {
            originalReplaceState.apply(history, arguments);
            setTimeout(checkForURLChange, 100);
        };
    };

    // Initialize everything
    const initialize = () => {
        // Only create button if we're on a player page
        if (window.location.href.includes('/players/')) {
            createButton();
        }
        
        initializePageObserver();

        if (sessionStorage.getItem(RELOAD_FLAG) === 'true') {
            sessionStorage.removeItem(RELOAD_FLAG);
            setTimeout(calculateOrReload, 250);
        }
    };

    // Wait for page to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
