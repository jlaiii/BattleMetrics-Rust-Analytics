# BattleMetrics True Rust Hours

![Version](https://img.shields.io/badge/version-1.0-blue.svg)

A Tampermonkey script for serious Rust admins and players. This tool digs into BattleMetrics player profiles and reveals the two most critical statistics:

- **True total hours spent on Rust servers**
- **The first-ever tracked appearance on a Rust server**

---

## 🔍 The Problem

You check a player’s Steam profile and see "Time Played: 6,000 hours." Impressive... or is it?

They could’ve spent 6,000 of those hours AFK in the menu. This script shows you the players True Rust Hours

(Or if you're using BattleMetrics and want to see a player's total Rust hours without manually adding up each server's time.)
---

## ✅ The Solution

This script adds a single button to every BattleMetrics player profile. When clicked, it calculates and shows:

1. **Total Rust Hours** – The sum of all `timePlayed` values for Rust-identified servers.
2. **First Seen on Rust** – The earliest `firstSeen` date across all Rust servers visited.

No guessing. Just accurate, Rust-specific stats in seconds.

![Screenshot 1](https://i.imgur.com/VOd2K9k.png)

![Screenshot 2](https://i.imgur.com/kFekEq1.png)
---

## ⚙️ Features

- **Rust-Only Hour Calculation** – Filters out non-Rust servers.
- **Friendly Time Format** – Shows "2 years ago" with exact time on hover.
- **Non-Intrusive UI** – A lightweight and seamless experience.
- **Optimized Performance** – Runs only when you click the button.

---

## 🧪 Demo

1. Go to any BattleMetrics player page.
2. A new button will appear:

   ```
   [ Get True Rust Hours ]
   ```

3. Click it. The following results will appear:

   ```
   Total Rust Hours: 4321.56
   ```

   ```
   First seen on Rust: 2 years ago
   ```

   *Hover to see exact time, like:* `Date: 10/26/2021, 8:15:30 PM`

---

## 🚀 Installation

To use this script, install a user script manager like [Tampermonkey](https://www.tampermonkey.net/).

### Step-by-Step:

1. **Install a Script Manager**  
   - [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari)  
   - [Greasemonkey](https://www.greasespot.net/) (Firefox)  
   - [Violentmonkey](https://violentmonkey.github.io/) (Chrome, Firefox, Edge)  

2. **Install This Script**  

   ```
   https://github.com/jlaiii/BattleMetrics-True-Rust-Hours-First-Seen-Checker/raw/refs/heads/main/BattleMetrics%20True%20Rust%20Hours%20&%20First%20Seen%20Checker-1.0.user.js
   ```

3. Your script manager will ask you to confirm. Click **Install**.

---

## 🧠 How It Works (For Nerds)

BattleMetrics player pages include a hidden `<script id="storeBootstrap">` tag with a full JSON data dump.

The script does this:

1. Parses that JSON to grab player stats.
2. Loops through each server.
3. If `game_id === 'rust'`, it adds the `timePlayed` and checks the `firstSeen` date.
4. Shows the final results in fixed-position, styled boxes.
5. Checks for stale data (wrong player ID) and reloads the page if needed.

---

## 📜 License & Usage

This script and code are **100% created and owned by me**.

- ✅ Free to use for personal or educational purposes.
- 🚫 **Commercial use requires permission.**
- 📩 Contact me through GitHub if you plan to use this in a paid tool, service, or product.

---
