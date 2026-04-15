document.addEventListener('DOMContentLoaded', () => {

    const video = document.getElementById('webcam');
    const canvas = document.getElementById('snapshot');
    const cap_frame = document.getElementById('cap-frame');
    const scan_btn = document.getElementById('scan-btn');
    const btn_text = document.getElementById('btn-text');
    const sts_text = document.getElementById('sys-sts');
    const ctx = canvas.getContext('2d');

    // Start camera feed
    navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => { video.srcObject = stream; })
        .catch(err => {
            console.error('Camera access failed:', err);
            sts_text.textContent = 'ERROR: CAMERA HARDWARE NOT DETECTED';
            sts_text.classList.add('status-err');
        });

    // Scan button handler
    scan_btn.addEventListener('click', () => {
        if (scan_btn.disabled) return;

        scan_btn.disabled = true;
        btn_text.textContent = 'EXTRACTING BIOMETRICS...';
        sts_text.textContent = 'TRANSMITTING TO AUTH SERVER...';

        // Capture mirrored frame
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const b64_img = canvas.toDataURL('image/jpeg', 0.9);

        // Swap live feed with snapshot
        cap_frame.src = b64_img;
        video.classList.add('hidden');
        cap_frame.classList.remove('hidden');

        // Dynamic base for localhost vs ngrok
        const api = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:5001' 
            : window.location.origin;

        fetch(api + '/login', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({ image: b64_img }),
            credentials: 'include',
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                on_success(data);
            } else {
                throw new Error('No facial match found.');
            }
        })
        .catch(err => {
            console.error('Auth failed:', err);
            on_error();
        });
    });

    // Login success — store session, redirect
    function on_success(data) {
        btn_text.textContent = 'ACCESS GRANTED';
        sts_text.textContent = `WELCOME, ${data.name.toUpperCase()}`;
        sts_text.classList.add('status-ok');

        sessionStorage.setItem('arena_auth_user', data.name);
        sessionStorage.setItem('arena_auth_uid',  data.uid);
        sessionStorage.setItem('arena_auth_elo',  data.elo_rating);

        setTimeout(() => {
            window.location.href = 'lobby_command_center.html';
        }, 1500);
    }

    // Show error state
    function on_error() {
        btn_text.textContent = 'AUTH SERVER OFFLINE / FAILED';
        sts_text.textContent = 'CONNECTION REFUSED. RETRY?';
        sts_text.classList.add('status-err');
        setTimeout(reset_ui, 2500);
    }

    // Reset to initial state
    function reset_ui() {
        btn_text.textContent = 'SCAN IDENTITY';
        sts_text.textContent = 'SYSTEM READY: AWAITING INPUT';
        sts_text.classList.remove('status-ok', 'status-err');

        scan_btn.disabled = false;
        cap_frame.classList.add('hidden');
        video.classList.remove('hidden');
    }
});