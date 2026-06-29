// Profile Picture Upload Manager
class ProfilePicUpload {
    constructor() {
        this.modal = null;
        this.selectedFile = null;
        this.init();
    }

    init() {
        this.createModal();
        this.attachEventListeners();
    }

    createModal() {
        const modalHTML = `
            <div class="modal-backdrop" id="profilePicModal" style="display: none;">
                <div class="profile-pic-upload-modal">
                    <div class="upload-modal-header">
                        <h2>Update Profile Picture</h2>
                        <span class="upload-modal-close">&times;</span>
                    </div>
                    <div class="upload-modal-body">
                        <div class="upload-dropzone" id="uploadDropzone">
                            <div class="upload-icon">📷</div>
                            <p class="upload-text">Drag & drop your image here</p>
                            <p class="upload-subtext">or</p>
                            <button type="button" class="btn btn-primary" id="browseFileBtn">Browse Files</button>
                            <input type="file" id="profilePicInput" accept="image/jpeg,image/jpg,image/png,image/gif" style="display: none;">
                            <p class="upload-hint">JPG, PNG or GIF</p>
                        </div>
                        <div class="upload-preview" id="uploadPreview" style="display: none;">
                            <img id="previewImage" src="" alt="Preview">
                            <button type="button" class="btn-remove-preview" id="removePreviewBtn">&times;</button>
                        </div>
                        <div class="upload-progress" id="uploadProgress" style="display: none;">
                            <div class="progress-bar">
                                <div class="progress-fill" id="progressFill"></div>
                            </div>
                            <p class="progress-text" id="progressText">Uploading... 0%</p>
                        </div>
                    </div>
                    <div class="upload-modal-footer">
                        <button type="button" class="btn btn-secondary" id="cancelUploadBtn">Cancel</button>
                        <button type="button" class="btn btn-primary" id="uploadBtn" disabled>Upload</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('profilePicModal');
    }

    attachEventListeners() {
        // Open modal when edit button is clicked
        document.addEventListener('click', (e) => {
            if (e.target.closest('#profilePicEditBtn') || e.target.closest('.profile-edit-btn')) {
                this.openModal();
            }
        });

        // Close modal
        const closeBtn = document.querySelector('.upload-modal-close');
        const cancelBtn = document.getElementById('cancelUploadBtn');
        
        if (closeBtn) closeBtn.onclick = () => this.closeModal();
        if (cancelBtn) cancelBtn.onclick = () => this.closeModal();

        // Browse file button
        const browseBtn = document.getElementById('browseFileBtn');
        const fileInput = document.getElementById('profilePicInput');
        
        if (browseBtn) {
            browseBtn.onclick = () => fileInput.click();
        }

        // File input change
        if (fileInput) {
            fileInput.onchange = (e) => this.handleFileSelect(e.target.files[0]);
        }

        // Drag and drop
        const dropzone = document.getElementById('uploadDropzone');
        if (dropzone) {
            dropzone.ondragover = (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            };

            dropzone.ondragleave = () => {
                dropzone.classList.remove('dragover');
            };

            dropzone.ondrop = (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                this.handleFileSelect(file);
            };
        }

        // Remove preview
        const removePreviewBtn = document.getElementById('removePreviewBtn');
        if (removePreviewBtn) {
            removePreviewBtn.onclick = () => this.removePreview();
        }

        // Upload button
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.onclick = () => this.uploadFile();
        }
    }

    openModal() {
        if (this.modal) {
            this.modal.style.display = 'flex';
            this.resetModal();
        }
    }

    closeModal() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.resetModal();
        }
    }

    resetModal() {
        this.selectedFile = null;
        document.getElementById('uploadDropzone').style.display = 'block';
        document.getElementById('uploadPreview').style.display = 'none';
        document.getElementById('uploadProgress').style.display = 'none';
        document.getElementById('uploadBtn').disabled = true;
        document.getElementById('profilePicInput').value = '';
    }

    handleFileSelect(file) {
        if (!file) return;

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            if (window.toast) {
                window.toast.error('Invalid file type. Please select a JPG, PNG, or GIF image.');
            }
            return;
        }



        this.selectedFile = file;
        this.showPreview(file);
    }

    showPreview(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const previewImage = document.getElementById('previewImage');
            previewImage.src = e.target.result;
            
            document.getElementById('uploadDropzone').style.display = 'none';
            document.getElementById('uploadPreview').style.display = 'block';
            document.getElementById('uploadBtn').disabled = false;
        };
        reader.readAsDataURL(file);
    }

    removePreview() {
        this.selectedFile = null;
        document.getElementById('uploadDropzone').style.display = 'block';
        document.getElementById('uploadPreview').style.display = 'none';
        document.getElementById('uploadBtn').disabled = true;
        document.getElementById('profilePicInput').value = '';
    }

    async uploadFile() {
        if (!this.selectedFile) return;

        const formData = new FormData();
        formData.append('profile_pic', this.selectedFile);

        // Show progress
        document.getElementById('uploadProgress').style.display = 'block';
        document.getElementById('uploadBtn').disabled = true;

        try {
            const xhr = new XMLHttpRequest();

            // Track upload progress
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    document.getElementById('progressFill').style.width = percentComplete + '%';
                    document.getElementById('progressText').textContent = `Uploading... ${Math.round(percentComplete)}%`;
                }
            };

            xhr.onload = () => {
                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        this.handleUploadSuccess(response.profile_pic);
                    } else {
                        this.handleUploadError(response.message);
                    }
                } else {
                    this.handleUploadError('Upload failed. Please try again.');
                }
            };

            xhr.onerror = () => {
                this.handleUploadError('Network error. Please check your connection.');
            };

            xhr.open('POST', '/api/admin/upload-profile-pic.php', true);
            xhr.send(formData);

        } catch (error) {
            this.handleUploadError('An error occurred during upload.');
        }
    }

    handleUploadSuccess(newProfilePicPath) {
        if (window.toast) {
            window.toast.success('Profile picture updated successfully!');
        }

        // Update admin auth cached data
        if (window.adminAuth && window.adminAuth.adminData) {
            window.adminAuth.adminData.profile_pic = newProfilePicPath;
        }

        // Dispatch global sync event
        document.dispatchEvent(new CustomEvent('EventraProfileUpdated', {
            detail: { 
                profile_pic: newProfilePicPath,
                name: window.adminAuth?.adminData?.name || ''
            }
        }));

        // Close modal
        setTimeout(() => {
            this.closeModal();
        }, 1000);
    }

    handleUploadError(message) {
        if (window.toast) {
            window.toast.error(message);
        }

        // Reset progress
        document.getElementById('uploadProgress').style.display = 'none';
        document.getElementById('uploadBtn').disabled = false;
    }

    updateProfilePictures(newPath) {
        // Redundant - now handled by EventraProfileUpdated listener in utils.js
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.profilePicUpload = new ProfilePicUpload();
});
