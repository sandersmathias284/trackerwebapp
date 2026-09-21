// UI layer: map, spots management, history display

class TimeTrackerUI {
  constructor() {
    this.map = null;
    this.markers = {};
    this.creatingSpot = false;
    this.calendarDate = new Date();

    this.initTabs();
    this.initMap();
    this.initSpotsUI();
    this.initHistoryUI();
    this.setupEventListeners();
  }

  initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        const tabId = e.target.dataset.tab + '-tab';
        document.getElementById(tabId).classList.add('active');

        // Render schedule when tab opens
        if (e.target.dataset.tab === 'schedule') {
          this.renderSchedule();
        }
      });
    });
  }

  initMap() {
    // Wait for DOM to settle
    setTimeout(() => {
      const mapEl = document.getElementById('map');
      if (!mapEl) return;

      this.map = L.map('map').setView([51.5, 4.5], 13); // Default to Netherlands
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
      }).addTo(this.map);

      // Click to create spot
      this.map.on('click', (e) => {
        if (!this.creatingSpot) return;
        document.getElementById('spot-lat').value = e.latlng.lat.toFixed(5);
        document.getElementById('spot-lng').value = e.latlng.lng.toFixed(5);
      });

      // Update map when position changes
      window.addEventListener('positionUpdate', (e) => {
        const { lat, lng } = e.detail;
        if (this.map && !this.map.isMoving) {
          // Only pan if user hasn't manually moved the map
          const bounds = this.map.getBounds();
          if (!bounds.contains([lat, lng])) {
            this.map.setView([lat, lng], this.map.getZoom());
          }
        }

        // Update user position marker
        if (!this.userMarker) {
          this.userMarker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: '#3498db',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
          }).addTo(this.map);
        } else {
          this.userMarker.setLatLng([lat, lng]);
        }
      });

      this.renderSpots();
    }, 100);
  }

  renderSpots() {
    if (!this.map) return;

    // Clear old markers
    Object.values(this.markers).forEach(m => this.map.removeLayer(m));
    this.markers = {};

    // Add spot markers with circles
    tracker.spots.forEach(spot => {
      const marker = L.marker([spot.lat, spot.lng], {
        title: spot.name
      }).bindPopup(`<strong>${spot.name}</strong><br>${spot.radius}m radius`).addTo(this.map);

      const circle = L.circle([spot.lat, spot.lng], {
        radius: spot.radius,
        color: '#e74c3c',
        fillColor: '#e74c3c',
        fillOpacity: 0.1,
        weight: 2
      }).addTo(this.map);

      this.markers[spot.id] = { marker, circle };
    });
  }

  initSpotsUI() {
    document.getElementById('spots-tab').addEventListener('click', () => {
      this.renderSpotsList();
    });

    // Create spot button
    document.getElementById('create-spot-btn').addEventListener('click', () => this.showSpotForm());

    // Spot form buttons
    document.getElementById('save-spot-btn').addEventListener('click', () => this.saveNewSpot());
    document.getElementById('cancel-spot-btn').addEventListener('click', () => this.hideSpotForm());

    // Listen for spot changes
    window.addEventListener('spotAdded', () => {
      this.renderSpots();
      this.renderSpotsList();
      this.hideSpotForm();
    });

    window.addEventListener('spotDeleted', () => {
      this.renderSpots();
      this.renderSpotsList();
    });
  }

  renderSpotsList() {
    const list = document.getElementById('spots-list');
    list.innerHTML = '';

    if (!tracker.spots || tracker.spots.length === 0) {
      list.innerHTML = '<p class="empty">No spots yet. Click "Add Spot" or click the map to create one.</p>';
      return;
    }

    const html = tracker.spots.map(spot => `
      <div class="spot-item">
        <div class="spot-header">
          <strong>${spot.name}</strong>
          <span class="spot-radius">${spot.radius}m</span>
        </div>
        <div class="spot-coords">Lat: ${spot.lat.toFixed(5)}, Lng: ${spot.lng.toFixed(5)}</div>
        <div class="spot-actions">
          <button class="btn-small" data-edit="${spot.id}">Edit</button>
          <button class="btn-small btn-danger" data-delete="${spot.id}">Delete</button>
        </div>
      </div>
    `).join('');

    list.innerHTML = html;

    // Event listeners
    list.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Delete this spot?')) {
          await tracker.deleteSpot(parseInt(btn.dataset.delete));
        }
      });
    });

    list.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const spotId = parseInt(btn.dataset.edit);
        const spot = tracker.spots.find(s => s.id === spotId);
        if (spot) {
          document.getElementById('spot-name').value = spot.name;
          document.getElementById('spot-radius').value = spot.radius;
          document.getElementById('spot-lat').value = spot.lat;
          document.getElementById('spot-lng').value = spot.lng;
          this.showSpotForm();
        }
      });
    });
  }

  showSpotForm() {
    this.creatingSpot = true;
    document.getElementById('spot-form').style.display = 'block';
  }

  hideSpotForm() {
    this.creatingSpot = false;
    document.getElementById('spot-form').style.display = 'none';
    document.getElementById('spot-name').value = '';
    document.getElementById('spot-radius').value = 50;
    document.getElementById('spot-lat').value = '';
    document.getElementById('spot-lng').value = '';
  }

  async saveNewSpot() {
    const name = document.getElementById('spot-name').value.trim();
    const radius = parseInt(document.getElementById('spot-radius').value);
    const lat = parseFloat(document.getElementById('spot-lat').value);
    const lng = parseFloat(document.getElementById('spot-lng').value);

    if (!name || !lat || !lng || isNaN(radius)) {
      alert('Please fill in all fields');
      return;
    }

    await tracker.saveSpot({ name, radius, lat, lng });
  }

  initHistoryUI() {
    document.getElementById('export-btn').addEventListener('click', () => this.exportCSV());
    document.getElementById('clear-history-btn').addEventListener('click', () => this.clearHistory());

    // Render history when tab is clicked
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === 'history') {
        btn.addEventListener('click', () => this.renderHistory());
      }
    });
  }

  renderSchedule() {
    this.renderCalendar();
    this.updateScheduleInfo();

    // Bind month navigation (only once)
    const prevBtn = document.getElementById('prev-month-btn');
    const nextBtn = document.getElementById('next-month-btn');
    const clearBtn = document.getElementById('clear-schedule-btn');

    if (!prevBtn.hasListener) {
      prevBtn.addEventListener('click', () => this.prevMonth());
      nextBtn.addEventListener('click', () => this.nextMonth());
      clearBtn.addEventListener('click', () => this.clearSchedule());
      prevBtn.hasListener = true;
    }
  }

  renderCalendar() {
    const year = this.calendarDate.getFullYear();
    const month = this.calendarDate.getMonth();

    // Update header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calendar-month').textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Build calendar grid
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell empty';
      grid.appendChild(cell);
    }

    // Days of month
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.textContent = day;

      const date = new Date(year, month, day);
      const dateStr = tracker.dateToString(date);
      const isWorkDay = tracker.workDays.includes(dateStr);
      const isToday = date.toDateString() === today.toDateString();

      if (isWorkDay) cell.classList.add('work-day');
      if (isToday) cell.classList.add('today');

      cell.addEventListener('click', () => {
        tracker.workDays.includes(dateStr) ?
          tracker.workDays = tracker.workDays.filter(d => d !== dateStr) :
          tracker.workDays.push(dateStr);
        tracker.saveSchedule();
        this.renderCalendar();
        this.updateScheduleInfo();
      });

      grid.appendChild(cell);
    }
  }

  prevMonth() {
    this.calendarDate.setMonth(this.calendarDate.getMonth() - 1);
    this.renderCalendar();
  }

  nextMonth() {
    this.calendarDate.setMonth(this.calendarDate.getMonth() + 1);
    this.renderCalendar();
  }

  clearSchedule() {
    if (confirm('Clear all work days?')) {
      tracker.workDays = [];
      tracker.saveSchedule();
      this.renderSchedule();
    }
  }

  updateScheduleInfo() {
    const today = new Date();
    const isWorkToday = tracker.isWorkDay(today);

    document.getElementById('work-today-text').textContent = isWorkToday ? 'a work day' : 'not a work day';
    document.getElementById('work-days-count').textContent = tracker.workDays.length;
  }

  async renderHistory() {
    const logs = await tracker.getTimeLogs();
    const list = document.getElementById('history-list');

    if (logs.length === 0) {
      list.innerHTML = '<p class="empty">No time logs yet. Start tracking to create entries.</p>';
      return;
    }

    // Group by spot
    const bySpot = {};
    logs.forEach(log => {
      if (!bySpot[log.spotName]) bySpot[log.spotName] = [];
      bySpot[log.spotName].push(log);
    });

    // Calculate totals
    let totalTime = 0;
    const spotTotals = {};

    Object.keys(bySpot).forEach(spotName => {
      let spotTotal = 0;
      bySpot[spotName].forEach(log => {
        spotTotal += log.duration;
        totalTime += log.duration;
      });
      spotTotals[spotName] = spotTotal;
    });

    // Render
    let html = `<div class="history-summary">
      <p><strong>Total Time Tracked:</strong> ${tracker.formatDuration(totalTime)}</p>
      <div class="spot-totals">`;

    Object.keys(spotTotals).sort().forEach(spotName => {
      html += `<div class="spot-total">
        <span>${spotName}:</span>
        <span class="duration">${tracker.formatDuration(spotTotals[spotName])}</span>
      </div>`;
    });

    html += '</div></div>';

    // Timeline
    html += '<div class="history-timeline">';
    logs.sort((a, b) => b.startTime - a.startTime).forEach(log => {
      const startDate = new Date(log.startTime);
      const endDate = new Date(log.endTime);
      const dateStr = startDate.toLocaleDateString();
      const startStr = startDate.toLocaleTimeString();
      const endStr = endDate.toLocaleTimeString();

      html += `<div class="history-item">
        <div class="history-spot">${log.spotName}</div>
        <div class="history-time">${dateStr} ${startStr} – ${endStr}</div>
        <div class="history-duration">${tracker.formatDuration(log.duration)}</div>
      </div>`;
    });
    html += '</div>';

    list.innerHTML = html;
  }

  async exportCSV() {
    const logs = await tracker.getTimeLogs();
    let csv = 'Spot,Start Time,End Time,Duration (seconds)\n';

    logs.sort((a, b) => a.startTime - b.startTime).forEach(log => {
      const start = new Date(log.startTime).toISOString();
      const end = new Date(log.endTime).toISOString();
      csv += `"${log.spotName}","${start}","${end}",${Math.floor(log.duration / 1000)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `time-tracker-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async clearHistory() {
    if (!confirm('Delete ALL time logs? This cannot be undone.')) return;
    await tracker.clearAllLogs();
    this.renderHistory();
  }

  setupEventListeners() {
    // Update timer display
    window.addEventListener('timerUpdate', (e) => {
      const timerEl = document.getElementById('current-timer');
      if (timerEl) {
        timerEl.textContent = tracker.formatDuration(e.detail.elapsed);
      }
    });

    // Update spot name
    window.addEventListener('spotChange', (e) => {
      const spotName = e.detail ? e.detail.name : 'Not at any spot';
      document.getElementById('current-spot-name').textContent = spotName;
      document.getElementById('current-timer').textContent = '00:00:00';
    });

    // Add quick spot button
    const form = document.getElementById('spot-form');
    const spotsTab = document.querySelector('[data-tab="spots"]');
    if (spotsTab) {
      spotsTab.addEventListener('click', () => {
        setTimeout(() => this.renderSpotsList(), 100);
      });
    }
  }
}

// Initialize UI when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ui = new TimeTrackerUI();
  });
} else {
  window.ui = new TimeTrackerUI();
}
