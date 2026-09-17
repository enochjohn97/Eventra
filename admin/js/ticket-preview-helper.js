/**
 * Ticket Preview Helper for Admin Panel
 */

function showTicketDesignPreview(eventId) {
    const row = document.querySelector(`tr[data-id="${eventId}"]`);
    if (!row) return;

    const eventName = row.cells[0].innerText;
    const date = row.dataset.date;
    const time = row.dataset.time;
    const address = row.dataset.address || row.cells[1].innerText;
    let eventImage = row.dataset.image;
    
    // Normalize image path using getImageUrl
    if (eventImage) {
        eventImage = getImageUrl(eventImage);
    } else {
        // Fallback to API fetch if image not in dataset
        fetch(`/api/events/get-event.php?id=${eventId}`)
            .then(r => r.json())
            .then(result => {
                if (result.success && result.event) {
                    eventImage = result.event.image_path ? getImageUrl(result.event.image_path) : (typeof getImageUrl === 'function' ? getImageUrl('/public/assets/imgs/login.png') : '/public/assets/imgs/login.png');
                    const imgEl = document.querySelector('#ticketPreviewModal img');
                    if (imgEl) imgEl.src = eventImage;
                }
            })
    }
    
    const formattedDate = new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const formattedTime = time.substring(0, 5);

    const ticketHTML = `
        <div id="ticketPreviewModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; justify-content: center; align-items: center; z-index: 1100; animation: fadeIn 0.3s ease;">
            <div style="width: 90%; max-width: 850px; position: relative; animation: slideUpScale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);">
                <!-- Close Button -->
                <button onclick="document.getElementById('ticketPreviewModal').remove()" style="position: absolute; -top: 50px; right: 0; background: none; border: none; color: white; font-size: 2rem; cursor: pointer;">&times;</button>
                
                <p style="color: white; text-align: center; margin-bottom: 2rem; font-weight: 600; font-size: 1.25rem;">Ticket Preview Mockup</p>
                
                <!-- Ticket Main -->
                <div style="background: white; border-radius: 24px; overflow: hidden; display: flex; height: 320px; box-shadow: 0 30px 60px rgba(0,0,0,0.5);">
                    <!-- Left: Artwork & Info -->
                    <div style="flex: 1; position: relative; overflow: hidden; display: flex;">
                        <div style="flex: 0 0 200px; height: 100%;">
                            <img src="${eventImage}" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                        <div style="flex: 1; padding: 2.5rem; display: flex; flex-direction: column; justify-content: space-between; border-right: 2px dashed #e2e8f0; position: relative;">
                            <!-- Perforation Holes -->
                            <div style="position: absolute; top: -15px; right: -15px; width: 30px; height: 30px; background: rgba(0,0,0,0.8); border-radius: 50%;"></div>
                            <div style="position: absolute; bottom: -15px; right: -15px; width: 30px; height: 30px; background: rgba(0,0,0,0.8); border-radius: 50%;"></div>

                            <div>
                                <h2 style="font-size: 1.75rem; font-weight: 800; color: #111827; margin-bottom: 0.5rem; line-height: 1.2;">${eventName}</h2>
                                <p style="color: #2ecc71; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.85rem;">Standard Admission</p>
                            </div>

                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                                <div>
                                    <div style="font-size: 0.7rem; color: #6b7280; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Date</div>
                                    <div style="font-weight: 700; color: #1f2937;">${formattedDate}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.7rem; color: #6b7280; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Time</div>
                                    <div style="font-weight: 700; color: #1f2937;">${formattedTime}</div>
                                </div>
                            </div>

                            <div>
                                <div style="font-size: 0.7rem; color: #6b7280; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Venue</div>
                                <div style="font-weight: 600; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${address}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Stub (Barcode) -->
                    <div style="width: 180px; background: #fafafa; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5rem;">
                        <div style="transform: rotate(90deg); width: 220px; white-space: nowrap; display: flex; flex-direction: column; align-items: center;">
                            <!-- Mock Barcode CSS -->
                            <div style="width: 180px; height: 60px; background: repeating-linear-gradient(90deg, #111, #111 2px, transparent 2px, transparent 5px, #111 5px, #111 6px, transparent 6px, transparent 9px); margin-bottom: 8px;"></div>
                            <code style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; font-weight: 700; letter-spacing: 2px;">SAMPLE-VOID-CODE</code>
                        </div>
                        <p style="font-size: 0.65rem; color: #94a3b8; font-weight: 600; text-align: center; text-transform: uppercase; margin-top: auto;">Ticket ID: #000000</p>
                    </div>
                </div>
            </div>
        </div>

        <style>
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUpScale { 
                from { opacity: 0; transform: scale(0.9) translateY(40px); } 
                to { opacity: 1; transform: scale(1) translateY(0); } 
            }
        </style>
    `;

    document.body.insertAdjacentHTML('beforeend', ticketHTML);
}

window.showTicketDesignPreview = showTicketDesignPreview;
