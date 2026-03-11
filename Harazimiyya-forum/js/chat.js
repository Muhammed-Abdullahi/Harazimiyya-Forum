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
let typingUsers = new Map();
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
let pendingReply = null;
let touchStartX = 0;
let touchCurrentX = 0;
let currentSwipeElement = null;
let swipeThreshold = 80;
let allMembers = [];
let typingTimeout = null;
let isTyping = false;

// Context menu and highlighting variables
let highlightedMessages = new Set();
let contextMenuActive = false;
let longPressTimer = null;
let longPressThreshold = 500;
let lastTapTime = 0;
let doubleTapThreshold = 300;

// Message reactions storage
let messageReactions = new Map();

// Recording operation flag
let isRecordingOperation = false;

// Smart scroll variables
let showJumpToBottom = false;
let hasUnreadMessages = false;
let firstUnreadMessageId = null;

// Theme variables
const themes = ['dark', 'light', 'sepia', 'forest'];
let currentTheme = localStorage.getItem('chatTheme') || 'dark';

// ===== NEW: Detect if device is mobile/touch device =====
let isTouchDevice = false;

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded, initializing chat...");
    
    // Detect if this is a touch device (mobile/tablet)
    isTouchDevice = ('ontouchstart' in window) || 
                    (navigator.maxTouchPoints > 0) || 
                    (navigator.msMaxTouchPoints > 0);
    
    console.log("📱 Touch device detected:", isTouchDevice);
    
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
        setTimeout(function() {
            loadReactions();
        }, 2000);
        
        // Check for pending reply
        setTimeout(function() {
            checkPendingReply();
        }, 3000);
        
        // Create jump to bottom button on page load
        setTimeout(function() {
            createJumpToBottomButton();
        }, 1000);
        
        // Setup click outside to clear highlights
        setupClickOutsideHandler();
        
        // Setup reaction touch handlers for mobile
        setTimeout(function() {
            setupReactionTouchHandlers();
        }, 3000);
    }
    
    initializeChat();
});

// ================= REACTION TOUCH HANDLER FOR MOBILE =================
function setupReactionTouchHandlers() {
    document.addEventListener('touchstart', function(e) {
        // Check if touching a reaction
        var reaction = e.target.closest('.reaction');
        if (!reaction) {
            // If touching outside reaction, hide any open tooltip/modal
            hideReactionTooltip();
            var existingModal = document.querySelector('.online-users-modal');
            if (existingModal) existingModal.remove();
            return;
        }
        
        // Prevent default to avoid double events
        e.preventDefault();
        
        // Get reaction data
        var messageId = reaction.dataset.messageId;
        var reactionType = reaction.dataset.reactionType;
        
        // Show who reacted
        showReactionUsers(messageId, reactionType);
    }, { passive: false });
}

// ================= LOAD REACTIONS FROM DATABASE =================
async function loadReactions() {
    try {
        console.log("🔄 Loading reactions from database...");
        
        var { data: reactions, error } = await supabase
            .from('message_reactions')
            .select('*');
        
        if (error) {
            console.error("❌ Error loading reactions:", error);
            
            // Check if table exists
            if (error.code === '42P01') {
                console.warn("⚠️ message_reactions table doesn't exist. Please create it in Supabase.");
                showNotification("Please create the message_reactions table in Supabase", "error", 5000);
            }
            return;
        }
        
        // Clear existing reactions
        messageReactions.clear();
        
        // Organize reactions by message
        reactions.forEach(function(reaction) {
            if (!messageReactions.has(reaction.message_id)) {
                messageReactions.set(reaction.message_id, { likes: [], loves: [] });
            }
            
            var msgReactions = messageReactions.get(reaction.message_id);
            if (reaction.reaction_type === 'like') {
                msgReactions.likes.push(reaction.user_id);
            } else if (reaction.reaction_type === 'love') {
                msgReactions.loves.push(reaction.user_id);
            }
        });
        
        console.log("✅ Reactions loaded from database:", messageReactions);
        
        // Update all message displays
        messageReactions.forEach(function(_, messageId) {
            updateMessageReactions(messageId);
        });
        
    } catch (err) {
        console.error("❌ Error in loadReactions:", err);
    }
}

// ================= CHECK PENDING REPLY =================
function checkPendingReply() {
    var pendingReplyData = sessionStorage.getItem('replyingTo');
    if (pendingReplyData) {
        try {
            var replyData = JSON.parse(pendingReplyData);
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
    document.addEventListener('click', function(e) {
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
    var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
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
    highlightedMessages.forEach(function(messageId) {
        var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
        if (messageEl) {
            messageEl.classList.remove('highlighted');
        }
    });
    
    highlightedMessages.clear();
    
    // Remove action bar
    var actionBar = document.querySelector('.action-bar');
    if (actionBar) actionBar.remove();
    
    // Remove context menu
    var contextMenu = document.querySelector('.context-menu');
    if (contextMenu) contextMenu.remove();
}

function updateActionBar() {
    var count = highlightedMessages.size;
    
    if (count === 0) {
        // Remove action bar if no highlights
        var actionBar = document.querySelector('.action-bar');
        if (actionBar) actionBar.remove();
        return;
    }
    
    // Check if we're on mobile or desktop
    var isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        // Show mobile action bar
        showMobileActionBar(count);
    }
}

function showMobileActionBar(count) {
    // Remove existing action bar
    var existingBar = document.querySelector('.action-bar');
    if (existingBar) existingBar.remove();
    
    var actionBar = document.createElement('div');
    actionBar.className = 'action-bar';
    
    // Check if any selected message has reactions
    var hasLikes = checkIfAnyHasReaction('like');
    var hasLoves = checkIfAnyHasReaction('love');
    
    actionBar.innerHTML = '\
        <div class="selection-counter">' + count + '</div>\
        <button class="like-btn ' + (hasLikes ? 'active' : '') + '" onclick="handleBulkReaction(\'like\')" title="Like">\
            <i class="fas fa-thumbs-up"></i>\
            <span>Like</span>\
        </button>\
        <button class="love-btn ' + (hasLoves ? 'active' : '') + '" onclick="handleBulkReaction(\'love\')" title="Love">\
            <i class="fas fa-heart"></i>\
            <span>Love</span>\
        </button>\
        <button class="delete-btn" onclick="handleDeleteSelected()" title="Delete">\
            <i class="fas fa-trash"></i>\
            <span>Delete</span>\
        </button>\
    ';
    
    document.body.appendChild(actionBar);
}

// ================= REACTION FUNCTIONS =================
async function toggleReaction(messageId, reactionType) {
    console.log("🔄 Toggling " + reactionType + " for message:", messageId);
    
    var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
    if (!messageEl) {
        console.error("❌ Message element not found");
        return;
    }
    
    // Show loading state
    var reactionBtn = document.querySelector('.reaction.' + reactionType + '-reaction[data-message-id="' + messageId + '"]');
    if (reactionBtn) reactionBtn.classList.add('loading');
    
    try {
        // Initialize reactions for this message if not exists
        if (!messageReactions.has(messageId)) {
            messageReactions.set(messageId, { likes: [], loves: [] });
        }
        
        var reactions = messageReactions.get(messageId);
        var userReactionArray = reactionType === 'like' ? reactions.likes : reactions.loves;
        var otherReactionArray = reactionType === 'like' ? reactions.loves : reactions.likes;
        
        // Check if user already reacted with this type
        var userIndex = userReactionArray.indexOf(currentUser.id);
        var hasReaction = userIndex !== -1;
        
        if (hasReaction) {
            // Remove reaction from database
            console.log("🗑️ Removing " + reactionType + " reaction");
            var { error } = await supabase
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
            console.log("✅ " + reactionType + " reaction removed");
            
        } else {
            // Check if user has the other reaction type and remove it first
            var otherIndex = otherReactionArray.indexOf(currentUser.id);
            if (otherIndex !== -1) {
                // Remove other reaction from database
                var otherType = reactionType === 'like' ? 'love' : 'like';
                console.log("🔄 Removing conflicting " + otherType + " reaction");
                
                var { error: otherError } = await supabase
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
            console.log("➕ Adding " + reactionType + " reaction");
            var { error } = await supabase
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
            console.log("✅ " + reactionType + " reaction added");
        }
        
        // Update message display
        updateMessageReactions(messageId);
        
        // Show notification
        if (hasReaction) {
            showNotification('Removed ' + (reactionType === 'like' ? '👍' : '❤️') + ' reaction', 'success', 1500);
        } else {
            showNotification('Added ' + (reactionType === 'like' ? '👍' : '❤️') + ' reaction', 'success', 1500);
        }
        
    } catch (err) {
        console.error("❌ Error toggling " + reactionType + ":", err);
        showNotification('Failed to update reaction. Check console for details.', 'error');
    } finally {
        if (reactionBtn) reactionBtn.classList.remove('loading');
    }
}

function updateMessageReactions(messageId) {
    var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
    if (!messageEl) return;
    
    var reactions = messageReactions.get(messageId);
    if (!reactions) return;
    
    // Remove existing reaction display
    var existingReactions = messageEl.querySelector('.message-reactions');
    if (existingReactions) existingReactions.remove();
    
    // Create reaction display if there are any reactions
    if (reactions.likes.length > 0 || reactions.loves.length > 0) {
        var reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'message-reactions';
        
        var html = '';
        
        if (reactions.likes.length > 0) {
            var userLiked = reactions.likes.includes(currentUser.id);
            html += '\
                <div class="reaction like-reaction ' + (userLiked ? 'user-reacted' : '') + '" \
                     data-message-id="' + messageId + '" \
                     data-reaction-type="like" \
                     onclick="toggleReaction(\'' + messageId + '\', \'like\')" \
                     ontouchstart="handleReactionTouch(event, \'' + messageId + '\', \'like\')" \
                     onmouseenter="showReactionTooltip(event, this, \'' + messageId + '\', \'like\')" \
                     onmouseleave="hideReactionTooltip()">\
                    <i class="fas fa-thumbs-up"></i>\
                    <span class="reaction-count">' + reactions.likes.length + '</span>\
                </div>\
            ';
        }
        
        if (reactions.loves.length > 0) {
            var userLoved = reactions.loves.includes(currentUser.id);
            html += '\
                <div class="reaction love-reaction ' + (userLoved ? 'user-reacted' : '') + '" \
                     data-message-id="' + messageId + '" \
                     data-reaction-type="love" \
                     onclick="toggleReaction(\'' + messageId + '\', \'love\')" \
                     ontouchstart="handleReactionTouch(event, \'' + messageId + '\', \'love\')" \
                     onmouseenter="showReactionTooltip(event, this, \'' + messageId + '\', \'love\')" \
                     onmouseleave="hideReactionTooltip()">\
                    <i class="fas fa-heart"></i>\
                    <span class="reaction-count">' + reactions.loves.length + '</span>\
                </div>\
            ';
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
    // Prevent event bubbling
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    // Get reactions from our local storage
    var reactions = messageReactions.get(messageId);
    if (!reactions) return;
    
    var userIds = reactionType === 'like' ? reactions.likes : reactions.loves;
    if (!userIds || userIds.length === 0) return;
    
    // Remove any existing tooltip first
    hideReactionTooltip();
    
    // Create tooltip
    var tooltip = document.createElement('div');
    tooltip.className = 'reaction-tooltip';
    
    try {
        // Fetch user profiles
        var { data: profiles, error } = await supabase
            .from('profiles')
            .select('full_name')
            .in('id', userIds);
        
        if (!error && profiles && profiles.length > 0) {
            // Format names nicely
            if (profiles.length === 1) {
                tooltip.textContent = profiles[0].full_name || 'Someone';
            } else if (profiles.length === 2) {
                tooltip.textContent = (profiles[0].full_name || 'Someone') + ' and ' + (profiles[1].full_name || 'Someone');
            } else if (profiles.length <= 5) {
                var names = profiles.map(function(p) { return p.full_name || 'Someone'; }).join(', ');
                tooltip.textContent = names;
            } else {
                var firstFew = profiles.slice(0, 3).map(function(p) { return p.full_name || 'Someone'; }).join(', ');
                tooltip.textContent = firstFew + ' and ' + (profiles.length - 3) + ' others';
            }
        } else {
            // Fallback to count
            tooltip.textContent = userIds.length + ' ' + reactionType + (userIds.length > 1 ? 's' : '');
        }
    } catch (err) {
        // Fallback to count
        tooltip.textContent = userIds.length + ' ' + reactionType + (userIds.length > 1 ? 's' : '');
    }
    
    // Position tooltip
    var rect = element.getBoundingClientRect();
    tooltip.style.left = (rect.left + rect.width / 2) + 'px';
    tooltip.style.top = (rect.top - 40) + 'px';
    tooltip.style.transform = 'translateX(-50%)';
    
    document.body.appendChild(tooltip);
    
    // Auto hide after 2 seconds
    setTimeout(function() {
        hideReactionTooltip();
    }, 2000);
}

function hideReactionTooltip() {
    var tooltip = document.querySelector('.reaction-tooltip');
    if (tooltip) tooltip.remove();
}

// ================= FIXED SHOW REACTION USERS =================
async function showReactionUsers(messageId, reactionType) {
    var reactions = messageReactions.get(messageId);
    if (!reactions) return;
    
    var userIds = reactionType === 'like' ? reactions.likes : reactions.loves;
    if (userIds.length === 0) return;
    
    // Remove any existing modal
    var existingModal = document.querySelector('.online-users-modal');
    if (existingModal) existingModal.remove();
    
    try {
        // Fetch user profiles
        var { data: profiles, error } = await supabase
            .from('profiles')
            .select('full_name, email')
            .in('id', userIds);
        
        if (error) {
            console.error("Error fetching user profiles:", error);
            return;
        }
        
        // Create modal to show who reacted
        var modal = document.createElement('div');
        modal.className = 'online-users-modal';
        
        var reactionEmoji = reactionType === 'like' ? '👍' : '❤️';
        var reactionName = reactionType === 'like' ? 'Liked by' : 'Loved by';
        
        var usersHtml = '';
        profiles.forEach(function(user) {
            usersHtml += '\
                <div class="online-user-item">\
                    <div class="online-user-avatar">\
                        <i class="fas fa-user"></i>\
                    </div>\
                    <div class="online-user-info">\
                        <h4>' + (user.full_name || user.email) + '</h4>\
                    </div>\
                </div>\
            ';
        });
        
        modal.innerHTML = '\
            <div class="online-users-content">\
                <div class="online-users-header">\
                    <h3>' + reactionEmoji + ' ' + reactionName + ' (' + profiles.length + ')</h3>\
                    <button class="close-online-modal"><i class="fas fa-times"></i></button>\
                </div>\
                <div class="online-users-list">\
                    ' + usersHtml + '\
                </div>\
            </div>\
        ';
        
        document.body.appendChild(modal);
        
        // Close modal when clicking close button
        modal.querySelector('.close-online-modal').onclick = function() { modal.remove(); };
        
        // Close modal when tapping outside
        modal.onclick = function(e) {
            if (e.target === modal) modal.remove();
        };
        
    } catch (err) {
        console.error("Error showing reaction users:", err);
    }
}

function checkIfAnyHasReaction(reactionType) {
    var hasReaction = false;
    highlightedMessages.forEach(function(messageId) {
        var reactions = messageReactions.get(messageId);
        if (reactions && (reactionType === 'like' ? reactions.likes : reactions.loves).includes(currentUser.id)) {
            hasReaction = true;
        }
    });
    return hasReaction;
}

window.handleBulkReaction = function(reactionType) {
    highlightedMessages.forEach(function(messageId) {
        toggleReaction(messageId, reactionType);
    });
    showNotification((reactionType === 'like' ? '👍' : '❤️') + ' Added to ' + highlightedMessages.size + ' message' + (highlightedMessages.size > 1 ? 's' : ''), 'success');
    clearAllHighlights();
};

// ================= DESKTOP CONTEXT MENU =================
function showContextMenu(x, y, messageId, senderName, messageContent, messageType) {
    // Remove existing context menu
    var existingMenu = document.querySelector('.context-menu');
    if (existingMenu) existingMenu.remove();
    
    var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
    var canDelete = isAdmin || (messageEl && messageEl.dataset.senderId === currentUser.id);
    
    var contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu desktop';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    
    // Escape quotes in message content for safe HTML
    var escapedContent = messageContent.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    var escapedSenderName = senderName.replace(/'/g, "\\'");
    
    var menuHtml = '\
        <button onclick="handleReply(\'' + messageId + '\', \'' + escapedSenderName + '\', \'' + escapedContent + '\', \'' + messageType + '\')">\
            <i class="fas fa-reply"></i> Reply\
        </button>\
        <button onclick="toggleReaction(\'' + messageId + '\', \'like\')">\
            <i class="fas fa-thumbs-up"></i> Like\
        </button>\
        <button onclick="toggleReaction(\'' + messageId + '\', \'love\')">\
            <i class="fas fa-heart"></i> Love\
        </button>\
    ';
    
    if (canDelete) {
        menuHtml += '\
            <button onclick="handleDelete(\'' + messageId + '\')" style="color: var(--danger);">\
                <i class="fas fa-trash"></i> Delete\
            </button>\
        ';
    }
    
    contextMenu.innerHTML = menuHtml;
    document.body.appendChild(contextMenu);
    
    // Remove menu when clicking outside
    setTimeout(function() {
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
    var messages = document.querySelectorAll('.message');
    
    messages.forEach(function(msg) {
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
    
    var touch = e.touches[0];
    touchStartX = touch.clientX;
    currentSwipeElement = this;
    
    // Clear any existing long press timer
    if (longPressTimer) clearTimeout(longPressTimer);
    
    // Start long press timer
    longPressTimer = setTimeout(function() {
        handleLongPress(currentSwipeElement);
    }, longPressThreshold);
}

function handleTouchMove(e) {
    if (!currentSwipeElement) return;
    
    var touch = e.touches[0];
    var diffX = touch.clientX - touchStartX;
    
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
        currentSwipeElement.style.transform = 'translateX(' + diffX + 'px)';
        
        // Show swipe indicator
        var indicator = document.querySelector('.swipe-reply-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'swipe-reply-indicator';
            indicator.innerHTML = '<i class="fas fa-reply"></i> Reply';
            currentSwipeElement.appendChild(indicator);
        }
        indicator.style.right = (-diffX - 70) + 'px';
        indicator.style.opacity = Math.min(diffX / 50, 1);
    }
}

function handleTouchEnd(e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    if (!currentSwipeElement) return;
    
    var diffX = e.changedTouches[0].clientX - touchStartX;
    
    // Handle swipe to reply
    if (highlightedMessages.size === 0 && diffX > swipeThreshold) {
        var messageId = currentSwipeElement.dataset.messageId;
        var senderNameElement = currentSwipeElement.querySelector('small');
        var senderName = senderNameElement ? senderNameElement.textContent.split('•')[0].trim() : 'User';
        var messageContentElement = currentSwipeElement.querySelector('.message-content p');
        var messageContent = messageContentElement ? messageContentElement.textContent : '';
        var messageType = 'text';
        
        if (currentSwipeElement.querySelector('img')) messageType = 'image';
        else if (currentSwipeElement.querySelector('video')) messageType = 'video';
        else if (currentSwipeElement.querySelector('audio')) messageType = 'audio';
        
        handleReply(messageId, senderName, messageContent, messageType);
    }
    
    // Reset transform
    currentSwipeElement.style.transform = '';
    
    // Remove swipe indicator
    var indicator = document.querySelector('.swipe-reply-indicator');
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
        var indicator = document.querySelector('.swipe-reply-indicator');
        if (indicator) indicator.remove();
        currentSwipeElement = null;
    }
}

function handleLongPress(messageEl) {
    if (isRecordingOperation) return;
    
    var messageId = messageEl.dataset.messageId;
    
    // On mobile, toggle highlight
    toggleMessageHighlight(messageId);
    
    // Provide haptic feedback if available
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
}

function handleMessageClick(e) {
    // Check for double tap
    var currentTime = new Date().getTime();
    var tapLength = currentTime - lastTapTime;
    
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
    var messageId = this.dataset.messageId;
    toggleMessageHighlight(messageId);
}

function handleMessageRightClick(e) {
    e.preventDefault();
    
    var messageEl = this;
    var messageId = messageEl.dataset.messageId;
    var senderNameElement = messageEl.querySelector('small');
    var senderName = senderNameElement ? senderNameElement.textContent.split('•')[0].trim() : 'User';
    var messageContentElement = messageEl.querySelector('.message-content p');
    var messageContent = messageContentElement ? messageContentElement.textContent : '';
    var messageType = 'text';
    
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
    var contextMenu = document.querySelector('.context-menu');
    if (contextMenu) contextMenu.remove();
};

// ================= FIXED HANDLE DELETE =================
window.handleDelete = async function(messageId) {
    var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
    var senderId = messageEl ? messageEl.dataset.senderId : null;
    
    // Check if user can delete
    if (!isAdmin && senderId !== currentUser.id) {
        showNotification("You can only delete your own messages", "error");
        return;
    }
    
    // Use a custom modal instead of confirm
    if (await confirmDelete()) {
        try {
            var { error } = await supabase
                .from('chat_messages')
                .delete()
                .eq('id', messageId);
            
            if (error) throw error;
            
            showNotification('✅ Message deleted', 'success');
            
            var contextMenu = document.querySelector('.context-menu');
            if (contextMenu) contextMenu.remove();
            
            await loadGroupMessages();
            
        } catch (err) {
            console.error("Error deleting message:", err);
            showNotification('Error deleting message', 'error');
        }
    }
};

// ================= FIXED HANDLE DELETE SELECTED =================
window.handleDeleteSelected = async function() {
    if (highlightedMessages.size === 0) return;
    
    // Use a custom modal instead of confirm
    if (await confirmDelete(highlightedMessages.size + ' message' + (highlightedMessages.size > 1 ? 's' : ''))) {
        var successCount = 0;
        var failCount = 0;
        
        var messageIds = Array.from(highlightedMessages);
        
        for (var i = 0; i < messageIds.length; i++) {
            var messageId = messageIds[i];
            var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
            var senderId = messageEl ? messageEl.dataset.senderId : null;
            
            if (!isAdmin && senderId !== currentUser.id) {
                failCount++;
                continue;
            }
            
            try {
                var { error } = await supabase
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
            showNotification('✅ Deleted ' + successCount + ' message' + (successCount > 1 ? 's' : ''), 'success');
        }
        if (failCount > 0) {
            showNotification('❌ Failed to delete ' + failCount + ' message' + (failCount > 1 ? 's' : ''), 'error');
        }
        
        clearAllHighlights();
        await loadGroupMessages();
    }
};

// ================= CUSTOM CONFIRM DIALOG FUNCTION =================
function confirmDelete(item) {
    if (!item) item = 'this message';
    
    // Create custom confirm dialog
    return new Promise(function(resolve) {
        var modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.style.cssText = '\
            position: fixed;\
            top: 0;\
            left: 0;\
            width: 100%;\
            height: 100%;\
            background: rgba(0, 0, 0, 0.5);\
            display: flex;\
            align-items: center;\
            justify-content: center;\
            z-index: 10000;\
            animation: fadeIn 0.2s ease;\
        ';
        
        var content = document.createElement('div');
        content.style.cssText = '\
            background: var(--card-bg);\
            border-radius: 16px;\
            padding: 24px;\
            max-width: 320px;\
            width: 90%;\
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);\
            animation: slideUp 0.2s ease;\
            border: 1px solid var(--border-color);\
        ';
        
        content.innerHTML = '\
            <h3 style="margin: 0 0 16px 0; color: var(--text-light); font-size: 18px;">Delete ' + item + '?</h3>\
            <p style="margin: 0 0 24px 0; color: var(--text-muted); font-size: 14px;">This action cannot be undone.</p>\
            <div style="display: flex; gap: 12px; justify-content: flex-end;">\
                <button id="cancelDeleteBtn" style="padding: 10px 20px; border: 1px solid var(--border-color); background: transparent; color: var(--text-light); border-radius: 8px; cursor: pointer; font-size: 14px;">Cancel</button>\
                <button id="confirmDeleteBtn" style="padding: 10px 20px; border: none; background: var(--danger); color: white; border-radius: 8px; cursor: pointer; font-size: 14px;">Delete</button>\
            </div>\
        ';
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        document.getElementById('cancelDeleteBtn').onclick = function() {
            modal.remove();
            resolve(false);
        };
        
        document.getElementById('confirmDeleteBtn').onclick = function() {
            modal.remove();
            resolve(true);
        };
        
        modal.onclick = function(e) {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        };
    });
}

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
    
    showNotification('🎨 Theme changed to ' + theme.charAt(0).toUpperCase() + theme.slice(1), 'success', 2000);
}

function updateThemeCheckmark() {
    document.querySelectorAll('.theme-option .fa-check').forEach(function(el) { el.remove(); });
    
    var activeOption = document.querySelector('.theme-option[data-theme="' + currentTheme + '"]');
    if (activeOption) {
        var checkIcon = document.createElement('i');
        checkIcon.className = 'fas fa-check';
        activeOption.appendChild(checkIcon);
    }
}

function setupThemeToggle() {
    var themeToggle = document.getElementById('themeToggle');
    var themeDropdown = document.getElementById('themeDropdown');
    
    if (!themeToggle || !themeDropdown) return;
    
    themeToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        themeDropdown.classList.toggle('show');
    });
    
    document.querySelectorAll('.theme-option').forEach(function(option) {
        option.addEventListener('click', function(e) {
            e.stopPropagation();
            var theme = option.dataset.theme;
            setTheme(theme);
            themeDropdown.classList.remove('show');
        });
    });
    
    document.addEventListener('click', function() {
        themeDropdown.classList.remove('show');
    });
}

// ================= NOTIFICATION FUNCTION =================
function showNotification(message, type, duration) {
    if (!type) type = 'success';
    if (!duration) duration = 3000;
    
    var existingNotification = document.querySelector('.notification');
    if (existingNotification) existingNotification.remove();
    
    var notification = document.createElement('div');
    notification.className = 'notification ' + type;
    
    var iconClass = 'fa-check-circle';
    if (type === 'error') iconClass = 'fa-exclamation-circle';
    else if (type === 'info') iconClass = 'fa-info-circle';
    
    notification.innerHTML = '\
        <i class="fas ' + iconClass + '"></i>\
        <span>' + message + '</span>\
    ';
    document.body.appendChild(notification);
    
    setTimeout(function() {
        notification.remove();
    }, duration);
}

// ================= JUMP TO BOTTOM BUTTON FUNCTIONS =================
function createJumpToBottomButton() {
    var existingBtn = document.getElementById('jumpToBottomBtn');
    if (existingBtn) existingBtn.remove();
    
    var button = document.createElement('button');
    button.id = 'jumpToBottomBtn';
    button.className = 'jump-to-bottom-btn';
    button.innerHTML = '<i class="fas fa-arrow-down"></i>';
    button.title = 'Jump to latest message';
    
    button.addEventListener('click', function() {
        scrollToBottom();
        button.style.display = 'none';
    });
    
    document.body.appendChild(button);
}

function scrollToBottom() {
    var messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// ================= SMART SCROLL POSITIONING =================
function findFirstUnreadMessage() {
    var messages = document.querySelectorAll('.message.received');
    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        var timeSpan = msg.querySelector('.time');
        if (timeSpan && timeSpan.innerHTML.includes(' ✓') && !timeSpan.innerHTML.includes('✓✓')) {
            return msg.dataset.messageId;
        }
    }
    return null;
}

function scrollToFirstUnread() {
    var firstUnreadId = findFirstUnreadMessage();
    if (firstUnreadId) {
        var messageElement = document.querySelector('.message[data-message-id="' + firstUnreadId + '"]');
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageElement.style.backgroundColor = 'rgba(12, 143, 95, 0.2)';
            setTimeout(function() {
                messageElement.style.backgroundColor = '';
            }, 2000);
        }
    } else {
        scrollToBottom();
    }
}

// ================= SIDEBAR SETUP =================
function setupSidebar() {
    var sidebar = document.getElementById('sidebar');
    var openBtn = document.getElementById('openSidebar');
    var closeBtn = document.getElementById('closeSidebar');
    var overlay = document.getElementById('overlay');
    
    if (!sidebar) return;
    
    if (openBtn) {
        openBtn.addEventListener('click', function() {
            sidebar.classList.add('active');
            if (overlay) overlay.classList.add('active');
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', function() {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
}

// ================= ONLINE COUNTER =================
async function setupPresenceTracking() {
    try {
        var channel = supabase.channel('online-users', {
            config: { presence: { key: currentUser.id } }
        });

        channel
            .on('presence', { event: 'sync' }, function() {
                var presenceState = channel.presenceState();
                onlineUsers.clear();
                
                Object.values(presenceState).forEach(function(users) {
                    users.forEach(function(user) {
                        if (user.user_id !== currentUser.id) {
                            onlineUsers.add(user.user_id);
                        }
                    });
                });
                
                updateOnlineCount();
                updateTypingDisplay();
            })
            .on('presence', { event: 'join' }, function({ key, newPresences }) {
                newPresences.forEach(function(p) { 
                    if (p.user_id !== currentUser.id) onlineUsers.add(p.user_id);
                });
                updateOnlineCount();
                updateTypingDisplay();
            })
            .on('presence', { event: 'leave' }, function({ key, leftPresences }) {
                leftPresences.forEach(function(p) { 
                    if (p.user_id !== currentUser.id) onlineUsers.delete(p.user_id);
                });
                updateOnlineCount();
                updateTypingDisplay();
            });

        await channel.subscribe(async function(status) {
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
    
    presenceSubscription.on('broadcast', { event: 'typing' }, function(payload) {
        var userId = payload.payload.userId;
        var typing = payload.payload.typing;
        
        if (userId === currentUser.id) return;
        
        if (typing) {
            if (!typingUsers.has(userId)) {
                typingUsers.set(userId, setTimeout(function() {
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
    
    var messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', function() {
            if (!isTyping) {
                isTyping = true;
                broadcastTypingStatus(true);
            }
            
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(function() {
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
            payload: { userId: currentUser.id, typing: typing }
        });
    } catch (err) {
        console.error("Error broadcasting typing status:", err);
    }
}

async function updateTypingDisplay() {
    var typingIndicator = document.getElementById('typingIndicator');
    var typingAvatars = document.getElementById('typingAvatars');
    
    if (!typingIndicator || !typingAvatars) return;
    
    var typingUserIds = Array.from(typingUsers.keys());
    
    if (typingUserIds.length === 0) {
        typingIndicator.classList.add('hidden');
        return;
    }
    
    var { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', typingUserIds);
    
    if (!profiles || profiles.length === 0) {
        typingIndicator.classList.add('hidden');
        return;
    }
    
    typingAvatars.innerHTML = '';
    profiles.slice(0, 3).forEach(function(profile) {
        var avatar = document.createElement('div');
        avatar.className = 'typing-avatar';
        avatar.textContent = profile.full_name ? profile.full_name.charAt(0).toUpperCase() : '?';
        avatar.title = profile.full_name || 'Someone';
        typingAvatars.appendChild(avatar);
    });
    
    if (profiles.length > 3) {
        var moreAvatar = document.createElement('div');
        moreAvatar.className = 'typing-avatar';
        moreAvatar.textContent = '+' + (profiles.length - 3);
        typingAvatars.appendChild(moreAvatar);
    }
    
    typingIndicator.classList.remove('hidden');
}

// ================= SHOW ONLINE USERS MODAL =================
async function showOnlineUsers() {
    try {
        var onlineUserIds = Array.from(onlineUsers);
        
        var { data: profiles, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, role, state')
            .in('id', onlineUserIds);
        
        if (error) throw error;
        
        var modal = document.createElement('div');
        modal.className = 'online-users-modal';
        
        var usersHtml = '';
        profiles.forEach(function(user) {
            var crown = user.role === 'admin' ? ' 👑' : '';
            var userState = user.state ? ' • ' + user.state : '';
            
            usersHtml += '\
                <div class="online-user-item">\
                    <div class="online-user-avatar">\
                        <i class="fas fa-user"></i>\
                    </div>\
                    <div class="online-user-info">\
                        <h4>' + (user.full_name || user.email) + crown + '</h4>\
                        <p><i class="fas fa-circle"></i> Online now' + userState + '</p>\
                    </div>\
                    <span class="online-status-dot"></span>\
                </div>\
            ';
        });
        
        modal.innerHTML = '\
            <div class="online-users-content">\
                <div class="online-users-header">\
                    <h3><i class="fas fa-users"></i> Online Members (' + profiles.length + ')</h3>\
                    <button class="close-online-modal"><i class="fas fa-times"></i></button>\
                </div>\
                <div class="online-users-list">\
                    ' + usersHtml + '\
                </div>\
                <div class="online-users-footer">\
                    <i class="fas fa-globe"></i> Total online: ' + profiles.length + '\
                </div>\
            </div>\
        ';
        
        document.body.appendChild(modal);
        
        modal.querySelector('.close-online-modal').onclick = function() { modal.remove(); };
        modal.onclick = function(e) {
            if (e.target === modal) modal.remove();
        };
        
    } catch (err) {
        console.error("Error showing online users:", err);
        showNotification('Error loading online users', 'error');
    }
}

function updateOnlineCount() {
    var onlineCountEl = document.getElementById('onlineCount');
    if (onlineCountEl) {
        var count = onlineUsers.size;
        onlineCountEl.innerHTML = '<i class="fas fa-circle" style="font-size: 8px; color: #10b981;"></i> ' + count + ' online';
        onlineCountEl.style.cursor = 'pointer';
        onlineCountEl.onclick = showOnlineUsers;
    }
}

// ================= MAIN CHAT FUNCTIONS =================
async function loadChatData() {
    try {
        var { data: { user }, error: userError } = await supabase.auth.getUser();
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

// ================= SETUP CLICK OUTSIDE TO CANCEL REPLY =================
function setupClickOutsideCancel() {
    document.addEventListener('click', function(e) {
        // Don't cancel if we have highlights
        if (highlightedMessages.size > 0) return;
        
        // Don't cancel during recording
        if (isRecordingOperation) return;
        
        // Only check if we have an active reply
        if (!replyingTo && !pendingReply) return;
        
        // Get the clicked element
        var clickedElement = e.target;
        
        // Check if click is on ANY interactive element related to replying
        var isReplyElement = 
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
        var isReplyButton = clickedElement.closest('button') && 
                           clickedElement.closest('button').innerHTML && 
                           clickedElement.closest('button').innerHTML.includes('fa-reply');
        
        if (isReplyButton) {
            console.log("📝 Click on reply button - preserving reply");
            return;
        }
        
        // If we get here, it's a click outside - cancel the reply
        console.log("📝 Click outside - cancelling reply");
        cancelReply();
    }, true);
}

// ================= CREATE REPLY INDICATOR WITH ANIMATION =================
function createReplyIndicator(senderName, messageContent, messageType) {
    var existingIndicator = document.getElementById('replyIndicator');
    if (existingIndicator) existingIndicator.remove();
    
    var previewText = '';
    
    if (messageType === 'text') {
        previewText = messageContent.length > 50 ? messageContent.substring(0, 50) + '...' : messageContent;
    } else if (messageType === 'image') {
        previewText = '📷 Image';
    } else if (messageType === 'video') {
        previewText = '🎥 Video';
    } else if (messageType === 'audio') {
        previewText = '🎵 Voice message';
    }
    
    var indicator = document.createElement('div');
    indicator.id = 'replyIndicator';
    indicator.className = 'reply-indicator';
    indicator.innerHTML = '\
        <div class="reply-indicator-content">\
            <i class="fas fa-reply reply-indicator-icon"></i>\
            <div class="reply-indicator-text">\
                <span>Replying to ' + senderName + '</span>\
                <p>' + previewText + '</p>\
            </div>\
        </div>\
        <button class="reply-indicator-close" id="cancelReplyBtn">\
            <i class="fas fa-times"></i>\
        </button>\
    ';
    
    // Insert indicator above messages
    var messagesContainer = document.getElementById('messages');
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
    document.getElementById('cancelReplyBtn').addEventListener('click', function(e) {
        e.stopPropagation();
        cancelReply();
    });
    
    var messageInput = document.getElementById('messageInput');
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
    var indicator = document.getElementById('replyIndicator');
    if (indicator) indicator.remove();
    
    var messageInput = document.getElementById('messageInput');
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
    var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
    if (!messageEl) return;
    
    var timeSpan = messageEl.querySelector('.time');
    if (!timeSpan) return;
    
    var existingStatus = timeSpan.querySelector('.message-status');
    if (existingStatus) existingStatus.remove();
    
    var statusSpan = document.createElement('span');
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
        var { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        
        isAdmin = data.role === 'admin';
        console.log("User role:", data.role, "isAdmin:", isAdmin);
        
        var userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = data.full_name || 'Member';
        
        var container = document.getElementById('memberSelectorContainer');
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
        var { data, error } = await supabase
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
    var container = document.getElementById('memberSelectorContainer');
    if (!container) return;
    
    container.innerHTML = '\
        <div class="member-search-container">\
            <div class="member-search-input-wrapper">\
                <i class="fas fa-search member-search-icon"></i>\
                <input type="text" class="member-search-input" id="memberSearchInput" \
                       placeholder="Search members... (type to search)" autocomplete="off">\
                <button class="member-search-clear" id="memberSearchClear">\
                    <i class="fas fa-times"></i>\
                </button>\
            </div>\
            <div class="member-search-results" id="memberSearchResults"></div>\
        </div>\
    ';
    
    var searchInput = document.getElementById('memberSearchInput');
    var searchResults = document.getElementById('memberSearchResults');
    var clearBtn = document.getElementById('memberSearchClear');
    
    function searchMembers(query) {
        query = query.toLowerCase().trim();
        
        if (!query) {
            searchResults.innerHTML = '\
                <div class="member-search-result-item" data-id="">\
                    <div class="member-result-avatar"><i class="fas fa-users"></i></div>\
                    <div class="member-result-info">\
                        <div class="member-result-name">👥 Group Chat</div>\
                        <div class="member-result-email">All members</div>\
                    </div>\
                    <span class="member-result-badge">group</span>\
                </div>\
                <div class="member-search-footer">Type to search members...</div>\
            ';
            return;
        }
        
        var filtered = allMembers.filter(function(member) {
            return (member.full_name && member.full_name.toLowerCase().includes(query)) ||
                   (member.email && member.email.toLowerCase().includes(query)) ||
                   (member.state && member.state.toLowerCase().includes(query));
        });
        
        if (filtered.length === 0) {
            searchResults.innerHTML = '\
                <div class="member-search-result-item" data-id="">\
                    <div class="member-result-avatar"><i class="fas fa-users"></i></div>\
                    <div class="member-result-info">\
                        <div class="member-result-name">👥 Group Chat</div>\
                        <div class="member-result-email">All members</div>\
                    </div>\
                    <span class="member-result-badge">group</span>\
                </div>\
                <div class="no-results-item">\
                    <i class="fas fa-user-slash"></i> No members found matching "' + query + '"\
                </div>\
            ';
            return;
        }
        
        var resultsHtml = '\
            <div class="member-search-result-item" data-id="">\
                <div class="member-result-avatar"><i class="fas fa-users"></i></div>\
                <div class="member-result-info">\
                    <div class="member-result-name">👥 Group Chat</div>\
                    <div class="member-result-email">All members</div>\
                </div>\
                <span class="member-result-badge">group</span>\
            </div>\
        ';
        
        filtered.forEach(function(member) {
            resultsHtml += '\
                <div class="member-search-result-item" data-id="' + member.id + '">\
                    <div class="member-result-avatar"><i class="fas fa-user"></i></div>\
                    <div class="member-result-info">\
                        <div class="member-result-name">' + (member.full_name || 'Unnamed') + '</div>\
                        <div class="member-result-email">' + member.email + '</div>\
                    </div>' +
                    (member.state ? '<span class="member-result-badge">' + member.state + '</span>' : '') + '\
                </div>\
            ';
        });
        
        resultsHtml += '<div class="member-search-footer">Found ' + filtered.length + ' member' + (filtered.length !== 1 ? 's' : '') + '</div>';
        searchResults.innerHTML = resultsHtml;
    }
    
    searchInput.addEventListener('input', function(e) {
        var query = e.target.value;
        searchMembers(query);
        searchResults.classList.add('show');
        
        if (query.length > 0) {
            clearBtn.classList.add('visible');
        } else {
            clearBtn.classList.remove('visible');
        }
    });
    
    searchInput.addEventListener('focus', function() {
        searchMembers(searchInput.value);
        searchResults.classList.add('show');
    });
    
    document.addEventListener('click', function(e) {
        if (!container.contains(e.target)) {
            searchResults.classList.remove('show');
        }
    });
    
    searchResults.addEventListener('click', function(e) {
        var resultItem = e.target.closest('.member-search-result-item');
        if (!resultItem) return;
        
        var memberId = resultItem.dataset.id;
        var memberNameElement = resultItem.querySelector('.member-result-name');
        var memberName = memberNameElement ? memberNameElement.textContent : '';
        
        if (memberId === '') {
            selectedMemberId = null;
            currentChatPartner = null;
            searchInput.value = '';
            searchInput.placeholder = '👥 Group Chat (All Members)';
        } else {
            selectedMemberId = memberId;
            currentChatPartner = memberId;
            searchInput.value = memberName.replace('👥 ', '').replace('👤 ', '');
            searchInput.placeholder = '💬 Chatting with ' + memberName;
        }
        
        searchResults.classList.remove('show');
        clearBtn.classList.remove('visible');
        
        loadGroupMessages();
    });
    
    clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        searchInput.placeholder = 'Search members... (type to search)';
        selectedMemberId = null;
        currentChatPartner = null;
        clearBtn.classList.remove('visible');
        searchMembers('');
        searchResults.classList.add('show');
        
        loadGroupMessages();
    });
    
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            var firstResult = searchResults.querySelector('.member-search-result-item');
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
        var messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';
        
        var query;
        
        if (isAdmin && currentChatPartner) {
            // Admin viewing private chat with specific member
            console.log("📨 Loading private messages between admin and member:", currentChatPartner);
            query = supabase
                .from('chat_messages')
                .select('\
                    *,\
                    sender:sender_id(id, full_name, email, role),\
                    parent:parent_id(\
                        id,\
                        content,\
                        message_type,\
                        file_url,\
                        created_at,\
                        sender:sender_id(id, full_name, email, role)\
                    )\
                ')
                .or('and(sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentChatPartner + '),and(sender_id.eq.' + currentChatPartner + ',receiver_id.eq.' + currentUser.id + ')')
                .order('created_at', { ascending: true });
        } else if (!isAdmin) {
            // Regular member - show group messages AND their private messages
            console.log("📨 Loading messages for regular member");
            query = supabase
                .from('chat_messages')
                .select('\
                    *,\
                    sender:sender_id(id, full_name, email, role),\
                    parent:parent_id(\
                        id,\
                        content,\
                        message_type,\
                        file_url,\
                        created_at,\
                        sender:sender_id(id, full_name, email, role)\
                    )\
                ')
                .or('receiver_id.is.null,and(sender_id.eq.' + currentUser.id + '),and(receiver_id.eq.' + currentUser.id + ')')
                .order('created_at', { ascending: true });
        } else {
            // Admin viewing group chat (default)
            console.log("📨 Loading group messages for admin");
            query = supabase
                .from('chat_messages')
                .select('\
                    *,\
                    sender:sender_id(id, full_name, email, role),\
                    parent:parent_id(\
                        id,\
                        content,\
                        message_type,\
                        file_url,\
                        created_at,\
                        sender:sender_id(id, full_name, email, role)\
                    )\
                ')
                .is('receiver_id', null)
                .order('created_at', { ascending: true });
        }
        
        var { data: messages, error } = await query;
        
        if (error) {
            console.error("Error loading messages:", error);
            throw error;
        }
        
        console.log("📨 Messages loaded:", messages);
        
        if (!messages || messages.length === 0) {
            if (isAdmin && currentChatPartner) {
                var member = allMembers.find(function(m) { return m.id === currentChatPartner; });
                messagesContainer.innerHTML = '<div class="empty-chat"><i class="fas fa-comments"></i><h3>No messages yet</h3><p>Start a private conversation with ' + (member ? member.full_name : 'this member') + '!</p></div>';
            } else {
                messagesContainer.innerHTML = '<div class="empty-chat"><i class="fas fa-comments"></i><h3>No messages yet</h3><p>Be the first to send a message!</p></div>';
            }
            return;
        }
        
        renderMessages(messages);
        
        // Load reactions after messages are rendered
        await loadReactions();
        
        // Smart scroll positioning after messages load
        setTimeout(function() {
            var firstUnreadId = findFirstUnreadMessage();
            if (firstUnreadId) {
                scrollToFirstUnread();
            } else {
                scrollToBottom();
            }
        }, 500);
        
        // Mark messages as read after loading
        setTimeout(function() {
            markAllVisibleMessagesAsRead();
        }, 1000);
        
    } catch (err) {
        console.error("Error loading messages:", err);
        var messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="empty-chat"><i class="fas fa-exclamation-triangle"></i><h3>Error loading messages</h3><p>Please refresh the page</p></div>';
        }
    }
}

// ================= MARK MESSAGES AS READ =================
function setupScrollListener() {
    var messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return;
    
    messagesContainer.addEventListener('scroll', function() {
        if (messageReadTimer) clearTimeout(messageReadTimer);
        messageReadTimer = setTimeout(markAllVisibleMessagesAsRead, 500);
        
        var isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        var jumpBtn = document.getElementById('jumpToBottomBtn');
        
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
    var messageElements = document.querySelectorAll('.message');
    if (messageElements.length === 0) return;
    
    var unreadMessageIds = [];
    
    messageElements.forEach(function(el) {
        var rect = el.getBoundingClientRect();
        var isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        
        if (isVisible) {
            var messageId = el.dataset.messageId;
            var timeSpan = el.querySelector('.time');
            
            if (el.classList.contains('received')) {
                if (timeSpan && !timeSpan.innerHTML.includes('✓✓')) {
                    unreadMessageIds.push(messageId);
                }
            }
        }
    });
    
    if (unreadMessageIds.length === 0) return;
    
    var { error } = await supabase
        .from('chat_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadMessageIds)
        .is('read_at', null);
    
    if (!error) {
        unreadMessageIds.forEach(function(id) {
            var msgEl = document.querySelector('.message[data-message-id="' + id + '"]');
            if (msgEl && msgEl.classList.contains('received')) {
                var timeSpan = msgEl.querySelector('.time');
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
    var messageElement = document.querySelector('.message[data-message-id="' + messageId + '"]');
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.style.backgroundColor = 'rgba(12, 143, 95, 0.3)';
        setTimeout(function() {
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
    var container = document.getElementById('messages');
    if (!container) return;
    
    var html = '';
    var lastDate = '';
    
    messages.forEach(function(msg) {
        var isSent = msg.sender_id === currentUser.id;
        var isGroup = !msg.receiver_id;
        var isPrivate = msg.receiver_id && (msg.receiver_id === currentUser.id || msg.sender_id === currentUser.id);
        
        var date = new Date(msg.created_at);
        var today = new Date();
        var yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        var dateStr;
        if (date.toDateString() === today.toDateString()) dateStr = 'Today';
        else if (date.toDateString() === yesterday.toDateString()) dateStr = 'Yesterday';
        else dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        if (lastDate !== dateStr) {
            html += '<div class="date-separator"><span>' + dateStr + '</span></div>';
            lastDate = dateStr;
        }
        
        var timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        var senderName = msg.sender ? (msg.sender.full_name || msg.sender.email || 'Unknown') : 'Unknown';
        var isAdminSender = msg.sender && msg.sender.role === 'admin';
        var crown = isAdminSender ? ' 👑' : '';
        
        var messageTypeLabel = '';
        if (isGroup) messageTypeLabel = 'Group';
        else if (isPrivate) messageTypeLabel = 'Private';
        
        var status = 'sent';
        if (msg.read_at) {
            status = 'seen';
        }
        
        // Status indicator
        var statusIndicator = '';
        if (isSent) {
            if (status === 'seen') {
                statusIndicator = '<span class="message-status" style="color: #3498db;"> ✓✓</span>';
            } else {
                statusIndicator = '<span class="message-status" style="color: #000000;"> ✓</span>';
            }
        }
        
        // FOR SENT MESSAGES
        if (isSent) {
            html += '\
                <div class="message sent" data-message-id="' + msg.id + '" data-sender="' + senderName + '" data-sender-id="' + msg.sender_id + '">\
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">\
                        <small style="font-weight: bold;">You ' + (messageTypeLabel ? '• ' + messageTypeLabel : '') + '</small>\
                    </div>\
                    \
                    ' + renderQuotedMessage(msg.parent) + '\
                    \
                    <div class="message-content-wrapper">\
                        <div class="message-content">' + renderMessageContent(msg) + '</div>\
                    </div>\
                    \
                    <span class="time">' + timeStr + statusIndicator + '</span>\
                </div>\
            ';
        } 
        // FOR RECEIVED MESSAGES
        else {
            html += '\
                <div class="message received" data-message-id="' + msg.id + '" data-sender="' + senderName + '" data-sender-id="' + msg.sender_id + '">\
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">\
                        <small style="font-weight: bold;">' + senderName + crown + ' ' + (messageTypeLabel ? '• ' + messageTypeLabel : '') + '</small>\
                    </div>\
                    \
                    ' + renderQuotedMessage(msg.parent) + '\
                    \
                    <div class="message-content-wrapper">\
                        <div class="message-content">' + renderMessageContent(msg) + '</div>\
                    </div>\
                    \
                    <span class="time">' + timeStr + '</span>\
                </div>\
            ';
        }
    });
    
    container.innerHTML = html;
    
    // Re-render reactions after messages are loaded
    messageReactions.forEach(function(reactions, messageId) {
        updateMessageReactions(messageId);
    });
    
    // Setup message event listeners
    setTimeout(function() {
        setupMessageEventListeners();
    }, 100);
}

// ================= RENDER QUOTED MESSAGE WITH PROPER SENDER NAME =================
function renderQuotedMessage(parentMsg) {
    if (!parentMsg) return '';
    
    console.log("📝 Rendering quoted message:", parentMsg);
    
    // Get sender name from the parent message's sender object
    var senderName = parentMsg.sender ? (parentMsg.sender.full_name || parentMsg.sender.email || 'Unknown') : 'Unknown';
    var contentPreview = getMessagePreview(parentMsg);
    
    return '\
        <div class="quoted-message" onclick="window.scrollToMessage(\'' + parentMsg.id + '\')" style="cursor: pointer;">\
            <div class="quoted-sender">' + senderName + '</div>\
            <div class="quoted-content">' + contentPreview + '</div>\
        </div>\
    ';
}

// ================= FIXED RENDER MESSAGE CONTENT WITH SAFE URLS =================
function renderMessageContent(msg) {
    if (msg.message_type === 'text') return '<p>' + (msg.content || '') + '</p>';
    
    if (msg.message_type === 'image') {
        var imageUrl = safeUrl(msg.file_url);
        if (!imageUrl) return '<p>Image not available</p>';
        return '<img src="' + imageUrl + '" alt="Image" onclick="window.open(\'' + imageUrl + '\')" style="max-width: 100%; cursor: pointer;">';
    }
    
    if (msg.message_type === 'video') {
        var videoUrl = safeUrl(msg.file_url);
        if (!videoUrl) return '<p>Video not available</p>';
        return '<video controls style="max-width: 100%;"><source src="' + videoUrl + '"></video>';
    }
    
    if (msg.message_type === 'audio') {
        var audioUrl = safeUrl(msg.file_url);
        if (!audioUrl) return '<p>Audio not available</p>';
        return '<audio controls src="' + audioUrl + '" style="width: 280px; height: 40px;"></audio>';
    }
    
    return '<p>Unsupported message type</p>';
}

function setupRealtimeSubscription() {
    if (messagesSubscription) messagesSubscription.unsubscribe();
    
    messagesSubscription = supabase
        .channel('chat_messages_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, function(payload) {
            handleNewMessage(payload.new);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, function(payload) {
            if (payload.new.read_at && !payload.old.read_at) {
                updateMessageStatus(payload.new.id, 'seen');
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, function(payload) {
            console.log("Message deleted, refreshing...");
            loadGroupMessages();
        })
        .subscribe();
}

async function handleNewMessage(newMessage) {
    var isRelevant = 
        (!newMessage.receiver_id && !currentChatPartner) ||
        (newMessage.receiver_id === currentUser.id && newMessage.sender_id === currentChatPartner) ||
        (newMessage.sender_id === currentUser.id && newMessage.receiver_id === currentChatPartner) ||
        (!isAdmin && (newMessage.receiver_id === currentUser.id || !newMessage.receiver_id));
    
    if (isRelevant) {
        loadGroupMessages();
    }
}

// ================= COMPLETELY FIXED ANDROID ENTER KEY BEHAVIOR =================
function setupChatListeners() {
    var sendBtn = document.getElementById('sendBtn');
    var messageInput = document.getElementById('messageInput');
    var imageBtn = document.getElementById('imageBtn');
    var videoBtn = document.getElementById('videoBtn');
    var voiceBtn = document.getElementById('voiceBtn');
    var fileInput = document.getElementById('fileInput');
    
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    
    if (messageInput) {
        // Set inputmode to text on mobile to show return key
        if (isTouchDevice) {
            messageInput.setAttribute('inputmode', 'text');
            messageInput.setAttribute('enterkeyhint', 'enter');
        }
        
        // Store the last keydown time to prevent double events
        let lastKeyTime = 0;
        
        // Handle keydown for Enter key - COMPLETELY REWRITTEN FOR ANDROID
        messageInput.addEventListener('keydown', function(e) {
            // Prevent duplicate events
            const now = Date.now();
            if (now - lastKeyTime < 100) {
                e.preventDefault();
                return false;
            }
            lastKeyTime = now;
            
            if (e.key === 'Enter') {
                if (isTouchDevice) {
                    // ON ANDROID: Always create a new line
                    console.log("📱 Android: Creating new line");
                    
                    // Get current cursor position
                    const start = this.selectionStart;
                    const end = this.selectionEnd;
                    
                    // Get current value
                    const value = this.value;
                    
                    // Insert new line at cursor position
                    this.value = value.substring(0, start) + '\n' + value.substring(end);
                    
                    // Move cursor after the new line
                    this.selectionStart = this.selectionEnd = start + 1;
                    
                    // Prevent default completely - this stops the keyboard from changing case
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Trigger input event for typing indicator
                    const inputEvent = new Event('input', { bubbles: true });
                    this.dispatchEvent(inputEvent);
                    
                    return false;
                } else {
                    // ON DESKTOP: Enter sends, Shift+Enter new line
                    if (e.shiftKey) {
                        // Shift+Enter creates new line
                        console.log("💻 Desktop: Shift+Enter - new line");
                        return true; // Let default happen
                    } else {
                        // Enter sends message
                        console.log("💻 Desktop: Enter - sending message");
                        e.preventDefault();
                        sendMessage();
                        return false;
                    }
                }
            }
        }, true); // Use capture phase to catch event early
        
        // Remove keypress handler for mobile to avoid conflicts
        if (!isTouchDevice) {
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }
        
        // Add input event for typing indicator
        messageInput.addEventListener('input', function() {
            if (!isTyping) {
                isTyping = true;
                broadcastTypingStatus(true);
            }
            
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(function() {
                isTyping = false;
                broadcastTypingStatus(false);
            }, 1000);
        });
    }
    
    if (imageBtn && fileInput) {
        imageBtn.addEventListener('click', function() {
            fileInput.accept = 'image/*';
            fileInput.click();
        });
    }
    
    if (videoBtn && fileInput) {
        videoBtn.addEventListener('click', function() {
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
    var voiceBtn = document.getElementById('voiceBtn');
    var timerDiv = document.getElementById('recordingTimer');
    
    if (!mediaRecorder) {
        try {
            var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            recordedAudio = null;
            recordedAudioUrl = null;
            
            mediaRecorder.ondataavailable = function(e) {
                if (e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };
            
            var stopHandler = function() {
                isRecordingOperation = true;
                
                if (audioChunks.length === 0) {
                    stream.getTracks().forEach(function(track) { track.stop(); });
                    mediaRecorder = null;
                    setTimeout(function() {
                        isRecordingOperation = false;
                    }, 500);
                    return;
                }
                
                var audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                recordedAudio = audioBlob;
                recordedAudioUrl = URL.createObjectURL(audioBlob);
                showAudioPreview(recordedAudioUrl);
                stream.getTracks().forEach(function(track) { track.stop(); });
                mediaRecorder = null;
                
                setTimeout(function() {
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
            
            recordingTimer = setInterval(function() {
                recordingSeconds++;
                timerDiv.innerHTML = '🔴 Recording: ' + recordingSeconds + 's';
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
    var existingPreview = document.getElementById('audioPreview');
    if (existingPreview) existingPreview.remove();
    
    var chatInput = document.querySelector('.chat-input-area');
    var previewDiv = document.createElement('div');
    previewDiv.id = 'audioPreview';
    previewDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--card-bg); border-radius: 8px; margin-bottom: 10px; width: 100%; flex-wrap: wrap;';
    
    previewDiv.innerHTML = '\
        <audio controls src="' + audioUrl + '" style="flex: 1; height: 40px; min-width: 200px;"></audio>\
        <div style="display: flex; gap: 5px;">\
            <button id="deletePreviewBtn" class="media-btn" style="background: var(--danger);"><i class="fas fa-trash"></i></button>\
            <button id="sendPreviewBtn" class="media-btn" style="background: var(--primary-color);"><i class="fas fa-paper-plane"></i></button>\
        </div>\
    ';
    
    chatInput.parentNode.insertBefore(previewDiv, chatInput);
    
    document.getElementById('deletePreviewBtn').addEventListener('click', function() {
        if (recordedAudioUrl) {
            URL.revokeObjectURL(recordedAudioUrl);
            recordedAudio = null;
            recordedAudioUrl = null;
        }
        previewDiv.remove();
    });
    
    document.getElementById('sendPreviewBtn').addEventListener('click', async function() {
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
    var file = e.target.files[0];
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
    var reader = new FileReader();
    reader.onload = function(e) {
        var existingPreview = document.getElementById('mediaPreview');
        if (existingPreview) existingPreview.remove();
        
        var chatInput = document.querySelector('.chat-input-area');
        var previewDiv = document.createElement('div');
        previewDiv.id = 'mediaPreview';
        previewDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--card-bg); border-radius: 8px; margin-bottom: 10px; width: 100%; flex-wrap: wrap;';
        
        previewDiv.innerHTML = '\
            <img src="' + e.target.result + '" style="max-width: 80px; max-height: 80px; border-radius: 4px; object-fit: cover;">\
            <span style="flex: 1; color: var(--text-light); font-size: 14px; word-break: break-word;">' + file.name + '</span>\
            <div style="display: flex; gap: 5px;">\
                <button id="deletePreviewBtn" class="media-btn" style="background: var(--danger);"><i class="fas fa-trash"></i></button>\
                <button id="sendPreviewBtn" class="media-btn" style="background: var(--primary-color);"><i class="fas fa-paper-plane"></i></button>\
            </div>\
        ';
        
        chatInput.parentNode.insertBefore(previewDiv, chatInput);
        
        document.getElementById('deletePreviewBtn').addEventListener('click', function() {
            currentFile = null;
            previewDiv.remove();
        });
        
        document.getElementById('sendPreviewBtn').addEventListener('click', async function() {
            previewDiv.remove();
            await sendMessage();
        });
    };
    reader.readAsDataURL(file);
}

function showVideoPreview(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
        var existingPreview = document.getElementById('mediaPreview');
        if (existingPreview) existingPreview.remove();
        
        var chatInput = document.querySelector('.chat-input-area');
        var previewDiv = document.createElement('div');
        previewDiv.id = 'mediaPreview';
        previewDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--card-bg); border-radius: 8px; margin-bottom: 10px; width: 100%; flex-wrap: wrap;';
        
        previewDiv.innerHTML = '\
            <video src="' + e.target.result + '" style="max-width: 80px; max-height: 80px; border-radius: 4px;" controls></video>\
            <span style="flex: 1; color: var(--text-light); font-size: 14px; word-break: break-word;">' + file.name + '</span>\
            <div style="display: flex; gap: 5px;">\
                <button id="deletePreviewBtn" class="media-btn" style="background: var(--danger);"><i class="fas fa-trash"></i></button>\
                <button id="sendPreviewBtn" class="media-btn" style="background: var(--primary-color);"><i class="fas fa-paper-plane"></i></button>\
            </div>\
        ';
        
        chatInput.parentNode.insertBefore(previewDiv, chatInput);
        
        document.getElementById('deletePreviewBtn').addEventListener('click', function() {
            currentFile = null;
            previewDiv.remove();
        });
        
        document.getElementById('sendPreviewBtn').addEventListener('click', async function() {
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
        
        var fileName = file.name || 'voice-message.webm';
        var fileExt = fileName.split('.').pop() || 'webm';
        var uniqueFileName = currentUser.id + '/' + Date.now() + '.' + fileExt;
        var filePath = 'chat/' + uniqueFileName;
        
        var { error: uploadError } = await supabase.storage
            .from('chat-files')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || 'audio/webm'
            });
        
        if (uploadError) throw uploadError;
        
        var { data: { publicUrl } } = supabase.storage
            .from('chat-files')
            .getPublicUrl(filePath);
        
        return publicUrl;
        
    } catch (err) {
        console.error("Error uploading file:", err);
        throw new Error(err.message || "Failed to upload file");
    }
}

// ================= SEND MESSAGE =================
async function sendMessage() {
    var messageInput = document.getElementById('messageInput');
    var message = messageInput.value.trim();
    
    if (!message && !currentFile && !recordedAudio) {
        alert("Please enter a message or select a file");
        return;
    }
    
    var sendBtn = document.getElementById('sendBtn');
    var originalText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    
    // Get reply data from pendingReply
    var replyToSend = pendingReply ? JSON.parse(JSON.stringify(pendingReply)) : null;
    
    console.log("📝 Final reply being sent:", replyToSend);
    
    try {
        var messageData = {
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
                var fileUrl = await uploadFile(currentFile);
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
                var fileUrl = await uploadFile(recordedAudio);
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
        
        var { error } = await supabase
            .from('chat_messages')
            .insert([messageData]);
        
        if (error) {
            console.error("Database insert error:", error);
            alert("Failed to send message: " + (error.message || "Unknown error"));
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalText;
            return;
        }
        
        console.log("✅ Message sent successfully! Reply to:", replyToSend ? replyToSend.id : 'none');
        messageInput.value = '';
        
        // Clear reply indicator after sending
        if (replyToSend) {
            cancelReply();
        }
        
        // Clear any previews
        var mediaPreview = document.getElementById('mediaPreview');
        if (mediaPreview) mediaPreview.remove();
        
        var audioPreview = document.getElementById('audioPreview');
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
    var logoutBtns = document.querySelectorAll('#logoutBtn, .logout-btn-sidebar');
    
    logoutBtns.forEach(function(btn) {
        if (btn) {
            btn.addEventListener('click', async function() {
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
var style = document.createElement('style');
style.textContent = '\
    .date-separator {\
        text-align: center;\
        margin: 20px 0 10px;\
    }\
    .date-separator span {\
        background: var(--card-bg, #12332b);\
        padding: 5px 15px;\
        border-radius: 20px;\
        font-size: 12px;\
        color: var(--text-muted, #9ca3af);\
    }\
';
document.head.appendChild(style);