// js/chat.js - Complete Group Chat with Context Menu, Multi-Select, and Reply Features
console.log("💬 Chat page loading...");

// Helper function to prevent null URL errors
function safeUrl(url) {
    if (!url || url === 'null' || url === 'undefined' || url === '') {
        return null;
    }
    return url;
}

// Global variables
let currentUser = null;
let isAdmin = false;
let messagesSubscription = null;
let presenceSubscription = null;
let typingSubscription = null;
let onlineUsers = new Set();
let typingUsers = new Map(); // userId -> timeout
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let recordedAudio = null;
let recordedAudioUrl = null;
let currentFile = null;
let currentFileType = 'image';
let selectedMemberId = null;
let messageReadTimer = null;
let currentChatPartner = null;
let replyingTo = null;
let pendingReply = null; // Store reply permanently until sent
let touchStartX = 0;
let touchCurrentX = 0;
let currentSwipeElement = null;
let swipeThreshold = 80; // Minimum swipe distance to trigger reply
let allMembers = []; // Store all members for search
let typingTimeout = null;
let isTyping = false;

// Context menu and highlighting variables
let highlightedMessages = new Set(); // Set of highlighted message IDs
let contextMenuActive = false;
let longPressTimer = null;
let longPressThreshold = 500; // 500ms for long press
let lastTapTime = 0;
let doubleTapThreshold = 300; // 300ms for double tap

// Message reactions storage
let messageReactions = new Map(); // messageId -> { likes: [userIds], loves: [userIds] }

// Recording operation flag
let isRecordingOperation = false;

// Smart scroll variables
let showJumpToBottom = false;
let hasUnreadMessages = false;
let firstUnreadMessageId = null;

// Theme variables
const themes = ['dark', 'light', 'sepia', 'forest'];
let currentTheme = localStorage.getItem('chatTheme') || 'dark';

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded, initializing chat...");
    
    function initializeChat() {
        if (!window.supabase) {
            console.log("⏳ Waiting for connection...");
            setTimeout(initializeChat, 100);
            return;
        }
        
        setupSidebar();
        loadChatData();
        initTheme();
        setupThemeToggle();
        
        // Load reactions from database
        setTimeout(() => {
            loadReactions();
        }, 2000);
        
        // Check for pending reply
        setTimeout(() => {
            checkPendingReply();
        }, 3000);
        
        // Create jump to bottom button on page load
        setTimeout(() => {
            createJumpToBottomButton();
        }, 1000);
        
        // Setup click outside to clear highlights
        setupClickOutsideHandler();
        
        // Setup reaction touch handlers for mobile
        setTimeout(() => {
            setupReactionTouchHandlers();
        }, 3000);
    }
    
    initializeChat();
});

// ================= REACTION TOUCH HANDLER FOR MOBILE =================
function setupReactionTouchHandlers() {
    document.addEventListener('touchstart', (e) => {
        // Check if touching a reaction
        const reaction = e.target.closest('.reaction');
        if (!reaction) {
            // If touching outside reaction, hide any open tooltip/modal
            hideReactionTooltip();
            const existingModal = document.querySelector('.online-users-modal');
            if (existingModal) existingModal.remove();
            return;
        }
        
        // Prevent default to avoid double events
        e.preventDefault();
        
        // Get reaction data
        const messageId = reaction.dataset.messageId;
        const reactionType = reaction.dataset.reactionType;
        
        // Show who reacted
        showReactionUsers(messageId, reactionType);
    }, { passive: false });
}

// ================= LOAD REACTIONS FROM DATABASE =================
async function loadReactions() {
    try {
        console.log("🔄 Loading reactions from database...");
        
        const { data: reactions, error } = await supabase
            .from('message_reactions')
            .select('*');
        
        if (error) {
            console.error("❌ Error loading reactions:", error);
            
            // Check if table exists
            if (error.code === '42P01') { // Undefined table error code
                console.warn("⚠️ message_reactions table doesn't exist. Please create it in Supabase.");
                showNotification("Please create the message_reactions table in Supabase", "error", 5000);
            }
            return;
        }
        
        // Clear existing reactions
        messageReactions.clear();
        
        // Organize reactions by message
        reactions.forEach(reaction => {
            if (!messageReactions.has(reaction.message_id)) {
                messageReactions.set(reaction.message_id, { likes: [], loves: [] });
            }
            
            const msgReactions = messageReactions.get(reaction.message_id);
            if (reaction.reaction_type === 'like') {
                msgReactions.likes.push(reaction.user_id);
            } else if (reaction.reaction_type === 'love') {
                msgReactions.loves.push(reaction.user_id);
            }
        });
        
        console.log("✅ Reactions loaded from database:", messageReactions);
        
        // Update all message displays
        messageReactions.forEach((_, messageId) => {
            updateMessageReactions(messageId);
        });
        
    } catch (err) {
        console.error("❌ Error in loadReactions:", err);
    }
}

// ================= CHECK PENDING REPLY =================
function checkPendingReply() {
    const pendingReplyData = sessionStorage.getItem('replyingTo');
    if (pendingReplyData) {
        try {
            const replyData = JSON.parse(pendingReplyData);
            // Store in both replyingTo and pendingReply
            replyingTo = { id: replyData.id, name: replyData.name };
            pendingReply = { id: replyData.id, name: replyData.name, content: replyData.content, type: replyData.type };
            console.log("📝 Restored pending reply from sessionStorage:", pendingReply);
            createReplyIndicator(replyData.name, replyData.content, replyData.type);
        } catch (err) {
            console.error("Error restoring pending reply:", err);
            sessionStorage.removeItem('replyingTo');
        }
    }
}

// ================= CLICK OUTSIDE HANDLER =================
function setupClickOutsideHandler() {
    document.addEventListener('click', (e) => {
        // Don't clear if clicking on context menu or action bar
        if (e.target.closest('.context-menu') || e.target.closest('.action-bar')) {
            return;
        }
        
        // Don't clear if clicking on a message (handled separately)
        if (e.target.closest('.message')) {
            return;
        }
        
        // Clear all highlights when clicking outside
        clearAllHighlights();
    });
}

// ================= HIGHLIGHT MANAGEMENT =================
function toggleMessageHighlight(messageId) {
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    if (highlightedMessages.has(messageId)) {
        // Remove highlight
        highlightedMessages.delete(messageId);
        messageEl.classList.remove('highlighted');
    } else {
        // Add highlight
        highlightedMessages.add(messageId);
        messageEl.classList.add('highlighted');
    }
    
    // Update action bar if it exists
    updateActionBar();
}

function clearAllHighlights() {
    if (highlightedMessages.size === 0) return;
    
    // Remove highlight class from all messages
    highlightedMessages.forEach(messageId => {
        const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (messageEl) {
            messageEl.classList.remove('highlighted');
        }
    });
    
    highlightedMessages.clear();
    
    // Remove action bar
    const actionBar = document.querySelector('.action-bar');
    if (actionBar) actionBar.remove();
    
    // Remove context menu
    const contextMenu = document.querySelector('.context-menu');
    if (contextMenu) contextMenu.remove();
}

function updateActionBar() {
    const count = highlightedMessages.size;
    
    if (count === 0) {
        // Remove action bar if no highlights
        const actionBar = document.querySelector('.action-bar');
        if (actionBar) actionBar.remove();
        return;
    }
    
    // Check if we're on mobile or desktop
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        // Show mobile action bar
        showMobileActionBar(count);
    }
}

function showMobileActionBar(count) {
    // Remove existing action bar
    const existingBar = document.querySelector('.action-bar');
    if (existingBar) existingBar.remove();
    
    const actionBar = document.createElement('div');
    actionBar.className = 'action-bar';
    
    // Check if any selected message has reactions
    const hasLikes = checkIfAnyHasReaction('like');
    const hasLoves = checkIfAnyHasReaction('love');
    
    actionBar.innerHTML = `
        <div class="selection-counter">${count}</div>
        <button class="like-btn ${hasLikes ? 'active' : ''}" onclick="handleBulkReaction('like')" title="Like">
            <i class="fas fa-thumbs-up"></i>
            <span>Like</span>
        </button>
        <button class="love-btn ${hasLoves ? 'active' : ''}" onclick="handleBulkReaction('love')" title="Love">
            <i class="fas fa-heart"></i>
            <span>Love</span>
        </button>
        <button class="delete-btn" onclick="handleDeleteSelected()" title="Delete">
            <i class="fas fa-trash"></i>
            <span>Delete</span>
        </button>
    `;
    
    document.body.appendChild(actionBar);
}

// ================= REACTION FUNCTIONS =================
async function toggleReaction(messageId, reactionType) {
    console.log(`🔄 Toggling ${reactionType} for message:`, messageId);
    
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageEl) {
        console.error("❌ Message element not found");
        return;
    }
    
    // Show loading state
    const reactionBtn = document.querySelector(`.reaction.${reactionType}-reaction[data-message-id="${messageId}"]`);
    if (reactionBtn) reactionBtn.classList.add('loading');
    
    try {
        // Initialize reactions for this message if not exists
        if (!messageReactions.has(messageId)) {
            messageReactions.set(messageId, { likes: [], loves: [] });
        }
        
        const reactions = messageReactions.get(messageId);
        const userReactionArray = reactionType === 'like' ? reactions.likes : reactions.loves;
        const otherReactionArray = reactionType === 'like' ? reactions.loves : reactions.likes;
        
        // Check if user already reacted with this type
        const userIndex = userReactionArray.indexOf(currentUser.id);
        const hasReaction = userIndex !== -1;
        
        if (hasReaction) {
            // Remove reaction from database
            console.log(`🗑️ Removing ${reactionType} reaction`);
            const { error } = await supabase
                .from('message_reactions')
                .delete()
                .eq('message_id', messageId)
                .eq('user_id', currentUser.id)
                .eq('reaction_type', reactionType);
            
            if (error) {
                console.error("❌ Error removing reaction:", error);
                throw error;
            }
            
            // Remove from local array
            userReactionArray.splice(userIndex, 1);
            console.log(`✅ ${reactionType} reaction removed`);
            
        } else {
            // Check if user has the other reaction type and remove it first
            const otherIndex = otherReactionArray.indexOf(currentUser.id);
            if (otherIndex !== -1) {
                // Remove other reaction from database
                const otherType = reactionType === 'like' ? 'love' : 'like';
                console.log(`🔄 Removing conflicting ${otherType} reaction`);
                
                const { error: otherError } = await supabase
                    .from('message_reactions')
                    .delete()
                    .eq('message_id', messageId)
                    .eq('user_id', currentUser.id)
                    .eq('reaction_type', otherType);
                
                if (otherError) {
                    console.error("❌ Error removing other reaction:", otherError);
                } else {
                    // Remove from local array
                    otherReactionArray.splice(otherIndex, 1);
                }
            }
            
            // Add new reaction to database
            console.log(`➕ Adding ${reactionType} reaction`);
            const { error } = await supabase
                .from('message_reactions')
                .insert([{
                    message_id: messageId,
                    user_id: currentUser.id,
                    reaction_type: reactionType
                }]);
            
            if (error) {
                console.error("❌ Error adding reaction:", error);
                throw error;
            }
            
            // Add to local array
            userReactionArray.push(currentUser.id);
            console.log(`✅ ${reactionType} reaction added`);
        }
        
        // Update message display
        updateMessageReactions(messageId);
        
        // Show notification
        if (hasReaction) {
            showNotification(`Removed ${reactionType === 'like' ? '👍' : '❤️'} reaction`, 'success', 1500);
        } else {
            showNotification(`Added ${reactionType === 'like' ? '👍' : '❤️'} reaction`, 'success', 1500);
        }
        
    } catch (err) {
        console.error(`❌ Error toggling ${reactionType}:`, err);
        showNotification('Failed to update reaction. Check console for details.', 'error');
    } finally {
        if (reactionBtn) reactionBtn.classList.remove('loading');
    }
}

function updateMessageReactions(messageId) {
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    const reactions = messageReactions.get(messageId);
    if (!reactions) return;
    
    // Remove existing reaction display
    const existingReactions = messageEl.querySelector('.message-reactions');
    if (existingReactions) existingReactions.remove();
    
    // Create reaction display if there are any reactions
    if (reactions.likes.length > 0 || reactions.loves.length > 0) {
        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'message-reactions';
        
        let html = '';
        
        if (reactions.likes.length > 0) {
            const userLiked = reactions.likes.includes(currentUser.id);
            html += `
                <div class="reaction like-reaction ${userLiked ? 'user-reacted' : ''}" 
                     data-message-id="${messageId}" 
                     data-reaction-type="like"
                     onclick="toggleReaction('${messageId}', 'like')"
                     ontouchstart="handleReactionTouch(event, '${messageId}', 'like')"
                     onmouseenter="showReactionTooltip(event, this, '${messageId}', 'like')"
                     onmouseleave="hideReactionTooltip()">
                    <i class="fas fa-thumbs-up"></i>
                    <span class="reaction-count">${reactions.likes.length}</span>
                </div>
            `;
        }
        
        if (reactions.loves.length > 0) {
            const userLoved = reactions.loves.includes(currentUser.id);
            html += `
                <div class="reaction love-reaction ${userLoved ? 'user-reacted' : ''}" 
                     data-message-id="${messageId}" 
                     data-reaction-type="love"
                     onclick="toggleReaction('${messageId}', 'love')"
                     ontouchstart="handleReactionTouch(event, '${messageId}', 'love')"
                     onmouseenter="showReactionTooltip(event, this, '${messageId}', 'love')"
                     onmouseleave="hideReactionTooltip()">
                    <i class="fas fa-heart"></i>
                    <span class="reaction-count">${reactions.loves.length}</span>
                </div>
            `;
        }
        
        reactionsDiv.innerHTML = html;
        messageEl.appendChild(reactionsDiv);
    }
}

// Handle reaction touch for mobile
window.handleReactionTouch = function(event, messageId, reactionType) {
    event.preventDefault();
    event.stopPropagation();
    showReactionUsers(messageId, reactionType);
};

// ================= FIXED SHOW REACTION TOOLTIP FUNCTION =================
async function showReactionTooltip(event, element, messageId, reactionType) {
    // Don't show tooltip on mobile
    if (window.innerWidth <= 768) return;
    
    // Prevent event bubbling
    event.stopPropagation();
    event.preventDefault();
    
    // Get reactions from our local storage
    const reactions = messageReactions.get(messageId);
    if (!reactions) return;
    
    const userIds = reactionType === 'like' ? reactions.likes : reactions.loves;
    if (!userIds || userIds.length === 0) return;
    
    // Remove any existing tooltip first
    hideReactionTooltip();
    
    // Create a simple tooltip with the count first (fallback)
    const count = userIds.length;
    let namesText = `${count} ${reactionType === 'like' ? 'like' : 'love'}${count > 1 ? 's' : ''}`;
    
    // Try to fetch names
    try {
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('full_name')
            .in('id', userIds);
        
        if (!error && profiles && profiles.length > 0) {
            // Format names nicely
            if (profiles.length === 1) {
                namesText = profiles[0].full_name || 'Someone';
            } else if (profiles.length === 2) {
                namesText = `${profiles[0].full_name || 'Someone'} and ${profiles[1].full_name || 'Someone'}`;
            } else if (profiles.length <= 5) {
                const names = profiles.map(p => p.full_name || 'Someone').join(', ');
                namesText = names;
            } else {
                const firstFew = profiles.slice(0, 3).map(p => p.full_name || 'Someone').join(', ');
                namesText = `${firstFew} and ${profiles.length - 3} others`;
            }
        }
    } catch (err) {
        // Silently fail and use the count fallback
        console.log("Using count fallback for tooltip");
    }
    
    // Create and show tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'reaction-tooltip';
    tooltip.textContent = namesText;
    
    // Position tooltip
    const rect = element.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - 40}px`;
    tooltip.style.transform = 'translateX(-50%)';
    
    document.body.appendChild(tooltip);
    
    // Auto hide after 2 seconds
    setTimeout(() => {
        hideReactionTooltip();
    }, 2000);
}

function hideReactionTooltip() {
    const tooltip = document.querySelector('.reaction-tooltip');
    if (tooltip) tooltip.remove();
}

// ================= UPDATED SHOW REACTION USERS =================
async function showReactionUsers(messageId, reactionType) {
    const reactions = messageReactions.get(messageId);
    if (!reactions) return;
    
    const userIds = reactionType === 'like' ? reactions.likes : reactions.loves;
    if (userIds.length === 0) return;
    
    // Remove any existing modal
    const existingModal = document.querySelector('.online-users-modal');
    if (existingModal) existingModal.remove();
    
    // Fetch user profiles
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('full_name, email')
        .in('id', userIds);
    
    if (error) {
        console.error("Error fetching user profiles:", error);
        return;
    }
    
    // Create modal to show who reacted
    const modal = document.createElement('div');
    modal.className = 'online-users-modal';
    
    const reactionEmoji = reactionType === 'like' ? '👍' : '❤️';
    const reactionName = reactionType === 'like' ? 'Liked by' : 'Loved by';
    
    let usersHtml = '';
    profiles.forEach(user => {
        usersHtml += `
            <div class="online-user-item">
                <div class="online-user-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="online-user-info">
                    <h4>${user.full_name || user.email}</h4>
                </div>
            </div>
        `;
    });
    
    modal.innerHTML = `
        <div class="online-users-content">
            <div class="online-users-header">
                <h3>${reactionEmoji} ${reactionName} (${profiles.length})</h3>
                <button class="close-online-modal"><i class="fas fa-times"></i></button>
            </div>
            <div class="online-users-list">
                ${usersHtml}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal when clicking close button
    modal.querySelector('.close-online-modal').onclick = () => modal.remove();
    
    // Close modal when tapping outside
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

function checkIfAnyHasReaction(reactionType) {
    for (const messageId of highlightedMessages) {
        const reactions = messageReactions.get(messageId);
        if (reactions && (reactionType === 'like' ? reactions.likes : reactions.loves).includes(currentUser.id)) {
            return true;
        }
    }
    return false;
}

window.handleBulkReaction = function(reactionType) {
    highlightedMessages.forEach(messageId => {
        toggleReaction(messageId, reactionType);
    });
    showNotification(`${reactionType === 'like' ? '👍' : '❤️'} Added to ${highlightedMessages.size} message${highlightedMessages.size > 1 ? 's' : ''}`, 'success');
    clearAllHighlights();
};

// ================= DESKTOP CONTEXT MENU =================
function showContextMenu(x, y, messageId, senderName, messageContent, messageType) {
    // Remove existing context menu
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) existingMenu.remove();
    
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    const canDelete = isAdmin || messageEl?.dataset.senderId === currentUser.id;
    
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu desktop';
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    
    // Escape quotes in message content for safe HTML
    const escapedContent = messageContent.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    let menuHtml = `
        <button onclick="handleReply('${messageId}', '${senderName.replace(/'/g, "\\'")}', '${escapedContent}', '${messageType}')">
            <i class="fas fa-reply"></i> Reply
        </button>
        <button onclick="toggleReaction('${messageId}', 'like')">
            <i class="fas fa-thumbs-up"></i> Like
        </button>
        <button onclick="toggleReaction('${messageId}', 'love')">
            <i class="fas fa-heart"></i> Love
        </button>
    `;
    
    if (canDelete) {
        menuHtml += `
            <button onclick="handleDelete('${messageId}')" style="color: var(--danger);">
                <i class="fas fa-trash"></i> Delete
            </button>
        `;
    }
    
    contextMenu.innerHTML = menuHtml;
    document.body.appendChild(contextMenu);
    
    // Remove menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function removeMenu(e) {
            if (!contextMenu.contains(e.target)) {
                contextMenu.remove();
                document.removeEventListener('click', removeMenu);
            }
        });
    }, 100);
}

// ================= MESSAGE EVENT HANDLERS =================
function setupMessageEventListeners() {
    const messages = document.querySelectorAll('.message');
    
    messages.forEach(msg => {
        // Remove existing listeners
        msg.removeEventListener('touchstart', handleTouchStart);
        msg.removeEventListener('touchend', handleTouchEnd);
        msg.removeEventListener('touchmove', handleTouchMove);
        msg.removeEventListener('touchcancel', handleTouchCancel);
        msg.removeEventListener('click', handleMessageClick);
        msg.removeEventListener('dblclick', handleMessageDoubleClick);
        msg.removeEventListener('contextmenu', handleMessageRightClick);
        
        // Add new listeners
        msg.addEventListener('touchstart', handleTouchStart, { passive: true });
        msg.addEventListener('touchend', handleTouchEnd);
        msg.addEventListener('touchmove', handleTouchMove, { passive: false });
        msg.addEventListener('touchcancel', handleTouchCancel);
        msg.addEventListener('click', handleMessageClick);
        msg.addEventListener('dblclick', handleMessageDoubleClick);
        msg.addEventListener('contextmenu', handleMessageRightClick);
    });
}

function handleTouchStart(e) {
    // Don't start if in recording operation
    if (isRecordingOperation) return;
    
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    currentSwipeElement = this;
    
    // Clear any existing long press timer
    if (longPressTimer) clearTimeout(longPressTimer);
    
    // Start long press timer
    longPressTimer = setTimeout(() => {
        handleLongPress(this);
    }, longPressThreshold);
}

function handleTouchMove(e) {
    if (!currentSwipeElement) return;
    
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartX;
    
    // If user starts swiping, cancel long press
    if (Math.abs(diffX) > 20) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }
    
    // Handle swipe to reply (only if not in highlight mode)
    if (highlightedMessages.size === 0 && diffX > 0 && diffX < 150) {
        e.preventDefault();
        currentSwipeElement.style.transform = `translateX(${diffX}px)`;
        
        // Show swipe indicator
        let indicator = document.querySelector('.swipe-reply-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'swipe-reply-indicator';
            indicator.innerHTML = '<i class="fas fa-reply"></i> Reply';
            currentSwipeElement.appendChild(indicator);
        }
        indicator.style.right = `${-diffX - 70}px`;
        indicator.style.opacity = Math.min(diffX / 50, 1);
    }
}

function handleTouchEnd(e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    if (!currentSwipeElement) return;
    
    const diffX = e.changedTouches[0].clientX - touchStartX;
    
    // Handle swipe to reply
    if (highlightedMessages.size === 0 && diffX > swipeThreshold) {
        const messageId = currentSwipeElement.dataset.messageId;
        const senderName = currentSwipeElement.querySelector('small')?.textContent.split('•')[0].trim() || 'User';
        const messageContent = currentSwipeElement.querySelector('.message-content p')?.textContent || '';
        let messageType = 'text';
        
        if (currentSwipeElement.querySelector('img')) messageType = 'image';
        else if (currentSwipeElement.querySelector('video')) messageType = 'video';
        else if (currentSwipeElement.querySelector('audio')) messageType = 'audio';
        
        handleReply(messageId, senderName, messageContent, messageType);
    }
    
    // Reset transform
    currentSwipeElement.style.transform = '';
    
    // Remove swipe indicator
    const indicator = document.querySelector('.swipe-reply-indicator');
    if (indicator) indicator.remove();
    
    currentSwipeElement = null;
    touchStartX = 0;
}

function handleTouchCancel() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    if (currentSwipeElement) {
        currentSwipeElement.style.transform = '';
        const indicator = document.querySelector('.swipe-reply-indicator');
        if (indicator) indicator.remove();
        currentSwipeElement = null;
    }
}

function handleLongPress(messageEl) {
    if (isRecordingOperation) return;
    
    const messageId = messageEl.dataset.messageId;
    
    // On mobile, toggle highlight
    toggleMessageHighlight(messageId);
    
    // Provide haptic feedback if available
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
}

function handleMessageClick(e) {
    // Check for double tap
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;
    
    if (tapLength < doubleTapThreshold && tapLength > 0) {
        // Double tap detected
        handleDoubleTap(this);
        lastTapTime = 0;
    } else {
        lastTapTime = currentTime;
    }
}

function handleMessageDoubleClick(e) {
    e.preventDefault();
    const messageId = this.dataset.messageId;
    toggleMessageHighlight(messageId);
}

function handleMessageRightClick(e) {
    e.preventDefault();
    
    const messageEl = this;
    const messageId = messageEl.dataset.messageId;
    const senderName = messageEl.querySelector('small')?.textContent.split('•')[0].trim() || 'User';
    const messageContent = messageEl.querySelector('.message-content p')?.textContent || '';
    let messageType = 'text';
    
    if (messageEl.querySelector('img')) messageType = 'image';
    else if (messageEl.querySelector('video')) messageType = 'video';
    else if (messageEl.querySelector('audio')) messageType = 'audio';
    
    // Show context menu at mouse position
    showContextMenu(e.pageX, e.pageY, messageId, senderName, messageContent, messageType);
}

// ================= ACTION HANDLERS =================
window.handleReply = function(messageId, senderName, messageContent, messageType) {
    console.log("📝 Handling reply to message:", messageId);
    
    // Clear any highlights
    clearAllHighlights();
    
    // Show reply input - this will set replyingTo and pendingReply
    window.showReplyInput(messageId, senderName, messageContent, messageType);
    
    // Remove context menu
    const contextMenu = document.querySelector('.context-menu');
    if (contextMenu) contextMenu.remove();
};

// Fixed handleDelete function - removed origin prefix
window.handleDelete = async function(messageId) {
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    const senderId = messageEl?.dataset.senderId;
    
    // Check if user can delete
    if (!isAdmin && senderId !== currentUser.id) {
        showNotification("You can only delete your own messages", "error");
        return;
    }
    
    // Simple confirm without any prefix
    const userConfirmed = window.confirm("Delete this message?");
    if (!userConfirmed) return;
    
    try {
        const { error } = await supabase
            .from('chat_messages')
            .delete()
            .eq('id', messageId);
        
        if (error) throw error;
        
        showNotification('✅ Message deleted', 'success');
        
        const contextMenu = document.querySelector('.context-menu');
        if (contextMenu) contextMenu.remove();
        
        await loadGroupMessages();
        
    } catch (err) {
        console.error("Error deleting message:", err);
        showNotification('Error deleting message', 'error');
    }
};

// Fixed handleDeleteSelected function - removed origin prefix
window.handleDeleteSelected = async function() {
    if (highlightedMessages.size === 0) return;
    
    // Simple confirm without any prefix
    const userConfirmed = window.confirm(`Delete ${highlightedMessages.size} message${highlightedMessages.size > 1 ? 's' : ''}?`);
    if (!userConfirmed) return;
    
    let successCount = 0;
    let failCount = 0;
    
    for (const messageId of highlightedMessages) {
        const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
        const senderId = messageEl?.dataset.senderId;
        
        if (!isAdmin && senderId !== currentUser.id) {
            failCount++;
            continue;
        }
        
        try {
            const { error } = await supabase
                .from('chat_messages')
                .delete()
                .eq('id', messageId);
            
            if (error) {
                failCount++;
            } else {
                successCount++;
            }
        } catch (err) {
            failCount++;
        }
    }
    
    if (successCount > 0) {
        showNotification(`✅ Deleted ${successCount} message${successCount > 1 ? 's' : ''}`, 'success');
    }
    if (failCount > 0) {
        showNotification(`❌ Failed to delete ${failCount} message${failCount > 1 ? 's' : ''}`, 'error');
    }
    
    clearAllHighlights();
    await loadGroupMessages();
};

// ================= THEME MANAGEMENT =================
function initTheme() {
    document.body.setAttribute('data-theme', currentTheme);
    updateThemeCheckmark();
}

function setTheme(theme) {
    currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('chatTheme', theme);
    updateThemeCheckmark();
    
    showNotification(`🎨 Theme changed to ${theme.charAt(0).toUpperCase() + theme.slice(1)}`, 'success', 2000);
}

function updateThemeCheckmark() {
    document.querySelectorAll('.theme-option .fa-check').forEach(el => el.remove());
    
    const activeOption = document.querySelector(`.theme-option[data-theme="${currentTheme}"]`);
    if (activeOption) {
        const checkIcon = document.createElement('i');
        checkIcon.className = 'fas fa-check';
        activeOption.appendChild(checkIcon);
    }
}

function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const themeDropdown = document.getElementById('themeDropdown');
    
    if (!themeToggle || !themeDropdown) return;
    
    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        themeDropdown.classList.toggle('show');
    });
    
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const theme = option.dataset.theme;
            setTheme(theme);
            themeDropdown.classList.remove('show');
        });
    });
    
    document.addEventListener('click', () => {
        themeDropdown.classList.remove('show');
    });
}

// ================= NOTIFICATION FUNCTION =================
function showNotification(message, type = 'success', duration = 3000) {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) existingNotification.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, duration);
}

// ================= JUMP TO BOTTOM BUTTON FUNCTIONS =================
function createJumpToBottomButton() {
    const existingBtn = document.getElementById('jumpToBottomBtn');
    if (existingBtn) existingBtn.remove();
    
    const button = document.createElement('button');
    button.id = 'jumpToBottomBtn';
    button.className = 'jump-to-bottom-btn';
    button.innerHTML = '<i class="fas fa-arrow-down"></i>';
    button.title = 'Jump to latest message';
    
    button.addEventListener('click', () => {
        scrollToBottom();
        button.style.display = 'none';
    });
    
    document.body.appendChild(button);
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// ================= SMART SCROLL POSITIONING =================
function findFirstUnreadMessage() {
    const messages = document.querySelectorAll('.message.received');
    for (let msg of messages) {
        const timeSpan = msg.querySelector('.time');
        if (timeSpan && timeSpan.innerHTML.includes(' ✓') && !timeSpan.innerHTML.includes('✓✓')) {
            return msg.dataset.messageId;
        }
    }
    return null;
}

function scrollToFirstUnread() {
    const firstUnreadId = findFirstUnreadMessage();
    if (firstUnreadId) {
        const messageElement = document.querySelector(`.message[data-message-id="${firstUnreadId}"]`);
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageElement.style.backgroundColor = 'rgba(12, 143, 95, 0.2)';
            setTimeout(() => {
                messageElement.style.backgroundColor = '';
            }, 2000);
        }
    } else {
        scrollToBottom();
    }
}

// ================= SIDEBAR SETUP =================
function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const openBtn = document.getElementById('openSidebar');
    const closeBtn = document.getElementById('closeSidebar');
    const overlay = document.getElementById('overlay');
    
    if (!sidebar) return;
    
    openBtn?.addEventListener('click', () => {
        sidebar.classList.add('active');
        overlay?.classList.add('active');
    });
    
    closeBtn?.addEventListener('click', () => {
        sidebar.classList.remove('active');
        overlay?.classList.remove('active');
    });
    
    overlay?.addEventListener('click', () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    });
}

// ================= ONLINE COUNTER =================
async function setupPresenceTracking() {
    try {
        const channel = supabase.channel('online-users', {
            config: { presence: { key: currentUser.id } }
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const presenceState = channel.presenceState();
                onlineUsers.clear();
                
                Object.values(presenceState).forEach(users => {
                    users.forEach(user => {
                        if (user.user_id !== currentUser.id) {
                            onlineUsers.add(user.user_id);
                        }
                    });
                });
                
                updateOnlineCount();
                updateTypingDisplay();
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                newPresences.forEach(p => { 
                    if (p.user_id !== currentUser.id) onlineUsers.add(p.user_id);
                });
                updateOnlineCount();
                updateTypingDisplay();
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                leftPresences.forEach(p => { 
                    if (p.user_id !== currentUser.id) onlineUsers.delete(p.user_id);
                });
                updateOnlineCount();
                updateTypingDisplay();
            });

        await channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({ user_id: currentUser.id, online_at: new Date().toISOString() });
            }
        });

        presenceSubscription = channel;
        setupTypingListener();
        
    } catch (err) {
        console.error("Error setting up presence tracking:", err);
    }
}

// ================= TYPING INDICATOR =================
function setupTypingListener() {
    if (!presenceSubscription) return;
    
    presenceSubscription.on('broadcast', { event: 'typing' }, (payload) => {
        const { userId, typing } = payload.payload;
        
        if (userId === currentUser.id) return;
        
        if (typing) {
            if (!typingUsers.has(userId)) {
                typingUsers.set(userId, setTimeout(() => {
                    typingUsers.delete(userId);
                    updateTypingDisplay();
                }, 3000));
            }
        } else {
            if (typingUsers.has(userId)) {
                clearTimeout(typingUsers.get(userId));
                typingUsers.delete(userId);
            }
        }
        
        updateTypingDisplay();
    });
    
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', () => {
            if (!isTyping) {
                isTyping = true;
                broadcastTypingStatus(true);
            }
            
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                isTyping = false;
                broadcastTypingStatus(false);
            }, 1000);
        });
    }
}

async function broadcastTypingStatus(typing) {
    if (!presenceSubscription) return;
    
    try {
        await presenceSubscription.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId: currentUser.id, typing }
        });
    } catch (err) {
        console.error("Error broadcasting typing status:", err);
    }
}

async function updateTypingDisplay() {
    const typingIndicator = document.getElementById('typingIndicator');
    const typingAvatars = document.getElementById('typingAvatars');
    
    if (!typingIndicator || !typingAvatars) return;
    
    const typingUserIds = Array.from(typingUsers.keys());
    
    if (typingUserIds.length === 0) {
        typingIndicator.classList.add('hidden');
        return;
    }
    
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', typingUserIds);
    
    if (!profiles || profiles.length === 0) {
        typingIndicator.classList.add('hidden');
        return;
    }
    
    typingAvatars.innerHTML = '';
    profiles.slice(0, 3).forEach((profile) => {
        const avatar = document.createElement('div');
        avatar.className = 'typing-avatar';
        avatar.textContent = profile.full_name?.charAt(0).toUpperCase() || '?';
        avatar.title = profile.full_name || 'Someone';
        typingAvatars.appendChild(avatar);
    });
    
    if (profiles.length > 3) {
        const moreAvatar = document.createElement('div');
        moreAvatar.className = 'typing-avatar';
        moreAvatar.textContent = `+${profiles.length - 3}`;
        typingAvatars.appendChild(moreAvatar);
    }
    
    typingIndicator.classList.remove('hidden');
}

// ================= SHOW ONLINE USERS MODAL =================
async function showOnlineUsers() {
    try {
        const onlineUserIds = Array.from(onlineUsers);
        
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, role, state')
            .in('id', onlineUserIds);
        
        if (error) throw error;
        
        const modal = document.createElement('div');
        modal.className = 'online-users-modal';
        
        let usersHtml = '';
        profiles.forEach(user => {
            const crown = user.role === 'admin' ? ' 👑' : '';
            const userState = user.state ? ` • ${user.state}` : '';
            
            usersHtml += `
                <div class="online-user-item">
                    <div class="online-user-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="online-user-info">
                        <h4>${user.full_name || user.email}${crown}</h4>
                        <p><i class="fas fa-circle"></i> Online now${userState}</p>
                    </div>
                    <span class="online-status-dot"></span>
                </div>
            `;
        });
        
        modal.innerHTML = `
            <div class="online-users-content">
                <div class="online-users-header">
                    <h3><i class="fas fa-users"></i> Online Members (${profiles.length})</h3>
                    <button class="close-online-modal"><i class="fas fa-times"></i></button>
                </div>
                <div class="online-users-list">
                    ${usersHtml}
                </div>
                <div class="online-users-footer">
                    <i class="fas fa-globe"></i> Total online: ${profiles.length}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.close-online-modal').onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
    } catch (err) {
        console.error("Error showing online users:", err);
        showNotification('Error loading online users', 'error');
    }
}

function updateOnlineCount() {
    const onlineCountEl = document.getElementById('onlineCount');
    if (onlineCountEl) {
        const count = onlineUsers.size;
        onlineCountEl.innerHTML = `<i class="fas fa-circle" style="font-size: 8px; color: #10b981;"></i> ${count} online`;
        onlineCountEl.style.cursor = 'pointer';
        onlineCountEl.onclick = showOnlineUsers;
    }
}

// ================= MAIN CHAT FUNCTIONS =================
async function loadChatData() {
    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            window.location.href = '../index.html';
            return;
        }
        
        currentUser = user;
        console.log("User logged in:", user.email);
        
        await loadUserProfile(user.id);
        await setupPresenceTracking();
        setupRealtimeSubscription();
        setupChatListeners();
        setupLogoutButtons();
        setupScrollListener();
        setupClickOutsideCancel();
        
    } catch (err) {
        console.error("Chat initialization error:", err);
    }
}

// ================= SETUP CLICK OUTSIDE TO CANCEL REPLY - ULTIMATE FIX =================
function setupClickOutsideCancel() {
    document.addEventListener('click', (e) => {
        // Don't cancel if we have highlights
        if (highlightedMessages.size > 0) return;
        
        // Don't cancel during recording
        if (isRecordingOperation) return;
        
        // Only check if we have an active reply
        if (!replyingTo && !pendingReply) return;
        
        // Get the clicked element
        const clickedElement = e.target;
        
        // Check if click is on ANY interactive element related to replying
        const isReplyElement = 
            clickedElement.closest('.reply-indicator') || // Reply indicator
            clickedElement.closest('#messageInput') || // Text input
            clickedElement.closest('.media-btn') || // Any media button
            clickedElement.closest('#sendBtn') || // Send button
            clickedElement.closest('#voiceBtn') || // Voice button
            clickedElement.closest('#imageBtn') || // Image button
            clickedElement.closest('#videoBtn') || // Video button
            clickedElement.closest('#fileInput') || // File input
            clickedElement.closest('.chat-input-area') || // Entire input area
            clickedElement.closest('.message'); // Any message
        
        // If click is on any reply-related element, DO NOT CANCEL
        if (isReplyElement) {
            console.log("📝 Click on reply-related element - preserving reply");
            return;
        }
        
        // Check if click is on the reply button in context menu
        const isReplyButton = clickedElement.closest('button') && 
                             clickedElement.closest('button').innerHTML.includes('fa-reply');
        
        if (isReplyButton) {
            console.log("📝 Click on reply button - preserving reply");
            return;
        }
        
        // If we get here, it's a click outside - cancel the reply
        console.log("📝 Click outside - cancelling reply");
        cancelReply();
    }, true); // Use capture phase to catch events early
}

// ================= CREATE REPLY INDICATOR WITH ANIMATION - FIXED (NO DUPLICATE ICON) =================
function createReplyIndicator(senderName, messageContent, messageType) {
    const existingIndicator = document.getElementById('replyIndicator');
    if (existingIndicator) existingIndicator.remove();
    
    let previewText = '';
    
    if (messageType === 'text') {
        previewText = messageContent.length > 50 ? messageContent.substring(0, 50) + '...' : messageContent;
    } else if (messageType === 'image') {
        previewText = '📷 Image';
    } else if (messageType === 'video') {
        previewText = '🎥 Video';
    } else if (messageType === 'audio') {
        previewText = '🎵 Voice message';
    }
    
    const indicator = document.createElement('div');
    indicator.id = 'replyIndicator';
    indicator.className = 'reply-indicator';
    indicator.innerHTML = `
        <div class="reply-indicator-content">
            <i class="fas fa-reply reply-indicator-icon"></i>
            <div class="reply-indicator-text">
                <span>Replying to ${senderName}</span>
                <p>${previewText}</p>
            </div>
        </div>
        <button class="reply-indicator-close" id="cancelReplyBtn">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Insert indicator above messages
    const messagesContainer = document.getElementById('messages');
    messagesContainer.parentNode.insertBefore(indicator, messagesContainer);
    
    // Store reply info in both replyingTo and pendingReply for persistence
    if (replyingTo) {
        pendingReply = {
            id: replyingTo.id,
            name: senderName,
            content: messageContent,
            type: messageType
        };
        
        // Also store in sessionStorage for page refresh
        sessionStorage.setItem('replyingTo', JSON.stringify(pendingReply));
        console.log("📝 Reply saved to sessionStorage and pendingReply:", pendingReply);
    }
    
    // Add click handler for cancel button with stopPropagation
    document.getElementById('cancelReplyBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        cancelReply();
    });
    
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.classList.add('replying');
        messageInput.focus();
        
        // Force animation to restart
        messageInput.style.animation = 'none';
        messageInput.offsetHeight; // Trigger reflow
        messageInput.style.animation = 'replyPulse 2s infinite';
    }
}

function cancelReply() {
    console.log("❌ Cancelling reply, clearing pendingReply:", pendingReply);
    const indicator = document.getElementById('replyIndicator');
    if (indicator) indicator.remove();
    
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.classList.remove('replying');
        messageInput.style.animation = 'none';
    }
    
    replyingTo = null;
    pendingReply = null;
    
    // Clear from sessionStorage
    sessionStorage.removeItem('replyingTo');
}

// ================= UPDATE MESSAGE STATUS =================
function updateMessageStatus(messageId, status) {
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    const timeSpan = messageEl.querySelector('.time');
    if (!timeSpan) return;
    
    const existingStatus = timeSpan.querySelector('.message-status');
    if (existingStatus) existingStatus.remove();
    
    const statusSpan = document.createElement('span');
    statusSpan.className = 'message-status';
    
    if (status === 'sent') {
        statusSpan.innerHTML = ' ✓';
        statusSpan.style.color = '#000000';
    } else if (status === 'delivered') {
        statusSpan.innerHTML = ' ✓✓';
        statusSpan.style.color = '#000000';
    } else if (status === 'seen') {
        statusSpan.innerHTML = ' ✓✓';
        statusSpan.style.color = '#3498db';
    }
    
    timeSpan.appendChild(statusSpan);
}

async function loadUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        
        isAdmin = data.role === 'admin';
        console.log("User role:", data.role, "isAdmin:", isAdmin);
        
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = data.full_name || 'Member';
        
        const container = document.getElementById('memberSelectorContainer');
        if (container) {
            if (isAdmin) {
                container.style.display = 'block';
                await loadMembers();
            } else {
                container.style.display = 'none';
            }
        }
        
        await loadGroupMessages();
        
    } catch (err) {
        console.error("Error loading profile:", err);
    }
}

// ================= SEARCHABLE MEMBER DROPDOWN =================
async function loadMembers() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, state')
            .eq('is_approved', true)
            .order('full_name');
        
        if (error) throw error;
        
        allMembers = data || [];
        createSearchableMemberDropdown();
        
    } catch (err) {
        console.error("Error loading members:", err);
    }
}

function createSearchableMemberDropdown() {
    const container = document.getElementById('memberSelectorContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="member-search-container">
            <div class="member-search-input-wrapper">
                <i class="fas fa-search member-search-icon"></i>
                <input type="text" class="member-search-input" id="memberSearchInput" 
                       placeholder="Search members... (type to search)" autocomplete="off">
                <button class="member-search-clear" id="memberSearchClear">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="member-search-results" id="memberSearchResults"></div>
        </div>
    `;
    
    const searchInput = document.getElementById('memberSearchInput');
    const searchResults = document.getElementById('memberSearchResults');
    const clearBtn = document.getElementById('memberSearchClear');
    
    function searchMembers(query) {
        query = query.toLowerCase().trim();
        
        if (!query) {
            searchResults.innerHTML = `
                <div class="member-search-result-item" data-id="">
                    <div class="member-result-avatar"><i class="fas fa-users"></i></div>
                    <div class="member-result-info">
                        <div class="member-result-name">👥 Group Chat</div>
                        <div class="member-result-email">All members</div>
                    </div>
                    <span class="member-result-badge">group</span>
                </div>
                <div class="member-search-footer">Type to search members...</div>
            `;
            return;
        }
        
        const filtered = allMembers.filter(member => 
            (member.full_name && member.full_name.toLowerCase().includes(query)) ||
            (member.email && member.email.toLowerCase().includes(query)) ||
            (member.state && member.state.toLowerCase().includes(query))
        );
        
        if (filtered.length === 0) {
            searchResults.innerHTML = `
                <div class="member-search-result-item" data-id="">
                    <div class="member-result-avatar"><i class="fas fa-users"></i></div>
                    <div class="member-result-info">
                        <div class="member-result-name">👥 Group Chat</div>
                        <div class="member-result-email">All members</div>
                    </div>
                    <span class="member-result-badge">group</span>
                </div>
                <div class="no-results-item">
                    <i class="fas fa-user-slash"></i> No members found matching "${query}"
                </div>
            `;
            return;
        }
        
        let resultsHtml = `
            <div class="member-search-result-item" data-id="">
                <div class="member-result-avatar"><i class="fas fa-users"></i></div>
                <div class="member-result-info">
                    <div class="member-result-name">👥 Group Chat</div>
                    <div class="member-result-email">All members</div>
                </div>
                <span class="member-result-badge">group</span>
            </div>
        `;
        
        filtered.forEach(member => {
            resultsHtml += `
                <div class="member-search-result-item" data-id="${member.id}">
                    <div class="member-result-avatar"><i class="fas fa-user"></i></div>
                    <div class="member-result-info">
                        <div class="member-result-name">${member.full_name || 'Unnamed'}</div>
                        <div class="member-result-email">${member.email}</div>
                    </div>
                    ${member.state ? `<span class="member-result-badge">${member.state}</span>` : ''}
                </div>
            `;
        });
        
        resultsHtml += `<div class="member-search-footer">Found ${filtered.length} member${filtered.length !== 1 ? 's' : ''}</div>`;
        searchResults.innerHTML = resultsHtml;
    }
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        searchMembers(query);
        searchResults.classList.add('show');
        
        if (query.length > 0) {
            clearBtn.classList.add('visible');
        } else {
            clearBtn.classList.remove('visible');
        }
    });
    
    searchInput.addEventListener('focus', () => {
        searchMembers(searchInput.value);
        searchResults.classList.add('show');
    });
    
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            searchResults.classList.remove('show');
        }
    });
    
    searchResults.addEventListener('click', (e) => {
        const resultItem = e.target.closest('.member-search-result-item');
        if (!resultItem) return;
        
        const memberId = resultItem.dataset.id;
        const memberName = resultItem.querySelector('.member-result-name')?.textContent || '';
        
        if (memberId === '') {
            selectedMemberId = null;
            currentChatPartner = null;
            searchInput.value = '';
            searchInput.placeholder = '👥 Group Chat (All Members)';
        } else {
            selectedMemberId = memberId;
            currentChatPartner = memberId;
            searchInput.value = memberName.replace('👥 ', '').replace('👤 ', '');
            searchInput.placeholder = `💬 Chatting with ${memberName}`;
        }
        
        searchResults.classList.remove('show');
        clearBtn.classList.remove('visible');
        
        loadGroupMessages();
    });
    
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.placeholder = 'Search members... (type to search)';
        selectedMemberId = null;
        currentChatPartner = null;
        clearBtn.classList.remove('visible');
        searchMembers('');
        searchResults.classList.add('show');
        
        loadGroupMessages();
    });
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const firstResult = searchResults.querySelector('.member-search-result-item');
            if (firstResult) {
                firstResult.click();
            }
        }
    });
    
    searchMembers('');
}

// ================= GET MESSAGE PREVIEW =================
function getMessagePreview(msg) {
    if (!msg) return '';
    
    if (msg.message_type === 'text') {
        return msg.content && msg.content.length > 50 
            ? msg.content.substring(0, 50) + '...' 
            : (msg.content || 'Empty message');
    } else if (msg.message_type === 'image') {
        return '📷 Image';
    } else if (msg.message_type === 'video') {
        return '🎥 Video';
    } else if (msg.message_type === 'audio') {
        return '🎵 Voice message';
    }
    return '💬 Message';
}

// ================= LOAD MESSAGES WITH PROPER PARENT SENDER INFO =================
async function loadGroupMessages() {
    try {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>`;
        
        let query;
        
        if (isAdmin && currentChatPartner) {
            // Admin viewing private chat with specific member
            console.log("📨 Loading private messages between admin and member:", currentChatPartner);
            query = supabase
                .from('chat_messages')
                .select(`
                    *,
                    sender:sender_id(id, full_name, email, role),
                    parent:parent_id(
                        id,
                        content,
                        message_type,
                        file_url,
                        created_at,
                        sender:sender_id(id, full_name, email, role)
                    )
                `)
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatPartner}),and(sender_id.eq.${currentChatPartner},receiver_id.eq.${currentUser.id})`)
                .order('created_at', { ascending: true });
        } else if (!isAdmin) {
            // Regular member - show group messages AND their private messages
            console.log("📨 Loading messages for regular member");
            query = supabase
                .from('chat_messages')
                .select(`
                    *,
                    sender:sender_id(id, full_name, email, role),
                    parent:parent_id(
                        id,
                        content,
                        message_type,
                        file_url,
                        created_at,
                        sender:sender_id(id, full_name, email, role)
                    )
                `)
                .or(`receiver_id.is.null,and(sender_id.eq.${currentUser.id}),and(receiver_id.eq.${currentUser.id})`)
                .order('created_at', { ascending: true });
        } else {
            // Admin viewing group chat (default)
            console.log("📨 Loading group messages for admin");
            query = supabase
                .from('chat_messages')
                .select(`
                    *,
                    sender:sender_id(id, full_name, email, role),
                    parent:parent_id(
                        id,
                        content,
                        message_type,
                        file_url,
                        created_at,
                        sender:sender_id(id, full_name, email, role)
                    )
                `)
                .is('receiver_id', null)
                .order('created_at', { ascending: true });
        }
        
        const { data: messages, error } = await query;
        
        if (error) {
            console.error("Error loading messages:", error);
            throw error;
        }
        
        console.log("📨 Messages loaded:", messages);
        
        if (!messages || messages.length === 0) {
            if (isAdmin && currentChatPartner) {
                const member = allMembers.find(m => m.id === currentChatPartner);
                messagesContainer.innerHTML = `<div class="empty-chat"><i class="fas fa-comments"></i><h3>No messages yet</h3><p>Start a private conversation with ${member?.full_name || 'this member'}!</p></div>`;
            } else {
                messagesContainer.innerHTML = `<div class="empty-chat"><i class="fas fa-comments"></i><h3>No messages yet</h3><p>Be the first to send a message!</p></div>`;
            }
            return;
        }
        
        renderMessages(messages);
        
        // Load reactions after messages are rendered
        await loadReactions();
        
        // Smart scroll positioning after messages load
        setTimeout(() => {
            const firstUnreadId = findFirstUnreadMessage();
            if (firstUnreadId) {
                scrollToFirstUnread();
            } else {
                scrollToBottom();
            }
        }, 500);
        
        // Mark messages as read after loading
        setTimeout(() => {
            markAllVisibleMessagesAsRead();
        }, 1000);
        
    } catch (err) {
        console.error("Error loading messages:", err);
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `<div class="empty-chat"><i class="fas fa-exclamation-triangle"></i><h3>Error loading messages</h3><p>Please refresh the page</p></div>`;
        }
    }
}

// ================= MARK MESSAGES AS READ =================
function setupScrollListener() {
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return;
    
    messagesContainer.addEventListener('scroll', () => {
        if (messageReadTimer) clearTimeout(messageReadTimer);
        messageReadTimer = setTimeout(markAllVisibleMessagesAsRead, 500);
        
        const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        const jumpBtn = document.getElementById('jumpToBottomBtn');
        
        if (jumpBtn) {
            if (!isNearBottom) {
                jumpBtn.style.display = 'flex';
            } else {
                jumpBtn.style.display = 'none';
            }
        }
    });
}

async function markAllVisibleMessagesAsRead() {
    const messageElements = document.querySelectorAll('.message');
    if (messageElements.length === 0) return;
    
    const unreadMessageIds = [];
    
    messageElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        
        if (isVisible) {
            const messageId = el.dataset.messageId;
            const timeSpan = el.querySelector('.time');
            
            if (el.classList.contains('received')) {
                if (timeSpan && !timeSpan.innerHTML.includes('✓✓')) {
                    unreadMessageIds.push(messageId);
                }
            }
        }
    });
    
    if (unreadMessageIds.length === 0) return;
    
    const { error } = await supabase
        .from('chat_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadMessageIds)
        .is('read_at', null);
    
    if (!error) {
        unreadMessageIds.forEach(id => {
            const msgEl = document.querySelector(`.message[data-message-id="${id}"]`);
            if (msgEl && msgEl.classList.contains('received')) {
                const timeSpan = msgEl.querySelector('.time');
                if (timeSpan && !timeSpan.innerHTML.includes('✓✓')) {
                    timeSpan.innerHTML = timeSpan.innerHTML.replace('✓', '✓✓');
                }
                updateMessageStatus(id, 'delivered');
            }
        });
    }
}

// ================= SCROLL TO MESSAGE =================
window.scrollToMessage = function(messageId) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.style.backgroundColor = 'rgba(12, 143, 95, 0.3)';
        setTimeout(() => {
            messageElement.style.backgroundColor = '';
        }, 2000);
    }
};

// ================= SHOW REPLY INPUT =================
window.showReplyInput = function(parentId, senderName, messageContent, messageType) {
    console.log("📝 Show reply input for message:", parentId);
    
    // Cancel any existing reply first
    if (replyingTo || pendingReply) {
        cancelReply();
    }
    
    // Set both replyingTo and pendingReply
    replyingTo = { id: parentId, name: senderName };
    pendingReply = { id: parentId, name: senderName, content: messageContent, type: messageType };
    
    console.log("📝 Set pendingReply:", pendingReply);
    
    createReplyIndicator(senderName, messageContent, messageType);
};

// ================= RENDER MESSAGES =================
function renderMessages(messages) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    let html = '';
    let lastDate = '';
    
    messages.forEach(msg => {
        const isSent = msg.sender_id === currentUser.id;
        const isGroup = !msg.receiver_id;
        const isPrivate = msg.receiver_id && (msg.receiver_id === currentUser.id || msg.sender_id === currentUser.id);
        
        const date = new Date(msg.created_at);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        let dateStr;
        if (date.toDateString() === today.toDateString()) dateStr = 'Today';
        else if (date.toDateString() === yesterday.toDateString()) dateStr = 'Yesterday';
        else dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        if (lastDate !== dateStr) {
            html += `<div class="date-separator"><span>${dateStr}</span></div>`;
            lastDate = dateStr;
        }
        
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const senderName = msg.sender?.full_name || msg.sender?.email || 'Unknown';
        const isAdminSender = msg.sender?.role === 'admin';
        const crown = isAdminSender ? ' 👑' : '';
        
        let messageTypeLabel = '';
        if (isGroup) messageTypeLabel = 'Group';
        else if (isPrivate) messageTypeLabel = 'Private';
        
        const isRead = msg.read_at !== null;
        let status = 'sent';
        if (msg.read_at) {
            status = 'seen';
        }
        
        // Status indicator
        let statusIndicator = '';
        if (isSent) {
            if (status === 'seen') {
                statusIndicator = '<span class="message-status" style="color: #3498db;"> ✓✓</span>';
            } else {
                statusIndicator = '<span class="message-status" style="color: #000000;"> ✓</span>';
            }
        }
        
        // FOR SENT MESSAGES
        if (isSent) {
            html += `
                <div class="message sent" data-message-id="${msg.id}" data-sender="${senderName}" data-sender-id="${msg.sender_id}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <small style="font-weight: bold;">You ${messageTypeLabel ? '• ' + messageTypeLabel : ''}</small>
                    </div>
                    
                    ${renderQuotedMessage(msg.parent)}
                    
                    <div class="message-content-wrapper">
                        <div class="message-content">${renderMessageContent(msg)}</div>
                    </div>
                    
                    <span class="time">${timeStr}${statusIndicator}</span>
                </div>
            `;
        } 
        // FOR RECEIVED MESSAGES
        else {
            html += `
                <div class="message received" data-message-id="${msg.id}" data-sender="${senderName}" data-sender-id="${msg.sender_id}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <small style="font-weight: bold;">${senderName}${crown} ${messageTypeLabel ? '• ' + messageTypeLabel : ''}</small>
                    </div>
                    
                    ${renderQuotedMessage(msg.parent)}
                    
                    <div class="message-content-wrapper">
                        <div class="message-content">${renderMessageContent(msg)}</div>
                    </div>
                    
                    <span class="time">${timeStr}</span>
                </div>
            `;
        }
    });
    
    container.innerHTML = html;
    
    // Re-render reactions after messages are loaded
    messageReactions.forEach((reactions, messageId) => {
        updateMessageReactions(messageId);
    });
    
    // Setup message event listeners
    setTimeout(() => {
        setupMessageEventListeners();
    }, 100);
}

// ================= RENDER QUOTED MESSAGE WITH PROPER SENDER NAME =================
function renderQuotedMessage(parentMsg) {
    if (!parentMsg) return '';
    
    console.log("📝 Rendering quoted message:", parentMsg);
    
    // Get sender name from the parent message's sender object
    const senderName = parentMsg.sender?.full_name || parentMsg.sender?.email || 'Unknown';
    let contentPreview = getMessagePreview(parentMsg);
    
    return `
        <div class="quoted-message" onclick="window.scrollToMessage('${parentMsg.id}')" style="cursor: pointer;">
            <div class="quoted-sender">${senderName}</div>
            <div class="quoted-content">${contentPreview}</div>
        </div>
    `;
}

// ================= FIXED RENDER MESSAGE CONTENT WITH SAFE URLS =================
function renderMessageContent(msg) {
    if (msg.message_type === 'text') return `<p>${msg.content || ''}</p>`;
    
    if (msg.message_type === 'image') {
        const imageUrl = safeUrl(msg.file_url);
        if (!imageUrl) return '<p>Image not available</p>';
        return `<img src="${imageUrl}" alt="Image" onclick="window.open('${imageUrl}')" style="max-width: 100%; cursor: pointer;">`;
    }
    
    if (msg.message_type === 'video') {
        const videoUrl = safeUrl(msg.file_url);
        if (!videoUrl) return '<p>Video not available</p>';
        return `<video controls style="max-width: 100%;"><source src="${videoUrl}"></video>`;
    }
    
    if (msg.message_type === 'audio') {
        const audioUrl = safeUrl(msg.file_url);
        if (!audioUrl) return '<p>Audio not available</p>';
        return `<audio controls src="${audioUrl}" style="width: 280px; height: 40px;"></audio>`;
    }
    
    return '<p>Unsupported message type</p>';
}

function setupRealtimeSubscription() {
    if (messagesSubscription) messagesSubscription.unsubscribe();
    
    messagesSubscription = supabase
        .channel('chat_messages_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
            handleNewMessage(payload.new);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
            if (payload.new.read_at && !payload.old.read_at) {
                updateMessageStatus(payload.new.id, 'seen');
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (payload) => {
            console.log("Message deleted, refreshing...");
            loadGroupMessages();
        })
        .subscribe();
}

async function handleNewMessage(newMessage) {
    const isRelevant = 
        (!newMessage.receiver_id && !currentChatPartner) ||
        (newMessage.receiver_id === currentUser.id && newMessage.sender_id === currentChatPartner) ||
        (newMessage.sender_id === currentUser.id && newMessage.receiver_id === currentChatPartner) ||
        (!isAdmin && (newMessage.receiver_id === currentUser.id || !newMessage.receiver_id));
    
    if (isRelevant) {
        loadGroupMessages();
    }
}

// ================= CHAT LISTENERS =================
function setupChatListeners() {
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    const imageBtn = document.getElementById('imageBtn');
    const videoBtn = document.getElementById('videoBtn');
    const voiceBtn = document.getElementById('voiceBtn');
    const fileInput = document.getElementById('fileInput');
    
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    if (imageBtn && fileInput) {
        imageBtn.addEventListener('click', () => {
            fileInput.accept = 'image/*';
            fileInput.click();
        });
    }
    
    if (videoBtn && fileInput) {
        videoBtn.addEventListener('click', () => {
            fileInput.accept = 'video/*';
            fileInput.click();
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    if (voiceBtn) {
        voiceBtn.addEventListener('click', toggleVoiceRecording);
    }
}

// ================= VOICE RECORDING =================
async function toggleVoiceRecording() {
    const voiceBtn = document.getElementById('voiceBtn');
    const timerDiv = document.getElementById('recordingTimer');
    
    if (!mediaRecorder) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            recordedAudio = null;
            recordedAudioUrl = null;
            
            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };
            
            const stopHandler = () => {
                isRecordingOperation = true;
                
                if (audioChunks.length === 0) {
                    stream.getTracks().forEach(track => track.stop());
                    mediaRecorder = null;
                    setTimeout(() => {
                        isRecordingOperation = false;
                    }, 500);
                    return;
                }
                
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                recordedAudio = audioBlob;
                recordedAudioUrl = URL.createObjectURL(audioBlob);
                showAudioPreview(recordedAudioUrl);
                stream.getTracks().forEach(track => track.stop());
                mediaRecorder = null;
                
                setTimeout(() => {
                    isRecordingOperation = false;
                }, 1000);
            };
            
            mediaRecorder.onstop = stopHandler;
            
            mediaRecorder.start();
            voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
            voiceBtn.style.backgroundColor = '#dc2626';
            
            recordingSeconds = 0;
            timerDiv.style.display = 'block';
            timerDiv.innerHTML = '🔴 Recording: 0s';
            
            recordingTimer = setInterval(() => {
                recordingSeconds++;
                timerDiv.innerHTML = `🔴 Recording: ${recordingSeconds}s`;
            }, 1000);
            
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Couldn't access microphone. Please check permissions.");
        }
    } else {
        isRecordingOperation = true;
        mediaRecorder.stop();
        clearInterval(recordingTimer);
        recordingSeconds = 0;
        timerDiv.style.display = 'none';
        voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        voiceBtn.style.backgroundColor = '';
    }
}

function showAudioPreview(audioUrl) {
    const existingPreview = document.getElementById('audioPreview');
    if (existingPreview) existingPreview.remove();
    
    const chatInput = document.querySelector('.chat-input-area');
    const previewDiv = document.createElement('div');
    previewDiv.id = 'audioPreview';
    previewDiv.style.cssText = `display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--card-bg); border-radius: 8px; margin-bottom: 10px; width: 100%; flex-wrap: wrap;`;
    
    previewDiv.innerHTML = `
        <audio controls src="${audioUrl}" style="flex: 1; height: 40px; min-width: 200px;"></audio>
        <div style="display: flex; gap: 5px;">
            <button id="deletePreviewBtn" class="media-btn" style="background: var(--danger);"><i class="fas fa-trash"></i></button>
            <button id="sendPreviewBtn" class="media-btn" style="background: var(--primary-color);"><i class="fas fa-paper-plane"></i></button>
        </div>
    `;
    
    chatInput.parentNode.insertBefore(previewDiv, chatInput);
    
    document.getElementById('deletePreviewBtn').addEventListener('click', () => {
        if (recordedAudioUrl) {
            URL.revokeObjectURL(recordedAudioUrl);
            recordedAudio = null;
            recordedAudioUrl = null;
        }
        previewDiv.remove();
    });
    
    document.getElementById('sendPreviewBtn').addEventListener('click', async () => {
        if (recordedAudio) {
            currentFile = new File([recordedAudio], 'voice-message.webm', { type: 'audio/webm' });
            currentFileType = 'audio';
            previewDiv.remove();
            await sendMessage();
        }
    });
}

// ================= FILE HANDLING =================
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 50 * 1024 * 1024) {
        alert("File too large. Maximum size is 50MB.");
        return;
    }
    
    recordedAudio = null;
    if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        recordedAudioUrl = null;
    }
    
    currentFile = file;
    
    if (file.type.startsWith('image/')) {
        currentFileType = 'image';
        showImagePreview(file);
    } else if (file.type.startsWith('video/')) {
        currentFileType = 'video';
        showVideoPreview(file);
    } else {
        alert("File type not supported. Please select an image or video.");
        currentFile = null;
    }
}

function showImagePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const existingPreview = document.getElementById('mediaPreview');
        if (existingPreview) existingPreview.remove();
        
        const chatInput = document.querySelector('.chat-input-area');
        const previewDiv = document.createElement('div');
        previewDiv.id = 'mediaPreview';
        previewDiv.style.cssText = `display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--card-bg); border-radius: 8px; margin-bottom: 10px; width: 100%; flex-wrap: wrap;`;
        
        previewDiv.innerHTML = `
            <img src="${e.target.result}" style="max-width: 80px; max-height: 80px; border-radius: 4px; object-fit: cover;">
            <span style="flex: 1; color: var(--text-light); font-size: 14px; word-break: break-word;">${file.name}</span>
            <div style="display: flex; gap: 5px;">
                <button id="deletePreviewBtn" class="media-btn" style="background: var(--danger);"><i class="fas fa-trash"></i></button>
                <button id="sendPreviewBtn" class="media-btn" style="background: var(--primary-color);"><i class="fas fa-paper-plane"></i></button>
            </div>
        `;
        
        chatInput.parentNode.insertBefore(previewDiv, chatInput);
        
        document.getElementById('deletePreviewBtn').addEventListener('click', () => {
            currentFile = null;
            previewDiv.remove();
        });
        
        document.getElementById('sendPreviewBtn').addEventListener('click', async () => {
            previewDiv.remove();
            await sendMessage();
        });
    };
    reader.readAsDataURL(file);
}

function showVideoPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const existingPreview = document.getElementById('mediaPreview');
        if (existingPreview) existingPreview.remove();
        
        const chatInput = document.querySelector('.chat-input-area');
        const previewDiv = document.createElement('div');
        previewDiv.id = 'mediaPreview';
        previewDiv.style.cssText = `display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--card-bg); border-radius: 8px; margin-bottom: 10px; width: 100%; flex-wrap: wrap;`;
        
        previewDiv.innerHTML = `
            <video src="${e.target.result}" style="max-width: 80px; max-height: 80px; border-radius: 4px;" controls></video>
            <span style="flex: 1; color: var(--text-light); font-size: 14px; word-break: break-word;">${file.name}</span>
            <div style="display: flex; gap: 5px;">
                <button id="deletePreviewBtn" class="media-btn" style="background: var(--danger);"><i class="fas fa-trash"></i></button>
                <button id="sendPreviewBtn" class="media-btn" style="background: var(--primary-color);"><i class="fas fa-paper-plane"></i></button>
            </div>
        `;
        
        chatInput.parentNode.insertBefore(previewDiv, chatInput);
        
        document.getElementById('deletePreviewBtn').addEventListener('click', () => {
            currentFile = null;
            previewDiv.remove();
        });
        
        document.getElementById('sendPreviewBtn').addEventListener('click', async () => {
            previewDiv.remove();
            await sendMessage();
        });
    };
    reader.readAsDataURL(file);
}

// ================= UPLOAD FILE FUNCTION =================
async function uploadFile(file) {
    try {
        if (!file) throw new Error("No file to upload");
        
        const fileName = file.name || 'voice-message.webm';
        const fileExt = fileName.split('.').pop() || 'webm';
        const uniqueFileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
        const filePath = `chat/${uniqueFileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('chat-files')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || 'audio/webm'
            });
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
            .from('chat-files')
            .getPublicUrl(filePath);
        
        return publicUrl;
        
    } catch (err) {
        console.error("Error uploading file:", err);
        throw new Error(err.message || "Failed to upload file");
    }
}

// ================= SEND MESSAGE (WITH PROPER REPLY HANDLING) - FINAL FIX =================
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message && !currentFile && !recordedAudio) {
        alert("Please enter a message or select a file");
        return;
    }
    
    const sendBtn = document.getElementById('sendBtn');
    const originalText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    
    // Get reply data from pendingReply (most reliable source)
    const replyToSend = pendingReply ? { ...pendingReply } : null;
    
    console.log("📝 Final reply being sent:", replyToSend);
    
    try {
        let messageData = {
            sender_id: currentUser.id,
            message_type: 'text',
            content: message || '',
            created_at: new Date().toISOString(),
            read_at: null
        };
        
        // Add parent_id if replying
        if (replyToSend && replyToSend.id) {
            messageData.parent_id = replyToSend.id;
            console.log("📝 Adding reply to message ID:", replyToSend.id);
        }
        
        if (isAdmin && selectedMemberId) {
            messageData.receiver_id = selectedMemberId;
            console.log("Sending PRIVATE message to member:", selectedMemberId);
        } else {
            messageData.receiver_id = null;
            console.log("Sending GROUP message");
        }
        
        if (currentFile && !recordedAudio) {
            try {
                console.log("Processing file upload...");
                const fileUrl = await uploadFile(currentFile);
                messageData.message_type = currentFileType;
                messageData.content = '';
                messageData.file_url = fileUrl;
                currentFile = null;
                console.log("File upload complete, URL:", fileUrl);
            } catch (uploadErr) {
                console.error("File upload failed:", uploadErr);
                alert("Failed to upload file: " + uploadErr.message);
                sendBtn.disabled = false;
                sendBtn.innerHTML = originalText;
                return;
            }
        }
        
        if (recordedAudio) {
            try {
                console.log("Processing audio upload...");
                const fileUrl = await uploadFile(recordedAudio);
                messageData.message_type = 'audio';
                messageData.content = '';
                messageData.file_url = fileUrl;
                
                if (recordedAudioUrl) {
                    URL.revokeObjectURL(recordedAudioUrl);
                }
                recordedAudio = null;
                recordedAudioUrl = null;
                
                console.log("Audio upload complete, URL:", fileUrl);
            } catch (uploadErr) {
                console.error("Audio upload failed:", uploadErr);
                alert("Failed to upload audio: " + uploadErr.message);
                sendBtn.disabled = false;
                sendBtn.innerHTML = originalText;
                return;
            }
        }
        
        console.log("Sending message to database:", messageData);
        
        const { error } = await supabase
            .from('chat_messages')
            .insert([messageData]);
        
        if (error) {
            console.error("Database insert error:", error);
            alert("Failed to send message: " + (error.message || "Unknown error"));
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalText;
            return;
        }
        
        console.log("✅ Message sent successfully! Reply to:", replyToSend?.id);
        messageInput.value = '';
        
        // Clear reply indicator after sending
        if (replyToSend) {
            cancelReply();
        }
        
        // Clear any previews
        const mediaPreview = document.getElementById('mediaPreview');
        if (mediaPreview) mediaPreview.remove();
        
        const audioPreview = document.getElementById('audioPreview');
        if (audioPreview) audioPreview.remove();
        
        // Show success notification
        showNotification('✅ Message sent', 'success', 2000);
        
    } catch (err) {
        console.error("Error sending message:", err);
        alert("Failed to send message: " + (err.message || "Unknown error"));
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
}

// ================= LOGOUT =================
function setupLogoutButtons() {
    const logoutBtns = document.querySelectorAll('#logoutBtn, .logout-btn-sidebar');
    
    logoutBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', async () => {
                if (presenceSubscription) {
                    await presenceSubscription.untrack();
                    await presenceSubscription.unsubscribe();
                }
                await supabase.auth.signOut();
                window.location.href = '../index.html';
            });
        }
    });
}

// Add date separator styles
const style = document.createElement('style');
style.textContent = `
    .date-separator {
        text-align: center;
        margin: 20px 0 10px;
    }
    .date-separator span {
        background: var(--card-bg, #12332b);
        padding: 5px 15px;
        border-radius: 20px;
        font-size: 12px;
        color: var(--text-muted, #9ca3af);
    }
`;
document.head.appendChild(style);