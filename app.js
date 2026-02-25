// Initialize Supabase
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Vault: Simple Direct-Link Mode Active.");

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
const screenshotUpload = document.getElementById('screenshot-upload');
const uploadStatus = document.getElementById('upload-status');
const thumbInput = document.getElementById('video-thumbnail');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await checkAuth();
    } catch (err) {
        console.error("Vault: Init Error:", err);
    }
    if (loader) loader.classList.add('hidden');
});

// --- Auth Functions ---
async function checkAuth() {
    if (!currentPassword) {
        showAuthScreen();
        return;
    }

    try {
        const { data, error } = await db
            .from('settings')
            .select('admin_password')
            .single();

        if (error || !data || data.admin_password !== currentPassword) {
            showAuthScreen();
        } else {
            showMainContent();
            loadVideos();
        }
    } catch (err) {
        console.error("Vault: Auth Fetch Error:", err);
        showAuthScreen();
    }
}

function showAuthScreen() {
    if (authScreen) authScreen.classList.remove('hidden');
    if (mainContent) mainContent.classList.add('hidden');
}

function showMainContent() {
    if (authScreen) authScreen.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');
}

if (unlockBtn) {
    unlockBtn.addEventListener('click', async () => {
        const pwd = adminPasswordInput.value;
        if (!pwd) return;

        try {
            const { data: settings, error: fetchError } = await db
                .from('settings')
                .select('admin_password')
                .single();

            if (fetchError && (fetchError.code === 'PGRST116' || fetchError.message.includes('0 rows'))) {
                const { error: initError } = await db
                    .from('settings')
                    .insert([{ id: 1, admin_password: pwd }]);
                if (initError) throw initError;
            } else if (settings && settings.admin_password !== pwd) {
                authError.classList.remove('hidden');
                return;
            }

            currentPassword = pwd;
            localStorage.setItem('vault_password', pwd);
            showMainContent();
            loadVideos();
        } catch (err) {
            console.error("Vault: Unlock Error:", err);
            alert("Connection Error: " + err.message);
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('vault_password');
        currentPassword = '';
        window.location.reload();
    });
}

// --- Settings Functions ---
if (updatePasswordBtn) {
    updatePasswordBtn.addEventListener('click', async () => {
        const newPwd = newPasswordInput.value;
        if (!newPwd) return;

        const { error } = await db
            .from('settings')
            .update({ admin_password: newPwd })
            .eq('id', 1);

        if (error) alert('Error: ' + error.message);
        else {
            alert('Password updated!');
            currentPassword = newPwd;
            localStorage.setItem('vault_password', newPwd);
            newPasswordInput.value = '';
        }
    });
}

// --- Supabase Storage Upload Logic ---
if (screenshotUpload) {
    screenshotUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (uploadStatus) uploadStatus.textContent = '⏳ Uploading...';

        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        try {
            const { data, error } = await db.storage
                .from('thumbnails')
                .upload(filePath, file);

            if (error) throw error;

            const { data: { publicUrl } } = db.storage
                .from('thumbnails')
                .getPublicUrl(filePath);

            if (thumbInput) thumbInput.value = publicUrl;
            if (uploadStatus) uploadStatus.textContent = '✅ Success!';
        } catch (err) {
            console.error("Vault: Upload Error:", err);
            if (uploadStatus) uploadStatus.textContent = '❌ Failed';
            alert('Upload Error: ' + err.message);
        }
    });
}

// --- Video Functions ---
async function loadVideos() {
    try {
        const { data, error } = await db
            .from('videos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        renderVideos(data);
    } catch (err) {
        console.error('Vault: Load Error:', err);
    }
}

function renderVideos(videos) {
    if (!videos || videos.length === 0) {
        videoGrid.innerHTML = '<div class="empty-state"><p>No videos found. Start by adding some in the Admin Panel.</p></div>';
        return;
    }

    videoGrid.innerHTML = videos.map(video => {
        // Simple Logic: Always show image (provided or placeholder) and REDIRECT on click
        const hasThumb = video.thumbnail_url && video.thumbnail_url.trim() !== '';
        const displayImg = hasThumb ? video.thumbnail_url : 'https://placehold.co/600x400/9D4EDD/ffffff?text=Click+to+Watch';

        return `
        <div class="video-card" data-id="${video.id}" data-title="${(video.title || '').toLowerCase()}">
            <div class="video-thumb" id="thumb-${video.id}" onclick="window.open('${video.url}', '_blank')">
                <img src="${displayImg}" class="video-poster" onerror="this.src='https://placehold.co/600x400/9D4EDD/ffffff?text=Video+Link'">
                <div class="play-overlay">
                    <span class="play-icon">🔗</span>
                    <p>Open Video</p>
                </div>
            </div>
            <div class="video-info">
                <h3>${video.title || 'Untitled'}</h3>
                <div class="card-actions">
                    <a href="${video.url}" target="_blank" class="live-btn">Open Link</a>
                    <button class="del-btn" onclick="deleteVideo('${video.id}')">Delete</button>
                </div>
            </div>
        </div>
    `}).join('');
}

function extractTitleFromUrl(url) {
    try {
        const urlObj = new URL(url);
        let segment = urlObj.pathname.split('/').filter(s => s).pop() || "Untitled";
        segment = segment.replace(/(-id[0-9]+)$|(-[0-9]+)$/i, '');
        segment = segment.replace(/[-_]/g, ' ');
        return segment.charAt(0).toUpperCase() + segment.slice(1);
    } catch (e) {
        return "Untitled Video";
    }
}

if (videoForm) {
    videoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const urlInput = document.getElementById('video-url');
        const url = urlInput.value;
        const thumbnail_url = thumbInput ? thumbInput.value : '';
        const title = extractTitleFromUrl(url);

        try {
            const { error } = await db.from('videos').insert([{ url, title, thumbnail_url }]);
            if (error) throw error;
            videoForm.reset();
            if (uploadStatus) uploadStatus.textContent = '';
            loadVideos();
        } catch (err) {
            console.error("Vault: Save Error:", err);
            alert("Failed to save: " + err.message);
        }
    });
}

async function deleteVideo(id) {
    if (!confirm('Are you sure?')) return;
    const { error } = await db.from('videos').delete().eq('id', id);
    if (error) alert('Error: ' + error.message);
    else loadVideos();
}

window.deleteVideo = deleteVideo;

if (showAdminBtn) {
    showAdminBtn.addEventListener('click', () => {
        isAdminVisible = !isAdminVisible;
        if (adminPanel) adminPanel.classList.toggle('hidden');
        showAdminBtn.textContent = isAdminVisible ? 'Hide Admin' : 'Admin Panel';
    });
}

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.video-card').forEach(card => {
            const title = card.getAttribute('data-title') || '';
            card.style.display = title.includes(term) ? 'block' : 'none';
        });
    });
}
