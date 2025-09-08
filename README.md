# BattleMetrics Rust Analytics

A Tampermonkey user script that enhances the BattleMetrics player profile page with detailed Rust-specific player statistics.

![Screenshot of the script in action](https://i.imgur.com/pFqLkmI.png)

## Features

- **True Rust Hours**: Calculates and displays a player's total playtime exclusively on Rust servers.
- **First Seen Date**: Shows the first date the player was seen on any Rust server tracked by BattleMetrics, both as a relative time (e.g., "2 years ago") and a full date.
- **Top Servers**: Lists the top 10 Rust servers the player has spent the most time on.
- **Total Rust Servers**: Displays the total number of unique Rust servers the player has played on.

---

## Installation

This is a **user script** and requires a browser extension to run.

1.  Install a user script manager extension for your browser. Recommended options are:
    -   [**Tampermonkey**](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari)
    -   [**Greasemonkey**](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/) (Firefox)

2.  Click the "Raw" button on the script file or go to the following URL:

    `https://github.com/jlaiii/battlemetrics-rust-analytics/raw/main/BattleMetrics%20Rust%20Analytics.user.js`

3.  Your user script manager will prompt you to install the script. Review the code and confirm the installation.

---

## Usage

1.  Navigate to any player's profile page on `battlemetrics.com`.
2.  A new button labeled "**Get Rust Analytics**" will appear on the top right of the page.
3.  Click the button to fetch and display the player's Rust statistics in a new info box on the page.

If you navigate to a different player's page, the script will automatically detect the change and prompt you to get the new player's stats.

---

## Troubleshooting

-   **"Waiting for data..."** The script needs to wait for BattleMetrics to load all the player's data before it can calculate the hours. This can take a few seconds.
-   **No button appears**:
    -   Ensure you are on a player's profile page (URL should be `https://www.battlemetrics.com/players/...`).
    -   Check if your user script manager is enabled and the script is active for `battlemetrics.com`.
-   **Incorrect hours**: The script only calculates playtime on servers that have the game set to "Rust" in BattleMetrics. Playtime on incorrectly tagged servers may not be included.

---

## Contributing

Suggestions and bug reports are welcome! Please open an issue on the GitHub repository or submit a pull request with your changes.

---

## License

This project is licensed under the MIT License.
