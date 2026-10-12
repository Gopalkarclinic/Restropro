(function () {
  'use strict';
  var C = window.RESTROPRO;
  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  var $ = function (id) { return document.getElementById(id); };
  var P = null;               // profile: {role, rid, name}
  var channel = null, qTimer = null;
  var seenAttention = null;   // order ids that need my action (to beep on new ones)

  // ---------- helpers ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function rs(p) { p = Number(p) || 0; var w = Math.floor(p / 100), f = p % 100; return '₹' + w + (f ? '.' + String(f).padStart(2, '0') : ''); }
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'o-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  var toastT; function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200); }
  var actx; function beep() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); var o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination); o.frequency.value = 880; g.gain.value = .15; o.start(); o.stop(actx.currentTime + .25); if (navigator.vibrate) navigator.vibrate(200); } catch (e) {} }
  var BUSINESS = ['P0001', '42501', '22P02', '23514', '23503'];
  function isBusiness(err) { return err && BUSINESS.indexOf(err.code) >= 0; }
  function friendly(err) {
    var m = (err && err.message) || '';
    if (/item_unavailable/.test(m)) return 'Koi item abhi khatam ho gaya. Menu refresh karein.';
    if (/cancel_reason_required/.test(m)) return 'Cancel ka karan likhna zaroori hai.';
    if (/transition_not_allowed|not_allowed|not_staff/.test(m)) return 'Aapko ye karne ki anumati nahi hai.';
    return 'Nahi ho paya, dobara try karein.';
  }
  function modal(title, build, actions) {
    var d = $('dlg'), b = $('dlg-body'); b.replaceChildren(el('h3', null, title));
    var content = build && build(); if (content) b.append(content);
    var a = el('div', 'acts');
    actions.forEach(function (x) { var btn = el('button', x.cls || 'sec', x.label); btn.onclick = function () { var keep = x.fn && x.fn(); if (keep !== false) d.close(); }; a.append(btn); });
    b.append(a); if (!d.open) d.showModal();
  }
  function show(id) { ['login', 'app'].forEach(function (x) { $(x).hidden = x !== id; }); }

  // ---------- login ----------
  $('lf').addEventListener('submit', function (ev) {
    ev.preventDefault(); $('lerr').textContent = ''; $('lbtn').disabled = true; beep0();
    sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value }).then(function (r) {
      $('lbtn').disabled = false;
      if (r.error) { $('lerr').textContent = 'Email ya password galat hai'; return; }
      start();
    }).catch(function () { $('lbtn').disabled = false; $('lerr').textContent = 'Internet check karein'; });
  });
  function beep0() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.resume) actx.resume(); } catch (e) {} } // allow sound later
  $('out').onclick = function () { stop(); sb.auth.signOut().then(function () { show('login'); }); };

  // ---------- start / stop ----------
  function start() {
    sb.auth.getUser().then(function (u) {
      if (u.error || !u.data.user) { show('login'); return; }
      return sb.from('staff').select('role, restaurant_id, restaurants(name)').eq('user_id', u.data.user.id).limit(1).maybeSingle().then(function (r) {
        if (r.error || !r.data) { sb.auth.signOut(); show('login'); $('lerr').textContent = 'Ye account kisi restaurant se juda nahi hai. Owner se kahein.'; return; }
        P = { role: r.data.role, rid: r.data.restaurant_id, name: (r.data.restaurants && r.data.restaurants.name) || '' };
        $('rname').textContent = P.name || 'Restropro'; document.title = (P.name || 'Restropro') + ' - Staff';
        $('role').textContent = { owner: 'Owner', manager: 'Manager', captain: 'Captain', kitchen: 'Kitchen' }[P.role] || P.role;
        $('dashlink').hidden = !(P.role === 'owner' || P.role === 'manager');
        buildTabs(); show('app'); openTab('orders');
        seenAttention = null; loadOrders();
        if (channel) sb.removeChannel(channel);
        channel = sb.channel('staff-live').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function () { loadOrders(); }).subscribe();
        clearInterval(qTimer); qTimer = setInterval(function () { flushQueue(); loadOrders(); }, 20000);
        flushQueue(); updateQueueBadge();
      });
    }).catch(function () { show('login'); });
  }
  function stop() { clearInterval(qTimer); if (channel) { sb.removeChannel(channel); channel = null; } P = null; }
  window.addEventListener('online', function () { $('net').hidden = true; flushQueue(); });
  window.addEventListener('offline', function () { $('net').hidden = false; });

  // ---------- tabs ----------
  var TABS = [];
  function buildTabs() {
    TABS = [['orders', 'Orders']];
    if (P.role !== 'kitchen') TABS.push(['new', 'Naya order']);
    TABS.push(['menu', 'Menu']);
    if (P.role === 'owner') TABS.push(['staff', 'Staff']);
    var nav = $('tabs'); nav.replaceChildren();
    TABS.forEach(function (t) { var b = el('button', null, t[1]); b.dataset.t = t[0]; b.onclick = function () { openTab(t[0]); }; nav.append(b); });
  }
  function openTab(name) {
    ['orders', 'new', 'menu', 'staff'].forEach(function (n) { $('v-' + n).hidden = n !== name; });
    [].forEach.call($('tabs').children, function (b) { b.classList.toggle('on', b.dataset.t === name); });
    if (name === 'new') loadMenuForOrder(); if (name === 'menu') renderMenuTab(); if (name === 'staff') renderStaffTab(); if (name === 'orders') loadOrders();
  }

  // ---------- ORDERS ----------
  var orders = [];
  var FLOW = {
    pending_approval: ['Approve karo', 'approved', ['owner', 'manager', 'captain']],
    approved: ['Banana shuru', 'preparing', ['owner', 'manager', 'kitchen']],
    preparing: ['Ready hai', 'ready', ['owner', 'manager', 'kitchen']],
    ready: ['Serve ho gaya', 'served', ['owner', 'manager', 'captain']]
  };
  var SEC = [['pending_approval', 'Naye (approve karne hain)'], ['approved', 'Approved'], ['preparing', 'Ban raha hai'], ['ready', 'Ready - serve karein'], ['served', 'Aaj serve hue (bill)']];

  function loadOrders() {
    if (!P) return;
    var n = new Date(), day = new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString();
    sb.from('orders').select('id, table_no, status, source, created_at, order_items(qty, note, menu_items(name)), bills(id)')
      .or('status.in.(pending_approval,approved,preparing,ready),and(status.eq.served,created_at.gte.' + day + ')').order('created_at')
      .then(function (r) {
        if (r.error) throw r.error;
        orders = r.data || [];
        var mine = P.role === 'kitchen' ? 'approved' : 'pending_approval';
        var now = {}; orders.forEach(function (o) { if (o.status === mine) now[o.id] = 1; });
        if (seenAttention && P.role !== 'owner') { for (var k in now) if (!seenAttention[k]) { beep(); break; } }
        seenAttention = now;
        renderOrders();
      }).catch(function () { if (!orders.length) { var v = $('v-orders'); v.replaceChildren(el('div', 'empty', 'Orders load nahi hue. Internet check karein.')); } });
  }

  function renderOrders() {
    var v = $('v-orders'); v.replaceChildren();
    if (!orders.length) { v.append(el('div', 'empty', 'Abhi koi order nahi')); return; }
    SEC.forEach(function (s) {
      var list = orders.filter(function (o) { return o.status === s[0]; }); if (!list.length) return;
      v.append(el('h2', null, s[1] + ' (' + list.length + ')'));
      var g = el('div', 'grid'); list.forEach(function (o) { g.append(card(o)); }); v.append(g);
    });
  }

  function card(o) {
    var c = el('div', 'card s-' + o.status), h = el('h3', null, 'Table ' + o.table_no);
    if (o.source === 'qr') h.append(el('em', null, 'QR'));
    c.append(h);
    var ul = el('ul'); (o.order_items || []).forEach(function (i) { ul.append(el('li', null, i.qty + ' x ' + ((i.menu_items && i.menu_items.name) || '?') + (i.note ? ' (' + i.note + ')' : ''))); });
    c.append(ul);
    var step = FLOW[o.status];
    if (step && step[2].indexOf(P.role) >= 0) { var b = el('button', 'primary', step[0]); b.onclick = function () { b.disabled = true; move(o.id, step[1]); }; c.append(b); }
    if (o.status === 'served' && P.role !== 'kitchen') {
      var has = Array.isArray(o.bills) ? o.bills.length : !!o.bills;
      var bb = el('button', 'primary', has ? 'Bill dekho' : 'Bill banao'); bb.onclick = function () { showBill(o.id); }; c.append(bb);
    }
    if (o.status !== 'served' && (P.role === 'owner' || P.role === 'manager')) { var cb = el('button', 'danger', 'Order cancel karo'); cb.onclick = function () { cancelOrder(o.id); }; c.append(cb); }
    return c;
  }

  function move(id, next) {
    sb.from('orders').update({ status: next }).eq('id', id).then(function (r) { if (r.error) toast(friendly(r.error)); loadOrders(); });
  }

  function cancelOrder(id) {
    var inp;
    modal('Order cancel karein?', function () { var w = el('div'); inp = el('input'); inp.placeholder = 'Karan likhein (zaroori)'; inp.maxLength = 200; w.append(inp); return w; }, [
      { label: 'Wapas', cls: 'sec' },
      { label: 'Cancel karo', cls: 'primary', fn: function () {
        var reason = inp.value.trim(); if (!reason) { toast('Karan likhna zaroori hai'); return false; }
        sb.from('orders').update({ status: 'cancelled', cancel_reason: reason }).eq('id', id).then(function (r) { if (r.error) toast(friendly(r.error)); loadOrders(); });
      } }
    ]);
  }

  function showBill(orderId) {
    sb.rpc('create_bill', { p_order_id: orderId }).then(function (r) {
      if (r.error) throw r.error;
      return Promise.all([
        sb.from('bills').select('*').eq('id', r.data).single(),
        sb.from('orders').select('table_no, restaurants(name), order_items(qty, unit_price_paise, menu_items(name))').eq('id', orderId).single()
      ]);
    }).then(function (res) {
      if (res[0].error || res[1].error) throw (res[0].error || res[1].error);
      var b = res[0].data, o = res[1].data, gst = b.gst_scheme !== 'composition', half = b.gst_scheme === 'regular_5' ? '2.5%' : '9%';
      var L = [(o.restaurants && o.restaurants.name) || '', 'Bill #' + b.bill_no + '   Table ' + o.table_no, new Date(b.created_at).toLocaleString('en-IN'), '------------------------'];
      o.order_items.forEach(function (i) { L.push(((i.menu_items && i.menu_items.name) || '?') + ' x' + i.qty + '  ' + rs(i.qty * i.unit_price_paise)); });
      L.push('------------------------', 'Subtotal: ' + rs(b.subtotal_paise));
      if (gst) { L.push('CGST ' + half + ': ' + rs(b.cgst_paise), 'SGST ' + half + ': ' + rs(b.sgst_paise)); } else { L.push('Bill of Supply (GST nahi)'); }
      L.push('TOTAL: ' + rs(b.total_paise), '', 'Dhanyavad! Phir aaiye.');
      var text = L.join('\n');
      modal('Bill #' + b.bill_no, function () { return el('pre', null, text); }, [
        { label: 'WhatsApp ke liye copy', cls: 'sec', fn: function () { copy(text); return false; } },
        { label: 'Print', cls: 'sec', fn: function () { window.print(); return false; } },
        { label: 'Band karo', cls: 'primary' }
      ]);
      loadOrders();
    }).catch(function (e) { toast(friendly(e)); });
  }
  function copy(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Copy ho gaya'); }).catch(function () { toast('Copy nahi hua - text ko select karke copy karein'); }); }

  // ---------- NEW ORDER (works offline) ----------
  var menu = [], cart = {};
  function loadMenuForOrder() {
    var v = $('v-new'); if (!menu.length) { var c = ls('rp_menu_' + P.rid); if (c) menu = c; }
    renderNew();
    sb.from('menu_items').select('id, name, price_paise, is_available').eq('restaurant_id', P.rid).order('name').then(function (r) {
      if (r.error) return; menu = r.data; ls('rp_menu_' + P.rid, menu); renderNew();
    }).catch(function () {});
  }
  function renderNew() {
    var v = $('v-new'), keepTable = $('tbl') ? $('tbl').value : '', keepQ = $('q') ? $('q').value : '', hadFocus = document.activeElement && document.activeElement.id;
    v.replaceChildren();
    var bar = el('div', 'bar2'), tbl = el('input'); tbl.id = 'tbl'; tbl.placeholder = 'Table no.'; tbl.maxLength = 10; tbl.value = keepTable;
    var q = el('input'); q.id = 'q'; q.placeholder = 'Dish khojein'; q.value = keepQ; bar.append(tbl, q); v.append(bar);
    var list = el('div'); v.append(list);
    var total = 0, count = 0;
    var shown = menu.filter(function (m) { return !q.value || m.name.toLowerCase().indexOf(q.value.toLowerCase()) >= 0; });
    shown.forEach(function (m) {
      var row = el('div', 'row' + (m.is_available ? '' : ' off')), g = el('div', 'grow');
      g.append(el('div', 'nm', m.name), el('div', 'pr', m.is_available ? rs(m.price_paise) : 'Khatam')); row.append(g);
      if (m.is_available) {
        var qd = el('div', 'qty'), mi = el('button', null, '−'), n = el('span', null, String(cart[m.id] || 0)), pl = el('button', null, '+'); mi.disabled = !cart[m.id];
        mi.onclick = function () { cart[m.id] = Math.max(0, (cart[m.id] || 0) - 1); if (!cart[m.id]) delete cart[m.id]; renderNew(); };
        pl.onclick = function () { cart[m.id] = Math.min(99, (cart[m.id] || 0) + 1); renderNew(); };
        qd.append(mi, n, pl); row.append(qd);
      }
      list.append(row);
    });
    menu.forEach(function (m) { total += (cart[m.id] || 0) * m.price_paise; count += cart[m.id] || 0; });
    var s = el('div', 'sticky'), send = el('button', 'primary', count ? 'Order bhejo • ' + count + ' • ' + rs(total) : 'Order bhejo'); send.id = 'sendbtn';
    send.onclick = sendOrder; s.append(send); v.append(s);
    q.oninput = function () { renderNew(); };
    if (hadFocus === 'q') { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  function sendOrder() {
    var table = $('tbl').value.trim();
    if (!table) return toast('Table number daalein');
    var items = Object.keys(cart).map(function (k) { return { menu_item_id: k, qty: cart[k] }; });
    if (!items.length) return toast('Kam se kam ek item jodein');
    var order = { restaurant_id: P.rid, table_no: table, key: uid(), items: items };
    $('sendbtn').disabled = true;
    sendOne(order).then(function (res) {
      $('sendbtn').disabled = false;
      if (res === 'ok') { toast('Order kitchen ko bhej diya'); resetNew(); }
      else if (res === 'rejected') { toast('Koi item abhi khatam ho gaya. Menu refresh ho raha hai.'); loadMenuForOrder(); }
      else { var q = ls('rp_queue') || []; q.push(order); ls('rp_queue', q); updateQueueBadge(); toast('Internet nahi: order save hai, apne aap chala jayega'); resetNew(); }
    });
  }
  function resetNew() { cart = {}; if ($('tbl')) $('tbl').value = ''; renderNew(); updateQueueBadge(); loadOrders(); }

  // returns 'ok' | 'rejected' (database rule said no) | 'retry' (network problem)
  function sendOne(o) {
    return new Promise(function (resolve) {
      var done = false, t = setTimeout(function () { if (!done) { done = true; resolve('retry'); } }, 10000);
      sb.rpc('create_staff_order', { p_restaurant_id: o.restaurant_id, p_table_no: o.table_no, p_idempotency_key: o.key, p_items: o.items }).then(function (r) {
        if (done) return; done = true; clearTimeout(t);
        resolve(!r.error ? 'ok' : (isBusiness(r.error) ? 'rejected' : 'retry'));
      }).catch(function () { if (!done) { done = true; clearTimeout(t); resolve('retry'); } });
    });
  }
  var flushing = false;
  function flushQueue() {
    if (flushing || !P) return; var q = ls('rp_queue') || []; if (!q.length) return; flushing = true;
    (function next(i) {
      if (i >= q.length) { ls('rp_queue', []); flushing = false; updateQueueBadge(); loadOrders(); return; }
      sendOne(q[i]).then(function (res) {
        if (res === 'retry') { ls('rp_queue', q.slice(i)); flushing = false; updateQueueBadge(); return; } // keep this and the rest
        next(i + 1);
      });
    })(0);
  }
  function updateQueueBadge() { var n = (ls('rp_queue') || []).length, b = $('queue'); b.hidden = !n; b.textContent = n + ' bhejna baaki'; }

  // ---------- MENU ----------
  function renderMenuTab() {
    var v = $('v-menu'); v.replaceChildren(el('div', 'empty', 'Load ho raha hai...'));
    sb.from('menu_items').select('id, name, price_paise, is_available').eq('restaurant_id', P.rid).order('name').then(function (r) {
      if (r.error) throw r.error; menu = r.data; ls('rp_menu_' + P.rid, menu);
      v.replaceChildren();
      var canEdit = P.role === 'owner' || P.role === 'manager';
      if (canEdit) { var add = el('button', 'primary', '+ Naya item'); add.style.marginBottom = '10px'; add.onclick = function () { editItem(); }; v.append(add); }
      if (!menu.length) v.append(el('div', 'empty', 'Menu khali hai'));
      menu.forEach(function (m) {
        var row = el('div', 'row' + (m.is_available ? '' : ' off')), g = el('div', 'grow');
        g.append(el('div', 'nm', m.name), el('div', 'pr', rs(m.price_paise) + (m.is_available ? '' : '  •  khatam'))); row.append(g);
        if (canEdit) { var e = el('button', 'sec', 'Badlo'); e.onclick = function () { editItem(m); }; row.append(e); }
        var sw = el('button', 'switch' + (m.is_available ? ' on' : '')); sw.setAttribute('aria-label', 'available'); sw.onclick = function () {
          var nv = !m.is_available; sb.from('menu_items').update({ is_available: nv }).eq('id', m.id).then(function (r) { if (r.error) toast(friendly(r.error)); renderMenuTab(); });
        }; row.append(sw); v.append(row);
      });
    }).catch(function () { v.replaceChildren(el('div', 'empty', 'Menu load nahi hua. Internet check karein.')); });
  }
  function editItem(m) {
    var n, p;
    modal(m ? 'Item badlein' : 'Naya item', function () {
      var w = el('div'), l1 = el('label', null, 'Naam'), l2 = el('label', null, 'Kimat (₹)');
      n = el('input'); n.maxLength = 120; n.value = m ? m.name : ''; p = el('input'); p.type = 'number'; p.min = '0'; p.step = '0.5'; p.inputMode = 'decimal'; p.value = m ? m.price_paise / 100 : '';
      l1.append(n); l2.append(p); w.append(l1, l2); return w;
    }, [{ label: 'Wapas', cls: 'sec' }, { label: 'Save karo', cls: 'primary', fn: function () {
      var name = n.value.trim(), rupees = parseFloat(p.value);
      if (!name || !(rupees >= 0)) { toast('Naam aur sahi kimat daalein'); return false; }
      var row = { name: name, price_paise: Math.round(rupees * 100) };
      var q = m ? sb.from('menu_items').update(row).eq('id', m.id) : sb.from('menu_items').insert(Object.assign({ restaurant_id: P.rid }, row));
      q.then(function (r) { if (r.error) toast(friendly(r.error)); renderMenuTab(); });
    } }]);
  }

  // ---------- STAFF (owner) ----------
  function api(path, body) {
    return sb.auth.getSession().then(function (s) {
      var tok = s.data && s.data.session && s.data.session.access_token;
      return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
    });
  }
  var ROLE_LABEL = { owner: 'Owner', manager: 'Manager', captain: 'Captain', kitchen: 'Kitchen' };
  function renderStaffTab() {
    var v = $('v-staff'); v.replaceChildren();
    var add = el('button', 'primary', '+ Naya staff'); add.style.marginBottom = '10px'; add.onclick = addStaff; v.append(add);
    sb.from('staff').select('id, role, display_name').eq('restaurant_id', P.rid).order('created_at').then(function (r) {
      if (r.error) throw r.error;
      r.data.forEach(function (s) {
        var row = el('div', 'row'), g = el('div', 'grow'); g.append(el('div', 'nm', s.display_name), el('div', 'pr', ROLE_LABEL[s.role] || s.role)); row.append(g);
        if (s.role !== 'owner') {
          var pw = el('button', 'sec', 'Password'); pw.onclick = function () { resetPw(s); }; row.append(pw);
          var rm = el('button', 'danger', 'Hatao'); rm.onclick = function () { removeStaff(s); }; row.append(rm);
        }
        v.append(row);
      });
    }).catch(function () { v.append(el('div', 'empty', 'Staff load nahi hua.')); });
  }
  function addStaff() {
    var nm, em, pw, rl;
    modal('Naya staff', function () {
      var w = el('div'); function L(t, i) { var l = el('label', null, t); l.append(i); w.append(l); return i; }
      nm = L('Naam', el('input')); em = L('Email (login ke liye)', el('input')); em.type = 'email'; pw = L('Password (kam se kam 8 akshar)', el('input')); pw.type = 'text';
      rl = L('Role', el('select')); [['captain', 'Captain (order lena)'], ['kitchen', 'Kitchen'], ['manager', 'Manager']].forEach(function (x) { var o = el('option', null, x[1]); o.value = x[0]; rl.append(o); });
      return w;
    }, [{ label: 'Wapas', cls: 'sec' }, { label: 'Account banao', cls: 'primary', fn: function () {
      if (!nm.value.trim() || !em.value.trim() || pw.value.length < 8) { toast('Naam, email aur 8+ akshar ka password daalein'); return false; }
      api('/api/staff', { displayName: nm.value.trim(), email: em.value.trim(), password: pw.value, role: rl.value }).then(function (r) {
        toast(r.ok ? 'Account ban gaya. Email aur password staff ko de dein.' : (r.j.error === 'email_exists' ? 'Ye email pehle se hai' : 'Account nahi bana, dobara try karein')); renderStaffTab();
      });
    } }]);
  }
  function resetPw(s) {
    var pw; modal(s.display_name + ': naya password', function () { var w = el('div'); pw = el('input'); pw.placeholder = 'Kam se kam 8 akshar'; w.append(pw); return w; },
      [{ label: 'Wapas', cls: 'sec' }, { label: 'Badlo', cls: 'primary', fn: function () {
        if (pw.value.length < 8) { toast('Kam se kam 8 akshar'); return false; }
        api('/api/staff/password', { staffId: s.id, password: pw.value }).then(function (r) { toast(r.ok ? 'Password badal gaya' : 'Nahi badla, dobara try karein'); });
      } }]);
  }
  function removeStaff(s) {
    modal(s.display_name + ' ko hatayein?', function () { return el('p', null, 'Is staff ka access band ho jayega.'); }, [{ label: 'Wapas', cls: 'sec' }, { label: 'Hatao', cls: 'primary', fn: function () {
      sb.from('staff').delete().eq('id', s.id).then(function (r) { toast(r.error ? friendly(r.error) : 'Hata diya'); renderStaffTab(); });
    } }]);
  }

  sb.auth.getSession().then(function (s) { if (s.data && s.data.session) start(); else show('login'); }).catch(function () { show('login'); });
})();
