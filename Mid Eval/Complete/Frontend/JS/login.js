// login.js

document.addEventListener('DOMContentLoaded', () => {
    const video       = document.getElementById('webcam');
    const canvas      = document.getElementById('snapshot');
    const scanBtn     = document.getElementById('scan-btn');
    const btnText     = document.getElementById('btn-text');
    const statusText  = document.getElementById('system-status-text');
    const flashOverlay= document.getElementById('flash-overlay');
    const context     = canvas.getContext('2d');

    // 1. Start webcam
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
        .then((stream) => {
            video.srcObject = stream;
        })
        .catch((err) => {
            console.error("Camera access denied:", err);
            statusText.innerText = "ERROR: CAMERA HARDWARE NOT DETECTED";
            statusText.classList.replace("text-on-surface", "text-red-500");
        });

    // 2. Scan button
    scanBtn.addEventListener('click', () => {
        if (scanBtn.disabled) return;

        scanBtn.disabled = true;
        btnText.innerText = "EXTRACTING BIOMETRICS...";
        statusText.innerText = "TRANSMITTING TO AUTH SERVER...";

        // Flash effect
        flashOverlay.classList.add('flash-effect');
        setTimeout(() => flashOverlay.classList.remove('flash-effect'), 400);

        // Capture frame (mirrored to match what user sees)
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const base64Image = canvas.toDataURL('image/jpeg', 0.9);

        // 3. Send to backend
        fetch('http://localhost:5001/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',                          // needed for Flask session cookie
            body: JSON.stringify({ image: base64Image })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // FIX: store both name AND uid from backend
                // data.name is now the real name (e.g. "Arjun Sharma")
                // data.uid  is the uid  (e.g. "CS21B001")
                sessionStorage.setItem("arena_auth_user", data.name);
                sessionStorage.setItem("arena_auth_uid",  data.uid);
                sessionStorage.setItem("arena_auth_elo",  data.elo_rating);

                btnText.innerText = "ACCESS GRANTED";
                statusText.innerText = `IDENTITY CONFIRMED — WELCOME, ${data.name.toUpperCase()}`;
                statusText.classList.replace("text-on-surface", "text-secondary");

                setTimeout(() => {
                    window.location.href = "lobby_command_center.html";
                }, 1500);

            } else {
                throw new Error(data.message || "Face not recognised.");
            }
        })
        .catch(error => {
            console.error("Auth failed:", error);

            btnText.innerText  = "IDENTITY REJECTED";
            statusText.innerText = "VERIFICATION FAILED. RETRY?";
            statusText.classList.replace("text-on-surface", "text-[#ffb4ab]");

            setTimeout(() => {
                btnText.innerText = "SCAN IDENTITY";
                statusText.innerText = "SYSTEM READY: AWAITING INPUT";
                statusText.classList.replace("text-[#ffb4ab]", "text-on-surface");
                scanBtn.disabled = false;
            }, 2500);
        });
    });
});