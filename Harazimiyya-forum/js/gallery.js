// ============================================
// HARAZIMIYYA FORUM - GALLERY
// Complete Working Version with Fixed Upload Button and Center Menu
// Features: Upload to Cloudinary, Love/Like reactions per user, Long press menu
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
let currentTheme = 'dark';

// Reaction tracking
let mediaReactions = new Map();

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

// Delete modal
let deleteModal = null;
let selectedMediaId = null;

// Context menu
let contextMenu = null;
let contextMenuMediaId = null;
let longPressTimer = null;
let isLongPressActive = false;

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
        themeBtn.setAttribute('data-theme', themeKey);
        themeBtn.innerHTML = `
            <span class="theme-color" style="background: ${theme.primary}"></span>
            <span>${theme.name}</span>
            ${currentTheme === themeKey ? '<i class="fas fa-check"></i>' : ''}
        `;
        themeBtn.onclick = (e) => {
            e.stopPropagation();
            applyTheme(themeKey);
            themeDropdown.classList.add('hidden');
        };
        dropdown.appendChild(themeBtn);
    });
    
    document.body.appendChild(dropdown);
    return dropdown;
}

// ================= APPLY THEME =================
function applyTheme(themeKey) {
    currentTheme = themeKey;
    const theme = themes[themeKey];
    
    document.documentElement.style.setProperty('--bg', theme.bg);
    document.documentElement.style.setProperty('--text-main', theme.text);
    document.documentElement.style.setProperty('--primary', theme.primary);
    
    document.body.style.background = theme.bg;
    document.body.setAttribute('data-theme', themeKey);
    
    const topBar = document.querySelector('.top-bar');
    if (topBar) {
        topBar.style.background = theme.headerBg;
    }
    
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
}

// ================= SIDEBAR TOGGLE =================
if (openSidebar) {
    openSidebar.addEventListener('click', () => {
        sidebar.classList.add("active");
        overlay.classList.add("active");
    });
}

if (closeSidebar) {
    closeSidebar.addEventListener('click', () => {
        sidebar.classList.remove("active");
        overlay.classList.remove("active");
    });
}

if (overlay) {
    overlay.addEventListener('click', () => {
        sidebar.classList.remove("active");
        overlay.classList.remove("active");
    });
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

// ================= JUMP TO BOTTOM BUTTON =================
function createJumpToBottomButton() {
    const existingBtn = document.getElementById('jumpToBottomBtn');
    if (existingBtn) existingBtn.remove();
    
    const button = document.createElement('button');
    button.id = 'jumpToBottomBtn';
    button.className = 'jump-to-bottom-btn';
    button.innerHTML = '<i class="fas fa-arrow-down"></i>';
    button.title = 'Jump to latest media';
    
    button.addEventListener('click', () => {
        galleryGrid.scrollTo({
            top: galleryGrid.scrollHeight,
            behavior: 'smooth'
        });
    });
    
    document.body.appendChild(button);
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

// ================= LOAD VIEWED MEDIA =================
function loadViewedMedia() {
    try {
        const viewed = JSON.parse(localStorage.getItem('viewedGalleryMedia') || '[]');
        viewed.forEach(id => viewedMedia.add(id));
    } catch (e) {
        console.log("Could not load from localStorage", e);
    }
}

// ================= LOAD REACTIONS FROM SUPABASE =================
async function loadReactions() {
    try {
        const { data, error } = await supabase
            .from('media_reactions')
            .select('*');
        
        if (error) throw error;
        
        // Group reactions by media_id
        const reactionsMap = new Map();
        data.forEach(reaction => {
            if (!reactionsMap.has(reaction.media_id)) {
                reactionsMap.set(reaction.media_id, {
                    love: 0,
                    like: 0,
                    userReacted: null
                });
            }
            
            const mediaReaction = reactionsMap.get(reaction.media_id);
            if (reaction.reaction_type === 'love') {
                mediaReaction.love++;
            } else if (reaction.reaction_type === 'like') {
                mediaReaction.like++;
            }
            
            // Check if current user reacted
            if (reaction.user_id === currentUser?.id) {
                mediaReaction.userReacted = reaction.reaction_type;
            }
        });
        
        mediaReactions = reactionsMap;
        
        // Update UI for all media cards
        allMedia.forEach(item => {
            updateMediaReactions(item.id);
        });
        
    } catch (e) {
        console.error("Error loading reactions:", e);
    }
}

// ================= ADD REACTION TO SUPABASE =================
async function addReaction(mediaId, reactionType) {
    if (!currentUser) {
        showNotification('Please login to react', 'error');
        return;
    }
    
    try {
        // Check if user already reacted
        const { data: existing, error: checkError } = await supabase
            .from('media_reactions')
            .select('*')
            .eq('media_id', mediaId)
            .eq('user_id', currentUser.id)
            .eq('reaction_type', reactionType)
            .maybeSingle();
        
        if (checkError) throw checkError;
        
        if (existing) {
            // User already has this reaction - remove it
            const { error: deleteError } = await supabase
                .from('media_reactions')
                .delete()
                .eq('id', existing.id);
            
            if (deleteError) throw deleteError;
            
            showNotification(`${reactionType} removed`, 'info');
        } else {
            // Check if user has any other reaction on this media
            const { data: otherReaction, error: otherError } = await supabase
                .from('media_reactions')
                .select('*')
                .eq('media_id', mediaId)
                .eq('user_id', currentUser.id)
                .maybeSingle();
            
            if (otherError) throw otherError;
            
            if (otherReaction) {
                // Remove other reaction first
                const { error: deleteOtherError } = await supabase
                    .from('media_reactions')
                    .delete()
                    .eq('id', otherReaction.id);
                
                if (deleteOtherError) throw deleteOtherError;
            }
            
            // Add new reaction
            const { error: insertError } = await supabase
                .from('media_reactions')
                .insert([{
                    media_id: mediaId,
                    user_id: currentUser.id,
                    reaction_type: reactionType
                }]);
            
            if (insertError) throw insertError;
            
            showNotification(`Added ${reactionType}`, 'success');
        }
        
        // Reload reactions to update UI
        await loadReactions();
        
    } catch (err) {
        console.error("Error adding reaction:", err);
        showNotification('Error adding reaction', 'error');
    }
}

// ================= UPDATE MEDIA REACTIONS UI =================
function updateMediaReactions(mediaId) {
    const mediaCard = document.querySelector(`.media-card[data-media-id="${mediaId}"]`);
    if (!mediaCard) return;
    
    const existingReactions = mediaCard.querySelector('.media-reactions');
    if (existingReactions) existingReactions.remove();
    
    const reactions = mediaReactions.get(mediaId);
    if (!reactions || (reactions.love === 0 && reactions.like === 0)) return;
    
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'media-reactions';
    
    if (reactions.love > 0) {
        const loveDiv = document.createElement('div');
        loveDiv.className = `reaction-icon love ${reactions.userReacted === 'love' ? 'active' : ''}`;
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
        likeDiv.className = `reaction-icon like ${reactions.userReacted === 'like' ? 'active' : ''}`;
        likeDiv.innerHTML = '👍';
        if (reactions.like > 1) {
            const count = document.createElement('span');
            count.className = 'reaction-count';
            count.textContent = reactions.like;
            likeDiv.appendChild(count);
        }
        reactionsDiv.appendChild(likeDiv);
    }
    
    mediaCard.appendChild(reactionsDiv);
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
    
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
        deleteModal.classList.add('hidden');
        selectedMediaId = null;
    });
    
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
}

// ================= DOWNLOAD MEDIA =================
async function downloadMedia(url, filename) {
    try {
        showNotification('Downloading...', 'info');
        
        const response = await fetch(url);
        const blob = await response.blob();
        
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename || 'media';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
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

// ================= SHOW CONTEXT MENU IN CENTER =================
function showContextMenu(event, mediaId) {
    event.preventDefault();
    event.stopPropagation();
    
    // Set flag that long press is active
    isLongPressActive = true;
    
    // Hide any existing menu
    if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
    }
    
    const video = event.target.closest('.media-card')?.querySelector('video');
    if (video && !video.paused) {
        video.pause();
    }
    
    const mediaCard = event.target.closest('.media-card');
    if (mediaCard) {
        mediaCard.classList.add('menu-open');
    }
    
    contextMenu = createContextMenu();
    contextMenuMediaId = mediaId;
    
    const media = allMedia.find(m => m.id === mediaId);
    const canDelete = isAdmin || (media && media.uploaded_by === currentUser?.id);
    
    let filename = media?.title || 'media';
    filename += media?.media_type === 'image' ? '.jpg' : '.mp4';
    
    let menuItems = `
        <button class="longpress-menu-item love-item" data-action="love" data-media-id="${mediaId}">
            <i class="fas fa-heart"></i>
            <span>Love</span>
        </button>
        <button class="longpress-menu-item like-item" data-action="like" data-media-id="${mediaId}">
            <i class="fas fa-thumbs-up"></i>
            <span>Like</span>
        </button>
        <button class="longpress-menu-item download-item" data-action="download" data-media-id="${mediaId}" data-filename="${filename}">
            <i class="fas fa-download"></i>
            <span>Download</span>
        </button>
    `;
    
    if (canDelete) {
        menuItems += `
            <button class="longpress-menu-item delete-item" data-action="delete" data-media-id="${mediaId}">
                <i class="fas fa-trash"></i>
                <span>Delete</span>
            </button>
        `;
    }
    
    contextMenu.innerHTML = menuItems;
    
    // Add click handlers to menu items
    contextMenu.querySelectorAll('.longpress-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const action = item.dataset.action;
            const mediaId = item.dataset.mediaId;
            const filename = item.dataset.filename;
            
            // Execute action
            switch(action) {
                case 'love':
                    addReaction(mediaId, 'love');
                    break;
                case 'like':
                    addReaction(mediaId, 'like');
                    break;
                case 'download':
                    const media = allMedia.find(m => m.id === mediaId);
                    if (media) {
                        downloadMedia(media.media_url, filename);
                    }
                    break;
                case 'delete':
                    openDeleteModal(mediaId);
                    break;
            }
            
            // Hide menu after action
            hideContextMenu();
        });
        
        // Prevent touchend from bubbling to document
        item.addEventListener('touchend', (e) => {
            e.stopPropagation();
        });
    });
    
    // Position menu in the CENTER of the screen
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    contextMenu.style.left = centerX + 'px';
    contextMenu.style.top = centerY + 'px';
    contextMenu.style.transform = 'translate(-50%, -50%)';
    
    contextMenu.classList.remove('hidden');
}

// ================= HIDE CONTEXT MENU =================
function hideContextMenu() {
    if (contextMenu) {
        contextMenu.classList.add('hidden');
        
        document.querySelectorAll('.media-card').forEach(card => {
            card.classList.remove('menu-open');
        });
        
        // Remove menu after animation
        setTimeout(() => {
            if (contextMenu && contextMenu.parentNode) {
                contextMenu.remove();
                contextMenu = null;
            }
        }, 300);
    }
    contextMenuMediaId = null;
    
    // Reset long press flag after a delay
    setTimeout(() => {
        isLongPressActive = false;
    }, 500);
}

// ================= SETUP CONTEXT MENU =================
function setupContextMenu(element, mediaId) {
    let touchStart = 0;
    let touchStartX, touchStartY;
    let longPressTriggered = false;
    
    // Right click for desktop
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e, mediaId);
        return false;
    });
    
    // Touch start for mobile
    element.addEventListener('touchstart', (e) => {
        if (isLongPressActive) {
            e.preventDefault();
            return;
        }
        
        touchStart = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        longPressTriggered = false;
        
        // Clear any existing timer
        if (longPressTimer) {
            clearTimeout(longPressTimer);
        }
        
        // Set timer for long press
        longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
            showContextMenu(e, mediaId);
        }, 500);
    }, { passive: true });
    
    // Touch move - cancel if user moves too much
    element.addEventListener('touchmove', (e) => {
        if (touchStartX && touchStartY && !longPressTriggered) {
            const moveX = Math.abs(e.touches[0].clientX - touchStartX);
            const moveY = Math.abs(e.touches[0].clientY - touchStartY);
            
            if (moveX > 20 || moveY > 20) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }
    }, { passive: true });
    
    // Touch end
    element.addEventListener('touchend', (e) => {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        
        // If long press was triggered, prevent default
        if (longPressTriggered) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        longPressTriggered = false;
    }, { passive: false });
    
    // Touch cancel
    element.addEventListener('touchcancel', () => {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        longPressTriggered = false;
    });
}

// ================= CLICK OUTSIDE MENU HANDLER =================
document.addEventListener('click', function(e) {
    // Only hide if click is outside menu and menu exists
    if (contextMenu && !contextMenu.contains(e.target) && !e.target.closest('.longpress-menu-item')) {
        hideContextMenu();
    }
});

document.addEventListener('touchstart', function(e) {
    // Only hide if touch is outside menu and menu exists
    if (contextMenu && !contextMenu.contains(e.target) && !e.target.closest('.longpress-menu-item')) {
        // Don't hide immediately on touch start, give time for menu item clicks
        setTimeout(() => {
            if (contextMenu && !contextMenu.contains(e.target)) {
                hideContextMenu();
            }
        }, 100);
    }
}, { passive: true });

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
    
    const closeBtn = lightbox.querySelector('.lightbox-close');
    if (closeBtn) {
        closeBtn.onclick = closeLightbox;
    }
    
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
                
                <div class="seek-control">
                    <div class="seek-progress">
                        <div class="seek-progress-fill"></div>
                    </div>
                    <div class="seek-handle">
                        <i class="fas fa-circle"></i>
                    </div>
                    <div class="seek-time">0:00 / 0:00</div>
                </div>
                
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
        
        const videoContainer = card.querySelector('.video-container');
        if (videoContainer) {
            setupContextMenu(videoContainer, item.id);
        }
        
        setTimeout(() => {
            setupTikTokVideoControls(card, item.id);
        }, 100);
    }
    
    return card;
}

// ================= SETUP TIKTOK VIDEO CONTROLS =================
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
    
    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    function updateSeekBar() {
        if (!isSeeking && video.duration) {
            const percent = (video.currentTime / video.duration) * 100;
            seekProgress.style.width = percent + '%';
            seekHandle.style.left = percent + '%';
            seekTime.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
        }
    }
    
    function showControls() {
        seekControl.classList.add('visible');
        playPauseBtn.classList.add('visible');
        
        clearTimeout(hideControlsTimeout);
        hideControlsTimeout = setTimeout(() => {
            if (!isSeeking && !card.classList.contains('menu-open')) {
                seekControl.classList.remove('visible');
                playPauseBtn.classList.remove('visible');
            }
        }, 3000);
    }
    
    function togglePlay() {
        if (card.classList.contains('menu-open')) return;
        
        if (video.paused) {
            video.play();
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            video.pause();
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
        showControls();
    }
    
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
    
    videoContainer.addEventListener('click', (e) => {
        if (card.classList.contains('menu-open')) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        if (e.target.closest('.seek-control') || e.target.closest('.seek-handle')) return;
        togglePlay();
    });
    
    function handleSeekStart(e) {
        e.preventDefault();
        e.stopPropagation();
        isSeeking = true;
        seekControl.classList.add('seeking');
        
        if (!video.paused) {
            video.pause();
        }
    }
    
    function handleSeekMove(e) {
        if (!isSeeking) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        let clientX;
        if (e.touches) {
            clientX = e.touches[0].clientX;
        } else {
            clientX = e.clientX;
        }
        
        const rect = seekControl.getBoundingClientRect();
        let percent = (clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        
        seekProgress.style.width = (percent * 100) + '%';
        seekHandle.style.left = (percent * 100) + '%';
        
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
        
        if (playPauseBtn.innerHTML.includes('pause') && !card.classList.contains('menu-open')) {
            video.play();
        }
        
        showControls();
    }
    
    seekControl.addEventListener('touchstart', handleSeekStart, { passive: false });
    seekControl.addEventListener('touchmove', handleSeekMove, { passive: false });
    seekControl.addEventListener('touchend', handleSeekEnd);
    seekControl.addEventListener('touchcancel', handleSeekEnd);
    
    seekControl.addEventListener('mousedown', handleSeekStart);
    window.addEventListener('mousemove', handleSeekMove);
    window.addEventListener('mouseup', handleSeekEnd);
    
    videoContainer.addEventListener('touchstart', () => {
        if (!card.classList.contains('menu-open')) {
            setTimeout(() => {
                if (!contextMenu) {
                    showControls();
                }
            }, 100);
        }
    }, { passive: true });
    
    showControls();
}

// ================= TIKTOK UPLOAD MODAL FUNCTIONS =================
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
    
    if (!tiktokModal) {
        console.error("TikTok modal not found!");
        return;
    }
    
    setupTikTokEventListeners();
}

function setupTikTokEventListeners() {
    if (tiktokTypeImage) {
        tiktokTypeImage.addEventListener('click', (e) => {
            e.preventDefault();
            setMediaType('image');
        });
    }
    
    if (tiktokTypeVideo) {
        tiktokTypeVideo.addEventListener('click', (e) => {
            e.preventDefault();
            setMediaType('video');
        });
    }
    
    if (tiktokMediaFile) {
        tiktokMediaFile.addEventListener('change', handleTikTokFileSelect);
    }
    
    if (tiktokDropZone) {
        tiktokDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            tiktokDropZone.classList.add('dragover');
        });
        
        tiktokDropZone.addEventListener('dragleave', () => {
            tiktokDropZone.classList.remove('dragover');
        });
        
        tiktokDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            tiktokDropZone.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0 && tiktokMediaFile) {
                tiktokMediaFile.files = files;
                handleTikTokFileSelect({ target: { files: files } });
            }
        });
    }
    
    if (tiktokBrowseBtn) {
        tiktokBrowseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (tiktokMediaFile) {
                tiktokMediaFile.click();
            }
        });
    }
    
    if (tiktokSaveBtn) {
        tiktokSaveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveTikTokMedia();
        });
    }
    
    if (tiktokCancelBtn) {
        tiktokCancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeTikTokModal();
        });
    }
    
    if (tiktokCloseBtn) {
        tiktokCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeTikTokModal();
        });
    }
    
    if (tiktokModal) {
        tiktokModal.addEventListener('click', (e) => {
            if (e.target === tiktokModal) {
                closeTikTokModal();
            }
        });
    }
}

function setMediaType(type) {
    if (type === 'image') {
        if (tiktokTypeImage) tiktokTypeImage.classList.add('active');
        if (tiktokTypeVideo) tiktokTypeVideo.classList.remove('active');
        if (tiktokMediaFile) tiktokMediaFile.accept = 'image/*';
        if (tiktokFileHint) tiktokFileHint.textContent = 'Supports: JPG, PNG, GIF (Max 50MB)';
    } else {
        if (tiktokTypeVideo) tiktokTypeVideo.classList.add('active');
        if (tiktokTypeImage) tiktokTypeImage.classList.remove('active');
        if (tiktokMediaFile) tiktokMediaFile.accept = 'video/*';
        if (tiktokFileHint) tiktokFileHint.textContent = 'Supports: MP4 (Max 50MB)';
    }
    
    if (tiktokMediaFile) tiktokMediaFile.value = '';
    if (tiktokPreviewArea) tiktokPreviewArea.innerHTML = '';
    selectedFile = null;
}

function handleTikTokFileSelect(e) {
    const file = e.target.files[0];
    if (!file) {
        if (tiktokPreviewArea) tiktokPreviewArea.innerHTML = '';
        selectedFile = null;
        return;
    }
    
    selectedFile = file;
    
    if (file.size > 50 * 1024 * 1024) {
        showNotification('File too large. Maximum size is 50MB.', 'error');
        if (tiktokMediaFile) tiktokMediaFile.value = '';
        selectedFile = null;
        return;
    }
    
    const isImage = tiktokTypeImage ? tiktokTypeImage.classList.contains('active') : true;
    if (isImage && !file.type.startsWith('image/')) {
        showNotification('Please select an image file', 'error');
        if (tiktokMediaFile) tiktokMediaFile.value = '';
        selectedFile = null;
        return;
    }
    if (!isImage && !file.type.startsWith('video/')) {
        showNotification('Please select a video file', 'error');
        if (tiktokMediaFile) tiktokMediaFile.value = '';
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
            <button class="tiktok-change-file" type="button">Change</button>
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
            if (tiktokPreviewArea) tiktokPreviewArea.innerHTML = previewHTML;
            
            const changeBtn = tiktokPreviewArea ? tiktokPreviewArea.querySelector('.tiktok-change-file') : null;
            if (changeBtn) {
                changeBtn.addEventListener('click', () => {
                    if (tiktokMediaFile) tiktokMediaFile.click();
                });
            }
        };
        reader.readAsDataURL(file);
    } else {
        const videoURL = URL.createObjectURL(file);
        previewHTML += `
            <div class="tiktok-video-preview">
                <video src="${videoURL}" controls preload="metadata"></video>
            </div>
        `;
        if (tiktokPreviewArea) tiktokPreviewArea.innerHTML = previewHTML;
        
        const changeBtn = tiktokPreviewArea ? tiktokPreviewArea.querySelector('.tiktok-change-file') : null;
        if (changeBtn) {
            changeBtn.addEventListener('click', () => {
                if (tiktokMediaFile) tiktokMediaFile.click();
            });
        }
    }
}

// ================= OPEN ADD MODAL =================
function openAddModal() {
    console.log("Opening add modal");
    
    if (tiktokMediaTitle) tiktokMediaTitle.value = '';
    setMediaType('image');
    if (tiktokMediaFile) tiktokMediaFile.value = '';
    if (tiktokPreviewArea) tiktokPreviewArea.innerHTML = '';
    if (tiktokProgress) tiktokProgress.classList.add('hidden');
    if (tiktokSaveBtn) {
        tiktokSaveBtn.disabled = false;
        tiktokSaveBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i><span>Upload to Cloudinary</span>';
    }
    selectedFile = null;
    
    if (tiktokModal) {
        tiktokModal.classList.remove('hidden');
        tiktokModal.style.display = 'flex';
    }
}

// ================= SAVE MEDIA =================
async function saveTikTokMedia() {
    const title = tiktokMediaTitle ? tiktokMediaTitle.value.trim() : '';
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

    const type = tiktokTypeImage && tiktokTypeImage.classList.contains('active') ? 'image' : 'video';
    if (type === 'image' && !selectedFile.type.startsWith('image/')) {
        showNotification('Please select a valid image file', 'error');
        return;
    }
    if (type === 'video' && !selectedFile.type.startsWith('video/')) {
        showNotification('Please select a valid video file', 'error');
        return;
    }

    if (tiktokSaveBtn) {
        tiktokSaveBtn.disabled = true;
        tiktokSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Uploading...</span>';
    }
    if (tiktokProgress) tiktokProgress.classList.remove('hidden');
    
    const progressFill = document.querySelector('.tiktok-progress-fill');
    const progressText = document.querySelector('.tiktok-progress-text');
    let progress = 0;
    const interval = setInterval(() => {
        progress += 5;
        if (progress <= 90) {
            if (progressFill) progressFill.style.width = progress + '%';
            if (progressText) progressText.textContent = progress + '%';
        }
    }, 200);

    try {
        const fileUrl = await uploadFileToCloudinary(selectedFile, type);
        
        clearInterval(interval);
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = '100%';
        
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
        if (tiktokSaveBtn) {
            tiktokSaveBtn.disabled = false;
            tiktokSaveBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i><span>Upload to Cloudinary</span>';
        }
        if (tiktokProgress) tiktokProgress.classList.add('hidden');
    }
}

// ================= CLOSE MODAL =================
function closeTikTokModal() {
    if (tiktokModal) {
        tiktokModal.classList.add('hidden');
        tiktokModal.style.display = 'none';
    }
    if (tiktokMediaTitle) tiktokMediaTitle.value = '';
    if (tiktokMediaFile) tiktokMediaFile.value = '';
    if (tiktokPreviewArea) tiktokPreviewArea.innerHTML = '';
    if (tiktokProgress) tiktokProgress.classList.add('hidden');
    if (tiktokSaveBtn) {
        tiktokSaveBtn.disabled = false;
        tiktokSaveBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i><span>Upload to Cloudinary</span>';
    }
    selectedFile = null;
    
    setMediaType('image');
}

// ================= UPLOAD TO CLOUDINARY =================
async function uploadFileToCloudinary(file, type) {
    try {
        if (!file) throw new Error("No file to upload");
        
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
        showNotification('✅ Uploaded to Cloudinary', 'success');
        
        return data.secure_url;
        
    } catch (err) {
        console.error("❌ Error uploading to Cloudinary:", err);
        showNotification('Failed to upload to Cloudinary: ' + err.message, 'error');
        throw err;
    }
}

// ================= ADD THEME BUTTON =================
function addThemeButton() {
    const topBar = document.querySelector('.top-bar');
    if (!topBar) return;
    
    if (document.getElementById('themeBtn')) return;
    
    const themeBtn = document.createElement('button');
    themeBtn.id = 'themeBtn';
    themeBtn.className = 'theme-btn';
    themeBtn.innerHTML = '<i class="fas fa-palette"></i>';
    themeBtn.title = 'Change Theme';
    
    themeBtn.addEventListener('click', toggleThemeDropdown);
    
    const addBtn = document.getElementById('addMediaBtn');
    if (addBtn) {
        topBar.insertBefore(themeBtn, addBtn);
    } else {
        topBar.appendChild(themeBtn);
    }
}

// ================= LOAD GALLERY =================
async function loadGallery() {
    if (!galleryGrid) return;
    
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
        
        // Load reactions after gallery is loaded
        await loadReactions();

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
    if (!galleryGrid) return;
    
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

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", async () => {
    // Force show upload button
    if (addMediaBtn) {
        addMediaBtn.classList.remove("hidden");
        addMediaBtn.style.display = "inline-flex";
    }
    
    setTimeout(async () => {
        await init();
    }, 100);
});

async function init() {
    try {
        if (typeof supabase === 'undefined') {
            console.error("Supabase not loaded");
            return;
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
            window.location.href = "../index.html";
            return;
        }

        currentUser = user;

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

        const userNameEl = document.getElementById('userName');
        if (userNameEl) {
            userNameEl.textContent = profile.full_name || 'Member';
        }

        // Ensure upload button is visible and has click handler
        if (addMediaBtn) {
            addMediaBtn.classList.remove("hidden");
            addMediaBtn.style.display = "inline-flex";
            addMediaBtn.onclick = openAddModal;
        }

        // Initialize components
        createDeleteModal();
        createJumpToBottomButton();
        loadViewedMedia();
        
        const savedTheme = localStorage.getItem('selectedTheme') || 'dark';
        applyTheme(savedTheme);
        
        addThemeButton();
        initTikTokModal();
        await loadGallery();

    } catch (err) {
        console.error("Initialization error:", err);
    }
}

// ================= SETUP EVENT LISTENERS =================
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = "../index.html";
    });
}

// ================= OPEN DELETE MODAL =================
window.openDeleteModal = function(id) {
    selectedMediaId = id;
    if (deleteModal) deleteModal.classList.remove('hidden');
    hideContextMenu();
};

// ================= CONFIRM DELETE =================
async function confirmDelete() {
    if (!selectedMediaId) return;

    try {
        // Delete reactions first
        const { error: reactionsError } = await supabase
            .from('media_reactions')
            .delete()
            .eq('media_id', selectedMediaId);
        
        if (reactionsError) throw reactionsError;
        
        // Then delete media
        const { error } = await supabase
            .from('gallery')
            .delete()
            .eq('id', selectedMediaId);

        if (error) throw error;

        if (deleteModal) deleteModal.classList.add('hidden');
        showNotification('Media deleted successfully');
        
        mediaReactions.delete(selectedMediaId);
        
        await loadGallery();

    } catch (err) {
        console.error("Error deleting media:", err);
        showNotification('Error deleting media', 'error');
    }
}

// Make functions globally available
window.handleImageError = handleImageError;
window.downloadMedia = downloadMedia;

// ================= FORCE UPLOAD BUTTON TO WORK =================
window.addEventListener('load', function() {
    console.log("🔧 Applying final fixes...");
    
    const modal = document.getElementById('tiktokUploadModal');
    const addBtn = document.getElementById('addMediaBtn');
    const closeBtn = document.getElementById('closeTiktokModal');
    const cancelBtn = document.getElementById('tiktokCancelBtn');
    const uploadBtn = document.getElementById('tiktokSaveMediaBtn');
    
    if (!modal) {
        console.error("❌ Modal not found!");
        return;
    }
    
    if (!addBtn) {
        console.error("❌ Add button not found!");
        return;
    }
    
    // Make sure add button is visible
    addBtn.classList.remove('hidden');
    addBtn.style.display = 'inline-flex';
    
    // Remove all existing click handlers by cloning and replacing
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    
    // Attach our working click handler
    newAddBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("✅ Add button clicked - opening modal");
        
        // Reset form
        const titleInput = document.getElementById('tiktokMediaTitle');
        const fileInput = document.getElementById('tiktokMediaFile');
        const previewArea = document.getElementById('tiktokPreviewArea');
        const progress = document.getElementById('tiktokProgress');
        
        if (titleInput) titleInput.value = '';
        if (fileInput) fileInput.value = '';
        if (previewArea) previewArea.innerHTML = '';
        if (progress) progress.classList.add('hidden');
        
        // Show modal
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        
        return false;
    };
    
    // Close modal function
    function closeModal() {
        console.log("Closing modal");
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    
    // Attach close handlers
    if (closeBtn) {
        closeBtn.onclick = function(e) {
            e.preventDefault();
            closeModal();
            return false;
        };
    }
    
    if (cancelBtn) {
        cancelBtn.onclick = function(e) {
            e.preventDefault();
            closeModal();
            return false;
        };
    }
    
    // Close on backdrop click
    modal.onclick = function(e) {
        if (e.target === modal) {
            closeModal();
        }
    };
    
    console.log("✅ Final fixes applied - upload button should now work!");
});

// Also run a backup fix after a delay
setTimeout(function() {
    const addBtn = document.getElementById('addMediaBtn');
    const modal = document.getElementById('tiktokUploadModal');
    
    if (addBtn && modal) {
        addBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            return false;
        };
    }
}, 2000);

// ================= FIX: ANDROID ADD BUTTON =================
// Hide text on small screens (Android)
function adjustAddButtonForMobile() {
    const addBtn = document.getElementById('addMediaBtn');
    if (!addBtn) return;
    
    // Check if it's a mobile device (screen width <= 480px)
    if (window.innerWidth <= 480) {
        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
        addBtn.title = 'Add Media';
    } else {
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add';
    }
}

// Run on load and resize
window.addEventListener('load', adjustAddButtonForMobile);
window.addEventListener('resize', adjustAddButtonForMobile);

// ================= FIX: ENSURE UPLOAD BUTTON VISIBLE ON LAPTOP =================
// Force upload button to be visible
function ensureUploadButtonVisible() {
    const uploadBtn = document.getElementById('tiktokSaveMediaBtn');
    if (uploadBtn) {
        uploadBtn.style.display = 'flex';
        uploadBtn.style.visibility = 'visible';
        uploadBtn.style.opacity = '1';
    }
}

// Run repeatedly to ensure button appears
setInterval(ensureUploadButtonVisible, 500);