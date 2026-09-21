# Time Tracker

Location-based work time tracking app. Mark work days in advance, automatic timers for defined spots, time logs with export.

## Features

- **Schedule Calendar**: Mark work days weeks in advance. Tracking auto-starts on those days only
- **Location Tracking**: Always-on geolocation when app is open and today is a work day
- **Work Spots**: Define locations (office, gym, etc) with geofence radius on map
- **Auto Timer**: Runs when you're inside a spot, stops when you leave. Records timeframe
- **Time History**: See all sessions with totals per spot
- **CSV Export**: Download time logs for records
- **PWA**: Installable, works offline

## Usage

1. **Set Work Days**: Open "Schedule" tab, click dates on calendar to mark work days
2. **Create Spots**: Go to "Spots" tab, click map to create a spot, set name & radius
3. **Track**: App auto-tracks when you enter marked spots on work days
4. **View History**: See time logs in "History" tab

## Deploy to Netlify

```bash
cd time-tracker
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/time-tracker.git
git push -u origin main
```

Then on Netlify:
1. Connect repository
2. Build command: `echo 'Static site'`
3. Publish directory: `.`
4. Deploy

Or use `netlify deploy` CLI:
```bash
npm install -g netlify-cli
netlify deploy --prod
```

## Browser Permissions

- **Geolocation**: Required. App asks on first load
- **Service Worker**: For offline support

## Data Storage

- Work days saved in localStorage
- Time logs in IndexedDB (survives longer)
- All data stays on your device, never sent to server

## Technology

- Vanilla JS (no build, no dependencies except Leaflet for map)
- Leaflet + OpenStreetMap for mapping
- IndexedDB + LocalStorage for data
- Service Worker for PWA support
