// ============================================
// HARAZIMIYYA FORUM - GALLERY
// All members can upload images/videos
// Members can delete their own content
// Admins can delete any content
// Features: Smart scroll, Jump to bottom, Vertical mobile layout
// ============================================

// Global variables
let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let allMedia = [];
let selectedFile = null;
let viewedMedia = new Set(); // Track which media user has viewed
let currentLightbox = null; // Track current lightbox for back button

// Smart scroll variables
let showJumpToBottom = false;
let firstUnseenMediaId = null;
let hasUnseenMedia = false;

// DOM Elements
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const openSidebar = document.getElementById("openSidebar");
const closeSidebar = document.getElementById("closeSidebar");
const logoutBtn = document.getElementById("logoutBtn");
const addMediaBtn = document.getElementById("addMediaBtn");
const galleryGrid = document.getElementById("galleryGrid");
const galleryModal = document.getElementById("galleryModal");
const closeGalleryModalBtn = document.getElementById("closeGalleryModalBtn");
const saveMediaBtn = document.getElementById("saveMediaBtn");
const mediaType = document.getElementById("mediaType");
const mediaTitle = document.getElementById("mediaTitle");
const mediaFile = document.getElementById("mediaFile");

// Delete modal (will be created dynamically)
let deleteModal = null;
let selectedMediaId = null;

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
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// ================= JUMP TO BOTTOM BUTTON FUNCTIONS =================
function createJumpToBottomButton() {
    // Remove existing button if any
    const existingBtn = document.getElementById('jumpToBottomBtn');
    if (existingBtn) existingBtn.remove();
    
    const button = document.createElement('button');
    button.id = 'jumpToBottomBtn';
    button.className = 'jump-to-bottom-btn';
    button.innerHTML = '<i class="fas fa-arrow-down"></i>';
    button.title = 'Jump to latest media';
    
    button.addEventListener('click', () => {
        scrollToBottom();
        button.style.display = 'none';
        showJumpToBottom = false;
    });
    
    document.body.appendChild(button);
}

function scrollToBottom() {
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
    });
}

function setupScrollListener() {
    window.addEventListener('scroll', () => {
        const scrollPosition = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        // Check if near bottom (within 100px)
        const isNearBottom = scrollPosition + windowHeight >= documentHeight - 100;
        const jumpBtn = document.getElementById('jumpToBottomBtn');
        
        if (jumpBtn) {
            if (!isNearBottom && scrollPosition > 200) {
                jumpBtn.style.display = 'flex';
                showJumpToBottom = true;
            } else {
                jumpBtn.style.display = 'none';
                showJumpToBottom = false;
            }
        }
    });
}

// ================= SMART SCROLL FUNCTIONS =================
function findFirstUnseenMedia() {
    const mediaCards = document.querySelectorAll('.media-card');
    firstUnseenMediaId = null;
    hasUnseenMedia = false;
    
    for (let card of mediaCards) {
        const mediaId = card.dataset.mediaId;
        // Check if this media hasn't been viewed
        if (!viewedMedia.has(mediaId)) {
            firstUnseenMediaId = mediaId;
            hasUnseenMedia = true;
            card.classList.add('unseen');
            break;
        }
    }
    
    return firstUnseenMediaId;
}

function scrollToFirstUnseen() {
    if (firstUnseenMediaId) {
        const mediaElement = document.querySelector(`.media-card[data-media-id="${firstUnseenMediaId}"]`);
        if (mediaElement) {
            mediaElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Highlight the media briefly
            mediaElement.style.backgroundColor = 'rgba(11, 94, 59, 0.1)';
            setTimeout(() => {
                mediaElement.style.backgroundColor = '';
            }, 2000);
        }
    } else {
        // If no unseen media, scroll to bottom (latest)
        scrollToBottom();
    }
}

// ================= TRACK MEDIA VIEW =================
function markMediaAsViewed(mediaId) {
    if (!viewedMedia.has(mediaId)) {
        viewedMedia.add(mediaId);
        
        // Remove unseen class if present
        const mediaElement = document.querySelector(`.media-card[data-media-id="${mediaId}"]`);
        if (mediaElement) {
            mediaElement.classList.remove('unseen');
        }
        
        // Store in localStorage to persist across sessions
        try {
            const viewed = JSON.parse(localStorage.getItem('viewedGalleryMedia') || '[]');
            if (!viewed.includes(mediaId)) {
                viewed.push(mediaId);
                localStorage.setItem('viewedGalleryMedia', JSON.stringify(viewed));
            }
        } catch (e) {
            console.log("Could not save to localStorage", e);
        }
    }
}

// ================= LOAD VIEWED MEDIA FROM STORAGE =================
function loadViewedMedia() {
    try {
        const viewed = JSON.parse(localStorage.getItem('viewedGalleryMedia') || '[]');
        viewed.forEach(id => viewedMedia.add(id));
    } catch (e) {
        console.log("Could not load from localStorage", e);
    }
}

// ================= CREATE DELETE MODAL =================
function createDeleteModal() {
    const deleteModalHTML = `
        <div id="deleteModal" class="modal hidden">
            <div class="modal-content delete-modal">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px;"></i>
                <h3>Delete Media?</h3>
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
        selectedMediaId = null;
    };
    
    document.getElementById('confirmDeleteBtn').onclick = confirmDelete;
}

// ================= CREATE LIGHTBOX WITH HISTORY API =================
function createLightbox(src, type, mediaId) {
    // If there's already a lightbox, remove it
    if (currentLightbox) {
        currentLightbox.remove();
    }
    
    // Add a new history state for the lightbox
    history.pushState({ lightbox: true, mediaId: mediaId }, '', window.location.href);
    
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox-modal';
    lightbox.setAttribute('data-media-id', mediaId);
    
    if (type === 'image') {
        lightbox.innerHTML = `
            <div class="lightbox-content">
                <img src="${src}" alt="Gallery image">
                <button class="lightbox-close">&times;</button>
            </div>
        `;
    } else {
        lightbox.innerHTML = `
            <div class="lightbox-content">
                <video src="${src}" controls autoplay></video>
                <button class="lightbox-close">&times;</button>
            </div>
        `;
    }
    
    document.body.appendChild(lightbox);
    currentLightbox = lightbox;
    
    // Mark as viewed when opened in lightbox
    if (mediaId) {
        markMediaAsViewed(mediaId);
    }
    
    // Close button handler
    lightbox.querySelector('.lightbox-close').onclick = () => {
        closeLightbox();
    };
    
    // Click outside to close
    lightbox.onclick = (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    };
    
    // Handle Android back button
    const handlePopState = (e) => {
        if (currentLightbox) {
            e.preventDefault();
            closeLightbox();
            // Remove this event listener after handling
            window.removeEventListener('popstate', handlePopState);
        }
    };
    
    window.addEventListener('popstate', handlePopState);
}

// ================= CLOSE LIGHTBOX =================
function closeLightbox() {
    if (currentLightbox) {
        currentLightbox.remove();
        currentLightbox = null;
        // Go back in history to remove the lightbox state
        if (history.state && history.state.lightbox) {
            history.back();
        }
    }
}

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", async () => {
    await init();
    createDeleteModal();
    createJumpToBottomButton();
    setupScrollListener();
    setupEventListeners();
    loadViewedMedia();
    
    // Handle initial page load and back button
    window.addEventListener('popstate', (e) => {
        // If there's a lightbox open when back is pressed, close it
        if (currentLightbox) {
            closeLightbox();
        }
    });
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

        // Show add button for all authenticated users
        if (addMediaBtn) {
            addMediaBtn.classList.remove("hidden");
        }

        // Load gallery
        await loadGallery();

    } catch (err) {
        console.error("Initialization error:", err);
    }
}

// ================= LOAD GALLERY =================
async function loadGallery() {
    // Show loading spinner
    galleryGrid.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i> Loading gallery...
        </div>
    `;

    try {
        const { data, error } = await supabase
            .from("gallery")
            .select(`
                *,
                uploader:profiles!uploaded_by(full_name, email, role)
            `)
            .order("created_at", { ascending: true }); // Oldest first for proper scrolling

        if (error) throw error;

        allMedia = data || [];
        displayGallery(allMedia);
        
        // Smart scroll after gallery loads
        setTimeout(() => {
            findFirstUnseenMedia();
            if (firstUnseenMediaId) {
                scrollToFirstUnseen();
            } else {
                scrollToBottom();
            }
        }, 500);

    } catch (err) {
        console.error("Error loading gallery:", err);
        galleryGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error Loading Gallery</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

// ================= DISPLAY GALLERY =================
function displayGallery(media) {
    galleryGrid.innerHTML = "";

    if (!media || media.length === 0) {
        galleryGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-images"></i>
                <h3>No Media Yet</h3>
                <p>Be the first to share an image or video from our programs!</p>
            </div>
        `;
        return;
    }

    media.forEach(item => {
        const card = createMediaCard(item);
        galleryGrid.appendChild(card);
    });
}

// ================= CREATE MEDIA CARD =================
function createMediaCard(item) {
    const card = document.createElement("div");
    card.className = `media-card ${item.media_type}`;
    card.dataset.mediaId = item.id;
    
    // Add unseen class if not viewed
    if (!viewedMedia.has(item.id)) {
        card.classList.add('unseen');
    }
    
    const date = new Date(item.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    
    const uploaderName = item.uploader?.full_name || 'Unknown';
    const canDelete = isAdmin || item.uploaded_by === currentUser.id;
    
    card.innerHTML = `
        <span class="media-badge">${item.media_type}</span>
        ${item.media_type === 'image' 
            ? `<img src="${item.media_url}" alt="${item.title}" class="media-preview" onclick="viewMedia('${item.id}', '${item.media_url}', 'image')">`
            : `<video src="${item.media_url}" class="media-preview" onclick="viewMedia('${item.id}', '${item.media_url}', 'video')"></video>`
        }
        <div class="media-info">
            <h4>${item.title}</h4>
            <div class="media-meta">
                <span><i class="fas fa-calendar"></i> ${date}</span>
                <span><i class="fas fa-eye"></i> ${item.views || 0}</span>
            </div>
            <div class="media-uploader">
                <i class="fas fa-user"></i>
                <span>Uploaded by: <strong>${uploaderName}</strong></span>
            </div>
            ${canDelete ? `
                <div class="media-actions">
                    <button class="media-btn delete-btn" onclick="openDeleteModal('${item.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : ''}
        </div>
    `;
    
    return card;
}

// ================= VIEW MEDIA =================
window.viewMedia = function(id, url, type) {
    createLightbox(url, type, id);
    
    // Mark as viewed
    markMediaAsViewed(id);
    
    // Increment view count
    const media = allMedia.find(m => m.id === id);
    if (media) {
        supabase
            .from('gallery')
            .update({ views: (media.views || 0) + 1 })
            .eq('id', media.id)
            .then(({ error }) => {
                if (error) console.error("Error updating views:", error);
            });
    }
};

// ================= SETUP EVENT LISTENERS =================
function setupEventListeners() {
    // Add media button
    addMediaBtn.onclick = openAddModal;
    
    // Close modal button
    closeGalleryModalBtn.onclick = closeModal;
    
    // Save media button
    saveMediaBtn.onclick = saveMedia;
    
    // File input change
    mediaFile.onchange = (e) => {
        selectedFile = e.target.files[0];
        if (selectedFile) {
            // Show file info
            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';
            fileInfo.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span>Selected: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(2)} KB)</span>
            `;
            
            // Remove existing file info
            const existingInfo = document.querySelector('.file-info');
            if (existingInfo) existingInfo.remove();
            
            mediaFile.parentNode.insertBefore(fileInfo, mediaFile.nextSibling);
            
            // Show preview for images
            if (mediaType.value === 'image' && selectedFile.type.startsWith('image/')) {
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
    
    // Media type change
    mediaType.onchange = () => {
        // Clear file input and preview
        mediaFile.value = '';
        selectedFile = null;
        
        const fileInfo = document.querySelector('.file-info');
        if (fileInfo) fileInfo.remove();
        
        const preview = document.querySelector('.preview-image');
        if (preview) preview.remove();
    };
    
    // Logout
    logoutBtn.onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = "../index.html";
    };
}

// ================= OPEN ADD MODAL =================
function openAddModal() {
    mediaTitle.value = '';
    mediaType.value = 'image';
    mediaFile.value = '';
    selectedFile = null;
    
    // Clear file info and preview
    const fileInfo = document.querySelector('.file-info');
    if (fileInfo) fileInfo.remove();
    
    const preview = document.querySelector('.preview-image');
    if (preview) preview.remove();
    
    galleryModal.classList.remove('hidden');
}

// ================= SAVE MEDIA =================
async function saveMedia() {
    const title = mediaTitle.value.trim();
    if (!title) {
        showNotification('Please enter a title', 'error');
        return;
    }

    if (!selectedFile) {
        showNotification('Please select a file', 'error');
        return;
    }

    // Validate file size (50MB max)
    if (selectedFile.size > 50 * 1024 * 1024) {
        showNotification('File too large. Maximum size is 50MB.', 'error');
        return;
    }

    // Validate file type
    const type = mediaType.value;
    if (type === 'image' && !selectedFile.type.startsWith('image/')) {
        showNotification('Please select a valid image file', 'error');
        return;
    }
    if (type === 'video' && !selectedFile.type.startsWith('video/')) {
        showNotification('Please select a valid video file', 'error');
        return;
    }

    saveMediaBtn.disabled = true;
    saveMediaBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    try {
        // Upload file to storage
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${currentUser.id}/${Date.now()}_${selectedFile.name}`;
        
        const { error: uploadError } = await supabase.storage
            .from('gallery-media')
            .upload(fileName, selectedFile);
        
        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('gallery-media')
            .getPublicUrl(fileName);
        
        // Save to database
        const { error: dbError } = await supabase
            .from('gallery')
            .insert([{
                title,
                media_type: type,
                media_url: publicUrl,
                uploaded_by: currentUser.id,
                uploader_name: currentProfile.full_name
            }]);
        
        if (dbError) throw dbError;
        
        closeModal();
        showNotification('Media uploaded successfully');
        await loadGallery();
        
    } catch (err) {
        console.error("Error uploading media:", err);
        showNotification('Error: ' + err.message, 'error');
    } finally {
        saveMediaBtn.disabled = false;
        saveMediaBtn.innerHTML = 'Save';
    }
}

// ================= OPEN DELETE MODAL =================
window.openDeleteModal = function(id) {
    selectedMediaId = id;
    deleteModal.classList.remove('hidden');
};

// ================= CONFIRM DELETE =================
async function confirmDelete() {
    if (!selectedMediaId) return;

    try {
        // Get media info to delete file
        const media = allMedia.find(m => m.id === selectedMediaId);
        
        // Delete from database
        const { error } = await supabase
            .from('gallery')
            .delete()
            .eq('id', selectedMediaId);

        if (error) throw error;

        // Try to delete file from storage
        if (media?.media_url) {
            try {
                const fileName = media.media_url.split('/').pop();
                const filePath = `${media.uploaded_by}/${fileName}`;
                await supabase.storage
                    .from('gallery-media')
                    .remove([filePath]);
            } catch (storageErr) {
                console.log("Could not delete file:", storageErr);
            }
        }

        deleteModal.classList.add('hidden');
        showNotification('Media deleted');
        await loadGallery();

    } catch (err) {
        console.error("Error deleting media:", err);
        showNotification('Error deleting media', 'error');
    }
}

// ================= CLOSE MODAL =================
function closeModal() {
    galleryModal.classList.add('hidden');
    mediaTitle.value = '';
    mediaType.value = 'image';
    mediaFile.value = '';
    selectedFile = null;
    
    const fileInfo = document.querySelector('.file-info');
    if (fileInfo) fileInfo.remove();
    
    const preview = document.querySelector('.preview-image');
    if (preview) preview.remove();
}