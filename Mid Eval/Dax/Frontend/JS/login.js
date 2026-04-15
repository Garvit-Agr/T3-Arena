// Handle camera access and facial authentication
document.addEventListener('DOMContentLoaded', () => {

    // Fetch UI nodes
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('snapshot');
    const cap_frm = document.getElementById('cap-frm');
    const scan_btn = document.getElementById('scan-btn');
    const btn_txt = document.getElementById('btn-txt');
    const sts_txt = document.getElementById('sts-txt');
    const ctx = canvas.getContext('2d');

    // Start user webcam
    navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => { video.srcObject = stream; })
        .catch(err => {
            console.error('Camera access failed:', err);
            sts_txt.textContent = 'ERROR: CAMERA NOT DETECTED';
            sts_txt.classList.add('status-err');
        });

    // Handle scan click
    scan_btn.addEventListener('click', () => {
        // Prevent multiple clicks
        if (scan_btn.disabled) return;

        // Lock UI while processing
        scan_btn.disabled = true;
        btn_txt.textContent = 'EXTRACTING...';
        sts_txt.textContent = 'VERIFYING...';

        // Match canvas to video size and flip horizontally
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert the captured frame to base64 jpeg
        const base64_img = canvas.toDataURL('image/jpeg', 0.9);

        // Display captured image instead of live feed
        cap_frm.src = base64_img;
        video.classList.add('hidden');
        cap_frm.classList.remove('hidden');

        // Send to backend for auth
        fetch('http://localhost:5001/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64_img }),
            credentials: 'include',
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                auth_success(data);
            } else {
                throw new Error('No match found');
            }
        })
        .catch(err => {
            console.error('Auth failed:', err);
            auth_fail();
        });
    });

    // Handle successful login
    function auth_success(data) {
        btn_txt.textContent = 'ACCESS GRANTED';
        sts_txt.textContent = `WELCOME, ${data.name.toUpperCase()}`;
        sts_txt.classList.add('status-ok');

        sessionStorage.setItem('arena_auth_user', data.name);
        sessionStorage.setItem('arena_auth_uid',  data.uid);
        sessionStorage.setItem('arena_auth_elo',  data.elo_rating);

        setTimeout(() => {
            window.location.href = 'lobby_command_center.html';
        }, 1500);
    }

    // Handle login failure
    function auth_fail() {
        btn_txt.textContent = 'AUTH FAILED';
        sts_txt.textContent = 'CONNECTION REFUSED. RETRY?';
        sts_txt.classList.add('status-err');
        setTimeout(reset_ui, 2500);
    }

    // Reset interface to try again
    function reset_ui() {
        btn_txt.textContent = 'SCAN IDENTITY';
        sts_txt.textContent = 'SYSTEM READY: AWAITING INPUT';
        sts_txt.classList.remove('status-ok', 'status-err');

        scan_btn.disabled = false;
        cap_frm.classList.add('hidden');
        video.classList.remove('hidden');
    }
});