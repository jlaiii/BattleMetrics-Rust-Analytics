// ==UserScript==
// @name         BM Rust Player Information
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shows true Rust hours, first seen date, and top 10 servers
// @author       jlaiii
// @match        https://www.battlemetrics.com/players/*
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

    const calculateOrReload = () => {
        const button = document.getElementById(BUTTON_ID);
        if (button) {
            button.disabled = true;
            button.textContent = "Fetching data...";
        }
        removeResults();

        try {
            const urlPlayerID = window.location.pathname.split('/players/')[1].split('/')[0];
            const dataScript = document.getElementById('storeBootstrap');
            if (!dataScript) throw new Error("Missing BattleMetrics data.");

            const pageData = JSON.parse(dataScript.textContent);
            const dataPlayerID = Object.keys(pageData.state.players.serverInfo)[0];

            // Get player name for display
            const playerData = pageData.state.players.players[urlPlayerID];
            const playerName = playerData ? playerData.name : 'Unknown Player';

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
                }
            } else {
                // Data mismatch - automatically refresh to get correct data
                console.log("BM Script: Data mismatch detected. Auto-refreshing to load correct user data.");
                const firstSeenData = { relative: "Loading...", full: null };
                showInfoBox(playerName, urlPlayerID, "Loading...", firstSeenData, [], 0, false, "Loading data for current user...");
                sessionStorage.setItem(RELOAD_FLAG, 'true');
                setTimeout(() => {
                    window.location.reload();
                }, 500);
                return;
            }
        } catch (e) {
            console.error("BM Script Error:", e);
            const firstSeenData = { relative: "Error", full: null };
            showInfoBox("Unknown Player", "N/A", "Error", firstSeenData, [], 0, true, e.message);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = "Get True Rust Hours";
            }
        }
    };

    const createButton = () => {
        // Remove existing button if it exists
        const existingBtn = document.getElementById(BUTTON_ID);
        if (existingBtn) existingBtn.remove();

        const btn = document.createElement("button");
        btn.id = BUTTON_ID;
        btn.textContent = "Get True Rust Hours";
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

    const checkForURLChange = () => {
        const currentURL = window.location.href;
        if (currentURL !== lastURL) {
            console.log("BM Script: URL change detected. Clearing old results and recreating button.");
            lastURL = currentURL;
            currentPlayerID = null;
            removeResults();
            createButton();
        }
    };

    const initializePageObserver = () => {
        // Watch for URL changes (navigation between profiles)
        const urlObserver = new MutationObserver(() => {
            checkForURLChange();
        });

        // Watch for content changes
        const contentObserver = new MutationObserver(() => {
            // Ensure button exists after content changes
            if (!document.getElementById(BUTTON_ID)) {
                createButton();
            }
        });

        const targetNode = document.getElementById('content-container') || document.body;
        urlObserver.observe(targetNode, { childList: true, subtree: true });
        contentObserver.observe(document.body, { childList: true });

        // Also check for URL changes periodically
        setInterval(checkForURLChange, 1000);
    };

    // Initialize everything
    const initialize = () => {
        createButton();
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
