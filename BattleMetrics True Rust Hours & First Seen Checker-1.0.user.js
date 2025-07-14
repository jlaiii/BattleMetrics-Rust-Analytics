// ==UserScript==
// @name         True Rust Hours & First Seen Checker with Dynamic Top Servers Width
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shows true Rust hours, first seen date, and top 10 servers
// @author       jlaiii
// @match        https://www.battlemetrics.com/players/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const HOURS_RESULT_ID = 'bmt-hour-result';
    const FIRST_SEEN_RESULT_ID = 'bmt-first-seen-result';
    const TOP_SERVERS_CONTAINER_ID = 'bmt-top-servers-container';
    const TOP_SERVERS_TOGGLE_ID = 'bmt-top-servers-toggle';
    const BUTTON_ID = 'bmt-hour-button';
    const RELOAD_FLAG = 'bmt_force_recalc_after_load';

    const removeResults = () => {
        const idsToRemove = [HOURS_RESULT_ID, FIRST_SEEN_RESULT_ID, TOP_SERVERS_CONTAINER_ID, TOP_SERVERS_TOGGLE_ID];
        idsToRemove.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
    };

    const showHoursResult = (message, isError = false) => {
        const div = document.createElement("div");
        div.id = HOURS_RESULT_ID;
        div.textContent = message;
        Object.assign(div.style, {
            position: "fixed",
            top: "60px",
            right: "20px",
            backgroundColor: isError ? "#dc3545" : "#28a745",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: "5px",
            zIndex: "9999",
            fontWeight: "bold",
            fontSize: "16px",
            maxWidth: "400px",
            wordWrap: "break-word",
        });
        document.body.appendChild(div);
    };

    const showFirstSeenResult = (message, title = '', isError = false) => {
        const div = document.createElement("div");
        div.id = FIRST_SEEN_RESULT_ID;
        const timeElement = document.createElement("time");
        timeElement.textContent = message;
        if (title) timeElement.title = title;
        div.appendChild(timeElement);
        Object.assign(div.style, {
            position: "fixed",
            top: "110px",
            right: "20px",
            backgroundColor: isError ? "#dc3545" : "#007bff",
            color: "#fff",
            padding: "8px 15px",
            borderRadius: "5px",
            zIndex: "9998",
            fontWeight: "normal",
            fontSize: "14px",
            maxWidth: "400px",
            wordWrap: "break-word",
        });
        document.body.appendChild(div);
    };

    const createToggleButton = () => {
        if (document.getElementById(TOP_SERVERS_TOGGLE_ID)) return;
        const btn = document.createElement("button");
        btn.id = TOP_SERVERS_TOGGLE_ID;
        btn.textContent = "Show Top 10 Servers ▼";
        Object.assign(btn.style, {
            position: "fixed",
            top: "155px",
            right: "20px",
            zIndex: "10000",
            padding: "8px 15px",
            backgroundColor: "#17a2b8",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontSize: "14px",
            fontWeight: "bold",
        });
        btn.onclick = () => {
            const container = document.getElementById(TOP_SERVERS_CONTAINER_ID);
            if (!container) return;
            if (container.style.display === "none") {
                container.style.display = "block";
                btn.textContent = "Hide Top 10 Servers ▲";
            } else {
                container.style.display = "none";
                btn.textContent = "Show Top 10 Servers ▼";
            }
        };
        document.body.appendChild(btn);
    };

    // Measure text width helper (uses a canvas context)
    const measureTextWidth = (text, font) => {
        const canvas = measureTextWidth.canvas || (measureTextWidth.canvas = document.createElement("canvas"));
        const context = canvas.getContext("2d");
        context.font = font;
        return context.measureText(text).width;
    };

    const showTopServersResult = (servers) => {
        removeTopServers(); // clear existing container if any

        const container = document.createElement("div");
        container.id = TOP_SERVERS_CONTAINER_ID;

        // Choose monospace font for accurate width measurement
        const fontStyle = "14px 'Courier New', Courier, monospace";

        // Calculate max text width of server lines (name + ' — ' + hours + ' hrs')
        let maxText = "";
        servers.forEach(({ name, hours }) => {
            const line = `${name} — ${hours.toFixed(2)} hrs`;
            if (line.length > maxText.length) maxText = line;
        });

        // Measure text width in pixels, add padding, min 600px, max 900px
        let measuredWidth = measureTextWidth(maxText, fontStyle) + 60; // add some padding
        if (measuredWidth < 600) measuredWidth = 600;
        if (measuredWidth > 900) measuredWidth = 900;

        Object.assign(container.style, {
            position: "fixed",
            top: "195px",
            right: "20px",
            backgroundColor: "#17a2b8",
            color: "#fff",
            padding: "15px 20px",
            borderRadius: "5px",
            zIndex: "9997",
            fontWeight: "normal",
            fontSize: "14px",
            fontFamily: fontStyle,
            maxHeight: "400px",
            overflowY: "auto",
            whiteSpace: "nowrap", // prevent wrapping
            width: `${measuredWidth}px`,
            boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
            display: servers.length ? "block" : "none",
        });

        if (servers.length === 0) {
            container.textContent = "No Rust server hours found.";
        } else {
            const title = document.createElement("div");
            title.textContent = "Top 10 Rust Servers by Hours:";
            title.style.fontWeight = "bold";
            title.style.marginBottom = "10px";
            title.style.fontSize = "16px";
            container.appendChild(title);

            const list = document.createElement("ol");
            list.style.paddingLeft = "20px";

            servers.forEach(({ name, hours }) => {
                const item = document.createElement("li");
                item.style.marginBottom = "6px";
                item.textContent = `${name} — ${hours.toFixed(2)} hrs`;
                list.appendChild(item);
            });

            container.appendChild(list);
        }

        document.body.appendChild(container);
    };

    const removeTopServers = () => {
        const container = document.getElementById(TOP_SERVERS_CONTAINER_ID);
        if (container) container.remove();
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
                    showTopServersResult([]);
                    createToggleButton();
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

                    rustServersPlayed.sort((a, b) => b.seconds - a.seconds);
                    const top10 = rustServersPlayed.slice(0, 10).map(s => ({
                        name: s.name,
                        hours: s.seconds / 3600
                    }));
                    showTopServersResult(top10);
                    createToggleButton();
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
