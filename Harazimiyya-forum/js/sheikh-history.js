// ============================================
// HARAZIMIYYA FORUM - SHEIKH HISTORY
// Admin: Add, Edit, Delete Content (Text, Images, Videos)
// Admin: Upload/Remove Sheikh Profile Image via Kebab Menu
// Members: View All Content
// Features: Resume reading from last position
// ============================================

// Global variables
let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let allContent = [];
let selectedContentId = null;
let selectedFile = null;
let scrollTimer = null;
let lastScrollPosition = 0;
let hasResumeButtonShown = false;

// Use a CDN placeholder to avoid 404
const DEFAULT_PLACEHOLDER = 'https://placehold.co/150x150/0b5e3b/white?text=Sheikh+Mahadi';

let sheikhProfile = {
  image_url: DEFAULT_PLACEHOLDER,
  name: 'Sheikh Mahadi',
  title: 'Spiritual Leader of Harazimiyya Forum',
  quote: 'Knowledge without sincerity is a burden; sincerity without knowledge is blind.'
};

// DOM Elements
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const openSidebar = document.getElementById("openSidebar");
const closeSidebar = document.getElementById("closeSidebar");
const logoutBtn = document.getElementById("logoutBtn");
const contentArea = document.getElementById("contentArea");
const addSectionBtn = document.getElementById("addSectionBtn");
const uploadModal = document.getElementById("uploadModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const saveContentBtn = document.getElementById("saveContentBtn");
const selectFileBtn = document.getElementById("selectFileBtn");
const fileInput = document.getElementById("fileInput");
const contentType = document.getElementById("contentType");
const contentTitle = document.getElementById("contentTitle");
const contentText = document.getElementById("contentText");

// Profile elements
const sheikhProfileImage = document.getElementById("sheikhProfileImage");
const sheikhName = document.getElementById("sheikhName");
const sheikhTitle = document.getElementById("sheikhTitle");
const sheikhQuote = document.getElementById("sheikhQuote");
const profileMenu = document.getElementById("profileMenu");
const profileMenuBtn = document.getElementById("profileMenuBtn");
const profileMenuDropdown = document.getElementById("profileMenuDropdown");
const uploadProfileImageBtn = document.getElementById("uploadProfileImageBtn");
const removeProfileImageBtn = document.getElementById("removeProfileImageBtn");

// Profile upload modal
const profileImageUploadModal = document.getElementById("profileImageUploadModal");
const closeProfileUploadModalBtn = document.getElementById("closeProfileUploadModalBtn");
const profileImageFile = document.getElementById("profileImageFile");
const profileImagePreview = document.getElementById("profileImagePreview");
const saveProfileImageBtn = document.getElementById("saveProfileImageBtn");

// Confirm remove modal
const confirmRemoveModal = document.getElementById("confirmRemoveModal");
const confirmRemoveBtn = document.getElementById("confirmRemoveBtn");
const cancelRemoveBtn = document.getElementById("cancelRemoveBtn");

// Resume elements
const resumeContainer = document.getElementById("resumeButtonContainer");
const resumeBtn = document.getElementById("resumeReadingBtn");

// Delete modal (will be created dynamically)
let deleteModal = null;

// ================= SIDEBAR TOGGLE =================
openSidebar.onclick = () => {
  sidebar.classList.add("active");
  overlay.classList.add("active");
};

closeSidebar.onclick = () => {
  sidebar.classList.remove("active");
  overlay.classList.remove("active");
};

overlay.onclick = () => {
  sidebar.classList.remove("active");
  overlay.classList.remove("active");
};

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

// ================= CREATE DELETE MODAL =================
function createDeleteModal() {
  const deleteModalHTML = `
    <div id="deleteModal" class="modal hidden">
      <div class="modal-content delete-modal">
        <i class="fas fa-exclamation-triangle" style="font-size: 48px;"></i>
        <h3>Delete Content?</h3>
        <p>This action cannot be undone.</p>
        <div class="modal-actions">
          <button id="confirmDeleteBtn" class="primary-btn" style="background: #dc3545;">Delete</button>
          <button id="cancelDeleteBtn" class="ghost-btn">Cancel</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', deleteModalHTML);
  deleteModal = document.getElementById('deleteModal');
  
  document.getElementById('cancelDeleteBtn').onclick = () => {
    deleteModal.classList.add('hidden');
    selectedContentId = null;
  };
  
  document.getElementById('confirmDeleteBtn').onclick = confirmDelete;
}

// ================= CREATE SCROLL PROGRESS BAR =================
function createScrollProgressBar() {
  const progressBar = document.createElement('div');
  progressBar.className = 'scroll-progress';
  progressBar.innerHTML = '<div class="scroll-progress-bar" id="scrollProgressBar"></div>';
  document.body.appendChild(progressBar);
}

// ================= CREATE JUMP TO TOP BUTTON =================
function createJumpToTopButton() {
  const jumpBtn = document.createElement('button');
  jumpBtn.id = 'jumpToTopBtn';
  jumpBtn.className = 'jump-to-top-btn';
  jumpBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
  jumpBtn.title = 'Jump to top';
  
  jumpBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
  
  document.body.appendChild(jumpBtn);
}

// ================= SETUP SCROLL TRACKING =================
function setupScrollTracking() {
  const progressBar = document.getElementById('scrollProgressBar');
  const jumpBtn = document.getElementById('jumpToTopBtn');
  
  window.addEventListener('scroll', () => {
    // Calculate scroll percentage
    const winScroll = document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    
    // Update progress bar
    if (progressBar) {
      progressBar.style.width = scrolled + '%';
    }
    
    // Show/hide jump to top button
    if (jumpBtn) {
      if (winScroll > 400) {
        jumpBtn.style.display = 'flex';
      } else {
        jumpBtn.style.display = 'none';
      }
    }
    
    // Save scroll position to localStorage (debounced)
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (winScroll > 100) { // Only save if scrolled down a bit
        localStorage.setItem('sheikhHistoryScroll', winScroll);
        localStorage.setItem('sheikhHistoryTimestamp', Date.now());
        console.log("📝 Saved scroll position:", winScroll);
      }
    }, 500);
  });
}

// ================= CHECK FOR SAVED SCROLL POSITION =================
function checkSavedScrollPosition() {
  const savedScroll = localStorage.getItem('sheikhHistoryScroll');
  const savedTimestamp = localStorage.getItem('sheikhHistoryTimestamp');
  
  if (!savedScroll || !savedTimestamp) {
    console.log("📖 No saved scroll position");
    return false;
  }
  
  // Check if saved position is from last 24 hours (86400000 ms)
  const hoursSinceSaved = (Date.now() - parseInt(savedTimestamp)) / (1000 * 60 * 60);
  
  if (hoursSinceSaved > 24) {
    console.log("📖 Saved position is older than 24 hours, clearing");
    localStorage.removeItem('sheikhHistoryScroll');
    localStorage.removeItem('sheikhHistoryTimestamp');
    return false;
  }
  
  // Check if scroll position is valid
  const maxScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const scrollPos = parseInt(savedScroll);
  
  if (scrollPos > 0 && scrollPos < maxScroll - 100) {
    console.log("📖 Found valid saved scroll position:", scrollPos);
    return scrollPos;
  }
  
  return false;
}

// ================= SHOW RESUME BUTTON =================
function showResumeButton(scrollPosition) {
  if (!resumeContainer || hasResumeButtonShown) return;
  
  // Format the position as percentage
  const maxScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const percentage = Math.round((scrollPosition / maxScroll) * 100);
  
  resumeContainer.classList.remove('hidden');
  hasResumeButtonShown = true;
  
  // Add click handler
  resumeBtn.onclick = () => {
    window.scrollTo({
      top: scrollPosition,
      behavior: 'smooth'
    });
    
    // Hide the button after clicking
    resumeContainer.classList.add('hidden');
    
    // Show notification
    showNotification('📖 Continuing from where you left off', 'success', 2000);
  };
  
  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (resumeContainer && !resumeContainer.classList.contains('hidden')) {
      resumeContainer.classList.add('hidden');
    }
  }, 10000);
}

// ================= LOAD SHEIKH PROFILE =================
async function loadSheikhProfile() {
  try {
    console.log("📋 Loading sheikh profile...");
    
    // Set default image first
    if (sheikhProfileImage) {
      sheikhProfileImage.src = DEFAULT_PLACEHOLDER;
    }
    
    // Try to get profile from database
    const { data, error } = await supabase
      .from('sheikh_profile')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error loading profile:", error);
      
      // If table doesn't exist, show a message
      if (error.code === '42P01') {
        console.log("⚠️ sheikh_profile table doesn't exist yet");
        showNotification("Profile table not set up. Please run SQL setup.", "warning");
      } else if (error.code === '42501') {
        console.log("⚠️ Permission denied. Check RLS policies.");
        showNotification("Permission denied. Admin may need to fix RLS policies.", "warning");
      }
      return;
    }

    if (data) {
      console.log("✅ Profile loaded from DB:", data);
      sheikhProfile = { ...sheikhProfile, ...data };
    } else {
      console.log("📝 No profile found in DB, using defaults");
      // Try to create default profile
      await saveSheikhProfile(sheikhProfile);
    }

    // Update UI
    if (sheikhProfileImage) {
      sheikhProfileImage.src = sheikhProfile.image_url || DEFAULT_PLACEHOLDER;
    }
    if (sheikhName) {
      sheikhName.textContent = sheikhProfile.name;
    }
    if (sheikhTitle) {
      sheikhTitle.textContent = sheikhProfile.title;
    }
    if (sheikhQuote) {
      sheikhQuote.textContent = sheikhProfile.quote;
    }

  } catch (err) {
    console.error("Error loading sheikh profile:", err);
  }
}

// ================= SAVE SHEIKH PROFILE =================
async function saveSheikhProfile(updates) {
  try {
    console.log("📝 Saving sheikh profile...", updates);
    
    sheikhProfile = { ...sheikhProfile, ...updates };

    const { data, error } = await supabase
      .from('sheikh_profile')
      .upsert([sheikhProfile])
      .select();

    if (error) {
      console.error("Error saving profile:", error);
      
      // More detailed error message
      if (error.code === '42P01') {
        showNotification("Database table not set up. Please run SQL setup.", "error");
      } else if (error.code === '42501') {
        showNotification("Permission denied. You need admin rights.", "error");
      } else {
        showNotification("Error saving profile: " + error.message, "error");
      }
      return false;
    }

    console.log("✅ Profile saved successfully:", data);
    showNotification("Profile updated successfully!", "success");
    
    return true;
  } catch (err) {
    console.error("Error saving sheikh profile:", err);
    return false;
  }
}

// ================= UPLOAD PROFILE IMAGE =================
async function uploadProfileImage(file) {
  try {
    if (!file) throw new Error("No file selected");

    console.log("📤 Uploading profile image:", file.name);

    // Validate file size (5MB max for profile)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Image too large. Maximum size is 5MB.");
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error("Please select a valid image file.");
    }

    // Create a unique filename
    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop();
    const fileName = `sheikh-profile/${timestamp}_profile.${fileExt}`;
    
    console.log("📁 Uploading to path:", fileName);

    // Upload new image
    const { error: uploadError } = await supabase.storage
      .from('sheikh-media')
      .upload(fileName, file, { 
        cacheControl: '3600',
        upsert: true 
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw uploadError;
    }

    console.log("✅ File uploaded successfully");

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('sheikh-media')
      .getPublicUrl(fileName);

    console.log("📸 Public URL:", publicUrl);

    return publicUrl;
  } catch (err) {
    console.error("Error uploading profile image:", err);
    throw err;
  }
}

// ================= REMOVE PROFILE IMAGE =================
async function removeProfileImage() {
  try {
    // Remove old image if exists (and not placeholder)
    if (sheikhProfile.image_url && 
        !sheikhProfile.image_url.includes('placehold.co') && 
        !sheikhProfile.image_url.includes('placeholder')) {
      try {
        const urlParts = sheikhProfile.image_url.split('/');
        const oldFileName = urlParts[urlParts.length - 1];
        if (oldFileName) {
          const oldPath = `sheikh-profile/${oldFileName}`;
          await supabase.storage
            .from('sheikh-media')
            .remove([oldPath]);
          console.log("🗑️ Old image removed:", oldPath);
        }
      } catch (e) {
        console.log("Could not remove old image:", e);
      }
    }

    // Update profile with placeholder
    const success = await saveSheikhProfile({ image_url: DEFAULT_PLACEHOLDER });
    
    if (success) {
      sheikhProfileImage.src = DEFAULT_PLACEHOLDER;
      showNotification('✅ Profile image removed', 'success');
    }
  } catch (err) {
    console.error("Error removing profile image:", err);
    showNotification('Error removing image', 'error');
  }
}

// ================= SETUP KEBAB MENU =================
function setupKebabMenu() {
  if (!isAdmin) {
    if (profileMenu) profileMenu.style.display = 'none';
    return;
  }

  // Show the menu for admin
  if (profileMenu) {
    profileMenu.style.display = 'block';
  }

  // Toggle dropdown on button click
  if (profileMenuBtn) {
    profileMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      profileMenuDropdown.classList.toggle('show');
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!profileMenu?.contains(e.target)) {
      profileMenuDropdown?.classList.remove('show');
    }
  });

  // Upload button click
  if (uploadProfileImageBtn) {
    uploadProfileImageBtn.addEventListener('click', () => {
      profileMenuDropdown.classList.remove('show');
      profileImageUploadModal.classList.remove('hidden');
      profileImagePreview.src = sheikhProfile.image_url || DEFAULT_PLACEHOLDER;
    });
  }

  // Remove button click
  if (removeProfileImageBtn) {
    removeProfileImageBtn.addEventListener('click', () => {
      profileMenuDropdown.classList.remove('show');
      confirmRemoveModal.classList.remove('hidden');
    });
  }

  // Close upload modal
  if (closeProfileUploadModalBtn) {
    closeProfileUploadModalBtn.addEventListener('click', () => {
      profileImageUploadModal.classList.add('hidden');
      profileImageFile.value = '';
    });
  }

  // Image preview
  if (profileImageFile) {
    profileImageFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          profileImagePreview.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Save uploaded image
  if (saveProfileImageBtn) {
    saveProfileImageBtn.addEventListener('click', async () => {
      const file = profileImageFile.files[0];
      
      if (!file) {
        showNotification('Please select an image', 'error');
        return;
      }

      saveProfileImageBtn.disabled = true;
      saveProfileImageBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

      try {
        const imageUrl = await uploadProfileImage(file);
        
        // Remove old image before saving new one
        if (sheikhProfile.image_url && 
            !sheikhProfile.image_url.includes('placehold.co') && 
            !sheikhProfile.image_url.includes('placeholder')) {
          try {
            const urlParts = sheikhProfile.image_url.split('/');
            const oldFileName = urlParts[urlParts.length - 1];
            if (oldFileName) {
              const oldPath = `sheikh-profile/${oldFileName}`;
              await supabase.storage
                .from('sheikh-media')
                .remove([oldPath]);
            }
          } catch (e) {
            console.log("Could not remove old image:", e);
          }
        }

        const success = await saveSheikhProfile({ image_url: imageUrl });

        if (success) {
          sheikhProfileImage.src = imageUrl;
          profileImageUploadModal.classList.add('hidden');
          showNotification('✅ Profile image updated successfully!', 'success');
        } else {
          showNotification('❌ Failed to update profile image', 'error');
        }
      } catch (err) {
        showNotification('❌ Error: ' + err.message, 'error');
      } finally {
        saveProfileImageBtn.disabled = false;
        saveProfileImageBtn.innerHTML = '<i class="fas fa-save"></i> Upload Image';
        profileImageFile.value = '';
      }
    });
  }

  // Close confirm remove modal
  if (cancelRemoveBtn) {
    cancelRemoveBtn.addEventListener('click', () => {
      confirmRemoveModal.classList.add('hidden');
    });
  }

  // Confirm remove
  if (confirmRemoveBtn) {
    confirmRemoveBtn.addEventListener('click', async () => {
      confirmRemoveModal.classList.add('hidden');
      await removeProfileImage();
    });
  }

  // Close modals when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === profileImageUploadModal) {
      profileImageUploadModal.classList.add('hidden');
    }
    if (e.target === confirmRemoveModal) {
      confirmRemoveModal.classList.add('hidden');
    }
  });
}

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Sheikh History page initializing...");
  
  // Create UI elements
  createScrollProgressBar();
  createJumpToTopButton();
  
  await init();
  createDeleteModal();
  setupEventListeners();
  setupKebabMenu();
  setupScrollTracking();
  await loadSheikhProfile();
});

async function init() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.log("No user found, redirecting to login");
      window.location.href = "../index.html";
      return;
    }

    currentUser = user;
    console.log("Current user:", user.email);

    // Get user profile
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
    isAdmin = profile.role === "admin";
    console.log("Is admin:", isAdmin);

    // Show admin controls
    if (isAdmin) {
      if (addSectionBtn) {
        addSectionBtn.classList.remove("hidden");
      }
    }

    // Load content
    await loadContent();

    // Check for saved scroll position after content loads
    setTimeout(() => {
      const savedScroll = checkSavedScrollPosition();
      if (savedScroll) {
        showResumeButton(savedScroll);
      }
    }, 1000);

  } catch (err) {
    console.error("Initialization error:", err);
  }
}

// ================= LOAD CONTENT =================
async function loadContent() {
  // Show loading spinner
  contentArea.innerHTML = `
    <div class="loading-spinner">
      <i class="fas fa-spinner fa-spin"></i> Loading content...
    </div>
  `;

  try {
    const { data, error } = await supabase
      .from("sheikh_history")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    allContent = data || [];
    displayContent(allContent);

  } catch (err) {
    console.error("Error loading content:", err);
    contentArea.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <h3>Error Loading Content</h3>
        <p>Please try again later</p>
      </div>
    `;
  }
}

// ================= DISPLAY CONTENT =================
function displayContent(content) {
  contentArea.innerHTML = "";

  if (!content || content.length === 0) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-book-open"></i>
        <h3>No Content Yet</h3>
        <p>${isAdmin ? 'Click "Add Content" to share the Sheikh\'s history' : 'Check back later for updates'}</p>
      </div>
    `;
    return;
  }

  content.forEach(item => {
    const card = createContentCard(item);
    contentArea.appendChild(card);
  });
}

// ================= CREATE CONTENT CARD =================
function createContentCard(item) {
  const card = document.createElement("div");
  card.className = `content-card ${item.content_type}`;
  card.setAttribute('data-content-id', item.id);
  
  const date = new Date(item.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  
  let content = '';
  
  if (item.content_type === 'text') {
    content = `
      <div class="card-content">
        <h3>${item.title}</h3>
        <p>${item.content || ''}</p>
        <div class="card-meta">
          <span><i class="fas fa-calendar"></i> ${date}</span>
          ${item.location ? `<span><i class="fas fa-map-marker-alt"></i> ${item.location}</span>` : ''}
          ${item.event_date ? `<span><i class="fas fa-calendar-alt"></i> ${new Date(item.event_date).toLocaleDateString()}</span>` : ''}
        </div>
      </div>
    `;
  } else if (item.content_type === 'image') {
    content = `
      <img src="${item.media_url}" alt="${item.title}" class="card-media" loading="lazy">
      <div class="card-content">
        <h3>${item.title}</h3>
        <div class="card-meta">
          <span><i class="fas fa-calendar"></i> ${date}</span>
        </div>
      </div>
    `;
  } else if (item.content_type === 'video') {
    content = `
      <video controls class="card-media" preload="metadata">
        <source src="${item.media_url}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
      <div class="card-content">
        <h3>${item.title}</h3>
        <div class="card-meta">
          <span><i class="fas fa-calendar"></i> ${date}</span>
        </div>
      </div>
    `;
  }
  
  card.innerHTML = `
    <span class="card-badge">${item.content_type}</span>
    ${content}
    ${isAdmin ? `
      <div class="admin-actions">
        <button class="admin-btn edit-btn" onclick="editContent('${item.id}')" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="admin-btn delete-btn" onclick="openDeleteModal('${item.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    ` : ''}
  `;
  
  return card;
}

// ================= SETUP EVENT LISTENERS =================
function setupEventListeners() {
  // Modal controls
  if (addSectionBtn) addSectionBtn.onclick = openAddModal;
  if (closeModalBtn) closeModalBtn.onclick = closeModal;
  if (selectFileBtn) selectFileBtn.onclick = () => fileInput.click();
  
  if (fileInput) {
    fileInput.onchange = (e) => {
      selectedFile = e.target.files[0];
      if (selectedFile) {
        // Show file info
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = `
          <i class="fas fa-check-circle" style="color: var(--success);"></i>
          <span>Selected: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(2)} KB)</span>
        `;
        
        // Remove existing file info
        const existingInfo = document.querySelector('.file-info');
        if (existingInfo) existingInfo.remove();
        
        selectFileBtn.parentNode.insertBefore(fileInfo, selectFileBtn.nextSibling);
        
        // Show preview for images
        if (contentType.value === 'image' && selectedFile.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const preview = document.createElement('img');
            preview.src = e.target.result;
            preview.className = 'preview-image';
            
            const existingPreview = document.querySelector('.preview-image');
            if (existingPreview) existingPreview.remove();
            
            fileInfo.insertAdjacentElement('afterend', preview);
          };
          reader.readAsDataURL(selectedFile);
        }
      }
    };
  }
  
  // Content type change
  if (contentType) {
    contentType.onchange = () => {
      const isText = contentType.value === 'text';
      if (contentText) contentText.style.display = isText ? 'block' : 'none';
      if (selectFileBtn) selectFileBtn.style.display = isText ? 'none' : 'inline-block';
      if (fileInput) fileInput.value = '';
      selectedFile = null;
      
      // Remove file info and preview
      const fileInfo = document.querySelector('.file-info');
      if (fileInfo) fileInfo.remove();
      
      const preview = document.querySelector('.preview-image');
      if (preview) preview.remove();
    };
  }
  
  // Save content
  if (saveContentBtn) saveContentBtn.onclick = saveContent;
  
  // Logout
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      localStorage.removeItem('sheikhHistoryScroll');
      localStorage.removeItem('sheikhHistoryTimestamp');
      await supabase.auth.signOut();
      window.location.href = "../index.html";
    };
  }
}

// ================= OPEN ADD MODAL =================
function openAddModal() {
  document.querySelector('#uploadModal h3').textContent = 'Add Sheikh Content';
  if (contentTitle) contentTitle.value = '';
  if (contentText) contentText.value = '';
  if (contentType) contentType.value = 'text';
  selectedFile = null;
  if (fileInput) fileInput.value = '';
  selectedContentId = null;
  
  // Reset UI
  if (contentText) contentText.style.display = 'block';
  if (selectFileBtn) selectFileBtn.style.display = 'none';
  
  const fileInfo = document.querySelector('.file-info');
  if (fileInfo) fileInfo.remove();
  
  const preview = document.querySelector('.preview-image');
  if (preview) preview.remove();
  
  if (uploadModal) uploadModal.classList.remove('hidden');
}

// ================= EDIT CONTENT =================
window.editContent = function(id) {
  const item = allContent.find(c => c.id === id);
  if (!item) return;
  
  document.querySelector('#uploadModal h3').textContent = 'Edit Content';
  if (contentTitle) contentTitle.value = item.title || '';
  if (contentText) contentText.value = item.content || '';
  if (contentType) contentType.value = item.content_type;
  selectedContentId = id;
  selectedFile = null;
  
  const isText = item.content_type === 'text';
  if (contentText) contentText.style.display = isText ? 'block' : 'none';
  if (selectFileBtn) selectFileBtn.style.display = isText ? 'none' : 'inline-block';
  
  // Show existing file info for media
  if (!isText && item.media_url && selectFileBtn) {
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.innerHTML = `
      <i class="fas fa-check-circle" style="color: var(--success);"></i>
      <span>Current file: ${item.media_url.split('/').pop()}</span>
    `;
    
    const existingInfo = document.querySelector('.file-info');
    if (existingInfo) existingInfo.remove();
    
    selectFileBtn.parentNode.insertBefore(fileInfo, selectFileBtn.nextSibling);
    
    // Show preview for images
    if (item.content_type === 'image') {
      const preview = document.createElement('img');
      preview.src = item.media_url;
      preview.className = 'preview-image';
      
      const existingPreview = document.querySelector('.preview-image');
      if (existingPreview) existingPreview.remove();
      
      fileInfo.insertAdjacentElement('afterend', preview);
    }
  }
  
  if (uploadModal) uploadModal.classList.remove('hidden');
};

// ================= SAVE CONTENT =================
async function saveContent() {
  const title = contentTitle.value.trim();
  if (!title) {
    showNotification('Please enter a title', 'error');
    return;
  }

  const type = contentType.value;
  let mediaUrl = null;
  let content = null;

  try {
    // Handle file upload for images/videos
    if (type !== 'text') {
      if (selectedFile) {
        // Upload new file
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `sheikh/${Date.now()}_${selectedFile.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('sheikh-media')
          .upload(fileName, selectedFile);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('sheikh-media')
          .getPublicUrl(fileName);
        
        mediaUrl = publicUrl;
      } else if (selectedContentId) {
        // Keep existing media URL when editing
        const existing = allContent.find(c => c.id === selectedContentId);
        mediaUrl = existing?.media_url;
      } else {
        showNotification('Please select a file', 'error');
        return;
      }
    } else {
      content = contentText.value.trim();
      if (!content) {
        showNotification('Please enter content', 'error');
        return;
      }
    }

    const contentData = {
      title,
      content_type: type,
      content: type === 'text' ? content : null,
      media_url: mediaUrl,
      created_by: currentUser.id
    };

    let error;

    if (selectedContentId) {
      // Update existing
      ({ error } = await supabase
        .from('sheikh_history')
        .update(contentData)
        .eq('id', selectedContentId));
    } else {
      // Insert new
      ({ error } = await supabase
        .from('sheikh_history')
        .insert([contentData]));
    }

    if (error) throw error;

    closeModal();
    showNotification(selectedContentId ? 'Content updated' : 'Content added');
    await loadContent();

  } catch (err) {
    console.error("Error saving content:", err);
    showNotification('Error: ' + err.message, 'error');
  }
}

// ================= OPEN DELETE MODAL =================
window.openDeleteModal = function(id) {
  selectedContentId = id;
  if (deleteModal) deleteModal.classList.remove('hidden');
};

// ================= CONFIRM DELETE =================
async function confirmDelete() {
  if (!selectedContentId) return;

  try {
    // Get the item to delete its media file if any
    const item = allContent.find(c => c.id === selectedContentId);
    
    // Delete from database
    const { error } = await supabase
      .from('sheikh_history')
      .delete()
      .eq('id', selectedContentId);

    if (error) throw error;

    // Try to delete associated media file if exists
    if (item?.media_url) {
      try {
        const path = item.media_url.split('/').pop();
        await supabase.storage
          .from('sheikh-media')
          .remove([`sheikh/${path}`]);
      } catch (storageErr) {
        console.log("Could not delete media file:", storageErr);
      }
    }

    if (deleteModal) deleteModal.classList.add('hidden');
    showNotification('Content deleted');
    await loadContent();

  } catch (err) {
    console.error("Error deleting content:", err);
    showNotification('Error deleting content', 'error');
  }
}

// ================= CLOSE MODAL =================
function closeModal() {
  if (uploadModal) uploadModal.classList.add('hidden');
  if (contentTitle) contentTitle.value = '';
  if (contentText) contentText.value = '';
  if (contentType) contentType.value = 'text';
  selectedFile = null;
  if (fileInput) fileInput.value = '';
  selectedContentId = null;
  
  // Remove file info and preview
  const fileInfo = document.querySelector('.file-info');
  if (fileInfo) fileInfo.remove();
  
  const preview = document.querySelector('.preview-image');
  if (preview) preview.remove();
  
  if (contentText) contentText.style.display = 'block';
  if (selectFileBtn) selectFileBtn.style.display = 'none';
}