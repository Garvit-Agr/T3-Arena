// document.addEventListener('DOMContentLoaded', () => {
//     // 🛑 NEW THE BOUNCER: Check for the VIP ticket before loading the page!
//     const loggedInUser = sessionStorage.getItem("arena_auth_user");
    
//     if (!loggedInUser) {
//         // If there is no ticket, kick them out immediately!
//         console.warn("SECURITY BREACH: Unauthorized access attempted.");
//         window.location.replace("login.html"); 
//         return; // Stop the rest of the Javascript from running
//     }

//     // --- You can even use their name dynamically now! ---
//     console.log(`Welcome authorized operator: ${loggedInUser}`);

    
//     const searchInput = document.getElementById('player-search');
//     const sortSelect = document.getElementById('sort-select');
//     const playerGrid = document.getElementById('player-grid');
//     const btnFilterAll = document.getElementById('btn-filter-all');
//     const btnFilterGM = document.getElementById('btn-filter-gm');
    
//     // Sidebar logic
//     const sidebar = document.getElementById('sidebar');
//     const sidebarToggle = document.getElementById('sidebar-toggle');
//     const mainCanvas = document.getElementById('main-canvas');
    
//     // SYSTEM STATE
//     let activeFilter = 'all'; // 'all' or 'gm'
    
//     // --- MATCH LOCKING SYSTEM ---
//     // If you set this to true, the user is in a match and cannot navigate away!
//     let isMatchRunning = false; 

//     sidebarToggle.addEventListener('click', () => {
//         if (isMatchRunning) {
//             alert("⚠️ SYSTEM LOCKED: Active match in progress. Navigation disabled.");
//             return;
//         }

//         // Check if the user is on a Desktop or Mobile screen
//         if (window.innerWidth >= 768) {
//             // DESKTOP: The sidebar is open by default. The button should HIDE it.
//             sidebar.classList.toggle('sidebar-hidden');
//             mainCanvas.classList.toggle('canvas-expanded');
//         } else {
//             // MOBILE: The sidebar is hidden by default. The button should SHOW it.
//             sidebar.classList.toggle('sidebar-visible');
//         }
//     });
    
//     // TEMPORARY MOCK DATA (Updated with "status" instead of "is_online")
//     let globalPlayersData = [
//         { uid: "001", name: "GHOST_SHELL", elo_rating: 2415, winrate: 68, status: "online" },
//         { uid: "002", name: "NEON_DRIFTER", elo_rating: 1990, winrate: 52, status: "offline" },
//         { uid: "003", name: "PLAYER_XER0", elo_rating: 2840, winrate: 75, status: "online" },
//         { uid: "004", name: "RECON_ALPHA", elo_rating: 1680, winrate: 45, status: "fighting" }, // This player is in a match!
//         { uid: "005", name: "CYBER_PUNK", elo_rating: 1290, winrate: 40, status: "online" }
//     ];

//     // --- ELO TO RANK CALCULATOR ---
//     function getRank(elo) {
//         if (elo >= 2800) return { name: "GRANDMASTER", color: "text-[#ffeb3b]" };
//         if (elo >= 2400) return { name: `MASTER ${elo >= 2666 ? "III" : elo >= 2533 ? "II" : "I"}`, color: "text-[#e040fb]" };
//         if (elo >= 2100) return { name: `DIAMOND ${elo >= 2300 ? "III" : elo >= 2200 ? "II" : "I"}`, color: "text-[#00e5ff]" };
//         if (elo >= 1800) return { name: `PLATINUM ${elo >= 2000 ? "III" : elo >= 1900 ? "II" : "I"}`, color: "text-[#1de9b6]" };
//         if (elo >= 1500) return { name: `GOLD ${elo >= 1700 ? "III" : elo >= 1600 ? "II" : "I"}`, color: "text-[#ffc107]" };
//         if (elo >= 1200) return { name: `SILVER ${elo >= 1400 ? "III" : elo >= 1300 ? "II" : "I"}`, color: "text-[#b0bec5]" };
//         return { name: `BRONZE ${elo >= 800 ? "III" : elo >= 400 ? "II" : "I"}`, color: "text-[#cd7f32]" };
//     }

//     // --- FILTERS ---
//     btnFilterAll.addEventListener('click', () => {
//         activeFilter = 'all';
//         btnFilterAll.classList.replace('bg-surface-container', 'bg-primary');
//         btnFilterAll.classList.replace('text-on-surface-variant', 'text-[#002e6a]');
//         btnFilterGM.classList.replace('bg-primary', 'bg-surface-container');
//         btnFilterGM.classList.replace('text-[#002e6a]', 'text-on-surface-variant');
//         renderGrid();
//     });

//     btnFilterGM.addEventListener('click', () => {
//         activeFilter = 'gm';
//         btnFilterGM.classList.replace('bg-surface-container', 'bg-primary');
//         btnFilterGM.classList.replace('text-on-surface-variant', 'text-[#002e6a]');
//         btnFilterAll.classList.replace('bg-primary', 'bg-surface-container');
//         btnFilterAll.classList.replace('text-[#002e6a]', 'text-on-surface-variant');
//         renderGrid();
//     });

//     // --- FEATURE 2: RENDER HTML FROM DATA ---
//     function renderGrid() {
//         const searchTerm = searchInput.value.toLowerCase();
//         let filteredPlayers = globalPlayersData.filter(player => 
//             player.name.toLowerCase().includes(searchTerm)
//         );

//         if (activeFilter === 'gm') {
//             filteredPlayers = filteredPlayers.filter(p => p.elo_rating >= 2800);
//         }

//         const sortMode = sortSelect.value;
//         filteredPlayers.sort((a, b) => {
//             switch (sortMode) {
//                 case 'elo-desc': return b.elo_rating - a.elo_rating;
//                 case 'elo-asc':  return a.elo_rating - b.elo_rating;
//                 case 'win-desc': return b.winrate - a.winrate;
//                 case 'win-asc':  return a.winrate - b.winrate;
//                 case 'name-asc': return a.name.localeCompare(b.name);
//                 case 'name-desc':return b.name.localeCompare(a.name);
//                 default: return 0;
//             }
//         });

//         playerGrid.innerHTML = '';

//         if (filteredPlayers.length === 0) {
//             playerGrid.innerHTML = `
//                 <div class="col-span-full flex flex-col items-center justify-center py-20 opacity-60">
//                     <span class="material-symbols-outlined text-6xl text-on-surface-variant/40 mb-4">radar</span>
//                     <p class="font-headline font-bold text-xl text-on-surface-variant tracking-widest">NO OPERATORS FOUND</p>
//                 </div>`;
//             return;
//         }

//         filteredPlayers.forEach(player => {
//             const rankData = getRank(player.elo_rating);
            
//             // Dynamic Status Logic
//             let statusClass = "";
//             let buttonState = "";
//             let statusBadge = "";

//             if (player.status === "fighting") {
//                 statusClass = "bg-[#2a1313] border-[#ff5451]/30"; // Red tint
//                 statusBadge = `<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-[#ff5451] animate-ping"></span><p class="font-label text-[10px] uppercase tracking-widest text-[#ff5451]">FIGHTING</p></div>`;
//                 buttonState = `<button class="w-full py-3 border border-[#ff5451]/20 bg-[#ff5451]/10 text-[#ff5451] font-label font-bold text-xs tracking-widest rounded cursor-not-allowed" disabled>MATCH IN PROGRESS</button>`;
//             } else if (player.status === "online") {
//                 statusClass = "bg-[#1c1b1b] hover:bg-[#201f1f]";
//                 statusBadge = `<p class="font-label text-[10px] text-secondary uppercase tracking-widest flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>ONLINE</p>`;
//                 buttonState = `<button class="w-full py-3 border border-secondary/20 bg-secondary/5 text-secondary font-label font-bold text-xs tracking-widest rounded hover:bg-secondary hover:text-[#003824] transition-all active:scale-95 flex items-center justify-center gap-2"><span class="material-symbols-outlined text-sm">swords</span> CHALLENGE</button>`;
//             } else {
//                 statusClass = "bg-[#1c1b1b]/50 grayscale opacity-80";
//                 statusBadge = `<p class="font-label text-[10px] text-on-surface-variant/40 uppercase tracking-widest">OFFLINE</p>`;
//                 buttonState = `<button class="w-full py-3 border border-outline-variant/10 bg-transparent text-on-surface-variant/30 font-label font-bold text-xs tracking-widest rounded cursor-not-allowed" disabled>UNAVAILABLE</button>`;
//             }

//             const cardHTML = `
//                 <div class="player-card group relative ${statusClass} border border-outline-variant/10 p-5 rounded-lg transition-all duration-300 hover:shadow-[0_0_20px_rgba(173,198,255,0.05)]">
//                     <div class="flex items-start justify-between mb-6">
//                         <div class="relative">
//                             <div class="w-16 h-16 rounded-full border-2 border-outline-variant bg-[#353534] flex items-center justify-center overflow-hidden">
//                                 <span class="material-symbols-outlined text-3xl text-primary/40">person</span>
//                             </div>
//                         </div>
//                         <div class="text-right">
//                             <p class="font-label text-[10px] ${rankData.color} uppercase tracking-widest font-bold">${rankData.name}</p>
//                             <p class="font-headline font-black text-xl text-primary tracking-tighter">${player.elo_rating} ELO</p>
//                             <p class="font-label text-[10px] text-primary/60 tracking-widest">WR: ${player.winrate}%</p>
//                         </div>
//                     </div>
//                     <div>
//                         <h3 class="font-headline text-lg font-bold text-on-surface group-hover:text-primary transition-colors">${player.name}</h3>
//                         <div class="mb-4 mt-1">${statusBadge}</div>
//                     </div>
//                     ${buttonState}
//                 </div>
//             `;
//             playerGrid.insertAdjacentHTML('beforeend', cardHTML);
//         });
//     }

//     searchInput.addEventListener('input', renderGrid);
//     sortSelect.addEventListener('change', renderGrid);
//     renderGrid();
// });









///////// this is final code for th server connection and so remove the comments from the below code














document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('player-search');
    const sortSelect = document.getElementById('sort-select');
    const playerGrid = document.getElementById('player-grid');
    const btnFilterAll = document.getElementById('btn-filter-all');
    const btnFilterGM = document.getElementById('btn-filter-gm');
    
    // Sidebar logic
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const mainCanvas = document.getElementById('main-canvas');
    
    // SYSTEM STATE
    let activeFilter = 'all'; // 'all' or 'gm'
    let isMatchRunning = false; 

    sidebarToggle.addEventListener('click', () => {
        if (isMatchRunning) {
            alert("⚠️ SYSTEM LOCKED: Active match in progress. Navigation disabled.");
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
    // BACKEND INTEGRATION: REAL DATA FETCHING
    // ==========================================
    let globalPlayersData = []; // Start with an empty array

    function fetchPlayers() {
        // Fetch the live player list from Member 3's backend
        fetch('http://localhost:5001/api/players')
            .then(response => {
                if(!response.ok) throw new Error("Server disconnected");
                return response.json();
            })
            .then(data => {
                globalPlayersData = data.players; // Save the real database players
                renderGrid(); // Draw the screen with the real data
            })
            .catch(error => {
                console.warn("Backend unavailable. Defaulting to empty state.");
                globalPlayersData = []; // Wipe the array if server is off
                renderGrid(); // Draw the "NO OPERATORS FOUND" screen
            });
    }

    // --- ELO TO RANK CALCULATOR ---
    function getRank(elo) {
        if (elo >= 2800) return { name: "GRANDMASTER", color: "text-[#ffeb3b]" };
        if (elo >= 2400) return { name: `MASTER ${elo >= 2666 ? "III" : elo >= 2533 ? "II" : "I"}`, color: "text-[#e040fb]" };
        if (elo >= 2100) return { name: `DIAMOND ${elo >= 2300 ? "III" : elo >= 2200 ? "II" : "I"}`, color: "text-[#00e5ff]" };
        if (elo >= 1800) return { name: `PLATINUM ${elo >= 2000 ? "III" : elo >= 1900 ? "II" : "I"}`, color: "text-[#1de9b6]" };
        if (elo >= 1500) return { name: `GOLD ${elo >= 1700 ? "III" : elo >= 1600 ? "II" : "I"}`, color: "text-[#ffc107]" };
        if (elo >= 1200) return { name: `SILVER ${elo >= 1400 ? "III" : elo >= 1300 ? "II" : "I"}`, color: "text-[#b0bec5]" };
        return { name: `BRONZE ${elo >= 800 ? "III" : elo >= 400 ? "II" : "I"}`, color: "text-[#cd7f32]" };
    }

    // --- FILTERS ---
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

    // --- FEATURE 2: RENDER HTML FROM DATA ---
    function renderGrid() {
        const searchTerm = searchInput.value.toLowerCase();
        let filteredPlayers = globalPlayersData.filter(player => 
            player.name.toLowerCase().includes(searchTerm)
        );

        if (activeFilter === 'gm') {
            filteredPlayers = filteredPlayers.filter(p => p.elo_rating >= 2800);
        }

        const sortMode = sortSelect.value;
        filteredPlayers.sort((a, b) => {
            switch (sortMode) {
                case 'elo-desc': return b.elo_rating - a.elo_rating;
                case 'elo-asc':  return a.elo_rating - b.elo_rating;
                case 'win-desc': return b.winrate - a.winrate;
                case 'win-asc':  return a.winrate - b.winrate;
                case 'name-asc': return a.name.localeCompare(b.name);
                case 'name-desc':return b.name.localeCompare(a.name);
                default: return 0;
            }
        });

        playerGrid.innerHTML = '';

        if (filteredPlayers.length === 0) {
            playerGrid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-20 opacity-60">
                    <span class="material-symbols-outlined text-6xl text-on-surface-variant/40 mb-4">radar</span>
                    <p class="font-headline font-bold text-xl text-on-surface-variant tracking-widest">NO OPERATORS FOUND</p>
                </div>`;
            return;
        }

        filteredPlayers.forEach(player => {
            const rankData = getRank(player.elo_rating);
            
            let statusClass = "";
            let buttonState = "";
            let statusBadge = "";

            if (player.status === "fighting") {
                statusClass = "bg-[#2a1313] border-[#ff5451]/30"; 
                statusBadge = `<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-[#ff5451] animate-ping"></span><p class="font-label text-[10px] uppercase tracking-widest text-[#ff5451]">FIGHTING</p></div>`;
                buttonState = `<button class="w-full py-3 border border-[#ff5451]/20 bg-[#ff5451]/10 text-[#ff5451] font-label font-bold text-xs tracking-widest rounded cursor-not-allowed" disabled>MATCH IN PROGRESS</button>`;
            } else if (player.status === "online") {
                statusClass = "bg-[#1c1b1b] hover:bg-[#201f1f]";
                statusBadge = `<p class="font-label text-[10px] text-secondary uppercase tracking-widest flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>ONLINE</p>`;
                buttonState = `<button class="w-full py-3 border border-secondary/20 bg-secondary/5 text-secondary font-label font-bold text-xs tracking-widest rounded hover:bg-secondary hover:text-[#003824] transition-all active:scale-95 flex items-center justify-center gap-2"><span class="material-symbols-outlined text-sm">swords</span> CHALLENGE</button>`;
            } else {
                statusClass = "bg-[#1c1b1b]/50 grayscale opacity-80";
                statusBadge = `<p class="font-label text-[10px] text-on-surface-variant/40 uppercase tracking-widest">OFFLINE</p>`;
                buttonState = `<button class="w-full py-3 border border-outline-variant/10 bg-transparent text-on-surface-variant/30 font-label font-bold text-xs tracking-widest rounded cursor-not-allowed" disabled>UNAVAILABLE</button>`;
            }

            const cardHTML = `
                <div class="player-card group relative ${statusClass} border border-outline-variant/10 p-5 rounded-lg transition-all duration-300 hover:shadow-[0_0_20px_rgba(173,198,255,0.05)]">
                    <div class="flex items-start justify-between mb-6">
                        <div class="relative">
                            <div class="w-16 h-16 rounded-full border-2 border-outline-variant bg-[#353534] flex items-center justify-center overflow-hidden">
                                <span class="material-symbols-outlined text-3xl text-primary/40">person</span>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="font-label text-[10px] ${rankData.color} uppercase tracking-widest font-bold">${rankData.name}</p>
                            <p class="font-headline font-black text-xl text-primary tracking-tighter">${player.elo_rating} ELO</p>
                            <p class="font-label text-[10px] text-primary/60 tracking-widest">WR: ${player.winrate}%</p>
                        </div>
                    </div>
                    <div>
                        <h3 class="font-headline text-lg font-bold text-on-surface group-hover:text-primary transition-colors">${player.name}</h3>
                        <div class="mb-4 mt-1">${statusBadge}</div>
                    </div>
                    ${buttonState}
                </div>
            `;
            playerGrid.insertAdjacentHTML('beforeend', cardHTML);
        });
    }

    searchInput.addEventListener('input', renderGrid);
    sortSelect.addEventListener('change', renderGrid);

    // Fetch the real data instantly when the page loads
    fetchPlayers();

    // Re-fetch the data every 5 seconds to keep the Lobby updated!
    setInterval(fetchPlayers, 5000);
});