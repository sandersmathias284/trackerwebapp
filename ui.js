// UI layer: maps, spots management, schedule, history

class TimeTrackerUI {
  constructor() {
    this.map = null;
    this.spotsMap = null;
    this.spotLayers = { tracking: [], spots: [] };
    this.userMarker = null;
    this.spotsUserMarker = null;
    this.calendarDate = new Date();
    this.draft = null;
    this.placing = false;
    this.editingId = null;

    this.initTabs();
    this.initTrackingMap();
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
        const tab = e.target.dataset.tab;
        document.getElementById(tab + '-tab').classList.add('active');

        if (tab === 'schedule') this.renderSchedule();
        if (tab === 'spots') this.openSpotsTab();
        if (tab === 'history') this.renderHistory();
        if (tab === 'tracking' && this.map) this.map.invalidateSize();
      });
    });
  }

  makeMap(id) {
    const map = L.map(id).setView([51.2, 4.4], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    return map;
  }

  userDot(map, lat, lng) {
    return L.circleMarker([lat, lng], {
      radius: 8, fillColor: '#3498db', color: '#fff', weight: 2, fillOpacity: 0.9
    }).addTo(map);
  }

  initTrackingMap() {
    this.map = this.makeMap('map');

    window.addEventListener('positionUpdate', (e) => {
      const { lat, lng } = e.detail;
      if (!this.userMarker) {
        this.userMarker = this.userDot(this.map, lat, lng);
        this.map.setView([lat, lng], 15);
      } else {
        this.userMarker.setLatLng([lat, lng]);
        if (!this.map.getBounds().contains([lat, lng])) this.map.panTo([lat, lng]);
      }
      if (this.spotsMap) {
        if (!this.spotsUserMarker) this.spotsUserMarker = this.userDot(this.spotsMap, lat, lng);
        else this.spotsUserMarker.setLatLng([lat, lng]);
      }
    });

    this.renderSpots();
  }

  drawSpots(map, key) {
    this.spotLayers[key].forEach(l => map.removeLayer(l));
    this.spotLayers[key] = [];
    (tracker.spots || []).forEach(spot => {
      if (key === 'spots' && this.editingId === spot.id) return;
      const circle = L.circle([spot.lat, spot.lng], {
        radius: spot.radius, color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.12, weight: 2
      }).bindTooltip(this.esc(spot.name), { permanent: true, direction: 'center', className: 'spot-label' })
        .addTo(map);
      this.spotLayers[key].push(circle);
    });
  }

  renderSpots() {
    if (this.map) this.drawSpots(this.map, 'tracking');
    if (this.spotsMap) this.drawSpots(this.spotsMap, 'spots');
  }

  openSpotsTab() {
    if (!this.spotsMap) {
      this.spotsMap = this.makeMap('spots-map');
      this.spotsMap.on('click', (e) => {
        if (!this.placing) return;
        this.placeDraft(e.latlng.lat, e.latlng.lng);
      });
      const pos = tracker.currentPosition;
      if (pos) {
        this.spotsMap.setView([pos.lat, pos.lng], 15);
        this.spotsUserMarker = this.userDot(this.spotsMap, pos.lat, pos.lng);
      } else if (tracker.spots && tracker.spots.length) {
        const s = tracker.spots[0];
        this.spotsMap.setView([s.lat, s.lng], 15);
      }
    }
    setTimeout(() => this.spotsMap.invalidateSize(), 0);
    this.renderSpots();
    this.renderSpotsList();
  }

  initSpotsUI() {
    document.getElementById('create-spot-btn').addEventListener('click', () => this.openSpotForm());
    document.getElementById('use-location-btn').addEventListener('click', () => this.useMyLocation());
    document.getElementById('save-spot-btn').addEventListener('click', () => this.saveSpot());
    document.getElementById('cancel-spot-btn').addEventListener('click', () => this.closeSpotForm());
    document.getElementById('spot-radius').addEventListener('input', (e) => {
      document.getElementById('radius-value').textContent = e.target.value;
      if (this.draft) this.draft.circle.setRadius(parseInt(e.target.value));
    });

    ['spotAdded', 'spotUpdated', 'spotDeleted', 'spotsLoaded'].forEach(ev =>
      window.addEventListener(ev, () => {
        this.renderSpots();
        this.renderSpotsList();
      })
    );
  }

  openSpotForm(spot = null) {
    this.placing = true;
    this.editingId = spot ? spot.id : null;
    const radius = spot ? spot.radius : 50;

    document.getElementById('spot-form-title').textContent = spot ? 'Edit Spot' : 'New Spot';
    document.getElementById('spot-form-hint').textContent = 'Tap the map where you work, or use your current location.';
    document.getElementById('spot-name').value = spot ? spot.name : '';
    document.getElementById('spot-radius').value = radius;
    document.getElementById('radius-value').textContent = radius;
    document.getElementById('spot-lat').value = '';
    document.getElementById('spot-lng').value = '';
    document.getElementById('spot-form').style.display = 'block';
    document.getElementById('create-spot-btn').style.display = 'none';
    this.spotsMap.getContainer().classList.add('placing');

    this.clearDraft();
    if (spot) {
      this.placeDraft(spot.lat, spot.lng);
      this.spotsMap.setView([spot.lat, spot.lng], 16);
    }
    this.renderSpots();
  }

  closeSpotForm() {
    this.placing = false;
    this.editingId = null;
    this.clearDraft();
    document.getElementById('spot-form').style.display = 'none';
    document.getElementById('create-spot-btn').style.display = '';
    this.spotsMap.getContainer().classList.remove('placing');
    this.renderSpots();
  }

  clearDraft() {
    if (!this.draft) return;
    this.spotsMap.removeLayer(this.draft.marker);
    this.spotsMap.removeLayer(this.draft.circle);
    this.draft = null;
  }

  placeDraft(lat, lng) {
    const radius = parseInt(document.getElementById('spot-radius').value);
    if (this.draft) {
      this.draft.marker.setLatLng([lat, lng]);
      this.draft.circle.setLatLng([lat, lng]);
    } else {
      const circle = L.circle([lat, lng], {
        radius, color: '#3498db', fillColor: '#3498db', fillOpacity: 0.25, weight: 2, dashArray: '6 4'
      }).addTo(this.spotsMap);
      const marker = L.marker([lat, lng], { draggable: true }).addTo(this.spotsMap);
      marker.on('drag', (e) => circle.setLatLng(e.target.getLatLng()));
      marker.on('dragend', (e) => {
        const p = e.target.getLatLng();
        this.setDraftCoords(p.lat, p.lng);
      });
      this.draft = { marker, circle };
    }
    this.setDraftCoords(lat, lng);
  }

  setDraftCoords(lat, lng) {
    document.getElementById('spot-lat').value = lat.toFixed(5);
    document.getElementById('spot-lng').value = lng.toFixed(5);
    document.getElementById('spot-form-hint').textContent = 'Drag the pin to adjust. Slide to change the radius.';
  }

  useMyLocation() {
    const place = (lat, lng) => {
      this.placeDraft(lat, lng);
      this.spotsMap.setView([lat, lng], 17);
    };
    if (tracker.currentPosition) {
      place(tracker.currentPosition.lat, tracker.currentPosition.lng);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => place(pos.coords.latitude, pos.coords.longitude),
      () => alert('Could not get your location. Allow location access and try again.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async saveSpot() {
    const name = document.getElementById('spot-name').value.trim();
    const radius = parseInt(document.getElementById('spot-radius').value);
    const lat = parseFloat(document.getElementById('spot-lat').value);
    const lng = parseFloat(document.getElementById('spot-lng').value);

    if (!name) { alert('Give the spot a name'); return; }
    if (isNaN(lat) || isNaN(lng)) { alert('Tap the map to place the spot first'); return; }

    if (this.editingId) {
      await tracker.updateSpot({ id: this.editingId, name, radius, lat, lng });
    } else {
      await tracker.saveSpot({ name, radius, lat, lng });
    }
    this.closeSpotForm();
  }

  renderSpotsList() {
    const list = document.getElementById('spots-list');
    const spots = tracker.spots || [];

    if (spots.length === 0) {
      list.innerHTML = '<p class="empty">No spots yet. Tap "+ Create Spot", then tap the map where you work.</p>';
      return;
    }

    list.innerHTML = spots.map(spot => `
      <div class="spot-item">
        <div class="spot-header">
          <strong>${this.esc(spot.name)}</strong>
          <span class="spot-radius">${spot.radius}m</span>
        </div>
        <div class="spot-actions">
          <button class="btn-small" data-show="${spot.id}">Show</button>
          <button class="btn-small" data-edit="${spot.id}">Edit</button>
          <button class="btn-small btn-danger" data-delete="${spot.id}">Delete</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-show]').forEach(btn => btn.addEventListener('click', () => {
      const s = spots.find(x => x.id === parseInt(btn.dataset.show));
      if (!s) return;
      this.spotsMap.setView([s.lat, s.lng], 16);
      document.getElementById('spots-map').scrollIntoView({ behavior: 'smooth' });
    }));

    list.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
      const s = spots.find(x => x.id === parseInt(btn.dataset.edit));
      if (s) this.openSpotForm(s);
    }));

    list.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
      if (confirm('Delete this spot?')) await tracker.deleteSpot(parseInt(btn.dataset.delete));
    }));
  }

  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  renderSchedule() {
    this.renderCalendar();
    this.updateScheduleInfo();

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

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calendar-month').textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell empty';
      grid.appendChild(cell);
    }

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

  initHistoryUI() {
    document.getElementById('export-btn').addEventListener('click', () => this.exportCSV());
    document.getElementById('clear-history-btn').addEventListener('click', () => this.clearHistory());
  }

  async renderHistory() {
    const logs = await tracker.getTimeLogs();
    const list = document.getElementById('history-list');

    if (logs.length === 0) {
      list.innerHTML = '<p class="empty">No time logs yet. Start tracking to create entries.</p>';
      return;
    }

    let totalTime = 0;
    const spotTotals = {};
    logs.forEach(log => {
      spotTotals[log.spotName] = (spotTotals[log.spotName] || 0) + log.duration;
      totalTime += log.duration;
    });

    let html = `<div class="history-summary">
      <p><strong>Total Time Tracked:</strong> ${tracker.formatDuration(totalTime)}</p>
      <div class="spot-totals">`;

    Object.keys(spotTotals).sort().forEach(spotName => {
      html += `<div class="spot-total">
        <span>${this.esc(spotName)}:</span>
        <span class="duration">${tracker.formatDuration(spotTotals[spotName])}</span>
      </div>`;
    });

    html += '</div></div><div class="history-timeline">';

    logs.sort((a, b) => b.startTime - a.startTime).forEach(log => {
      const startDate = new Date(log.startTime);
      const endDate = new Date(log.endTime);
      html += `<div class="history-item">
        <div class="history-spot">${this.esc(log.spotName)}</div>
        <div class="history-time">${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()} – ${endDate.toLocaleTimeString()}</div>
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
      csv += `"${log.spotName.replace(/"/g, '""')}","${start}","${end}",${Math.floor(log.duration / 1000)}\n`;
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
    window.addEventListener('timerUpdate', (e) => {
      document.getElementById('current-timer').textContent = tracker.formatDuration(e.detail.elapsed);
    });

    window.addEventListener('spotChange', (e) => {
      document.getElementById('current-spot-name').textContent = e.detail ? e.detail.name : 'Not at any spot';
      document.getElementById('current-timer').textContent = '00:00:00';
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ui = new TimeTrackerUI();
  });
} else {
  window.ui = new TimeTrackerUI();
}
