// Core app logic: geolocation, geofencing, timers

class TimeTracker {
  constructor() {
    this.currentPosition = null;
    this.isTracking = false;
    this.isPaused = false;
    this.watchers = [];
    this.timers = {}; // spotId -> elapsed ms
    this.activeSpot = null;
    this.sessionStart = null;
    this.lastUpdateTime = null;
    this.workDays = []; // Array of day numbers (0-6) when user works

    this.initDB();
    this.loadSpots();
    this.loadSchedule();
    this.initTracking();
    this.initUI();
  }

  initDB() {
    // IndexedDB for time logs
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('TimeTrackerDB', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('timeLogs')) {
          db.createObjectStore('timeLogs', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('spots')) {
          db.createObjectStore('spots', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async loadSpots() {
    const db = await this.dbPromise;
    return new Promise((resolve) => {
      const tx = db.transaction('spots', 'readonly');
      const store = tx.objectStore('spots');
      const req = store.getAll();
      req.onsuccess = () => {
        this.spots = req.result;
        resolve(this.spots);
      };
    });
  }

  loadSchedule() {
    const saved = localStorage.getItem('workDays');
    if (saved) {
      this.workDays = JSON.parse(saved);
    } else {
      // Default: mark this week's weekdays as work days
      this.workDays = this.generateDefaultWeekdays();
    }
  }

  generateDefaultWeekdays() {
    const days = [];
    const today = new Date();
    const dayOfWeek = today.getDay();
    // Go back to Sunday of this week
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);

    // Add Mon-Fri (days 1-5)
    for (let i = 1; i <= 5; i++) {
      const d = new Date(sunday);
      d.setDate(d.getDate() + i);
      days.push(this.dateToString(d));
    }
    return days;
  }

  dateToString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  saveSchedule() {
    localStorage.setItem('workDays', JSON.stringify(this.workDays));
    window.dispatchEvent(new CustomEvent('scheduleUpdated'));
  }

  isWorkDay(date = new Date()) {
    const dateStr = this.dateToString(date);
    return this.workDays.includes(dateStr);
  }

  initTracking() {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      return;
    }

    // Only start tracking if today is a work day
    if (this.isWorkDay()) {
      this.startGeolocation();
    } else {
      this.isTracking = false;
      this.updateStatusUI();
    }

    // Auto-start at midnight if schedule changes
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow - now;

    setTimeout(() => this.reinitTracking(), msUntilMidnight);
  }

  reinitTracking() {
    // Stop all watchers
    this.watchers.forEach(id => navigator.geolocation.clearWatch(id));
    this.watchers = [];

    // Reinit if needed
    this.initTracking();
  }

  startGeolocation() {
    this.isTracking = true;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPositionUpdate(pos),
      (err) => this.onPositionError(err),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
    this.watchers.push(watchId);
  }

  onPositionUpdate(pos) {
    this.currentPosition = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy)
    };

    this.updateStatusUI();
    this.checkGeofences();
    this.updateTimers();

    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('positionUpdate', { detail: this.currentPosition }));
  }

  onPositionError(err) {
    console.error('Geolocation error:', err);
    this.updateStatusUI();
  }

  checkGeofences() {
    if (!this.currentPosition || !this.spots) return;
    if (this.isPaused) return;

    const { lat, lng } = this.currentPosition;
    let inSpot = null;

    for (const spot of this.spots) {
      const dist = this.distance(lat, lng, spot.lat, spot.lng);
      if (dist <= spot.radius) {
        inSpot = spot;
        break;
      }
    }

    // Spot changed
    if (inSpot?.id !== this.activeSpot?.id) {
      if (this.activeSpot) {
        this.completeSession(this.activeSpot);
      }
      if (inSpot) {
        this.startSession(inSpot);
      }
      this.activeSpot = inSpot;
      window.dispatchEvent(new CustomEvent('spotChange', { detail: inSpot }));
    }
  }

  startSession(spot) {
    this.sessionStart = Date.now();
    this.timers[spot.id] = 0;
    this.lastUpdateTime = this.sessionStart;
  }

  completeSession(spot) {
    if (!this.sessionStart) return;

    const duration = Date.now() - this.sessionStart;
    this.saveTimeLog({
      spotId: spot.id,
      spotName: spot.name,
      startTime: this.sessionStart,
      endTime: Date.now(),
      duration: duration
    });

    this.sessionStart = null;
    this.lastUpdateTime = null;
  }

  updateTimers() {
    if (!this.activeSpot || !this.sessionStart || this.isPaused) return;

    const now = Date.now();
    this.timers[this.activeSpot.id] = now - this.sessionStart;
    window.dispatchEvent(new CustomEvent('timerUpdate', { detail: {
      spotId: this.activeSpot.id,
      elapsed: this.timers[this.activeSpot.id]
    }}));
  }

  pauseTracking() {
    this.isPaused = true;
    if (this.activeSpot && this.sessionStart) {
      this.completeSession(this.activeSpot);
      this.activeSpot = null;
    }
    window.dispatchEvent(new CustomEvent('trackingPaused'));
  }

  resumeTracking() {
    this.isPaused = false;
    window.dispatchEvent(new CustomEvent('trackingResumed'));
  }

  async saveSpot(spot) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('spots', 'readwrite');
      const store = tx.objectStore('spots');
      const req = store.add(spot);
      req.onsuccess = () => {
        spot.id = req.result;
        this.spots.push(spot);
        window.dispatchEvent(new CustomEvent('spotAdded', { detail: spot }));
        resolve(spot);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteSpot(spotId) {
    const db = await this.dbPromise;
    return new Promise((resolve) => {
      const tx = db.transaction('spots', 'readwrite');
      const store = tx.objectStore('spots');
      store.delete(spotId);
      this.spots = this.spots.filter(s => s.id !== spotId);
      window.dispatchEvent(new CustomEvent('spotDeleted', { detail: spotId }));
      resolve();
    });
  }

  async saveTimeLog(log) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('timeLogs', 'readwrite');
      const store = tx.objectStore('timeLogs');
      const req = store.add(log);
      req.onsuccess = () => {
        log.id = req.result;
        window.dispatchEvent(new CustomEvent('logAdded', { detail: log }));
        resolve(log);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getTimeLogs() {
    const db = await this.dbPromise;
    return new Promise((resolve) => {
      const tx = db.transaction('timeLogs', 'readonly');
      const store = tx.objectStore('timeLogs');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
    });
  }

  async clearAllLogs() {
    const db = await this.dbPromise;
    return new Promise((resolve) => {
      const tx = db.transaction('timeLogs', 'readwrite');
      const store = tx.objectStore('timeLogs');
      store.clear();
      resolve();
    });
  }

  updateStatusUI() {
    const status = document.getElementById('status');
    if (!this.isTracking) {
      status.textContent = 'Tracking disabled';
      status.className = 'status-badge status-off';
    } else if (this.isPaused) {
      status.textContent = 'Paused';
      status.className = 'status-badge status-paused';
    } else if (this.currentPosition) {
      status.textContent = `Live (${this.currentPosition.accuracy}m acc)`;
      status.className = 'status-badge status-active';
    } else {
      status.textContent = 'Waiting for location...';
      status.className = 'status-badge';
    }

    if (this.currentPosition) {
      document.getElementById('lat').textContent = this.currentPosition.lat.toFixed(5);
      document.getElementById('lng').textContent = this.currentPosition.lng.toFixed(5);
      document.getElementById('accuracy').textContent = this.currentPosition.accuracy;
    }
  }

  initUI() {
    document.getElementById('pause-btn').addEventListener('click', () => this.pauseTracking());
    document.getElementById('resume-btn').addEventListener('click', () => this.resumeTracking());

    window.addEventListener('trackingPaused', () => {
      document.getElementById('pause-btn').style.display = 'none';
      document.getElementById('resume-btn').style.display = 'block';
    });

    window.addEventListener('trackingResumed', () => {
      document.getElementById('pause-btn').style.display = 'block';
      document.getElementById('resume-btn').style.display = 'none';
    });

    // Update UI every 100ms for timer
    setInterval(() => {
      if (this.activeSpot && this.sessionStart && !this.isPaused) {
        this.updateTimers();
      }
    }, 100);
  }

  distance(lat1, lng1, lat2, lng2) {
    // Haversine distance in meters
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  formatDuration(ms) {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    return `${String(hours).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }
}

// Global instance
const tracker = new TimeTracker();
