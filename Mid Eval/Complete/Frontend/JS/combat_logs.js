document.addEventListener('DOMContentLoaded', () => {

    const loggedInUser = sessionStorage.getItem("arena_auth_user");
    const loggedInUid  = sessionStorage.getItem("arena_auth_uid");

    if (!loggedInUser || !loggedInUid) {
        window.location.replace("login.html");
        return;
    }

    const storedElo = parseInt(sessionStorage.getItem("arena_auth_elo") || "0");
    document.getElementById('op-name').innerText = loggedInUser.replaceAll('_', ' ').toUpperCase();
    document.getElementById('hdr-initials').innerText = getInitials(loggedInUser);
    
    if (storedElo) {
        document.getElementById('op-elo').innerText = `${storedElo.toLocaleString()} ELO`;
        document.getElementById('hdr-elo').innerText = `${storedElo.toLocaleString()} ELO`;
        document.getElementById('hdr-rank').innerText = getRankName(storedElo);
    }

    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        if (window.innerWidth >= 768) {
            sidebar.classList.toggle('sidebar-hidden');
            mainContent.classList.toggle('canvas-expanded');
        } else {
            sidebar.classList.toggle('sidebar-visible');
        }
    });

    // THE DISCONNECT BUTTON LOGIC
    document.getElementById('btn-logout').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await fetch('http://localhost:5001/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: loggedInUid }),
                credentials: 'include'
            });
        } catch (_) {}
        sessionStorage.clear();
        window.location.href = 'login.html';
    });

    const logsContainer = document.getElementById('match-logs-container');
    const templateLog   = document.getElementById('template-log-entry');
    const templateEmpty = document.getElementById('template-empty-state');

    const statTotalMatches = document.getElementById('stat-total-matches');
    const statWinrate      = document.getElementById('stat-winrate');
    const statWLRatio      = document.getElementById('stat-wl-ratio');
    const statNemesis      = document.getElementById('stat-nemesis');
    const statNetElo       = document.getElementById('stat-net-elo');
    const widgetCombatScore= document.getElementById('widget-combat-score');

    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const pgInfo = document.getElementById('pg-info');
    const pgInd = document.getElementById('pg-ind');

    let globalMatchData = [];
    let currentFilteredData = [];
    let currentFilter = 'all'; 
    let searchQuery = '';
    
    let currentPage = 1;
    const ITEMS_PER_PAGE = 10;

    document.getElementById('log-search').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        applyFiltersAndRender();
    });

    const btnFilterAll = document.getElementById('btn-filter-all');
    const btnFilterWins = document.getElementById('btn-filter-wins');
    const btnFilterLosses = document.getElementById('btn-filter-losses');

    function updateActiveFilterButton(activeBtn) {
        btnFilterAll.classList.remove('active');
        btnFilterWins.classList.remove('active');
        btnFilterLosses.classList.remove('active');
        activeBtn.classList.add('active');
    }

    btnFilterAll.addEventListener('click', () => {
        currentFilter = 'all';
        updateActiveFilterButton(btnFilterAll);
        applyFiltersAndRender();
    });

    btnFilterWins.addEventListener('click', () => {
        currentFilter = 'win';
        updateActiveFilterButton(btnFilterWins);
        applyFiltersAndRender();
    });

    btnFilterLosses.addEventListener('click', () => {
        currentFilter = 'loss';
        updateActiveFilterButton(btnFilterLosses);
        applyFiltersAndRender();
    });

    btnNext.addEventListener('click', () => {
        const totalPages = Math.ceil(currentFilteredData.length / ITEMS_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            renderLogs();
        }
    });
    
    btnPrev.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderLogs();
        }
    });

    function getInitials(name) {
        if (!name) return "??";
        const parts = name.trim().split(/[_\s]+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    function formatDate(dateString) {
        const d = new Date(dateString);
        const day = d.getDate().toString().padStart(2, '0');
        const month = d.toLocaleString('default', { month: 'short' }).toUpperCase();
        const year = d.getFullYear();
        return `${day} ${month} ${year}`;
    }

    function getRankName(elo) {
        if (elo >= 2800) return "Grandmaster";
        if (elo >= 2000) return "Platinum I";
        if (elo >= 1500) return "Gold I";
        if (elo >= 1200) return "Silver I";
        return "Bronze I";
    }

    async function fetchCombatLogs() {
        try {
            const response = await fetch(`http://localhost:5001/api/match-history/${loggedInUid}`, { credentials: 'include' });
            const data = await response.json();

            if (data.matches) {
                const serverUid = data.current_user_id;

                globalMatchData = data.matches.map(m => {
                    const isWin = m.winner_uid === serverUid;
                    const isDraw = m.winner_uid === null && !m.forfeit;

                    return {
                        timestamp: m.played_at, 
                        result: isDraw ? 'draw' : (isWin ? 'win' : 'loss'),
                        opponent_name: (m.player1_uid === serverUid ? m.p2_name : m.p1_name) || "Unknown",
                        opponent_rank: "OPPONENT", 
                        elo_change: m.player1_uid === serverUid 
                            ? (m.player1_elo_after - m.player1_elo_before) 
                            : (m.player2_elo_after - m.player2_elo_before)
                    };
                });
                
                renderStats(globalMatchData);
                applyFiltersAndRender();
            }
        } catch (error) {
            console.error('Fetch error:', error);
        }
    }

    function applyFiltersAndRender() {
        currentFilteredData = globalMatchData.filter(match => {
            const passesFilter = (currentFilter === 'all') || (match.result === currentFilter);
            const passesSearch = match.opponent_name.toLowerCase().includes(searchQuery);
            return passesFilter && passesSearch;
        });

        currentPage = 1; 
        renderLogs();
    }

    function renderStats(matches) {
        if (!matches || matches.length === 0) return;

        let wins = 0;
        let losses = 0;
        let netElo = 0;
        
        matches.forEach(match => {
            if (match.result === 'win') wins++;
            else losses++;
            netElo += match.elo_change;
        });

        const total = wins + losses;
        const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";

        statTotalMatches.innerText = total;
        statWinrate.innerText = winrate;
        statWLRatio.innerText = `${wins} W / ${losses} L`;
        statNetElo.innerText = netElo > 0 ? `+${netElo}` : netElo;
        widgetCombatScore.innerText = (wins * 150) + (netElo * 2);

        if (total > 0) {
            const opponentCounts = {};
            matches.forEach(m => {
                opponentCounts[m.opponent_name] = (opponentCounts[m.opponent_name] || 0) + 1;
            });
            const nemesisName = Object.keys(opponentCounts).reduce((a, b) => opponentCounts[a] > opponentCounts[b] ? a : b);
            statNemesis.innerText = nemesisName.toUpperCase();
        }
    }

    function renderLogs() {
        logsContainer.innerHTML = ''; 

        const total = currentFilteredData.length;
        const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
        
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, total);
        const pageData = currentFilteredData.slice(startIdx, endIdx);

        pgInfo.innerText = `Showing ${total > 0 ? startIdx + 1 : 0} to ${endIdx} of ${total} records`;
        pgInd.innerText = `Page ${currentPage.toString().padStart(2, '0')} / ${totalPages.toString().padStart(2, '0')}`;
        btnPrev.disabled = currentPage === 1;
        btnNext.disabled = currentPage === totalPages;

        if (pageData.length === 0) {
            const emptyClone = templateEmpty.content.cloneNode(true);
            logsContainer.appendChild(emptyClone);
            return;
        }

        const fragment = document.createDocumentFragment();

        pageData.forEach(match => {
            const logClone = templateLog.content.cloneNode(true);
            const entryWrapper = logClone.querySelector('.log-entry');
            const resultTextEl = logClone.querySelector('.js-result-text');
            const scoreChangeEl = logClone.querySelector('.js-score-change');

            // --- FIXED DRAW LOGIC ---
            if (match.result === 'win') {
                entryWrapper.classList.add('is-win');
                resultTextEl.innerText = 'VICTORY';
                scoreChangeEl.innerText = `+${match.elo_change}`;
            } else if (match.result === 'draw') {
                entryWrapper.classList.add('is-draw');
                resultTextEl.innerText = 'DRAW';
                // For draws, show +/- normally (e.g., -1 or +0)
                scoreChangeEl.innerText = match.elo_change > 0 ? `+${match.elo_change}` : match.elo_change;
            } else {
                entryWrapper.classList.add('is-loss');
                resultTextEl.innerText = 'DEFEAT';
                scoreChangeEl.innerText = match.elo_change;
            }

            logClone.querySelector('.js-date').innerText = formatDate(match.timestamp);
            logClone.querySelector('.js-avatar').innerText = getInitials(match.opponent_name);
            logClone.querySelector('.js-name').innerText = match.opponent_name;
            logClone.querySelector('.js-rank').innerText = `${match.opponent_rank} RANKING`;

            fragment.appendChild(logClone);
        });

        logsContainer.appendChild(fragment);
    }

    fetchCombatLogs();

    // ==========================================
    // COMBAT LOGS WEBSOCKET CONNECTION (Fixes the Offline bug!)
    // ==========================================
    function connectLobbySocket() {
        const lobbySocket = new WebSocket(`ws://localhost:5001/ws/lobby/${loggedInUid}`);
        
        lobbySocket.onopen = () => {
            console.log("Combat Logs socket connected. User is ONLINE.");
        };

        lobbySocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === "challenge_received") {
                const accept = confirm(`SYSTEM PRIORITY: INCOMING CHALLENGE FROM OPERATOR ${data.from_uid}!\n\nAccept match?`);
                lobbySocket.send(JSON.stringify({ type: "challenge_response", from_uid: data.from_uid, accepted: accept }));
                if (accept) { alert("MATCH ACCEPTED. STANDBY FOR ROUTING..."); }
            }

            if (data.type === "challenge_declined") {
                alert("CHALLENGE DECLINED: THE TARGET OPERATOR REJECTED YOUR MATCH.");
            }

            if (data.type === "match_start") {
                window.location.href = `match_arena.html?room=${data.room_id}&symbol=${data.symbol}`;
            }
        };

        lobbySocket.onclose = () => {
            setTimeout(connectLobbySocket, 2000);
        };
    }

    connectLobbySocket();
});