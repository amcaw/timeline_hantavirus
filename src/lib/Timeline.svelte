<script>
    import { onMount } from 'svelte';
    import { initPym, sendHeight } from './pym.js';

    initPym();

    const CSV_URL = import.meta.env.VITE_TIMELINE_CSV_URL;

    let events = $state([]);
    let loading = $state(true);
    let error = $state(null);
    let openCards = $state(new Set());

    function parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) return [];
        const headers = parseCSVLine(lines[0]);
        return lines.slice(1).map(line => {
            const values = parseCSVLine(line);
            const obj = {};
            headers.forEach((h, i) => {
                obj[h.trim()] = (values[i] || '').trim();
            });
            return obj;
        });
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    result.push(current);
                    current = '';
                } else {
                    current += ch;
                }
            }
        }
        result.push(current);
        return result;
    }

    const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const MONTHS_FR_SHORT = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];

    function parseDate(str) {
        if (!str) return null;
        const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return null;
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        if (month < 1 || month > 12) return null;
        return { day, month, year };
    }

    function dayLabel(day) {
        return day === 1 ? '1<sup>er</sup>' : String(day);
    }

    function buildDateDisplay(start, end) {
        if (!start) return { day: '', month: '' };
        if (!end) {
            return { day: dayLabel(start.day), month: MONTHS_FR[start.month - 1] };
        }
        if (start.month === end.month && start.year === end.year) {
            return { day: `${start.day}-${end.day}`, month: MONTHS_FR[start.month - 1] };
        }
        return {
            day: `${start.day} ${MONTHS_FR_SHORT[start.month - 1]} - ${end.day} ${MONTHS_FR_SHORT[end.month - 1]}`,
            month: ''
        };
    }

    let groupedEvents = $derived.by(() => {
        const groups = [];
        let currentLabel = null;
        let currentList = null;
        for (const ev of events) {
            const start = parseDate(ev.Start_date);
            const end = parseDate(ev.End_date);
            const label = start ? `${MONTHS_FR[start.month - 1]} ${start.year}` : '';
            const display = buildDateDisplay(start, end);
            const enriched = {
                ...ev,
                _dayDisplay: display.day,
                _monthDisplay: display.month
            };
            if (label !== currentLabel) {
                currentLabel = label;
                currentList = [];
                groups.push({ label, items: currentList });
            }
            currentList.push(enriched);
        }
        return groups;
    });

    onMount(async () => {
        try {
            const res = await fetch(CSV_URL);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            events = parseCSV(text);
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
            sendHeight();
        }
    });

    function toggleCard(key) {
        const next = new Set(openCards);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        openCards = next;
        setTimeout(() => sendHeight(), 60);
    }

    function dotClass(type) {
        const t = (type || '').toLowerCase();
        if (t === 'death') return 'dot-death';
        if (t === 'case') return 'dot-case';
        if (t === 'departure') return 'dot-departure';
        if (t === 'action') return 'dot-action';
        if (t === 'discovery') return 'dot-discovery';
        return '';
    }

    function tagClass(type) {
        const t = (type || '').toLowerCase();
        if (t === 'death') return 'tag-death';
        if (t === 'case') return 'tag-case';
        if (t === 'departure') return 'tag-departure';
        if (t === 'action') return 'tag-action';
        if (t === 'discovery') return 'tag-discovery';
        return '';
    }
</script>

<div id="my-timeline-container">
    <div class="tl-wrap">
        <div class="tl-header">
            <div class="tl-header-bg"></div>
            <div class="tl-header-content">
                <h1 class="tl-title">Hantavirus sur le <em>Hondius</em> : Comment le virus s'est transmis d'humain à humain</h1>
            </div>
        </div>

        <div class="tl-stats">
            <div class="tl-stat-item"><span class="tl-stat-val">147</span><span class="tl-stat-lab">Personnes à bord</span></div>
            <div class="tl-stat-item"><span class="tl-stat-val">23</span><span class="tl-stat-lab">Nationalités</span></div>
            <div class="tl-stat-item item-red"><span class="tl-stat-val">3</span><span class="tl-stat-lab">Décès</span></div>
        </div>

        <div class="tl-legend">
            <div class="tl-leg-item"><div class="tl-dot dot-departure"></div> Embarquement / Navigation</div>
            <div class="tl-leg-item"><div class="tl-dot dot-death"></div> Décès</div>
            <div class="tl-leg-item"><div class="tl-dot dot-case"></div> Cas confirmés / suspects</div>
            <div class="tl-leg-item"><div class="tl-dot dot-discovery"></div> Identification souche</div>
            <div class="tl-leg-item"><div class="tl-dot dot-action"></div> Actions / Évacuation</div>
        </div>

        {#if loading}
            <div class="loader">
                <div class="loader-dots"><span></span><span></span><span></span></div>
                <p>Chargement de la timeline</p>
            </div>
        {:else if error}
            <p class="state-msg error">Erreur : {error}</p>
        {:else}
            <div class="tl-body">
                <div class="tl-timeline">
                    {#each groupedEvents as group}
                        {#if group.label}
                            <div class="tl-month">
                                <span class="tl-month-label">{group.label}</span>
                                <div class="tl-month-line"></div>
                            </div>
                        {/if}
                        {#each group.items as ev, i (group.label + '-' + i)}
                            {@const key = group.label + '-' + i}
                            {@const open = openCards.has(key)}
                            <div class="tl-event">
                                <div class="tl-event-date" class:tl-event-date-wide={!ev._monthDisplay}>
                                    <span class="date-day">{@html ev._dayDisplay}</span>
                                    {#if ev._monthDisplay}
                                        <span class="date-month">{ev._monthDisplay}</span>
                                    {/if}
                                </div>
                                <div class="tl-event-node">
                                    <div class="tl-dot {dotClass(ev.Type)}"></div>
                                </div>
                                <div class="tl-event-content">
                                    <div class="tl-connector"></div>
                                    <div
                                        class="tl-card"
                                        class:open
                                        onclick={() => toggleCard(key)}
                                        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCard(key); } }}
                                        role="button"
                                        tabindex="0"
                                    >
                                        <div class="tl-card-top">
                                            <div class="tl-card-title">{ev.Title || ''}</div>
                                            <div class="tl-card-right">
                                                {#if ev.Tag_label}
                                                    <span class="tl-tag {tagClass(ev.Type)}">{ev.Tag_label}</span>
                                                {/if}
                                                <span class="tl-toggle">{open ? '−' : '+'}</span>
                                            </div>
                                        </div>
                                        <div class="tl-card-body">
                                            {#if ev.Image_url}
                                                <div class="tl-virus-banner">
                                                    <img class="tl-virus-banner-img" src={ev.Image_url} alt={ev.Title || ''} />
                                                    <div class="tl-virus-banner-overlay"></div>
                                                    {#if ev.Image_caption}
                                                        <span class="tl-virus-caption">{ev.Image_caption}</span>
                                                    {/if}
                                                </div>
                                            {/if}
                                            {ev.Body || ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/each}
                </div>
            </div>
        {/if}

        <div class="tl-footer">
            <span>Sources : OMS · Min. Santé (Argentine, SA)</span>
            <span>Dernière mise à jour : 6 mai 2026</span>
        </div>
    </div>
</div>

<style>
    #my-timeline-container {
        --bg: #ffffff;
        --bg-card: #ffffff;
        --bg-subtle: #f5f5f5;
        --bg-alert: #fff5f4;
        --border: #e0e0e0;
        --border-card: #e8e8e8;
        --text-primary: #111111;
        --text-secondary: #444444;
        --text-muted: #888888;
        --spine: #d8d8d8;
        --red: #c0392b;
        --red-dark: #8b1a10;
        --red-light: #fde8e6;
        --red-border: #e8b4ae;
        --amber: #b45309;
        --amber-light: #fef3cd;
        --blue: #1e4a7a;
        --blue-light: #e8f0f9;
        --green: #1a6640;
        --green-light: #e4f5ec;
        --shadow-card: 0 1px 4px rgba(0,0,0,0.06);
        --shadow-hover: 0 4px 18px rgba(0,0,0,0.11);

        display: block;
        font-family: 'Montserrat', sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
        background: var(--bg);
        max-width: 860px;
        margin: 0 auto;
    }

    @media (prefers-color-scheme: dark) {
        #my-timeline-container {
            --bg: #111111;
            --bg-card: #1c1c1c;
            --bg-subtle: #1f1f1f;
            --bg-alert: #2a1514;
            --border: #2e2e2e;
            --border-card: #2e2e2e;
            --text-primary: #f0f0f0;
            --text-secondary: #b0b0b0;
            --text-muted: #666666;
            --spine: #333333;
            --red: #e05c4e;
            --red-dark: #f08070;
            --red-light: #2a1514;
            --red-border: #5a2520;
            --amber: #e8a040;
            --amber-light: #2a2010;
            --blue: #6ea8de;
            --blue-light: #0f1e30;
            --green: #4caf7d;
            --green-light: #0d2218;
        }
    }

    #my-timeline-container :global(*),
    #my-timeline-container :global(*::before),
    #my-timeline-container :global(*::after) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: 'Montserrat', sans-serif;
    }

    .tl-wrap {
        width: 100%;
        max-width: 860px;
        margin: 0 auto;
        padding: 0 0 48px;
    }

    .tl-header {
        position: relative;
        overflow: hidden;
        padding: 52px 28px 40px;
        min-height: 340px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
    }

    .tl-header-bg {
        position: absolute;
        inset: 0;
        background-image: url('https://static-content.rtbf.be/uploader/image/8/6/4/beta_d2c1138aa13ed9c36611afdcb59d00bb.jpg');
        background-size: cover;
        background-position: center;
        filter: saturate(0.8);
        opacity: 0.4;
        z-index: 0;
    }

    .tl-header-content {
        position: relative;
        z-index: 1;
    }

    .tl-eyebrow {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--red);
        letter-spacing: 0.1em;
        margin-bottom: 8px;
    }

    .tl-title {
        font-size: 28px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.02em;
    }

    .tl-virus-banner {
        display: block;
        width: 100%;
        height: 200px;
        overflow: hidden;
        position: relative;
        margin-bottom: 15px;
        border-radius: 6px;
    }

    .tl-virus-banner-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .tl-virus-banner-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.4));
    }

    .tl-virus-caption {
        position: absolute;
        bottom: 8px;
        right: 12px;
        font-size: 10px;
        color: #fff;
        opacity: 0.8;
    }

    .tl-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        padding: 0 28px;
        margin-top: -24px;
        position: relative;
        z-index: 10;
    }

    .tl-stat-item {
        flex: 1;
        min-width: 140px;
        background: var(--bg-card);
        padding: 16px;
        border-radius: 12px;
        border: 1px solid var(--border-card);
        box-shadow: var(--shadow-card);
    }

    .tl-stat-val {
        font-size: 24px;
        font-weight: 800;
        display: block;
        color: var(--text-primary);
        line-height: 1;
    }

    .tl-stat-lab {
        font-size: 10px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        margin-top: 4px;
        display: block;
    }

    .item-red .tl-stat-val {
        color: var(--red);
    }

    .tl-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
        padding: 24px 28px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary);
    }

    .tl-leg-item {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .tl-body {
        padding: 0 10px;
    }

    .tl-month {
        padding: 32px 0 16px 28px;
        position: relative;
        display: flex;
        align-items: center;
    }

    .tl-month-label {
        font-size: 13px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--text-muted);
    }

    .tl-month-line {
        flex: 1;
        height: 1px;
        background: var(--border);
        margin-left: 12px;
    }

    .tl-timeline {
        position: relative;
    }

    .tl-event {
        display: flex;
        opacity: 1;
        transform: none;
        margin-bottom: 10px;
    }

    .tl-event-date {
        width: 90px;
        flex-shrink: 0;
        padding: 16px 12px 0 0;
        text-align: right;
    }

    .tl-event-date-wide {
        width: 130px;
    }

    .tl-event-date-wide .date-day {
        font-size: 12px;
        font-weight: 700;
        line-height: 1.3;
    }

    .date-day {
        font-size: 18px;
        font-weight: 800;
        line-height: 1;
        display: block;
    }

    .date-month {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-muted);
    }

    .tl-event-node {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        width: 20px;
        padding-top: 18px;
    }

    .tl-dot {
        width: 13px;
        height: 13px;
        border-radius: 50%;
        border: 3px solid var(--spine);
        background: var(--bg);
    }

    .dot-death {
        border-color: var(--red-dark);
        background: var(--red);
    }

    .dot-case {
        border-color: var(--red);
        background: var(--red-light);
    }

    .dot-departure {
        border-color: var(--blue);
        background: var(--blue-light);
    }

    .dot-action {
        border-color: var(--amber);
        background: var(--amber-light);
    }

    .dot-discovery {
        border-color: var(--green);
        background: var(--green-light);
    }

    .tl-event-content {
        flex: 1;
        padding: 10px 0;
        display: flex;
    }

    .tl-connector {
        width: 14px;
        height: 2px;
        background: var(--border);
        margin-top: 14px;
        flex-shrink: 0;
    }

    .tl-card {
        flex: 1;
        background: var(--bg-card);
        border: 1px solid var(--border-card);
        border-radius: 12px;
        padding: 16px;
        cursor: pointer;
        transition: 0.2s;
        box-shadow: var(--shadow-card);
        position: relative;
        overflow: hidden;
    }

    .tl-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-hover);
        border-color: var(--text-muted);
    }

    .tl-card-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
    }

    .tl-card-title {
        font-weight: 700;
        font-size: 15px;
        color: var(--text-primary);
    }

    .tl-card-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    .tl-tag {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .tag-departure {
        background: var(--blue-light);
        color: var(--blue);
    }

    .tag-death {
        background: var(--red-light);
        color: var(--red-dark);
    }

    .tag-case {
        background: var(--red-light);
        color: var(--red);
    }

    .tag-action {
        background: var(--amber-light);
        color: var(--amber);
    }

    .tag-discovery {
        background: var(--green-light);
        color: var(--green);
    }

    .tl-toggle {
        font-size: 16px;
        font-weight: 400;
        color: var(--text-muted);
    }

    .tl-card-body {
        display: none;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
        font-size: 13px;
        color: var(--text-secondary);
    }

    .tl-card.open .tl-card-body {
        display: block;
    }

    .tl-footer {
        margin-top: 36px;
        padding: 24px 28px;
        border-top: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: var(--text-muted);
        text-transform: uppercase;
    }

    .loader {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 48px 0;
    }
    .loader p {
        font-size: 12px;
        margin: 0;
    }
    .loader-dots {
        display: flex;
        gap: 6px;
    }
    .loader-dots span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--text-muted);
        animation: dot-pulse 1.2s ease-in-out infinite;
    }
    .loader-dots span:nth-child(2) { animation-delay: 0.15s; }
    .loader-dots span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes dot-pulse {
        0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
        40% { opacity: 1; transform: scale(1); }
    }

    .state-msg {
        font-size: 13px;
        padding: 24px 28px;
        text-align: center;
    }
    .state-msg.error {
        color: var(--red);
    }

    @media (max-width: 500px) {
        .tl-event-date { width: 60px; }
        .tl-event-node { display: none; }
        .tl-connector { display: none; }
        .tl-card-top { flex-direction: column; }
    }
</style>
