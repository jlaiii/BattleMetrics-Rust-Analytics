# BattleMetrics Rust Analytics

Professional-grade player analytics and server monitoring tools for BattleMetrics. Enhance your Rust server administration and player analysis with comprehensive data insights and real-time monitoring capabilities.

## 🚀 Features

### Player Analytics Script
- **True Rust Hours**: Calculate accurate total playtime across all Rust servers
- **First Seen Analytics**: Track when players first appeared on Rust servers
- **Top Servers Ranking**: View players' most played servers ranked by hours
- **Auto-Pull Data**: Automatically load player analytics when visiting profile pages
- **Daily Average Calculations**: See average hours played per day
- **Collapsible Interface**: Clean, organized data presentation
- **Copy Player Information**: Export player data with one click
- **Debug Console**: Advanced logging and troubleshooting tools

### Server Monitor Script
- **Real-Time Player Alerts**: Get instant notifications when specific players join/leave
- **Population Monitoring**: Track server population with historical data and predictions
- **Player Database**: Searchable database of all players who've joined the server
- **Activity Logging**: Comprehensive logs with timestamps and player actions
- **Sound Notifications**: Audio alerts for important events
- **Saved Players Management**: Keep track of important players
- **Alert Acknowledgment System**: Manage and acknowledge notifications
- **Population Trends**: Historical data analysis and future predictions

## 📦 Installation

### Prerequisites
1. **Tampermonkey Browser Extension** - [Install from official website](https://www.tampermonkey.net/)
   - Chrome: [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - Firefox: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - Edge: [Microsoft Store](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### Script Installation
1. **Player Analytics Script**: [Install BMplayer.user.js](https://github.com/jlaiii/BattleMetrics-Rust-Analytics/raw/refs/heads/main/BMplayer.user.js)
2. **Server Monitor Script**: [Install BMserver.user.js](https://github.com/jlaiii/BattleMetrics-Rust-Analytics/raw/refs/heads/main/BMserver.user.js)

### Quick Setup
1. Install Tampermonkey extension
2. Click the script links above (Tampermonkey will handle installation)
3. Visit any BattleMetrics player or server page
4. Enhanced analytics will appear automatically

## 🎯 Usage

### Player Analytics
1. Navigate to any BattleMetrics player profile
2. Analytics will auto-load (if enabled) or click the "Get Hours" button
3. View comprehensive player statistics:
   - Total Rust hours across all servers
   - First seen date and relative time
   - Top servers by playtime
   - Daily average calculations

### Server Monitoring
1. Visit any BattleMetrics server page
2. The Server Monitor panel will appear
3. Set up player alerts for join/leave notifications
4. Monitor real-time population changes
5. Search through the player database
6. View activity logs and population trends

## ⚙️ Configuration

### Player Analytics Settings
- **Auto-Pull**: Automatically load data when visiting player pages
- **Debug Console**: Enable detailed logging for troubleshooting
- **Menu Visibility**: Show/hide the analytics interface

### Server Monitor Settings
- **Sound Alerts**: Enable/disable audio notifications
- **Repeat Alerts**: Configure alert repetition intervals
- **Population Tracking**: Monitor server population changes
- **Player Database**: Automatic player data collection

## 🔧 Technical Details

### Performance
- **Efficient Processing**: Minimal impact on BattleMetrics performance
- **Smart Caching**: Reduces API calls and improves response times
- **Debounced Operations**: Prevents excessive data processing

### Privacy & Security
- **Local Storage Only**: All data stored in your browser
- **No External Servers**: No data sent to third parties
- **Complete Privacy**: Your analytics data stays private
- **No Tracking**: Zero data collection or user tracking

### Data Storage
- Player analytics cached locally for faster loading
- Server monitoring data stored per-server
- Activity logs automatically cleaned (last 1000 entries)
- Population history kept for 24 hours

## 🐛 Troubleshooting

### Common Issues
1. **Scripts not loading**: Ensure Tampermonkey is enabled and scripts are active
2. **No data appearing**: Check if you're on a valid BattleMetrics page
3. **Performance issues**: Disable debug console if not needed
4. **Alert sounds not working**: Check browser audio permissions

### Debug Console
Both scripts include comprehensive debug consoles:
- View real-time logs and errors
- Export debug data for troubleshooting
- Monitor script performance
- Test functionality

### Getting Help
- **GitHub Issues**: [Report bugs or request features](https://github.com/jlaiii/BattleMetrics-Rust-Analytics/issues)
- **Discord Support**: [Join our Discord server](https://discord.gg/a5T2xBhKgt)

## 📊 Screenshots

### Player Analytics Interface
- Clean, professional data presentation
- Collapsible sections for organized viewing
- One-click data copying
- Real-time calculations

### Server Monitor Dashboard
- Real-time player tracking
- Population graphs and trends
- Alert management system
- Comprehensive activity logs

## 🔄 Updates

Scripts automatically update through Tampermonkey:
- Check for updates in Tampermonkey dashboard
- Updates include new features and bug fixes
- Backward compatibility maintained
- Settings preserved across updates

## 📝 Changelog

### Version 1.0.1
- Enhanced debug console system
- Improved population tracking accuracy
- Better error handling and logging
- UI/UX improvements
- Performance optimizations

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow existing code style and conventions
- Add comments for complex functionality
- Test thoroughly before submitting
- Update documentation as needed

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## ⚠️ Disclaimer

- **Not affiliated with BattleMetrics**: These are independent enhancement tools
- **Educational Purpose**: Scripts provided for analytical and educational use
- **Use Responsibly**: Respect BattleMetrics terms of service
- **No Warranty**: Scripts provided as-is without guarantees

## 🌟 Support the Project

If you find these tools useful:
- ⭐ Star the repository
- 🐛 Report bugs and issues
- 💡 Suggest new features
- 📢 Share with the Rust community
- 💬 Join our Discord for discussions

## 📞 Contact

- **GitHub**: [jlaiii](https://github.com/jlaiii)
- **Discord**: [Join our server](https://discord.gg/a5T2xBhKgt)
- **Issues**: [GitHub Issues](https://github.com/jlaiii/BattleMetrics-Rust-Analytics/issues)

---

**Made with ❤️ for the Rust community**

*Enhance your BattleMetrics experience with professional-grade analytics and monitoring tools.*
