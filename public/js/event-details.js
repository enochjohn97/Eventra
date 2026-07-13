document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Auth Controller
    authController.init();
    
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('id');
    const eventTag = urlParams.get('event'); // Fallback for old links
    const clientName = urlParams.get('client');

    // Capture referral if client is in URL
    if (clientName) {
        sessionStorage.setItem('referral_client', clientName);
    }

    if (!eventId && !eventTag) {
        showNotification('Event not specified', 'error');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }

    if (eventId) {
        await loadEventDetailsById(eventId);
    } else {
        await loadEventDetailsByTag(eventTag);
    }
});

async function loadEventDetailsById(id) {
    try {
        const response = await apiFetch(`/api/events/get-event-details.php?event_id=${id}`);
        const result = await response.json();

        if (result.success) {
            renderEvent(result.event);
        } else {
            showNotification(result.message || 'Event not found', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    } catch (error) {
        showNotification('System error occurred', 'error');
    }
}

async function loadEventDetailsByTag(tag) {
    try {
        const response = await apiFetch(`/api/events/get-event-by-tag.php?tag=${tag}`);
        const result = await response.json();

        if (result.success) {
            renderEvent(result.event);
        } else {
            showNotification(result.message || 'Event not found', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    } catch (error) {
        showNotification('System error occurred', 'error');
    }
}

function renderEvent(event) {
    document.title = `${event.event_name} - Eventra`;
    
    // Update OpenGraph tags dynamically
    updateMetaTags(event);

    document.getElementById('eventTitle').textContent = event.event_name;
    document.getElementById('eventSummary').textContent = event.event_type;
    document.getElementById('eventDescription').textContent = event.description;
    document.getElementById('eventAddress').textContent = `${event.address || 'N/A'}, ${event.state}`;
    document.getElementById('eventDate').textContent = formatDate(event.event_date);
    document.getElementById('eventTime').textContent = event.event_time;
    
    // Client Verification Badge - Sanitize name first
    const verificationBadge = (Number(event.client_is_verified) === 1) 
        ? ' <span style="display: inline-flex; align-items: center; justify-content: center; background: #722f37; color: white; width: 16px; height: 16px; border-radius: 50%; font-size: 10px; margin-left: 4px; border: 1.5px solid white; box-shadow: 0 0 0 1px #722f37;" title="Verified Event Planner">✓</span>'
        : '';
    
    const clientNameContainer = document.getElementById('clientName');
    clientNameContainer.textContent = event.client_name || 'Eventra Organizer';
    if (verificationBadge) {
        clientNameContainer.insertAdjacentHTML('beforeend', verificationBadge);
    }
    
    // Handle pricing - robust multi-tier logic
    let priceText = 'Free';
    const regPrice = parseFloat(event.regular_price || 0);
    const vipPrice = parseFloat(event.vip_price || 0);
    const premPrice = parseFloat(event.premium_price || 0);
    const legacyPrice = parseFloat(event.price || 0);

    // Get active modes from metadata (ticket_type_mode)
    let modes = (event.ticket_type_mode || 'all').split(',').map(m => m.trim().toLowerCase());
    
    if (modes.includes('all') || modes.length === 0) {
        priceText = legacyPrice > 0 ? `₦${legacyPrice.toLocaleString()}` : 'Free';
    } else {
        let priceParts = [];
        if (modes.includes('regular')) priceParts.push(regPrice);
        if (modes.includes('vip')) priceParts.push(vipPrice);
        if (modes.includes('premium')) priceParts.push(premPrice);
        
        const maxP = Math.max(...priceParts);
        const minP = Math.min(...priceParts);
        
        if (maxP > 0) {
            priceText = minP === maxP ? `₦${minP.toLocaleString()}` : `₦${minP.toLocaleString()} - ₦${maxP.toLocaleString()}`;
        } else {
            priceText = 'Free';
        }
    }

    // Append ticket types label
    const typeLabel = (modes.includes('all') || modes.length === 0) 
        ? 'Regular, VIP, Premium' 
        : modes.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ');
        
    if (typeLabel) {
        priceText = `${priceText} (${typeLabel})`;
    }
    
    document.getElementById('eventPrice').textContent = priceText;
    
    const hero = document.getElementById('eventHero');
    // Security: Sanitize path. Priority: Relative -> Absolute -> Fallback
    const relPath = event.image_path ? `../../${event.image_path.replace(/^\/+/ , '')}` : null;
    const fallback = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=800&fit=crop';
    const heroImg = encodeURI(relPath || event.absolute_image_url || fallback);
    
    hero.style.backgroundImage = `url('${heroImg}')`;

    // Priority badge style
    const badge = document.getElementById('priorityBadge');
    badge.textContent = event.priority || 'Event';
    if (event.priority === 'hot') badge.style.background = '#ff4757';
    if (event.priority === 'trending') badge.style.background = '#3742fa';
    if (event.priority === 'featured') badge.style.background = '#2ed573';

    // Attendee stacking logic
    const stack = document.getElementById('attendeeStack');
    const count = event.attendee_count || 0;
    const iconsCount = Math.min(count, 5);
    
    stack.textContent = '';
    for (let i = 0; i < iconsCount; i++) {
        const icon = document.createElement('img');
        icon.className = 'attendee-icon';
        icon.src = `https://ui-avatars.com/api/?name=User+${i}&background=random`;
        stack.appendChild(icon);
    }
    
    document.getElementById('attendeeCountDisplay').textContent = `${count} people attending`;

    // Booking logic and Validation for past events
    // Ticket Type Selector logic
    const bookBtn = document.getElementById('bookNowBtn');
    const buyTicketText = document.getElementById('buyTicketText');
    const eventDate = new Date(event.event_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0); 

    // Create ticket type selector if multiple modes exist
    if (modes.length > 1 && !modes.includes('all')) {
        const selectorContainer = document.createElement('div');
        selectorContainer.style.cssText = 'margin: 1.5rem 0; padding: 1rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;';
        selectorContainer.innerHTML = `
            <label style="display: block; font-size: 0.85rem; font-weight: 700; color: #475569; margin-bottom: 0.75rem;">Select Ticket Type</label>
            <div id="ticketTypeGrid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                ${modes.map(mode => {
                    const p = mode === 'vip' ? vipPrice : (mode === 'premium' ? premPrice : regPrice);
                    return `
                    <div class="tier-option" data-tier="${mode}" style="padding: 0.75rem; border: 2px solid #e2e8f0; border-radius: 10px; cursor: pointer; text-align: center; transition: all 0.2s;">
                        <div style="font-weight: 700; text-transform: capitalize; font-size: 0.9rem;">${mode}</div>
                        <div style="font-size: 0.8rem; color: #64748b;">${p > 0 ? '₦' + p.toLocaleString() : 'Free'}</div>
                    </div>`;
                }).join('')}
            </div>
            <input type="hidden" id="selectedTicketType" value="${modes[0]}">
        `;
        
        // Insert before quantity or book button
        const qtyGroup = document.querySelector('.quantity-selector');
        if (qtyGroup) qtyGroup.parentNode.insertBefore(selectorContainer, qtyGroup);
        else bookBtn.parentNode.insertBefore(selectorContainer, bookBtn);

        // Selection logic
        const options = selectorContainer.querySelectorAll('.tier-option');
        options[0].style.borderColor = '#722f37';
        options[0].style.background = '#fffafa';
        
        options.forEach(opt => {
            opt.onclick = () => {
                options.forEach(o => { o.style.borderColor = '#e2e8f0'; o.style.background = 'none'; });
                opt.style.borderColor = '#722f37';
                opt.style.background = '#fffafa';
                document.getElementById('selectedTicketType').value = opt.dataset.tier;
            };
        });
    }

    if (eventDate < now) {
        bookBtn.disabled = true;
        bookBtn.style.background = '#9ca3af';
        bookBtn.style.cursor = 'not-allowed';
        bookBtn.style.boxShadow = 'none';
        buyTicketText.textContent = 'Event Concluded';
    } else {
        buyTicketText.textContent = (modes.includes('all') && legacyPrice === 0) ? 'Book Your Spot' : 'Buy Ticket Now';
        bookBtn.onclick = () => {
            const qtyInput = document.getElementById('ticketQuantity');
            const qty = qtyInput ? qtyInput.value : 1;
            const typeInput = document.getElementById('selectedTicketType');
            const type = typeInput ? typeInput.value : (modes.length === 1 ? modes[0] : 'regular');
            window.location.href = `checkout.html?id=${event.id}&quantity=${qty}&type=${type}`;
        };
    }
}

function updateMetaTags(event) {
    const description = (event.description || '').substring(0, 160);
    const image = event.image_path ? window.location.origin + '/' + event.image_path.replace(/^\/+/ , '') : '';
    const url = window.location.href;

    // Standard Meta Tags
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = 'description';
        document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;

    // OpenGraph Tags
    const ogTags = {
        'og:title': event.event_name,
        'og:description': description,
        'og:image': image,
        'og:url': url,
        'og:type': 'website'
    };

    for (const [property, content] of Object.entries(ogTags)) {
        let tag = document.querySelector(`meta[property="${property}"]`);
        if (!tag) {
            tag = document.createElement('meta');
            tag.setAttribute('property', property);
            document.head.appendChild(tag);
        }
        tag.content = content;
    }
}

async function handleBooking(eventId) {
    if (!isAuthenticated()) {
        handleAuthRedirect(window.location.href);
        return;
    }

    const quantity = document.getElementById('ticketQuantity').value;
    const referral = sessionStorage.getItem('referral_client');

    try {
        const response = await apiFetch('/api/tickets/purchase-ticket.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: eventId,
                quantity: parseInt(quantity),
                referred_by_client: referral // Pass the referral name/id
            })
        });

        const result = await response.json();
        if (result.success) {
            Swal.fire({
                title: 'Success!',
                text: 'Your tickets have been booked successfully.',
                icon: 'success'
            }).then(() => {
                window.location.href = '../../client/pages/tickets.html'; // Or wherever tickets are viewed
            });
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        showNotification('Booking failed', 'error');
    }
}
