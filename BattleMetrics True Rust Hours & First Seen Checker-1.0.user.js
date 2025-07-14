// ==UserScript==
// @name         True Rust Hours & First Seen Checker
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Instantly shows a Rust player's true in-game hours and the date they were first seen playing Rust (via BattleMetrics).
// @author       jlaiii
// @match        https://www.battlemetrics.com/players/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const HOURS_RESULT_ID = 'bmt-hour-result';
    const FIRST_SEEN_RESULT_ID = 'bmt-first-seen-result';
    const BUTTON_ID = 'bmt-hour-button';
    const RELOAD_FLAG = 'bmt_force_recalc_after_load';

    const removeResults = () => {
        const existingHours = document.getElementById(HOURS_RESULT_ID);
        if (existingHours) existingHours.remove();
        const existingFirstSeen = document.getElementById(FIRST_SEEN_RESULT_ID);
        if (existingFirstSeen) existingFirstSeen.remove();
    };

    const showHoursResult = (message, isError = false) => {
        const div = document.createElement("div");
        div.id = HOURS_RESULT_ID;
        div.textContent = message;
        div.style.position = "fixed";
        div.style.top = "60px";
        div.style.right = "20px";
        div.style.backgroundColor = isError ? "#dc3545" : "#28a745";
        div.style.color = "#fff";
        div.style.padding = "10px 20px";
        div.style.borderRadius = "5px";
        div.style.zIndex = "9999";
        div.style.fontWeight = "bold";
        div.style.fontSize = "16px";
        document.body.appendChild(div);
    };

    const showFirstSeenResult = (message, title = '', isError = false) => {
        const div = document.createElement("div");
        div.id = FIRST_SEEN_RESULT_ID;
        const timeElement = document.createElement("time");
        timeElement.textContent = message;
        if (title) {
            timeElement.title = title;
        }
        div.appendChild(timeElement);
        div.style.position = "fixed";
        div.style.top = "115px";
        div.style.right = "20px";
        div.style.backgroundColor = isError ? "#dc3545" : "#007bff";
        div.style.color = "#fff";
        div.style.padding = "8px 15px";
        div.style.borderRadius = "5px";
        div.style.zIndex = "9998";
        div.style.fontWeight = "normal";
        div.style.fontSize = "14px";
        document.body.appendChild(div);
    };

    function toRelativeTime(timestamp) {
        const now = new Date();
        const past = new Date(timestamp);
        const diffInSeconds = Math.round((now - past) / 1000);
        const units = { year: 31536000, month: 2592000, day: 86400, hour: 3600, minute: 60 };
        if (diffInSeconds < 30) return 'just now';
        for (const unit in units) {
            const interval = units[unit];
            if (diffInSeconds >= interval) {
                const count = Math.floor(diffInSeconds / interval);
                return `${count} ${unit}${count > 1 ? 's' : ''} ago`;
            }
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

            if (urlPlayerID === dataPlayerID) {
                const serverInfo = pageData.state.players.serverInfo[urlPlayerID];
                const allServers = pageData.state.servers.servers;

                if (!serverInfo) {
                    showHoursResult("True Rust Hours: 0.00");
                    showFirstSeenResult("First Time Seen on Rust: N/A");
                } else {
                    let totalSeconds = 0;
                    let earliestRustFirstSeen = null;

                    Object.values(serverInfo).forEach(playerStats => {
                        const serverId = playerStats.serverId;
                        const serverDetails = allServers[serverId];
                        if (serverDetails && serverDetails.game_id === 'rust') {
                            totalSeconds += (playerStats.timePlayed || 0);
                            const currentFirstSeen = playerStats.firstSeen;
                            if (earliestRustFirstSeen === null || currentFirstSeen < earliestRustFirstSeen) {
                                earliestRustFirstSeen = currentFirstSeen;
                            }
                        }
                    });

                    const totalHours = totalSeconds / 3600;
                    showHoursResult(`True Rust Hours: ${totalHours.toFixed(2)}`);

                    if (earliestRustFirstSeen) {
                        const firstSeenDate = new Date(earliestRustFirstSeen);
                        const relativeTime = toRelativeTime(earliestRustFirstSeen);
                        const fullDateString = firstSeenDate.toLocaleString();
                        showFirstSeenResult(`First Time Seen on Rust: ${relativeTime}`, `Date: ${fullDateString}`);
                    } else {
                        showFirstSeenResult("First Time Seen on Rust: N/A");
                    }
                }
            } else {
                sessionStorage.setItem(RELOAD_FLAG, 'true');
                window.location.reload();
            }
        } catch (e) {
            console.error("BM Script Error:", e);
            showHoursResult(`Error: ${e.message}`, true);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = "Get True Rust Hours";
            }
        }
    };

    const createButton = () => {
        if (document.getElementById(BUTTON_ID)) return;
        const btn = document.createElement("button");
        btn.id = BUTTON_ID;
        btn.textContent = "Get True Rust Hours";
        btn.onclick = calculateOrReload;
        btn.style.position = "fixed";
        btn.style.top = "20px";
        btn.style.right = "20px";
        btn.style.zIndex = "9999";
        btn.style.padding = "10px 20px";
        btn.style.backgroundColor = "#007bff";
        btn.style.color = "#fff";
        btn.style.border = "none";
        btn.style.borderRadius = "5px";
        btn.style.cursor = "pointer";
        document.body.appendChild(btn);
    };

    const initializePageObserver = () => {
        const observer = new MutationObserver(() => {
            console.log("BM Script: Page navigation detected. Clearing old results.");
            removeResults();
        });

        const targetNode = document.getElementById('content-container');
        if (targetNode) {
            observer.observe(targetNode, { childList: true });
        }
    };

    createButton();
    initializePageObserver();

    if (sessionStorage.getItem(RELOAD_FLAG) === 'true') {
        sessionStorage.removeItem(RELOAD_FLAG);
        setTimeout(calculateOrReload, 250);
    }
})();
