        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

        const firebaseConfig = {
            apiKey: "AIzaSyADfXnmdXjeRbEewPCSrsKMDFXvIjTRsuA",
            authDomain: "protech-d6a95.firebaseapp.com",
            projectId: "protech-d6a95",
            storageBucket: "protech-d6a95.firebasestorage.app",
            messagingSenderId: "869476702981",
            appId: "1:869476702981:web:365d6103fbb1c87602f56c",
            measurementId: "G-VGEF25Q2YT"
        };
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        const functions = getFunctions(app, 'us-central1');
        const appId = firebaseConfig.projectId;

        let currentUser = null;
        let packages = [];
        let vouchers = [];
        let routers = [];
        let activeSessions = [];
        let pppoeUsers = [];
        let hotspotUsers = [];
        let onlinePppoeUsers = [];
        let onlineHotspotUsers = [];
        let onlinePppoeUsernames = new Set();
        let onlineHotspotUsernames = new Set();
        let activeRouterFilter = 'all';
        let activeRouterId = '';
        let routerHealthIntervalId = null;
        let routerHealthBusy = false;
        let liveSessionBusy = false;
        const ROUTER_PING_INTERVAL_MS = 15000;
        let cachedApiToken = '';

        const escapeHtml = (value = '') => String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const escapeRouterScriptString = (value = '') => {
            return String(value)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
        };

        const buildPortalHtml = () => {
            const routerName = escapeHtml(document.getElementById('router-name')?.value || document.getElementById('router-ip').value || 'HotspotPro');
            const ownerId = escapeHtml(currentUser?.uid || '');

            return [
                '<!DOCTYPE html>',
                '<html>',
                '<head>',
                '<meta charset="utf-8">',
                '<meta name="viewport" content="width=device-width,initial-scale=1">',
                `<title>${routerName} Hotspot</title>`,
                '<style>',
                '*{box-sizing:border-box;}',
                ':root{color-scheme:light;--bg-top:#123524;--bg-bottom:#38b000;--card:rgba(248,250,252,.94);--text:#0f172a;--muted:#64748b;--border:rgba(148,163,184,.28);--accent:#16a34a;--accent-2:#2563eb;--accent-3:#9333ea;}',
                'body{margin:0;min-height:100vh;font-family:Arial,sans-serif;color:var(--text);background:radial-gradient(circle at top left,rgba(59,130,246,.32),transparent 28%),radial-gradient(circle at top right,rgba(147,51,234,.28),transparent 24%),linear-gradient(180deg,var(--bg-top),var(--bg-bottom));}',
                '.page{width:min(100%,420px);min-height:100vh;margin:0 auto;padding:18px 14px 28px;}',
                '.hero{position:relative;overflow:hidden;margin-bottom:16px;padding:24px 18px;border:1px solid rgba(255,255,255,.18);border-radius:28px;background:linear-gradient(145deg,rgba(15,23,42,.86),rgba(30,41,59,.76));box-shadow:0 24px 60px rgba(15,23,42,.35);color:#fff;}',
                '.hero::after{content:"";position:absolute;inset:auto -30px -60px auto;width:180px;height:180px;border-radius:999px;background:radial-gradient(circle,rgba(56,189,248,.35),transparent 64%);}',
                '.pill{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(255,255,255,.15);border-radius:999px;background:rgba(255,255,255,.08);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}',
                '.hero-title{margin:16px 0 8px;font-size:27px;line-height:1.1;font-weight:800;}',
                '.hero-sub{margin:0;max-width:280px;color:rgba(255,255,255,.82);font-size:13px;line-height:1.6;}',
                '.grid{display:grid;gap:14px;}',
                '.glass-card{border:1px solid var(--border);border-radius:24px;background:var(--card);backdrop-filter:blur(10px);box-shadow:0 18px 42px rgba(15,23,42,.12);}',
                '.card-body{padding:18px;}',
                '.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}',
                '.section-title{margin:0;font-size:14px;font-weight:800;color:#1e293b;}',
                '.section-tag{padding:5px 10px;border-radius:999px;background:rgba(37,99,235,.1);color:var(--accent-2);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;}',
                '.plan-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}',
                '.plan-card{position:relative;overflow:hidden;min-height:106px;padding:14px 12px;border:1px solid rgba(37,99,235,.12);border-radius:20px;background:linear-gradient(180deg,#ffffff,#eef6ff);box-shadow:inset 0 1px 0 rgba(255,255,255,.9);}',
                '.plan-card::before{content:"";position:absolute;inset:auto -12px -30px auto;width:72px;height:72px;border-radius:999px;background:radial-gradient(circle,rgba(37,99,235,.16),transparent 64%);}',
                '.plan-title{color:#0f172a;font-size:12px;font-weight:800;}',
                '.plan-price{margin-top:10px;color:var(--accent);font-size:28px;line-height:1;font-weight:800;}',
                '.plan-price span{margin-left:2px;color:#94a3b8;font-size:10px;font-weight:700;}',
                '.plan-name{margin-top:10px;color:var(--muted);font-size:11px;line-height:1.35;}',
                '.empty-state{grid-column:1 / -1;padding:18px 14px;border:1px dashed #cbd5e1;border-radius:18px;background:#fff;text-align:center;color:var(--muted);font-size:12px;}',
                '.label{display:block;margin-bottom:7px;color:#334155;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;}',
                '.input-wrap{position:relative;}',
                '.input{width:100%;padding:14px 14px 14px 44px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a;font-size:14px;outline:none;transition:border-color .2s ease,box-shadow .2s ease;}',
                '.input:focus{border-color:var(--accent-2);box-shadow:0 0 0 4px rgba(37,99,235,.12);}',
                '.input-icon{position:absolute;left:15px;top:50%;transform:translateY(-50%);color:#64748b;font-size:14px;font-weight:800;}',
                '.hint{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.55;}',
                '.status{display:none;margin-top:12px;padding:12px 14px;border-radius:14px;font-size:12px;line-height:1.5;font-weight:700;}',
                '.status.show{display:block;}',
                '.status.info{background:#eff6ff;color:#1d4ed8;}',
                '.status.error{background:#fff1f2;color:#be123c;}',
                '.status.success{background:#ecfdf5;color:#15803d;}',
                '.action-btn{width:100%;margin-top:14px;padding:15px 16px;border:none;border-radius:16px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;}',
                '.pay-btn{background:linear-gradient(135deg,#16a34a,#22c55e);box-shadow:0 18px 34px rgba(34,197,94,.24);}',
                '.voucher-btn{background:linear-gradient(135deg,#2563eb,#9333ea);box-shadow:0 18px 34px rgba(99,102,241,.24);}',
                '.access-bar{display:block;margin:16px 0 12px;padding:13px 16px;border-radius:16px;background:linear-gradient(90deg,#3b82f6,#9333ea);color:#fff;font-size:12px;font-weight:800;text-align:center;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;}',
                '.footer-note{text-align:center;margin-top:14px;font-size:11px;color:rgba(255,255,255,.86);}',
                '@media (max-width:360px){.page{padding-left:10px;padding-right:10px;}.plan-grid{grid-template-columns:1fr;}}',
                '</style>',
                '</head>',
                '<body>',
                '<div class="page">',
                '<div class="hero">',
                '<div class="pill">HotspotPro Secure Access</div>',
                '<h1 class="hero-title">Connect faster with voucher or M-Pesa.</h1>',
                '<p class="hero-sub">Live plans sync from your dashboard. Voucher activation checks Firebase first, then opens MikroTik internet access when valid.</p>',
                '</div>',
                '<div class="grid">',
                '<div class="glass-card">',
                '<div class="card-body">',
                '<div class="section-head">',
                '<h2 class="section-title">Short-Term Plans</h2>',
                '<div class="section-tag">Live</div>',
                '</div>',
                '<div class="plan-grid" id="short-term-packages">',
                '<div class="empty-state">Loading packages...</div>',
                '</div>',
                '</div>',
                '</div>',
                '<div class="glass-card">',
                '<div class="card-body">',
                '<div class="section-head">',
                '<h2 class="section-title">Long-Term Plans</h2>',
                '<div class="section-tag">Live</div>',
                '</div>',
                '<div class="plan-grid" id="long-term-packages">',
                '<div class="empty-state">Loading packages...</div>',
                '</div>',
                '</div>',
                '</div>',
                '<div class="glass-card">',
                '<div class="card-body">',
                '<h2 class="section-title">M-Pesa STK Push</h2>',
                '<label class="label">M-Pesa Number</label>',
                '<div class="input-wrap">',
                '<div class="input-icon">+</div>',
                '<input class="input" id="mpesa-number" type="tel" placeholder="e.g. 254712345678">',
                '</div>',
                '<div class="hint">Enter your Safaricom number to receive an M-Pesa STK push. The UI is ready here; actual STK charging still needs your backend or Cloud Function.</div>',
                '<button class="action-btn pay-btn" id="stk-push-btn" type="button">Send STK Push</button>',
                '<div class="status info" id="payment-status"></div>',
                '</div>',
                '</div>',
                '<a class="access-bar" href="#access">Access Your Account</a>',
                '<div class="glass-card" id="access">',
                '<div class="card-body">',
                '<div class="action-title">Redeem Voucher</div>',
                '<form id="voucher-form" action="$(link-login-only)" method="post">',
                '<input type="hidden" name="dst" value="$(link-orig)">',
                '<input type="hidden" name="popup" value="true">',
                '<label class="field-label">Voucher Code</label>',
                '<div class="input-wrap">',
                '<div class="input-icon">#</div>',
                '<input class="input" id="voucher-code" type="text" name="username" placeholder="Enter your voucher">',
                '</div>',
                '<input id="voucher-password" type="hidden" name="password" value="">',
                '<div class="hint">The portal checks Firebase first. If the voucher exists and is active, login continues automatically and internet access opens.</div>',
                '<button class="action-btn voucher-btn" type="submit">Activate Voucher</button>',
                '<div class="status info" id="voucher-status"></div>',
                '</form>',
                '</div>',
                '</div>',
                '</div>',
                '<div class="footer-note">Powered by HotspotPro</div>',
                '<script type="module">',
                'import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";',
                'import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";',
                'import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";',
                `const firebaseConfig=${JSON.stringify(firebaseConfig)};`,
                `const appId=${JSON.stringify(appId)};`,
                `const ownerId=${JSON.stringify(ownerId)};`,
                'const app=initializeApp(firebaseConfig);',
                'const auth=getAuth(app);',
                'const db=getFirestore(app);',
                'const escapeHtml=(value="")=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\'/g,"&#39;");',
                'const shortTermTarget=document.getElementById("short-term-packages");',
                'const longTermTarget=document.getElementById("long-term-packages");',
                'const voucherForm=document.getElementById("voucher-form");',
                'const voucherCodeInput=document.getElementById("voucher-code");',
                'const voucherPasswordInput=document.getElementById("voucher-password");',
                'const voucherStatus=document.getElementById("voucher-status");',
                'const paymentStatus=document.getElementById("payment-status");',
                'const stkPushButton=document.getElementById("stk-push-btn");',
                'const mpesaNumberInput=document.getElementById("mpesa-number");',
                'const setStatus=(element,kind,message)=>{element.className=`status show ${kind}`;element.textContent=message;};',
                'const renderPackages=(target,items)=>{if(!items.length){target.innerHTML=\'<div class="empty-state">No packages available yet.</div>\';return;}target.innerHTML=items.map((pkg)=>{const price=Number(pkg.price||0).toFixed(0);const hours=Number(pkg.durationHours||0);const durationLabel=hours>=24&&hours%24===0?`${hours/24} Day${hours/24===1?"":"s"}`:`${hours} Hour${hours===1?"":"s"}`;const speedLabel=(pkg.downloadSpeed||pkg.uploadSpeed)?` ${pkg.downloadSpeed||0}/${pkg.uploadSpeed||0} Mbps`:\"\";return [`<div class="plan-card">`,`<div class="plan-title">${durationLabel}</div>`,`<div class="plan-price">${price}<span>KSH</span></div>`,`<div class="plan-name">${escapeHtml(pkg.name||"Package")}${speedLabel}</div>`,`</div>`].join("");}).join("");};',
                'const syncPackages=async()=>{if(!ownerId){renderPackages(shortTermTarget,[]);renderPackages(longTermTarget,[]);return;}try{const snapshot=await getDocs(collection(db,"artifacts",appId,"users",ownerId,"packages"));const packages=snapshot.docs.map((docItem)=>({id:docItem.id,...docItem.data()})).filter((pkg)=>(pkg.type||"hotspot")==="hotspot").sort((a,b)=>(a.name||"").localeCompare(b.name||""));renderPackages(shortTermTarget,packages.filter((pkg)=>Number(pkg.durationHours||0)<=24));renderPackages(longTermTarget,packages.filter((pkg)=>Number(pkg.durationHours||0)>24));}catch(error){console.error("Package sync failed:",error);shortTermTarget.innerHTML=\'<div class="empty-state">Could not load packages.</div>\';longTermTarget.innerHTML=\'<div class="empty-state">Could not load packages.</div>\';}};',
                'voucherForm.addEventListener("submit",async(event)=>{event.preventDefault();const voucherCode=voucherCodeInput.value.trim().toUpperCase();if(!voucherCode){setStatus(voucherStatus,"error","Enter your voucher code first.");return;}if(!ownerId){setStatus(voucherStatus,"error","This portal is not linked to a dashboard owner yet.");return;}try{setStatus(voucherStatus,"info","Checking voucher with Firebase...");const voucherQuery=query(collection(db,"artifacts",appId,"users",ownerId,"vouchers"),where("code","==",voucherCode));const voucherSnapshot=await getDocs(voucherQuery);if(voucherSnapshot.empty){setStatus(voucherStatus,"error","Voucher not found. Please check the code and try again.");return;}const voucher=voucherSnapshot.docs[0].data();if((voucher.status||"active")!=="active"){setStatus(voucherStatus,"error",`This voucher is ${voucher.status||"not active"}.`);return;}voucherCodeInput.value=voucherCode;voucherPasswordInput.value=voucherCode;setStatus(voucherStatus,"success","Voucher verified. Opening internet access...");window.setTimeout(()=>voucherForm.submit(),500);}catch(error){console.error("Voucher check failed:",error);setStatus(voucherStatus,"error","Could not verify voucher right now. Please try again.");}});',
                'stkPushButton.addEventListener("click",()=>{const phone=mpesaNumberInput.value.trim();if(!phone){setStatus(paymentStatus,"error","Enter your M-Pesa number first.");return;}setStatus(paymentStatus,"info","STK Push UI is ready. Connect your backend or Firebase Function to trigger the real payment request.");});',
                'try{await signInAnonymously(auth);await syncPackages();window.setInterval(syncPackages,7000);}catch(error){console.error("Firebase auth failed:",error);setStatus(voucherStatus,"error","Firebase authentication failed on the portal.");}',
                '</script>',
                '</body>',
                '</html>'
            ].join('\n');
        };

        const getPortalHtmlForScript = async () => {
            const ownerUid = currentUser?.uid || '';

            try {
                const response = await fetch('./login.html', { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Could not load login.html (${response.status})`);
                }

                const loginHtml = await response.text();
                const ownerScript = `<script>window.HOTSPOTPRO_OWNER_UID=${JSON.stringify(ownerUid)};window.LAROI_OWNER_UID=${JSON.stringify(ownerUid)};</script>`;

                if (loginHtml.includes('</body>')) {
                    return loginHtml.replace('</body>', `${ownerScript}</body>`);
                }

                return loginHtml + ownerScript;
            } catch (error) {
                console.warn('Falling back to embedded portal template:', error);
                return buildPortalHtml();
            }
        };

        const randomCode = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code = '';
            for (let i = 0; i < 8; i += 1) {
                code += chars[Math.floor(Math.random() * chars.length)];
                if (i === 3) code += '-';
            }
            return code;
        };

        const initAuth = async () => {
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error('Firebase auth failed:', error);
                document.getElementById('user-display-name').innerText = 'Auth failed';
                document.getElementById('user-initials').innerText = 'ER';
                document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-red-500";
                document.getElementById('router-status-text').innerText = 'Firebase auth error';
            }
        };
        initAuth();

        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                try {
                    localStorage.setItem('hotspotpro_owner_uid', user.uid);
                } catch (error) {
                    console.warn('Could not store owner uid locally:', error);
                }
                document.getElementById('user-display-name').innerText = user.uid.substring(0, 10) + "...";
                document.getElementById('user-initials').innerText = "AD";
                setupListeners(user.uid);
            }
        });

        function setupListeners(userId) {
            onSnapshot(doc(db, 'artifacts', appId, 'users', userId, 'config', 'mikrotik'), s => {
                if (s.exists()) {
                    const d = s.data();
                    if (!document.getElementById('router-id').value) {
                        document.getElementById('router-name').value = d.name || '';
                        document.getElementById('router-ssid').value = d.ssid || '';
                        document.getElementById('router-ip').value = d.ip || '';
                        document.getElementById('router-port').value = d.port || '8728';
                        document.getElementById('router-user').value = d.username || '';
                        document.getElementById('router-pass').value = d.password || '';
                    }
                    // Only indicate that we have router config saved, not actual network health
                    document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-amber-400";
                    document.getElementById('router-status-text').innerText = (d.name || d.ip || 'Router') + " config loaded (check connection)";
                } else {
                    document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-amber-400";
                    document.getElementById('router-status-text').innerText = "Firebase connected";
                }
            }, error => {
                console.error('Firestore listener failed:', error);
                document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-red-500";
                document.getElementById('router-status-text').innerText = "Firestore error";
            });

            onSnapshot(collection(db, 'artifacts', appId, 'users', userId, 'packages'), snapshot => {
                packages = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                try {
                    localStorage.setItem('hotspotpro_owner_uid', userId);
                    localStorage.setItem('laroi_owner_uid', userId);
                    localStorage.setItem(`hotspotpro_packages_${userId}`, JSON.stringify(packages));
                } catch (error) {
                    console.warn('Could not cache packages locally:', error);
                }
                renderPackages();
                renderPackageOptions();
                
                // Auto-sync packages to all routers when they change
                (async () => {
                    if (typeof triggerRouterSync !== 'function') return;
                    console.log(`[Auto-Sync] Packages changed (${packages.length} total). Syncing to all online routers...`);
                    for (const router of routers.filter(r => (r.status || 'offline') === 'online')) {
                        await triggerRouterSync(router.id);
                    }
                })();
            });

            onSnapshot(collection(db, 'artifacts', appId, 'users', userId, 'vouchers'), snapshot => {
                vouchers = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
                    .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
                renderVouchers();
                
                // Auto-sync vouchers (hotspot users) to all routers when they change
                (async () => {
                    if (typeof triggerRouterSync !== 'function') return;
                    console.log(`[Auto-Sync] Vouchers changed (${vouchers.length} total). Syncing to all online routers...`);
                    for (const router of routers.filter(r => (r.status || 'offline') === 'online')) {
                        await triggerRouterSync(router.id);
                    }
                })();
            });

            onSnapshot(collection(db, 'artifacts', appId, 'users', userId, 'routers'), snapshot => {
                // Save old routers to detect adds/updates
                const oldRouters = [...routers];
                routers = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
                    .sort((a, b) => (a.name || a.ip || '').localeCompare(b.name || b.ip || ''));
                const activeRouter = routers.find((router) => router.id === activeRouterId) || routers.find((router) => (router.status || 'offline') === 'online') || routers[0];
                if (activeRouter) {
                    activeRouterId = activeRouter.id;
                    document.getElementById('user-display-name').innerText = activeRouter.name || activeRouter.ip || document.getElementById('user-display-name').innerText;
                    document.getElementById('user-initials').innerText = (activeRouter.name || activeRouter.ip || 'MT').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
                    document.getElementById('router-status-indicator').className = activeRouter.status === 'online'
                        ? "w-2 h-2 rounded-full bg-green-500 animate-pulse"
                        : "w-2 h-2 rounded-full bg-rose-500";
                    document.getElementById('router-status-text').innerText = `${activeRouter.name || activeRouter.ip || 'Router'} ${activeRouter.status || 'offline'}`;
                }
                renderRouters();
                startContinuousRouterPing();
                
                // Auto-sync when routers are added or updated
                (async () => {
                    if (typeof triggerRouterSync !== 'function') return;
                    for (const router of routers.filter(r => (r.status || 'offline') === 'online')) {
                        const wasAdded = !oldRouters.find(r => r.id === router.id);
                        const wasUpdated = oldRouters.find(r => r.id === router.id && r.updatedAt !== router.updatedAt);
                        if (wasAdded || wasUpdated) {
                            console.log(`[Auto-Sync] Router ${router.name || router.ip} added/updated. Syncing packages...`);
                            await triggerRouterSync(router.id);
                        }
                    }
                })();
            });

            // Auto-sync packages to all routers when packages change or routers are added
            const triggerRouterSync = async (routerId) => {
                try {
                    if (!routerId || !userId) return;
                    // Ensure buildSetupScript is available by checking for the function
                    if (typeof buildSetupScript !== 'function') {
                        console.warn('buildSetupScript not yet available, will retry');
                        return;
                    }
                    const setupScript = await buildSetupScript();
                    await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'sync', 'mikrotik'), {
                        routerId: routerId,
                        script: setupScript,
                        timestamp: Date.now(),
                        updatedAt: Date.now(),
                        trigger: 'dashboard-update'
                    });
                } catch (error) {
                    console.warn('Could not trigger router sync:', error);
                }
            };

            // Listen to active sessions (users with active vouchers)
            onSnapshot(collection(db, 'artifacts', appId, 'users', userId, 'vouchers'), snapshot => {
                const voucherDocs = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));

                activeSessions = voucherDocs
                    .filter(v => v.status === 'active' && v.used === true && (!v.expiresAt || new Date(v.expiresAt) > new Date()))
                    .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

                const totalRevenue = voucherDocs
                    .filter(v => v.used === true)
                    .reduce((sum, voucher) => {
                        const pkg = packages.find(p => p.id === voucher.packageId);
                        return sum + (Number(pkg?.price || 0));
                    }, 0);

                const activeCount = activeSessions.length;
                document.getElementById('stat-users').innerText = activeCount;
                document.getElementById('active-sessions-count').innerText = activeCount;
                document.getElementById('stat-revenue').innerText = `KES ${totalRevenue.toFixed(2)}`;
                renderActiveSessions();
            });

            // Listen to PPPoE users
            onSnapshot(collection(db, 'artifacts', appId, 'users', userId, 'pppoe-users'), snapshot => {
                const packageNameById = new Map(packages.map((pkg) => [pkg.id, pkg.name || '']));
                pppoeUsers = snapshot.docs
                    .map(item => {
                        const data = item.data();
                        const mappedPackageName = packageNameById.get(data.packageId) || data.packageName || '';
                        const mappedProfileName = data.profileName || mappedPackageName || 'default';
                        return { id: item.id, ...data, packageName: mappedPackageName, profileName: mappedProfileName };
                    })
                    .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
                document.getElementById('pppoe-count').innerText = pppoeUsers.length;
                renderPppoeUsers();

                (async () => {
                    for (const user of pppoeUsers) {
                        const expectedPackageName = packageNameById.get(user.packageId) || user.packageName || '';
                        const expectedProfileName = expectedPackageName || 'default';
                        if (user.packageName !== expectedPackageName || user.profileName !== expectedProfileName) {
                            await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'pppoe-users', user.id), {
                                packageName: expectedPackageName,
                                profileName: expectedProfileName,
                                updatedAt: Date.now()
                            });
                        }
                    }
                })().catch((error) => console.warn('Could not auto-assign PPPoE profile names:', error));
                
                // Auto-sync PPPoE users to routers when they change
                (async () => {
                    if (typeof triggerRouterSync !== 'function') return;
                    for (const router of routers.filter(r => (r.status || 'offline') === 'online')) {
                        console.log(`[Auto-Sync PPPoE] Syncing ${pppoeUsers.length} PPPoE users to router ${router.name || router.ip}...`);
                        await triggerRouterSync(router.id);
                    }
                })();
            });

            // Listen to Hotspot users
            onSnapshot(collection(db, 'artifacts', appId, 'users', userId, 'hotspot-users'), snapshot => {
                const packageNameById = new Map(packages.map((pkg) => [pkg.id, pkg.name || '']));
                hotspotUsers = snapshot.docs
                    .map(item => {
                        const data = item.data();
                        const mappedPackageName = packageNameById.get(data.packageId) || data.packageName || '';
                        const mappedProfileName = data.profileName || mappedPackageName || 'default';
                        return { id: item.id, ...data, packageName: mappedPackageName, profileName: mappedProfileName };
                    })
                    .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
                document.getElementById('hotspot-user-count').innerText = hotspotUsers.length;
                renderHotspotUsers();

                (async () => {
                    for (const user of hotspotUsers) {
                        const expectedPackageName = packageNameById.get(user.packageId) || user.packageName || '';
                        const expectedProfileName = expectedPackageName || 'default';
                        if (user.packageName !== expectedPackageName || user.profileName !== expectedProfileName) {
                            await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'hotspot-users', user.id), {
                                packageName: expectedPackageName,
                                profileName: expectedProfileName,
                                updatedAt: Date.now()
                            });
                        }
                    }
                })().catch((error) => console.warn('Could not auto-assign hotspot profile names:', error));

                // Auto-sync Hotspot users to routers when they change
                (async () => {
                    if (typeof triggerRouterSync !== 'function') return;
                    for (const router of routers.filter(r => (r.status || 'offline') === 'online')) {
                        console.log(`[Auto-Sync Hotspot] Syncing ${hotspotUsers.length} hotspot users to router ${router.name || router.ip}...`);
                        await triggerRouterSync(router.id);
                    }
                })();
            });
        }

        function updateRouterBadgeFromPing(router, status) {
            if (!router) return;
            const isOnline = status === 'online';
            const pingTime = new Date().toLocaleTimeString();
            document.getElementById('router-status-indicator').className = isOnline
                ? "w-2 h-2 rounded-full bg-green-500 animate-pulse"
                : "w-2 h-2 rounded-full bg-rose-500";
            document.getElementById('router-status-text').innerText = `${router.name || router.ip || 'Router'} ${isOnline ? 'online' : 'offline'} (last ping ${pingTime})`;
        }

        async function pingRouter(router) {
            if (!currentUser || !router?.id) return { status: 'offline' };
            const response = await fetch(
                `https://us-central1-${appId}.cloudfunctions.net/checkRouterHealth?appId=${appId}&userId=${currentUser.uid}&routerId=${router.id}`,
                { method: 'GET', mode: 'cors' }
            );
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Ping failed ${response.status}: ${text}`);
            }
            const result = await response.json();
            return result;
        }

        const parseRunCommandUsernames = (payload) => {
            const lines = Array.isArray(payload?.result) ? payload.result : [];
            const usernames = [];
            for (const line of lines) {
                const userMatch = String(line || '').match(/=user=([^\s]+)/);
                if (userMatch?.[1]) {
                    usernames.push(userMatch[1]);
                }
            }
            return usernames;
        };

        const runMikrotikApiCommand = async (routerId, command, args = []) => {
            if (!currentUser) throw new Error('User not authenticated');
            const token = await auth.currentUser.getIdToken();
            const response = await fetch(`https://us-central1-${appId}.cloudfunctions.net/runMikrotikCommand`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    appId,
                    userId: currentUser.uid,
                    routerId,
                    command,
                    args
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data?.success === false) {
                throw new Error(data?.error || `Router command failed (${response.status})`);
            }
            return data;
        };

        async function refreshLiveSessionsFromRouter(routerId) {
            if (!routerId || !currentUser || liveSessionBusy) return;
            liveSessionBusy = true;
            try {
                const [pppoeResult, hotspotResult] = await Promise.all([
                    runMikrotikApiCommand(routerId, '/ppp/active/print', ['=.proplist=user,address,uptime']),
                    runMikrotikApiCommand(routerId, '/ip/hotspot/active/print', ['=.proplist=user,address,uptime'])
                ]);

                onlinePppoeUsers = parseRunCommandUsernames(pppoeResult);
                onlineHotspotUsers = parseRunCommandUsernames(hotspotResult);
                onlinePppoeUsernames = new Set(onlinePppoeUsers.map((u) => String(u || '').toLowerCase()));
                onlineHotspotUsernames = new Set(onlineHotspotUsers.map((u) => String(u || '').toLowerCase()));

                renderPppoeUsers();
                renderHotspotUsers();
            } catch (error) {
                console.warn('Could not fetch live PPPoE/Hotspot sessions:', error);
            } finally {
                liveSessionBusy = false;
            }
        }

        async function runContinuousRouterPing() {
            if (routerHealthBusy || !currentUser || routers.length === 0) return;
            routerHealthBusy = true;
            try {
                const activeRouterBeforePing = routers.find((router) => router.id === activeRouterId) || routers[0];
                if (activeRouterBeforePing) {
                    document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-amber-500 animate-pulse";
                    document.getElementById('router-status-text').innerText = `${activeRouterBeforePing.name || activeRouterBeforePing.ip || 'Router'} pinging...`;
                }

                for (const router of routers) {
                    try {
                        const result = await pingRouter(router);
                        router.status = result.status === 'online' ? 'online' : 'offline';
                    } catch (error) {
                        router.status = 'offline';
                        console.warn(`Continuous ping failed for ${router.name || router.ip}:`, error);
                    }
                }

                const activeRouter = routers.find((router) => router.id === activeRouterId) || routers[0];
                if (activeRouter) {
                    updateRouterBadgeFromPing(activeRouter, activeRouter.status || 'offline');
                    if ((activeRouter.status || 'offline') === 'online') {
                        await refreshLiveSessionsFromRouter(activeRouter.id);
                    } else {
                        onlinePppoeUsers = [];
                        onlineHotspotUsers = [];
                        onlinePppoeUsernames = new Set();
                        onlineHotspotUsernames = new Set();
                        renderPppoeUsers();
                        renderHotspotUsers();
                    }
                }
                renderRouters();
            } finally {
                routerHealthBusy = false;
            }
        }

        function startContinuousRouterPing() {
            if (routerHealthIntervalId) {
                clearInterval(routerHealthIntervalId);
            }
            if (!routers.length) {
                document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-slate-400";
                document.getElementById('router-status-text').innerText = 'No router configured';
                return;
            }
            runContinuousRouterPing();
            routerHealthIntervalId = setInterval(runContinuousRouterPing, ROUTER_PING_INTERVAL_MS);
        }

        const renderActiveSessions = () => {
            const list = document.getElementById('active-sessions-list');
            if (!activeSessions.length) {
                list.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400">No active sessions right now.</div>';
                return;
            }
            list.innerHTML = activeSessions.map(session => {
                const pkg = packages.find(p => p.id === session.packageId);
                const duration = session.durationHours || 24;
                const durationLabel = duration >= 24 && duration % 24 === 0 ? `${duration/24} Day${duration/24===1?"":"s"}` : `${duration} Hour${duration===1?"":"s"}`;
                return [
                    '<div class="rounded-2xl border border-slate-200 p-4 bg-emerald-50 flex items-center justify-between">',
                    '<div>',
                    `<h4 class="font-bold text-slate-900">${escapeHtml(session.code || 'User')}</h4>`,
                    `<p class="text-sm text-slate-600">${escapeHtml(pkg ? pkg.name : 'Package')} · ${durationLabel}</p>`,
                    '</div>',
                    '<div class="flex items-center gap-2">',
                    '<div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>',
                    '<span class="text-xs font-bold text-emerald-700">Online</span>',
                    '</div>',
                    '</div>'
                ].join('');
            }).join('');
        };

        const renderPppoeUsers = () => {
            const list = document.getElementById('pppoe-list');
            const countEl = document.getElementById('pppoe-count');
            if (countEl) {
                countEl.innerText = `${onlinePppoeUsers.length}/${pppoeUsers.length}`;
            }
            if (!pppoeUsers.length) {
                list.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400">No PPPoE users yet.</div>';
                return;
            }
            const pppoeActiveUsernames = onlinePppoeUsernames;

            list.innerHTML = pppoeUsers.map(user => {
                const now = new Date();
                const expiresAt = user.expiresAt ? new Date(user.expiresAt) : null;
                const isUserExpired = expiresAt && expiresAt <= now;
                const isOnline = pppoeActiveUsernames.has(String(user.username || '').toLowerCase()) && !isUserExpired && (user.status || 'active') === 'active';

                let status = 'offline';
                let statusClass = 'slate';

                if (isUserExpired) {
                    status = 'expired';
                    statusClass = 'rose';
                } else if (isOnline) {
                    status = 'online';
                    statusClass = 'emerald';
                } else if ((user.status || 'active') === 'active') {
                    status = 'idle';
                    statusClass = 'amber';
                } else {
                    status = 'offline';
                    statusClass = 'slate';
                }

                return [
                    '<div class="rounded-2xl border border-slate-200 p-5 flex items-center justify-between hover:bg-slate-50 transition">',
                    '<div>',
                    `<h4 class="font-bold text-slate-900">${escapeHtml(user.username || 'PPPoE User')}</h4>`,
                    `<p class="text-sm text-slate-500">${escapeHtml(user.name || 'No name')} · ${escapeHtml(user.packageName || 'No package')} · Profile ${escapeHtml(user.profileName || user.packageName || 'default')} · Created ${new Date(user.createdAt || 0).toLocaleDateString()}</p>`,
                    `<p class="text-xs font-bold uppercase tracking-wider text-${statusClass}-600">${status.toUpperCase()}${expiresAt ? ` · Expires ${expiresAt.toLocaleString()}` : ''}</p>`,
                    '</div>',
                    '<div class="flex gap-2">',
                    `<button type="button" onclick="editPppoeUser('${user.id}')" class="px-3 py-1.5 text-sm rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition">Edit</button>`,
                    `<button type="button" onclick="removePppoeUser('${user.id}')" class="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-600 font-bold hover:bg-red-100 transition">Delete</button>`,
                    `${status === 'online' ? `<button type="button" onclick="terminatePppoeUser('${user.id}')" class="px-3 py-1.5 text-sm rounded-lg bg-amber-50 text-amber-700 font-bold hover:bg-amber-100 transition">Terminate</button>` : `<button type="button" onclick="reconnectPppoeUser('${user.id}')" class="px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition">Reconnect</button>`}`,
                    '</div>',
                    '</div>'
                ].join('');
            }).join('');
        };

        const resetPackageForm = () => {
            document.getElementById('package-form').reset();
            document.getElementById('package-id').value = '';
            document.getElementById('package-expires-at').value = '';
            document.getElementById('package-duration').value = '';
            document.getElementById('package-duration-unit').value = 'hours';
            document.getElementById('package-type').value = 'hotspot';
            document.getElementById('package-submit-btn').innerText = 'Save Package';
            togglePackageDurationFields();
        };

        const resetVoucherForm = () => {
            document.getElementById('voucher-form').reset();
            document.getElementById('voucher-id').value = '';
            document.getElementById('voucher-code').value = randomCode();
            document.getElementById('voucher-username').value = '';
            document.getElementById('voucher-password').value = '';
            document.getElementById('voucher-status').value = 'active';
            document.getElementById('voucher-submit-btn').innerText = 'Save Voucher';
        };

        const resetRouterForm = () => {
            document.getElementById('router-config-form').reset();
            document.getElementById('router-id').value = '';
            document.getElementById('router-name').value = '';
            document.getElementById('router-ssid').value = '';
            document.getElementById('router-ip').value = '';
            document.getElementById('router-port').value = '8728';
            document.getElementById('router-winbox-port').value = '8291';
            document.getElementById('router-webfig-protocol').value = 'https';
            document.getElementById('router-webfig-port').value = '8081';
            document.getElementById('router-user').value = '';
            document.getElementById('router-pass').value = '';
            document.getElementById('save-router-btn').innerHTML = '<i class="fas fa-save"></i> Save & Test Link';
        };

        const resetPppoeForm = () => {
            document.getElementById('pppoe-form').reset();
            document.getElementById('pppoe-id').value = '';
            document.getElementById('pppoe-expires-at').value = '';
            document.getElementById('pppoe-status').value = 'active';
            document.getElementById('pppoe-submit-btn').innerText = 'Save PPPoE User';
        };

        const renderHotspotUsers = () => {
            const list = document.getElementById('hotspot-user-list');
            const countEl = document.getElementById('hotspot-user-count');
            if (countEl) {
                countEl.innerText = `${onlineHotspotUsers.length}/${hotspotUsers.length}`;
            }
            if (!hotspotUsers.length) {
                list.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400">No hotspot users yet.</div>';
                return;
            }
            list.innerHTML = hotspotUsers.map(user => {
                const isOnline = onlineHotspotUsernames.has(String(user.username || '').toLowerCase()) && (user.status || 'active') === 'active';
                const statusLabel = isOnline ? 'online' : ((user.status || 'active') === 'active' ? 'idle' : 'disabled');
                const statusClass = isOnline ? 'emerald' : ((user.status || 'active') === 'active' ? 'amber' : 'slate');

                return [
                    '<div class="rounded-2xl border border-slate-200 p-5 flex items-center justify-between hover:bg-slate-50 transition">',
                    '<div>',
                    `<h4 class="font-bold text-slate-900">${escapeHtml(user.username || 'Hotspot User')}</h4>`,
                    `<p class="text-sm text-slate-500">${escapeHtml(user.status || 'active')} · ${escapeHtml(user.packageName || 'No package')} · Profile ${escapeHtml(user.profileName || user.packageName || 'default')} · Created ${new Date(user.createdAt || 0).toLocaleDateString()}</p>`,
                    `<p class="text-xs font-bold uppercase tracking-wider text-${statusClass}-600">${statusLabel.toUpperCase()}</p>`,
                    '</div>',
                    '<div class="flex gap-2">',
                    `<button type="button" onclick="editHotspotUser('${user.id}')" class="px-3 py-1.5 text-sm rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition">Edit</button>`,
                    `<button type="button" onclick="removeHotspotUser('${user.id}')" class="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-600 font-bold hover:bg-red-100 transition">Delete</button>`,
                    '</div>',
                    '</div>'
                ].join('');
            }).join('');
        };

        const resetHotspotUserForm = () => {
            document.getElementById('hotspot-user-form').reset();
            document.getElementById('hotspot-user-id').value = '';
            document.getElementById('hotspot-user-status').value = 'active';
            document.getElementById('hotspot-user-submit-btn').innerText = 'Save Hotspot User';
        };

        const applyRouterToForm = (router) => {
            document.getElementById('router-id').value = router.id || '';
            document.getElementById('router-name').value = router.name || '';
            document.getElementById('router-ssid').value = router.ssid || '';
            document.getElementById('router-ip').value = router.ip || '';
            document.getElementById('router-port').value = router.port || '8728';
            document.getElementById('router-user').value = router.username || '';
            document.getElementById('router-pass').value = router.password || '';
            document.getElementById('router-winbox-port').value = router.winboxPort || '8291';
            document.getElementById('router-webfig-protocol').value = router.webfigProtocol || 'https';
            document.getElementById('router-webfig-port').value = router.webfigPort || '8081';
            document.getElementById('save-router-btn').innerHTML = '<i class="fas fa-save"></i> Update Router';
        };

        const getVisibleRouters = () => {
            const query = (document.getElementById('router-search')?.value || '').trim().toLowerCase();
            return routers.filter((router) => {
                const status = router.status || 'offline';
                const matchesFilter = activeRouterFilter === 'all' || status === activeRouterFilter;
                const haystack = [router.name, router.ssid, router.ip, router.username].join(' ').toLowerCase();
                const matchesSearch = !query || haystack.includes(query);
                return matchesFilter && matchesSearch;
            });
        };

        window.loginToMikrotik = async (routerId) => {
            if (!currentUser || !routerId) return;
            const router = routers.find(r => r.id === routerId);
            if (!router) {
                alert('Router not found.');
                return;
            }

            try {
                document.getElementById('router-status-text').innerText = `${router.name || router.ip} logging in...`;
                const healthUrl = `https://us-central1-${appId}.cloudfunctions.net/checkRouterHealth?appId=${appId}&userId=${currentUser.uid}&routerId=${routerId}`;
                const response = await fetch(healthUrl, {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'omit',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                const result = await response.json();
                if (result.status === 'online') {
                    document.getElementById('router-status-indicator').className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse';
                    document.getElementById('router-status-text').innerText = `${router.name || router.ip} online`;
                    await refreshLiveSessionsFromRouter(routerId);
                } else {
                    document.getElementById('router-status-indicator').className = 'w-2 h-2 rounded-full bg-rose-500';
                    document.getElementById('router-status-text').innerText = `${router.name || router.ip} offline`; 
                }
                if (typeof triggerRouterSync === 'function') {
                    await triggerRouterSync(routerId);
                }
                alert(`Router ${router.name || router.ip} is ${result.status}. Sync triggered.`);
            } catch (error) {
                console.error('Login and sync failed:', error);

                let userMessage = `Could not login/sync router: ${error.message || error}`;
                if (error.message && error.message.includes('Failed to fetch')) {
                    userMessage += ' (Check Cloud Function deployment / network / CORS. Open https://us-central1-' + appId + '.cloudfunctions.net/checkRouterHealth in browser to verify.)';
                }

                alert(userMessage);
                document.getElementById('router-status-indicator').className = 'w-2 h-2 rounded-full bg-rose-500';
                document.getElementById('router-status-text').innerText = `${router.name || router.ip} login failed`;
            }
        };

        const renderRouters = () => {
            const list = document.getElementById('routers-list');
            if (!list) return;

            const onlineCount = routers.filter((router) => (router.status || 'offline') === 'online').length;
            const offlineCount = routers.length - onlineCount;
            document.getElementById('routers-count-all').innerText = routers.length;
            document.getElementById('routers-count-online').innerText = onlineCount;
            document.getElementById('routers-count-offline').innerText = offlineCount;

            document.querySelectorAll('.router-filter-btn').forEach((button) => {
                const isActive = button.dataset.routerFilter === activeRouterFilter;
                button.classList.toggle('ring-2', isActive);
                button.classList.toggle('ring-slate-200', isActive);
            });

            const visibleRouters = getVisibleRouters();
            if (!visibleRouters.length) {
                list.innerHTML = '<tr><td colspan="6" class="px-5 py-10 text-center text-slate-400">No MikroTik routers found for this filter yet.</td></tr>';
                return;
            }

            list.innerHTML = visibleRouters.map((router) => {
                const status = router.status || 'offline';
                const statusClass = status === 'online'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200';
                const routerName = escapeHtml(router.name || router.ip || 'Unnamed Router');
                const ssid = escapeHtml(router.ssid || 'Not set');
                const username = escapeHtml(router.username || '-');
                const remote = escapeHtml(router.remoteWinbox || `${router.ip || '-'}:${router.port || '8728'}`);
                return [
                    '<tr class="hover:bg-slate-50 transition">',
                    `<td class="px-5 py-4 font-bold text-slate-900">${routerName}</td>`,
                    `<td class="px-5 py-4 text-slate-600">${ssid}</td>`,
                    `<td class="px-5 py-4 text-slate-600">${username}</td>`,
                    `<td class="px-5 py-4 text-blue-600">${remote}</td>`,
                    `<td class="px-5 py-4"><span class="inline-flex px-3 py-1 rounded-full border text-xs font-bold ${statusClass}">${escapeHtml(status)}</span></td>`,
                    '<td class="px-5 py-4 text-right">',
                    `<div class="flex justify-end gap-2 flex-wrap">
                        <button type="button" onclick="checkRouterHealth('${router.id}')" class="px-3 py-2 text-xs rounded-lg bg-blue-50 text-blue-600 font-bold hover:bg-blue-100 transition">Check Status</button>
                        <button type="button" onclick="loginToMikrotik('${router.id}')" class="px-3 py-2 text-xs rounded-lg bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100 transition">Login & Sync</button>
                        <button type="button" onclick="editRouter('${router.id}')" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">Edit</button>
                        <button type="button" onclick="toggleRouterStatus('${router.id}')" class="px-4 py-2 rounded-xl bg-amber-50 text-amber-700 font-bold">${status === 'online' ? 'Mark Offline' : 'Mark Online'}</button>
                        <button type="button" onclick="removeRouter('${router.id}')" class="px-4 py-2 rounded-xl bg-red-50 text-red-600 font-bold">Delete</button>
                    </div>`,
                    '</td>',
                    '</tr>'
                ].join('');
            }).join('');
        };

        const renderPackages = () => {
            const list = document.getElementById('packages-list');
            document.getElementById('packages-count').innerText = packages.length;
            if (!packages.length) {
                list.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400">No packages yet.</div>';
                return;
            }
            list.innerHTML = packages.map(pkg => {
                const durationText = (pkg.type || 'hotspot') === 'pppoe'
                    ? 'No duration (PPPoE managed per user)'
                    : `${Number((pkg.durationMinutes || 0) / 60).toFixed(0)} hrs`;

                return [
                    '<div class="rounded-2xl border border-slate-200 p-5">',
                    '<div class="flex items-center justify-between gap-4">',
                    '<div>',
                    `<h4 class="text-lg font-bold text-slate-900">${escapeHtml(pkg.name)}</h4>`,
                    `<p class="text-sm text-slate-500">KES ${Number(pkg.price || 0).toFixed(2)} | ${durationText} | ${escapeHtml((pkg.type || 'hotspot').toUpperCase())} | ${pkg.downloadSpeed || 0}/${pkg.uploadSpeed || 0} Mbps</p>`,
                    '</div>',
                    '<div class="flex gap-2">',
                    `<button type="button" onclick="editPackage('${pkg.id}')" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">Edit</button>`,
                    `<button type="button" onclick="removePackage('${pkg.id}')" class="px-4 py-2 rounded-xl bg-red-50 text-red-600 font-bold">Delete</button>`,
                    '</div>',
                    '</div>',
                    '</div>'
                ].join('');
            }).join('');
        };

        const renderPackageOptions = () => {
            const voucherSelect = document.getElementById('voucher-package');
            const hotspotSelect = document.getElementById('hotspot-user-package');
            const pppoeSelect = document.getElementById('pppoe-package');
            if (!packages.length) {
                if (voucherSelect) voucherSelect.innerHTML = '<option value="">Create a package first</option>';
                if (hotspotSelect) hotspotSelect.innerHTML = '<option value="">Create a package first</option>';
                if (pppoeSelect) pppoeSelect.innerHTML = '<option value="">Create a package first</option>';
                if (voucherSelect) voucherSelect.disabled = true;
                if (hotspotSelect) hotspotSelect.disabled = true;
                if (pppoeSelect) pppoeSelect.disabled = true;
                return;
            }
            const hotspotPackages = packages.filter(p => (p.type || 'hotspot') === 'hotspot');
            const pppoePackages = packages.filter(p => p.type === 'pppoe');
            const allPackages = packages;

            const voucherOptions = allPackages.map(pkg =>
                `<option value="${pkg.id}">${escapeHtml(pkg.name)} - KES ${Number(pkg.price || 0).toFixed(2)}</option>`
            ).join('');
            const hotspotOptions = hotspotPackages.map(pkg =>
                `<option value="${pkg.id}">${escapeHtml(pkg.name)} - KES ${Number(pkg.price || 0).toFixed(2)}</option>`
            ).join('');
            const pppoeOptions = pppoePackages.map(pkg =>
                `<option value="${pkg.id}">${escapeHtml(pkg.name)} - KES ${Number(pkg.price || 0).toFixed(2)}</option>`
            ).join('');

            if (voucherSelect) {
                voucherSelect.disabled = false;
                voucherSelect.innerHTML = voucherOptions;
            }
            if (hotspotSelect) {
                hotspotSelect.disabled = false;
                hotspotSelect.innerHTML = hotspotOptions;
            }
            if (pppoeSelect) {
                pppoeSelect.disabled = false;
                pppoeSelect.innerHTML = pppoeOptions;
            }
        };

        const renderVouchers = () => {
            const list = document.getElementById('vouchers-list');
            document.getElementById('vouchers-count').innerText = vouchers.length;
            if (!vouchers.length) {
                list.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400">No vouchers yet.</div>';
                return;
            }
            list.innerHTML = vouchers.map(voucher => {
                const pkg = packages.find(item => item.id === voucher.packageId);
                return [
                    '<div class="rounded-2xl border border-slate-200 p-5">',
                    '<div class="flex items-center justify-between gap-4">',
                    '<div>',
                    `<h4 class="text-lg font-black text-slate-900">${escapeHtml(voucher.code)}</h4>`,
                    `<p class="text-sm text-slate-500">${escapeHtml(pkg ? pkg.name : 'No package')} | ${escapeHtml(voucher.status || 'active')}</p>`,
                    '</div>',
                    '<div class="flex gap-2">',
                    `<button type="button" onclick="editVoucher('${voucher.id}')" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">Edit</button>`,
                    `<button type="button" onclick="removeVoucher('${voucher.id}')" class="px-4 py-2 rounded-xl bg-red-50 text-red-600 font-bold">Delete</button>`,
                    '</div>',
                    '</div>',
                    '</div>'
                ].join('');
            }).join('');
        };

        const rosIfMissing = (findExpr, addCommand, label) => [
            `:if ([:len [${findExpr}]] = 0) do={`,
            `    ${addCommand}`,
            `    /log info "HotspotPro: added ${label}"`,
            `} else={`,
            `    /log info "HotspotPro: ${label} already added"`,
            `}`
        ];

        const rosIfExistsSet = (findExpr, setCommand, label) => [
            `:if ([:len [${findExpr}]] > 0) do={`,
            `    ${setCommand}`,
            `    /log info "HotspotPro: updated ${label}"`,
            `} else={`,
            `    /log info "HotspotPro: ${label} missing, skipped update"`,
            `}`
        ];

        const callAuthedHttpFunction = async (name, payload = {}) => {
            if (!auth.currentUser) {
                throw new Error('User not authenticated');
            }
            const token = await auth.currentUser.getIdToken();
            const endpoints = [
                `/api/${name}`,
                `https://us-central1-${appId}.cloudfunctions.net/${name}`
            ];

            let lastError = null;
            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        mode: 'cors',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok || data?.success === false) {
                        throw new Error(data?.error || `HTTP ${response.status}`);
                    }
                    return data;
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError || new Error(`Could not reach API endpoint: ${name}`);
        };

        const ensureApiUserTokenForScript = async () => {
            if (cachedApiToken) {
                return cachedApiToken;
            }

            let token = '';
            try {
                const bootstrap = await callAuthedHttpFunction('ensureApiUserAndToken');
                token = String(bootstrap?.token || '');
            } catch (bootstrapError) {
                console.warn('ensureApiUserAndToken failed, falling back:', bootstrapError);
                let apiUserResult = await callAuthedHttpFunction('getApiUser');
                if (!apiUserResult?.apiUser) {
                    await callAuthedHttpFunction('createApiUser');
                    apiUserResult = await callAuthedHttpFunction('getApiUser');
                }
                if (!apiUserResult?.apiUser) {
                    throw new Error('API user creation failed');
                }
                const tokenResult = await callAuthedHttpFunction('generateApiToken');
                token = String(tokenResult?.token || '');
            }

            if (!token) {
                throw new Error('Could not generate API token');
            }

            cachedApiToken = token;
            return token;
        };

        const formatRosDuration = (minutesValue) => {
            const totalMinutes = Math.max(1, Math.ceil(Number(minutesValue || 0)));
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            if (hours > 0 && minutes > 0) return `${hours}h${minutes}m`;
            if (hours > 0) return `${hours}h`;
            return `${minutes}m`;
        };

        const formatHotspotRateLimit = (downloadMbps, uploadMbps) => {
            const down = Number(downloadMbps || 0);
            const up = Number(uploadMbps || 0);
            if (down <= 0 || up <= 0) return '';
            return `${down}M/${up}M`;
        };

        const buildSetupScript = async () => {
            let apiTokenForUpload = '';
            try {
                apiTokenForUpload = await ensureApiUserTokenForScript();
            } catch (error) {
                console.warn('Could not auto-create API token for script:', error);
            }

            const apiTokenEscaped = escapeRouterScriptString(apiTokenForUpload || '');
            const ownerSeedRaw = String(currentUser?.uid || 'owner').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'owner';
            const apiScriptUsername = escapeRouterScriptString(`hotspotpro-${ownerSeedRaw}`);
            const apiScriptPassword = escapeRouterScriptString(`Hp@${ownerSeedRaw}2026`);
            const apiGroupName = escapeRouterScriptString('hotspotpro-api');
            const portalHtml = escapeRouterScriptString(await getPortalHtmlForScript());
            const aloginHtml = escapeRouterScriptString('<html><head><meta http-equiv="refresh" content="0; url=login.html"></head><body></body></html>');
            const statusHtml = escapeRouterScriptString('<html><head><meta http-equiv="refresh" content="4; url=https://www.google.com"></head><body style="font-family:Arial,sans-serif;text-align:center;padding:40px;background:#f8fafc;"><h2>Connected</h2><p>Your internet access is active.</p><p>Redirecting to Google in a few seconds...</p><p><a href="https://www.google.com">Open Google now</a></p><p><a href="$(link-logout)">Log out</a></p></body></html>');
            const errorHtml = escapeRouterScriptString('<html><body style="font-family:Arial,sans-serif;text-align:center;padding:40px;background:#fff7ed;"><h2>Login failed</h2><p>Please try your voucher again.</p><p><a href="$(link-login)">Back to login</a></p></body></html>');
            const ssid = escapeRouterScriptString(document.getElementById('router-ssid').value.trim() || 'Lait Automatically');
            const hotspotPackages = packages.filter(p => (p.type || 'hotspot') === 'hotspot');
            const pppoePackages = packages.filter(p => p.type === 'pppoe');
            const hotspotProfiles = hotspotPackages.flatMap((pkg) => {
                const profileName = escapeRouterScriptString(String(pkg.name || 'Package'));
                const sharedUsers = '1';
                const durationMinutes = Number(pkg.durationMinutes || (pkg.durationHours ? pkg.durationHours * 60 : 1440));
                const sessionTimeout = formatRosDuration(durationMinutes);
                const downloadSpeed = Number(pkg.downloadSpeed || 0);
                const uploadSpeed = Number(pkg.uploadSpeed || 0);
                const rateLimit = formatHotspotRateLimit(downloadSpeed, uploadSpeed);
                const rateLimitParam = rateLimit ? ` rate-limit=${rateLimit}` : '';
                return [
                    ...rosIfMissing(`find name="${profileName}"`, `add name="${profileName}" shared-users=${sharedUsers} session-timeout=${sessionTimeout}${rateLimitParam}`, `profile ${profileName}`),
                    ...rosIfExistsSet(`find name="${profileName}"`, `set [find name="${profileName}"] shared-users=${sharedUsers} session-timeout=${sessionTimeout}${rateLimitParam}`, `profile ${profileName}`)
                ];
            });
            const pppoeProfiles = pppoePackages.flatMap((pkg) => {
                const profileName = escapeRouterScriptString(String(pkg.name || 'Package'));
                const downloadSpeed = Number(pkg.downloadSpeed || 0);
                const uploadSpeed = Number(pkg.uploadSpeed || 0);
                const rateLimit = downloadSpeed > 0 && uploadSpeed > 0 ? `${downloadSpeed}M/${uploadSpeed}M` : '';
                const rateLimitParam = rateLimit ? ` rate-limit=${rateLimit}` : '';
                return [
                    ...rosIfMissing(`find name="${profileName}"`, `add name="${profileName}"${rateLimitParam}`, `PPP profile ${profileName}`),
                    ...rosIfExistsSet(`find name="${profileName}"`, `set [find name="${profileName}"]${rateLimitParam}`, `PPP profile ${profileName}`)
                ];
            });

            const pppoeServerConfig = pppoePackages.length > 0 ? [
                ...rosIfMissing('find service=pppoe', 'add service=pppoe interface=ether2 profile=default max-mtu=1480 max-mru=1480', 'PPPoE server'),
                ...rosIfExistsSet('find service=pppoe', 'set [find service=pppoe] interface=ether2 profile=default max-mtu=1480 max-mru=1480', 'PPPoE server')
            ] : [];
            const voucherUsers = vouchers.flatMap((voucher) => {
                const relatedPackage = packages.find((pkg) => pkg.id === voucher.packageId);
                const username = escapeRouterScriptString(String(voucher.username || voucher.code || 'voucher'));
                const password = escapeRouterScriptString(String(voucher.password || voucher.code || 'voucher'));
                const profileName = escapeRouterScriptString(String((relatedPackage && relatedPackage.name) || 'default'));
                const comment = escapeRouterScriptString(`Voucher ${voucher.code || ''} | ${(voucher.status || 'active')}`);
                const isVoucherActive = (voucher.status || 'active') === 'active' && (!voucher.expiresAt || new Date(voucher.expiresAt) > new Date());

                if (isVoucherActive) {
                    return [
                        ...rosIfMissing(`find name="${username}"`, `add name="${username}" password="${password}" profile="${profileName}" server=hotspot1 comment="${comment}" disabled=no`, `voucher ${username}`),
                        ...rosIfExistsSet(`find name="${username}"`, `set [find name="${username}"] password="${password}" profile="${profileName}" comment="${comment}" disabled=no`, `voucher ${username}`)
                    ];
                }

                // Expired or inactive voucher: disable on router
                return [
                    ...rosIfExistsSet(`find name="${username}"`, `set [find name="${username}"] disabled=yes comment="${comment}"`, `disabled voucher ${username}`)
                ];
            });
            const hotspotAccounts = hotspotUsers.flatMap((user) => {
                const username = escapeRouterScriptString(String(user.username || 'hotspot'));
                const password = escapeRouterScriptString(String(user.password || 'password'));
                const profileName = escapeRouterScriptString(String(user.profileName || (packages.find(p => p.id === user.packageId)?.name) || 'default'));
                const comment = escapeRouterScriptString(`Hotspot ${user.username || ''} | ${(user.status || 'active')}`);

                if ((user.status || 'active') === 'active') {
                    return [
                        ...rosIfMissing(`find name="${username}"`, `add name="${username}" password="${password}" profile="${profileName}" server=hotspot1 comment="${comment}" disabled=no`, `hotspot ${username}`),
                        ...rosIfExistsSet(`find name="${username}"`, `set [find name="${username}"] password="${password}" profile="${profileName}" comment="${comment}" disabled=no`, `hotspot ${username}`)
                    ];
                }

                return [
                    ...rosIfExistsSet(`find name="${username}"`, `set [find name="${username}"] disabled=yes comment="${comment}"`, `disable hotspot ${username}`)
                ];
            });

            const pppoeAccounts = pppoeUsers.flatMap((user) => {
                const username = escapeRouterScriptString(String(user.username || 'pppoe'));
                const password = escapeRouterScriptString(String(user.password || 'password'));
                const relatedPackage = packages.find(p => p.id === user.packageId);
                const profileName = escapeRouterScriptString(String(user.profileName || (relatedPackage && relatedPackage.name) || 'default'));
                const comment = escapeRouterScriptString(`PPPoE User ${user.username || ''} | ${user.name || 'No name'}`);
                const now = new Date();
                const expiresAt = user.expiresAt ? new Date(user.expiresAt) : null;
                const userExpired = expiresAt ? (expiresAt <= now) : false;

                if ((user.status || 'active') === 'active' && !userExpired) {
                    const expiresParam = expiresAt ? ` expires=${expiresAt.toISOString()}` : '';
                    return [
                        ...rosIfMissing(`find name="${username}"`, `add name="${username}" password="${password}" service=pppoe profile="${profileName}" comment="${comment}"${expiresParam} disabled=no`, `PPPoE ${username}`),
                        ...rosIfExistsSet(`find name="${username}"`, `set [find name="${username}"] password="${password}" service=pppoe profile="${profileName}" comment="${comment}"${expiresParam} disabled=no`, `PPPoE ${username}`)
                    ];
                }

                return [
                    ...rosIfExistsSet(`find name="${username}"`, `set [find name="${username}"] disabled=yes comment="${comment} (disabled/expired)"`, `disable PPPoE ${username}`)
                ];
            });

            return [
                '# tech.rsc',
                '# HotspotPro MikroTik Setup Script',
                '# Version: 1.3.0',
                ...(apiTokenForUpload
                    ? [
                        '# Auto-created API token (for upload-script.html)',
                        `# API_TOKEN=${apiTokenEscaped}`
                    ]
                    : [
                        '# API token auto-create failed (open API User page to generate)'
                    ]),
                '# Auto-generated RouterOS API user credentials',
                `# ROUTER_API_USER=${apiScriptUsername}`,
                `# ROUTER_API_PASS=${apiScriptPassword}`,
                '',
                '/interface bridge',
                ...rosIfMissing('find name="bridge-hotspot"', 'add name=bridge-hotspot comment="HotspotPro Main Bridge"', 'bridge-hotspot'),
                '',
                '/interface bridge port',
                ...rosIfMissing('find bridge=bridge-hotspot interface=ether2', 'add bridge=bridge-hotspot interface=ether2', 'bridge port ether2'),
                ...rosIfMissing('find bridge=bridge-hotspot interface=ether3', 'add bridge=bridge-hotspot interface=ether3', 'bridge port ether3'),
                ...rosIfMissing('find bridge=bridge-hotspot interface=ether4', 'add bridge=bridge-hotspot interface=ether4', 'bridge port ether4'),
                ...rosIfMissing('find bridge=bridge-hotspot interface=ether5', 'add bridge=bridge-hotspot interface=ether5', 'bridge port ether5'),
                '',
                '/ip address',
                ...rosIfMissing('find address="10.5.50.1/24" interface="bridge-hotspot"', 'add address=10.5.50.1/24 interface=bridge-hotspot network=10.5.50.0', 'hotspot address'),
                '',
                '/ip pool',
                ...rosIfMissing('find name="hs-pool-1"', 'add name=hs-pool-1 ranges=10.5.50.2-10.5.50.254', 'pool hs-pool-1'),
                '',
                '/ip dhcp-server',
                ...rosIfMissing('find name="dhcp-hs"', 'add address-pool=hs-pool-1 disabled=no interface=bridge-hotspot name=dhcp-hs', 'dhcp server dhcp-hs'),
                '',
                '/ip dhcp-server network',
                ...rosIfMissing('find address="10.5.50.0/24"', 'add address=10.5.50.0/24 gateway=10.5.50.1 dns-server=8.8.8.8,8.8.4.4', 'dhcp network 10.5.50.0/24'),
                '',
                '/interface wireless',
                `set [ find default-name=wlan1 ] mode=ap-bridge ssid="${ssid}" disabled=no`,
                '',
                '/ip hotspot profile',
                ...rosIfMissing('find name="hsprof1"', 'add hotspot-address=10.5.50.1 login-by=http-chap,http-pap mac-authentication=yes name=hsprof1 html-directory=hotspot', 'hotspot profile hsprof1'),
                ...rosIfExistsSet('find name="hsprof1"', 'set [find name="hsprof1"] html-directory=hotspot login-by=http-chap,http-pap mac-authentication=yes hotspot-address=10.5.50.1', 'hotspot profile hsprof1'),
                '',
                '/ip hotspot',
                ...rosIfMissing('find name="hotspot1"', 'add address-pool=hs-pool-1 disabled=no interface=bridge-hotspot name=hotspot1 profile=hsprof1', 'hotspot server hotspot1'),
                ...rosIfExistsSet('find name="hotspot1"', 'set [find name="hotspot1"] profile=hsprof1 interface=bridge-hotspot disabled=no', 'hotspot server hotspot1'),
                '',
                '/ip hotspot user profile',
                ...rosIfMissing('find name="default"', 'add name=default shared-users=1 transparent-proxy=yes', 'default hotspot user profile'),
                ...hotspotProfiles,
                ...(voucherUsers.length || hotspotAccounts.length ? ['', '/ip hotspot user', ...voucherUsers, ...hotspotAccounts] : []),
                '',
                '/ppp profile',
                ...pppoeProfiles,
                '',
                '/ppp/secret',
                ...pppoeAccounts,
                '',
                '/ip dns',
                'set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4',
                '',
                '# Firebase Walled Garden',
                '/ip hotspot walled-garden',
                ...rosIfMissing('find dst-host="www.gstatic.com"', 'add dst-host=www.gstatic.com', 'walled-garden www.gstatic.com'),
                ...rosIfMissing('find dst-host="firestore.googleapis.com"', 'add dst-host=firestore.googleapis.com', 'walled-garden firestore.googleapis.com'),
                ...rosIfMissing('find dst-host="securetoken.googleapis.com"', 'add dst-host=securetoken.googleapis.com', 'walled-garden securetoken.googleapis.com'),
                ...rosIfMissing('find dst-host="identitytoolkit.googleapis.com"', 'add dst-host=identitytoolkit.googleapis.com', 'walled-garden identitytoolkit.googleapis.com'),
                ...rosIfMissing('find dst-host="firebaseinstallations.googleapis.com"', 'add dst-host=firebaseinstallations.googleapis.com', 'walled-garden firebaseinstallations.googleapis.com'),
                ...rosIfMissing('find dst-host="protech-d6a95.firebaseapp.com"', 'add dst-host=protech-d6a95.firebaseapp.com', 'walled-garden protech-d6a95.firebaseapp.com'),
                '',
                '/file',
                ...rosIfMissing('find name="hotspot/login.html"', 'add name="hotspot/login.html" type=".html"', 'file hotspot/login.html'),
                `/file set [find name="hotspot/login.html"] contents="${portalHtml}"`,
                ...rosIfMissing('find name="hotspot/alogin.html"', 'add name="hotspot/alogin.html" type=".html"', 'file hotspot/alogin.html'),
                `/file set [find name="hotspot/alogin.html"] contents="${aloginHtml}"`,
                ...rosIfMissing('find name="hotspot/error.html"', 'add name="hotspot/error.html" type=".html"', 'file hotspot/error.html'),
                `/file set [find name="hotspot/error.html"] contents="${errorHtml}"`,
                ...rosIfMissing('find name="hotspot/status.html"', 'add name="hotspot/status.html" type=".html"', 'file hotspot/status.html'),
                `/file set [find name="hotspot/status.html"] contents="${statusHtml}"`,
                '',
                '# Router API user + permissions',
                '/user group',
                ...rosIfMissing(`find name="${apiGroupName}"`, `add name="${apiGroupName}" policy=api,read,write,test`, `user group ${apiGroupName}`),
                ...rosIfExistsSet(`find name="${apiGroupName}"`, `set [find name="${apiGroupName}"] policy=api,read,write,test`, `user group ${apiGroupName}`),
                '',
                '/user',
                ...rosIfMissing(`find name="${apiScriptUsername}"`, `add name="${apiScriptUsername}" password="${apiScriptPassword}" group="${apiGroupName}" disabled=no comment="HotspotPro API user"`, `router api user ${apiScriptUsername}`),
                ...rosIfExistsSet(`find name="${apiScriptUsername}"`, `set [find name="${apiScriptUsername}"] password="${apiScriptPassword}" group="${apiGroupName}" disabled=no comment="HotspotPro API user"`, `router api user ${apiScriptUsername}`),
                '',
                '# API Access configuration',
                '/ip service',
                'set api disabled=no port=8728',
                'set api-ssl disabled=yes',
                '',
                '# NAT rule for internet',
                '/ip firewall nat',
                ...rosIfMissing('find chain="srcnat" action="masquerade" out-interface="ether1"', 'add action=masquerade chain=srcnat out-interface=ether1', 'srcnat masquerade'),
                '',
                '/log info "HotspotPro: Setup Completed successfully"'
            ].join('\n');
        };

        window.generateSetupScript = async () => {
            document.getElementById('script-container').innerText = await buildSetupScript();
            window.openModal('script-modal');
        };

        window.copyScript = () => {
            const text = document.getElementById('script-container').innerText;
            const textarea = document.createElement("textarea");
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            
            const btn = document.querySelector('[onclick="copyScript()"]');
            const oldHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => btn.innerHTML = oldHtml, 2000);
        };

        window.downloadScriptFile = async () => {
            const script = await buildSetupScript();
            const blob = new Blob([script], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'tech.rsc';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };

        document.getElementById('router-config-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!currentUser) return;
            const btn = document.getElementById('save-router-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing Link...';
            const routerId = document.getElementById('router-id').value;
            const config = {
                name: document.getElementById('router-name').value.trim(),
                ssid: document.getElementById('router-ssid').value.trim() || 'Lait Automatically',
                ip: document.getElementById('router-ip').value,
                port: document.getElementById('router-port').value,
                username: document.getElementById('router-user').value,
                password: document.getElementById('router-pass').value,
                winboxPort: document.getElementById('router-winbox-port').value || '8291',
                webfigProtocol: document.getElementById('router-webfig-protocol').value || 'https',
                webfigPort: document.getElementById('router-webfig-port').value || '8081',
                remoteWinbox: `${document.getElementById('router-ip').value}:${document.getElementById('router-winbox-port').value || '8291'}`,
                status: 'online',
                updatedAt: Date.now()
            };
            try {
                let savedRouterId = routerId;
                if (routerId) {
                    await updateDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'routers', routerId), config);
                } else {
                    const created = await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'routers'), {
                        ...config,
                        createdAt: Date.now()
                    });
                    savedRouterId = created.id;
                }
                activeRouterId = savedRouterId;
                document.getElementById('router-id').value = savedRouterId;
                await setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'config', 'mikrotik'), config);
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Update Router';
                document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-yellow-500";
                document.getElementById('router-status-text').innerText = `${config.name || config.ip} checking...`;
                
                // Auto-check health after 3 seconds
                setTimeout(async () => {
                    try {
                        const response = await fetch(
                            `https://us-central1-${appId}.cloudfunctions.net/checkRouterHealth?appId=${appId}&userId=${currentUser.uid}&routerId=${savedRouterId}`
                        );
                        const result = await response.json();
                        
                        if (result.status === 'online') {
                            document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-green-500 animate-pulse";
                            document.getElementById('router-status-text').innerText = `${config.name || config.ip} online`;
                        } else {
                            document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-red-500";
                            document.getElementById('router-status-text').innerText = `${config.name || config.ip} offline`;
                        }
                    } catch (error) {
                        console.error('Health check after save failed:', error);
                        document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-red-500";
                        document.getElementById('router-status-text').innerText = `${config.name || config.ip} check failed`;
                    }
                }, 3000);
                
                window.openModal('success-modal');
            } catch (error) {
                console.error('Failed to save router config:', error);
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Save & Test Link';
                document.getElementById('router-status-indicator').className = "w-2 h-2 rounded-full bg-red-500";
                document.getElementById('router-status-text').innerText = "Save failed";
                alert('Could not save to Firebase. Check Authentication and Firestore rules.');
            }
        });

        const appendRouterLog = (message) => {
            const logPanel = document.getElementById('router-log-panel');
            if (!logPanel) return;
            const timestamp = new Date().toISOString().slice(11, 19);
            logPanel.textContent = `${logPanel.textContent}\n[${timestamp}] ${message}`;
            logPanel.scrollTop = logPanel.scrollHeight;
        };

        const testMikrotikLogin = async () => {
            const statusEl = document.getElementById('router-login-status');
            statusEl.textContent = 'Logging in to MikroTik...';
            appendRouterLog('testMikrotikLogin started');

            if (!currentUser) {
                statusEl.textContent = 'Error: user not authenticated';
                return;
            }

            try {
                const token = await auth.currentUser.getIdToken();
                const response = await fetch(`https://us-central1-${appId}.cloudfunctions.net/runMikrotikCommand`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        appId,
                        userId: currentUser.uid,
                        command: '/system/identity/print',
                        args: []
                    }),
                });

                const data = await response.json();
                if (!response.ok) {
                    statusEl.textContent = `Router login failed: ${data.error || 'Unknown error'}`;
                    appendRouterLog(`MikroTik login failed: ${data.error || 'Unknown error'}`);
                } else {
                    statusEl.textContent = 'Router login success';
                    appendRouterLog('MikroTik login success');
                    console.log('MikroTik login response:', data);
                    const selectedRouterId = document.getElementById('router-id')?.value || activeRouterId;
                    if (selectedRouterId && typeof triggerRouterSync === 'function') {
                        await triggerRouterSync(selectedRouterId);
                        appendRouterLog(`Applied hotspot profile sync to router ${selectedRouterId}`);
                        statusEl.textContent = 'Router login success. Bandwidth/session profile sync triggered.';
                    }
                }
            } catch (err) {
                if (String(err?.message || '').includes('Failed to fetch')) {
                    const fnUrl = `https://us-central1-${appId}.cloudfunctions.net/runMikrotikCommand`;
                    statusEl.textContent = `Command error: Failed to fetch. Check Cloud Functions deployment/network/CORS. URL: ${fnUrl}`;
                    appendRouterLog(`MikroTik login error: Failed to fetch (${fnUrl})`);
                } else {
                    statusEl.textContent = `Command error: ${err.message}`;
                    appendRouterLog(`MikroTik login error: ${err.message}`);
                }
            }
        };

        document.getElementById('test-router-login-btn').addEventListener('click', (e) => {
            e.preventDefault();
            testMikrotikLogin();
        });

        const openRouterManager = (target) => {
            const ip = document.getElementById('router-ip')?.value?.trim();
            const statusEl = document.getElementById('router-login-status');
            if (!ip) {
                if (statusEl) statusEl.textContent = 'Please set router IP first.';
                return;
            }
            const winboxPort = document.getElementById('router-winbox-port')?.value || '8291';
            const webfigProtocol = document.getElementById('router-webfig-protocol')?.value || 'https';
            const webfigPort = document.getElementById('router-webfig-port')?.value || '8081';

            const winboxUrl = `winbox://${ip}:${winboxPort}`;
            const webfigUrl = `${webfigProtocol}://${ip}:${webfigPort}/`;

            const url = target === 'winbox' ? winboxUrl : webfigUrl;
            window.open(url, '_blank');

            if (statusEl) statusEl.textContent = `Opened ${target.toUpperCase()} URL: ${url}`;
            appendRouterLog(`opened ${target} URL: ${url}`);
        };

        const copyRouterManagerUrl = (target) => {
            const ip = document.getElementById('router-ip')?.value?.trim();
            if (!ip) {
                document.getElementById('router-login-status').textContent = 'Please set router IP first.';
                return;
            }
            const winboxPort = document.getElementById('router-winbox-port')?.value || '8291';
            const webfigProtocol = document.getElementById('router-webfig-protocol')?.value || 'https';
            const webfigPort = document.getElementById('router-webfig-port')?.value || '8081';
            const winboxUrl = `winbox://${ip}:${winboxPort}`;
            const webfigUrl = `${webfigProtocol}://${ip}:${webfigPort}/`;
            const url = target === 'winbox' ? winboxUrl : webfigUrl;
            navigator.clipboard.writeText(url).then(() => {
                document.getElementById('router-login-status').textContent = `${target.toUpperCase()} URL copied to clipboard`;
                appendRouterLog(`copied ${target} URL to clipboard`);
            }).catch(err => {
                document.getElementById('router-login-status').textContent = `Copy failed: ${err.message}`;
                appendRouterLog(`copy ${target} URL failed: ${err.message}`);
            });
        };

        const selfCheckRouter = async () => {
            const statusEl = document.getElementById('router-login-status');
            statusEl.textContent = 'Running Cloud Function health check...';

            if (!currentUser) {
                statusEl.textContent = 'User not authenticated';
                appendRouterLog('Self-check failed: user not authenticated');
                return;
            }

            const routerId = document.getElementById('router-id')?.value;
            if (!routerId) {
                statusEl.textContent = 'Save router config first.';
                appendRouterLog('Self-check failed: no router ID selected');
                return;
            }

            try {
                const response = await fetch(`https://us-central1-${appId}.cloudfunctions.net/checkRouterHealth?appId=${appId}&userId=${currentUser.uid}&routerId=${routerId}`, {
                    method: 'GET',
                    mode: 'cors'
                });
                if (!response.ok) {
                    const text = await response.text();
                    statusEl.textContent = `Health check failed ${response.status}: ${text}`;
                    return;
                }
                const data = await response.json();
                statusEl.textContent = `Health check status: ${data.status || 'unknown'}${data.message ? ' - ' + data.message : ''}`;
                appendRouterLog(`Health check success: ${data.status || 'unknown'}`);
            } catch (err) {
                statusEl.textContent = `Health check network error: ${err.message}`;
                appendRouterLog(`Health check error: ${err.message}`);
            }
        };

        document.getElementById('open-winbox-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            openRouterManager('winbox');
        });

        document.getElementById('open-webfig-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            openRouterManager('webfig');
        });

        document.getElementById('copy-winbox-url-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            copyRouterManagerUrl('winbox');
        });

        document.getElementById('copy-webfig-url-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            copyRouterManagerUrl('webfig');
        });

        document.getElementById('router-selfcheck-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            selfCheckRouter();
        });

        const togglePackageDurationFields = () => {
            const type = document.getElementById('package-type').value;
            const durationBlock = document.getElementById('package-duration-block');
            const expiryBlock = document.getElementById('package-expiry-block');

            if (type === 'pppoe') {
                durationBlock.style.display = 'none';
                expiryBlock.style.display = 'none';
                document.getElementById('package-duration').required = false;
                document.getElementById('package-duration-unit').required = false;
            } else {
                durationBlock.style.display = 'grid';
                expiryBlock.style.display = 'block';
                document.getElementById('package-duration').required = true;
                document.getElementById('package-duration-unit').required = true;
            }
        };

        document.getElementById('package-type').addEventListener('change', togglePackageDurationFields);

        document.getElementById('package-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) {
                alert('Authentication error: Not signed in. Please refresh and try again.');
                return;
            }
            const id = document.getElementById('package-id').value;
            const packageTypeRaw = document.getElementById('package-type').value;
            const packageType = String(packageTypeRaw || 'hotspot').toLowerCase();
            let durationMinutes = 0;
            if (packageType === 'hotspot') {
                const durationValue = Number(document.getElementById('package-duration').value || 0);
                const durationUnit = document.getElementById('package-duration-unit').value;
                durationMinutes = durationUnit === 'minutes' ? durationValue : durationValue * 60;
            }

            const expiresAtInput = document.getElementById('package-expires-at').value;
            const expiresAt = (packageType === 'hotspot' && expiresAtInput) ? new Date(expiresAtInput).toISOString() : null;

            const payload = {
                name: document.getElementById('package-name').value.trim(),
                price: Number(document.getElementById('package-price').value || 0),
                durationMinutes: Number(durationMinutes || 0),
                type: packageType,
                downloadSpeed: Number(document.getElementById('package-download-speed').value || 0),
                uploadSpeed: Number(document.getElementById('package-upload-speed').value || 0),
                expiresAt,
                updatedAt: Date.now()
            };

            if (!payload.name) {
                alert('Package name is required.');
                return;
            }
            if (payload.price < 0) {
                alert('Package price must be 0 or greater.');
                return;
            }
            if (packageType === 'hotspot' && payload.durationMinutes <= 0) {
                alert('Hotspot packages require duration.');
                return;
            }

            try {
                if (id) {
                    await updateDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'packages', id), payload);
                } else {
                    payload.createdAt = Date.now();
                    await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'packages'), payload);
                }
                resetPackageForm();
                console.log('Package saved successfully', payload);

                // Immediately trigger router sync after package change
                if (typeof triggerRouterSync === 'function') {
                    for (const router of routers.filter(r => (r.status || 'offline') === 'online')) {
                        try {
                            await triggerRouterSync(router.id);
                        } catch (err) {
                            console.warn('Immediate router sync failed after package save', err);
                        }
                    }
                }
            } catch (error) {
                console.error('Error saving package to Firestore:', error);
                alert(`Failed to save package. This is often due to Firestore security rules or connectivity.\n\nError: ${error.message}`);
            }
        });

        document.getElementById('voucher-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;
            const id = document.getElementById('voucher-id').value;
            const payload = {
                code: document.getElementById('voucher-code').value.trim().toUpperCase(),
                username: document.getElementById('voucher-username').value.trim(),
                password: document.getElementById('voucher-password').value.trim(),
                packageId: document.getElementById('voucher-package').value,
                status: document.getElementById('voucher-status').value,
                updatedAt: Date.now()
            };
            if (id) {
                await updateDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'vouchers', id), payload);
            } else {
                await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'vouchers'), payload);
            }
            resetVoucherForm();
        });

        document.getElementById('hotspot-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;
            const id = document.getElementById('hotspot-user-id').value;
            const payload = {
                username: document.getElementById('hotspot-user-username').value.trim(),
                password: document.getElementById('hotspot-user-password').value.trim(),
                packageId: document.getElementById('hotspot-user-package').value,
                packageName: packages.find(p => p.id === document.getElementById('hotspot-user-package').value)?.name || '',
                profileName: packages.find(p => p.id === document.getElementById('hotspot-user-package').value)?.name || 'default',
                status: document.getElementById('hotspot-user-status').value,
                updatedAt: Date.now(),
            };
            if (id) {
                await updateDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'hotspot-users', id), payload);
            } else {
                await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'hotspot-users'), {
                    ...payload,
                    createdAt: Date.now(),
                });
            }
            resetHotspotUserForm();
        });

        document.getElementById('pppoe-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;
            const id = document.getElementById('pppoe-id').value;
            const expiresAtValue = document.getElementById('pppoe-expires-at').value;
            const payload = {
                username: document.getElementById('pppoe-username').value.trim(),
                password: document.getElementById('pppoe-password').value.trim(),
                name: document.getElementById('pppoe-name').value.trim() || '',
                packageId: document.getElementById('pppoe-package').value,
                packageName: packages.find(p => p.id === document.getElementById('pppoe-package').value)?.name || '',
                profileName: packages.find(p => p.id === document.getElementById('pppoe-package').value)?.name || 'default',
                status: document.getElementById('pppoe-status').value || 'active',
                expiresAt: expiresAtValue ? new Date(expiresAtValue).toISOString() : null,
                updatedAt: Date.now()
            };
            if (id) {
                await updateDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'pppoe-users', id), payload);
            } else {
                await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'pppoe-users'), {
                    ...payload,
                    createdAt: Date.now()
                });
            }
            resetPppoeForm();
        });

        document.getElementById('package-reset-btn').addEventListener('click', resetPackageForm);
        document.getElementById('voucher-reset-btn').addEventListener('click', resetVoucherForm);
        document.getElementById('hotspot-user-reset-btn').addEventListener('click', resetHotspotUserForm);
        document.getElementById('pppoe-reset-btn').addEventListener('click', resetPppoeForm);
        document.getElementById('router-reset-btn').addEventListener('click', resetRouterForm);
        document.getElementById('router-search').addEventListener('input', renderRouters);
        document.querySelectorAll('.router-filter-btn').forEach((button) => {
            button.addEventListener('click', () => {
                activeRouterFilter = button.dataset.routerFilter;
                renderRouters();
            });
        });
        document.getElementById('voucher-generate-btn').addEventListener('click', () => {
            document.getElementById('voucher-code').value = randomCode();
        });

        window.editPackage = (id) => {
            const pkg = packages.find(item => item.id === id);
            if (!pkg) return;
            document.getElementById('package-id').value = pkg.id;
            document.getElementById('package-name').value = pkg.name || '';
            document.getElementById('package-price').value = pkg.price ?? '';
            const durationMins = pkg.durationMinutes ?? (pkg.durationHours ? pkg.durationHours * 60 : '');
            if (durationMins && Number(durationMins) > 0) {
                if (Number(durationMins) % 60 === 0) {
                    document.getElementById('package-duration').value = Number(durationMins) / 60;
                    document.getElementById('package-duration-unit').value = 'hours';
                } else {
                    document.getElementById('package-duration').value = Number(durationMins);
                    document.getElementById('package-duration-unit').value = 'minutes';
                }
            } else {
                document.getElementById('package-duration').value = '';
                document.getElementById('package-duration-unit').value = 'hours';
            }
            document.getElementById('package-type').value = pkg.type || 'hotspot';
            document.getElementById('package-download-speed').value = pkg.downloadSpeed ?? '';
            document.getElementById('package-upload-speed').value = pkg.uploadSpeed ?? '';
            document.getElementById('package-expires-at').value = pkg.expiresAt ? new Date(pkg.expiresAt).toISOString().slice(0, 16) : '';
            togglePackageDurationFields();
            document.getElementById('package-submit-btn').innerText = 'Update Package';
            window.switchTab('packages');
        };

        window.removePackage = async (id) => {
            if (!currentUser || !confirm('Delete this package?')) return;
            await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'packages', id));
            if (document.getElementById('package-id').value === id) resetPackageForm();
        };

        window.editVoucher = (id) => {
            const voucher = vouchers.find(item => item.id === id);
            if (!voucher) return;
            document.getElementById('voucher-id').value = voucher.id;
            document.getElementById('voucher-code').value = voucher.code || '';
            document.getElementById('voucher-package').value = voucher.packageId || '';
            document.getElementById('voucher-status').value = voucher.status || 'active';
            document.getElementById('voucher-submit-btn').innerText = 'Update Voucher';
            window.switchTab('vouchers');
        };

        window.removeVoucher = async (id) => {
            if (!currentUser || !confirm('Delete this voucher?')) return;
            await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'vouchers', id));
            if (document.getElementById('voucher-id').value === id) resetVoucherForm();
        };

        window.editHotspotUser = (id) => {
            const user = hotspotUsers.find(item => item.id === id);
            if (!user) return;
            document.getElementById('hotspot-user-id').value = user.id;
            document.getElementById('hotspot-user-username').value = user.username || '';
            document.getElementById('hotspot-user-password').value = user.password || '';
            document.getElementById('hotspot-user-package').value = user.packageId || '';
            document.getElementById('hotspot-user-status').value = user.status || 'active';
            document.getElementById('hotspot-user-submit-btn').innerText = 'Update Hotspot User';
            window.switchTab('hotspot-users');
        };

        window.removeHotspotUser = async (id) => {
            if (!currentUser || !confirm('Delete this hotspot user?')) return;
            await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'hotspot-users', id));
            if (document.getElementById('hotspot-user-id').value === id) resetHotspotUserForm();
        };

        window.editRouter = (id) => {
            const router = routers.find(item => item.id === id);
            if (!router) return;
            activeRouterId = router.id;
            applyRouterToForm(router);
            window.switchTab('router');
        };

        window.toggleRouterStatus = async (id) => {
            if (!currentUser) return;
            const router = routers.find(item => item.id === id);
            if (!router) return;
            const nextStatus = (router.status || 'offline') === 'online' ? 'offline' : 'online';
            await updateDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'routers', id), {
                status: nextStatus,
                updatedAt: Date.now()
            });
            if (activeRouterId === id) {
                document.getElementById('router-status-indicator').className = nextStatus === 'online'
                    ? "w-2 h-2 rounded-full bg-green-500 animate-pulse"
                    : "w-2 h-2 rounded-full bg-rose-500";
                document.getElementById('router-status-text').innerText = `${router.name || router.ip || 'Router'} ${nextStatus}`;
            }
        };

        window.checkRouterHealth = async (id) => {
            if (!currentUser) return;
            const button = event?.target;
            if (button) {
                button.disabled = true;
                button.innerText = 'Checking...';
            }

            try {
                const router = routers.find(item => item.id === id);
                const result = await pingRouter({ id });
                if (router) {
                    router.status = result.status === 'online' ? 'online' : 'offline';
                    if (activeRouterId === id) {
                        updateRouterBadgeFromPing(router, router.status);
                    }
                    if (router.status === 'online') {
                        await refreshLiveSessionsFromRouter(id);
                    }
                }
                if (button) {
                    button.disabled = false;
                    button.innerText = result.status === 'online' ? '✓ Online' : '✗ Offline';
                    setTimeout(() => {
                        button.innerText = 'Check Status';
                    }, 2000);
                }
                
                renderRouters();
            } catch (error) {
                console.error('Health check failed:', error);
                if (button) {
                    button.disabled = false;
                    button.innerText = 'Check Status';
                }
            }
        };

        window.removeRouter = async (id) => {
            if (!currentUser || !confirm('Delete this MikroTik router?')) return;
            await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'routers', id));
            if (document.getElementById('router-id').value === id) {
                activeRouterId = '';
                resetRouterForm();
            }
        };

        window.editPppoeUser = (id) => {
            const user = pppoeUsers.find(item => item.id === id);
            if (!user) return;
            document.getElementById('pppoe-id').value = user.id;
            document.getElementById('pppoe-username').value = user.username || '';
            document.getElementById('pppoe-password').value = user.password || '';
            document.getElementById('pppoe-name').value = user.name || '';
            document.getElementById('pppoe-package').value = user.packageId || '';
            document.getElementById('pppoe-expires-at').value = user.expiresAt ? new Date(user.expiresAt).toISOString().slice(0, 16) : '';
            document.getElementById('pppoe-status').value = user.status || 'active';
            document.getElementById('pppoe-submit-btn').innerText = 'Update PPPoE User';
            window.switchTab('pppoe');
        };

        window.removePppoeUser = async (id) => {
            if (!currentUser || !confirm('Delete this PPPoE user?')) return;
            await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'pppoe-users', id));
            if (document.getElementById('pppoe-id').value === id) {
                resetPppoeForm();
            }
        };

        window.terminatePppoeUser = async (id) => {
            if (!currentUser || !confirm('Terminate this PPPoE user session?')) return;
            const userRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'pppoe-users', id);
            await updateDoc(userRef, {
                status: 'disabled',
                updatedAt: Date.now()
            });
            renderPppoeUsers();
        };

        window.reconnectPppoeUser = async (id) => {
            if (!currentUser) return;
            const userRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'pppoe-users', id);
            await updateDoc(userRef, {
                status: 'active',
                updatedAt: Date.now()
            });
            renderPppoeUsers();
        };

        resetPppoeForm();
        resetRouterForm();
