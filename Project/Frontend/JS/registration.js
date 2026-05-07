/**
 * ARENA_OS — Unified Registration & Biometric Update Script
 */

/* =========================================================
   ELEMENT REFERENCES & ROUTING STATE
   ========================================================= */
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode') || 'register'; 
const storedUid = sessionStorage.getItem('arena_auth_uid');

const form           = document.getElementById('reg-form');
const inputUserId    = document.getElementById('user_id');
const inputName      = document.getElementById('name');
const inputPassword  = document.getElementById('password');
const togglePwBtn    = document.getElementById('toggle-pw');

const btnCapture     = document.getElementById('btn-capture');
const btnRetake      = document.getElementById('btn-retake');
const btnNext        = document.getElementById('btn-next');
const btnNextText    = document.getElementById('btn-next-text');

const videoFeed      = document.getElementById('video-feed');
const captureCanvas  = document.getElementById('capture-canvas');
const captureSuccess = document.getElementById('capture-success');

const cameraError    = document.getElementById('camera-error');
const cameraErrorTxt = document.getElementById('camera-error-text');

// Dynamic Modal Elements
const modalOverlay   = document.getElementById('modal-overlay');
const modalBox       = document.getElementById('sys-modal');
const modalIcon      = document.getElementById('modal-icon');
const modalTitle     = document.getElementById('modal-title');
const modalDesc      = document.getElementById('modal-desc');
const modalMeta      = document.getElementById('modal-meta');
const modalActions   = document.getElementById('modal-actions');

/* ---------- State ---------- */
let mediaStream      = null;   
let capturedDataUrl  = null;   
let isCaptured       = false;

/* =========================================================
   INITIALIZATION & ROUTING
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    
    // Apply UI changes if in update mode
    if (mode === 'update') {
        if (!storedUid) {
            // Security check: Must have a session to update
            window.location.replace("login.html");
            return;
        }
        
        // Trigger the CSS layout shift
        document.getElementById('main-console').classList.add('mode-update');
        
        // Update Panel Titles
        document.getElementById('right-title').textContent = 'BIOMETRIC RE-REGISTRATION';
        btnNextText.textContent = 'UPDATE BIOMETRICS';
    }

    initCamera();

    // Close Button Redirect
    const btnClose = document.getElementById('btn-close-reg');
    if (btnClose) {
        btnClose.addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }
});

/* =========================================================
   CAMERA INITIALISATION
   ========================================================= */
async function initCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    });
    videoFeed.srcObject = mediaStream;
    await videoFeed.play();
    cameraError.classList.add('hidden');
  } catch (err) {
    showCameraError(err);
  }
}

function showCameraError(err) {
  let msg = 'Camera access denied. Please allow camera permissions and reload.';
  if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') msg = 'No camera found. Please connect a camera and reload.';
  else if (err.name === 'NotReadableError') msg = 'Camera is already in use by another application.';

  cameraErrorTxt.textContent = msg;
  cameraError.classList.remove('hidden');
  btnCapture.disabled = true;
}

/* =========================================================
   CAPTURE & RETAKE
   ========================================================= */
btnCapture.addEventListener('click', () => {
  if (!mediaStream) return;
  const ctx = captureCanvas.getContext('2d');
  captureCanvas.width  = videoFeed.videoWidth  || 640;
  captureCanvas.height = videoFeed.videoHeight || 480;
  ctx.drawImage(videoFeed, 0, 0, captureCanvas.width, captureCanvas.height);

  capturedDataUrl = captureCanvas.toDataURL('image/jpeg', 0.9);
  isCaptured = true;

  videoFeed.classList.add('hidden');
  captureCanvas.classList.remove('hidden');
  captureSuccess.classList.remove('hidden');

  btnCapture.classList.add('hidden');
  btnNext.classList.remove('hidden');
  btnRetake.disabled = false;
});

// Expose retake globally so the dynamic modal can trigger it
window.triggerRetake = function() {
  isCaptured = false;
  capturedDataUrl = null;
  const ctx = captureCanvas.getContext('2d');
  ctx.clearRect(0, 0, captureCanvas.width, captureCanvas.height);

  videoFeed.classList.remove('hidden');
  captureCanvas.classList.add('hidden');
  captureSuccess.classList.add('hidden');

  btnNext.classList.add('hidden');
  btnCapture.classList.remove('hidden');
  btnRetake.disabled = true;

  hideDynamicModal();
};

btnRetake.addEventListener('click', window.triggerRetake);

/* =========================================================
   PASSWORD LOGIC (Only visible in Register Mode)
   ========================================================= */
if (mode === 'register') {
    togglePwBtn.addEventListener('click', () => {
      const isPassword = inputPassword.type === 'password';
      inputPassword.type = isPassword ? 'text' : 'password';
      document.getElementById('eye-icon').innerHTML = isPassword 
        ? `<path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="3" x2="17" y2="17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`
        : `<path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>`;
    });

    inputPassword.addEventListener('input', () => {
      const val = inputPassword.value;
      const checks = { upper: /[A-Z]/.test(val), lower: /[a-z]/.test(val), number: /[0-9]/.test(val), special: /[^A-Za-z0-9]/.test(val) };
      document.getElementById('rule-upper').classList.toggle('met', checks.upper);
      document.getElementById('rule-lower').classList.toggle('met', checks.lower);
      document.getElementById('rule-number').classList.toggle('met', checks.number);
      document.getElementById('rule-special').classList.toggle('met', checks.special);

      const score = Object.values(checks).filter(Boolean).length;
      [1,2,3,4].forEach(i => {
          const bar = document.getElementById('bar'+i);
          bar.className = 'pw-bar';
          if (i <= score) bar.classList.add(`active-${score}`);
      });
      clearError('password', 'err-password');
    });

    inputUserId.addEventListener('input', () => { if (inputUserId.value.trim()) clearError('user_id', 'err-userid'); });
    inputName.addEventListener('input', () => { if (inputName.value.trim()) clearError('name', 'err-name'); });
}

/* =========================================================
   VALIDATION
   ========================================================= */
function showError(fieldId, errorId, message) {
  const group = document.getElementById(fieldId).closest('.field-group');
  const errEl = document.getElementById(errorId);
  group.classList.add('has-error');
  group.classList.remove('is-valid');
  errEl.textContent = message;
  errEl.classList.add('visible');
}

function clearError(fieldId, errorId) {
  const group = document.getElementById(fieldId).closest('.field-group');
  const errEl = document.getElementById(errorId);
  group.classList.remove('has-error');
  errEl.textContent = '';
  errEl.classList.remove('visible');
}

function validateForm() {
  let valid = true;

  if (!isCaptured || !capturedDataUrl) {
    cameraError.classList.remove('hidden');
    cameraErrorTxt.textContent = 'Please capture your identity photo before proceeding.';
    return false;
  } else {
    cameraError.classList.add('hidden');
  }

  // Skip left panel validation if we are just updating an existing face
  if (mode === 'update') return true;

  const userId = inputUserId.value.trim();
  if (!userId || userId.length < 6 || userId.length > 15) {
    showError('user_id', 'err-userid', 'Callsign must be 6-15 characters.');
    valid = false;
  } else document.getElementById('user_id').closest('.field-group').classList.add('is-valid');

  if (!inputName.value.trim()) {
    showError('name', 'err-name', 'Name is required.');
    valid = false;
  } else document.getElementById('name').closest('.field-group').classList.add('is-valid');

  const pw = inputPassword.value;
  if (!pw || !/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
    showError('password', 'err-password', 'Must meet all security requirements.');
    valid = false;
  } else document.getElementById('password').closest('.field-group').classList.add('is-valid');

  return valid;
}

/* =========================================================
   SUBMISSION & API ROUTING
   ========================================================= */
btnNext.addEventListener('click', async () => {
  if (!validateForm()) return;

  btnNext.disabled = true;
  btnNextText.textContent = 'PROCESSING...';

  try {
    const apiBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5001' : window.location.origin;
    let endpoint, payload;

    if (mode === 'update') {
        endpoint = `${apiBase}/update_biometrics`;
        payload = { uid: storedUid, image: capturedDataUrl };
    } else {
        endpoint = `${apiBase}/signup`;
        payload = { uid: inputUserId.value.trim(), name: inputName.value.trim(), password: inputPassword.value, image: capturedDataUrl };
    }

    const response = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      credentials: 'include' // <-- ADD THIS LINE to sync with app.py sessions!
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(result.message || 'Transmission failed.');
    }

    // SUCCESS
    if (mode === 'register') {
        sessionStorage.setItem('arena_auth_user', inputName.value.trim());
        sessionStorage.setItem('arena_auth_uid', inputUserId.value.trim());
        sessionStorage.setItem('arena_auth_elo', "1200");
    }

    showDynamicModal('success', 'BIOMETRICS SECURED', 'Identity verified. Welcome to the grid.', `UID: ${mode === 'update' ? storedUid : inputUserId.value.trim()}<br>STATUS: AUTHORIZED<br>TIMESTAMP: ${new Date().toLocaleTimeString()}`);

  } catch (err) {
    // FAILURE
    console.error('Submission error:', err);
    showDynamicModal('error', 'SYSTEM ERROR', err.message, null);
    
    btnNext.disabled = false;
    btnNextText.textContent = mode === 'update' ? 'UPDATE BIOMETRICS' : 'NEXT';
  }
});

/* =========================================================
   DYNAMIC SHAPE-SHIFTING MODAL
   ========================================================= */
function showDynamicModal(type, title, desc, metaHtml) {
    modalBox.className = `modal theme-${type}`;
    modalTitle.textContent = title;
    modalDesc.textContent = desc;

    if (metaHtml) {
        modalMeta.innerHTML = metaHtml;
        modalMeta.classList.remove('hidden');
    } else {
        modalMeta.classList.add('hidden');
    }

    if (type === 'success') {
        modalIcon.innerHTML = `<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2"/><path d="M15 24l7 7 11-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        modalActions.innerHTML = `<button onclick="window.location.href='lobby_command_center.html'" class="btn-modal btn-modal-primary">ENTER LOBBY</button>`;
    } else {
        modalIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        modalActions.innerHTML = `
            <button onclick="window.triggerRetake()" class="btn-modal btn-modal-outline">RETRY SCAN</button>
            <button onclick="window.location.href='login.html'" class="btn-modal btn-modal-danger">DISCONNECT</button>
        `;
    }

    modalOverlay.classList.remove('hidden');
}

function hideDynamicModal() {
    modalOverlay.classList.add('hidden');
}