document.addEventListener('DOMContentLoaded', () => {
    // --- SIDEBAR LOGIC ---
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const mainCanvas = document.getElementById('main-canvas');

    sidebarToggle.addEventListener('click', () => {
        if (window.innerWidth >= 768) {
            sidebar.classList.toggle('sidebar-hidden');
            mainCanvas.classList.toggle('canvas-expanded');
        } else {
            sidebar.classList.toggle('sidebar-visible');
        }
    });

    // --- PAGINATION & FILTER LOGIC ---
    const leaderboardBody = document.getElementById('leaderboard-body');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const pageIndicator = document.getElementById('page-indicator');
    const paginationInfo = document.getElementById('pagination-info');
    
    // Filter Buttons
    const btnFilterLive = document.getElementById('btn-filter-live');
    const btnFilterGlobal = document.getElementById('btn-filter-global');

    // System Settings
    const PLAYERS_PER_PAGE = 10;
    let currentPage = 1;
    let currentFilter = 'global'; // 'global' or 'live'

    // Temporary Mock Data (25 players)
    let globalLeaderboardData = [];
    for (let i = 1; i <= 25; i++) {
        globalLeaderboardData.push({
            rank: i,
            uid: `OP_${i.toString().padStart(3, '0')}`,
            name: `OPERATOR_${i}`,
            elo_rating: 3000 - (i * 45), 
            winrate: (80 - (i * 1.5)).toFixed(1),
            status: i % 3 === 0 ? "fighting" : (i % 2 === 0 ? "offline" : "online"),
            isCurrentUser: i === 14
        });
    }

    // --- FILTER BUTTON EVENTS ---
    const activeClass = "px-4 py-2 bg-primary text-[#002e6a] text-xs font-headline font-bold tracking-widest uppercase rounded shadow-[0_0_15px_rgba(173,198,255,0.2)] transition-colors";
    const inactiveClass = "px-4 py-2 bg-surface-container text-on-surface-variant text-xs font-headline font-bold tracking-widest uppercase border border-outline-variant/20 rounded hover:bg-surface-bright transition-colors";

    btnFilterLive.addEventListener('click', () => {
        currentFilter = 'live';
        currentPage = 1; 
        btnFilterLive.className = activeClass;
        btnFilterGlobal.className = inactiveClass;
        renderTable();
    });

    btnFilterGlobal.addEventListener('click', () => {
        currentFilter = 'global';
        currentPage = 1; 
        btnFilterGlobal.className = activeClass;
        btnFilterLive.className = inactiveClass;
        renderTable();
    });

    // --- RENDER TABLE ---
    function renderTable() {
        // 1. FILTER DATA
        let filteredData = globalLeaderboardData;
        if (currentFilter === 'live') {
            filteredData = globalLeaderboardData.filter(player => player.status === 'online' || player.status === 'fighting');
        }

        // 2. PAGINATION MATH
        const totalPlayers = filteredData.length;
        const totalPages = Math.max(1, Math.ceil(totalPlayers / PLAYERS_PER_PAGE)); 
        
        const startIndex = (currentPage - 1) * PLAYERS_PER_PAGE;
        const endIndex = Math.min(startIndex + PLAYERS_PER_PAGE, totalPlayers);
        const playersOnThisPage = filteredData.slice(startIndex, endIndex);

        // 3. UPDATE FOOTER UI
        paginationInfo.innerText = `SHOWING ${totalPlayers > 0 ? startIndex + 1 : 0} TO ${endIndex} OF ${totalPlayers} ACTIVE RECORDS`;
        pageIndicator.innerText = `PAGE ${currentPage.toString().padStart(2, '0')} / ${totalPages.toString().padStart(2, '0')}`;

        btnPrev.disabled = currentPage === 1;
        btnNext.disabled = currentPage === totalPages;

        // 4. DRAW ROWS
        leaderboardBody.innerHTML = ''; 

        if (playersOnThisPage.length === 0) {
            leaderboardBody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-on-surface-variant/50 font-label tracking-widest">NO LIVE OPERATORS FOUND</td></tr>`;
            return;
        }

        playersOnThisPage.forEach(player => {
            let statusHTML = "";
            if (player.status === "online") {
                statusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(78,222,163,0.6)]"></span>`;
            } else if (player.status === "fighting") {
                statusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-[#ff5451] animate-ping"></span>`;
            } else {
                statusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-on-surface-variant/30"></span>`;
            }

            const rowClass = player.isCurrentUser 
                ? "bg-primary/5 border-l-4 border-primary hover:bg-primary/10 transition-colors group" 
                : "hover:bg-surface-bright/20 transition-colors group";

            const rankColor = player.rank <= 3 ? "text-primary" : "text-on-surface-variant";
            const initials = player.name.substring(0, 2).toUpperCase();

            const rowHTML = `
                <tr class="${rowClass}">
                    <td class="px-6 py-5 font-headline font-black ${rankColor} italic text-lg">${player.rank.toString().padStart(2, '0')}</td>
                    <td class="px-6 py-5">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-on-surface-variant text-xs font-bold">${initials}</div>
                            <span class="font-headline font-bold text-sm ${player.isCurrentUser ? 'text-primary' : ''}">${player.name} ${player.isCurrentUser ? '(YOU)' : ''}</span>
                        </div>
                    </td>
                    <td class="px-6 py-5 text-center" id="status-cell-${player.uid}">
                        ${statusHTML}
                    </td>
                    <td class="px-6 py-5 text-right font-mono-data ${player.isCurrentUser ? 'font-black text-primary' : 'font-bold text-on-surface'}">${player.elo_rating}</td>
                    <td class="px-6 py-5 text-right font-mono-data ${player.isCurrentUser ? 'text-primary/80' : 'text-on-surface/80'}">${player.winrate}%</td>
                </tr>
            `;
            leaderboardBody.insertAdjacentHTML('beforeend', rowHTML);
        });
    }

    // --- PAGINATION BUTTON EVENTS ---
    btnNext.addEventListener('click', () => {
        let filteredData = currentFilter === 'live' ? globalLeaderboardData.filter(p => p.status === 'online' || p.status === 'fighting') : globalLeaderboardData;
        const totalPages = Math.ceil(filteredData.length / PLAYERS_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });

    btnPrev.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    // Initial render when the page loads
    renderTable();


    // =====================================================================
    // FRONTEND TEST: Watch the dots randomly change color every 3 seconds!
    // =====================================================================
    function mockSilentSync() {
        const randomPlayer = globalLeaderboardData[Math.floor(Math.random() * globalLeaderboardData.length)];
        const statuses = ["online", "offline", "fighting"];
        randomPlayer.status = statuses[Math.floor(Math.random() * statuses.length)];

        const statusCell = document.getElementById(`status-cell-${randomPlayer.uid}`);
        
        if (statusCell) {
            let newStatusHTML = "";
            if (randomPlayer.status === "online") newStatusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(78,222,163,0.6)]"></span>`;
            else if (randomPlayer.status === "fighting") newStatusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-[#ff5451] animate-ping"></span>`;
            else newStatusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-on-surface-variant/30"></span>`;
            statusCell.innerHTML = newStatusHTML;
        }
    }
    
    // Start the mock sync loop
    setInterval(mockSilentSync, 3000);

    // =====================================================================
    // HANDOFF TO BACKEND: Un-comment this block when Member 3 is ready
    // =====================================================================
    /*
    function syncLiveStatus() {
        fetch('http://localhost:5000/api/leaderboard') 
            .then(response => response.json())
            .then(data => {
                const latestPlayers = data.players;
                latestPlayers.forEach(latestPlayer => {
                    const existingPlayer = globalLeaderboardData.find(p => p.uid === latestPlayer.uid);
                    if (existingPlayer) existingPlayer.status = latestPlayer.status;
                    
                    const statusCell = document.getElementById(\`status-cell-\${latestPlayer.uid}\`);
                    if (statusCell) {
                        let newStatusHTML = "";
                        if (latestPlayer.status === "online") newStatusHTML = \`<span class="inline-block w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(78,222,163,0.6)]"></span>\`;
                        else if (latestPlayer.status === "fighting") newStatusHTML = \`<span class="inline-block w-2.5 h-2.5 rounded-full bg-[#ff5451] animate-ping"></span>\`;
                        else newStatusHTML = \`<span class="inline-block w-2.5 h-2.5 rounded-full bg-on-surface-variant/30"></span>\`;
                        statusCell.innerHTML = newStatusHTML;
                    }
                });
            })
            .catch(error => console.error("Silent sync failed.", error));
    }
    // setInterval(syncLiveStatus, 5000);
    */
});


// remove the comment from the below part 
// document.addEventListener('DOMContentLoaded', () => {
//     // --- SIDEBAR LOGIC ---
//     const sidebar = document.getElementById('sidebar');
//     const sidebarToggle = document.getElementById('sidebar-toggle');
//     const mainCanvas = document.getElementById('main-canvas');

//     sidebarToggle.addEventListener('click', () => {
//         if (window.innerWidth >= 768) {
//             sidebar.classList.toggle('sidebar-hidden');
//             mainCanvas.classList.toggle('canvas-expanded');
//         } else {
//             sidebar.classList.toggle('sidebar-visible');
//         }
//     });

//     // --- PAGINATION & FILTER LOGIC ---
//     const leaderboardBody = document.getElementById('leaderboard-body');
//     const btnPrev = document.getElementById('btn-prev');
//     const btnNext = document.getElementById('btn-next');
//     const pageIndicator = document.getElementById('page-indicator');
//     const paginationInfo = document.getElementById('pagination-info');
    
//     // Filter Buttons
//     const btnFilterLive = document.getElementById('btn-filter-live');
//     const btnFilterGlobal = document.getElementById('btn-filter-global');

//     // System Settings
//     const PLAYERS_PER_PAGE = 10;
//     let currentPage = 1;
//     let currentFilter = 'global'; // 'global' or 'live'

//     // ==========================================
//     // BACKEND INTEGRATION: REAL DATA FETCHING
//     // ==========================================
//     let globalLeaderboardData = []; // Starts empty!

//     // Fetch the full leaderboard when the page first loads
//     function fetchInitialLeaderboard() {
//         fetch('http://localhost:5000/api/leaderboard')
//             .then(response => response.json())
//             .then(data => {
//                 globalLeaderboardData = data.players;
//                 renderTable(); 
//             })
//             .catch(error => {
//                 console.error("Failed to load leaderboard.", error);
//                 renderTable(); // Will render the "NO OPERATORS FOUND" empty state
//             });
//     }

//     // --- FILTER BUTTON EVENTS ---
//     const activeClass = "px-4 py-2 bg-primary text-[#002e6a] text-xs font-headline font-bold tracking-widest uppercase rounded shadow-[0_0_15px_rgba(173,198,255,0.2)] transition-colors";
//     const inactiveClass = "px-4 py-2 bg-surface-container text-on-surface-variant text-xs font-headline font-bold tracking-widest uppercase border border-outline-variant/20 rounded hover:bg-surface-bright transition-colors";

//     btnFilterLive.addEventListener('click', () => {
//         currentFilter = 'live';
//         currentPage = 1; 
//         btnFilterLive.className = activeClass;
//         btnFilterGlobal.className = inactiveClass;
//         renderTable();
//     });

//     btnFilterGlobal.addEventListener('click', () => {
//         currentFilter = 'global';
//         currentPage = 1; 
//         btnFilterGlobal.className = activeClass;
//         btnFilterLive.className = inactiveClass;
//         renderTable();
//     });

//     // --- RENDER TABLE ---
//     function renderTable() {
//         // 1. FILTER DATA
//         let filteredData = globalLeaderboardData;
//         if (currentFilter === 'live') {
//             filteredData = globalLeaderboardData.filter(player => player.status === 'online' || player.status === 'fighting');
//         }

//         // 2. PAGINATION MATH
//         const totalPlayers = filteredData.length;
//         const totalPages = Math.max(1, Math.ceil(totalPlayers / PLAYERS_PER_PAGE)); 
        
//         const startIndex = (currentPage - 1) * PLAYERS_PER_PAGE;
//         const endIndex = Math.min(startIndex + PLAYERS_PER_PAGE, totalPlayers);
//         const playersOnThisPage = filteredData.slice(startIndex, endIndex);

//         // 3. UPDATE FOOTER UI
//         paginationInfo.innerText = `SHOWING ${totalPlayers > 0 ? startIndex + 1 : 0} TO ${endIndex} OF ${totalPlayers} ACTIVE RECORDS`;
//         pageIndicator.innerText = `PAGE ${currentPage.toString().padStart(2, '0')} / ${totalPages.toString().padStart(2, '0')}`;

//         btnPrev.disabled = currentPage === 1;
//         btnNext.disabled = currentPage === totalPages;

//         // 4. DRAW ROWS
//         leaderboardBody.innerHTML = ''; 

//         if (playersOnThisPage.length === 0) {
//             leaderboardBody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-on-surface-variant/50 font-label tracking-widest">NO LIVE OPERATORS FOUND</td></tr>`;
//             return;
//         }

//         playersOnThisPage.forEach(player => {
//             let statusHTML = "";
//             if (player.status === "online") {
//                 statusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(78,222,163,0.6)]"></span>`;
//             } else if (player.status === "fighting") {
//                 statusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-[#ff5451] animate-ping"></span>`;
//             } else {
//                 statusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-on-surface-variant/30"></span>`;
//             }

//             const rowClass = player.isCurrentUser 
//                 ? "bg-primary/5 border-l-4 border-primary hover:bg-primary/10 transition-colors group" 
//                 : "hover:bg-surface-bright/20 transition-colors group";

//             const rankColor = player.rank <= 3 ? "text-primary" : "text-on-surface-variant";
//             const initials = player.name.substring(0, 2).toUpperCase();

//             const rowHTML = `
//                 <tr class="${rowClass}">
//                     <td class="px-6 py-5 font-headline font-black ${rankColor} italic text-lg">${player.rank.toString().padStart(2, '0')}</td>
//                     <td class="px-6 py-5">
//                         <div class="flex items-center gap-3">
//                             <div class="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-on-surface-variant text-xs font-bold">${initials}</div>
//                             <span class="font-headline font-bold text-sm ${player.isCurrentUser ? 'text-primary' : ''}">${player.name} ${player.isCurrentUser ? '(YOU)' : ''}</span>
//                         </div>
//                     </td>
//                     <td class="px-6 py-5 text-center" id="status-cell-${player.uid}">
//                         ${statusHTML}
//                     </td>
//                     <td class="px-6 py-5 text-right font-mono-data ${player.isCurrentUser ? 'font-black text-primary' : 'font-