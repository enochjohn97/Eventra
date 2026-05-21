
// Utility function to resolve image paths correctly
function resolveImagePath(imagePath) {
    if (!imagePath) {
        return 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop';
    }
    // If it's an absolute URL, use as-is
    if (imagePath.startsWith('http')) {
        return imagePath;
    }
    // If it starts with /, prepend base URL
    if (imagePath.startsWith('/')) {
        return imagePath;
    }
    // Otherwise, assume it's a relative path from uploads
    return '/' + imagePath;
}

// Event Preview Function for Admin
async function previewEvent(eventId) {
    const row = document.querySelector(`tr[data-id="${eventId}"]`);
    if (!row) return;

    // Provide visual feedback while loading
    row.style.opacity = '0.7';
    
    let event;
    try {
        const response = await fetch(`/api/events/get-event.php?id=${eventId}`);
        const result = await response.json();
        
            if (result.success && result.event) {
                const data = result.event;
                
                // Format prices dynamically
                let formattedPrice = 'Free';
                const basePrice = parseFloat(data.price) || 0;
                const regPrice = parseFloat(data.regular_price) || 0;
                const vPrice = parseFloat(data.vip_price) || 0;
                const premPrice = parseFloat(data.premium_price) || 0;
                
                const isFree = basePrice === 0 && regPrice === 0 && vPrice === 0 && premPrice === 0;
                
                if (!isFree) {
                    const mode = data.ticket_type_mode || 'all';
                    if (mode === 'all' || mode.includes('all')) {
                        formattedPrice = `₦${basePrice.toLocaleString()}`;
                    } else {
                        const modes = mode.split(',').map(m => m.trim().toLowerCase());
                        const prices = [];
                        if (modes.includes('regular') && regPrice > 0) prices.push(`Regular ₦${regPrice.toLocaleString()}`);
                        if (modes.includes('vip') && vPrice > 0) prices.push(`VIP ₦${vPrice.toLocaleString()}`);
                        if (modes.includes('premium') && premPrice > 0) prices.push(`Premium ₦${premPrice.toLocaleString()}`);
                        
                        if (prices.length > 0) {
                            formattedPrice = prices.join(', ');
                        } else if (basePrice > 0) {
                            formattedPrice = `₦${basePrice.toLocaleString()}`;
                        } else {
                            formattedPrice = 'Paid';
                        }
                    }
                }

                event = {
                    id: eventId,
                    name: data.event_name,
                    custom_id: data.custom_id || eventId,
                    client_name: data.client_name || 'N/A',
                    price: formattedPrice,
                    attendees: data.attendee_count,
                    category: data.category || data.event_type || 'General',
                    status: data.status ? data.status.charAt(0).toUpperCase() + data.status.slice(1) : 'Draft',
                    image: resolveImagePath(data.image_path),
                    tag: data.tag || 'Standard',
                    description: data.description,
                    address: data.address,
                    state: data.state,
                    date: data.event_date,
                    time: data.event_time,
                    priority: data.priority ? data.priority.charAt(0).toUpperCase() + data.priority.slice(1) : 'Normal',
                    phone: data.phone_contact_1 || 'N/A',
                    locations: data.locations
                };
        } else {
            throw new Error(result.message || 'Event not found');
        }
    } catch (e) {
        alert('Could not load event details.');
        row.style.opacity = '1';
        return;
    } finally {
        row.style.opacity = '1';
    }

    const eventName = (event.name || '').replace(/\s*#\d+$/, '');
    const state = row.dataset.state || event.state;
    const clientName = event.client_name;
    const price = event.price;
    const attendees = event.attendees;
    const category = event.category;
    const status = event.status;
    const eventImage = event.image;
    const tag = event.tag;
    const description = event.description;
    const address = event.address;
    const date = event.date;
    const time = event.time;
    const priority = row.dataset.priority || event.priority;
    const phone = event.phone;

    // Create Modal Backdrop (if not exists)
    let backdrop = document.querySelector('.preview-modal-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'preview-modal-backdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-hidden', 'false');
        backdrop.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: none; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(4px); transition: all 0.3s ease; overflow-y: auto;';
        backdrop.innerHTML = `
            <div class="preview-modal" style="background: white; width: 95%; max-width: 900px; border-radius: 16px; overflow: hidden; position: relative; transform: translateY(20px); transition: all 0.3s ease; box-shadow: 0 20px 40px rgba(0,0,0,0.2); max-height: 90vh; display: flex; flex-direction: column; margin: auto;">
                <button class="preview-close" aria-label="Close Preview" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.8); border: none; width: 32px; height: 32px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.1); backdrop-filter: blur(4px);">×</button>
                <div id="previewContent" style="overflow-y: auto; flex: 1;"></div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const closeBtn = backdrop.querySelector('.preview-close');
        closeBtn.onclick = () => {
            backdrop.style.opacity = '0';
            backdrop.querySelector('.preview-modal').style.transform = 'translateY(20px)';
            setTimeout(() => { backdrop.style.display = 'none'; }, 300);
        };
        backdrop.onclick = (e) => {
            if (e.target === backdrop) closeBtn.click();
        };
    }

    const content = backdrop.querySelector('#previewContent');
    const statusColor = status.toLowerCase() === 'published' ? '#10b981' : status.toLowerCase() === 'scheduled' ? '#3b82f6' : '#ef4444';
    
    content.innerHTML = `
        <div class="event-preview-container" style="font-family: 'Plus Jakarta Sans', sans-serif;">
            <!-- Hero Header -->
            <div style="position: relative; height: 300px; border-radius: 0 0 32px 32px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);">
                <img src="${eventImage}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;" onerror="this.src='https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop'" alt="Event">
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, transparent 100%);"></div>
                
                <div style="position: absolute; top: 1.5rem; left: 1.5rem; display: flex; gap: 10px;">
                    <div style="background: ${statusColor}; color: white; padding: 0.6rem 1.2rem; border-radius: 12px; font-weight: 800; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; backdrop-filter: blur(8px); box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                        ${status}
                    </div>
                    <div style="background: rgba(255,255,255,0.2); color: white; padding: 0.6rem 1.2rem; border-radius: 12px; font-weight: 800; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.3);">
                        ID: ${event.custom_id || eventId}
                    </div>
                </div>

                <div style="position: absolute; bottom: 2rem; left: 2rem; right: 2rem;">
                    <h1 style="font-size: 2.25rem; font-weight: 800; color: white; margin-bottom: 0.5rem; text-shadow: 0 2px 10px rgba(0,0,0,0.5);">${escapeHTML(eventName)}</h1>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 32px; height: 32px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--admin-primary); font-size: 0.8rem;">
                            ${escapeHTML(clientName.charAt(0))}
                        </div>
                        <span style="color: rgba(255,255,255,0.9); font-weight: 600; font-size: 1rem;">Hosted by <span style="color: white; font-weight: 700;">${escapeHTML(clientName)}</span></span>
                    </div>
                </div>
            </div>

            <!-- Content Body -->
            <div style="padding: 3rem;">
                <!-- Quick Stats Grid -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 3rem;">
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0; transition: all 0.3s ease;">
                        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📅</div>
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Date</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 0.9rem;">${new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🕒</div>
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Time</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 0.9rem;">${time.substring(0, 5)}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">💎</div>
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Tickets</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 0.9rem;">${escapeHTML(price)}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">✨</div>
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Category</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 0.9rem;">${escapeHTML(category)}</div>
                    </div>
                </div>

                <!-- Info Sections -->
                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 2.5rem;">
                    <div>
                        <h3 style="font-size: 1rem; font-weight: 800; color: #1e293b; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 10px;">
                            <span style="width: 4px; height: 16px; background: var(--admin-primary); border-radius: 4px;"></span>
                            About this Event
                        </h3>
                        <div style="color: #475569; line-height: 1.8; font-size: 0.95rem; white-space: pre-wrap; margin-bottom: 2rem;">
                            ${escapeHTML(description) || "The organizer hasn't provided a detailed description for this event yet."}
                        </div>

                        <h3 style="font-size: 1rem; font-weight: 800; color: #1e293b; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 10px;">
                            <span style="width: 4px; height: 16px; background: var(--admin-primary); border-radius: 4px;"></span>
                            Venue Location
                        </h3>
                        <div style="background: #f1f5f9; padding: 1.5rem; border-radius: 20px;">
                            ${(() => {
                                let locs = null;
                                try {
                                    locs = event.locations ? (typeof event.locations === 'string' ? JSON.parse(event.locations) : event.locations) : null;
                                } catch(e) {}
                                if (Array.isArray(locs) && locs.length > 0) {
                                    return locs.map((loc, idx) => `
                                        <div style="display: flex; align-items: flex-start; gap: 15px; ${idx > 0 ? 'margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px dashed #cbd5e1;' : ''}">
                                            <div style="font-size: 1.5rem;">📍</div>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">${escapeHTML(loc.state)}</div>
                                                ${loc.address ? `<div style="color: #475569; font-size: 0.875rem; margin-bottom: 0.25rem;">${escapeHTML(loc.address)}</div>` : ''}
                                                ${loc.date ? `
                                                    <div style="color: var(--admin-primary); font-size: 0.8rem; font-weight: 700; display: flex; align-items: center; gap: 6px; margin-top: 0.4rem;">
                                                        <span>📅</span>
                                                        <span>${new Date(loc.date + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                        ${loc.time ? `<span>🕒 ${loc.time.substring(0, 5)}</span>` : ''}
                                                    </div>
                                                ` : ''}
                                            </div>
                                        </div>
                                    `).join('');
                                }
                                return `
                                    <div style="display: flex; align-items: flex-start; gap: 15px;">
                                        <div style="font-size: 1.5rem;">📍</div>
                                        <div>
                                            <div style="font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">${escapeHTML(state) || 'Location'}</div>
                                            <div style="color: #64748b; font-size: 0.875rem;">${escapeHTML(address) || 'No specific address available'}</div>
                                        </div>
                                    </div>
                                `;
                            })()}
                        </div>
                    </div>

                    <div>
                        <div style="background: #fff; border: 1.5px solid #eef2ff; padding: 2rem; border-radius: 24px; box-shadow: 0 10px 40px rgba(99, 102, 241, 0.05); margin-bottom: 2rem;">
                            <div style="text-align: center; margin-bottom: 1.5rem;">
                                <div style="font-size: 2.5rem; font-weight: 800; color: var(--admin-primary); margin-bottom: 0.25rem;">${attendees}</div>
                                <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Total Attendees</div>
                            </div>
                            
                            <div style="height: 6px; background: #f1f5f9; border-radius: 10px; overflow: hidden; margin-bottom: 2rem;">
                                <div style="width: 65%; height: 100%; background: var(--admin-primary); border-radius: 10px;"></div>
                            </div>

                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
                                    <span style="color: #64748b; font-weight: 600;">Priority</span>
                                    <span style="color: #1e293b; font-weight: 700; text-transform: uppercase;">${escapeHTML(priority) || 'Normal'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
                                    <span style="color: #64748b; font-weight: 600;">Type</span>
                                    <span style="color: #1e293b; font-weight: 700;">${escapeHTML(tag) || 'Standard'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
                                    <span style="color: #64748b; font-weight: 600;">Contact</span>
                                    <span style="color: #1e293b; font-weight: 700;">${escapeHTML(phone) || '—'}</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    `;

    backdrop.style.display = 'flex';
    backdrop.style.opacity = '0';
    setTimeout(() => {
        backdrop.style.opacity = '1';
        backdrop.querySelector('.preview-modal').style.transform = 'translateY(0)';
    }, 10);
}

// Make function globally available
window.previewEvent = previewEvent;
