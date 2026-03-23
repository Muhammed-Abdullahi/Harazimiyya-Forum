// ============================================
// HARAZIMIYYA FORUM - MAP DASHBOARD
// UPDATED: Fixed map loading issues
// ============================================

// Global variables
let map;
let markers = [];
let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let allLocations = [];
let allMembers = [];
let selectedLocationId = null;
let previewMap = null;
let previewMarker = null;
let touchTimer = null;

// Nigeria states for filter
const nigeriaStates = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe",
  "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau",
  "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"
];

// DOM Elements
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const openSidebar = document.getElementById("openSidebar");
const closeSidebar = document.getElementById("closeSidebar");
const logoutBtn = document.getElementById("logoutBtn");
const addLocationBtn = document.getElementById("addLocationBtn");
const locationModal = document.getElementById("locationModal");
const closeLocationBtn = document.getElementById("closeLocationBtn");
const saveLocationBtn = document.getElementById("saveLocationBtn");
const deleteModal = document.getElementById("deleteModal");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const searchInput = document.getElementById("searchInput");
const stateFilter = document.getElementById("stateFilter");
const dateFilter = document.getElementById("dateFilter");
const locationsList = document.getElementById("locationsList");
const locationsCount = document.getElementById("locationsCount");
const adminActions = document.getElementById("adminActions");
const hostSelect = document.getElementById("hostSelect");
const mapCard = document.querySelector(".map-card");

// Modal input fields
const modalTitle = document.getElementById("modalTitle");
const locationTitle = document.getElementById("locationTitle");
const locationDescription = document.getElementById("locationDescription");
const locationState = document.getElementById("locationState");
const locationAddress = document.getElementById("locationAddress");
const locationLat = document.getElementById("locationLat");
const locationLng = document.getElementById("locationLng");
const programDate = document.getElementById("programDate");
const startTime = document.getElementById("startTime");
const endTime = document.getElementById("endTime");

// ================= SIDEBAR TOGGLE =================
if (openSidebar) {
  openSidebar.onclick = () => {
    sidebar.classList.add("active");
    overlay.classList.add("active");
  };
}

if (closeSidebar) {
  closeSidebar.onclick = () => {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
  };
}

if (overlay) {
  overlay.onclick = () => {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
  };
}

// ================= NOTIFICATION FUNCTION =================
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// ================= ZOOM CONTROLS TOUCH HANDLER =================
function setupTouchZoom() {
  if (!mapCard) return;

  mapCard.addEventListener("touchstart", () => {
    mapCard.classList.add("touch-active");
    if (touchTimer) clearTimeout(touchTimer);
  });

  mapCard.addEventListener("touchend", () => {
    touchTimer = setTimeout(() => {
      mapCard.classList.remove("touch-active");
    }, 2000);
  });

  mapCard.addEventListener("touchcancel", () => {
    touchTimer = setTimeout(() => {
      mapCard.classList.remove("touch-active");
    }, 2000);
  });

  mapCard.addEventListener("mouseenter", () => {
    mapCard.classList.add("touch-active");
  });

  mapCard.addEventListener("mouseleave", () => {
    mapCard.classList.remove("touch-active");
  });
}

// ================= INITIALIZATION =================
async function init() {
  try {
    console.log("🗺️ Initializing map page...");
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.log("No user found, redirecting to login");
      window.location.href = "../index.html";
      return;
    }

    currentUser = user;
    console.log("Current user:", user.email);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Profile error:", profileError);
      return;
    }

    currentProfile = profile;
    isAdmin = (profile.role === 'admin' || profile.role === 'small_admin');
    console.log("Is admin or small admin:", isAdmin);

    // Show/hide admin actions
    if (isAdmin && adminActions) {
      adminActions.style.display = "block";
    } else if (adminActions) {
      adminActions.style.display = "none";
    }

    // Load members for host selection (only for admin)
    if (isAdmin) {
      await loadMembers();
    }

    // Initialize map first
    initMainMap();
    
    // Setup touch zoom after map is ready
    setTimeout(() => {
      setupTouchZoom();
    }, 500);
    
    // Load locations
    await loadLocations();
    
    // Setup event listeners
    setupEventListeners();

  } catch (err) {
    console.error("Initialization error:", err);
    showNotification("Error loading map: " + err.message, "error");
  }
}

// ================= LOAD MEMBERS (for admin) =================
async function loadMembers() {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, state")
      .eq("is_approved", true)
      .order("full_name");

    if (error) throw error;
    
    allMembers = data || [];
    
    if (hostSelect) {
      hostSelect.innerHTML = '<option value="">Select a member...</option>';
      allMembers.forEach(member => {
        hostSelect.innerHTML += `<option value="${member.id}">${member.full_name} (${member.state || 'State not set'})</option>`;
      });
    }

  } catch (err) {
    console.error("Error loading members:", err);
  }
}

// ================= INIT MAIN MAP =================
function initMainMap() {
  const mapElement = document.getElementById("map");
  if (!mapElement) {
    console.error("Map element not found!");
    return;
  }
  
  // Check if Leaflet is loaded
  if (typeof L === 'undefined') {
    console.error("Leaflet library not loaded! Make sure Leaflet CSS and JS are included.");
    showNotification("Map library not loaded. Please refresh the page.", "error");
    return;
  }
  
  try {
    // Center on Nigeria with zoom limits
    map = L.map("map", {
      center: [9.0820, 8.6753],
      zoom: 6,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: true,
      fadeAnimation: true,
      zoomAnimation: true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
      minZoom: 5
    }).addTo(map);
    
    console.log("✅ Map initialized successfully");
    
  } catch (err) {
    console.error("Error initializing map:", err);
    showNotification("Failed to load map. Please refresh the page.", "error");
  }
}

// ================= CREATE SAMPLE LOCATIONS =================
async function createSampleLocations() {
  console.log("Creating sample locations...");
  
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .single();
  
  if (!adminProfile) {
    console.log("No admin found for sample data");
    return [];
  }
  
  const sampleLocations = [
    {
      title: "Weekly Moulud - Kano Central",
      description: "Weekly remembrance gathering at Kano Central Mosque",
      state: "Kano",
      address: "Kano Central Mosque, Kano",
      latitude: 12.0023,
      longitude: 8.5921,
      host_id: adminProfile.id,
      program_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      start_time: "19:00",
      end_time: "21:00"
    },
    {
      title: "Zikr Session - Lagos",
      description: "Evening zikr and spiritual gathering",
      state: "Lagos",
      address: "Ikeja, Lagos",
      latitude: 6.5244,
      longitude: 3.3792,
      host_id: adminProfile.id,
      program_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      start_time: "18:30",
      end_time: "20:30"
    },
    {
      title: "Friday Sermon - Abuja",
      description: "Weekly Friday sermon and gathering",
      state: "FCT",
      address: "Central Area, Abuja",
      latitude: 9.0765,
      longitude: 7.3986,
      host_id: adminProfile.id,
      program_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      start_time: "13:00",
      end_time: "14:30"
    }
  ];
  
  try {
    const { data, error } = await supabase
      .from("locations")
      .insert(sampleLocations)
      .select();
    
    if (error) {
      console.log("Sample data error:", error.message);
      return [];
    }
    
    console.log("Sample locations created:", data);
    return data || [];
    
  } catch (err) {
    console.error("Error creating sample locations:", err);
    return [];
  }
}

// ================= LOAD LOCATIONS =================
async function loadLocations() {
  const locationsContainer = document.getElementById("locationsList");
  if (!locationsContainer) return;
  
  locationsContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading locations...</div>';
  
  try {
    console.log("📍 Loading locations from database...");
    
    const { data, error } = await supabase
      .from("locations")
      .select(`
        *,
        host:profiles!host_id(full_name, state, email)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading locations:", error);
      
      if (error.code === '42P01') {
        locationsContainer.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-map-marked-alt"></i>
            <h3>No Locations Yet</h3>
            <p>${isAdmin ? 'Click "Add Location" to create the first location' : 'Check back later for updates'}</p>
          </div>
        `;
        return;
      }
      
      throw error;
    }

    console.log("Locations loaded:", data);
    
    if (!data || data.length === 0) {
      if (isAdmin) {
        locationsContainer.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-map-marked-alt"></i>
            <h3>No Locations Yet</h3>
            <p>Click "Add Location" to create your first program location.</p>
            <button id="createSampleBtn" class="primary-btn" style="margin-top: 15px;">
              <i class="fas fa-magic"></i> Create Sample Locations
            </button>
          </div>
        `;
        
        const createSampleBtn = document.getElementById('createSampleBtn');
        if (createSampleBtn) {
          createSampleBtn.onclick = async () => {
            createSampleBtn.disabled = true;
            createSampleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
            
            const samples = await createSampleLocations();
            if (samples.length > 0) {
              await loadLocations();
            } else {
              createSampleBtn.disabled = false;
              createSampleBtn.innerHTML = '<i class="fas fa-magic"></i> Create Sample Locations';
              showNotification('Sample locations could not be created.', 'error');
            }
          };
        }
      } else {
        locationsContainer.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-map-marked-alt"></i>
            <h3>No Locations Yet</h3>
            <p>Check back later for program locations</p>
          </div>
        `;
      }
      return;
    }

    allLocations = data || [];
    console.log("All locations count:", allLocations.length);
    
    updateStateFilter();
    filterAndDisplayLocations();
    updateMapMarkers();

  } catch (err) {
    console.error("Error loading locations:", err);
    locationsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <h3>Error Loading Locations</h3>
        <p>Please try again later</p>
        <small>${err.message || 'Unknown error'}</small>
      </div>
    `;
  }
}

// ================= UPDATE STATE FILTER =================
function updateStateFilter() {
  if (!stateFilter) return;
  
  const states = [...new Set(allLocations.map(loc => loc.state).filter(Boolean))];
  const options = states.length > 0 ? states : nigeriaStates;
  
  stateFilter.innerHTML = '<option value="">All States</option>';
  options.sort().forEach(state => {
    stateFilter.innerHTML += `<option value="${state}">${state}</option>`;
  });
}

// ================= FILTER AND DISPLAY LOCATIONS =================
function filterAndDisplayLocations() {
  const searchTerm = searchInput?.value?.toLowerCase() || "";
  const selectedState = stateFilter?.value || "";
  const selectedDate = dateFilter?.value || "all";

  let filtered = [...allLocations];

  if (searchTerm) {
    filtered = filtered.filter(loc => 
      loc.title?.toLowerCase().includes(searchTerm) ||
      loc.state?.toLowerCase().includes(searchTerm) ||
      (loc.host?.full_name?.toLowerCase() || "").includes(searchTerm) ||
      loc.address?.toLowerCase().includes(searchTerm)
    );
  }

  if (selectedState) {
    filtered = filtered.filter(loc => loc.state === selectedState);
  }

  if (selectedDate !== "all") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    filtered = filtered.filter(loc => {
      if (!loc.program_date) return false;
      
      const progDate = new Date(loc.program_date);
      progDate.setHours(0, 0, 0, 0);
      
      switch(selectedDate) {
        case "today":
          return progDate.getTime() === today.getTime();
        case "tomorrow":
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return progDate.getTime() === tomorrow.getTime();
        case "week":
          const nextWeek = new Date(today);
          nextWeek.setDate(nextWeek.getDate() + 7);
          return progDate >= today && progDate <= nextWeek;
        case "month":
          const nextMonth = new Date(today);
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          return progDate >= today && progDate <= nextMonth;
        default:
          return true;
      }
    });
  }

  if (locationsCount) {
    locationsCount.textContent = `${filtered.length} location${filtered.length !== 1 ? 's' : ''}`;
  }

  displayLocationsList(filtered);
}

// ================= DISPLAY LOCATIONS LIST =================
function displayLocationsList(locations) {
  if (!locationsList) return;

  if (!locations || locations.length === 0) {
    locationsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-map-marked-alt"></i>
        <p>No locations match your filters</p>
        <small>Try adjusting your search criteria</small>
      </div>
    `;
    return;
  }

  let html = "";
  locations.forEach(loc => {
    const date = loc.program_date ? new Date(loc.program_date).toLocaleDateString() : "Date TBA";
    const time = loc.start_time ? loc.start_time.substring(0, 5) : "";
    const hostName = loc.host?.full_name || "Unknown";
    
    html += `
      <div class="location-item ${isAdmin ? 'admin-controls' : ''}" onclick="focusOnLocation('${loc.id}')">
        <div class="location-header">
          <h4>${escapeHtml(loc.title)}</h4>
          ${loc.program_date ? '<span class="location-badge"><i class="fas fa-calendar"></i> ' + date + '</span>' : ''}
        </div>
        
        <div class="location-details">
          <p><i class="fas fa-map-pin"></i> ${escapeHtml(loc.state || 'State not set')}${loc.address ? ' - ' + escapeHtml(loc.address) : ''}</p>
          ${time ? `<p><i class="fas fa-clock"></i> ${time}</p>` : ''}
          ${loc.description ? `<p><i class="fas fa-align-left"></i> ${escapeHtml(loc.description.substring(0, 100))}${loc.description.length > 100 ? '...' : ''}</p>` : ''}
        </div>
        
        <div class="location-host">
          <i class="fas fa-user"></i>
          <span>Hosted by: <strong>${escapeHtml(hostName)}</strong></span>
        </div>
        
        ${isAdmin ? `
          <div class="admin-actions">
            <button class="edit-btn" onclick="editLocation('${loc.id}'); event.stopPropagation();">
              <i class="fas fa-edit"></i>
            </button>
            <button class="delete-btn" onclick="confirmDelete('${loc.id}'); event.stopPropagation();">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  });

  locationsList.innerHTML = html;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ================= UPDATE MAP MARKERS =================
function updateMapMarkers() {
  if (!map) {
    console.warn("Map not initialized yet");
    return;
  }
  
  // Clear existing markers
  markers.forEach(marker => {
    if (map && marker) map.removeLayer(marker);
  });
  markers = [];

  if (!allLocations || allLocations.length === 0) {
    // Add a default marker for Nigeria if no locations
    const defaultMarker = L.marker([9.0820, 8.6753])
      .addTo(map)
      .bindPopup("<strong>Harazimiyya Forum</strong><br>Add locations to see them on the map");
    markers.push(defaultMarker);
    return;
  }

  allLocations.forEach(loc => {
    if (loc.latitude && loc.longitude) {
      try {
        const marker = L.marker([parseFloat(loc.latitude), parseFloat(loc.longitude)])
          .addTo(map)
          .bindPopup(`
            <strong>${escapeHtml(loc.title)}</strong><br>
            <i class="fas fa-map-pin"></i> ${escapeHtml(loc.state || '')}<br>
            <i class="fas fa-user"></i> Host: ${escapeHtml(loc.host?.full_name || 'Unknown')}<br>
            ${loc.program_date ? `<i class="fas fa-calendar"></i> ${new Date(loc.program_date).toLocaleDateString()}` : ''}
          `);

        markers.push(marker);
      } catch (err) {
        console.error("Error adding marker for location:", loc.id, err);
      }
    }
  });
  
  console.log(`✅ Added ${markers.length} markers to map`);
}

// ================= FOCUS ON LOCATION =================
window.focusOnLocation = function(locationId) {
  const loc = allLocations.find(l => l.id === locationId);
  if (loc && loc.latitude && loc.longitude && map) {
    map.setView([parseFloat(loc.latitude), parseFloat(loc.longitude)], 13);
    
    const marker = markers.find(m => {
      const latLng = m.getLatLng();
      return latLng.lat === parseFloat(loc.latitude) && 
             latLng.lng === parseFloat(loc.longitude);
    });
    if (marker) {
      marker.openPopup();
    }
  }
};

// ================= INIT PREVIEW MAP =================
function initPreviewMap(lat = 9.0820, lng = 8.6753) {
  const previewElement = document.getElementById("mapPreview");
  if (!previewElement) return;
  
  if (previewMap) {
    previewMap.remove();
  }

  try {
    previewMap = L.map("mapPreview").setView([lat, lng], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap'
    }).addTo(previewMap);

    previewMap.on("click", (e) => {
      if (locationLat) locationLat.value = e.latlng.lat.toFixed(6);
      if (locationLng) locationLng.value = e.latlng.lng.toFixed(6);
      
      if (previewMarker) {
        previewMap.removeLayer(previewMarker);
      }
      
      previewMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(previewMap);
    });

    if (lat && lng) {
      previewMarker = L.marker([lat, lng]).addTo(previewMap);
    }
  } catch (err) {
    console.error("Error initializing preview map:", err);
  }
}

// ================= OPEN ADD MODAL =================
function openAddModal() {
  if (modalTitle) modalTitle.textContent = "Add Program Location";
  
  if (locationTitle) locationTitle.value = "";
  if (locationDescription) locationDescription.value = "";
  if (locationState) locationState.value = "";
  if (locationAddress) locationAddress.value = "";
  if (locationLat) locationLat.value = "";
  if (locationLng) locationLng.value = "";
  if (programDate) programDate.value = "";
  if (startTime) startTime.value = "";
  if (endTime) endTime.value = "";
  if (hostSelect) hostSelect.value = "";
  
  selectedLocationId = null;
  
  setTimeout(() => initPreviewMap(), 100);
  
  if (locationModal) locationModal.classList.remove("hidden");
}

// ================= EDIT LOCATION =================
window.editLocation = function(locationId) {
  const loc = allLocations.find(l => l.id === locationId);
  if (!loc) return;

  if (modalTitle) modalTitle.textContent = "Edit Location";
  
  if (locationTitle) locationTitle.value = loc.title || "";
  if (locationDescription) locationDescription.value = loc.description || "";
  if (locationState) locationState.value = loc.state || "";
  if (locationAddress) locationAddress.value = loc.address || "";
  if (locationLat) locationLat.value = loc.latitude || "";
  if (locationLng) locationLng.value = loc.longitude || "";
  if (programDate) programDate.value = loc.program_date || "";
  if (startTime) startTime.value = loc.start_time || "";
  if (endTime) endTime.value = loc.end_time || "";
  if (hostSelect) hostSelect.value = loc.host_id || "";
  
  selectedLocationId = locationId;
  
  setTimeout(() => initPreviewMap(parseFloat(loc.latitude) || 9.0820, parseFloat(loc.longitude) || 8.6753), 100);
  
  if (locationModal) locationModal.classList.remove("hidden");
};

// ================= CONFIRM DELETE =================
window.confirmDelete = function(locationId) {
  selectedLocationId = locationId;
  if (deleteModal) deleteModal.classList.remove("hidden");
};

// ================= SAVE LOCATION =================
if (saveLocationBtn) {
  saveLocationBtn.onclick = async () => {
    if (!locationTitle.value || !locationState.value || !locationLat.value || !locationLng.value || !hostSelect.value) {
      alert("Please fill in all required fields (Title, State, Coordinates, and Host)");
      return;
    }

    const locationData = {
      title: locationTitle.value,
      description: locationDescription.value || null,
      state: locationState.value,
      address: locationAddress.value || null,
      latitude: Number(locationLat.value),
      longitude: Number(locationLng.value),
      host_id: hostSelect.value,
      host_name: allMembers.find(m => m.id === hostSelect.value)?.full_name,
      program_date: programDate.value || null,
      start_time: startTime.value || null,
      end_time: endTime.value || null,
      is_active: true
    };

    try {
      let error;

      if (selectedLocationId) {
        ({ error } = await supabase
          .from("locations")
          .update(locationData)
          .eq("id", selectedLocationId));
      } else {
        ({ error } = await supabase
          .from("locations")
          .insert([locationData]));
      }

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      if (locationModal) locationModal.classList.add("hidden");
      showNotification(selectedLocationId ? "Location updated" : "Location added", "success");
      await loadLocations();

    } catch (err) {
      console.error("Error saving location:", err);
      alert("Error saving location: " + (err.message || "Permission denied"));
    }
  };
}

// ================= CONFIRM DELETE =================
if (confirmDeleteBtn) {
  confirmDeleteBtn.onclick = async () => {
    if (!selectedLocationId) return;

    try {
      const { error } = await supabase
        .from("locations")
        .delete()
        .eq("id", selectedLocationId);

      if (error) throw error;

      if (deleteModal) deleteModal.classList.add("hidden");
      showNotification("Location deleted", "success");
      await loadLocations();

    } catch (err) {
      console.error("Error deleting location:", err);
      alert("Error deleting location: " + err.message);
    }
  };
}

// ================= CLOSE MODALS =================
if (closeLocationBtn) {
  closeLocationBtn.onclick = () => {
    if (locationModal) locationModal.classList.add("hidden");
  };
}

if (cancelDeleteBtn) {
  cancelDeleteBtn.onclick = () => {
    if (deleteModal) deleteModal.classList.add("hidden");
    selectedLocationId = null;
  };
}

// ================= SETUP EVENT LISTENERS =================
function setupEventListeners() {
  if (addLocationBtn) {
    addLocationBtn.onclick = openAddModal;
  }

  if (searchInput) {
    searchInput.addEventListener("input", filterAndDisplayLocations);
  }

  if (stateFilter) {
    stateFilter.addEventListener("change", filterAndDisplayLocations);
  }

  if (dateFilter) {
    dateFilter.addEventListener("change", filterAndDisplayLocations);
  }

  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await supabase.auth.signOut();
      window.location.href = "../index.html";
    };
  }

  window.onclick = (e) => {
    if (e.target === locationModal) {
      if (locationModal) locationModal.classList.add("hidden");
    }
    if (e.target === deleteModal) {
      if (deleteModal) deleteModal.classList.add("hidden");
    }
  };
}

// ================= START APPLICATION =================
// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", function() {
  console.log("DOM loaded, initializing map...");
  setTimeout(init, 500);
});