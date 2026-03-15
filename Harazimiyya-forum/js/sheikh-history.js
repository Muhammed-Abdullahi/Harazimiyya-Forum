// ============================================
// HARAZIMIYYA FORUM - SHEIKH HISTORY
// Admin: Add, Edit, Delete Content (Text, Images, Videos)
// Admin: Upload/Remove Sheikh Profile Image via Kebab Menu
// Members: View All Content
// Features: Resume reading from last position
// UPDATED: Fixed file input preview
// ============================================

// ================= CLOUDINARY CONFIGURATION =================
const CLOUDINARY_CONFIG = {
    cloudName: 'df3koezfk',
    uploadPreset: 'community_upload',
    folder: 'community-app',
    subFolders: {
        image: 'Image',
        video: 'Video',
        profile: 'profile-images'
    }
};

// Helper function to get Cloudinary upload URL
function getCloudinaryUploadUrl() {
    return `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`;
}

// ================= CHECK IF URL IS FROM CLOUDINARY =================
function isCloudinaryUrl(url) {
    return url && url.includes('cloudinary.com');
}

// ================= CHECK IF URL IS FROM SUPABASE =================
function isSupabaseUrl(url) {
    return url && url.includes('supabase.co');
}

// ================= GET OPTIMIZED CLOUDINARY URL =================
function getOptimizedCloudinaryUrl(url, options = {}) {
    if (!url || !isCloudinaryUrl(url)) return url;
    
    if (options.width || options.height) {
        const parts = url.split('/upload/');
        if (parts.length === 2) {
            let transformation = '';
            if (options.width) transformation += `w_${options.width},`;
            if (options.height) transformation += `h_${options.height},`;
            if (options.crop) transformation += `c_${options.crop},`;
            
            if (transformation) {
                transformation = transformation.replace(/,$/, '') + '/';
                return parts[0] + '/upload/' + transformation + parts[1];
            }
        }
    }
    return url;
}

// ================= GET FALLBACK IMAGE =================
function getFallbackImageUrl() {
    return 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'300\' viewBox=\'0 0 400 300\'%3E%3Crect width=\'400\' height=\'300\' fill=\'%230b5e3b\'/%3E%3Ctext x=\'50\' y=\'150\' font-family=\'Arial\' font-size=\'20\' fill=\'%23ffffff\'%3EImage failed to load%3C/text%3E%3C/svg%3E';
}

// ================= GET PROFILE PLACEHOLDER =================
function getProfilePlaceholder() {
    return 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'150\' height=\'150\' viewBox=\'0 0 150 150\'%3E%3Ccircle cx=\'75\' cy=\'75\' r=\'75\' fill=\'%230b5e3b\'/%3E%3Ctext x=\'75\' y=\'90\' font-family=\'Arial\' font-size=\'40\' fill=\'%23ffffff\' text-anchor=\'middle\'%3E👤%3C/text%3E%3C/svg%3E';
}

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
let failedImages = new Set();
let currentLightbox = null;

const PROFILE_PLACEHOLDER = getProfilePlaceholder();

let sheikhProfile = {
  image_url: PROFILE_PLACEHOLDER,
  name: 'Sheikh Mahadi',
  title: 'Spiritual Leader of Harazimiyya Forum',
  quote: 'Knowledge without sincerity is a burden; sincerity without knowledge is blind.'
};

// DOM Elements with null checks
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
const sheikhProfileImage = document.getElementById("sheikhProfileImage");
const sheikhName = document.getElementById("sheikhName");
const sheikhTitle = document.getElementById("sheikhTitle");
const sheikhQuote = document.getElementById("sheikhQuote");
const profileMenu = document.getElementById("profileMenu");
const profileMenuBtn = document.getElementById("profileMenuBtn");
const profileMenuDropdown = document.getElementById("profileMenuDropdown");
const uploadProfileImageBtn = document.getElementById("uploadProfileImageBtn");
const removeProfileImageBtn = document.getElementById("removeProfileImageBtn");
const profileImageUploadModal = document.getElementById("profileImageUploadModal");
const closeProfileUploadModalBtn = document.getElementById("closeProfileUploadModalBtn");
const profileImageFile = document.getElementById("profileImageFile");
const profileImagePreview = document.getElementById("profileImagePreview");
const saveProfileImageBtn = document.getElementById("saveProfileImageBtn");
const confirmRemoveModal = document.getElementById("confirmRemoveModal");
const confirmRemoveBtn = document.getElementById("confirmRemoveBtn");
const cancelRemoveBtn = document.getElementById("cancelRemoveBtn");
const resumeContainer = document.getElementById("resumeButtonContainer");
const resumeBtn = document.getElementById("resumeReadingBtn");

// Delete modal (will be created dynamically)
let deleteModal = null;

// ================= SIDEBAR TOGGLE WITH NULL CHECKS =================
if (openSidebar) {
    openSidebar.onclick = () => {
        if (sidebar) sidebar.classList.add("active");
        if (overlay) overlay.classList.add("active");
    };
}

if (closeSidebar) {
    closeSidebar.onclick = () => {
        if (sidebar) sidebar.classList.remove("active");
        if (overlay) overlay.classList.remove("active");
    };
}

if (overlay) {
    overlay.onclick = () => {
        if (sidebar) sidebar.classList.remove("active");
        if (overlay) overlay.classList.remove("active");
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

// ================= LIGHTBOX FUNCTION =================
function createLightbox(src) {
    if (currentLightbox) {
        currentLightbox.remove();
    }
    
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox-modal';
    lightbox.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: pointer;
    `;
    
    lightbox.innerHTML = `
        <img src="${src}" style="max-width: 90%; max-height: 90%; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
        <button style="position: absolute; top: 20px; right: 20px; background: white; border: none; width: 44px; height: 44px; border-radius: 50%; font-size: 24px; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 10001;">✕</button>
    `;
    
    document.body.appendChild(lightbox);
    currentLightbox = lightbox;
    
    lightbox.onclick = (e) => {
        if (e.target === lightbox || e.target.tagName === 'BUTTON') {
            lightbox.remove();
            currentLightbox = null;
        }
    };
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
  
  const cancelBtn = document.getElementById('cancelDeleteBtn');
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      if (deleteModal) deleteModal.classList.add('hidden');
      selectedContentId = null;
    };
  }
  
  if (confirmBtn) {
    confirmBtn.onclick = confirmDelete;
  }
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
    const winScroll = document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    
    if (progressBar) {
      progressBar.style.width = scrolled + '%';
    }
    
    if (jumpBtn) {
      jumpBtn.style.display = winScroll > 400 ? 'flex' : 'none';
    }
    
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (winScroll > 100) {
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
  
  if (!savedScroll || !savedTimestamp) return false;
  
  const hoursSinceSaved = (Date.now() - parseInt(savedTimestamp)) / (1000 * 60 * 60);
  
  if (hoursSinceSaved > 24) {
    localStorage.removeItem('sheikhHistoryScroll');
    localStorage.removeItem('sheikhHistoryTimestamp');
    return false;
  }
  
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
  
  const maxScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const percentage = Math.round((scrollPosition / maxScroll) * 100);
  
  resumeContainer.classList.remove('hidden');
  hasResumeButtonShown = true;
  
  if (resumeBtn) {
    resumeBtn.onclick = () => {
      window.scrollTo({
        top: scrollPosition,
        behavior: 'smooth'
      });
      resumeContainer.classList.add('hidden');
      showNotification('📖 Continuing from where you left off', 'success', 2000);
    };
  }
  
  setTimeout(() => {
    if (resumeContainer && !resumeContainer.classList.contains('hidden')) {
      resumeContainer.classList.add('hidden');
    }
  }, 10000);
}

// ================= UPLOAD FILE TO CLOUDINARY =================
async function uploadFileToCloudinary(file, type, subfolder = '') {
  try {
    if (!file) throw new Error("No file to upload");
    
    console.log("📤 Uploading to Cloudinary:", file.name, file.type);
    
    let folder = CLOUDINARY_CONFIG.folder;
    if (subfolder) {
      folder += '/' + subfolder;
    } else if (type === 'image') {
      folder += '/' + CLOUDINARY_CONFIG.subFolders.image;
    } else if (type === 'video') {
      folder += '/' + CLOUDINARY_CONFIG.subFolders.video;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
    formData.append('folder', folder);
    
    showNotification('📤 Uploading to Cloudinary...', 'info');
    
    const response = await fetch(getCloudinaryUploadUrl(), {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Cloudinary upload failed');
    }
    
    const data = await response.json();
    console.log("✅ Cloudinary upload successful:", data.secure_url);
    showNotification('✅ Uploaded to Cloudinary', 'success');
    
    return data.secure_url;
    
  } catch (err) {
    console.error("❌ Error uploading to Cloudinary:", err);
    showNotification('Failed to upload to Cloudinary: ' + err.message, 'error');
    throw err;
  }
}

// ================= LOAD SHEIKH PROFILE =================
async function loadSheikhProfile() {
  try {
    console.log("📋 Loading sheikh profile...");
    
    if (sheikhProfileImage) {
      sheikhProfileImage.src = PROFILE_PLACEHOLDER;
    }
    
    const { data, error } = await supabase
      .from('sheikh_profile')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error loading profile:", error);
      if (error.code === '42P01') {
        showNotification("Profile table not set up. Please run SQL setup.", "warning");
      } else if (error.code === '42501') {
        showNotification("Permission denied. Admin may need to fix RLS policies.", "warning");
      }
      return;
    }

    if (data) {
      console.log("✅ Profile loaded from DB:", data);
      sheikhProfile = { ...sheikhProfile, ...data };
    } else {
      console.log("📝 No profile found in DB, using defaults");
      await saveSheikhProfile(sheikhProfile);
    }

    if (sheikhProfileImage) {
      sheikhProfileImage.src = sheikhProfile.image_url || PROFILE_PLACEHOLDER;
      sheikhProfileImage.onerror = () => {
        if (sheikhProfileImage) sheikhProfileImage.src = PROFILE_PLACEHOLDER;
      };
    }
    if (sheikhName) sheikhName.textContent = sheikhProfile.name;
    if (sheikhTitle) sheikhTitle.textContent = sheikhProfile.title;
    if (sheikhQuote) sheikhQuote.textContent = sheikhProfile.quote;

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

// ================= UPLOAD PROFILE IMAGE TO CLOUDINARY =================
async function uploadProfileImageToCloudinary(file) {
  try {
    if (!file) throw new Error("No file selected");
    if (file.size > 5 * 1024 * 1024) throw new Error("Image too large. Maximum size is 5MB.");
    if (!file.type.startsWith('image/')) throw new Error("Please select a valid image file.");

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
    formData.append('folder', `${CLOUDINARY_CONFIG.folder}/${CLOUDINARY_CONFIG.subFolders.profile}`);
    
    showNotification('📤 Uploading profile image to Cloudinary...', 'info');
    
    const response = await fetch(getCloudinaryUploadUrl(), {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Cloudinary upload failed');
    }

    const data = await response.json();
    console.log("✅ Cloudinary profile upload successful:", data.secure_url);
    
    return data.secure_url;
  } catch (err) {
    console.error("Error uploading profile image:", err);
    throw err;
  }
}

// ================= UPLOAD PROFILE IMAGE =================
async function uploadProfileImage(file) {
  try {
    const imageUrl = await uploadProfileImageToCloudinary(file);
    
    if (sheikhProfile.image_url && !sheikhProfile.image_url.includes('data:image') && isSupabaseUrl(sheikhProfile.image_url)) {
      try {
        const urlParts = sheikhProfile.image_url.split('/');
        const oldFileName = urlParts[urlParts.length - 1];
        if (oldFileName) {
          const oldPath = `sheikh-profile/${oldFileName}`;
          await supabase.storage.from('sheikh-media').remove([oldPath]);
          console.log("🗑️ Old Supabase image removed:", oldPath);
        }
      } catch (e) {
        console.log("Could not remove old image:", e);
      }
    }
    return imageUrl;
  } catch (err) {
    throw err;
  }
}

// ================= REMOVE PROFILE IMAGE =================
async function removeProfileImage() {
  try {
    if (sheikhProfile.image_url && !sheikhProfile.image_url.includes('data:image') && isSupabaseUrl(sheikhProfile.image_url)) {
      try {
        const urlParts = sheikhProfile.image_url.split('/');
        const oldFileName = urlParts[urlParts.length - 1];
        if (oldFileName) {
          const oldPath = `sheikh-profile/${oldFileName}`;
          await supabase.storage.from('sheikh-media').remove([oldPath]);
          console.log("🗑️ Old image removed:", oldPath);
        }
      } catch (e) {
        console.log("Could not remove old image:", e);
      }
    }

    const success = await saveSheikhProfile({ image_url: PROFILE_PLACEHOLDER });
    
    if (success && sheikhProfileImage) {
      sheikhProfileImage.src = PROFILE_PLACEHOLDER;
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

  if (profileMenu) profileMenu.style.display = 'block';

  if (profileMenuBtn) {
    profileMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (profileMenuDropdown) profileMenuDropdown.classList.toggle('show');
    });
  }

  document.addEventListener('click', (e) => {
    if (profileMenuDropdown && !profileMenu?.contains(e.target)) {
      profileMenuDropdown.classList.remove('show');
    }
  });

  if (uploadProfileImageBtn) {
    uploadProfileImageBtn.addEventListener('click', () => {
      if (profileMenuDropdown) profileMenuDropdown.classList.remove('show');
      if (profileImageUploadModal) {
        profileImageUploadModal.classList.remove('hidden');
        if (profileImagePreview) {
          profileImagePreview.src = sheikhProfile.image_url || PROFILE_PLACEHOLDER;
        }
      }
    });
  }

  if (removeProfileImageBtn) {
    removeProfileImageBtn.addEventListener('click', () => {
      if (profileMenuDropdown) profileMenuDropdown.classList.remove('show');
      if (confirmRemoveModal) confirmRemoveModal.classList.remove('hidden');
    });
  }

  if (closeProfileUploadModalBtn) {
    closeProfileUploadModalBtn.addEventListener('click', () => {
      if (profileImageUploadModal) profileImageUploadModal.classList.add('hidden');
      if (profileImageFile) profileImageFile.value = '';
    });
  }

  if (profileImageFile) {
    profileImageFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && profileImagePreview) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (profileImagePreview) profileImagePreview.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (saveProfileImageBtn) {
    saveProfileImageBtn.addEventListener('click', async () => {
      const file = profileImageFile?.files[0];
      
      if (!file) {
        showNotification('Please select an image', 'error');
        return;
      }

      saveProfileImageBtn.disabled = true;
      saveProfileImageBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

      try {
        const imageUrl = await uploadProfileImage(file);
        const success = await saveSheikhProfile({ image_url: imageUrl });

        if (success && sheikhProfileImage) {
          sheikhProfileImage.src = imageUrl;
          sheikhProfileImage.onerror = () => {
            if (sheikhProfileImage) sheikhProfileImage.src = PROFILE_PLACEHOLDER;
          };
          if (profileImageUploadModal) profileImageUploadModal.classList.add('hidden');
          showNotification('✅ Profile image updated successfully!', 'success');
        }
      } catch (err) {
        showNotification('❌ Error: ' + err.message, 'error');
      } finally {
        saveProfileImageBtn.disabled = false;
        saveProfileImageBtn.innerHTML = '<i class="fas fa-save"></i> Upload Image';
        if (profileImageFile) profileImageFile.value = '';
      }
    });
  }

  if (cancelRemoveBtn) {
    cancelRemoveBtn.addEventListener('click', () => {
      if (confirmRemoveModal) confirmRemoveModal.classList.add('hidden');
    });
  }

  if (confirmRemoveBtn) {
    confirmRemoveBtn.addEventListener('click', async () => {
      if (confirmRemoveModal) confirmRemoveModal.classList.add('hidden');
      await removeProfileImage();
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === profileImageUploadModal && profileImageUploadModal) {
      profileImageUploadModal.classList.add('hidden');
    }
    if (e.target === confirmRemoveModal && confirmRemoveModal) {
      confirmRemoveModal.classList.add('hidden');
    }
  });
}

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Sheikh History page initializing...");
  
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
    isAdmin = profile.role === "admin";
    console.log("Is admin:", isAdmin);

    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = profile.full_name || 'Member';

    if (isAdmin && addSectionBtn) addSectionBtn.classList.remove("hidden");

    await loadContent();

    setTimeout(() => {
      const savedScroll = checkSavedScrollPosition();
      if (savedScroll) showResumeButton(savedScroll);
    }, 1000);

  } catch (err) {
    console.error("Initialization error:", err);
  }
}

// ================= LOAD CONTENT =================
async function loadContent() {
  if (!contentArea) return;
  
  contentArea.innerHTML = `
    <div class="loading-spinner">
      <i class="fas fa-spinner fa-spin"></i> Loading content...
    </div>
  `;

  try {
    const { data, error } = await supabase
      .from("sheikh_history")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    allContent = data || [];
    displayContent(allContent);
    
    setTimeout(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
    }, 500);

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
  if (!contentArea) return;
  
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

  const sortedContent = [...content].sort((a, b) => 
    new Date(a.created_at) - new Date(b.created_at)
  );

  sortedContent.forEach(item => {
    const card = createContentCard(item);
    if (card) contentArea.appendChild(card);
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
  
  const cloudBadge = isCloudinaryUrl(item.media_url) ? 
    '<span class="cloud-badge" style="margin-left: 8px; font-size: 0.7rem; background: #0b5e3b; color: white; padding: 2px 6px; border-radius: 4px;"><i class="fas fa-cloud"></i> Cloud</span>' : '';
  
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
    let imageUrl = item.media_url;
    if (isCloudinaryUrl(item.media_url)) {
      imageUrl = getOptimizedCloudinaryUrl(item.media_url, { width: 400, height: 300, crop: 'limit' });
    }
    
    content = `
      <img src="${imageUrl}" alt="${item.title}" class="card-media" loading="lazy" onclick="viewImage('${item.media_url}')" style="cursor: pointer;" onerror="this.onerror=null; this.src='${getFallbackImageUrl()}';">
      <div class="card-content">
        <h3>${item.title} ${cloudBadge}</h3>
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
        <h3>${item.title} ${cloudBadge}</h3>
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

// ================= VIEW IMAGE FUNCTION =================
window.viewImage = function(url) {
    createLightbox(url);
};

// ================= CLEAR MODAL CONTENT HELPER =================
function clearModalContent() {
    // Remove file info
    const fileInfo = document.querySelector('.file-info');
    if (fileInfo) fileInfo.remove();
    
    // Remove preview image
    const preview = document.querySelector('.preview-image');
    if (preview) preview.remove();
}

// ================= SETUP EVENT LISTENERS =================
function setupEventListeners() {
  if (addSectionBtn) addSectionBtn.onclick = openAddModal;
  if (closeModalBtn) closeModalBtn.onclick = closeModal;
  if (selectFileBtn) selectFileBtn.onclick = () => fileInput?.click();
  
  if (fileInput) {
    fileInput.onchange = function(e) {
      console.log('File input changed', e.target.files);
      
      // Check if files exist
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        selectedFile = file;
        
        // Clear old previews
        clearModalContent();
        
        // Create new file info
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = `
          <i class="fas fa-check-circle" style="color: var(--success);"></i>
          <span>Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB) - will upload to Cloudinary</span>
        `;
        
        if (selectFileBtn) {
          selectFileBtn.parentNode.insertBefore(fileInfo, selectFileBtn.nextSibling);
        }
        
        // Show preview for images
        if (contentType && contentType.value === 'image' && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = function(readerEvent) {
            const preview = document.createElement('img');
            preview.src = readerEvent.target.result;
            preview.className = 'preview-image';
            if (fileInfo.nextSibling) {
              fileInfo.parentNode.insertBefore(preview, fileInfo.nextSibling);
            } else {
              fileInfo.parentNode.appendChild(preview);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    };
  }
  
  if (contentType) {
    contentType.onchange = () => {
        const isText = contentType.value === 'text';
        
        // Show/hide textarea
        if (contentText) {
            contentText.style.display = isText ? 'block' : 'none';
        }
        
        // Show/hide select file button
        if (selectFileBtn) {
            selectFileBtn.style.display = isText ? 'none' : 'inline-block';
        }
        
        // Clear file input and preview when switching types
        if (fileInput) fileInput.value = '';
        selectedFile = null;
        clearModalContent();
    };
  }
  
  if (saveContentBtn) saveContentBtn.onclick = saveContent;
  
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
  const modalTitle = document.querySelector('#uploadModal h3');
  if (modalTitle) modalTitle.textContent = 'Add Sheikh Content';
  if (contentTitle) contentTitle.value = '';
  if (contentText) contentText.value = '';
  if (contentType) contentType.value = 'text';
  
  // Clear all modal content
  if (fileInput) fileInput.value = '';
  selectedFile = null;
  clearModalContent();
  selectedContentId = null;
  
  // Set initial UI state
  if (contentText) contentText.style.display = 'block';
  if (selectFileBtn) selectFileBtn.style.display = 'none';
  
  if (uploadModal) uploadModal.classList.remove('hidden');
}

// ================= EDIT CONTENT =================
window.editContent = function(id) {
  const item = allContent.find(c => c.id === id);
  if (!item) return;
  
  const modalTitle = document.querySelector('#uploadModal h3');
  if (modalTitle) modalTitle.textContent = 'Edit Content';
  if (contentTitle) contentTitle.value = item.title || '';
  if (contentText) contentText.value = item.content || '';
  if (contentType) contentType.value = item.content_type;
  selectedContentId = id;
  
  // Clear any existing modal content first
  if (fileInput) fileInput.value = '';
  selectedFile = null;
  clearModalContent();
  
  const isText = item.content_type === 'text';
  
  // Set UI based on content type
  if (contentText) {
    contentText.style.display = isText ? 'block' : 'none';
  }
  
  if (selectFileBtn) {
    selectFileBtn.style.display = isText ? 'none' : 'inline-block';
  }
  
  if (!isText && item.media_url && selectFileBtn) {
    const source = isCloudinaryUrl(item.media_url) ? 'Cloudinary' : 'Supabase';
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.innerHTML = `
      <i class="fas fa-check-circle" style="color: var(--success);"></i>
      <span>Current file: ${item.media_url.split('/').pop()} (from ${source})</span>
    `;
    
    selectFileBtn.parentNode.insertBefore(fileInfo, selectFileBtn.nextSibling);
    
    if (item.content_type === 'image') {
      const preview = document.createElement('img');
      preview.src = item.media_url;
      preview.className = 'preview-image';
      preview.onerror = () => {
        preview.src = getFallbackImageUrl();
      };
      
      fileInfo.insertAdjacentElement('afterend', preview);
    }
  }
  
  if (uploadModal) uploadModal.classList.remove('hidden');
};

// ================= SAVE CONTENT =================
async function saveContent() {
  const title = contentTitle?.value.trim();
  if (!title) {
    showNotification('Please enter a title', 'error');
    return;
  }

  const type = contentType?.value;
  let mediaUrl = null;
  let content = null;

  if (saveContentBtn) {
    saveContentBtn.disabled = true;
    saveContentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  }

  try {
    if (type !== 'text') {
      if (selectedFile) {
        mediaUrl = await uploadFileToCloudinary(selectedFile, type);
      } else if (selectedContentId) {
        const existing = allContent.find(c => c.id === selectedContentId);
        mediaUrl = existing?.media_url;
      } else {
        showNotification('Please select a file', 'error');
        if (saveContentBtn) {
          saveContentBtn.disabled = false;
          saveContentBtn.innerHTML = 'Save';
        }
        return;
      }
    } else {
      content = contentText?.value.trim();
      if (!content) {
        showNotification('Please enter content', 'error');
        if (saveContentBtn) {
          saveContentBtn.disabled = false;
          saveContentBtn.innerHTML = 'Save';
        }
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
      ({ error } = await supabase
        .from('sheikh_history')
        .update(contentData)
        .eq('id', selectedContentId));
    } else {
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
  } finally {
    if (saveContentBtn) {
      saveContentBtn.disabled = false;
      saveContentBtn.innerHTML = 'Save';
    }
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
    const item = allContent.find(c => c.id === selectedContentId);
    
    const { error } = await supabase
      .from('sheikh_history')
      .delete()
      .eq('id', selectedContentId);

    if (error) throw error;

    if (item?.media_url && isSupabaseUrl(item.media_url)) {
      try {
        const path = item.media_url.split('/').pop();
        await supabase.storage.from('sheikh-media').remove([`sheikh/${path}`]);
      } catch (storageErr) {
        console.log("Could not delete media file:", storageErr);
      }
    } else if (item?.media_url && isCloudinaryUrl(item.media_url)) {
      console.log("Cloudinary file would need server-side deletion:", item.media_url);
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
  
  // Clear all modal content
  if (fileInput) fileInput.value = '';
  selectedFile = null;
  clearModalContent();
  selectedContentId = null;
  
  // Reset UI
  if (contentText) contentText.style.display = 'block';
  if (selectFileBtn) selectFileBtn.style.display = 'none';
}