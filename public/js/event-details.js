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
        console.log('Referral captured:', clientName);
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
        const response = await apiFetch(`../../api/events/get-event-details.php?event_id=${id}`);
        const result = await response.json();

        if (result.success) {
            renderEvent(result.event);
        } else {
            showNotification(result.message || 'Event not found', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    } catch (error) {
        console.error('Error loading event:', error);
        showNotification('System error occurred', 'error');
    }
}

async function loadEventDetailsByTag(tag) {
    try {
        const response = await apiFetch(`../../api/events/get-event-by-tag.php?tag=${tag}`);
        const result = await response.json();

        if (result.success) {
            renderEvent(result.event);
        } else {
            showNotification(result.message || 'Event not found', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    } catch (error) {
        console.error('Error loading event:', error);
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
    
    // Client Verification Badge
    const clientNameContainer = document.getElementById('clientName');
    let clientHTML = event.client_name || 'Eventra Organizer';
    if (Number(event.client_is_verified) === 1) {
        clientHTML += ' <span style="display: inline-flex; align-items: center; justify-content: center; background: #10b981; color: white; width: 16px; height: 16px; border-radius: 50%; font-size: 10px; margin-left: 4px; border: 1.5px solid white; box-shadow: 0 0 0 1px #10b981;" title="Verified Event Planner">✓</span>';
    }
    clientNameContainer.innerHTML = clientHTML;
    
    const priceValue = parseFloat(event.price);
    const isFree = !event.price || priceValue === 0;
    const priceText = isFree ? 'Free' : `₦${priceValue.toLocaleString()}`;
    
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
    
    stack.innerHTML = '';
    for (let i = 0; i < iconsCount; i++) {
        const icon = document.createElement('img');
        icon.className = 'attendee-icon';
        icon.src = `https://ui-avatars.com/api/?name=User+${i}&background=random`;
        stack.appendChild(icon);
    }
    
    document.getElementById('attendeeCountDisplay').textContent = `${count} people attending`;

    // Booking logic and Validation for past events
    const bookBtn = document.getElementById('bookNowBtn');
    const buyTicketText = document.getElementById('buyTicketText');
    const eventDate = new Date(event.event_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Only compare dates, not time precisely if not needed

    if (eventDate < now) {
        bookBtn.disabled = true;
        bookBtn.style.background = '#9ca3af';
        bookBtn.style.cursor = 'not-allowed';
        bookBtn.style.boxShadow = 'none';
        buyTicketText.textContent = 'Event Concluded';
    } else {
        buyTicketText.textContent = isFree ? 'Book Your Spot' : 'Buy Ticket Now';
        bookBtn.onclick = () => {
            window.location.href = `checkout.html?id=${event.id}&quantity=1`;
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
        const response = await apiFetch('../../api/tickets/purchase-ticket.php', {
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
        console.error('Booking error:', error);
        showNotification('Booking failed', 'error');
    }
}
