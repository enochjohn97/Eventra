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
            console.error('User session not found');
            return;
        }
        const response = await apiFetch(`../../api/media/get-media.php?client_id=${user.id}&status=${currentMediaStatus}${currentFolderId ? '&folder_id=' + currentFolderId : ''}`);
        const result = await response.json();

        // Update dashboard stats
        if (result.dashboard_stats) {
            const foldersEl = document.getElementById('foldersCreatedCount');
            if (foldersEl) foldersEl.textContent = result.dashboard_stats.folders_created || 0;
            
            const deletedEl = document.getElementById('mediaDeletedCount');
            if (deletedEl) deletedEl.textContent = result.dashboard_stats.folders_deleted || 0;
            
            const restoredEl = document.getElementById('restoredFilesCount');
            if (restoredEl) restoredEl.textContent = result.dashboard_stats.folders_restored || 0;
        }

        const mediaGrid = document.getElementById('mediaGrid');
        
        // Update hasFolders state
        hasFolders = result.media && result.media.some(item => item.type === 'folder');

        if (!result.success || !result.media || result.media.length === 0) {
            mediaGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 4rem; color: var(--client-text-muted);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📁</div>
                    <h3>No media found.</h3>
                    ${currentMediaStatus === 'active' ? `<p>Create a folder to get started with uploads.</p>
                    <button onclick="createNewFolder()" class="btn btn-primary" style="margin-top: 1rem;">Create Folder</button>` : ''}
                </div>
            `;
            return;
        }

        mediaGrid.innerHTML = result.media.map(item => {
            if (item.type === 'folder') {
                return `
                    <div class="media-card" onclick="openFolder(${item.id}, '${item.name.replace(/'/g, "\\'")}')" style="position: relative;">
                        <div class="media-thumb"><span class="folder-icon">📂</span></div>
                        <div class="media-info">
                            <div class="media-name">${item.name}</div>
                            <div class="media-meta"><span>${item.file_count || 0} files</span><span> · ${timeAgo(item.created_at)}</span></div>
                        </div>
                        <div class="media-actions-overlay" style="display: flex; gap: 8px; position: absolute; top: 12px; right: 12px; opacity: 1; visibility: visible; justify-content: flex-end; padding: 0;">
                            ${currentMediaStatus === 'active' 
                                ? `
                                    <span class="action-circle" onclick="uploadToFolder(${item.id}, '${item.name.replace(/'/g, "\\'")}', event)" title="Upload to Folder"><i data-lucide="upload" style="width: 16px; height: 16px;"></i></span>
                                    <span class="action-circle" onclick="deleteMedia(${item.id}, 'folder', event, ${item.file_count || 0})" title="Delete Folder" style="color: var(--card-red);"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></span>
                                ` 
                                : `<span class="action-circle" onclick="restoreMedia(${item.id}, 'folder', event)" title="Restore Folder" style="color: var(--card-green);"><i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i></span>`
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
                        <div class="media-thumb file-thumb" style="${isImage ? `background: url(${item.file_path}) center/cover;` : ''}">
                            ${isVideo ? `<video src="${item.file_path}" style="width: 100%; height: 100%; object-fit: cover;"></video>` : ''}
                            ${(!isImage && !isVideo) ? `<span class="file-icon" style="font-size: 4.5rem;">${getFileIcon(item.file_type)}</span>` : ''}
                            <div class="hd-badge">4K HD</div>
                            <div class="media-actions-overlay" style="display: flex; gap: 8px; position: absolute; top: 12px; right: 12px; opacity: 1; justify-content: flex-end; padding: 0;">
                                ${currentMediaStatus === 'active' ? `
                                    <span class="action-circle hd-toggle ${isEnhanced ? 'active' : ''}" onclick="toggleHDEnhancement(event, ${item.id})" title="HD Enhancement">✨</span>
                                    <span class="action-circle" onclick="viewFile('${item.file_path}')"><i data-lucide="eye" style="width: 16px; height: 16px;"></i></span>
                                    <span class="action-circle" onclick="downloadFile('${item.file_path}', '${item.name.replace(/'/g, "\\'")}')"><i data-lucide="download" style="width: 16px; height: 16px;"></i></span>
                                    <span class="action-circle" onclick="deleteMedia(${item.id}, 'file', event)" style="color: var(--card-red);" title="Delete File"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></span>
                                ` : `
                                    <span class="action-circle" onclick="restoreMedia(${item.id}, 'file', event)" style="color: var(--card-green);" title="Restore File"><i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i></span>
                                `}
                            </div>
                        </div>
                        <div class="media-info">
                            <div class="media-name">${item.name}</div>
                            <div class="media-meta"><span style="text-transform: capitalize;">${item.file_type || 'File'}</span><span>${formatFileSize(item.file_size)}</span></div>
                        </div>
                    </div>
                `;
            }
        }).join('');
    } catch (error) {
        console.error('Error loading media:', error);
    }
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
        const response = await apiFetch('../../api/media/create-folder.php', {
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
        console.error('Folder creation error:', error);
        showNotification('An error occurred while creating folder', 'error');
    }
}

function uploadFile() {
    // Enforce folder creation before upload
    if (!hasFolders) {
        if (document.activeElement) document.activeElement.blur();
        Swal.fire({
            title: 'No Folders Found',
            text: 'You must create a folder before uploading files.',
            icon: 'info',
            confirmButtonText: 'Create Folder',
            confirmButtonColor: '#3b82f6'
        }).then((result) => {
            if (result.isConfirmed) {
                createNewFolder();
            }
        });
        return;
    }

    // Create hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx';

    input.onchange = async (e) => {
        const files = e.target.files;
        if (!files.length) return;

        // Show upload progress notification
        showNotification(`Uploading ${files.length} file(s)...`, 'info');

        const formData = new FormData();
        for (let file of files) {
            formData.append('files[]', file);
        }
        formData.append('folder_name', currentFolderId ? currentFolderName : 'default');
        if (currentFolderId) {
            formData.append('folder_id', currentFolderId);
        }

        try {
            const response = await apiFetch('../../api/media/upload-media.php', {
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
            console.error('Upload error:', error);
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

        showNotification(`Uploading ${files.length} file(s) to ${folderName}...`, 'info');

        const formData = new FormData();
        for (let file of files) {
            formData.append('files[]', file);
        }
        formData.append('folder_id', folderId);
        formData.append('folder_name', folderName);

        try {
            const response = await apiFetch('../../api/media/upload-media.php', {
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
            console.error('Upload error:', error);
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

function viewFile(filePath) {
    window.open(filePath, '_blank');
}

function downloadFile(filePath, fileName) {
    const a = document.createElement('a');
    a.href = filePath;
    a.download = fileName;
    a.click();
}

async function deleteMedia(id, type = 'file', e, fileCount = 0) {
    if (e) e.stopPropagation();
    if (document.activeElement) document.activeElement.blur();
    
    // Check folder condition
    if (type === 'folder') {
        let title = 'Delete Folder?';
        let text = 'Are you sure you want to move this folder to trash?';
        
        if (fileCount > 0) {
            title = 'Folder Not Empty';
            text = `This folder contains ${fileCount} files. Deleting it will move all files to trash. Continue?`;
        }
        
        if (!confirmResult.isConfirmed) return;
        
        try {
            const response = await apiFetch('../../api/media/delete-folder.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: id })
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Folder moved to trash', 'success');
                loadMedia();
            } else {
                showNotification('Delete failed: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Delete error:', error);
            showNotification('An error occurred', 'error');
        }
    } else {
        const result = await Swal.fire({
            title: 'Delete Media?',
            text: 'Are you sure you want to move this file to trash?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#9ca3af',
            confirmButtonText: 'Yes, Delete',
            cancelButtonText: 'Keep it'
        });

        if (!result.isConfirmed) return;

        try {
            const response = await apiFetch('../../api/media/delete-media.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ media_id: id })
            });

            const result = await response.json();

            if (result.success) {
                showNotification('File moved to trash', 'success');
                if (currentFolderId) {
                    openFolder(currentFolderId, currentFolderName);
                } else {
                    loadMedia();
                }
            } else {
                showNotification('Delete failed: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Delete error:', error);
            showNotification('An error occurred', 'error');
        }
    }
}

async function restoreMedia(id, type = 'file', e) {
    if (e) e.stopPropagation();
    try {
        const response = await apiFetch('../../api/media/restore.php', {
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
    const tbody = document.getElementById('folderItemsTableBody');
    const emptyState = document.getElementById('modalEmptyState');
    
    nameEl.textContent = name;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">Loading files...</td></tr>';
    emptyState.style.display = 'none';
    modal.classList.add('active');

    try {
        const user = storage.getUser();
        const response = await apiFetch(`../../api/media/get-folder-contents.php?client_id=${user.id}&folder_id=${id}&status=${currentMediaStatus}`);
        const result = await response.json();

        if (result.success && result.files) {
            currentFolderFiles = result.files;
            sortFolderFiles('date', false); // default sort and render
        } else {
            currentFolderFiles = [];
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
        }
    } catch (error) {
        console.error('Error fetching folder contents:', error);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--client-text-muted);">Failed to load files</td></tr>';
    }
}

function populateFolderModal(files) {
    const tbody = document.getElementById('folderItemsTableBody');
    const countEl = document.getElementById('modalFileCount');
    const emptyState = document.getElementById('modalEmptyState');
    
    countEl.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    
    if (files.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    tbody.innerHTML = files.map(file => `
        <tr style="border-bottom: 1px solid #f1f4f8; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
            <td style="padding: 1rem; display: flex; align-items: center; gap: 16px;">
                <span style="font-size: 1.8rem; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">${getFileIcon(file.file_type)}</span>
                <span style="font-weight: 600; font-size: 0.95rem; color: #1e293b; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${file.name}">${file.name}</span>
            </td>
            <td style="padding: 1rem; font-size: 0.85rem; color: #64748b; text-transform: capitalize;">${file.file_type || 'Unknown'}</td>
            <td style="padding: 1rem; font-size: 0.85rem; color: #64748b;">${new Date(file.uploaded_at).toLocaleDateString()}</td>
            <td style="padding: 1rem; text-align: right;">
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <span class="action-circle" onclick="viewFile('${file.file_path}')" style="width: 32px; height: 32px; font-size: 0.9rem;" title="View"><i data-lucide="eye" style="width: 16px; height: 16px;"></i></span>
                    ${currentMediaStatus === 'active' 
                        ? `<span class="action-circle" onclick="deleteMedia(${file.id}, 'file', event)" style="width: 32px; height: 32px; font-size: 0.9rem; color: var(--card-red);" title="Delete"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></span>`
                        : `<span class="action-circle" onclick="restoreMedia(${file.id}, 'file', event)" style="width: 32px; height: 32px; font-size: 0.9rem; color: var(--card-green);" title="Restore"><i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i></span>`
                    }
                </div>
            </td>
        </tr>
    `).join('');
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

function timeAgo(dateString) {
    if (!dateString) return 'recently';
    // Ensure proper parsing cross-browser
    const validDateString = dateString.replace(' ', 'T');
    
    // Convert SQL date (assuming UTC or Local) to milliseconds
    const date = new Date(validDateString).getTime();
    const now = new Date().getTime();
    
    // Calculate seconds diff, allowing a small 60s buffer for minor server-client timezone skews natively
    let diffMs = now - date;
    let seconds = Math.floor(diffMs / 1000);
    
    // If the date is wildly in the future (due to a heavy timezone offset without 'Z'), we adjust it
    // Usually, this means the DB stored it in local time, but the browser thinks it's UTC and subtracts the offset
    if (seconds < -60) {
        // Fallback: Date seems to be in the future, let's treat the parsed date as local inherently
        // by stripping any assumed timezone, or just returning 'recently' for safety if it's very close
        const offsetDate = new Date(validDateString + 'Z').getTime();
        diffMs = now - offsetDate;
        seconds = Math.floor(diffMs / 1000);
    }
    
    if (seconds < 0) {
        seconds = 0; // Final safety floor
        diffMs = 0;
    }
    
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    
    if (minutes < 1) {
        return seconds > 10 ? `${seconds} seconds ago` : `recently`;
    }
    
    if (minutes < 60) {
        return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    }
    
    if (hours < 24) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    
    if (days >= 1 && days < 7) {
        if (days === 1) return '1 day ago';
        return `${days} days ago`;
    }
    
    if (weeks >= 1) {
        const actualDate = new Date(now - diffMs);
        return actualDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    
    return 'recently';
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
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
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
