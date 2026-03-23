// js/chat.js - Complete Group Chat with Line Break Preservation and Image Resizing + Cloudinary Integration
// UPDATED: Small Admin can delete ANY user's messages (text, image, voice, video)

console.log("💬 Chat page loading...");

// ================= CLOUDINARY CONFIGURATION =================
const CLOUDINARY_CONFIG = {
    cloudName: 'df3koezfk',
    uploadPreset: 'community_upload',
    folder: 'community-app',
    subFolders: {
        image: 'Image',
        video: 'Video',
        audio: 'Voice-record'
    }
};

function getCloudinaryUploadUrl() {
    return `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`;
}

function getCloudinaryResourceType(fileType) {
    if (fileType.startsWith('image/')) return 'image';
    if (fileType.startsWith('video/')) return 'video';
    if (fileType.startsWith('audio/')) return 'video';
    return 'auto';
}

function isCloudinaryUrl(url) {
    return url && url.includes('cloudinary.com');
}

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

function safeUrl(url) {
    if (!url || url === 'null' || url === 'undefined' || url === '') {
        return null;
    }
    return url;
}

// Global variables
let currentUser = null;
let isAdmin = false;
let isSmallAdmin = false;  // NEW: Small Admin role
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
let highlightedMessages = new Set();
let contextMenuActive = false;
let longPressTimer = null;
let longPressThreshold = 500;
let lastTapTime = 0;
let doubleTapThreshold = 300;
let messageReactions = new Map();
let isRecordingOperation = false;
let showJumpToBottom = false;
let hasUnreadMessages = false;
let firstUnreadMessageId = null;
let currentTheme = localStorage.getItem('chatTheme') || 'dark';
let isTouchDevice = false;

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded, initializing chat...");
    
    isTouchDevice = ('ontouchstart' in window) || 
                    (navigator.maxTouchPoints > 0) || 
                    (navigator.msMaxTouchPoints > 0);
    
    if (window.innerWidth <= 768) {
        isTouchDevice = true;
    }
    
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
        
        setTimeout(function() {
            loadReactions();
        }, 2000);
        
        setTimeout(function() {
            checkPendingReply();
        }, 3000);
        
        setTimeout(function() {
            createJumpToBottomButton();
        }, 1000);
        
        setupClickOutsideHandler();
        
        setTimeout(function() {
            setupReactionTouchHandlers();
        }, 3000);
    }
    
    initializeChat();
});

function disableTextSelection() {
    console.log("✅ Text selection disabled on messages");
}

function setupReactionTouchHandlers() {
    document.addEventListener('touchstart', function(e) {
        var reaction = e.target.closest('.reaction');
        if (!reaction) {
            hideReactionTooltip();
            var existingModal = document.querySelector('.online-users-modal');
            if (existingModal) existingModal.remove();
            return;
        }
        
        e.preventDefault();
        
        var messageId = reaction.dataset.messageId;
        var reactionType = reaction.dataset.reactionType;
        
        showReactionUsers(messageId, reactionType);
    }, { passive: false });
}

async function loadReactions() {
    try {
        console.log("🔄 Loading reactions from database...");
        
        var { data: reactions, error } = await supabase
            .from('message_reactions')
            .select('*');
        
        if (error) {
            console.error("❌ Error loading reactions:", error);
            
            if (error.code === '42P01') {
                console.warn("⚠️ message_reactions table doesn't exist. Please create it in Supabase.");
                showNotification("Please create the message_reactions table in Supabase", "error", 5000);
            }
            return;
        }
        
        messageReactions.clear();
        
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
        
        messageReactions.forEach(function(_, messageId) {
            updateMessageReactions(messageId);
        });
        
    } catch (err) {
        console.error("❌ Error in loadReactions:", err);
    }
}

function checkPendingReply() {
    var pendingReplyData = sessionStorage.getItem('replyingTo');
    if (pendingReplyData) {
        try {
            var replyData = JSON.parse(pendingReplyData);
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

function setupClickOutsideHandler() {
    document.addEventListener('click', function(e) {
        if (e.target.closest('.context-menu') || e.target.closest('.action-bar')) {
            return;
        }
        
        if (e.target.closest('.message')) {
            return;
        }
        
        clearAllHighlights();
    });
}

function toggleMessageHighlight(messageId) {
    var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
    if (!messageEl) return;
    
    if (highlightedMessages.has(messageId)) {
        highlightedMessages.delete(messageId);
        messageEl.classList.remove('highlighted');
    } else {
        highlightedMessages.add(messageId);
        messageEl.classList.add('highlighted');
    }
    
    updateActionBar();
}

function clearAllHighlights() {
    if (highlightedMessages.size === 0) return;
    
    highlightedMessages.forEach(function(messageId) {
        var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
        if (messageEl) {
            messageEl.classList.remove('highlighted');
        }
    });
    
    highlightedMessages.clear();
    
    var actionBar = document.querySelector('.action-bar');
    if (actionBar) actionBar.remove();
    
    var contextMenu = document.querySelector('.context-menu');
    if (contextMenu) contextMenu.remove();
}

function updateActionBar() {
    var count = highlightedMessages.size;
    
    if (count === 0) {
        var actionBar = document.querySelector('.action-bar');
        if (actionBar) actionBar.remove();
        return;
    }
    
    var isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        showMobileActionBar(count);
    }
}

function showMobileActionBar(count) {
    var existingBar = document.querySelector('.action-bar');
    if (existingBar) existingBar.remove();
    
    var actionBar = document.createElement('div');
    actionBar.className = 'action-bar';
    
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

async function toggleReaction(messageId, reactionType) {
    console.log("🔄 Toggling " + reactionType + " for message:", messageId);
    
    var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
    if (!messageEl) {
        console.error("❌ Message element not found");
        return;
    }
    
    var reactionBtn = document.querySelector('.reaction.' + reactionType + '-reaction[data-message-id="' + messageId + '"]');
    if (reactionBtn) reactionBtn.classList.add('loading');
    
    try {
        if (!messageReactions.has(messageId)) {
            messageReactions.set(messageId, { likes: [], loves: [] });
        }
        
        var reactions = messageReactions.get(messageId);
        var userReactionArray = reactionType === 'like' ? reactions.likes : reactions.loves;
        var otherReactionArray = reactionType === 'like' ? reactions.loves : reactions.likes;
        
        var userIndex = userReactionArray.indexOf(currentUser.id);
        var hasReaction = userIndex !== -1;
        
        if (hasReaction) {
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
            
            userReactionArray.splice(userIndex, 1);
            console.log("✅ " + reactionType + " reaction removed");
            
        } else {
            var otherIndex = otherReactionArray.indexOf(currentUser.id);
            if (otherIndex !== -1) {
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
                    otherReactionArray.splice(otherIndex, 1);
                }
            }
            
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
            
            userReactionArray.push(currentUser.id);
            console.log("✅ " + reactionType + " reaction added");
        }
        
        updateMessageReactions(messageId);
        
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
    
    var existingReactions = messageEl.querySelector('.message-reactions');
    if (existingReactions) existingReactions.remove();
    
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

window.handleReactionTouch = function(event, messageId, reactionType) {
    event.preventDefault();
    event.stopPropagation();
    showReactionUsers(messageId, reactionType);
};

async function showReactionTooltip(event, element, messageId, reactionType) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    var reactions = messageReactions.get(messageId);
    if (!reactions) return;
    
    var userIds = reactionType === 'like' ? reactions.likes : reactions.loves;
    if (!userIds || userIds.length === 0) return;
    
    hideReactionTooltip();
    
    var tooltip = document.createElement('div');
    tooltip.className = 'reaction-tooltip';
    
    try {
        var { data: profiles, error } = await supabase
            .from('profiles')
            .select('full_name')
            .in('id', userIds);
        
        if (!error && profiles && profiles.length > 0) {
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
            tooltip.textContent = userIds.length + ' ' + reactionType + (userIds.length > 1 ? 's' : '');
        }
    } catch (err) {
        tooltip.textContent = userIds.length + ' ' + reactionType + (userIds.length > 1 ? 's' : '');
    }
    
    var rect = element.getBoundingClientRect();
    tooltip.style.left = (rect.left + rect.width / 2) + 'px';
    tooltip.style.top = (rect.top - 40) + 'px';
    tooltip.style.transform = 'translateX(-50%)';
    
    document.body.appendChild(tooltip);
    
    setTimeout(function() {
        hideReactionTooltip();
    }, 2000);
}

function hideReactionTooltip() {
    var tooltip = document.querySelector('.reaction-tooltip');
    if (tooltip) tooltip.remove();
}

async function showReactionUsers(messageId, reactionType) {
    var reactions = messageReactions.get(messageId);
    if (!reactions) return;
    
    var userIds = reactionType === 'like' ? reactions.likes : reactions.loves;
    if (userIds.length === 0) return;
    
    var existingModal = document.querySelector('.online-users-modal');
    if (existingModal) existingModal.remove();
    
    try {
        var { data: profiles, error } = await supabase
            .from('profiles')
            .select('full_name, email')
            .in('id', userIds);
        
        if (error) {
            console.error("Error fetching user profiles:", error);
            return;
        }
        
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
        
        modal.querySelector('.close-online-modal').onclick = function() { modal.remove(); };
        
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

function showContextMenu(x, y, messageId, senderName, messageContent, messageType) {
    var existingMenu = document.querySelector('.context-menu');
    if (existingMenu) existingMenu.remove();
    
    var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
    var senderId = messageEl ? messageEl.dataset.senderId : null;
    
    // UPDATED: Small Admin can delete ANY user's messages
    var canDelete = isAdmin || isSmallAdmin || (senderId === currentUser.id);
    
    var contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu desktop';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    
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
    
    setTimeout(function() {
        document.addEventListener('click', function removeMenu(e) {
            if (!contextMenu.contains(e.target)) {
                contextMenu.remove();
                document.removeEventListener('click', removeMenu);
            }
        });
    }, 100);
}

function setupMessageEventListeners() {
    var messages = document.querySelectorAll('.message');
    
    messages.forEach(function(msg) {
        msg.removeEventListener('touchstart', handleTouchStart);
        msg.removeEventListener('touchend', handleTouchEnd);
        msg.removeEventListener('touchmove', handleTouchMove);
        msg.removeEventListener('touchcancel', handleTouchCancel);
        msg.removeEventListener('click', handleMessageClick);
        msg.removeEventListener('dblclick', handleMessageDoubleClick);
        msg.removeEventListener('contextmenu', handleMessageRightClick);
        
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
    if (isRecordingOperation) return;
    
    var touch = e.touches[0];
    touchStartX = touch.clientX;
    currentSwipeElement = this;
    
    if (longPressTimer) clearTimeout(longPressTimer);
    
    longPressTimer = setTimeout(function() {
        handleLongPress(currentSwipeElement);
    }, longPressThreshold);
}

function handleTouchMove(e) {
    if (!currentSwipeElement) return;
    
    var touch = e.touches[0];
    var diffX = touch.clientX - touchStartX;
    
    if (Math.abs(diffX) > 20) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }
    
    if (highlightedMessages.size === 0 && diffX > 0 && diffX < 150) {
        e.preventDefault();
        currentSwipeElement.style.transform = 'translateX(' + diffX + 'px)';
        
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
    
    currentSwipeElement.style.transform = '';
    
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
    
    toggleMessageHighlight(messageId);
    
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
}

function handleMessageClick(e) {
    var currentTime = new Date().getTime();
    var tapLength = currentTime - lastTapTime;
    
    if (tapLength < doubleTapThreshold && tapLength > 0) {
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
    
    showContextMenu(e.pageX, e.pageY, messageId, senderName, messageContent, messageType);
}

function handleDoubleTap(messageEl) {
    var messageId = messageEl.dataset.messageId;
    var reactions = messageReactions.get(messageId);
    var hasLove = reactions && reactions.loves.includes(currentUser.id);
    
    if (hasLove) {
        toggleReaction(messageId, 'love');
    } else {
        toggleReaction(messageId, 'love');
    }
}

window.handleReply = function(messageId, senderName, messageContent, messageType) {
    console.log("📝 Handling reply to message:", messageId);
    
    clearAllHighlights();
    
    window.showReplyInput(messageId, senderName, messageContent, messageType);
    
    var contextMenu = document.querySelector('.context-menu');
    if (contextMenu) contextMenu.remove();
};

// ================= UPDATED HANDLE DELETE - Small Admin can delete ANY user's messages =================
window.handleDelete = async function(messageId) {
    var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
    var senderId = messageEl ? messageEl.dataset.senderId : null;
    
    // UPDATED: Small Admin (isSmallAdmin) can delete ANY user's messages
    if (!isAdmin && !isSmallAdmin && senderId !== currentUser.id) {
        showNotification("❌ You can only delete your own messages", "error");
        return;
    }
    
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

// ================= UPDATED HANDLE DELETE SELECTED - Small Admin can delete ANY user's messages =================
window.handleDeleteSelected = async function() {
    if (highlightedMessages.size === 0) return;
    
    // UPDATED: Small Admin (isSmallAdmin) can delete ANY user's messages
    var deletableMessages = [];
    var nonDeletableMessages = [];
    
    highlightedMessages.forEach(function(messageId) {
        var messageEl = document.querySelector('.message[data-message-id="' + messageId + '"]');
        var senderId = messageEl ? messageEl.dataset.senderId : null;
        
        if (isAdmin || isSmallAdmin || senderId === currentUser.id) {
            deletableMessages.push(messageId);
        } else {
            nonDeletableMessages.push(messageId);
        }
    });
    
    if (deletableMessages.length === 0) {
        showNotification("❌ You can only delete your own messages", "error");
        clearAllHighlights();
        return;
    }
    
    if (nonDeletableMessages.length > 0) {
        showNotification(`⚠️ ${nonDeletableMessages.length} message(s) not yours - skipping`, "warning", 3000);
    }
    
    if (await confirmDelete(deletableMessages.length + ' message' + (deletableMessages.length > 1 ? 's' : ''))) {
        var successCount = 0;
        var failCount = 0;
        
        for (var i = 0; i < deletableMessages.length; i++) {
            try {
                var { error } = await supabase
                    .from('chat_messages')
                    .delete()
                    .eq('id', deletableMessages[i]);
                
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

function confirmDelete(item) {
    if (!item) item = 'this message';
    
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
    else if (type === 'warning') iconClass = 'fa-exclamation-triangle';
    
    notification.innerHTML = '\
        <i class="fas ' + iconClass + '"></i>\
        <span>' + message + '</span>\
    ';
    document.body.appendChild(notification);
    
    setTimeout(function() {
        notification.remove();
    }, duration);
}

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

function setupClickOutsideCancel() {
    document.addEventListener('click', function(e) {
        if (highlightedMessages.size > 0) return;
        if (isRecordingOperation) return;
        if (!replyingTo && !pendingReply) return;
        
        var clickedElement = e.target;
        
        var isReplyElement = 
            clickedElement.closest('.reply-indicator') ||
            clickedElement.closest('#messageInput') ||
            clickedElement.closest('.media-btn') ||
            clickedElement.closest('#sendBtn') ||
            clickedElement.closest('#voiceBtn') ||
            clickedElement.closest('#imageBtn') ||
            clickedElement.closest('#videoBtn') ||
            clickedElement.closest('#fileInput') ||
            clickedElement.closest('.chat-input-area') ||
            clickedElement.closest('.message');
        
        if (isReplyElement) {
            console.log("📝 Click on reply-related element - preserving reply");
            return;
        }
        
        var isReplyButton = clickedElement.closest('button') && 
                           clickedElement.closest('button').innerHTML && 
                           clickedElement.closest('button').innerHTML.includes('fa-reply');
        
        if (isReplyButton) {
            console.log("📝 Click on reply button - preserving reply");
            return;
        }
        
        console.log("📝 Click outside - cancelling reply");
        cancelReply();
    }, true);
}

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
    
    var messagesContainer = document.getElementById('messages');
    messagesContainer.parentNode.insertBefore(indicator, messagesContainer);
    
    if (replyingTo) {
        pendingReply = {
            id: replyingTo.id,
            name: senderName,
            content: messageContent,
            type: messageType
        };
        
        sessionStorage.setItem('replyingTo', JSON.stringify(pendingReply));
        console.log("📝 Reply saved to sessionStorage and pendingReply:", pendingReply);
    }
    
    document.getElementById('cancelReplyBtn').addEventListener('click', function(e) {
        e.stopPropagation();
        cancelReply();
    });
    
    var messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.classList.add('replying');
        messageInput.focus();
        
        messageInput.style.animation = 'none';
        messageInput.offsetHeight;
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
    
    sessionStorage.removeItem('replyingTo');
}

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
        
        // UPDATED: Set both isAdmin and isSmallAdmin
        isAdmin = data.role === 'admin';
        isSmallAdmin = data.role === 'small_admin';
        console.log("User role:", data.role, "isAdmin:", isAdmin, "isSmallAdmin:", isSmallAdmin);
        
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

async function loadGroupMessages() {
    try {
        var messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';
        
        var query;
        
        if (isAdmin && currentChatPartner) {
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
        } else if (!isAdmin && !isSmallAdmin) {
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
            console.log("📨 Loading group messages for admin/small admin");
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
        
        await loadReactions();
        
        setTimeout(function() {
            var firstUnreadId = findFirstUnreadMessage();
            if (firstUnreadId) {
                scrollToFirstUnread();
            } else {
                scrollToBottom();
            }
        }, 500);
        
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

window.showReplyInput = function(parentId, senderName, messageContent, messageType) {
    console.log("📝 Show reply input for message:", parentId);
    
    if (replyingTo || pendingReply) {
        cancelReply();
    }
    
    replyingTo = { id: parentId, name: senderName };
    pendingReply = { id: parentId, name: senderName, content: messageContent, type: messageType };
    
    console.log("📝 Set pendingReply:", pendingReply);
    
    createReplyIndicator(senderName, messageContent, messageType);
};

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
        
        var statusIndicator = '';
        if (isSent) {
            if (status === 'seen') {
                statusIndicator = '<span class="message-status" style="color: #3498db;"> ✓✓</span>';
            } else {
                statusIndicator = '<span class="message-status" style="color: #000000;"> ✓</span>';
            }
        }
        
        if (isSent) {
            html += '\
                <div class="message sent" data-message-id="' + msg.id + '" data-sender="' + senderName + '" data-sender-id="' + msg.sender_id + '">\
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">\
                        <small style="font-weight: bold;">You ' + (messageTypeLabel ? '• ' + messageTypeLabel : '') + '</small>\
                    </div>\
                    ' + renderQuotedMessage(msg.parent) + '\
                    <div class="message-content-wrapper">\
                        <div class="message-content">' + renderMessageContent(msg) + '</div>\
                    </div>\
                    <span class="time">' + timeStr + statusIndicator + '</span>\
                </div>\
            ';
        } else {
            html += '\
                <div class="message received" data-message-id="' + msg.id + '" data-sender="' + senderName + '" data-sender-id="' + msg.sender_id + '">\
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">\
                        <small style="font-weight: bold;">' + senderName + crown + ' ' + (messageTypeLabel ? '• ' + messageTypeLabel : '') + '</small>\
                    </div>\
                    ' + renderQuotedMessage(msg.parent) + '\
                    <div class="message-content-wrapper">\
                        <div class="message-content">' + renderMessageContent(msg) + '</div>\
                    </div>\
                    <span class="time">' + timeStr + '</span>\
                </div>\
            ';
        }
    });
    
    container.innerHTML = html;
    
    disableTextSelection();
    
    messageReactions.forEach(function(reactions, messageId) {
        updateMessageReactions(messageId);
    });
    
    setTimeout(function() {
        setupMessageEventListeners();
    }, 100);
}

function renderQuotedMessage(parentMsg) {
    if (!parentMsg) return '';
    
    console.log("📝 Rendering quoted message:", parentMsg);
    
    var senderName = parentMsg.sender ? (parentMsg.sender.full_name || parentMsg.sender.email || 'Unknown') : 'Unknown';
    var contentPreview = getMessagePreview(parentMsg);
    
    return '\
        <div class="quoted-message" onclick="window.scrollToMessage(\'' + parentMsg.id + '\')" style="cursor: pointer;">\
            <div class="quoted-sender">' + senderName + '</div>\
            <div class="quoted-content">' + contentPreview + '</div>\
        </div>\
    ';
}

function renderMessageContent(msg) {
    if (msg.message_type === 'text') {
        var textWithBreaks = (msg.content || '').replace(/\n/g, '<br>');
        return '<p style="white-space: pre-wrap; word-wrap: break-word; word-break: break-word; line-height: 1.5; margin: 0; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;">' + textWithBreaks + '</p>';
    }
    
    if (msg.message_type === 'image') {
        var imageUrl = safeUrl(msg.file_url);
        if (!imageUrl) return '<p>Image not available</p>';
        
        if (isCloudinaryUrl(imageUrl)) {
            const optimizedUrl = getOptimizedCloudinaryUrl(imageUrl, { width: 400, height: 400, crop: 'limit' });
            return '<img src="' + optimizedUrl + '" alt="Image" onclick="window.open(\'' + imageUrl + '\')" style="cursor: pointer; max-width: 100%; border-radius: 12px;" loading="lazy" onerror="this.onerror=null; this.src=\'' + imageUrl + '\';">';
        } else {
            return '<img src="' + imageUrl + '" alt="Image" onclick="window.open(\'' + imageUrl + '\')" style="cursor: pointer; max-width: 100%; border-radius: 12px;" loading="lazy">';
        }
    }
    
    if (msg.message_type === 'video') {
        var videoUrl = safeUrl(msg.file_url);
        if (!videoUrl) return '<p>Video not available</p>';
        return '<video controls style="max-width: 100%; width: 280px; height: auto; border-radius: 12px; background: #000;" preload="metadata"><source src="' + videoUrl + '"></video>';
    }
    
    if (msg.message_type === 'audio') {
        var audioUrl = safeUrl(msg.file_url);
        if (!audioUrl) return '<p>Audio not available</p>';
        return '<audio controls src="' + audioUrl + '" style="width: 280px; height: 44px; border-radius: 8px;"></audio>';
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
        ((!isAdmin && !isSmallAdmin) && (newMessage.receiver_id === currentUser.id || !newMessage.receiver_id));
    
    if (isRelevant) {
        loadGroupMessages();
    }
}

async function resizeImage(file, maxWidth = 800, maxHeight = 800, quality = 0.9) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round(height * (maxWidth / width));
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round(width * (maxHeight / height));
                        height = maxHeight;
                    }
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    const resizedFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });
                    console.log(`🖼️ Image resized: ${(file.size/1024).toFixed(2)}KB → ${(resizedFile.size/1024).toFixed(2)}KB`);
                    resolve(resizedFile);
                }, file.type, quality);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

async function compressVideo(file, maxSizeMB = 10) {
    return new Promise((resolve, reject) => {
        if (file.size <= maxSizeMB * 1024 * 1024) {
            resolve(file);
            return;
        }
        
        console.log(`Video size: ${(file.size / (1024*1024)).toFixed(2)}MB`);
        
        if (file.size > 20 * 1024 * 1024) {
            alert("Video is large (>20MB). It may take time to upload and might be compressed.");
        }
        
        resolve(file);
    });
}

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
    
    if (file.type.startsWith('image/')) {
        currentFileType = 'image';
        showNotification('🖼️ Resizing image...', 'info', 2000);
        
        resizeImage(file, 800, 800, 0.9).then(resizedFile => {
            currentFile = resizedFile;
            console.log(`Image resized: ${(file.size/1024).toFixed(2)}KB → ${(resizedFile.size/1024).toFixed(2)}KB`);
            showImagePreview(resizedFile);
        }).catch(err => {
            console.error("Error resizing image:", err);
            currentFile = file;
            showImagePreview(file);
        });
        
    } else if (file.type.startsWith('video/')) {
        currentFileType = 'video';
        showNotification('🎥 Processing video...', 'info', 2000);
        
        compressVideo(file, 10).then(compressedFile => {
            currentFile = compressedFile;
            console.log(`Video processed: ${(file.size/(1024*1024)).toFixed(2)}MB → ${(compressedFile.size/(1024*1024)).toFixed(2)}MB`);
            showVideoPreview(compressedFile);
        }).catch(err => {
            console.error("Error compressing video:", err);
            currentFile = file;
            showVideoPreview(file);
        });
        
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
        
        var img = new Image();
        img.src = e.target.result;
        img.onload = function() {
            var displayWidth = Math.min(80, img.width);
            var displayHeight = (img.height / img.width) * displayWidth;
            
            previewDiv.innerHTML = '\
                <img src="' + e.target.result + '" style="max-width: ' + displayWidth + 'px; max-height: ' + displayHeight + 'px; border-radius: 4px; object-fit: cover;">\
                <div style="flex: 1; min-width: 0;">\
                    <span style="color: var(--text-light); font-size: 14px; word-break: break-word; display: block;">' + file.name + '</span>\
                    <span style="color: var(--text-muted); font-size: 11px;">Size: ' + (file.size / 1024).toFixed(1) + 'KB (resized for Cloudinary)</span>\
                </div>\
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
            <div style="flex: 1; min-width: 0;">\
                <span style="color: var(--text-light); font-size: 14px; word-break: break-word; display: block;">' + file.name + '</span>\
                <span style="color: var(--text-muted); font-size: 11px;">Size: ' + (file.size / (1024*1024)).toFixed(2) + 'MB (will upload to Cloudinary)</span>\
            </div>\
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

async function uploadFile(file) {
    try {
        if (!file) throw new Error("No file to upload");
        
        console.log("📤 Uploading to Cloudinary:", file.name, file.type);
        
        let folder = CLOUDINARY_CONFIG.folder;
        let resourceType = 'auto';
        
        if (file.type.startsWith('image/')) {
            folder += '/' + CLOUDINARY_CONFIG.subFolders.image;
            resourceType = 'image';
        } else if (file.type.startsWith('video/')) {
            folder += '/' + CLOUDINARY_CONFIG.subFolders.video;
            resourceType = 'video';
        } else if (file.type.startsWith('audio/')) {
            folder += '/' + CLOUDINARY_CONFIG.subFolders.audio;
            resourceType = 'video';
        }
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
        formData.append('folder', folder);
        
        showNotification('📤 Uploading to Cloudinary...', 'info', 2000);
        
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
        
        showNotification('✅ Uploaded to Cloudinary', 'success', 1500);
        
        return data.secure_url;
        
    } catch (err) {
        console.error("❌ Error uploading to Cloudinary:", err);
        showNotification('Failed to upload to Cloudinary: ' + err.message, 'error', 3000);
        throw err;
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
            const fileName = 'voice-message-' + Date.now() + '.webm';
            currentFile = new File([recordedAudio], fileName, { type: 'audio/webm' });
            currentFileType = 'audio';
            previewDiv.remove();
            await sendMessage();
        }
    });
}

function setupChatListeners() {
    var sendBtn = document.getElementById('sendBtn');
    var messageInput = document.getElementById('messageInput');
    var imageBtn = document.getElementById('imageBtn');
    var videoBtn = document.getElementById('videoBtn');
    var voiceBtn = document.getElementById('voiceBtn');
    var fileInput = document.getElementById('fileInput');
    
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    
    if (messageInput) {
        var isMobile = ('ontouchstart' in window) || window.innerWidth <= 768;
        console.log("📱 Mobile mode:", isMobile);
        
        var newTextarea = messageInput.cloneNode(true);
        messageInput.parentNode.replaceChild(newTextarea, messageInput);
        messageInput = newTextarea;
        
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (isMobile) {
                    return true;
                } else {
                    if (!e.shiftKey) {
                        console.log("💻 Desktop: Enter - sending message");
                        e.preventDefault();
                        sendMessage();
                        return false;
                    }
                }
            }
        });
        
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            
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
        
        messageInput.addEventListener('blur', function() {
            if (this.value === '') {
                this.style.height = 'auto';
            }
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

async function sendMessage() {
    var messageInput = document.getElementById('messageInput');
    var message = messageInput.value;
    
    if (!message.trim() && !currentFile && !recordedAudio) {
        alert("Please enter a message or select a file");
        return;
    }
    
    var sendBtn = document.getElementById('sendBtn');
    var originalText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    
    var replyToSend = pendingReply ? JSON.parse(JSON.stringify(pendingReply)) : null;
    
    console.log("📝 Final reply being sent:", replyToSend);
    
    try {
        var messageData = {
            sender_id: currentUser.id,
            message_type: 'text',
            content: message,
            created_at: new Date().toISOString(),
            read_at: null
        };
        
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
                console.log("Processing file upload to Cloudinary...");
                var fileUrl = await uploadFile(currentFile);
                messageData.message_type = currentFileType;
                messageData.content = '';
                messageData.file_url = fileUrl;
                currentFile = null;
                console.log("Cloudinary upload complete, URL:", fileUrl);
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
                console.log("Processing audio upload to Cloudinary...");
                var fileUrl = await uploadFile(recordedAudio);
                messageData.message_type = 'audio';
                messageData.content = '';
                messageData.file_url = fileUrl;
                
                if (recordedAudioUrl) {
                    URL.revokeObjectURL(recordedAudioUrl);
                }
                recordedAudio = null;
                recordedAudioUrl = null;
                
                console.log("Cloudinary audio upload complete, URL:", fileUrl);
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
        messageInput.style.height = 'auto';
        
        if (replyToSend) {
            cancelReply();
        }
        
        var mediaPreview = document.getElementById('mediaPreview');
        if (mediaPreview) mediaPreview.remove();
        
        var audioPreview = document.getElementById('audioPreview');
        if (audioPreview) audioPreview.remove();
        
        showNotification('✅ Message sent', 'success', 2000);
        
    } catch (err) {
        console.error("Error sending message:", err);
        alert("Failed to send message: " + (err.message || "Unknown error"));
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
}

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