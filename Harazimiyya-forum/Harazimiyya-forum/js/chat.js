// js/chat.js - Complete Group Chat with Swipe-to-Reply, Native Delete Menu, Smart Scroll, and Jump to Bottom
console.log("💬 Chat page loading...");

// Global variables
let currentUser = null;
let isAdmin = false;
let messagesSubscription = null;
let presenceSubscription = null;
let onlineUsers = new Set();
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
let touchStartX = 0;
let touchCurrentX = 0;
let currentSwipeElement = null;
let swipeThreshold = 80; // Minimum swipe distance to trigger reply
let allMembers = []; // Store all members for search

// Smart scroll variables
let showJumpToBottom = false;
let hasUnreadMessages = false;
let firstUnreadMessageId = null;

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
        
        // Create jump to bottom button on page load
        setTimeout(() => {
            createJumpToBottomButton();
        }, 1000);
    }
    
    initializeChat();
});

// ================= JUMP TO BOTTOM BUTTON FUNCTIONS =================
function createJumpToBottomButton() {
    // Remove existing button if any
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
        showJumpToBottom = false;
    });
    
    document.body.appendChild(button);
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// ================= SMART SCROLL POSITIONING FUNCTIONS =================
function findFirstUnreadMessage() {
    const messages = document.querySelectorAll('.message.received');
    firstUnreadMessageId = null;
    hasUnreadMessages = false;
    
    for (let msg of messages) {
        const timeSpan = msg.querySelector('.time');
        // Check if message is unread (has ✓ not ✓✓)
        if (timeSpan && timeSpan.innerHTML.includes(' ✓') && !timeSpan.innerHTML.includes('✓✓')) {
            firstUnreadMessageId = msg.dataset.messageId;
            hasUnreadMessages = true;
            break;
        }
    }
    
    return firstUnreadMessageId;
}

function scrollToFirstUnread() {
    if (firstUnreadMessageId) {
        const messageElement = document.querySelector(`.message[data-message-id="${firstUnreadMessageId}"]`);
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Highlight the message briefly
            messageElement.style.backgroundColor = 'rgba(12, 143, 95, 0.2)';
            setTimeout(() => {
                messageElement.style.backgroundColor = '';
            }, 2000);
        }
    } else {
        // If no unread, scroll to bottom
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
    
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            sidebar.classList.add('active');
            if (overlay) overlay.classList.add('active');
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
}

// ================= ONLINE COUNTER =================
async function setupPresenceTracking() {
    try {
        const channel = window.supabase.channel('online-users', {
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
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                newPresences.forEach(p => { if (p.user_id !== currentUser.id) onlineUsers.add(p.user_id); });
                updateOnlineCount();
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                leftPresences.forEach(p => { if (p.user_id !== currentUser.id) onlineUsers.delete(p.user_id); });
                updateOnlineCount();
            });

        await channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({ user_id: currentUser.id, online_at: new Date().toISOString() });
            }
        });

        presenceSubscription = channel;
    } catch (err) {
        console.error("Error setting up presence tracking:", err);
    }
}

// ================= SHOW ONLINE USERS MODAL =================
async function showOnlineUsers() {
    try {
        // Get all online user IDs
        const onlineUserIds = Array.from(onlineUsers);
        onlineUserIds.push(currentUser.id); // Include current user
        
        // Fetch profiles of online users
        const { data: profiles, error } = await window.supabase
            .from('profiles')
            .select('id, full_name, email, role, state')
            .in('id', onlineUserIds);
        
        if (error) throw error;
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'online-users-modal';
        
        let usersHtml = '';
        profiles.forEach(user => {
            const isCurrentUser = user.id === currentUser.id;
            const crown = user.role === 'admin' ? ' 👑' : '';
            const userState = user.state ? ` • ${user.state}` : '';
            
            usersHtml += `
                <div class="online-user-item">
                    <div class="online-user-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="online-user-info">
                        <h4>${user.full_name || user.email}${crown} ${isCurrentUser ? '(You)' : ''}</h4>
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
        
        // Close modal handlers
        modal.querySelector('.close-online-modal').onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
    } catch (err) {
        console.error("Error showing online users:", err);
        showNotification('Error loading online users', 'error');
    }
}

// ================= UPDATED ONLINE COUNTER =================
function updateOnlineCount() {
    const onlineCountEl = document.getElementById('onlineCount');
    if (onlineCountEl) {
        const count = onlineUsers.size + 1;
        onlineCountEl.innerHTML = `<i class="fas fa-circle" style="font-size: 8px; color: #10b981;"></i> ${count} online`;
        
        // Make it clickable
        onlineCountEl.style.cursor = 'pointer';
        onlineCountEl.onclick = showOnlineUsers;
    }
}

// ================= MAIN CHAT FUNCTIONS =================
async function loadChatData() {
    try {
        const { data: { user }, error: userError } = await window.supabase.auth.getUser();
        if (userError || !user) {
            window.location.href = '../index.html';
            return;
        }
        
        currentUser = user;
        console.log("User logged in:", user.email);
        console.log("User ID:", currentUser.id);
        
        await loadUserProfile(user.id);
        await setupPresenceTracking();
        setupRealtimeSubscription();
        setupChatListeners();
        setupLogoutButtons();
        
        // Setup scroll listener for marking messages as read AND jump button
        setupScrollListener();
        
    } catch (err) {
        console.error("Chat initialization error:", err);
    }
}

async function loadUserProfile(userId) {
    try {
        const { data, error } = await window.supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        
        isAdmin = data.role === 'admin';
        console.log("User role:", data.role, "isAdmin:", isAdmin);
        
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = data.full_name || 'Member';
        
        // IMPORTANT FIX: Make sure container is visible and load members for admin
        const container = document.getElementById('memberSelectorContainer');
        if (container) {
            if (isAdmin) {
                console.log("✅ Admin detected - showing member selector");
                container.style.display = 'block';
                await loadMembers();
            } else {
                console.log("👤 Regular member - hiding member selector");
                container.style.display = 'none';
            }
        } else {
            console.error("❌ memberSelectorContainer not found in HTML!");
        }
        
        await loadGroupMessages();
        
    } catch (err) {
        console.error("Error loading profile:", err);
    }
}

// ================= SEARCHABLE MEMBER DROPDOWN =================
async function loadMembers() {
    try {
        console.log("📋 Loading members for admin private messaging...");
        
        const { data, error } = await window.supabase
            .from('profiles')
            .select('id, full_name, email, state')
            .eq('is_approved', true)
            .order('full_name');
        
        if (error) throw error;
        
        allMembers = data || [];
        console.log(`✅ Loaded ${allMembers.length} members for search`);
        
        // Create searchable dropdown
        createSearchableMemberDropdown();
        
    } catch (err) {
        console.error("Error loading members:", err);
    }
}

function createSearchableMemberDropdown() {
    const container = document.getElementById('memberSelectorContainer');
    if (!container) {
        console.error("❌ Cannot create dropdown - container not found");
        return;
    }
    
    console.log("🔍 Creating searchable member dropdown");
    
    // Clear container first
    container.innerHTML = '';
    
    // Create search dropdown HTML
    container.innerHTML = `
        <div class="member-search-container">
            <div class="member-search-input-wrapper">
                <i class="fas fa-search member-search-icon"></i>
                <input type="text" class="member-search-input" id="memberSearchInput" 
                       placeholder="🔍 Search members... (type to search)" autocomplete="off">
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
    
    if (!searchInput || !searchResults || !clearBtn) {
        console.error("❌ Search elements not created properly");
        return;
    }
    
    // Search function
    function searchMembers(query) {
        query = query.toLowerCase().trim();
        
        if (!query) {
            // Show group chat option when empty
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
        
        // Filter members
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
        
        // Build results HTML
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
    
    // Handle input
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        searchMembers(query);
        searchResults.classList.add('show');
        
        // Show/hide clear button
        if (query.length > 0) {
            clearBtn.classList.add('visible');
        } else {
            clearBtn.classList.remove('visible');
        }
    });
    
    // Handle focus
    searchInput.addEventListener('focus', () => {
        searchMembers(searchInput.value);
        searchResults.classList.add('show');
    });
    
    // Handle click outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            searchResults.classList.remove('show');
        }
    });
    
    // Handle result selection
    searchResults.addEventListener('click', (e) => {
        const resultItem = e.target.closest('.member-search-result-item');
        if (!resultItem) return;
        
        const memberId = resultItem.dataset.id;
        const memberName = resultItem.querySelector('.member-result-name')?.textContent || '';
        const memberEmail = resultItem.querySelector('.member-result-email')?.textContent || '';
        
        if (memberId === '') {
            // Group chat selected
            selectedMemberId = null;
            currentChatPartner = null;
            searchInput.value = '';
            searchInput.placeholder = '👥 Group Chat (All Members)';
            console.log("✅ Selected: Group Chat");
        } else {
            // Member selected
            selectedMemberId = memberId;
            currentChatPartner = memberId;
            searchInput.value = memberName.replace('👥 ', '').replace('👤 ', '');
            searchInput.placeholder = `💬 Chatting with ${memberName}`;
            console.log("✅ Selected: Private chat with:", memberName, memberId);
        }
        
        // Hide results and clear button
        searchResults.classList.remove('show');
        clearBtn.classList.remove('visible');
        
        // Reload messages for this selection
        loadGroupMessages();
    });
    
    // Handle clear button
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.placeholder = '🔍 Search members... (type to search)';
        selectedMemberId = null;
        currentChatPartner = null;
        clearBtn.classList.remove('visible');
        searchMembers('');
        searchResults.classList.add('show');
        
        // Reload group messages
        loadGroupMessages();
    });
    
    // Handle Enter key
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Select first result if available
            const firstResult = searchResults.querySelector('.member-search-result-item');
            if (firstResult) {
                firstResult.click();
            }
        }
    });
    
    // Initialize with group chat
    searchMembers('');
    console.log("✅ Searchable dropdown created successfully");
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
            query = window.supabase
                .from('chat_messages')
                .select(`*, 
                    sender:sender_id(id, full_name, email, role), 
                    parent:parent_id(*, sender:sender_id(id, full_name, email, role))`)
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatPartner}),and(sender_id.eq.${currentChatPartner},receiver_id.eq.${currentUser.id})`)
                .order('created_at', { ascending: true });
        } else if (!isAdmin) {
            // Regular member - show group messages AND their private messages
            console.log("📨 Loading messages for regular member");
            query = window.supabase
                .from('chat_messages')
                .select(`*, 
                    sender:sender_id(id, full_name, email, role), 
                    parent:parent_id(*, sender:sender_id(id, full_name, email, role))`)
                .or(`receiver_id.is.null,and(sender_id.eq.${currentUser.id}),and(receiver_id.eq.${currentUser.id})`)
                .order('created_at', { ascending: true });
        } else {
            // Admin viewing group chat (default)
            console.log("📨 Loading group messages for admin");
            query = window.supabase
                .from('chat_messages')
                .select(`*, 
                    sender:sender_id(id, full_name, email, role), 
                    parent:parent_id(*, sender:sender_id(id, full_name, email, role))`)
                .is('receiver_id', null)
                .order('created_at', { ascending: true });
        }
        
        const { data: messages, error } = await query;
        
        if (error) throw error;
        
        if (!messages || messages.length === 0) {
            if (isAdmin && currentChatPartner) {
                // Get the member's name for better message
                const member = allMembers.find(m => m.id === currentChatPartner);
                
                messagesContainer.innerHTML = `<div class="empty-chat"><i class="fas fa-comments"></i><h3>No messages yet</h3><p>Start a private conversation with ${member?.full_name || 'this member'}!</p></div>`;
            } else {
                messagesContainer.innerHTML = `<div class="empty-chat"><i class="fas fa-comments"></i><h3>No messages yet</h3><p>Be the first to send a message!</p></div>`;
            }
            return;
        }
        
        renderMessages(messages);
        
        // Smart scroll positioning after messages load
        setTimeout(() => {
            findFirstUnreadMessage();
            if (firstUnreadMessageId) {
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
        
        // Show/hide jump to bottom button
        const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        const jumpBtn = document.getElementById('jumpToBottomBtn');
        
        if (jumpBtn) {
            if (!isNearBottom) {
                jumpBtn.style.display = 'flex';
                showJumpToBottom = true;
            } else {
                jumpBtn.style.display = 'none';
                showJumpToBottom = false;
            }
        }
    });
}

async function markAllVisibleMessagesAsRead() {
    const messageElements = document.querySelectorAll('.message');
    if (messageElements.length === 0) {
        console.log("No messages found");
        return;
    }
    
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
    
    if (unreadMessageIds.length === 0) {
        console.log("No unread messages to mark");
        return;
    }
    
    console.log(`📖 Attempting to mark ${unreadMessageIds.length} messages as read:`, unreadMessageIds);
    
    const { error } = await window.supabase
        .from('chat_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadMessageIds)
        .is('read_at', null);
    
    if (error) {
        console.error("❌ Error marking messages as read:", error);
    } else {
        console.log(`✅ Successfully marked ${unreadMessageIds.length} messages as read`);
        
        unreadMessageIds.forEach(id => {
            const msgEl = document.querySelector(`.message[data-message-id="${id}"]`);
            if (msgEl && msgEl.classList.contains('received')) {
                const timeSpan = msgEl.querySelector('.time');
                if (timeSpan && !timeSpan.innerHTML.includes('✓✓')) {
                    timeSpan.innerHTML = timeSpan.innerHTML.replace('✓', '✓✓');
                }
            }
        });
        
        // Update unread status
        hasUnreadMessages = false;
    }
}

// ================= FUNCTION TO SCROLL TO MESSAGE =================
window.scrollToMessage = function(messageId) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight the message temporarily
        messageElement.style.backgroundColor = 'rgba(12, 143, 95, 0.3)';
        setTimeout(() => {
            messageElement.style.backgroundColor = '';
        }, 2000);
    }
};

// ================= SWIPE TO REPLY HANDLERS =================
function setupSwipeHandlers() {
    const messages = document.querySelectorAll('.message');
    
    messages.forEach(msg => {
        // Remove existing listeners to prevent duplicates
        msg.removeEventListener('touchstart', handleTouchStart);
        msg.removeEventListener('touchmove', handleTouchMove);
        msg.removeEventListener('touchend', handleTouchEnd);
        msg.removeEventListener('touchcancel', handleTouchCancel);
        
        // Add new listeners
        msg.addEventListener('touchstart', handleTouchStart, { passive: true });
        msg.addEventListener('touchmove', handleTouchMove, { passive: false });
        msg.addEventListener('touchend', handleTouchEnd);
        msg.addEventListener('touchcancel', handleTouchCancel);
    });
}

function handleTouchStart(e) {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchCurrentX = touchStartX;
    currentSwipeElement = this;
    
    // Remove any existing swipe indicator
    const existingIndicator = document.querySelector('.swipe-reply-indicator');
    if (existingIndicator) existingIndicator.remove();
}

function handleTouchMove(e) {
    if (!currentSwipeElement) return;
    
    const touch = e.touches[0];
    touchCurrentX = touch.clientX;
    const diffX = touchCurrentX - touchStartX;
    
    // Only allow right swipe (positive diffX) for reply
    if (diffX > 0 && diffX < 150) {
        e.preventDefault();
        
        // Apply transform to show swipe progress
        currentSwipeElement.style.transform = `translateX(${diffX}px)`;
        currentSwipeElement.style.transition = 'none';
        
        // Show or update swipe indicator
        let indicator = document.querySelector('.swipe-reply-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'swipe-reply-indicator';
            indicator.innerHTML = '<i class="fas fa-reply"></i> Reply';
            currentSwipeElement.appendChild(indicator);
        }
        
        // Position indicator based on swipe distance
        indicator.style.right = `${-diffX - 70}px`;
        indicator.style.opacity = Math.min(diffX / 50, 1);
    }
}

function handleTouchEnd(e) {
    if (!currentSwipeElement) return;
    
    const diffX = touchCurrentX - touchStartX;
    
    // Reset transform
    currentSwipeElement.style.transform = '';
    currentSwipeElement.style.transition = 'transform 0.3s ease';
    
    // Remove swipe indicator
    const indicator = document.querySelector('.swipe-reply-indicator');
    if (indicator) indicator.remove();
    
    // Check if swipe was sufficient to trigger reply
    if (diffX > swipeThreshold) {
        const messageId = currentSwipeElement.dataset.messageId;
        const senderName = currentSwipeElement.querySelector('small')?.textContent.split('•')[0].trim() || 'User';
        showReplyInput(messageId, senderName);
    }
    
    currentSwipeElement = null;
    touchStartX = 0;
    touchCurrentX = 0;
}

function handleTouchCancel() {
    if (currentSwipeElement) {
        currentSwipeElement.style.transform = '';
        currentSwipeElement.style.transition = '';
        
        const indicator = document.querySelector('.swipe-reply-indicator');
        if (indicator) indicator.remove();
        
        currentSwipeElement = null;
        touchStartX = 0;
        touchCurrentX = 0;
    }
}

// ================= FIXED: RENDER MESSAGES WITH PROPER PARENT SENDER NAMES =================
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
        
        // Message type label (Group or Private)
        let messageTypeLabel = '';
        if (isGroup) messageTypeLabel = 'Group';
        else if (isPrivate) messageTypeLabel = 'Private';
        
        const isRead = msg.read_at !== null;
        const readIndicator = !isSent ? (isRead ? ' ✓✓' : ' ✓') : '';
        
        // Check if user can delete this message
        const canDelete = isAdmin || isSent;
        
        // Create options for the native menu
        const replyOption = `<li class="media-option reply-option" onclick="window.showReplyInput('${msg.id}', '${senderName}')">Reply</li>`;
        const deleteOption = canDelete ? 
            `<li class="media-option delete-option" onclick="window.deleteMessage('${msg.id}')">Delete</li>` : '';
        
        // FOR SENT MESSAGES (right side)
        if (isSent) {
            html += `
                <div class="message sent" data-message-id="${msg.id}" data-sender="${senderName}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <small style="font-weight: bold;">You ${messageTypeLabel ? '• ' + messageTypeLabel : ''}</small>
                    </div>
                    
                    ${renderQuotedMessage(msg.parent)}
                    
                    <div class="message-content-wrapper">
                        <div class="message-content">${renderMessageContent(msg)}</div>
                        
                        <!-- Three dots menu for native options -->
                        <div class="message-options">
                            <details class="options-menu">
                                <summary><i class="fas fa-ellipsis-v"></i></summary>
                                <ul class="options-list">
                                    ${replyOption}
                                    ${deleteOption}
                                </ul>
                            </details>
                        </div>
                    </div>
                    
                    <span class="time">${timeStr}${readIndicator}</span>
                </div>
            `;
        } 
        // FOR RECEIVED MESSAGES (left side)
        else {
            html += `
                <div class="message received" data-message-id="${msg.id}" data-sender="${senderName}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <small style="font-weight: bold;">${senderName}${crown} ${messageTypeLabel ? '• ' + messageTypeLabel : ''}</small>
                    </div>
                    
                    ${renderQuotedMessage(msg.parent)}
                    
                    <div class="message-content-wrapper">
                        <div class="message-content">${renderMessageContent(msg)}</div>
                        
                        <!-- Three dots menu for native options -->
                        <div class="message-options">
                            <details class="options-menu">
                                <summary><i class="fas fa-ellipsis-v"></i></summary>
                                <ul class="options-list">
                                    ${replyOption}
                                    ${deleteOption}
                                </ul>
                            </details>
                        </div>
                    </div>
                    
                    <span class="time">${timeStr}${readIndicator}</span>
                </div>
            `;
        }
    });
    
    container.innerHTML = html;
    
    // Setup swipe handlers after messages are rendered
    setTimeout(() => {
        setupSwipeHandlers();
    }, 100);
}

// ================= FIXED: RENDER QUOTED MESSAGE WITH PROPER SENDER NAME =================
function renderQuotedMessage(parentMsg) {
    if (!parentMsg) return '';
    
    // Get sender name from the parent message's sender object
    const senderName = parentMsg.sender?.full_name || parentMsg.sender?.email || 'Unknown';
    let contentPreview = '';
    
    // Create a preview of the message content
    if (parentMsg.message_type === 'text') {
        contentPreview = parentMsg.content && parentMsg.content.length > 50 
            ? parentMsg.content.substring(0, 50) + '...' 
            : (parentMsg.content || 'Empty message');
    } else if (parentMsg.message_type === 'image') {
        contentPreview = '📷 Image';
    } else if (parentMsg.message_type === 'video') {
        contentPreview = '🎥 Video';
    } else if (parentMsg.message_type === 'audio') {
        contentPreview = '🎵 Voice message';
    } else {
        contentPreview = '💬 Message';
    }
    
    return `
        <div class="quoted-message" onclick="window.scrollToMessage('${parentMsg.id}')" style="cursor: pointer;">
            <div class="quoted-sender">${senderName}</div>
            <div class="quoted-content">${contentPreview}</div>
        </div>
    `;
}

function renderMessageContent(msg) {
    if (msg.message_type === 'text') return `<p>${msg.content || ''}</p>`;
    if (msg.message_type === 'image') return `<img src="${msg.file_url}" alt="Image" onclick="window.open('${msg.file_url}')" style="max-width: 100%; cursor: pointer;">`;
    if (msg.message_type === 'video') return `<video controls style="max-width: 100%;"><source src="${msg.file_url}"></video>`;
    if (msg.message_type === 'audio') return `<audio controls src="${msg.file_url}" style="width: 280px; height: 40px;"></audio>`;
    return '<p>Unsupported message type</p>';
}

// ================= DELETE MESSAGE FUNCTION =================
window.deleteMessage = async function(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    try {
        // Get message details to check ownership
        const { data: message, error: fetchError } = await window.supabase
            .from('chat_messages')
            .select('sender_id')
            .eq('id', messageId)
            .single();
        
        if (fetchError) throw fetchError;
        
        // Check if user can delete (admin or owner)
        if (!isAdmin && message.sender_id !== currentUser.id) {
            alert('You can only delete your own messages');
            return;
        }
        
        const { error } = await window.supabase
            .from('chat_messages')
            .delete()
            .eq('id', messageId);
        
        if (error) throw error;
        
        console.log("✅ Message deleted:", messageId);
        loadGroupMessages(); // Refresh messages
        
    } catch (err) {
        console.error("Error deleting message:", err);
        alert("Failed to delete message: " + err.message);
    }
};

// ================= SHOW REPLY INPUT =================
window.showReplyInput = function(parentId, senderName) {
    // Remove any existing reply input
    const existingReply = document.getElementById('replyInputContainer');
    if (existingReply) existingReply.remove();
    
    replyingTo = { id: parentId, name: senderName };
    
    const chatInput = document.querySelector('.chat-input-area');
    const replyDiv = document.createElement('div');
    replyDiv.id = 'replyInputContainer';
    replyDiv.className = 'reply-input-area';
    replyDiv.innerHTML = `
        <span>Replying to ${senderName}</span>
        <button id="cancelReplyBtn" class="cancel-reply"><i class="fas fa-times"></i></button>
        <input type="text" id="replyMessageInput" placeholder="Write your reply..." autofocus>
        <button id="sendReplyBtn"><i class="fas fa-paper-plane"></i></button>
    `;
    
    chatInput.parentNode.insertBefore(replyDiv, chatInput);
    
    document.getElementById('sendReplyBtn').addEventListener('click', sendReply);
    document.getElementById('cancelReplyBtn').addEventListener('click', cancelReply);
    document.getElementById('replyMessageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendReply();
    });
    
    // Focus on input
    setTimeout(() => {
        document.getElementById('replyMessageInput').focus();
    }, 100);
};

function cancelReply() {
    const replyDiv = document.getElementById('replyInputContainer');
    if (replyDiv) replyDiv.remove();
    replyingTo = null;
}

async function sendReply() {
    const replyInput = document.getElementById('replyMessageInput');
    const message = replyInput.value.trim();
    
    if (!message || !replyingTo) return;
    
    const sendBtn = document.getElementById('sendReplyBtn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        let messageData = {
            sender_id: currentUser.id,
            message_type: 'text',
            content: message,
            created_at: new Date().toISOString(),
            read_at: null,
            parent_id: replyingTo.id
        };
        
        // Set receiver based on selection
        if (isAdmin && selectedMemberId) {
            messageData.receiver_id = selectedMemberId;
        } else {
            messageData.receiver_id = null;
        }
        
        const { error } = await window.supabase
            .from('chat_messages')
            .insert([messageData]);
        
        if (error) throw error;
        
        cancelReply();
        await loadGroupMessages();
        
    } catch (err) {
        console.error("Error sending reply:", err);
        alert("Failed to send reply: " + err.message);
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
}

function setupRealtimeSubscription() {
    if (messagesSubscription) messagesSubscription.unsubscribe();
    
    messagesSubscription = window.supabase
        .channel('chat_messages_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
            handleNewMessage(payload.new);
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
            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
                recordedAudioUrl = null;
            }
            
            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                if (audioChunks.length === 0) {
                    console.log("No audio recorded");
                    stream.getTracks().forEach(track => track.stop());
                    mediaRecorder = null;
                    return;
                }
                
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                recordedAudio = audioBlob;
                recordedAudioUrl = URL.createObjectURL(audioBlob);
                showAudioPreview(recordedAudioUrl);
                stream.getTracks().forEach(track => track.stop());
                mediaRecorder = null;
            };
            
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
            currentFile = null;
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
        if (!file) {
            throw new Error("No file to upload");
        }
        
        console.log("Uploading file:", file.name, "type:", file.type, "size:", file.size);
        
        const fileName = file.name || 'voice-message.webm';
        const fileExt = fileName.split('.').pop() || 'webm';
        const uniqueFileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
        const filePath = `chat/${uniqueFileName}`;
        
        console.log("Uploading to path:", filePath);
        
        const { error: uploadError, data } = await window.supabase.storage
            .from('chat-files')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || 'audio/webm'
            });
        
        if (uploadError) {
            console.error("Upload error details:", uploadError);
            throw uploadError;
        }
        
        console.log("Upload successful, getting public URL");
        
        const { data: { publicUrl } } = window.supabase.storage
            .from('chat-files')
            .getPublicUrl(filePath);
        
        console.log("Public URL:", publicUrl);
        return publicUrl;
        
    } catch (err) {
        console.error("Error uploading file:", err);
        throw new Error(err.message || "Failed to upload file");
    }
}

// ================= SEND MESSAGE =================
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
    
    try {
        let messageData = {
            sender_id: currentUser.id,
            message_type: 'text',
            content: message || '',
            created_at: new Date().toISOString(),
            read_at: null
        };
        
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
        
        const { error } = await window.supabase
            .from('chat_messages')
            .insert([messageData]);
        
        if (error) {
            console.error("Database insert error:", error);
            alert("Failed to send message: " + (error.message || "Unknown error"));
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalText;
            return;
        }
        
        console.log("Message sent successfully!");
        messageInput.value = '';
        
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
                await window.supabase.auth.signOut();
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