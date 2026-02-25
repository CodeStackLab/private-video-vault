// Initialize Supabase
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Vault: Connecting to Supabase...", SUPABASE_URL);

// State Management
let currentPassword = localStorage.getItem('vault_password') || '';
let isAdminVisible = false;

// DOM Elements
const loader = document.getElementById('loader');
const authScreen = document.getElementById('auth-screen');
const mainContent = document.getElementById('main-content');
const unlockBtn = document.getElementById('unlock-btn');
const adminPasswordInput = document.getElementById('admin-password');
const authError = document.getElementById('auth-error');
const videoGrid = document.getElementById('video-grid');
const videoForm = document.getElementById('video-form');
const logoutBtn = document.getElementById('logout-btn');
const showAdminBtn = document.getElementById('show-admin-btn');
const adminPanel = document.getElementById('admin-panel');
const searchInput = document.getElementById('search-input');
const updatePasswordBtn = document.getElementById('update-password-btn');
const newPasswordInput = document.getElementById('new-password');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Vault: DOM Loaded");
    try {
        await checkAuth();
    } catch (err) {
        console.error("Vault: Init Error:", err);
    }
    hideLoader();
});

function hideLoader() {
    loader.classList.add('hidden');
}

// --- Auth Functions ---
async function checkAuth() {
    if (!currentPassword) {
        console.log("Vault: No password found in storage");
        showAuthScreen();
        return;
    }

    // Verify password against Supabase settings table
    const { data, error } = await db
        .from('settings')
        .select('admin_password')
        .single();

    if (error || !data || data.admin_password !== currentPassword) {
        console.log("Vault: Auth Failed or Password Reset Required");
        showAuthScreen();
    } else {
        console.log("Vault: Auth Success");
        showMainContent();
        loadVideos();
    }
}

function showAuthScreen() {
    authScreen.classList.remove('hidden');
    mainContent.classList.add('hidden');
}

function showMainContent() {
    authScreen.classList.add('hidden');
    mainContent.classList.remove('hidden');
}

unlockBtn.addEventListener('click', async () => {
    const pwd = adminPasswordInput.value;
    if (!pwd) return;

    console.log("Vault: Attempting unlock...");

    // Check if settings exist, if not, first user sets the password
    const { data: settings, error: fetchError } = await db
        .from('settings')
        .select('admin_password')
        .single();

    if (fetchError && (fetchError.code === 'PGRST116' || fetchError.message.includes('0 rows'))) {
        // Table is empty, initialize with this password
        console.log("Vault: Initializing database with first password");
        const { error: initError } = await db
            .from('settings')
            .insert([{ id: 1, admin_password: pwd }]);

        if (initError) {
            console.error("Vault: Initialization Error:", initError);
            alert('Error initializing database. Check Supabase RLS policies.');
            return;
        }
    } else if (settings && settings.admin_password !== pwd) {
        console.log("Vault: Wrong password");
        authError.classList.remove('hidden');
        return;
    }

    currentPassword = pwd;
    localStorage.setItem('vault_password', pwd);
    showMainContent();
    loadVideos();
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('vault_password');
    currentPassword = '';
    window.location.reload();
});

// --- Settings Functions ---
updatePasswordBtn.addEventListener('click', async () => {
    const newPwd = newPasswordInput.value;
    if (!newPwd) return;

    const { error } = await db
        .from('settings')
        .update({ admin_password: newPwd })
        .eq('id', 1);

    if (error) {
        alert('Failed to update password: ' + error.message);
    } else {
        alert('Password updated successfully!');
        currentPassword = newPwd;
        localStorage.setItem('vault_password', newPwd);
        newPasswordInput.value = '';
    }
});

// --- Video Functions ---
async function loadVideos() {
    const { data, error } = await db
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Vault: Error loading videos:', error);
        if (error.message.includes('column "thumbnail_url" does not exist')) {
            console.log("Vault: Thumbnail column missing, trying to fix...");
            // We can't fix schema from JS strictly with RLS usually, but we notify user.
        }
        return;
    }

    renderVideos(data);
}

function renderVideos(videos) {
    if (!videos || videos.length === 0) {
        videoGrid.innerHTML = '<div class="empty-state"><p>No videos found. Start by adding some in the Admin Panel.</p></div>';
        return;
    }

    videoGrid.innerHTML = videos.map(video => {
        const hasThumb = video.thumbnail_url && video.thumbnail_url !== '';

        return `
        <div class="video-card" data-id="${video.id}" data-title="${(video.title || '').toLowerCase()}" data-hobby="${(video.hobby || '').toLowerCase()}">
            <div class="video-thumb" id="thumb-${video.id}">
                ${hasThumb ?
                `<img src="${video.thumbnail_url}" class="video-poster" alt="Preview">
                     <div class="play-overlay" onclick="loadEmbed('${video.id}', '${video.url}')">
                        <span class="play-icon">▶</span>
                        <p>Click to Load Player</p>
                     </div>`
                : getEmbedHtml(video.url)
            }
            </div>
            <div class="video-info">
                <h3>${video.title || 'Untitled'}</h3>
                ${video.hobby ? `<span class="hobby-tag">${video.hobby}</span>` : ''}
                <div class="card-actions">
                    <a href="${video.url}" target="_blank" class="live-btn">Live URL</a>
                    <button class="del-btn" onclick="deleteVideo('${video.id}')">Delete</button>
                    ${hasThumb ? `<button class="secondary-btn" onclick="loadEmbed('${video.id}', '${video.url}')">Preview</button>` : ''}
                </div>
            </div>
        </div>
    `}).join('');
}

function loadEmbed(id, url) {
    const container = document.getElementById(`thumb-${id}`);
    if (container) {
        container.innerHTML = getEmbedHtml(url);
    }
}

// Helper to sanitize/smart-convert URLs
function getEmbedHtml(url) {
    if (!url) return '';
    if (url.includes('<iframe')) return url;

    let finalUrl = url;

    // xHamster logic: convert main URL to embed URL
    if (url.includes('xhamster') && !url.includes('/embed/')) {
        // e.g. xhamster.com/videos/title-id12345 -> xhamster.com/embed/12345
        const match = url.match(/([0-9a-z]+)$|id([0-9]+)/i);
        if (match) {
            const id = match[2] || match[1];
            finalUrl = `https://xhamster.com/embed/${id}`;
        }
    }

    // SpankBang logic
    if (url.includes('spankbang.com') && !url.includes('/embed/')) {
        const match = url.match(/\/video\/([a-z0-9]+)/i);
        if (match) {
            finalUrl = `https://spankbang.com/${match[1]}/embed/`;
        }
    }

    return `<iframe src="${finalUrl}" allowfullscreen></iframe>`;
}

videoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('video-url').value;
    const title = document.getElementById('video-title').value;
    const thumbnail_url = document.getElementById('video-thumbnail').value;
    const hobby = document.getElementById('video-hobby').value;

    console.log("Vault: Adding video with thumb:", thumbnail_url);

    const { error } = await db
        .from('videos')
        .insert([{ url, title, hobby, thumbnail_url }]);

    if (error) {
        console.error("Vault: Add Error:", error);
        alert('Error adding video: ' + error.message + "\n\nTip: You might need to add the 'thumbnail_url' column to your Supabase 'videos' table.");
    } else {
        videoForm.reset();
        loadVideos();
    }
});

async function deleteVideo(id) {
    if (!confirm('Are you sure you want to delete this video?')) return;

    const { error } = await db
        .from('videos')
        .delete()
        .eq('id', id);

    if (error) {
        alert('Error deleting video: ' + error.message);
    } else {
        loadVideos();
    }
}

// Global exposure
window.deleteVideo = deleteVideo;
window.loadEmbed = loadEmbed;

// --- UI Logic ---
showAdminBtn.addEventListener('click', () => {
    isAdminVisible = !isAdminVisible;
    adminPanel.classList.toggle('hidden');
    showAdminBtn.textContent = isAdminVisible ? 'Hide Admin' : 'Admin Panel';
});

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('.video-card');

    cards.forEach(card => {
        const title = card.getAttribute('data-title') || '';
        const hobby = card.getAttribute('data-hobby') || '';
        if (title.includes(term) || hobby.includes(term)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
});
