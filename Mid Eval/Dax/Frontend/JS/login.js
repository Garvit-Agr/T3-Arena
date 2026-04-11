// login page logic handling
document.addEventListener('DOMContentLoaded', () => {

    // fetching required document nodes with compact but readable names
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('snapshot');
    const captured_frame = document.getElementById('captured-frame');
    const scan_btn = document.getElementById('scan-btn');
    const btn_text = document.getElementById('btn-text');
    const status_text = document.getElementById('sys-status-txt');
    const ctx = canvas.getContext('2d');

    // requesting user webcam stream
    navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => {
            video.srcObject = stream;
        })
        .catch(err => {
            console.error('hardware access failed or denied:', err);
            status_text.textContent = 'ERROR: CAMERA HARDWARE NOT DETECTED';
            status_text.classList.add('status-err');
        });

    // click event listener for processing scan
    scan_btn.addEventListener('click', () => {
        
        // immediately prevent rapid double entries
        if (scan_btn.disabled) return;

        // lock interface
        scan_btn.disabled = true;
        btn_text.textContent = 'EXTRACTING BIOMETRICS...';
        status_text.textContent = 'TRANSMITTING TO AUTH SERVER...';

        // align canvas sizing and capture screen context mirrored
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // translate canvas buffer to base 64 image format
        const base64_image = canvas.toDataURL('image/jpeg', 0.9);

        // switch dynamic view buffer out with the snapshot
        captured_frame.src = base64_image;
        video.classList.add('hidden');
        captured_frame.classList.remove('hidden');

        console.log('image gathered safely. routing to backend.');

        // send parsed picture text to standard verification route
        fetch('http://localhost:5001/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64_image }),
            credentials: 'include',
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                handle_success(data);
            } else {
                throw new Error('backend could not locate facial match.');
            }
        })
        .catch(err => {
            console.error('validation failed heavily', err);
            handle_error();
        });
    });

    // parses success json and updates temporary cache for redirect
    function handle_success(data) {
        btn_text.textContent = 'ACCESS GRANTED';
        status_text.textContent = `WELCOME, ${data.name.toUpperCase()}`;
        status_text.classList.add('status-ok');

        sessionStorage.setItem('arena_auth_user', data.name);
        sessionStorage.setItem('arena_auth_uid',  data.uid);
        sessionStorage.setItem('arena_auth_elo',  data.elo_rating);

        setTimeout(() => {
            window.location.href = 'lobby_command_center.html';
        }, 1500);
    }

    // displays visual fault state
    function handle_error() {
        btn_text.textContent = 'AUTH SERVER OFFLINE / FAILED';
        status_text.textContent = 'CONNECTION REFUSED. RETRY?';
        status_text.classList.add('status-err');

        setTimeout(reset_ui, 2500);
    }

    // rewinds all css modifications and allows button input again
    function reset_ui() {
        btn_text.textContent = 'SCAN IDENTITY';
        status_text.textContent = 'SYSTEM READY: AWAITING INPUT';
        status_text.classList.remove('status-ok', 'status-err');

        scan_btn.disabled = false;
        captured_frame.classList.add('hidden');
        video.classList.remove('hidden');
    }

});