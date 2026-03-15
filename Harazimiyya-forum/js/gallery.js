// ============================================
// HARAZIMIYYA FORUM - GALLERY
// All members can upload images/videos
// Members can delete their own content
// Admins can delete any content
// Features: Smart scroll, Jump to bottom, Vertical mobile layout
// UPDATED: Fixed video fullscreen and download for Android
// ============================================

// ================= CLOUDINARY CONFIGURATION =================
const CLOUDINARY_CONFIG = {
    cloudName: 'df3koezfk',
    uploadPreset: 'community_upload',
    folder: 'community-app',
    subFolders: {
        image: 'Image',
        video: 'Video'
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

// ================= GET FALLBACK IMAGE =================
function getFallbackImageUrl() {
    return 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'300\' viewBox=\'0 0 400 300\'%3E%3Crect width=\'400\' height=\'300\' fill=\'%230b5e3b\'/%3E%3Ctext x=\'50\' y=\'150\' font-family=\'Arial\' font-size=\'20\' fill=\'%23ffffff\'%3EImage failed to load%3C/text%3E%3C/svg%3E';
}

// Global variables
let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let allMedia = [];
let selectedFile = null;
let viewedMedia = new Set();
let currentLightbox = null;
let failedImages = new Set();
let lightboxActive = false;

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
            
            mediaElement.style.backgroundColor = 'rgba(11, 94, 59, 0.1)';
            setTimeout(() => {
                mediaElement.style.backgroundColor = '';
            }, 2000);
        }
    } else {
        scrollToBottom();
    }
}

// ================= TRACK MEDIA VIEW =================
function markMediaAsViewed(mediaId) {
    if (!viewedMedia.has(mediaId)) {
        viewedMedia.add(mediaId);
        
        const mediaElement = document.querySelector(`.media-card[data-media-id="${mediaId}"]`);
        if (mediaElement) {
            mediaElement.classList.remove('unseen');
        }
        
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

// ================= CREATE LIGHTBOX WITH FULLSCREEN AND DOWNLOAD FIXED FOR ANDROID =================
function createLightbox(src, type, mediaId, title) {
    if (currentLightbox) {
        closeLightbox();
    }
    
    lightboxActive = true;
    
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox-modal';
    lightbox.setAttribute('data-media-id', mediaId);
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
        padding: 20px;
        box-sizing: border-box;
    `;
    
    // Get filename from URL or use title
    let filename = title || 'media';
    if (type === 'image') {
        filename += '.jpg';
    } else {
        filename += '.mp4';
    }
    
    if (type === 'image') {
        lightbox.innerHTML = `
            <div style="position: relative; max-width: 100%; max-height: 100%; display: flex; flex-direction: column; align-items: center;">
                <img src="${src}" style="max-width: 100%; max-height: 80vh; object-fit: contain; border-radius: 8px;" onerror="this.onerror=null; this.src='${getFallbackImageUrl()}';">
                <button style="position: absolute; top: 10px; right: 10px; background: white; border: none; width: 44px; height: 44px; border-radius: 50%; font-size: 24px; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 10001;">✕</button>
                <a href="${src}" download="${filename}" style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: #0b5e3b; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; text-decoration: none; margin-top: 20px;">
                    <i class="fas fa-download"></i> Download Image
                </a>
            </div>
        `;
    } else {
        lightbox.innerHTML = `
            <div style="position: relative; max-width: 100%; max-height: 100%; display: flex; flex-direction: column; align-items: center;">
                <video 
                    src="${src}" 
                    controls 
                    autoplay 
                    playsinline
                    webkit-playsinline
                    x5-playsinline
                    x5-video-player-type="h5"
                    x5-video-player-fullscreen="true"
                    x5-video-orientation="portrait"
                    style="max-width: 100%; max-height: 70vh; border-radius: 8px; background: #000; width: 100%;"
                    preload="auto"
                    controlsList="nodownload"
                >
                    Your browser does not support the video tag.
                </video>
                <button style="position: absolute; top: 10px; right: 10px; background: white; border: none; width: 44px; height: 44px; border-radius: 50%; font-size: 24px; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 10001;">✕</button>
                <div style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center;">
                    <button onclick="this.nextElementSibling.requestFullscreen()" style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: #0b5e3b; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">
                        <i class="fas fa-expand"></i> Fullscreen
                    </button>
                    <a href="${src}" download="${filename}" style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: #0b5e3b; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; text-decoration: none;">
                        <i class="fas fa-download"></i> Download Video
                    </a>
                </div>
            </div>
        `;
    }
    
    document.body.appendChild(lightbox);
    currentLightbox = lightbox;
    
    if (mediaId) {
        markMediaAsViewed(mediaId);
    }
    
    // Close button handler
    const closeBtn = lightbox.querySelector('button');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeLightbox();
        };
    }
    
    // Click background to close
    lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
    
    // Handle Android back button
    history.pushState({ lightbox: true }, '');
    
    const handlePopState = (e) => {
        if (lightboxActive && currentLightbox) {
            e.preventDefault();
            closeLightbox();
        }
    };
    
    window.addEventListener('popstate', handlePopState);
    lightbox._popStateHandler = handlePopState;
}

// ================= CLOSE LIGHTBOX =================
function closeLightbox() {
    if (currentLightbox) {
        if (currentLightbox._popStateHandler) {
            window.removeEventListener('popstate', currentLightbox._popStateHandler);
        }
        
        currentLightbox.remove();
        currentLightbox = null;
        lightboxActive = false;
        
        if (history.state && history.state.lightbox) {
            history.back();
        }
    }
}

// ================= HANDLE IMAGE ERROR =================
function handleImageError(mediaId) {
    failedImages.add(mediaId);
    
    const mediaCard = document.querySelector(`.media-card[data-media-id="${mediaId}"]`);
    if (mediaCard) {
        const img = mediaCard.querySelector('img.media-preview');
        if (img) {
            img.src = getFallbackImageUrl();
            img.classList.add('failed-image');
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
    
    window.addEventListener('popstate', (e) => {
        if (lightboxActive && currentLightbox) {
            e.preventDefault();
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
        if (userNameEl) {
            userNameEl.textContent = profile.full_name || 'Member';
        }

        if (addMediaBtn) {
            addMediaBtn.classList.remove("hidden");
        }

        await loadGallery();

    } catch (err) {
        console.error("Initialization error:", err);
    }
}

// ================= LOAD GALLERY =================
async function loadGallery() {
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
            .order("created_at", { ascending: true });

        if (error) throw error;

        allMedia = data || [];
        displayGallery(allMedia);
        
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
    
    // Check if URL is from Cloudinary
    const isCloudinary = isCloudinaryUrl(item.media_url);
    const cloudBadge = isCloudinary ? '<span><i class="fas fa-cloud"></i> Cloud</span>' : '';
    
    card.innerHTML = `
        <span class="media-badge">${item.media_type}</span>
        ${item.media_type === 'image' 
            ? `<img src="${item.media_url}" alt="${item.title}" class="media-preview" onclick="viewMedia('${item.id}', '${item.media_url}', 'image', '${item.title}')" loading="lazy" onerror="handleImageError('${item.id}')">`
            : `<video 
                src="${item.media_url}" 
                class="media-preview" 
                onclick="viewMedia('${item.id}', '${item.media_url}', 'video', '${item.title}')" 
                controls
                playsinline
                webkit-playsinline
                x5-playsinline
                x5-video-player-type="h5"
                x5-video-player-fullscreen="true"
                preload="metadata"
                style="cursor: pointer; background: #000; width: 100%; height: 200px; object-fit: cover;">
                Your browser does not support the video tag.
            </video>`
        }
        <div class="media-info">
            <h4>${item.title}</h4>
            <div class="media-meta">
                <span><i class="fas fa-calendar"></i> ${date}</span>
                <span><i class="fas fa-eye"></i> ${item.views || 0}</span>
                ${isCloudinary ? '<span><i class="fas fa-cloud"></i> Cloud</span>' : ''}
            </div>
            <div class="media-uploader">
                <i class="fas fa-user"></i>
                <span>Uploaded by: <strong>${uploaderName}</strong></span>
            </div>
            <div class="media-actions">
                ${canDelete ? `
                    <button class="media-btn delete-btn" onclick="openDeleteModal('${item.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
                <a href="${item.media_url}" download="${item.title}.${item.media_type === 'video' ? 'mp4' : 'jpg'}" class="media-btn download-btn" title="Download" style="background: rgba(11,94,59,0.1); color: var(--primary); text-decoration: none; display: inline-flex; align-items: center; justify-content: center;">
                    <i class="fas fa-download"></i>
                </a>
            </div>
        </div>
    `;
    
    return card;
}

// ================= VIEW MEDIA =================
window.viewMedia = function(id, url, type, title) {
    createLightbox(url, type, id, title);
    
    markMediaAsViewed(id);
    
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

// Make handleImageError available globally
window.handleImageError = handleImageError;

// ================= UPLOAD FILE TO CLOUDINARY =================
async function uploadFileToCloudinary(file, type) {
    try {
        if (!file) throw new Error("No file to upload");
        
        console.log("📤 Uploading to Cloudinary:", file.name, file.type);
        
        let folder = CLOUDINARY_CONFIG.folder;
        if (type === 'image') {
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

// ================= SETUP EVENT LISTENERS =================
function setupEventListeners() {
    addMediaBtn.onclick = openAddModal;
    closeGalleryModalBtn.onclick = closeModal;
    saveMediaBtn.onclick = saveMedia;
    
    mediaFile.onchange = (e) => {
        selectedFile = e.target.files[0];
        if (selectedFile) {
            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';
            fileInfo.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span>Selected: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(2)} KB) - will upload to Cloudinary</span>
            `;
            
            const existingInfo = document.querySelector('.file-info');
            if (existingInfo) existingInfo.remove();
            
            mediaFile.parentNode.insertBefore(fileInfo, mediaFile.nextSibling);
            
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
    
    mediaType.onchange = () => {
        mediaFile.value = '';
        selectedFile = null;
        
        const fileInfo = document.querySelector('.file-info');
        if (fileInfo) fileInfo.remove();
        
        const preview = document.querySelector('.preview-image');
        if (preview) preview.remove();
    };
    
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

    if (selectedFile.size > 50 * 1024 * 1024) {
        showNotification('File too large. Maximum size is 50MB.', 'error');
        return;
    }

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
        const fileUrl = await uploadFileToCloudinary(selectedFile, type);
        
        const { error: dbError } = await supabase
            .from('gallery')
            .insert([{
                title,
                media_type: type,
                media_url: fileUrl,
                uploaded_by: currentUser.id,
                uploader_name: currentProfile?.full_name || 'Member'
            }]);
        
        if (dbError) throw dbError;
        
        closeModal();
        showNotification('Media uploaded to Cloudinary successfully');
        await loadGallery();
        
    } catch (err) {
        console.error("Error uploading media:", err);
        showNotification('Error: ' + err.message, 'error');
    } finally {
        saveMediaBtn.disabled = false;
        saveMediaBtn.innerHTML = '<i class="fas fa-save"></i> Save';
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
        const media = allMedia.find(m => m.id === selectedMediaId);
        
        const { error } = await supabase
            .from('gallery')
            .delete()
            .eq('id', selectedMediaId);

        if (error) throw error;

        if (media?.media_url && isCloudinaryUrl(media.media_url)) {
            console.log("Cloudinary file would need server-side deletion:", media.media_url);
            showNotification('Media deleted from gallery.', 'info');
        } else {
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
        showNotification('Media deleted successfully');
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