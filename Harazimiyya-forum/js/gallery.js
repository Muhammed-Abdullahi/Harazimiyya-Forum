// ============================================
// HARAZIMIYYA FORUM - GALLERY
// Features: Right-click (desktop) or Long-press (mobile) menu
// Menu: Love, Like, Download, Delete (owners/admins only)
// TikTok-style video controls with seek bar
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
let currentTheme = 'dark'; // Default theme

// Reaction tracking
let mediaReactions = new Map(); // Store reactions for each media

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

// TikTok Modal Elements
let tiktokModal, tiktokTypeImage, tiktokTypeVideo, tiktokMediaTitle, tiktokMediaFile;
let tiktokDropZone, tiktokPreviewArea, tiktokProgress, tiktokSaveBtn, tiktokCancelBtn;
let tiktokCloseBtn, tiktokBrowseBtn, tiktokFileHint;

// Delete modal (will be created dynamically)
let deleteModal = null;
let selectedMediaId = null;

// Context menu
let contextMenu = null;
let contextMenuTarget = null;
let contextMenuMediaId = null;
let longPressTimer = null;

// Theme dropdown
let themeDropdown = null;

// ================= THEME CONFIGURATION =================
const themes = {
    dark: {
        name: 'Dark',
        bg: '#000000',
        surface: '#1a1a1a',
        text: '#ffffff',
        primary: '#0b5e3b',
        headerBg: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 100%)'
    },
    nature: {
        name: 'Nature',
        bg: '#0a2f1f',
        surface: '#1a3a2a',
        text: '#e8f5e9',
        primary: '#4caf50',
        headerBg: 'linear-gradient(180deg, rgba(10,47,31,0.9) 0%, rgba(10,47,31,0.7) 100%)'
    }
};

// ================= CREATE THEME DROPDOWN =================
function createThemeDropdown() {
    const dropdown = document.createElement('div');
    dropdown.className = 'theme-dropdown hidden';
    dropdown.id = 'themeDropdown';
    
    Object.keys(themes).forEach(themeKey => {
        const theme = themes[themeKey];
        const themeBtn = document.createElement('button');
        themeBtn.className = `theme-option ${currentTheme === themeKey ? 'active' : ''}`;
        themeBtn.innerHTML = `
            <span class="theme-color" style="background: ${theme.primary}"></span>
            <span>${theme.name}</span>
            ${currentTheme === themeKey ? '<i class="fas fa-check"></i>' : ''}
        `;
        themeBtn.onclick = () => applyTheme(themeKey);
        dropdown.appendChild(themeBtn);
    });
    
    document.body.appendChild(dropdown);
    return dropdown;
}

// ================= APPLY THEME =================
function applyTheme(themeKey) {
    currentTheme = themeKey;
    const theme = themes[themeKey];
    
    // Apply theme to root
    document.documentElement.style.setProperty('--bg', theme.bg);
    document.documentElement.style.setProperty('--text-main', theme.text);
    document.documentElement.style.setProperty('--primary', theme.primary);
    
    // Update body background
    document.body.style.background = theme.bg;
    
    // Update header
    const topBar = document.querySelector('.top-bar');
    if (topBar) {
        topBar.style.background = theme.headerBg;
    }
    
    // Update active state in dropdown
    const dropdown = document.getElementById('themeDropdown');
    if (dropdown) {
        const options = dropdown.querySelectorAll('.theme-option');
        options.forEach(opt => {
            const isActive = opt.querySelector('span:last-child').textContent === theme.name;
            if (isActive) {
                opt.classList.add('active');
                if (!opt.querySelector('.fa-check')) {
                    opt.innerHTML += '<i class="fas fa-check"></i>';
                }
            } else {
                opt.classList.remove('active');
                const check = opt.querySelector('.fa-check');
                if (check) check.remove();
            }
        });
    }
    
    // Save theme preference
    localStorage.setItem('selectedTheme', themeKey);
    
    showNotification(`Theme changed to ${theme.name}`, 'success');
}

// ================= TOGGLE THEME DROPDOWN =================
function toggleThemeDropdown(event) {
    event.stopPropagation();
    
    if (!themeDropdown) {
        themeDropdown = createThemeDropdown();
    }
    
    const btnPos = event.target.getBoundingClientRect();
    
    themeDropdown.style.top = (btnPos.bottom + 8) + 'px';
    themeDropdown.style.right = (window.innerWidth - btnPos.right) + 'px';
    
    themeDropdown.classList.toggle('hidden');
    
    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeThemeDropdown);
    }, 100);
}

function closeThemeDropdown(e) {
    if (themeDropdown && !themeDropdown.contains(e.target) && !e.target.closest('#themeBtn')) {
        themeDropdown.classList.add('hidden');
        document.removeEventListener('click', closeThemeDropdown);
    }
}

// ================= SIDEBAR TOGGLE =================
openSidebar.onclick = () => {
    sidebar.classList.add("active");
    overlay.classList.add("active");
    // Add to history for back button handling
    history.pushState({ sidebar: true }, '');
};

closeSidebar.onclick = () => {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
    // Don't call history.back() here - just close
};

// FIXED: Overlay click should ONLY close sidebar, not navigate
overlay.onclick = () => {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
    // REMOVED: if (history.state && history.state.sidebar) { history.back(); }
    // Just close the sidebar, don't navigate
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
    galleryGrid.scrollTo({
        top: galleryGrid.scrollHeight,
        behavior: 'smooth'
    });
}

function setupScrollListener() {
    galleryGrid.addEventListener('scroll', () => {
        const scrollPosition = galleryGrid.scrollTop;
        const scrollHeight = galleryGrid.scrollHeight;
        const clientHeight = galleryGrid.clientHeight;
        
        const isNearBottom = scrollPosition + clientHeight >= scrollHeight - 100;
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

// ================= LOAD REACTIONS FROM STORAGE =================
function loadReactions() {
    try {
        const saved = localStorage.getItem('mediaReactions');
        if (saved) {
            const parsed = JSON.parse(saved);
            mediaReactions = new Map(Object.entries(parsed));
        }
    } catch (e) {
        console.log("Could not load reactions", e);
    }
}

// ================= SAVE REACTIONS TO STORAGE =================
function saveReactions() {
    try {
        const obj = Object.fromEntries(mediaReactions);
        localStorage.setItem('mediaReactions', JSON.stringify(obj));
    } catch (e) {
        console.log("Could not save reactions", e);
    }
}

// ================= ADD REACTION =================
function addReaction(mediaId, reactionType) {
    if (!mediaReactions.has(mediaId)) {
        mediaReactions.set(mediaId, { love: 0, like: 0, userReacted: null });
    }
    
    const reactions = mediaReactions.get(mediaId);
    
    // Check if user already reacted
    if (reactions.userReacted === reactionType) {
        // Remove reaction (toggle off)
        reactions[reactionType] = Math.max(0, (reactions[reactionType] || 0) - 1);
        reactions.userReacted = null;
        showNotification(`${reactionType} removed`, 'info');
    } else {
        // If user had different reaction, remove that first
        if (reactions.userReacted) {
            reactions[reactions.userReacted] = Math.max(0, (reactions[reactions.userReacted] || 0) - 1);
        }
        
        // Add new reaction
        reactions[reactionType] = (reactions[reactionType] || 0) + 1;
        reactions.userReacted = reactionType;
        showNotification(`Added ${reactionType}`, 'success');
    }
    
    saveReactions();
    updateMediaReactions(mediaId);
}

// ================= UPDATE MEDIA REACTIONS DISPLAY =================
function updateMediaReactions(mediaId) {
    const mediaCard = document.querySelector(`.media-card[data-media-id="${mediaId}"]`);
    if (!mediaCard) return;
    
    const existingReactions = mediaCard.querySelector('.media-reactions');
    if (existingReactions) existingReactions.remove();
    
    const reactions = mediaReactions.get(mediaId);
    if (!reactions) return;
    
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'media-reactions';
    
    if (reactions.love > 0) {
        const loveDiv = document.createElement('div');
        loveDiv.className = 'reaction-icon love';
        loveDiv.innerHTML = '❤️';
        if (reactions.love > 1) {
            const count = document.createElement('span');
            count.className = 'reaction-count';
            count.textContent = reactions.love;
            loveDiv.appendChild(count);
        }
        reactionsDiv.appendChild(loveDiv);
    }
    
    if (reactions.like > 0) {
        const likeDiv = document.createElement('div');
        likeDiv.className = 'reaction-icon like';
        likeDiv.innerHTML = '👍';
        if (reactions.like > 1) {
            const count = document.createElement('span');
            count.className = 'reaction-count';
            count.textContent = reactions.like;
            likeDiv.appendChild(count);
        }
        reactionsDiv.appendChild(likeDiv);
    }
    
    if (reactions.love > 0 || reactions.like > 0) {
        mediaCard.appendChild(reactionsDiv);
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
        // Go back in history if modal was opened
        if (history.state && history.state.modal) {
            history.back();
        }
    };
    
    document.getElementById('confirmDeleteBtn').onclick = confirmDelete;
}

// ================= DOWNLOAD MEDIA =================
async function downloadMedia(url, filename) {
    try {
        showNotification('Downloading...', 'info');
        
        // Fetch the file
        const response = await fetch(url);
        const blob = await response.blob();
        
        // Create download link
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename || 'media';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        window.URL.revokeObjectURL(downloadUrl);
        
        showNotification('Download complete!', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showNotification('Download failed', 'error');
    }
}

// ================= CREATE CONTEXT MENU =================
function createContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'longpress-menu hidden';
    menu.id = 'contextMenu';
    
    document.body.appendChild(menu);
    return menu;
}

// ================= SHOW CONTEXT MENU =================
function showContextMenu(event, mediaId) {
    event.preventDefault();
    event.stopPropagation();
    
    // Pause video if it's playing
    const video = event.target.closest('.media-card')?.querySelector('video');
    if (video && !video.paused) {
        video.pause();
    }
    
    // Add a class to block video clicks
    const mediaCard = event.target.closest('.media-card');
    if (mediaCard) {
        mediaCard.classList.add('menu-open');
    }
    
    if (contextMenu) {
        contextMenu.remove();
    }
    
    contextMenu = createContextMenu();
    contextMenuMediaId = mediaId;
    
    const media = allMedia.find(m => m.id === mediaId);
    const canDelete = isAdmin || (media && media.uploaded_by === currentUser?.id);
    
    // Get filename for download
    let filename = media?.title || 'media';
    filename += media?.media_type === 'image' ? '.jpg' : '.mp4';
    
    let menuItems = `
        <button class="longpress-menu-item love-item" onclick="handleReaction('${mediaId}', 'love')">
            <i class="fas fa-heart"></i>
            <span>Love</span>
        </button>
        <button class="longpress-menu-item like-item" onclick="handleReaction('${mediaId}', 'like')">
            <i class="fas fa-thumbs-up"></i>
            <span>Like</span>
        </button>
        <button class="longpress-menu-item download-item" onclick="handleDownload('${mediaId}', '${filename}')">
            <i class="fas fa-download"></i>
            <span>Download</span>
        </button>
    `;
    
    if (canDelete) {
        menuItems += `
            <button class="longpress-menu-item delete-item" onclick="openDeleteModal('${mediaId}')">
                <i class="fas fa-trash"></i>
                <span>Delete</span>
            </button>
        `;
    }
    
    contextMenu.innerHTML = menuItems;
    
    // Get coordinates
    let clientX, clientY;
    
    if (event.touches) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    
    // Position menu
    contextMenu.style.left = clientX + 'px';
    contextMenu.style.top = clientY + 'px';
    contextMenu.style.transform = 'translate(-50%, -50%)';
    
    // Adjust if menu goes off screen
    setTimeout(() => {
        const rect = contextMenu.getBoundingClientRect();
        
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = (window.innerWidth - rect.width - 10) + 'px';
            contextMenu.style.transform = 'none';
        }
        
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
            contextMenu.style.transform = 'none';
        }
        
        if (rect.left < 0) {
            contextMenu.style.left = '10px';
            contextMenu.style.transform = 'none';
        }
        
        if (rect.top < 0) {
            contextMenu.style.top = '10px';
            contextMenu.style.transform = 'none';
        }
    }, 10);
    
    contextMenu.classList.remove('hidden');
    
    // Hide menu when clicking anywhere outside
    setTimeout(() => {
        document.addEventListener('click', hideContextMenuOnce);
        document.addEventListener('touchstart', hideContextMenuOnce);
    }, 100);
}

function hideContextMenuOnce(e) {
    // Hide menu regardless of what was clicked
    hideContextMenu();
    document.removeEventListener('click', hideContextMenuOnce);
    document.removeEventListener('touchstart', hideContextMenuOnce);
}

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.classList.add('hidden');
        
        // Remove the menu-open class from all media cards
        document.querySelectorAll('.media-card').forEach(card => {
            card.classList.remove('menu-open');
        });
        
        setTimeout(() => {
            if (contextMenu) {
                contextMenu.remove();
                contextMenu = null;
            }
        }, 300);
    }
    contextMenuMediaId = null;
}

// ================= HANDLE REACTION =================
window.handleReaction = function(mediaId, type) {
    addReaction(mediaId, type);
    hideContextMenu();
};

// ================= HANDLE DOWNLOAD =================
window.handleDownload = function(mediaId, filename) {
    const media = allMedia.find(m => m.id === mediaId);
    if (media) {
        downloadMedia(media.media_url, filename);
    }
    hideContextMenu();
};

// ================= SETUP CONTEXT MENU =================
function setupContextMenu(element, mediaId) {
    let touchStart = 0;
    let touchStartX, touchStartY;
    let longPressTriggered = false;
    
    // Desktop: Right-click
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e, mediaId);
        return false;
    });
    
    // Mobile: Long press
    element.addEventListener('touchstart', (e) => {
        touchStart = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        longPressTriggered = false;
        
        longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            showContextMenu(e, mediaId);
        }, 500);
    });
    
    element.addEventListener('touchmove', (e) => {
        if (touchStartX && touchStartY) {
            const moveX = Math.abs(e.touches[0].clientX - touchStartX);
            const moveY = Math.abs(e.touches[0].clientY - touchStartY);
            
            if (moveX > 20 || moveY > 20) {
                clearTimeout(longPressTimer);
            }
        }
    });
    
    element.addEventListener('touchend', (e) => {
        clearTimeout(longPressTimer);
        
        // Don't do anything if it was a long press
        if (longPressTriggered) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        longPressTriggered = false;
    });
    
    element.addEventListener('touchcancel', () => {
        clearTimeout(longPressTimer);
        longPressTriggered = false;
    });
}

// ================= CREATE LIGHTBOX =================
function createLightbox(src, type, mediaId, title) {
    if (currentLightbox) {
        closeLightbox();
    }
    
    lightboxActive = true;
    
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox-modal';
    lightbox.setAttribute('data-media-id', mediaId);
    
    let filename = title || 'media';
    filename += type === 'image' ? '.jpg' : '.mp4';
    
    if (type === 'image') {
        lightbox.innerHTML = `
            <img src="${src}" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.onerror=null; this.src='${getFallbackImageUrl()}';">
            <button class="lightbox-close"><i class="fas fa-times"></i></button>
            <button class="lightbox-download" onclick="downloadMedia('${src}', '${filename}')">
                <i class="fas fa-download"></i> Download
            </button>
        `;
    } else {
        lightbox.innerHTML = `
            <video 
                src="${src}" 
                controls
                autoplay
                playsinline
                style="width: 100%; height: 100%; object-fit: contain;"
            ></video>
            <button class="lightbox-close"><i class="fas fa-times"></i></button>
            <button class="lightbox-download" onclick="downloadMedia('${src}', '${filename}')">
                <i class="fas fa-download"></i> Download
            </button>
        `;
    }
    
    document.body.appendChild(lightbox);
    currentLightbox = lightbox;
    
    if (mediaId) {
        markMediaAsViewed(mediaId);
    }
    
    // Add to history for back button
    history.pushState({ lightbox: true }, '');
    
    // Close button
    const closeBtn = lightbox.querySelector('.lightbox-close');
    if (closeBtn) {
        closeBtn.onclick = closeLightbox;
    }
    
    // Click background to close
    lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
}

// ================= CLOSE LIGHTBOX =================
function closeLightbox() {
    if (currentLightbox) {
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

// ================= CREATE MEDIA CARD WITH TIKTOK VIDEO CONTROLS =================
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
    const isCloudinary = isCloudinaryUrl(item.media_url);
    
    if (item.media_type === 'image') {
        card.innerHTML = `
            <span class="media-badge"><i class="fas fa-image"></i> Image</span>
            <img 
                src="${item.media_url}" 
                alt="${item.title}" 
                class="media-preview" 
                loading="lazy" 
                onerror="handleImageError('${item.id}')"
            >
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
            </div>
        `;
        
        // Setup context menu for image
        const img = card.querySelector('img');
        if (img) {
            setupContextMenu(img, item.id);
        }
    } else {
        card.innerHTML = `
            <span class="media-badge"><i class="fas fa-video"></i> Video</span>
            <div class="video-container" data-media-id="${item.id}">
                <video 
                    src="${item.media_url}" 
                    class="media-preview" 
                    playsinline
                    preload="metadata"
                    poster="${item.thumbnail_url || ''}"
                >
                    <source src="${item.media_url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                
                <!-- TikTok-style seek control -->
                <div class="seek-control">
                    <div class="seek-progress">
                        <div class="seek-progress-fill"></div>
                    </div>
                    <div class="seek-handle">
                        <i class="fas fa-circle"></i>
                    </div>
                    <div class="seek-time">0:00 / 0:00</div>
                </div>
                
                <!-- Play/Pause button -->
                <div class="play-pause-btn">
                    <i class="fas fa-play"></i>
                </div>
            </div>
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
            </div>
        `;
        
        // Setup context menu for video container
        const videoContainer = card.querySelector('.video-container');
        if (videoContainer) {
            setupContextMenu(videoContainer, item.id);
        }
        
        // Setup TikTok-style video controls after adding to DOM
        setTimeout(() => {
            setupTikTokVideoControls(card, item.id);
        }, 100);
    }
    
    return card;
}

// ================= SETUP TIKTOK-STYLE VIDEO CONTROLS =================
function setupTikTokVideoControls(card, mediaId) {
    const video = card.querySelector('video');
    const videoContainer = card.querySelector('.video-container');
    const seekControl = card.querySelector('.seek-control');
    const seekProgress = card.querySelector('.seek-progress-fill');
    const seekHandle = card.querySelector('.seek-handle');
    const seekTime = card.querySelector('.seek-time');
    const playPauseBtn = card.querySelector('.play-pause-btn');
    
    if (!video) return;
    
    let isSeeking = false;
    let hideControlsTimeout;
    let controlsVisible = false;
    
    // Format time helper
    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Update seek bar and time
    function updateSeekBar() {
        if (!isSeeking && video.duration) {
            const percent = (video.currentTime / video.duration) * 100;
            seekProgress.style.width = percent + '%';
            seekHandle.style.left = percent + '%';
            seekTime.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
        }
    }
    
    // Show controls temporarily
    function showControls() {
        seekControl.classList.add('visible');
        playPauseBtn.classList.add('visible');
        controlsVisible = true;
        
        clearTimeout(hideControlsTimeout);
        hideControlsTimeout = setTimeout(() => {
            if (!isSeeking) {
                seekControl.classList.remove('visible');
                playPauseBtn.classList.remove('visible');
                controlsVisible = false;
            }
        }, 3000);
    }
    
    // Handle play/pause - CHECK IF MENU IS OPEN
    function togglePlay() {
        // Don't play if menu is open
        if (card.classList.contains('menu-open')) {
            return;
        }
        
        if (video.paused) {
            video.play();
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            video.pause();
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
        showControls();
    }
    
    // Video event listeners
    video.addEventListener('timeupdate', updateSeekBar);
    
    video.addEventListener('loadedmetadata', () => {
        seekTime.textContent = `0:00 / ${formatTime(video.duration)}`;
    });
    
    video.addEventListener('play', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        showControls();
    });
    
    video.addEventListener('pause', () => {
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        showControls();
    });
    
    // Click on video to toggle play/pause - CHECK IF MENU IS OPEN
    videoContainer.addEventListener('click', (e) => {
        // Don't toggle if menu is open
        if (card.classList.contains('menu-open')) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        // Don't toggle if clicking on seek control
        if (e.target.closest('.seek-control')) return;
        if (e.target.closest('.seek-handle')) return;
        togglePlay();
    });
    
    // Seek control touch/mouse handling
    function handleSeekStart(e) {
        e.preventDefault();
        e.stopPropagation();
        isSeeking = true;
        seekControl.classList.add('seeking');
        
        // Pause video while seeking
        if (!video.paused) {
            video.pause();
        }
    }
    
    function handleSeekMove(e) {
        if (!isSeeking) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        // Get touch/mouse position
        let clientX;
        if (e.touches) {
            clientX = e.touches[0].clientX;
        } else {
            clientX = e.clientX;
        }
        
        const rect = seekControl.getBoundingClientRect();
        let percent = (clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        
        // Update UI
        seekProgress.style.width = (percent * 100) + '%';
        seekHandle.style.left = (percent * 100) + '%';
        
        // Update video time
        if (video.duration) {
            const newTime = percent * video.duration;
            video.currentTime = newTime;
            seekTime.textContent = `${formatTime(newTime)} / ${formatTime(video.duration)}`;
        }
    }
    
    function handleSeekEnd(e) {
        if (!isSeeking) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        isSeeking = false;
        seekControl.classList.remove('seeking');
        
        // Resume playback if it was playing before and menu is not open
        if (playPauseBtn.innerHTML.includes('pause') && !card.classList.contains('menu-open')) {
            video.play();
        }
        
        showControls();
    }
    
    // Add seek control event listeners
    seekControl.addEventListener('touchstart', handleSeekStart);
    seekControl.addEventListener('touchmove', handleSeekMove);
    seekControl.addEventListener('touchend', handleSeekEnd);
    seekControl.addEventListener('touchcancel', handleSeekEnd);
    
    seekControl.addEventListener('mousedown', handleSeekStart);
    window.addEventListener('mousemove', handleSeekMove);
    window.addEventListener('mouseup', handleSeekEnd);
    
    // Show controls on tap/click - CHECK IF MENU IS OPEN
    videoContainer.addEventListener('touchstart', (e) => {
        if (card.classList.contains('menu-open')) {
            return;
        }
        
        // Don't show controls if it's a long press (will be handled by context menu)
        if (e.touches.length === 1) {
            setTimeout(() => {
                if (!contextMenu) {
                    showControls();
                }
            }, 100);
        }
    });
    
    // Initial show
    showControls();
}

// ================= TIKTOK-STYLE UPLOAD MODAL FUNCTIONS =================
function initTikTokModal() {
    tiktokModal = document.getElementById('tiktokUploadModal');
    tiktokTypeImage = document.getElementById('tiktokTypeImage');
    tiktokTypeVideo = document.getElementById('tiktokTypeVideo');
    tiktokMediaTitle = document.getElementById('tiktokMediaTitle');
    tiktokMediaFile = document.getElementById('tiktokMediaFile');
    tiktokDropZone = document.getElementById('tiktokDropZone');
    tiktokPreviewArea = document.getElementById('tiktokPreviewArea');
    tiktokProgress = document.getElementById('tiktokProgress');
    tiktokSaveBtn = document.getElementById('tiktokSaveMediaBtn');
    tiktokCancelBtn = document.getElementById('tiktokCancelBtn');
    tiktokCloseBtn = document.getElementById('closeTiktokModal');
    tiktokBrowseBtn = document.getElementById('tiktokBrowseBtn');
    tiktokFileHint = document.getElementById('tiktokFileHint');
    
    if (!tiktokModal) return;
    
    setupTikTokEventListeners();
}

function setupTikTokEventListeners() {
    tiktokTypeImage.addEventListener('click', () => setMediaType('image'));
    tiktokTypeVideo.addEventListener('click', () => setMediaType('video'));
    
    tiktokMediaFile.addEventListener('change', handleTikTokFileSelect);
    
    tiktokDropZone.addEventListener('dragover', handleDragOver);
    tiktokDropZone.addEventListener('dragleave', handleDragLeave);
    tiktokDropZone.addEventListener('drop', handleDrop);
    
    tiktokBrowseBtn.addEventListener('click', () => tiktokMediaFile.click());
    
    tiktokSaveBtn.addEventListener('click', saveTikTokMedia);
    tiktokCancelBtn.addEventListener('click', closeTikTokModal);
    tiktokCloseBtn.addEventListener('click', closeTikTokModal);
    
    tiktokModal.addEventListener('click', (e) => {
        if (e.target === tiktokModal) {
            closeTikTokModal();
        }
    });
}

function setMediaType(type) {
    if (type === 'image') {
        tiktokTypeImage.classList.add('active');
        tiktokTypeVideo.classList.remove('active');
        tiktokMediaFile.accept = 'image/*';
        tiktokFileHint.textContent = 'Supports: JPG, PNG, GIF (Max 50MB)';
    } else {
        tiktokTypeVideo.classList.add('active');
        tiktokTypeImage.classList.remove('active');
        tiktokMediaFile.accept = 'video/*';
        tiktokFileHint.textContent = 'Supports: MP4 (Max 50MB)';
    }
    
    tiktokMediaFile.value = '';
    tiktokPreviewArea.innerHTML = '';
    selectedFile = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    tiktokDropZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    tiktokDropZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    tiktokDropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        tiktokMediaFile.files = files;
        handleTikTokFileSelect({ target: { files: files } });
    }
}

function handleTikTokFileSelect(e) {
    const file = e.target.files[0];
    if (!file) {
        tiktokPreviewArea.innerHTML = '';
        selectedFile = null;
        return;
    }
    
    selectedFile = file;
    
    if (file.size > 50 * 1024 * 1024) {
        showNotification('File too large. Maximum size is 50MB.', 'error');
        tiktokMediaFile.value = '';
        selectedFile = null;
        return;
    }
    
    const isImage = tiktokTypeImage.classList.contains('active');
    if (isImage && !file.type.startsWith('image/')) {
        showNotification('Please select an image file', 'error');
        tiktokMediaFile.value = '';
        selectedFile = null;
        return;
    }
    if (!isImage && !file.type.startsWith('video/')) {
        showNotification('Please select a video file', 'error');
        tiktokMediaFile.value = '';
        selectedFile = null;
        return;
    }
    
    displayTikTokPreview(file);
}

function displayTikTokPreview(file) {
    const fileSize = (file.size / 1024 / 1024).toFixed(2);
    const isImage = file.type.startsWith('image/');
    
    let previewHTML = `
        <div class="tiktok-file-preview">
            ${isImage ? 
                `<img src="${URL.createObjectURL(file)}" class="tiktok-preview-thumb" alt="Preview">` : 
                `<div class="tiktok-preview-thumb" style="background: #0b5e3b; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-video" style="font-size: 30px; color: white;"></i>
                </div>`
            }
            <div class="tiktok-preview-info">
                <div class="tiktok-preview-name">${file.name}</div>
                <div class="tiktok-preview-size">
                    <i class="fas fa-weight-hanging"></i> ${fileSize} MB
                </div>
            </div>
            <button class="tiktok-change-file" onclick="document.getElementById('tiktokMediaFile').click()">
                Change
            </button>
        </div>
    `;
    
    if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewHTML += `
                <div class="tiktok-image-preview">
                    <img src="${e.target.result}" alt="Full preview">
                </div>
            `;
            tiktokPreviewArea.innerHTML = previewHTML;
        };
        reader.readAsDataURL(file);
    } else {
        const videoURL = URL.createObjectURL(file);
        previewHTML += `
            <div class="tiktok-video-preview">
                <video src="${videoURL}" controls preload="metadata"></video>
            </div>
        `;
        tiktokPreviewArea.innerHTML = previewHTML;
    }
}

// ================= OPEN ADD MODAL =================
function openAddModal() {
    tiktokMediaTitle.value = '';
    setMediaType('image');
    tiktokMediaFile.value = '';
    tiktokPreviewArea.innerHTML = '';
    tiktokProgress.classList.add('hidden');
    tiktokSaveBtn.disabled = false;
    tiktokSaveBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i><span>Upload to Cloudinary</span>';
    selectedFile = null;
    
    tiktokModal.classList.remove('hidden');
    
    // Add to history for back button
    history.pushState({ modal: true }, '');
}

// ================= SAVE MEDIA =================
async function saveTikTokMedia() {
    const title = tiktokMediaTitle.value.trim();
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

    const type = tiktokTypeImage.classList.contains('active') ? 'image' : 'video';
    if (type === 'image' && !selectedFile.type.startsWith('image/')) {
        showNotification('Please select a valid image file', 'error');
        return;
    }
    if (type === 'video' && !selectedFile.type.startsWith('video/')) {
        showNotification('Please select a valid video file', 'error');
        return;
    }

    tiktokSaveBtn.disabled = true;
    tiktokSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Uploading...</span>';
    tiktokProgress.classList.remove('hidden');
    
    const progressFill = document.querySelector('.tiktok-progress-fill');
    const progressText = document.querySelector('.tiktok-progress-text');
    let progress = 0;
    const interval = setInterval(() => {
        progress += 5;
        if (progress <= 90) {
            progressFill.style.width = progress + '%';
            progressText.textContent = progress + '%';
        }
    }, 200);

    try {
        const fileUrl = await uploadFileToCloudinary(selectedFile, type);
        
        clearInterval(interval);
        progressFill.style.width = '100%';
        progressText.textContent = '100%';
        
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
        
        setTimeout(() => {
            closeTikTokModal();
            showNotification('Media uploaded to Cloudinary successfully');
            loadGallery();
        }, 500);
        
    } catch (err) {
        clearInterval(interval);
        console.error("Error uploading media:", err);
        showNotification('Error: ' + err.message, 'error');
        tiktokSaveBtn.disabled = false;
        tiktokSaveBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i><span>Upload to Cloudinary</span>';
        tiktokProgress.classList.add('hidden');
    }
}

// ================= CLOSE MODAL =================
function closeTikTokModal() {
    tiktokModal.classList.add('hidden');
    tiktokMediaTitle.value = '';
    tiktokMediaFile.value = '';
    tiktokPreviewArea.innerHTML = '';
    tiktokProgress.classList.add('hidden');
    tiktokSaveBtn.disabled = false;
    tiktokSaveBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i><span>Upload to Cloudinary</span>';
    selectedFile = null;
    
    setMediaType('image');
    
    // Go back in history if modal was opened
    if (history.state && history.state.modal) {
        history.back();
    }
}

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

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", async () => {
    await init();
    createDeleteModal();
    createJumpToBottomButton();
    setupScrollListener();
    setupEventListeners();
    loadViewedMedia();
    loadReactions();
    initTikTokModal();
    
    // Load saved theme
    const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
    applyTheme(savedTheme);
    
    // Add theme button to header
    addThemeButton();
    
    // Android back button handling
    setupBackButtonHandling();
    
    // Update add media button click handler
    addMediaBtn.onclick = openAddModal;
    
    window.addEventListener('popstate', handleBackButton);
    
    window.addEventListener('scroll', hideContextMenu);
    window.addEventListener('resize', hideContextMenu);
});

// ================= ADD THEME BUTTON TO HEADER =================
function addThemeButton() {
    const topBar = document.querySelector('.top-bar');
    const addBtn = document.getElementById('addMediaBtn');
    
    const themeBtn = document.createElement('button');
    themeBtn.id = 'themeBtn';
    themeBtn.className = 'theme-btn';
    themeBtn.innerHTML = '<i class="fas fa-palette"></i>';
    themeBtn.title = 'Change Theme';
    
    themeBtn.addEventListener('click', toggleThemeDropdown);
    
    // Insert theme button before add button
    topBar.insertBefore(themeBtn, addBtn);
}

// ================= SETUP BACK BUTTON HANDLING =================
function setupBackButtonHandling() {
    // Initial state
    history.replaceState({ page: 'gallery' }, '');
}

function handleBackButton(e) {
    e.preventDefault();
    
    // Check what's currently open
    if (tiktokModal && !tiktokModal.classList.contains('hidden')) {
        closeTikTokModal();
    } else if (sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    } else if (deleteModal && !deleteModal.classList.contains('hidden')) {
        deleteModal.classList.add('hidden');
        selectedMediaId = null;
    } else if (lightboxActive && currentLightbox) {
        closeLightbox();
    } else {
        // If nothing is open, maybe exit or go to previous page
        if (history.length > 1) {
            history.back();
        } else {
            // Stay on current page
            history.pushState({ page: 'gallery' }, '');
        }
    }
}

// ================= INIT =================
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

// Make functions globally available
window.handleImageError = handleImageError;
window.downloadMedia = downloadMedia;
window.openDeleteModal = function(id) {
    selectedMediaId = id;
    deleteModal.classList.remove('hidden');
    hideContextMenu();
    
    // Add to history for back button
    history.pushState({ modal: true }, '');
};

// ================= SETUP EVENT LISTENERS =================
function setupEventListeners() {
    logoutBtn.onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = "../index.html";
    };
}

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
            console.log("Cloudinary file deleted from gallery:", media.media_url);
            showNotification('Media deleted from gallery.', 'info');
        }

        deleteModal.classList.add('hidden');
        showNotification('Media deleted successfully');
        
        mediaReactions.delete(selectedMediaId);
        saveReactions();
        
        await loadGallery();

    } catch (err) {
        console.error("Error deleting media:", err);
        showNotification('Error deleting media', 'error');
    }
}