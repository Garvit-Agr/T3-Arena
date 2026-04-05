// lobby_command_center.js

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. AUTH GUARD & NAME TAG
    // ==========================================
    const loggedInUser = sessionStorage.getItem("arena_auth_user");
    const loggedInUid  = sessionStorage.getItem("arena_auth_uid");
    const loggedInElo  = sessionStorage.getItem("arena_auth_elo");

    if (!loggedInUser) {
        console.warn("SECURITY: Unauthorised access. Redirecting.");
        window.location.replace("login.html");
        return;
    }

    // FIX: target the element by ID and set real name
    const nameDisplay = document.getElementById('operator-name-display');
    if (nameDisplay) {
        // FIX: replaceAll (not replace) so all underscores are replaced
        nameDisplay.innerText = loggedInUser.replaceAll('_', ' ').toUpperCase();
    }

    // Show ELO in sidebar if element exists
    const eloDisplay = document.getElementById('operator-elo-display');
    if (eloDisplay && loggedInElo) {
        eloDisplay.innerText = `${parseInt(loggedInElo).toLocaleString()} ELO`;
    }


    // ==========================================
    // 2. UI ELEMENTS & STATE
    // ==========================================
    const searchInput  = document.getElementById('player-search');
    const sortSelect   = document.getElementById('sort-select');
    const playerGrid   = document.getElementById('player-grid');
    const btnFilterAll = document.getElementById('btn-filter-all');
    const btnFilterGM  = document.getElementById('btn-filter-gm');
    const sidebar      = document.getElementById('sidebar');
    const sidebarToggle= document.getElementById('sidebar-toggle');
    const mainCanvas   = document.getElementById('main-canvas');

    let activeFilter   = 'all';
    let isMatchRunning = false;

    sidebarToggle.addEventListener('click', () => {
        if (isMatchRunning) {
            alert("⚠️ SYSTEM LOCKED: Active match in progress.");
            return;
        }
        if (window.innerWidth >= 768) {
            sidebar.classList.toggle('sidebar-hidden');
            mainCanvas.classList.toggle('canvas-expanded');
        } else {
            sidebar.classList.toggle('sidebar-visible');
        }
    });


    // ==========================================
    // 3. BACKEND INTEGRATION
    // ==========================================
    let globalPlayersData = [];

    function fetchPlayers() {
        // FIX: this endpoint now exists in app.py
        fetch('http://localhost:5001/api/players', { credentials: 'include' })
            .then(response => {
                if (!response.ok) throw new Error(`Server error: ${response.status}`);
                return response.json();
            })
            .then(data => {
                globalPlayersData = data.players || [];
                renderGrid();
            })
            .catch(error => {
                console.warn("Backend unavailable:", error);
                globalPlayersData = [];
                renderGrid();
            });
    }


    // ==========================================
    // 4. ELO → RANK
    // ==========================================
    function getRank(elo) {
        if (elo >= 2800) return { name: "GRANDMASTER",  color: "text-[#ffeb3b]" };
        if (elo >= 2666) return { name: "MASTER III",   color: "text-[#e040fb]" };
        if (elo >= 2533) return { name: "MASTER II",    color: "text-[#e040fb]" };
        if (elo >= 2400) return { name: "MASTER I",     color: "text-[#e040fb]" };
        if (elo >= 2300) return { name: "DIAMOND III",  color: "text-[#00e5ff]" };
        if (elo >= 2200) return { name: "DIAMOND II",   color: "text-[#00e5ff]" };
        if (elo >= 2100) return { name: "DIAMOND I",    color: "text-[#00e5ff]" };
        if (elo >= 2000) return { name: "PLATINUM III", color: "text-[#1de9b6]" };
        if (elo >= 1900) return { name: "PLATINUM II",  color: "text-[#1de9b6]" };
        if (elo >= 1800) return { name: "PLATINUM I",   color: "text-[#1de9b6]" };
        if (elo >= 1700) return { name: "GOLD III",     color: "text-[#ffc107]" };
        if (elo >= 1600) return { name: "GOLD II",      color: "text-[#ffc107]" };
        if (elo >= 1500) return { name: "GOLD I",       color: "text-[#ffc107]" };
        if (elo >= 1400) return { name: "SILVER III",   color: "text-[#b0bec5]" };
        if (elo >= 1300) return { name: "SILVER II",    color: "text-[#b0bec5]" };
        if (elo >= 1200) return { name: "SILVER I",     color: "text-[#b0bec5]" };
        if (elo >= 800)  return { name: "BRONZE III",   color: "text-[#cd7f32]" };
        if (elo >= 400)  return { name: "BRONZE II",    color: "text-[#cd7f32]" };
        return                  { name: "BRONZE I",     color: "text-[#cd7f32]" };
    }


    // ==========================================
    // 5. FILTERS
    // ==========================================
    btnFilterAll.addEventListener('click', () => {
        activeFilter = 'all';
        btnFilterAll.classList.replace('bg-surface-container', 'bg-primary');
        btnFilterAll.classList.replace('text-on-surface-variant', 'text-[#002e6a]');
        btnFilterGM.classList.replace('bg-primary', 'bg-surface-container');
        btnFilterGM.classList.replace('text-[#002e6a]', 'text-on-surface-variant');
        renderGrid();
    });

    btnFilterGM.addEventListener('click', () => {
        activeFilter = 'gm';
        btnFilterGM.classList.replace('bg-surface-container', 'bg-primary');
        btnFilterGM.classList.replace('text-on-surface-variant', 'text-[#002e6a]');
        btnFilterAll.classList.replace('bg-primary', 'bg-surface-container');
        btnFilterAll.classList.replace('text-[#002e6a]', 'text-on-surface-variant');
        renderGrid();
    });


    // ==========================================
    // 6. RENDER GRID
    // ==========================================
    function renderGrid() {
        const searchTerm = searchInput.value.toLowerCase();

        let filtered = globalPlayersData.filter(p =>
            p.name.toLowerCase().includes(searchTerm)
        );

        if (activeFilter === 'gm') {
            filtered = filtered.filter(p => p.elo_rating >= 2800);
        }

        const sortMode = sortSelect.value;
        filtered.sort((a, b) => {
            switch (sortMode) {
                case 'elo-desc':  return b.elo_rating - a.elo_rating;
                case 'elo-asc':   return a.elo_rating - b.elo_rating;
                case 'win-desc':  return b.winrate - a.winrate;
                case 'win-asc':   return a.winrate - b.winrate;
                case 'name-asc':  return a.name.localeCompare(b.name);
                case 'name-desc': return b.name.localeCompare(a.name);
                default:          return 0;
            }
        });

        playerGrid.innerHTML = '';

        if (filtered.length === 0) {
            playerGrid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-20 opacity-60">
                    <span class="material-symbols-outlined text-6xl text-on-surface-variant/40 mb-4">radar</span>
                    <p class="font-headline font-bold text-xl text-on-surface-variant tracking-widest">NO OPERATORS FOUND</p>
                    <p class="font-label text-xs text-on-surface-variant/40 mt-2 tracking-widest">Backend may be offline or no players in database</p>
                </div>`;
            return;
        }

        filtered.forEach(player => {
            const rankData = getRank(player.elo_rating);
            // FIX: check if this card is the currently logged-in user
            const isMe = player.uid === loggedInUid;

            let statusClass = "";
            let buttonState = "";
            let statusBadge = "";

            if (player.status === "fighting") {
                statusClass = "bg-[#2a1313] border-[#ff5451]/30";
                statusBadge = `<div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#ff5451] animate-ping"></span>
                    <p class="font-label text-[10px] uppercase tracking-widest text-[#ff5451]">FIGHTING</p>
                </div>`;
                buttonState = `<button class="w-full py-3 border border-[#ff5451]/20 bg-[#ff5451]/10 text-[#ff5451] font-label font-bold text-xs tracking-widest rounded cursor-not-allowed" disabled>MATCH IN PROGRESS</button>`;

            } else if (player.status === "online") {
                if (isMe) {
                    // It's the logged-in user — show YOU badge, no challenge button
                    statusClass = "bg-[#1c1b1b] border-primary/30";
                    statusBadge = `<p class="font-label text-[10px] text-primary uppercase tracking-widest flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>YOU — ONLINE
                    </p>`;
                    buttonState = `<button class="w-full py-3 border border-primary/20 bg-primary/5 text-primary/50 font-label font-bold text-xs tracking-widest rounded cursor-not-allowed" disabled>THIS IS YOU</button>`;
                } else {
                    statusClass = "bg-[#1c1b1b] hover:bg-[#201f1f]";
                    statusBadge = `<p class="font-label text-[10px] text-secondary uppercase tracking-widest flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>ONLINE
                    </p>`;
                    buttonState = `<button class="w-full py-3 border border-secondary/20 bg-secondary/5 text-secondary font-label font-bold text-xs tracking-widest rounded hover:bg-secondary hover:text-[#003824] transition-all active:scale-95 flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-sm">swords</span> CHALLENGE
                    </button>`;
                }

            } else {
                statusClass = "bg-[#1c1b1b]/50 grayscale opacity-80";
                statusBadge = `<p class="font-label text-[10px] text-on-surface-variant/40 uppercase tracking-widest">OFFLINE</p>`;
                buttonState = `<button class="w-full py-3 border border-outline-variant/10 bg-transparent text-on-surface-variant/30 font-label font-bold text-xs tracking-widest rounded cursor-not-allowed" disabled>UNAVAILABLE</button>`;
            }

            playerGrid.insertAdjacentHTML('beforeend', `
                <div class="player-card group relative ${statusClass} border border-outline-variant/10 p-5 rounded-lg transition-all duration-300 hover:shadow-[0_0_20px_rgba(173,198,255,0.05)] ${isMe ? 'ring-1 ring-primary/30' : ''}">
                    <div class="flex items-start justify-between mb-6">
                        <div class="w-16 h-16 rounded-full border-2 border-outline-variant bg-[#353534] flex items-center justify-center overflow-hidden">
                            <span class="material-symbols-outlined text-3xl text-primary/40">person</span>
                        </div>
                        <div class="text-right">
                            <p class="font-label text-[10px] ${rankData.color} uppercase tracking-widest font-bold">${rankData.name}</p>
                            <p class="font-headline font-black text-xl text-primary tracking-tighter">${player.elo_rating} ELO</p>
                            <p class="font-label text-[10px] text-primary/60 tracking-widest">WR: ${player.winrate}%</p>
                        </div>
                    </div>
                    <div>
                        <h3 class="font-headline text-lg font-bold text-on-surface group-hover:text-primary transition-colors">${player.name}</h3>
                        <p class="font-label text-[10px] text-on-surface-variant/40 tracking-widest mb-1">${player.uid}</p>
                        <div class="mb-4 mt-1">${statusBadge}</div>
                    </div>
                    ${buttonState}
                </div>
            `);
        });
    }

    searchInput.addEventListener('input', renderGrid);
    sortSelect.addEventListener('change', renderGrid);

    // Initial fetch + refresh every 5 seconds
    fetchPlayers();
    setInterval(fetchPlayers, 5000);
});