/**
 * Media Management System
 * Handles file uploads, folder creation, and media display
 */

document.addEventListener('DOMContentLoaded', async () => {
    await loadMedia();

    // Handle search highlighting
    const urlParams = new URLSearchParams(window.location.search);
    const highlightId = urlParams.get('highlight');
    const type = urlParams.get('type');
    
    if (highlightId) {
        setTimeout(() => {
            let element;
            if (type === 'folder') {
                // Find folder card
                const cards = document.querySelectorAll('.media-card');
                cards.forEach(card => {
                    if (card.onclick && card.onclick.toString().includes(`openFolder(${highlightId}`)) {
                        element = card;
                    }
                });
            } else {
                element = document.getElementById(`media-${highlightId}`);
            }

            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.style.transition = 'box-shadow 0.5s, background 0.5s';
                element.style.boxShadow = '0 0 15px rgba(99, 91, 255, 0.4)';
                element.style.background = 'rgba(99, 91, 255, 0.05)';
                setTimeout(() => {
                    element.style.boxShadow = '';
                    element.style.background = '';
                }, 3000);
            }
        }, 800);
    }
});

// Global state to track folders
let hasFolders = false;
let currentFolderId = null;
let currentFolderName = '';
let currentMediaStatus = 'active';
let currentFolderFiles = [];
let sortControl = { column: 'date', asc: false };

async function loadMedia() {
    try {
        const user = storage.getUser();
        if (!user || !user.id) {
            return;
        }
        
        const cacheKey = `media_list_${currentMediaStatus}${currentFolderId ? '_' + currentFolderId : ''}`;
        let cachedData = null;
        
        // Try to load from cache first
        if (window.storage) {
            cachedData = window.storage.get(cacheKey);
        } else {
            const cached = localStorage.getItem(cacheKey);
            cachedData = cached ? JSON.parse(cached) : null;
        }
        
        // Use cached data if available
        if (cachedData && cachedData.media) {
            displayMediaGrid(cachedData.media, cachedData.stats);
        }
        
        // Always fetch fresh data in background
        const response = await apiFetch(`/api/media/get-media.php?client_id=${user.id}&status=${currentMediaStatus}${currentFolderId ? '&folder_id=' + currentFolderId : ''}`);
        const result = await response.json();

        // Cache the media list
        if (result.success && result.media) {
            try {
                if (window.storage) {
                    window.storage.set(cacheKey, {
                        media: result.media,
                        stats: result.stats,
                        timestamp: Date.now()
                    });
                } else {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        media: result.media,
                        stats: result.stats,
                        timestamp: Date.now()
                    }));
                }
            } catch (e) {
                // Cache failed, continue anyway
            }
            
            displayMediaGrid(result.media, result.stats);
        } else if (!cachedData) {
            displayMediaGridEmpty();
        }
    } catch (error) {
        // If fetch fails, use cached data if available
        const cacheKey = `media_list_${currentMediaStatus}${currentFolderId ? '_' + currentFolderId : ''}`;
        let cachedData = null;
        if (window.storage) {
            cachedData = window.storage.get(cacheKey);
        } else {
            const cached = localStorage.getItem(cacheKey);
            cachedData = cached ? JSON.parse(cached) : null;
        }
        
        if (cachedData && cachedData.media) {
            displayMediaGrid(cachedData.media, cachedData.stats);
        } else {
            displayMediaGridEmpty();
        }
    }
}

function displayMediaGrid(media, stats) {
    // Update dashboard stats
    if (stats) {
        const foldersEl = document.getElementById('foldersCreatedCount');
        if (foldersEl) foldersEl.textContent = stats.total_folders || 0;
        
        const filesEl = document.getElementById('totalFilesCount');
        if (filesEl) filesEl.textContent = stats.total_files || 0;
        
        const sizeEl = document.getElementById('totalMediaSize');
        if (sizeEl) sizeEl.textContent = formatFileSize(stats.total_size || 0);
        
        const deletedEl = document.getElementById('mediaDeletedCount');
        if (deletedEl) deletedEl.textContent = stats.total_deleted || 0;
        
        const restoredEl = document.getElementById('restoredFilesCount');
        if (restoredEl) restoredEl.textContent = stats.total_restored || 0;

        const foldersDeletedEl = document.getElementById('foldersDeletedCount');
        if (foldersDeletedEl) foldersDeletedEl.textContent = stats.total_deleted_folders || 0;
        
        const foldersRestoredEl = document.getElementById('foldersRestoredCount');
        if (foldersRestoredEl) foldersRestoredEl.textContent = stats.total_restored_folders || 0;
    }

    const mediaGrid = document.getElementById('mediaGrid');
    hasFolders = media && media.some(item => item.type === 'folder');

    if (!media || media.length === 0) {
        displayMediaGridEmpty();
        return;
    }

    let html = media.map(item => {
        if (item.type === 'folder') {
            return `
                <div class="media-card folder-card" onclick="openFolder(${item.id}, '${item.name.replace(/'/g, "\\'")}')">
                    <div class="media-thumb"><span class="folder-icon" style="font-size: 4rem;">📂</span></div>
                    <div class="media-info">
                        <div class="media-name">${item.name}</div>
                        <div class="media-meta">
                            <span>${item.file_count || 0} files</span>
                        </div>
                    </div>
                    <div class="media-actions-overlay">
                        ${currentMediaStatus === 'active' 
                            ? `
                                <span class="action-circle" onclick="uploadToFolder(${item.id}, '${item.name.replace(/'/g, "\\'")}')" title="Upload to Folder"><i data-lucide="upload"></i></span>
                                <span class="action-circle" onclick="deleteMedia(${item.id}, 'folder', event, ${item.file_count || 0})" title="Delete Folder" style="color: var(--card-red);"><i data-lucide="trash-2"></i></span>
                            ` 
                            : `
                                <span class="action-circle" onclick="restoreMedia(${item.id}, 'folder', event)" title="Restore Folder" style="color: var(--card-green);"><i data-lucide="refresh-cw"></i></span>
                                <span class="action-circle" onclick="deleteMedia(${item.id}, 'folder', event, ${item.file_count || 0}, true)" title="Permanently Delete" style="color: var(--card-red);"><i data-lucide="trash"></i></span>
                            `
                        }
                    </div>
                </div>
            `;
        } else {
            const isImage = item.file_type?.startsWith('image/');
            const isVideo = item.file_type?.startsWith('video/');
            const isEnhanced = storage.get(`enhanced_hd_${item.id}`) === true;
            
            return `
                <div class="media-card ${isEnhanced ? 'enhanced-hd' : ''}" id="media-${item.id}">
                    <div class="media-thumb file-thumb" ${isImage ? `style="background: url(${item.file_path}) center/cover;"` : ''}>
                        ${isVideo ? `<video src="${item.file_path}"></video>` : ''}
                        ${(!isImage && !isVideo) ? `<span class="file-icon">${getFileIcon(item.file_type)}</span>` : ''}
                        <div class="hd-badge">4K HD</div>
                        <div class="media-actions-overlay">
                            ${currentMediaStatus === 'active' ? `
                                <span class="action-circle hd-toggle ${isEnhanced ? 'active' : ''}" onclick="toggleHDEnhancement(event, ${item.id})" title="HD Enhancement">✨</span>
                                <span class="action-circle" onclick="viewFile('${item.file_path}')" title="View"><i data-lucide="eye"></i></span>
                                <span class="action-circle" onclick="downloadFile('${item.file_path}', '${item.name.replace(/'/g, "\\'")}')" title="Download"><i data-lucide="download"></i></span>
                                <span class="action-circle" onclick="deleteMedia(${item.id}, 'file', event)" style="color: var(--card-red);" title="Delete"><i data-lucide="trash-2"></i></span>
                            ` : `
                                <span class="action-circle" onclick="restoreMedia(${item.id}, 'file', event)" style="color: var(--card-green);" title="Restore"><i data-lucide="refresh-cw"></i></span>
                                <span class="action-circle" onclick="deleteMedia(${item.id}, 'file', event, 0, true)" style="color: var(--card-red);" title="Permanently Delete"><i data-lucide="trash"></i></span>
                            `}
                        </div>
                    </div>
                    <div class="media-info">
                        <div class="media-name">${item.name}</div>
                        <div class="media-meta">
                            <span style="text-transform: capitalize;">${item.file_type || 'File'}</span>
                            <span>${formatFileSize(item.file_size)}</span>
                    </div>
                </div>
            `;
        }
    }).join('');

    mediaGrid.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

function displayMediaGridEmpty() {
    const mediaGrid = document.getElementById('mediaGrid');
    mediaGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem; color: var(--client-text-muted);">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📁</div>
            <h3>No media found.</h3>
            ${currentMediaStatus === 'active' ? `<p>Create a folder to get started with uploads.</p>
            <button onclick="createNewFolder()" class="btn btn-primary" style="margin-top: 1rem;">Create Folder</button>` : ''}
        </div>
    `;
}

function createNewFolder() {
    // Show folder creation modal with improved close button
    const modalHTML = `
        <div id="folderModal" class="modal-backdrop active" role="dialog" aria-modal="true" aria-hidden="false">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Create New Folder</h2>
                    <button class="modal-close" onclick="closeFolderModal()" style="font-size: 1.5rem; line-height: 1; padding: 0.5rem; background: none; border: none; cursor: pointer; color: #666;">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="folderForm" onsubmit="handleFolderCreation(event)">
                        <div class="form-group">
                            <label>Folder Name *</label>
                            <input type="text" id="folderNameInput" required placeholder="e.g., Event Photos">
                        </div>
                        <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                            <button type="submit" class="btn btn-primary" style="flex: 1; background: var(--card-blue);">
                                Create Folder
                            </button>
                            <button type="button" class="btn btn-secondary" onclick="closeFolderModal()">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    setTimeout(() => {
        const input = document.getElementById('folderNameInput');
        if (input) input.focus();
    }, 100);
}

function closeFolderModal() {
    const modal = document.getElementById('folderModal');
    if (modal) modal.remove();
}

async function handleFolderCreation(e) {
    e.preventDefault();
    const folderName = document.getElementById('folderNameInput').value;
    
    try {
        const response = await apiFetch('/api/media/create-folder.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_name: folderName })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Folder "' + folderName + '" created successfully', 'success');
            closeFolderModal();
            hasFolders = true;
            loadMedia();
        } else {
            showNotification('Failed to create folder: ' + result.message, 'error');
        }
    } catch (error) {
        showNotification('An error occurred while creating folder', 'error');
    }
}

function uploadFile() {
    // Enforce folder selection before upload
    if (!currentFolderId) {
        if (document.activeElement) document.activeElement.blur();
        
        Swal.fire({
            title: 'Choose a Folder',
            text: 'Please select a folder first. Would you like to create an "Event Assets" folder now?',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Create "Event Assets"',
            cancelButtonText: 'I\'ll choose one',
            confirmButtonColor: '#3b82f6',
            cancelButtonColor: '#9ca3af'
        }).then(async (result) => {
            if (result.isConfirmed) {
                // Auto-create "Event Assets" folder
                try {
                    const response = await apiFetch('/api/media/create-folder.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folder_name: 'Event Assets' })
                    });
                    const res = await response.json();
                    if (res.success) {
                        showNotification('Folder "Event Assets" created!', 'success');
                        await loadMedia();
                        // Find the new folder ID and name to set as current
                        if (res.folder_id) {
                            currentFolderId = res.folder_id;
                            currentFolderName = 'Event Assets';
                            // Proceed to upload
                            triggerFileUpload();
                        }
                    } else {
                        showNotification('Failed to create folder: ' + res.message, 'error');
                    }
                } catch (err) {
                    showNotification('An error occurred', 'error');
                }
            }
        });
        return;
    }

    triggerFileUpload();
}

function triggerFileUpload() {
    // Create hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx';

    input.onchange = async (e) => {
        const files = e.target.files;
        if (!files.length) return;

        // Frontend UX validation: reject files exceeding 5MB before any network request
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        for (let file of files) {
            if (file.size > MAX_FILE_SIZE) {
                showNotification(`"${file.name}" exceeds the 5MB file size limit and was not uploaded.`, 'error');
                return;
            }
        }

        // Show upload progress notification
        showNotification(`Uploading ${files.length} file(s) to ${currentFolderName}...`, 'info');

        const formData = new FormData();
        for (let file of files) {
            formData.append('files[]', file);
        }
        formData.append('folder_name', currentFolderName);
        formData.append('folder_id', currentFolderId);

        try {
            const response = await apiFetch('/api/media/upload-media.php', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Files uploaded successfully', 'success');
                if (currentFolderId) {
                    openFolder(currentFolderId, currentFolderName);
                } else {
                    loadMedia();
                }
            } else {
                showNotification('Upload failed: ' + result.message, 'error');
            }
        } catch (error) {
            showNotification('An error occurred during upload', 'error');
        }
    };

    input.click();
}

function uploadToFolder(folderId, folderName, e) {
    if (e) e.stopPropagation();
    
    // Create hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx';

    input.onchange = async (ev) => {
        const files = ev.target.files;
        if (!files.length) return;

        // Frontend UX validation: reject files exceeding 5MB before any network request
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        for (let file of files) {
            if (file.size > MAX_FILE_SIZE) {
                showNotification(`"${file.name}" exceeds the 5MB file size limit and was not uploaded.`, 'error');
                return;
            }
        }

        showNotification(`Uploading ${files.length} file(s) to ${folderName}...`, 'info');

        const formData = new FormData();
        for (let file of files) {
            formData.append('files[]', file);
        }
        formData.append('folder_id', folderId);
        formData.append('folder_name', folderName);

        try {
            const response = await apiFetch('/api/media/upload-media.php', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Files uploaded successfully', 'success');
                loadMedia();
            } else {
                showNotification('Upload failed: ' + result.message, 'error');
            }
        } catch (error) {
            showNotification('An error occurred during upload', 'error');
        }
    };

    input.click();
}

async function toggleHDEnhancement(e, mediaId) {
    if (e) e.stopPropagation();
    
    const card = document.getElementById(`media-${mediaId}`);
    const toggleBtn = e.currentTarget;
    const isEnhanced = card.classList.contains('enhanced-hd');
    
    if (!isEnhanced) {
        // Apply enhancement with effect
        card.classList.add('enhancement-processing');
        showNotification('Enhancing to 4K HD clarity...', 'info');
        
        // Simulate processing for UX
        await new Promise(resolve => setTimeout(resolve, 800));
        
        card.classList.remove('enhancement-processing');
        card.classList.add('enhanced-hd');
        toggleBtn.classList.add('active');
        storage.set(`enhanced_hd_${mediaId}`, true);
        showNotification('Media enhanced to HD!', 'success');
    } else {
        card.classList.remove('enhanced-hd');
        toggleBtn.classList.remove('active');
        storage.remove(`enhanced_hd_${mediaId}`);
        showNotification('HD enhancement removed', 'info');
    }
}

function viewFile(filePath, fileName = '') {
    // Open in lightbox modal
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filePath);
    const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(filePath);
    
    const modalHTML = `
        <div id="filePreviewModal" class="modal-backdrop active" style="z-index: 9000;" role="dialog" aria-modal="true">
            <div style="position: relative; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <button onclick="document.getElementById('filePreviewModal').remove()" style="position: absolute; top: -40px; right: 0; background: white; border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;">&times;</button>
                ${isImage ? `<img src="${filePath}" style="max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 12px;">` : 
                  isVideo ? `<video src="${filePath}" controls style="max-width: 90vw; max-height: 90vh; border-radius: 12px;"></video>` :
                  `<div style="background: white; padding: 4rem; border-radius: 12px; text-align: center;"><div style="font-size: 4rem; margin-bottom: 1rem;">📄</div><p>Cannot preview this file type in browser</p><a href="${filePath}" download style="display: inline-block; margin-top: 1rem; background: #4f46e5; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600;">Download File</a></div>`}
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function downloadFile(filePath, fileName) {
    const a = document.createElement('a');
    a.href = filePath;
    a.download = fileName;
    a.click();
}

async function deleteMedia(id, type = 'file', e, fileCount = 0, permanent = false) {
    if (e) e.stopPropagation();
    if (document.activeElement) document.activeElement.blur();
    
    let title = permanent ? 'Permanently Delete?' : 'Delete Media?';
    let text = permanent 
        ? 'This action cannot be undone. The file will be removed from the server forever.'
        : 'Are you sure you want to move this item to trash?';
    
    if (type === 'folder' && !permanent) {
        if (fileCount > 0) {
            title = 'Folder Not Empty';
            text = `This folder contains ${fileCount} files. Deleting it will move all files to trash. Continue?`;
        }
    } else if (type === 'folder' && permanent) {
        title = 'Permanently Delete Folder?';
        text = 'This will permanently delete the folder and ALL its contents. This cannot be undone.';
    }

    const confirmResult = await Swal.fire({
        title: title,
        text: text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: permanent ? 'Yes, Delete Forever' : 'Yes, Delete',
        cancelButtonText: 'Cancel'
    });
    
    if (!confirmResult.isConfirmed) return;
    
    try {
        const endpoint = type === 'folder' ? '/api/media/delete-folder.php' : '/api/media/delete-media.php';
        const response = await apiFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                [type === 'folder' ? 'folder_id' : 'media_id']: id,
                permanent: permanent
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification(result.message || 'Action completed successfully', 'success');
            if (currentFolderId) {
                openFolder(currentFolderId, currentFolderName);
            } else {
                loadMedia();
            }
        } else {
            showNotification('Action failed: ' + result.message, 'error');
        }
    } catch (error) {
        showNotification('An error occurred during deletion', 'error');
    }
}

async function restoreMedia(id, type = 'file', e) {
    if (e) e.stopPropagation();
    try {
        const response = await apiFetch('/api/media/restore.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, type: type })
        });
        const result = await response.json();
        
        if (result.success) {
            showNotification('Restored successfully!', 'success');
            if (currentFolderId) {
                openFolder(currentFolderId, currentFolderName);
            } else {
                loadMedia();
            }
        } else {
            showNotification('Failed to restore: ' + result.message, 'error');
        }
    } catch (err) {
        showNotification('An error occurred', 'error');
    }
}

function switchMediaView(status) {
    currentMediaStatus = status;
    currentFolderId = null;
    currentFolderName = '';
    updateHeaderUI();
    loadMedia();
}

function updateHeaderUI() {
    const title = document.getElementById('mediaViewTitle');
    const backBtn = document.getElementById('btnBackToRoot');
    
    if (currentFolderId) {
        title.textContent = `Folder: ${currentFolderName}`;
        backBtn.style.display = 'block';
    } else {
        title.textContent = currentMediaStatus === 'trash' ? 'Trash' : 'All Media';
        backBtn.style.display = 'none';
    }
}

async function openFolder(id, name) {
    currentFolderId = id;
    currentFolderName = name;
    
    const modal = document.getElementById('folderContentsModal');
    const nameEl = document.getElementById('modalFolderName');
    const grid = document.getElementById('folderMediaGrid');
    const emptyState = document.getElementById('modalEmptyState');
    
    nameEl.textContent = name;
    if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">Loading files...</div>';
    emptyState.style.display = 'none';
    modal.classList.add('active');

    try {
        const user = storage.getUser();
        
        // Pass folder_id as filter to the existing media fetch endpoint
        const response = await apiFetch(`/api/media/get-media.php?client_id=${user.id}&folder_id=${id}&status=${currentMediaStatus}`);
        const result = await response.json();

        if (result.success && result.media) {
            currentFolderFiles = result.media.filter(item => item.type !== 'folder');
            populateFolderModal(currentFolderFiles);
        } else {
            currentFolderFiles = [];
            if (grid) grid.innerHTML = '';
            emptyState.style.display = 'block';
        }
    } catch (error) {
        if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--client-text-muted);">Failed to load files</div>';
    }
}

function populateFolderModal(files) {
    const grid = document.getElementById('folderMediaGrid');
    const countEl = document.getElementById('modalFileCount');
    const emptyState = document.getElementById('modalEmptyState');
    
    countEl.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    
    if (files.length === 0) {
        if (grid) grid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    
    // Render using the file-card template logic
    if (grid) {
        grid.className = 'media-grid'; // Use the CSS class instead of inline styles
        grid.style = ''; // Clear inline styles

        grid.innerHTML = files.map(item => {
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item.file_path);
            const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(item.file_path);
            
            return `
                <div class="media-card" id="media-${item.id}">
                    <div class="media-thumb file-thumb" ${isImage ? `style="background: url(${item.file_path}) center/cover;"` : ''}>
                        ${isVideo ? `<video src="${item.file_path}"></video>` : ''}
                        ${(!isImage && !isVideo) ? `<span class="file-icon">${getFileIcon(item.file_type)}</span>` : ''}
                        <div class="media-actions-overlay">
                            ${currentMediaStatus === 'active' ? `
                                <span class="action-circle" onclick="viewFile('${item.file_path}', '${item.name.replace(/'/g, "\\'")}')" title="View"><i data-lucide="eye"></i></span>
                                <span class="action-circle" onclick="downloadFile('${item.file_path}', '${item.name.replace(/'/g, "\\'")}')" title="Download"><i data-lucide="download"></i></span>
                                <span class="action-circle" onclick="deleteMedia(${item.id}, 'file', event)" style="color: var(--card-red);" title="Delete"><i data-lucide="trash-2"></i></span>
                            ` : `
                                <span class="action-circle" onclick="restoreMedia(${item.id}, 'file', event)" style="color: var(--card-green);" title="Restore"><i data-lucide="refresh-cw"></i></span>
                                <span class="action-circle" onclick="deleteMedia(${item.id}, 'file', event, 0, true)" style="color: var(--card-red);" title="Permanently Delete"><i data-lucide="trash"></i></span>
                            `}
                        </div>
                    </div>
                    <div class="media-info">
                        <div class="media-name" title="${item.name}">${item.name}</div>
                        <div class="media-meta">
                            <span>${formatFileSize(item.file_size || 0)}</span>
                            <span>${new Date(item.uploaded_at).toLocaleString()}</span>
                        </div>
                        <div class="media-date">
                            ${item.event_association || ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Refresh icons
        if (window.lucide) window.lucide.createIcons();
    }
}

function closeFolderContentsModal() {
    const modal = document.getElementById('folderContentsModal');
    if (modal) modal.classList.remove('active');
    currentFolderId = null;
    currentFolderName = '';
    loadMedia(); // Refresh main grid counts
}

function getFileIcon(fileType) {
    if (!fileType) return '📄'; // Generic default
    fileType = fileType.toLowerCase();

    // Map exact DB file_type enums to specific icons and colors
    if (fileType === 'image') return '🖼️'; // Teal conceptual
    if (fileType === 'video') return '🎥'; // Purple conceptual
    if (fileType === 'pdf') return '📕'; // Red conceptual
    if (fileType === 'word') return '📘'; // Blue conceptual
    if (fileType === 'excel') return '📊'; // Green conceptual
    if (fileType === 'powerpoint') return '📙'; // Orange conceptual
    if (fileType === 'archive') return '🗜️'; // Gray conceptual
    
    return '📄'; // Fallback
}


function sortFolderFiles(column, forceAsc = null) {
    if (!currentFolderFiles || currentFolderFiles.length === 0) return;
    
    if (forceAsc !== null) {
        sortControl.column = column;
        sortControl.asc = forceAsc;
    } else {
        if (sortControl.column === column) {
            sortControl.asc = !sortControl.asc;
        } else {
            sortControl.column = column;
            sortControl.asc = true;
        }
    }
    
    currentFolderFiles.sort((a, b) => {
        let valA, valB;
        if (column === 'name') {
            valA = (a.name || '').toLowerCase();
            valB = (b.name || '').toLowerCase();
        } else if (column === 'type') {
            valA = (a.file_type || '').toLowerCase();
            valB = (b.file_type || '').toLowerCase();
        } else if (column === 'date') {
            valA = new Date(a.uploaded_at).getTime();
            valB = new Date(b.uploaded_at).getTime();
        }
        
        if (valA < valB) return sortControl.asc ? -1 : 1;
        if (valA > valB) return sortControl.asc ? 1 : -1;
        return 0;
    });
    
    updateSortIcons();
    populateFolderModal(currentFolderFiles);
}

function updateSortIcons() {
    ['name', 'type', 'date'].forEach(col => {
        const iconEl = document.getElementById(`sortIcon-${col}`);
        if (iconEl) {
            if (sortControl.column === col) {
                iconEl.textContent = sortControl.asc ? ' ▲' : ' ▼';
            } else {
                iconEl.textContent = '';
            }
        }
    });
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#722f37' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Make functions globally available
window.createNewFolder = createNewFolder;
window.closeFolderModal = closeFolderModal;
window.handleFolderCreation = handleFolderCreation;
window.uploadFile = uploadFile;
window.uploadToFolder = uploadToFolder;
window.viewFile = viewFile;
window.downloadFile = downloadFile;
window.deleteMedia = deleteMedia;
window.restoreMedia = restoreMedia;
window.switchMediaView = switchMediaView;
window.openFolder = openFolder;
window.closeFolderContentsModal = closeFolderContentsModal;
function goBackToRoot() {
    currentFolderId = null;
    currentFolderName = '';
    updateHeaderUI();
    loadMedia();
}

window.goBackToRoot = goBackToRoot;
window.sortFolderFiles = sortFolderFiles;

// Re-initialize Lucide after dynamic content updates
const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
                const node = mutation.addedNodes[i];
                if (node.nodeType === 1 && node.tagName.toLowerCase() !== 'svg') {
                    shouldUpdate = true;
                    break;
                }
            }
        }
    });
    
    if (shouldUpdate && window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
});
observer.observe(document.body, { childList: true, subtree: true });



function getMediaGridColumns(container) {
    if (!container) return 3;
    const style = window.getComputedStyle(container);
    return style.getPropertyValue('grid-template-columns').split(' ').length || 3;
}
