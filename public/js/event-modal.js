// XSS mitigation helper
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag])
  );
}

// Event Details Modal Functions
let currentEventData = null;

async function openEventDetailsModal(eventIdOrData) {
  const modal = document.getElementById('eventDetailsModal');
  const modalContent = modal.querySelector('.modal-content');
  if (!modalContent) return;
  
  // Show modal immediately
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // 1. Show Loading Skeleton State
  modalContent.innerHTML = `
    <button class="modal-close" onclick="closeEventDetailsModal()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.9); border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center;">&times;</button>
    <div style="position: relative; height: 300px; border-radius: 16px 16px 0 0; margin: -2rem -2rem 2rem -2rem; background: #e5e7eb; animation: pulse 1.5s infinite ease-in-out;"></div>
    <div style="padding: 0 1rem;">
      <div style="height: 2.5rem; width: 70%; background: #e5e7eb; border-radius: 8px; margin-bottom: 0.5rem; animation: pulse 1.5s infinite ease-in-out;"></div>
      <div style="height: 1.2rem; width: 40%; background: #e5e7eb; border-radius: 8px; margin-bottom: 2rem; animation: pulse 1.5s infinite ease-in-out;"></div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="height: 48px; background: #e5e7eb; border-radius: 12px; animation: pulse 1.5s infinite ease-in-out;"></div>
        <div style="height: 48px; background: #e5e7eb; border-radius: 12px; animation: pulse 1.5s infinite ease-in-out;"></div>
        <div style="height: 48px; background: #e5e7eb; border-radius: 12px; animation: pulse 1.5s infinite ease-in-out;"></div>
        <div style="height: 48px; background: #e5e7eb; border-radius: 12px; animation: pulse 1.5s infinite ease-in-out;"></div>
      </div>
      <div style="height: 6rem; background: #e5e7eb; border-radius: 12px; margin-bottom: 2rem; animation: pulse 1.5s infinite ease-in-out;"></div>
      <div style="height: 3rem; background: #e5e7eb; border-radius: 12px; animation: pulse 1.5s infinite ease-in-out;"></div>
    </div>
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .5; }
      }
    </style>
  `;

  try {
    let eventData;
    
    // Check if we were passed an ID or a direct object (for search dropdown support)
    if (typeof eventIdOrData === 'object' && eventIdOrData !== null && eventIdOrData.id) {
       // Search dropdown passes the whole object, but we still want to fetch fresh data to be safe.
       // However, we can use the passed object as a fallback if the fetch fails.
       currentEventData = eventIdOrData;
    }

    const eventIdToFetch = typeof eventIdOrData === 'object' ? eventIdOrData.id : eventIdOrData;

    // 2. Fetch Event Data dynamically
    const response = await fetch(`/api/events/get-event.php?id=${eventIdToFetch}`);
    const result = await response.json();

    if (result.success && result.event) {
      eventData = result.event;
      currentEventData = eventData;
    } else {
      // Fallback to passed data if API fails to find it (e.g. from search results)
      if (typeof eventIdOrData === 'object') {
          eventData = eventIdOrData;
      } else {
          throw new Error(result.message || 'Event not found');
      }
    }

    // 3. Render Redesigned Modal
    renderModalContent(modalContent, eventData);

  } catch (error) {
    modalContent.innerHTML = `
      <button class="modal-close" onclick="closeEventDetailsModal()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.9); border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center;">&times;</button>
      <div style="padding: 3rem 1rem; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
        <h3 style="color: #111827; font-size: 1.5rem; margin-bottom: 0.5rem;">Oops!</h3>
        <p style="color: #6b7280; margin-bottom: 1.5rem;">We couldn't load this event's details. It may have been removed or is temporarily unavailable.</p>
        <button onclick="closeEventDetailsModal()" style="background: #111827; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer;">Close</button>
      </div>
    `;
  }
}

function renderModalContent(container, eventData) {
  const eventImage = eventData.absolute_image_url || (eventData.image_path ? '/' + eventData.image_path : 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=500&fit=crop');
  
  // Format Date and Time safely
  let eventDate = 'Date TBA';
  if (eventData.event_date) {
    eventDate = new Date(eventData.event_date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
  
  let formattedTime = 'Time TBA';
  if (eventData.event_time) {
     // Strip seconds if present (HH:MM:SS -> HH:MM AM/PM)
     const timeParts = eventData.event_time.split(':');
     if (timeParts.length >= 2) {
         let hours = parseInt(timeParts[0]);
         const minutes = timeParts[1];
         const ampm = hours >= 12 ? 'PM' : 'AM';
         hours = hours % 12;
         hours = hours ? hours : 12; 
         formattedTime = `${hours}:${minutes} ${ampm}`;
     } else {
         formattedTime = eventData.event_time;
     }
  }

  // Robust Pricing & Ticket Type Display
  let eventPriceDisplay = 'Free';
  const regPrice = parseFloat(eventData.regular_price || 0);
  const vipPrice = parseFloat(eventData.vip_price || 0);
  const premPrice = parseFloat(eventData.premium_price || 0);
  const legacyPrice = parseFloat(eventData.price || 0);

  // Get active modes from metadata (ticket_type_mode)
  let modes = (eventData.ticket_type_mode || 'all').split(',').map(m => m.trim().toLowerCase());
  
  if (modes.includes('all') || modes.length === 0) {
      eventPriceDisplay = legacyPrice > 0 ? `₦${legacyPrice.toLocaleString()}` : 'Free';
  } else {
      let priceParts = [];
      if (modes.includes('regular')) priceParts.push(regPrice);
      if (modes.includes('vip')) priceParts.push(vipPrice);
      if (modes.includes('premium')) priceParts.push(premPrice);
      
      const maxP = Math.max(...priceParts);
      const minP = Math.min(...priceParts);
      
      if (maxP > 0) {
          eventPriceDisplay = minP === maxP ? `₦${minP.toLocaleString()}` : `₦${minP.toLocaleString()} - ₦${maxP.toLocaleString()}`;
      } else {
          eventPriceDisplay = 'Free';
      }
  }

  // Create ticket type badge/label
  const ticketTypes = modes.includes('all') ? 'Regular, VIP, Premium' : modes.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ');
  const displayValue = `${eventPriceDisplay}${ticketTypes ? ` (${ticketTypes})` : ''}`;

  
  container.innerHTML = `
    <button class="modal-close" onclick="closeEventDetailsModal()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.9); backdrop-filter: blur(8px); border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">&times;</button>
    <button class="modal-share" onclick="shareEventFromModal('${escapeHTML(eventData.id)}', '${escapeHTML(eventData.event_name.replace(/'/g, "\\'"))}', '${escapeHTML((eventData.client_name || eventData.organizer_name || 'Eventra').replace(/'/g, "\\'"))}')" style="position: absolute; top: 1rem; right: 4rem; background: rgba(255,255,255,0.9); backdrop-filter: blur(8px); border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.2rem; cursor: pointer; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;" title="Share Event">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
    </button>
    
    <div style="position: relative; height: 320px; overflow: hidden; border-radius: 20px 20px 0 0; margin: -2rem -2rem 2rem -2rem;">
      <img src="${eventImage}" onerror="this.src='../assets/default-event.jpg'" style="width: 100%; height: 100%; object-fit: cover;" alt="${eventData.event_name}">
      <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 50%; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);"></div>
      
      <div style="position: absolute; top: 1rem; left: 1rem; display: flex; gap: 0.5rem; z-index: 5;">
        ${eventData.priority ? `<div style="background: white; color: #722f37; padding: 0.4rem 1rem; border-radius: 2rem; font-weight: 700; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 0.4rem;">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#722f37;"></span>
          ${escapeHTML(eventData.priority.replace(/UD83DUDD52/ig, '').replace(/\\\\ud83d\\\\udd52/ig, '').trim())}
        </div>` : ''}
      </div>
    </div>
    
    <div style="padding: 0 1rem;">
      <h2 style="font-size: 2.25rem; font-weight: 800; color: #111827; margin-bottom: 0.5rem; line-height: 1.1; letter-spacing: -0.02em;">${escapeHTML(eventData.event_name)}</h2>
      
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2rem;">
        <div style="width: 32px; height: 32px; border-radius: 50%; background: #f3f4f6; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 1rem;">👤</div>
        <p style="color: #6b7280; font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
          Organized by <span style="font-weight: 600; color: #374151;">${escapeHTML(eventData.client_name || eventData.organizer_name || 'Eventra')}</span>
          ${eventData.verification_status === 'verified' ? '<span style="color: #722f37; font-size: 0.9rem;" title="Verified Organizer">✓</span>' : ''}
        </p>
      </div>
      
      <div style="height: 1px; background: #e5e7eb; margin-bottom: 2rem;"></div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem;">
        <div style="display: flex; align-items: flex-start; gap: 1rem;">
          <div style="width: 44px; height: 44px; background: #fef2f2; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">📅</div>
          <div>
            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Date</div>
            <div style="font-weight: 600; color: #111827; font-size: 0.95rem;">${escapeHTML(eventDate)}</div>
          </div>
        </div>
        
        <div style="display: flex; align-items: flex-start; gap: 1rem;">
          <div style="width: 44px; height: 44px; background: #fffbeb; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">🕒</div>
          <div>
            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Time</div>
            <div style="font-weight: 600; color: #111827; font-size: 0.95rem;">${escapeHTML(formattedTime)}</div>
          </div>
        </div>
        
        <div style="display: flex; align-items: flex-start; gap: 1rem;">
          <div style="width: 44px; height: 44px; background: #ecfdf5; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">📍</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Location</div>
            ${(() => {
              // Try structured locations JSON first
              let locs = null;
              try { locs = eventData.locations ? (typeof eventData.locations === 'string' ? JSON.parse(eventData.locations) : eventData.locations) : null; } catch(e) {}
              
              const states = (eventData.state || '').split(',').map(s => s.trim()).filter(Boolean);
              const isMultipleStates = states.length > 1 && !states.includes('All States') && !states.includes('Nationwide');

              if (Array.isArray(locs) && locs.length > 0) {
                const isMulti = locs.length > 1;
                // Initialise selection state — all selected by default
                window.selectedEventLocations = locs.map((_, i) => i);

                let html = '<div id="modalLocsContainer">';
                locs.forEach((loc, idx) => {
                  const mapQuery = encodeURIComponent((loc.address || '') + ', ' + loc.state);
                  const checkboxHtml = isMulti
                    ? `<input type="checkbox" id="locChk_${idx}" data-loc-index="${idx}" checked
                         onchange="window._updateLocSelection()"
                         style="width:16px;height:16px;accent-color:#1a1a2e;margin-right:10px;cursor:pointer;flex-shrink:0;">` : '';

                  html += `<label for="locChk_${idx}" style="display:flex;align-items:flex-start;gap:0;margin-bottom:12px;padding:10px 12px;border-radius:10px;border:1px solid #e5e7eb;cursor:${isMulti ? 'pointer' : 'default'};transition:background 0.15s;"
                            onmouseover="${isMulti ? 'this.style.background=\'#f9fafb\'' : ''}"
                            onmouseout="${isMulti ? 'this.style.background=\'transparent\'' : ''}">
                    ${checkboxHtml}
                    <div style="flex:1;">
                      <div style="font-size:1rem;font-weight:700;color:#1a1a2e;margin-bottom:3px;">📍 ${escapeHTML(loc.state)}</div>
                      ${loc.address ? `<a href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" onclick="event.stopPropagation()" style="color:#6b7280;text-decoration:none;font-size:0.82rem;display:inline-flex;align-items:center;gap:3px;">${escapeHTML(loc.address)}</a>` : ''}
                    </div>
                  </label>`;
                });
                html += '</div>';

                if (isMulti) {
                  html += `<div id="locSelectionHint" style="font-size:0.78rem;color:#9ca3af;margin-top:4px;">Select the location(s) you plan to attend</div>`;
                }
                return html;
              }
              
              if (isMultipleStates) {
                // If we only have a comma-separated string, use state-only checkboxes
                window.selectedEventLocations = states.map((_, i) => i);
                let html = '<div id="modalLocsContainer">';
                states.forEach((s, idx) => {
                  html += `<label for="stateChk_${idx}" style="display:flex;align-items:center;gap:0;margin-bottom:10px;padding:8px 12px;border-radius:10px;border:1px solid #e5e7eb;cursor:pointer;transition:background 0.15s;"
                            onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
                    <input type="checkbox" id="stateChk_${idx}" data-state-index="${idx}" checked
                       onchange="window._updateLocSelection()"
                       style="width:16px;height:16px;accent-color:#1a1a2e;margin-right:10px;cursor:pointer;">
                    <div style="font-size:0.9rem;font-weight:700;color:#1a1a2e;">📍 ${escapeHTML(s)}</div>
                  </label>`;
                });
                html += '</div>';
                html += `<div style="font-size:0.78rem;color:#9ca3af;margin-top:4px;">Select the location(s) you plan to attend</div>`;
                return html;
              }

              // Fallback: single address display
              return `
                <div style="font-size:1rem;font-weight:700;color:#1a1a2e;margin-bottom:4px;">📍 ${escapeHTML(eventData.location || '')}</div>
                ${eventData.address ? `<div style="font-size:0.8rem;margin-bottom:0.3rem;">
                  <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventData.address + ', ' + (eventData.city || '') + ', ' + (eventData.state || ''))}" target="_blank" class="address-link" style="color:#6b7280;text-decoration:none;display:inline-flex;align-items:center;" onclick="event.stopPropagation();">
                    ${escapeHTML(eventData.address)}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                </div>` : ''}
                <div style="font-size:0.85rem;color:#4b5563;line-height:1.5;margin-top:0.5rem;display:block;">${[eventData.city, eventData.state].filter(Boolean).map(escapeHTML).join(', ') || 'TBD'}</div>
              `;
            })()}
          </div>
        </div>

        
        <div style="display: flex; align-items: flex-start; gap: 1rem;">
          <div style="width: 44px; height: 44px; background: #fdf2f8; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">🎟️</div>
          <div>
            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Tickets</div>
            <div style="font-weight: 700; color: #111827; font-size: 1rem;">${escapeHTML(displayValue)}</div>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 2.5rem;">
        <h3 style="font-size: 1.1rem; color: #111827; margin-bottom: 1rem; font-weight: 700; letter-spacing: -0.01em;">About this event</h3>
        <div style="color: #4b5563; line-height: 1.8; font-size: 0.95rem; white-space: pre-line; margin-bottom: 1.5rem;">${escapeHTML(eventData.description || 'No description provided for this event.')}</div>
        
        <h4 style="font-size: 0.95rem; color: #111827; margin-bottom: 0.5rem; font-weight: 600;">Share with friends</h4>
        <div style="display: flex; align-items: center; gap: 0.5rem; background: #f3f4f6; padding: 0.5rem; border-radius: 8px;">
          <input type="text" readonly value="${window.location.origin}/public/pages/index.html?event_id=${eventData.id}" style="flex: 1; background: transparent; border: none; outline: none; color: #4b5563; font-size: 0.9rem; padding: 0.25rem 0.5rem;" id="eventShareLink_${eventData.id}">
          <button onclick="copyEventLink('eventShareLink_${eventData.id}')" style="background: white; border: 1px solid #d1d5db; border-radius: 6px; padding: 0.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'" title="Copy link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>
      
      <!-- Sticky-like Buy Button Container -->
      <div style="position: sticky; bottom: -2rem; margin: 0 -3rem -2rem -3rem; padding: 1.5rem 3rem 2rem 3rem; background: rgba(255,255,255,0.9); backdrop-filter: blur(12px); border-top: 1px solid #f3f4f6;">
        <button onclick="handleBuyTicket()" style="width: 100%; background: #111827; color: white; border: none; padding: 1rem 2rem; border-radius: 12px; font-size: 1.05rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); display: flex; align-items: center; justify-content: center; gap: 0.5rem;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';">
          <span>Get Tickets</span>
          <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </button>
      </div>
    </div>
  `;
}

function closeEventDetailsModal() {
  const modal = document.getElementById('eventDetailsModal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => {
     currentEventData = null;
  }, 300); // wait for animation to finish
}

function handleBuyTicket() {
  if (currentEventData) {
    let url = `checkout.html?id=${currentEventData.id}&quantity=1`;
    // Pass selected locations if user made a selection
    if (window.selectedEventLocations && Array.isArray(window.selectedEventLocations) && window.selectedEventLocations.length > 0) {
      url += '&selected_locs=' + encodeURIComponent(JSON.stringify(window.selectedEventLocations));
    }
    window.location.href = url;
  }
}

function shareEventFromModal(id, title, organizer) {
  const shareTitle = `Eventra: ${title}`;
  const shareText = `Check out ${title} organized by ${organizer} on Eventra!`;
  
  if (typeof shareEvent === 'function') {
    // Pass null for event object, use global shareEvent
    shareEvent(null, id, shareTitle, shareText);
  } else if (navigator.share) {
    navigator.share({
      title: shareTitle,
      text: shareText,
      url: window.location.origin + '/public/pages/index.html?event_id=' + id
    }).catch(console.error);
  } else {
    // Fallback to copy to clipboard
    const url = window.location.origin + '/public/pages/index.html?event_id=' + id;
    navigator.clipboard.writeText(url).then(() => {
      if (typeof showNotification === 'function') {
        showNotification('Link copied to clipboard!', 'success');
      } else {
        alert('Link copied to clipboard!');
      }
    });
  }
}

function copyEventLink(inputId) {
  const linkInput = document.getElementById(inputId);
  if (linkInput) {
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(linkInput.value).then(() => {
      if (typeof showNotification === 'function') {
        showNotification('Link copied to clipboard!', 'success');
      } else {
        alert('Link copied to clipboard!');
      }
    }).catch(err => {
      console.error('Failed to copy link: ', err);
    });
  }
}

// ── copyModalShareLink ────────────────────────────────────────────────────────
// Called by the share-copy button in the static event-details modal HTML.
// Reads the link from the #modalEventShareLink input, or falls back to
// building one from currentEventData, then copies it to the clipboard.
function copyModalShareLink() {
  const linkInput = document.getElementById('modalEventShareLink');
  let url = (linkInput && linkInput.value) ? linkInput.value : '';

  if (!url && window.currentEventData) {
    url = `${window.location.origin}/public/pages/index.html?event_id=${window.currentEventData.id}`;
  }

  if (!url) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => {
        if (typeof showNotification === 'function') {
          showNotification('Link copied to clipboard!', 'success');
        } else if (typeof Swal !== 'undefined') {
          Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Link copied!', showConfirmButton: false, timer: 2000 });
        } else {
          alert('Link copied!');
        }
      })
      .catch(() => _fallbackCopy(url));
  } else {
    _fallbackCopy(url);
  }
}

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;pointer-events:none;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    if (typeof showNotification === 'function') showNotification('Link copied!', 'success');
  } catch (e) { /* silent */ }
  document.body.removeChild(ta);
}

window.copyModalShareLink = copyModalShareLink;

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('eventDetailsModal');
  if (modal && e.target === modal) {
    closeEventDetailsModal();
  }
});

// Enhanced Search Functionality
let searchTimeout = null;
let allEventsData = [];

function initializeEnhancedSearch() {
  const searchInput = document.querySelector('.search-input');
  if (!searchInput) return;
  
  // Create search results dropdown
  const searchContainer = document.querySelector('.search-container');
  if (searchContainer && !searchContainer.querySelector('.search-results-dropdown')) {
    const dropdown = document.createElement('div');
    dropdown.className = 'search-results-dropdown';
    dropdown.id = 'searchResultsDropdown';
    searchContainer.appendChild(dropdown);
  }
  
  // Add input event listener
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    
    if (query.length < 2) {
      hideSearchResults();
      return;
    }
    
    searchTimeout = setTimeout(() => {
      performEnhancedSearch(query);
    }, 300);
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (searchContainer && !searchContainer.contains(e.target)) {
      hideSearchResults();
    }
  });
}

function performEnhancedSearch(query) {
  const dropdown = document.getElementById('searchResultsDropdown');
  if (!dropdown) return;
  
  const lowerQuery = query.toLowerCase();
  
  // Filter events by name, category, location, date, description, priority, or tags
  const results = allEventsData.filter(event => {
    return (
      event.event_name.toLowerCase().includes(lowerQuery) ||
      (event.category && event.category.toLowerCase().includes(lowerQuery)) ||
      (event.event_type && event.event_type.toLowerCase().includes(lowerQuery)) ||
      (event.city && event.city.toLowerCase().includes(lowerQuery)) ||
      (event.state && event.state.toLowerCase().includes(lowerQuery)) ||
      (event.event_date && event.event_date.includes(lowerQuery)) ||
      (event.description && event.description.toLowerCase().includes(lowerQuery)) ||
      (event.priority && event.priority.toLowerCase().includes(lowerQuery)) ||
      (event.tag && event.tag.toLowerCase().includes(lowerQuery))
    );
  }).slice(0, 5); // Limit to 5 results
  
  if (results.length === 0) {
    dropdown.innerHTML = '<div class="search-result-item">No events found</div>';
  } else {
    dropdown.innerHTML = results.map(event => {
      const eventStr = JSON.stringify(event).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      return `
        <div class="search-result-item" onclick='openEventDetailsModal(${eventStr})'>
          <strong>${event.event_name}</strong>
          <span class="search-category-badge">${event.event_type || event.category || 'Event'}</span>
          <br>
          <small style="color: #666;">${event.location || event.state || 'Location TBD'} • ${new Date(event.event_date).toLocaleDateString()}</small>
        </div>
      `;
    }).join('');
  }
  
  dropdown.classList.add('active');
}

function hideSearchResults() {
  const dropdown = document.getElementById('searchResultsDropdown');
  if (dropdown) {
    dropdown.classList.remove('active');
  }
}

// Make functions globally available
window.openEventDetailsModal = openEventDetailsModal;
window.closeEventDetailsModal = closeEventDetailsModal;
window.handleBuyTicket = handleBuyTicket;
window.allEventsData = allEventsData;
window.copyEventLink = copyEventLink;

/**
 * Keep window.selectedEventLocations in sync with checkbox state.
 * Called by each checkbox's onchange handler in the location section.
 */
window._updateLocSelection = function () {
  const checked = [];
  // Handle locs-type checkboxes
  document.querySelectorAll('[data-loc-index]').forEach(chk => {
    if (chk.checked) checked.push(parseInt(chk.dataset.locIndex, 10));
  });
  // Handle state-type checkboxes
  document.querySelectorAll('[data-state-index]').forEach(chk => {
    if (chk.checked) checked.push(parseInt(chk.dataset.stateIndex, 10));
  });
  window.selectedEventLocations = checked;
};

// Initialize enhanced search when DOM is ready
// Also: auto-open event details modal when URL contains ?event_id=ID or ?event=TAG
document.addEventListener('DOMContentLoaded', () => {
  initializeEnhancedSearch();

  const urlParams = new URLSearchParams(window.location.search);
  const eventIdParam = urlParams.get('event_id') || urlParams.get('event');
  if (eventIdParam) {
    // Delay slightly to allow page JS / auth to initialise before opening modal
    setTimeout(() => {
      if (typeof openEventDetailsModal === 'function') {
        openEventDetailsModal(eventIdParam);
      }
    }, 600);
  }
});
