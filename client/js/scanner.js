/**
 * Organizer QR Scanner Logic
 * Uses html5-qrcode for camera access and decoding.
 */

let html5QrCode;
let isScanning = true;

document.addEventListener('DOMContentLoaded', () => {
    initScanner();
});

async function initScanner() {
    html5QrCode = new Html5Qrcode("reader");
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    try {
        await html5QrCode.start(
            { facingMode: "environment" }, 
            config, 
            onScanSuccess
        );
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Camera Access Denied',
            text: 'Please grant camera permissions to use the scanner.',
            confirmButtonColor: '#722f37'
        });
    }
}

async function onScanSuccess(decodedText, decodedResult) {
    if (!isScanning) return;
    
    // Stop scanning until the user clicks "Next"
    isScanning = false;
    vibrate(); // Haptic feedback if supported

    document.getElementById('scanMessage').textContent = 'Processing...';
    document.getElementById('scannerOverlay').style.borderColor = '#722f37';

    try {
        const baseUrl = window.location.protocol + '//' + window.location.host;
        const response = await fetch(baseUrl + '/api/tickets/scan-ticket.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qr_data: decodedText })
        });

        const result = await response.json();
        showResult(result);
    } catch (error) {
        showResult({
            success: false,
            message: 'Network error. Please check your connection.'
        });
    }
}

function showResult(result) {
    const panel = document.getElementById('resultPanel');
    const iconContainer = document.getElementById('resultIcon');
    const title = document.getElementById('resultTitle');
    const statusIcon = document.getElementById('statusIcon');

    // Remove any existing QR preview
    const oldQr = panel.querySelector('.qr-preview');
    if (oldQr) oldQr.remove();

    if (result.success) {
        iconContainer.className = 'result-type-icon success-bg';
        statusIcon.setAttribute('data-lucide', 'check-circle-2');
        title.textContent = 'Access Granted';
        title.style.color = '#722f37';

        if (result.data.qr_code_path) {
            const qrWrapper = document.createElement('div');
            qrWrapper.className = 'qr-preview';
            qrWrapper.style.position = 'relative';
            qrWrapper.style.width = '136px';
            qrWrapper.style.height = '136px';
            qrWrapper.style.margin = '0 auto 1.5rem';
            qrWrapper.style.display = 'block';
            qrWrapper.style.borderRadius = '16px';
            qrWrapper.style.padding = '8px';
            qrWrapper.style.background = '#f8fafc';
            qrWrapper.style.border = '1px solid #e2e8f0';

            const qrImg = document.createElement('img');
            qrImg.src = result.data.qr_code_path;
            qrImg.style.width = '100%';
            qrImg.style.height = '100%';
            qrImg.style.display = 'block';
            qrImg.style.pointerEvents = 'none';
            qrImg.style.userSelect = 'none';
            qrWrapper.appendChild(qrImg);

            const overlay = document.createElement('div');
            overlay.style.position = 'absolute';
            overlay.style.inset = '0';
            overlay.style.zIndex = '5';
            overlay.style.background = 'transparent';
            qrWrapper.appendChild(overlay);

            iconContainer.after(qrWrapper);
        }

        document.getElementById('valAttendee').textContent = result.data.buyer_name;
        document.getElementById('valEvent').textContent = result.data.event_name;
        document.getElementById('valTicketID').textContent = result.data.ticket_id;
    } else {
        iconContainer.className = 'result-type-icon error-bg';
        statusIcon.setAttribute('data-lucide', 'alert-circle');
        title.textContent = 'Access Denied';
        title.style.color = '#ef4444';

        document.getElementById('resultDetails').innerHTML = `
            <div style="text-align:center; color:#ef4444; font-weight:600; padding:10px;">
                ${escapeHTML(result.message)}
            </div>
        `;
    }

    lucide.createIcons();
    panel.classList.add('active');
}

function closeResult() {
    document.getElementById('resultPanel').classList.remove('active');
    document.getElementById('scanMessage').textContent = 'Align QR code within frame';
    document.getElementById('scannerOverlay').style.borderColor = 'rgba(255, 255, 255, 0.3)';
    
    // Reset the details for next scan
    document.getElementById('resultDetails').innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Attendee</span>
            <span class="detail-value" id="valAttendee">-</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Event</span>
            <span class="detail-value" id="valEvent">-</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Ticket ID</span>
            <span class="detail-value" id="valTicketID" style="font-family: monospace;">-</span>
        </div>
    `;

    isScanning = true;
}

function vibrate() {
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
}
