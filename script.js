const pmSpan = document.getElementById("pm25");
const tempSpan = document.getElementById("temp");
const humiditySpan = document.getElementById("humidity");
const lastUpdatedSpan = document.getElementById("lastUpdated");
const co2LevelSpan = document.getElementById("co2Level");
const dailyFootprintSpan = document.getElementById("dailyFootprint");

const pmValueSpan = document.getElementById("pmValue");
const pmStatusSpan = document.getElementById("pmStatus");
const pmNeedle = document.getElementById("pmNeedle");
const gaugeCard = document.getElementById("gaugeCard");

const refreshBtn = document.getElementById("refreshBtn");
const autoRefreshToggle = document.getElementById("autoRefreshToggle");

// Calculator Elements
const calcBtn = document.getElementById("calcBtn");
const calcCar = document.getElementById("calc-car");
const calcTransit = document.getElementById("calc-transit");
const calcMeat = document.getElementById("calc-meat");
const calcVeg = document.getElementById("calc-veg");
const calcResultBox = document.getElementById("calc-result-box");
const calcTotal = document.getElementById("calc-total");
const toggleMapBtn = document.getElementById("toggleMapBtn");
const mapDiv = document.getElementById("map");

let historyChart = null;
const labels = [];
const pmHistory = [];
const tempHistory = [];
const humidityHistory = [];
const MAX_POINTS = 20;

let autoRefreshTimer = null;
let map = null;
let mapMarker = null;

/* --- Gauge helper --- */
function updateGauge(pm) {
  const min = 0;
  const max = 150;
  const value = Math.max(min, Math.min(max, pm));

  const ratio = (value - min) / (max - min);
  const angle = -90 + ratio * 180;
  pmNeedle.style.transform = `rotate(${angle}deg)`;

  pmValueSpan.textContent = value.toFixed(2);

  let statusText = "";
  let levelClass = "level-good";

  if (value <= 35) {
    statusText = "Good – Air quality is satisfactory.";
    levelClass = "level-good";
  } else if (value <= 75) {
    statusText = "Moderate – Sensitive individuals should take care.";
    levelClass = "level-moderate";
  } else {
    statusText = "Unhealthy – Everyone may begin to experience effects.";
    levelClass = "level-unhealthy";
  }

  gaugeCard.classList.remove("level-good", "level-moderate", "level-unhealthy");
  gaugeCard.classList.add(levelClass);
  pmStatusSpan.textContent = statusText;
}

/* --- Chart setup --- */
function initChart() {
  const ctx = document.getElementById("historyChart").getContext("2d");
  historyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "PM2.5 (µg/m³)",
          data: pmHistory,
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 2
        },
        {
          label: "Temperature (°C)",
          data: tempHistory,
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 2
        },
        {
          label: "Humidity (%)",
          data: humidityHistory,
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 6
          }
        },
        y: {
          beginAtZero: true
        }
      },
      plugins: {
        legend: {
          position: "bottom"
        }
      }
    }
  });
}

function addHistoryPoint(pm, temp, humidity) {
  const nowLabel = new Date().toLocaleTimeString();

  labels.push(nowLabel);
  pmHistory.push(pm);
  tempHistory.push(temp);
  humidityHistory.push(humidity);

  if (labels.length > MAX_POINTS) {
    labels.shift();
    pmHistory.shift();
    tempHistory.shift();
    humidityHistory.shift();
  }

  if (historyChart) {
    historyChart.update();
  }
}

/* --- Map setup --- */
function initMap() {
  // Initialize map with a default view (e.g., world view)
  map = L.map('map').setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  // Force resize calculation
  setTimeout(() => { map.invalidateSize(); }, 100);

  // If we already have a location, show it
  if (lastLat !== null && lastLon !== null) {
    updateMapWithLocation(lastLat, lastLon, lastAccuracy || 1000);
  }

  // Manual Location Override
  map.on('click', function (e) {
    isManualLocation = true;
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    // Stop auto-tracking if active
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      console.log("Auto-tracking stopped for manual override.");
    }

    // Remove accuracy circle if exists (since manual point is precise)
    if (mapCircle) {
      map.removeLayer(mapCircle);
      mapCircle = null;
    }

    // Update UI
    const locDisplay = document.getElementById("locationDisplay");
    if (locDisplay) {
      locDisplay.innerText = `Manual Location: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }

    // Update Marker
    if (mapMarker) {
      mapMarker.setLatLng([lat, lon])
        .bindPopup("Manual Location")
        .openPopup();
    } else {
      mapMarker = L.marker([lat, lon]).addTo(map)
        .bindPopup("Manual Location")
        .openPopup();
    }

    // Send to backend
    fetch('http://127.0.0.1:5000/api/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: lat, longitude: lon })
    }).catch(err => console.error("Error sending manual location:", err));
  });
}

function updateMapWithLocation(lat, lon, accuracy) {
  if (!map) return;

  // Remove existing marker/circle if any
  if (mapMarker) map.removeLayer(mapMarker);
  if (mapCircle) map.removeLayer(mapCircle);

  // Add new marker
  mapMarker = L.marker([lat, lon]).addTo(map)
    .bindPopup(`You are within ${Math.round(accuracy)}m of this point`)
    .openPopup();

  // Add accuracy circle
  mapCircle = L.circle([lat, lon], {
    color: '#2563eb',
    fillColor: '#2563eb',
    fillOpacity: 0.15,
    radius: accuracy
  }).addTo(map);

  // Fit bounds to the accuracy circle to show the full uncertainty area
  map.fitBounds(mapCircle.getBounds());
}

let watchId = null;
let mapCircle = null;
let lastLat = null;
let lastLon = null;
let lastAccuracy = null;
let isManualLocation = false;

function startLocationTracking() {
  const locDisplay = document.getElementById("locationDisplay");

  // 1. Try Backend IP Location (Most reliable for this case)
  fetch("http://127.0.0.1:5000/api/my_location")
    .then(res => res.json())
    .then(data => {
      if (data.latitude && data.longitude) {
        console.log("Backend IP Location:", data.latitude, data.longitude);
        if (locDisplay) {
          locDisplay.innerHTML = `Approx. Location (Backend IP): ${data.city}, ${data.country} <br><small>(Waiting for precise GPS...)</small>`;
          locDisplay.style.color = "#d97706";
        }
        updateMapWithLocation(data.latitude, data.longitude, 5000);
      }
    })
    .catch(err => console.error("Backend location fallback failed:", err));

  // 2. Try Browser Geolocation
  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        console.log("GPS Update:", lat, lon, accuracy);

        // Update UI
        if (locDisplay) {
          locDisplay.innerHTML = `<strong>📍 High Accuracy GPS Active</strong> <br><small>Accuracy: ${Math.round(accuracy)}m</small>`;
          locDisplay.style.color = "green";
        }

        updateMapWithLocation(lat, lon, accuracy);

        // Update global vars so data fetch uses this
        lastLat = lat;
        lastLon = lon;

        // Send to backend
        fetch('http://127.0.0.1:5000/api/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: lat, longitude: lon })
        }).catch(err => console.error("Error sending location:", err));
      },
      (error) => {
        console.warn("GPS Error:", error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  } else {
    if (locDisplay) locDisplay.innerText = "Geolocation not supported.";
  }
}

/* --- Fetch data from backend --- */
function fetchData() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Loading...";

  // Fetch Carbon Footprint - REMOVED (Replaced by Calculator)
  // const latParam = lastLat ? `?lat=${lastLat}&lon=${lastLon}` : "";

  // Fetch Air Quality
  const latParam = lastLat ? `?lat=${lastLat}&lon=${lastLon}` : "";

  fetch(`http://127.0.0.1:5000/api/airquality${latParam}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      const pm = Number(data.pm25);
      const temp = Number(data.temperature);
      const humidity = Number(data.humidity);

      // New Gases
      const oxy = data.oxygen;
      const nitro = data.nitrogen;
      const hydro = data.hydrogen;

      pmSpan.textContent = isNaN(pm) ? "--" : pm.toFixed(2);
      tempSpan.textContent = isNaN(temp) ? "--" : temp.toFixed(2);
      humiditySpan.textContent = isNaN(humidity) ? "--" : humidity.toFixed(2);

      // Update Gas UI
      const elOxy = document.getElementById("val-oxygen");
      const elNitro = document.getElementById("val-nitrogen");
      const elHydro = document.getElementById("val-hydrogen");

      if (elOxy) elOxy.textContent = oxy || "--";
      if (elNitro) elNitro.textContent = nitro || "--";
      if (elHydro) elHydro.textContent = hydro || "--";

      if (!isNaN(pm)) {
        updateGauge(pm);
      }

      if (!isNaN(pm) && !isNaN(temp) && !isNaN(humidity)) {
        addHistoryPoint(pm, temp, humidity);
      }

      lastUpdatedSpan.textContent = new Date().toLocaleTimeString();
    })
    .catch((error) => {
      console.error("Error fetching air quality:", error);
      pmStatusSpan.textContent = "Error fetching data. Check backend.";
      gaugeCard.classList.remove("level-good", "level-moderate", "level-unhealthy");
    })
    .finally(() => {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh Now";
    });
}

/* --- Auto refresh --- */
function startAutoRefresh() {
  if (autoRefreshTimer) return;
  autoRefreshTimer = setInterval(fetchData, 5000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

/* --- Event listeners & boot --- */
window.addEventListener("DOMContentLoaded", () => {
  initChart();
  initMap(); // Initialize map immediately
  fetchData();
  startAutoRefresh();
  startLocationTracking(); // Auto-start location tracking

  refreshBtn.addEventListener("click", fetchData);

  autoRefreshToggle.addEventListener("change", (e) => {
    if (e.target.checked) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });

  toggleMapBtn.addEventListener("click", () => {
    if (mapDiv.style.display === "none") {
      mapDiv.style.display = "block";
      toggleMapBtn.textContent = "Close Map";
      map.invalidateSize();
    } else {
      mapDiv.style.display = "none";
      toggleMapBtn.textContent = "Open Map";
    }
  });

  // Show map by default
  mapDiv.style.display = "block";
  toggleMapBtn.textContent = "Close Map";

  // Search functionality
  const searchBtn = document.getElementById("searchBtn");
  const locationInput = document.getElementById("locationInput");

  async function searchLocation() {
    const query = locationInput.value.trim();
    if (!query) return;

    searchBtn.disabled = true;
    searchBtn.textContent = "Searching...";

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (data && data.length > 0) {
        isManualLocation = true;
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);

        // Stop auto-tracking
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }

        // Open map if closed
        if (mapDiv.style.display === "none") {
          mapDiv.style.display = "block";
          toggleMapBtn.textContent = "Close Map";
          if (!map) initMap();
        }

        // Update map
        if (map) {
          updateMapWithLocation(lat, lon, 50); // Assume 50m accuracy for search result
          map.setView([lat, lon], 13);
        }

        // Update UI
        const locDisplay = document.getElementById("locationDisplay");
        if (locDisplay) {
          locDisplay.innerHTML = `<span style="color: green; font-weight: bold;">✓ Search Result: ${data[0].display_name}</span>`;
        }

        // Send to backend
        fetch('http://127.0.0.1:5000/api/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: lat, longitude: lon })
        }).catch(err => console.error("Error sending location:", err));

      } else {
        alert("Location not found. Please try a different query.");
      }
    } catch (err) {
      console.error("Search error:", err);
      alert("Error searching for location.");
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = "Search";
    }
  }

  if (searchBtn && locationInput) {
    searchBtn.addEventListener("click", searchLocation);
    locationInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") searchLocation();
    });
  }

  // Calculator Logic
  if (calcBtn) {
    calcBtn.addEventListener("click", () => {
      const carKm = parseFloat(calcCar.value) || 0;
      const transitKm = parseFloat(calcTransit.value) || 0;
      const walkKm = parseFloat(document.getElementById("calc-walk")?.value) || 0;
      const meatMeals = parseFloat(calcMeat.value) || 0;
      const vegMeals = parseFloat(calcVeg.value) || 0;

      // Factors (kg CO2)
      const f_car = 0.192;
      const f_transit = 0.103;
      const f_meat = 2.5;
      const f_veg = 0.5;

      const total = (carKm * f_car) + (transitKm * f_transit) + (meatMeals * f_meat) + (vegMeals * f_veg);

      // Visual Meter Logic (Scale: 0 - 20kg per day)
      const maxScale = 20;
      const percentage = Math.min(100, (total / maxScale) * 100);

      calcTotal.textContent = total.toFixed(2);

      const calcMeterBar = document.getElementById("calc-meter-bar");
      const calcMsg = document.getElementById("calc-msg");

      if (calcMeterBar) {
        calcMeterBar.className = "carbon-meter-bar";
        calcMeterBar.style.width = `${percentage}%`;

        if (total < 5) {
          calcMeterBar.classList.add("meter-green");
        } else if (total < 12) {
          calcMeterBar.classList.add("meter-orange");
        } else {
          calcMeterBar.classList.add("meter-red");
        }
      }

      if (calcMsg) {
        calcMsg.className = "result-msg";
        if (total < 5) {
          calcMsg.classList.add("text-green");
          calcMsg.textContent = "Great Job! Low Carbon Footprint 🌿";
        } else if (total < 12) {
          calcMsg.classList.add("text-orange");
          calcMsg.textContent = "Moderate Usage. Keep it up! 🌤️";
        } else {
          calcMsg.classList.add("text-red");
          calcMsg.textContent = "High Footprint. Try to reduce emissions! 🏭";
        }

        // Walking Bonus Message
        if (walkKm > 0) {
          const saved = (walkKm * 0.192).toFixed(1);
          calcMsg.innerHTML += `<br><small style="color:#2563eb; display:block; margin-top:4px;">NB: Your ${walkKm}km walk saved ~${saved}kg CO2!</small>`;
        }
      }

      calcResultBox.style.display = "flex";
    });
  }
});
