document.addEventListener('DOMContentLoaded', () => {

    const video = document.getElementById('webcam');
    const canvas = document.getElementById('snapshot');
    const cap_frame = document.getElementById('cap-frame');
    const scan_btn = document.getElementById('scan-btn');
    const btn_text = document.getElementById('btn-text');
    const sts_text = document.getElementById('sys-sts');
    const ctx = canvas.getContext('2d');
    
    // Register Button
    const reg_btn = document.getElementById('reg-btn');

    // Modals
    const modalOverlay = document.getElementById('modal-overlay');
    const modalError = document.getElementById('modal-error');
    const modalPwd = document.getElementById('modal-password');
    const modalUpdateBio = document.getElementById('modal-update-bio'); 
    
    // Buttons inside modals
    const btnRetry = document.getElementById('btn-retry-scan');
    const btnEnterPwd = document.getElementById('btn-enter-pwd');
    const btnUpdateBio = document.getElementById('btn-update-bio'); 
    const btnSkipBio = document.getElementById('btn-skip-bio');     
    
    const biometricErrMsg = document.getElementById('biometric-err-msg');
    
    // Password Elements
    const btnPwdLogin = document.getElementById('btn-pwd-login');
    const opIdInput = document.getElementById('op-id-input');
    const opPwdInput = document.getElementById('op-pwd-input');
    const pwdErrMsg = document.getElementById('pwd-err-msg');

    navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => { video.srcObject = stream; })
        .catch(err => {
            console.error('Camera access failed:', err);
            sts_text.textContent = 'ERROR: CAMERA HARDWARE NOT DETECTED';
            sts_text.classList.add('status-err');
        });

    // -----------------------------------------
    // 1. BIOMETRIC LOGIN ATTEMPT
    // -----------------------------------------
    scan_btn.addEventListener('click', () => {
        if (scan_btn.disabled) return;

        scan_btn.disabled = true;
        btn_text.textContent = 'TRANSMITTING BIOMETRICS...';
        sts_text.textContent = 'ESTABLISHING SECURE CONNECTION...';

        // RESTORED: Mirror + Capture (Flips the image so the frozen frame matches the live preview)
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const b64_img = canvas.toDataURL('image/jpeg', 0.9);
        cap_frame.src = b64_img;
        video.classList.add('hidden');
        cap_frame.classList.remove('hidden');

        const api = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:7860' 
    : 'https://pranaymehtta2007-arena-dbi.hf.space';

        fetch(api + '/login', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({ image: b64_img }),
            credentials: 'include',
        })
        .then(async res => {
            const data = await res.json().catch(() => ({}));
            
            if (res.ok && data.success) {
                on_success(data);
            } else if (data.action === "fallback_to_password") {
                on_error(data.message || 'FACE NOT RECOGNIZED');
            } else {
                throw new Error(data.message || 'AUTHENTICATION FAILED');
            }
        })
        .catch(err => {
            on_error(err.message || 'CONNECTION REFUSED');
        });
    });

    // -----------------------------------------
    // 2. PASSWORD FALLBACK LOGIN ATTEMPT
    // -----------------------------------------
    btnPwdLogin.addEventListener('click', () => {
        const uid = opIdInput.value;
        const pwd = opPwdInput.value;

        if (!uid || !pwd) {
            show_pwd_error("CREDENTIALS CANNOT BE EMPTY");
            return;
        }

        btnPwdLogin.innerHTML = '<span class="material-symbols-outlined">sync</span> VERIFYING...';
        
        const api = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:7860' 
    : 'https://pranaymehtta2007-arena-dbi.hf.space';

        fetch(api + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: uid, password: pwd }),
            credentials: 'include'
        })
        .then(async res => {
            const data = await res.json().catch(() => ({}));
            
            if (res.ok && data.success) {
                // Save session credentials first
                sessionStorage.setItem('arena_auth_user', data.name);
                sessionStorage.setItem('arena_auth_uid',  data.uid);
                sessionStorage.setItem('arena_auth_elo',  data.elo_rating);
                
                // Show the Biometric Update Prompt instead of routing instantly!
                modalPwd.classList.add('hidden');
                modalUpdateBio.classList.remove('hidden');

            } else {
                show_pwd_error(data.message || "INVALID OPERATOR ID OR PASSCODE");
            }
        })
        .catch(err => {
            show_pwd_error("CONNECTION REFUSED");
        })
        .finally(() => {
            btnPwdLogin.innerHTML = '<span class="material-symbols-outlined">login</span> INITIALIZE';
        });
    });

    // -----------------------------------------
    // 3. UI NAVIGATION & EVENTS
    // -----------------------------------------
    reg_btn.addEventListener('click', () => {
        window.location.href = 'registration.html'; 
    });

    // Handle New Biometric Update Buttons
    btnUpdateBio.addEventListener('click', () => {
        window.location.href = 'registration.html?mode=update';
    });

    btnSkipBio.addEventListener('click', () => {
        window.location.href = 'lobby_command_center.html';
    });

    // The 'X' Buttons (Dismiss Modal and go back to camera)
    document.querySelectorAll('.js-close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            modalOverlay.classList.add('hidden');
            // Hide all sub-modals so the next opening works properly
            modalError.classList.add('hidden');
            modalPwd.classList.add('hidden');
            modalUpdateBio.classList.add('hidden');
            reset_ui();
        });
    });

    btnRetry.addEventListener('click', () => {
        modalOverlay.classList.add('hidden');
        modalError.classList.add('hidden');
        reset_ui();
    });

    btnEnterPwd.addEventListener('click', () => {
        modalError.classList.add('hidden');
        modalPwd.classList.remove('hidden');
    });

    // Helper Functions
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

    function on_error(msg) {
        btn_text.textContent = 'AUTH FAILED';
        sts_text.textContent = 'CONNECTION REFUSED';
        sts_text.classList.remove('status-ok');
        sts_text.classList.add('status-err');
        
        biometricErrMsg.textContent = msg.toUpperCase();

        modalOverlay.classList.remove('hidden');
        modalError.classList.remove('hidden');
        modalPwd.classList.add('hidden');
        modalUpdateBio.classList.add('hidden');
    }

    function show_pwd_error(msg) {
        const pwdWrap = opPwdInput.closest('.input-wrapper');
        const idWrap = opIdInput.closest('.input-wrapper');
        
        pwdWrap.classList.add('input-error');
        idWrap.classList.add('input-error');
        
        pwdErrMsg.textContent = msg;
        pwdErrMsg.classList.remove('hidden');

        setTimeout(() => {
            pwdWrap.classList.remove('input-error');
            idWrap.classList.remove('input-error');
        }, 400);
    }

    function reset_ui() {
        btn_text.textContent = 'SCAN IDENTITY';
        sts_text.textContent = 'SYSTEM READY: AWAITING INPUT';
        sts_text.classList.remove('status-ok', 'status-err');
        pwdErrMsg.classList.add('hidden');

        scan_btn.disabled = false;
        cap_frame.classList.add('hidden');
        video.classList.remove('hidden');
        
        opIdInput.value = '';
        opPwdInput.value = '';
    }
});