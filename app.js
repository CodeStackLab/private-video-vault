// Initialize Supabase
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Vault: Connecting to Supabase...", SUPABASE_URL);

// State Management
let currentPassword = localStorage.getItem('vault_password') || '';
let imgbbApiKey = localStorage.getItem('imgbb_api_key') || '';
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
const imgbbKeyInput = document.getElementById('imgbb-api-key');
const saveKeysBtn = document.getElementById('save-api-keys-btn');
const screenshotUpload = document.getElementById('screenshot-upload');
const uploadStatus = document.getElementById('upload-status');
const thumbInput = document.getElementById('video-thumbnail');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Vault: DOM Loaded");
    if (imgbbKeyInput) imgbbKeyInput.value = imgbbApiKey;
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

    if (error) alert('Error: ' + error.message);
    else {
        alert('Password updated!');
        currentPassword = newPwd;
        localStorage.setItem('vault_password', newPwd);
        newPasswordInput.value = '';
    }
});

saveKeysBtn.addEventListener('click', () => {
    const key = imgbbKeyInput.value.trim();
    localStorage.setItem('imgbb_api_key', key);
    imgbbApiKey = key;
    alert('API Key saved locally!');
});

// --- ImgBB Upload Logic ---
screenshotUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!imgbbApiKey) {
        alert('Please save your ImgBB API Key in settings first!');
        return;
    }

    uploadStatus.textContent = '⏳ Uploading...';

    const formData = new FormData();
    formData.append('image', file);
    formData.append('key', imgbbApiKey);

    try {
        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            thumbInput.value = data.data.url;
            uploadStatus.textContent = '✅ Success!';
        } else {
            throw new Error(data.error.message);
        }
    } catch (err) {
        console.error("Vault: Upload Error:", err);
        uploadStatus.textContent = '❌ Failed';
        alert('Upload Error: ' + err.message);
    }
});

// --- Video Functions ---
async function loadVideos() {
    try {
        const { data, error } = await db
            .from('videos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            if (error.message.includes('thumbnail_url')) {
                const { data: fallbackData } = await db.from('videos').select('id, url, title, created_at').order('created_at', { ascending: false });
                if (fallbackData) renderVideos(fallbackData);
            } else {
                throw error;
            }
        } else {
            renderVideos(data);
        }
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
        let thumbnail = video.thumbnail_url || predictThumbnail(video.url);
        if (thumbnail && !thumbnail.includes('images.weserv.nl')) {
            const encodedUrl = encodeURIComponent(thumbnail.replace(/^https?:\/\//, ''));
            thumbnail = `https://images.weserv.nl/?url=${encodedUrl}&n=-1`;
        }

        const hasThumb = thumbnail && thumbnail !== '';

        return `
        <div class="video-card" data-id="${video.id}" data-title="${(video.title || '').toLowerCase()}">
            <div class="video-thumb" id="thumb-${video.id}">
                ${hasThumb ?
                `<img src="${thumbnail}" class="video-poster" onerror="handleBrokenImage(this, '${video.url}')">
                     <div class="play-overlay" onclick="loadEmbed('${video.id}', '${video.url}')">
                        <span class="play-icon">▶</span>
                        <p>Click to Preview</p>
                     </div>`
                : getEmbedHtml(video.url)
            }
            </div>
            <div class="video-info">
                <h3>${video.title || 'Untitled'}</h3>
                <div class="card-actions">
                    <a href="${video.url}" target="_blank" class="live-btn">Open Live URL</a>
                    <button class="del-btn" onclick="deleteVideo('${video.id}')">Delete</button>
                    <button class="secondary-btn" onclick="loadEmbed('${video.id}', '${video.url}')">Try Embed</button>
                </div>
            </div>
        </div>
    `}).join('');
}

function handleBrokenImage(img, originalUrl) {
    const parent = img.parentElement;
    parent.classList.add('broken-stream');
    parent.innerHTML = `
        <div class="vpn-warning">
            <span>🚫</span>
            <p>Access Blocked</p>
            <small>VPN may be required</small>
            <a href="${originalUrl}" target="_blank" class="mini-btn">Watch on Site</a>
        </div>
    `;
}

function loadEmbed(id, url) {
    const container = document.getElementById(`thumb-${id}`);
    if (container) container.innerHTML = getEmbedHtml(url);
}

function getEmbedHtml(url) {
    if (!url) return '';
    if (url.includes('<iframe')) return url;

    let finalUrl = url;
    if (url.includes('xhamster')) {
        const id = getXHId(url);
        if (id) finalUrl = `https://xhamster.com/embed/${id}`;
    } else if (url.includes('spankbang.com')) {
        const match = url.match(/\/video\/([a-z0-9]+)/i);
        if (match) finalUrl = `https://spankbang.com/${match[1]}/embed/`;
    }
    return `<iframe src="${finalUrl}" allowfullscreen></iframe>`;
}

function getXHId(url) {
    const match = url.match(/([0-9a-z]+)$|id([0-9]+)/i);
    return match ? (match[2] || match[1]) : null;
}

function predictThumbnail(url) {
    if (url.includes('xhamster')) {
        const id = getXHId(url);
        if (id) return `https://ic.xhcdn.com/videos/thumbnails/${id}/1.jpg`;
    }
    return '';
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

videoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('video-url').value;
    const thumbnail_url = thumbInput.value;
    const title = extractTitleFromUrl(url);

    try {
        let { error } = await db.from('videos').insert([{ url, title, thumbnail_url }]);
        if (error && error.message.includes('thumbnail_url')) {
            const { error: fallbackError } = await db.from('videos').insert([{ url, title }]);
            error = fallbackError;
        }
        if (error) throw error;
        videoForm.reset();
        uploadStatus.textContent = '';
        loadVideos();
    } catch (err) {
        console.error("Vault: Save Error:", err);
        alert("Failed to save: " + err.message);
    }
});

async function deleteVideo(id) {
    if (!confirm('Are you sure?')) return;
    const { error } = await db.from('videos').delete().eq('id', id);
    if (error) alert('Error: ' + error.message);
    else loadVideos();
}

window.deleteVideo = deleteVideo;
window.loadEmbed = loadEmbed;
window.handleBrokenImage = handleBrokenImage;

showAdminBtn.addEventListener('click', () => {
    isAdminVisible = !isAdminVisible;
    adminPanel.classList.toggle('hidden');
    showAdminBtn.textContent = isAdminVisible ? 'Hide Admin' : 'Admin Panel';
});

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.video-card').forEach(card => {
        const title = card.getAttribute('data-title') || '';
        card.style.display = title.includes(term) ? 'block' : 'none';
    });
});
