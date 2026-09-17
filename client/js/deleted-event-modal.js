/**
 * Deleted Event Modal System
 * Handles viewing, restoring, and permanently deleting events from notifications
 */

class DeletedEventModal {
    constructor() {
        this.modal = null;
        this.currentEventId = null;
        this.init();
    }

    init() {
        // Create modal HTML
        this.createModal();
        // Attach event listeners
        this.attachListeners();
    }

    createModal() {
        const modalHTML = `
            <div id="deletedEventModal" class="deleted-event-modal-backdrop" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 2000; justify-content: center; align-items: center; backdrop-filter: blur(6px);">
                <div class="deleted-event-modal-content" style="background: white; width: 90%; max-width: 600px; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.3); transform: scale(0.9); transition: transform 0.3s ease;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 2rem; position: relative;">
                        <button class="close-deleted-modal" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.2); border: none; width: 36px; height: 36px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center;">&times;</button>
                        <h2 style="font-size: 1.5rem; font-weight: 800; margin: 0;">Deleted Event</h2>
                        <p style="margin: 0.5rem 0 0 0; opacity: 0.9; font-size: 0.9rem;">This event has been moved to trash</p>
                    </div>
                    <div class="modal-body" id="deletedEventContent" style="padding: 2rem; max-height: 60vh; overflow-y: auto;">
                        <!-- Event details will be inserted here -->
                    </div>
                    <div class="modal-footer" style="padding: 1.5rem 2rem; border-top: 1px solid #e5e7eb; display: flex; gap: 1rem; justify-content: flex-end; background: #f9fafb;">
                        <button class="btn-delete-permanent" style="background: #ef4444; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 10px; font-weight: 700; cursor: pointer; transition: all 0.3s; font-size: 0.95rem;">Delete Permanently</button>
                        <button class="btn-restore" style="background: #722f37; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 10px; font-weight: 700; cursor: pointer; transition: all 0.3s; font-size: 0.95rem;">Restore Event</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('deletedEventModal');
    }

    attachListeners() {
        // Close button
        const closeBtn = this.modal.querySelector('.close-deleted-modal');
        closeBtn.addEventListener('click', () => this.close());

        // Backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                this.close();
            }
        });

        // Restore button
        const restoreBtn = this.modal.querySelector('.btn-restore');
        restoreBtn.addEventListener('click', () => this.restoreEvent());

        // Delete permanently button
        const deleteBtn = this.modal.querySelector('.btn-delete-permanent');
        deleteBtn.addEventListener('click', () => this.deletePermanently());
    }

    async open(eventId) {
        this.currentEventId = eventId;
        
        // Fetch event details
        try {
            const response = await apiFetch(`/api/events/get-event-details.php?event_id=${eventId}`);
            const result = await response.json();
            
            if (result && result.success && result.event) {
                this.renderEventDetails(result.event);
                this.modal.style.display = 'flex';
                setTimeout(() => {
                    this.modal.querySelector('.deleted-event-modal-content').style.transform = 'scale(1)';
                }, 10);
            } else {
                this.showNotification('Failed to load event details', 'error');
            }
        } catch (error) {
            this.showNotification('An error occurred', 'error');
        }
    }

    renderEventDetails(event) {
        const content = this.modal.querySelector('#deletedEventContent');
        const eventImage = event.image_path || (typeof getImageUrl === 'function' ? getImageUrl('/public/assets/imgs/login.png') : '/public/assets/imgs/login.png');
        
        content.innerHTML = `
            <div style="margin-bottom: 1.5rem;">
                <img src="${eventImage}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 12px;" alt="Event">
            </div>
            <h3 style="font-size: 1.5rem; font-weight: 800; color: #111827; margin-bottom: 0.5rem;">${escapeHTML(event.event_name)}</h3>
            <p style="color: #6b7280; margin-bottom: 1.5rem;">Organized by ${escapeHTML(event.client_name) || 'Eventra'}</p>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                <div style="background: #f3f4f6; padding: 1rem; border-radius: 10px;">
                    <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Date</div>
                    <div style="font-weight: 700; color: #374151;">${new Date(event.event_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                </div>
                <div style="background: #f3f4f6; padding: 1rem; border-radius: 10px;">
                    <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Time</div>
                    <div style="font-weight: 700; color: #374151;">${event.event_time.substring(0, 5)}</div>
                </div>
                <div style="background: #f3f4f6; padding: 1rem; border-radius: 10px;">
                    <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Price</div>
                    <div style="font-weight: 700; color: #374151;">${event.price > 0 ? '₦' + parseFloat(event.price).toLocaleString() : 'Free'}</div>
                </div>
                <div style="background: #f3f4f6; padding: 1rem; border-radius: 10px;">
                    <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Category</div>
                    <div style="font-weight: 700; color: #374151;">${escapeHTML(event.event_type) || 'General'}</div>
                </div>
            </div>
            
            <div style="margin-bottom: 1.5rem;">
                <label style="display: block; font-size: 0.85rem; color: #111827; margin-bottom: 0.5rem; text-transform: uppercase; font-weight: 700;">Location</label>
                <div style="background: #f3f4f6; padding: 1rem; border-radius: 10px; color: #4b5563;">${escapeHTML(event.address || event.state) || 'No address provided'}</div>
            </div>
            
            <div>
                <label style="display: block; font-size: 0.85rem; color: #111827; margin-bottom: 0.5rem; text-transform: uppercase; font-weight: 700;">Description</label>
                <div style="color: #4b5563; line-height: 1.6; background: #f3f4f6; padding: 1rem; border-radius: 10px;">${escapeHTML(event.description) || 'No description available'}</div>
            </div>
        `;
    }

    async restoreEvent() {
        if (!this.currentEventId) return;

        try {
            const result = await Swal.fire({
                title: 'Restore Event?',
                text: 'This event will be restored with "restored" status. You can edit and publish it again.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#722f37',
                cancelButtonColor: '#9ca3af',
                confirmButtonText: 'Yes, Restore',
                cancelButtonText: 'Cancel'
            });

            if (!result.isConfirmed) return;

            const response = await apiFetch('/api/events/restore-event.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: this.currentEventId })
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('Event restored successfully', 'success');
                this.close();
                // Reload events if on events page
                if (typeof loadEvents === 'function') {
                    const user = storage.get('user');
                    await loadEvents(user.id);
                }
                // Reload notifications
                if (window.notificationSystem) {
                    window.notificationSystem.fetchNotifications();
                }
            } else {
                this.showNotification('Failed to restore event: ' + escapeHTML(data.message), 'error');
            }
        } catch (error) {
            this.showNotification('An error occurred', 'error');
        }
    }

    async deletePermanently() {
        if (!this.currentEventId) return;

        try {
            const result = await Swal.fire({
                title: 'Delete Permanently?',
                text: 'This action cannot be undone. The event will be permanently deleted from the database.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#9ca3af',
                confirmButtonText: 'Yes, Delete Forever',
                cancelButtonText: 'Cancel'
            });

            if (!result.isConfirmed) return;

            const response = await apiFetch('/api/events/delete-event-permanent.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_id: this.currentEventId })
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('Event permanently deleted', 'success');
                this.close();
                // Reload events if on events page
                if (typeof loadEvents === 'function') {
                    const user = storage.get('user');
                    await loadEvents(user.id);
                }
                // Reload notifications
                if (window.notificationSystem) {
                    window.notificationSystem.fetchNotifications();
                }
            } else {
                this.showNotification('Failed to delete event: ' + escapeHTML(data.message), 'error');
            }
        } catch (error) {
            this.showNotification('An error occurred', 'error');
        }
    }

    close() {
        this.modal.querySelector('.deleted-event-modal-content').style.transform = 'scale(0.9)';
        setTimeout(() => {
            this.modal.style.display = 'none';
            this.currentEventId = null;
        }, 300);
    }

    showNotification(message, type) {
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.deletedEventModal = new DeletedEventModal();
});

// Make it globally accessible
window.DeletedEventModal = DeletedEventModal;
