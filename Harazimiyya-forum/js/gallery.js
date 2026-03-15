// ============================================
// HARAZIMIYYA FORUM - GALLERY
// Features: Right-click (desktop) or Long-press (mobile) menu
// Menu: Love, Like, Delete (owners/admins only)
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
const galleryModal = document.getElementById("galleryModal");
const closeGalleryModalBtn = document.getElementById("closeGalleryModalBtn");
const saveMediaBtn = document.getElementById("saveMediaBtn");
const mediaType = document.getElementById("mediaType");
const mediaTitle = document.getElementById("mediaTitle");
const mediaFile = document.getElementById("mediaFile");

// Delete modal (will be created dynamically)
let deleteModal = null;
let selectedMediaId = null;

// Context menu
let contextMenu = null;
let contextMenuTarget = null;
let contextMenuMediaId = null;
let longPressTimer = null;

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
    const userId = currentUser?.id;
    
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
    event.preventDefault(); // Prevent default right-click menu
    
    if (contextMenu) {
        contextMenu.remove();
    }
    
    contextMenu = createContextMenu();
    contextMenuMediaId = mediaId;
    
    const canDelete = isAdmin || allMedia.find(m => m.id === mediaId)?.uploaded_by === currentUser.id;
    
    let menuItems = `
        <button class="longpress-menu-item love-item" onclick="handleReaction('${mediaId}', 'love')">
            <i class="fas fa-heart"></i>
            <span>Love</span>
        </button>
        <button class="longpress-menu-item like-item" onclick="handleReaction('${mediaId}', 'like')">
            <i class="fas fa-thumbs-up"></i>
            <span>Like</span>
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
    
    // Position menu near click
    const x = event.clientX;
    const y = event.clientY;
    
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    
    // Adjust if menu goes off screen
    setTimeout(() => {
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
        }
    }, 10);
    
    contextMenu.classList.remove('hidden');
    
    // Hide menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', hideContextMenuOnce);
    }, 100);
}

function hideContextMenuOnce(e) {
    if (contextMenu && !contextMenu.contains(e.target)) {
        hideContextMenu();
        document.removeEventListener('click', hideContextMenuOnce);
    }
}

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.classList.add('hidden');
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

// ================= SETUP CONTEXT MENU (Right-click + Long press) =================
function setupContextMenu(element, mediaId) {
    let touchStart = 0;
    
    // For desktop: Right-click
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, mediaId);
        return false;
    });
    
    // For mobile: Long press
    element.addEventListener('touchstart', (e) => {
        touchStart = Date.now();
        longPressTimer = setTimeout(() => {
            showContextMenu(e, mediaId);
        }, 500); // 500ms long press
    });
    
    element.addEventListener('touchend', (e) => {
        clearTimeout(longPressTimer);
        if (Date.now() - touchStart < 500) {
            // Short tap - open lightbox
            const media = allMedia.find(m => m.id === mediaId);
            if (media) {
                viewMedia(mediaId, media.media_url, media.media_type, media.title);
            }
        }
    });
    
    element.addEventListener('touchmove', () => {
        clearTimeout(longPressTimer);
    });
    
    element.addEventListener('touchcancel', () => {
        clearTimeout(longPressTimer);
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
    lightbox.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.98);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 0;
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
            <div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #000;">
                <img src="${src}" style="max-width: 100%; max-height: 85vh; width: auto; height: auto; object-fit: contain; border-radius: 0;" onerror="this.onerror=null; this.src='${getFallbackImageUrl()}';">
                <div style="position: absolute; top: 20px; right: 20px; left: 20px; display: flex; justify-content: space-between; align-items: center; z-index: 10001;">
                    <button style="background: rgba(255,255,255,0.2); border: none; width: 44px; height: 44px; border-radius: 50%; font-size: 24px; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);">✕</button>
                    <a href="${src}" download="${filename}" style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: #0b5e3b; color: white; border: none; border-radius: 30px; cursor: pointer; font-size: 1rem; text-decoration: none; backdrop-filter: blur(5px);">
                        <i class="fas fa-download"></i> Download
                    </a>
                </div>
            </div>
        `;
    } else {
        lightbox.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #000;">
                <video 
                    src="${src}" 
                    controls
                    autoplay
                    playsinline
                    webkit-playsinline
                    x5-playsinline
                    x5-video-player-type="h5"
                    x5-video-player-fullscreen="true"
                    x5-video-orientation="portraint"
                    style="width: 100%; height: 100%; max-height: 100vh; object-fit: contain; background: #000;"
                    preload="auto"
                >
                    <source src="${src}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                <div style="position: absolute; top: 20px; right: 20px; left: 20px; display: flex; justify-content: space-between; align-items: center; z-index: 10001;">
                    <button style="background: rgba(255,255,255,0.2); border: none; width: 44px; height: 44px; border-radius: 50%; font-size: 24px; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);">✕</button>
                    <a href="${src}" download="${filename}" style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: #0b5e3b; color: white; border: none; border-radius: 30px; cursor: pointer; font-size: 1rem; text-decoration: none; backdrop-filter: blur(5px);">
                        <i class="fas fa-download"></i> Download
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
    
    // Click background to close (but not on video)
    lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox || e.target.classList.contains('lightbox-modal')) {
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
    
    // Prevent body scrolling when lightbox is open
    document.body.style.overflow = 'hidden';
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
        
        // Restore body scrolling
        document.body.style.overflow = '';
        
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
    loadReactions();
    
    window.addEventListener('popstate', (e) => {
        if (lightboxActive && currentLightbox) {
            e.preventDefault();
            closeLightbox();
        }
    });
    
    // Hide context menu on scroll
    window.addEventListener('scroll', () => {
        hideContextMenu();
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
        
        // Setup context menu on media preview
        const preview = card.querySelector('.media-preview');
        if (preview) {
            setupContextMenu(preview, item.id);
        }
        
        // Update reactions display
        updateMediaReactions(item.id);
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
    } else {
        card.innerHTML = `
            <span class="media-badge"><i class="fas fa-video"></i> Video</span>
            <video 
                src="${item.media_url}" 
                class="media-preview" 
                controls
                playsinline
                preload="metadata"
                poster="${item.thumbnail_url || ''}"
            >
                <source src="${item.media_url}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
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
    }
    
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
    hideContextMenu();
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
        
        // Remove reactions for deleted media
        mediaReactions.delete(selectedMediaId);
        saveReactions();
        
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