// js/home.js - Fixed to exclude own messages from unread count
console.log("🏠 HOME PAGE LOADING");

// Global variables
let currentUserId = null;

document.addEventListener('DOMContentLoaded', async function() {
    console.log("DOM loaded, initializing home page...");
    
    function initializeHome() {
        if (!window.supabase) {
            console.log("Waiting for Supabase...");
            setTimeout(initializeHome, 100);
            return;
        }
        
        loadHomeData();
    }
    
    initializeHome();
});

// Make function globally available for the button
window.forceRefreshCount = function() {
    console.log("🔄 FORCE REFRESHING COUNT...");
    if (currentUserId) {
        forceRefreshUnreadCount(currentUserId);
    } else {
        alert("Please wait for page to load first");
    }
};

async function forceRefreshUnreadCount(userId) {
    try {
        console.log("🔍 Directly querying unread count for user:", userId);
        
        // Direct query to count unread messages from OTHER people
        const { count, error } = await window.supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .or(`receiver_id.is.null,receiver_id.eq.${userId}`)
            .is('read_at', null)
            .neq('sender_id', userId); // EXCLUDE messages sent by current user
        
        if (error) {
            console.error("Error in force refresh:", error);
            alert("Error refreshing count: " + error.message);
            return;
        }
        
        console.log(`✅ Database says unread messages from others: ${count}`);
        
        // Update the display
        const countEl = document.getElementById('messageCount');
        if (countEl) {
            const oldValue = countEl.textContent;
            countEl.textContent = count || 0;
            console.log(`Counter updated from ${oldValue} to ${count}`);
            
            // Visual feedback
            countEl.style.color = '#ffd700';
            setTimeout(() => {
                countEl.style.color = '';
            }, 500);
        }
        
    } catch (err) {
        console.error("Error in forceRefreshUnreadCount:", err);
        alert("Error refreshing count");
    }
}

async function loadHomeData() {
    try {
        const { data: { user }, error } = await window.supabase.auth.getUser();
        
        if (error || !user) {
            console.log("No user, redirecting to login");
            window.location.href = '../index.html';
            return;
        }
        
        currentUserId = user.id;
        console.log("User logged in:", user.email);
        console.log("User ID:", currentUserId);
        
        await loadUserProfile(user.id);
        await loadAllCounts(user.id);
        
        setupSidebar();
        setupLogoutButtons();
        setupClickableBoxes();
        
    } catch (err) {
        console.error("Home initialization error:", err);
    }
}

async function loadUserProfile(userId) {
    try {
        console.log("Loading profile for:", userId);
        
        const { data, error } = await window.supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        
        if (error) {
            console.error("Profile error:", error);
            return;
        }
        
        if (!data) {
            console.log("No profile found, creating one...");
            
            const { data: { user } } = await window.supabase.auth.getUser();
            
            const { error: insertError } = await window.supabase
                .from('profiles')
                .insert([{
                    id: userId,
                    email: user.email,
                    full_name: user.user_metadata?.full_name || 'Member',
                    role: 'member',
                    is_approved: true
                }]);
            
            if (insertError) {
                console.error("Failed to create profile:", insertError);
                return;
            }
            
            return loadUserProfile(userId);
        }
        
        console.log("Profile loaded:", data.full_name);
        
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = data.full_name || 'Member';
        
    } catch (err) {
        console.error("Error loading profile:", err);
    }
}

// ================= LOAD ALL COUNTS =================
async function loadAllCounts(userId) {
    try {
        await Promise.all([
            loadAnnouncementCount(),
            loadEventCount(),
            loadUnreadMessageCount(userId)
        ]);
        
        console.log("All counts loaded successfully");
        
    } catch (err) {
        console.error("Error loading counts:", err);
    }
}

// ================= ANNOUNCEMENT COUNT =================
async function loadAnnouncementCount() {
    try {
        const { count, error } = await window.supabase
            .from('announcements')
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            console.log("Announcements table not ready:", error.message);
            return;
        }
        
        const countEl = document.getElementById('announcementCount');
        if (countEl) {
            countEl.textContent = count || 0;
            console.log(`Announcement count: ${count || 0}`);
        }
        
    } catch (err) {
        console.error("Error loading announcements:", err);
    }
}

// ================= EVENT COUNT =================
async function loadEventCount() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];
        
        const { count, error } = await window.supabase
            .from('events')
            .select('*', { count: 'exact', head: true })
            .gte('date', todayStr)
            .not('status', 'in', '("cancelled","completed")');
        
        if (error) {
            console.log("Events table not ready:", error.message);
            return;
        }
        
        const countEl = document.getElementById('eventCount');
        if (countEl) {
            countEl.textContent = count || 0;
            console.log(`Upcoming events count: ${count || 0}`);
        }
        
    } catch (err) {
        console.error("Error loading events:", err);
    }
}

// ================= FIXED UNREAD MESSAGES COUNT =================
// This now counts only messages from OTHER people (not sent by current user)
async function loadUnreadMessageCount(userId) {
    try {
        console.log("📨 Counting unread messages from OTHER people for user:", userId);
        
        // Count messages that are:
        // 1. Relevant to this user (group messages OR private messages to them)
        // 2. Unread (read_at is null)
        // 3. NOT sent by the current user (neq sender_id)
        const { count, error } = await window.supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .or(`receiver_id.is.null,receiver_id.eq.${userId}`)
            .is('read_at', null)
            .neq('sender_id', userId); // EXCLUDE messages sent by current user
        
        if (error) {
            console.error("Error counting unread messages:", error);
            const countEl = document.getElementById('messageCount');
            if (countEl) countEl.textContent = '0';
            return;
        }
        
        console.log(`✅ Unread messages from others: ${count}`);
        
        const countEl = document.getElementById('messageCount');
        if (countEl) {
            countEl.textContent = count || 0;
        }
        
    } catch (err) {
        console.error("Error in loadUnreadMessageCount:", err);
        const countEl = document.getElementById('messageCount');
        if (countEl) countEl.textContent = '0';
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
        openBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sidebar.classList.add('active');
            if (overlay) overlay.classList.add('active');
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
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

// ================= LOGOUT BUTTONS =================
function setupLogoutButtons() {
    const logoutBtns = document.querySelectorAll('#logoutBtn, .logout-btn-sidebar');
    
    logoutBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', async () => {
                await window.supabase.auth.signOut();
                window.location.href = '../index.html';
            });
        }
    });
}

// ================= CLICKABLE BOXES =================
function setupClickableBoxes() {
    const announcementBox = document.getElementById('announcementBox');
    const eventBox = document.getElementById('eventBox');
    const messageBox = document.getElementById('messageBox');
    
    if (announcementBox) {
        announcementBox.addEventListener('click', () => {
            window.location.href = 'announcement.html';
        });
    }
    
    if (eventBox) {
        eventBox.addEventListener('click', () => {
            window.location.href = 'events.html';
        });
    }
    
    if (messageBox) {
        messageBox.addEventListener('click', () => {
            window.location.href = 'chat.html';
        });
    }
}