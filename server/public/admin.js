(function () {
  'use strict';
  var C = window.RESTROPRO;
  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  var $ = function (id) { return document.getElementById(id); };
  var P = null, R = null, days = 1, view = 'overview', timer = null, debounce = null, channel = null;
  var menu = [], ofilter = 'all';

  // ---------- helpers ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function rs(p) { p = Number(p) || 0; var w = Math.floor(p / 100), f = p % 100; return '₹' + w.toLocaleString('en-IN') + (f ? '.' + String(f).padStart(2, '0') : ''); }
  function dur(s) { s = Math.round(Number(s) || 0); if (!s) return '-'; var m = Math.floor(s / 60); return m ? m + ' min ' + (s % 60) + ' sec' : s + ' sec'; }
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'i' + Date.now() + Math.random().toString(36).slice(2); }
  var toastT; function toast(m) { var t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200); }
  function friendly(e) { var m = (e && e.message) || ''; if (/row-level|42501|permission/i.test(m + (e && e.code))) return 'Aapko ye karne ki anumati nahi hai.'; if (/duplicate|23505/.test(m + (e && e.code))) return 'Ye pehle se maujood hai.'; return 'Nahi ho paya, dobara try karein.'; }
  function modal(title, build, actions) {
    var d = $('dlg'), b = $('dlg-body'); b.replaceChildren(el('h3', null, title));
    var c = build && build(); if (c) b.append(c);
    var a = el('div', 'acts');
    actions.forEach(function (x) { var btn = el('button', 'btn' + (x.pri ? ' pri' : ''), x.label); btn.onclick = function () { var keep = x.fn && x.fn(); if (keep !== false) d.close(); }; a.append(btn); });
    b.append(a); if (!d.open) d.showModal();
  }
  function field(label, input) { var l = el('label', null, label); l.append(input); return l; }
  function show(id) { $('login').hidden = id !== 'login'; $('shell').hidden = id !== 'shell'; }
  var ICON = {
    overview: '<path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"/>',
    orders: '<path d="M7 3h10l3 3v15H4V3zm2 6h8M9 13h8M9 17h5" fill="none" stroke="currentColor" stroke-width="2"/>',
    menu: '<path d="M6 2v8a3 3 0 0 0 3 3v9M9 2v8M12 2v8M17 2c-2 2-3 5-3 8h3v12" fill="none" stroke="currentColor" stroke-width="2"/>',
    tables: '<path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 3h3m1 0h3m-7 4h7" fill="none" stroke="currentColor" stroke-width="2"/>',
    staff: '<circle cx="9" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6m2-12a3 3 0 0 1 0 6m3 6c0-2-1-4-3-5" fill="none" stroke="currentColor" stroke-width="2"/>',
    settings: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10l2 2M19 5l-2 2M7 17l-2 2" fill="none" stroke="currentColor" stroke-width="2"/>'
  };
  var NAV = [['overview', 'Overview'], ['orders', 'Orders'], ['menu', 'Menu'], ['tables', 'Tables & QR'], ['staff', 'Staff', 1], ['settings', 'Settings', 1]];

  // ---------- login / start ----------
  $('lf').addEventListener('submit', function (ev) {
    ev.preventDefault(); $('lerr').textContent = ''; $('lbtn').disabled = true;
    sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value }).then(function (r) {
      $('lbtn').disabled = false;
      if (r.error) { $('lerr').textContent = 'Email ya password galat hai'; return; }
      start();
    }).catch(function () { $('lbtn').disabled = false; $('lerr').textContent = 'Internet check karein'; });
  });
  $('out').onclick = function () { stop(); sb.auth.signOut().then(function () { show('login'); }); };

  function loadRestaurant() {
    return sb.from('restaurants').select('id, name, slug, gst_scheme, phone, address, table_count').eq('id', P.rid).single().then(function (r) {
      if (r.error) throw r.error; R = r.data; $('rname').textContent = R.name; document.title = R.name + ' - Admin';
    });
  }
  function start() {
    sb.auth.getUser().then(function (u) {
      if (u.error || !u.data.user) { show('login'); return; }
      return sb.from('staff').select('role, restaurant_id').eq('user_id', u.data.user.id).limit(1).then(function (r) {
        var row = r.data && r.data[0];
        if (r.error || !row) { sb.auth.signOut(); show('login'); $('lerr').textContent = 'Ye account kisi restaurant se juda nahi hai'; return; }
        if (row.role !== 'owner' && row.role !== 'manager') { sb.auth.signOut(); show('login'); $('lerr').textContent = 'Admin sirf owner / manager ke liye hai. Staff app use karein.'; return; }
        P = { role: row.role, rid: row.restaurant_id };
        return loadRestaurant().then(function () {
          buildNav(); show('shell'); go('overview');
          if (channel) sb.removeChannel(channel);
          channel = sb.channel('admin-live').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, later).on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, later).subscribe();
          clearInterval(timer); timer = setInterval(function () { refreshLive(); }, 30000);
        });
      });
    }).catch(function () { show('login'); });
  }
  function stop() { clearInterval(timer); if (channel) { sb.removeChannel(channel); channel = null; } P = null; R = null; }
  function later() { clearTimeout(debounce); debounce = setTimeout(refreshLive, 600); }

  // ---------- nav ----------
  function buildNav() {
    var n = $('nav'); n.replaceChildren();
    NAV.forEach(function (x) {
      if (x[2] && P.role !== 'owner') return;
      var b = el('button'); b.dataset.v = x[0]; b.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor">' + ICON[x[0]] + '</svg>'; b.append(el('span', null, x[1]));
      b.onclick = function () { go(x[0]); closeSide(); }; n.append(b);
    });
  }
  function closeSide() { $('side').classList.remove('open'); $('scrim').hidden = true; }
  $('burger').onclick = function () { $('side').classList.add('open'); $('scrim').hidden = false; };
  $('scrim').onclick = closeSide;
  $('range').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return; days = Number(b.dataset.d);
    [].forEach.call($('range').children, function (x) { x.classList.toggle('on', x === b); }); refreshLive();
  });
  function go(v) {
    view = v;
    ['overview', 'orders', 'menu', 'tables', 'staff', 'settings'].forEach(function (x) { $('v-' + x).hidden = x !== v; });
    [].forEach.call($('nav').children, function (b) { b.classList.toggle('on', b.dataset.v === v); });
    $('title').textContent = (NAV.filter(function (x) { return x[0] === v; })[0] || [0, ''])[1];
    $('range').hidden = !(v === 'overview' || v === 'orders');
    if (v === 'overview' || v === 'orders') refreshLive(); if (v === 'menu') loadMenu(); if (v === 'tables') renderTables(); if (v === 'staff') loadStaff(); if (v === 'settings') fillSettings();
  }
  function range() {
    var n = new Date(); return { from: new Date(n.getFullYear(), n.getMonth(), n.getDate() - (days - 1)).toISOString(), to: new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).toISOString() };
  }

  // ---------- overview + orders ----------
  var LABEL = { pending_approval: 'Approve baaki', approved: 'Approved', preparing: 'Ban raha hai', ready: 'Ready', served: 'Served', cancelled: 'Cancelled' };
  function refreshLive() {
    if (!P) return; var rg = range();
    var jobs = [sb.from('orders').select('id, table_no, status, source, created_at, order_items(qty, menu_items(name))').in('status', ['pending_approval', 'approved', 'preparing', 'ready']).order('created_at')];
    if (view === 'overview') jobs.push(sb.rpc('owner_dashboard', { p_restaurant_id: P.rid, p_from: rg.from, p_to: rg.to }));
    if (view === 'orders') jobs.push(sb.from('orders').select('id, table_no, status, source, created_at, order_items(qty, menu_items(name))').gte('created_at', rg.from).lt('created_at', rg.to).order('created_at', { ascending: false }).limit(200));
    Promise.all(jobs).then(function (res) {
      res.forEach(function (x) { if (x.error) throw x.error; });
      $('live').classList.remove('off');
      if (view === 'overview') renderOverview(res[1].data, res[0].data);
      if (view === 'orders') renderOrders(res[1].data);
    }).catch(function () { $('live').classList.add('off'); });
  }
  function kpi(label, val, cls, sub) { var k = el('div', 'kpi' + (cls ? ' ' + cls : '')); k.append(el('span', null, label), el('b', null, val)); if (sub) k.append(el('small', null, sub)); return k; }
  function renderOverview(d, live) {
    var k = $('kpis'); k.replaceChildren();
    var gst = R.gst_scheme !== 'composition';
    k.append(kpi(gst ? 'Total bikri (GST sahit)' : 'Total bikri', rs(d.sales_paise), 'hero', d.bills + ' bills'), kpi('Average bill', rs(d.avg_bill_paise)), kpi('Orders', String(d.orders), '', d.qr_orders + ' QR se'), kpi('Kitchen time (avg)', dur(d.avg_prep_seconds), '', d.cancelled + ' cancel'));
    var ch = $('chart'); ch.replaceChildren();
    var by = {}; (d.hourly || []).forEach(function (h) { by[h.hour] = Number(h.sales_paise); });
    var vals = Object.keys(by).map(function (x) { return by[x]; }), max = Math.max.apply(null, [1].concat(vals)), peakH = -1;
    for (var h = 0; h < 24; h++) if ((by[h] || 0) === max && max > 1) peakH = h;
    for (var i = 6; i < 24; i++) { var b = el('div', 'b' + (i === peakH ? ' peak' : '')), bar = el('i'); bar.style.height = Math.round((by[i] || 0) / max * 100) + '%'; bar.title = i + ':00 - ' + rs(by[i] || 0); b.append(bar, el('span', null, i % 2 === 0 ? String(i) : '')); ch.append(b); }
    $('peak').textContent = peakH >= 0 ? 'Busiest: ' + peakH + ':00 - ' + (peakH + 1) + ':00' : '';
    var top = $('top'); top.replaceChildren();
    if (!(d.top_items || []).length) top.append(el('div', 'empty', 'Abhi data nahi'));
    (d.top_items || []).forEach(function (t) { var li = el('li'), n = el('div', 'n', t.name); n.append(el('small', null, t.qty + ' plate')); li.append(n, el('b', null, rs(t.sales_paise))); top.append(li); });
    var lb = $('liveBoard'); lb.replaceChildren(); $('activeN').textContent = String(live.length);
    if (!live.length) lb.append(el('div', 'empty', 'Abhi koi order chal nahi raha'));
    live.forEach(function (o) {
      var c = el('div', 'lo ' + o.status), t = el('b', null, 'Table ' + o.table_no); t.append(el('em', null, LABEL[o.status] || o.status)); c.append(t);
      var ul = el('ul'); (o.order_items || []).forEach(function (i) { ul.append(el('li', null, i.qty + ' x ' + ((i.menu_items && i.menu_items.name) || '?'))); }); c.append(ul); lb.append(c);
    });
  }
  function renderOrders(list) {
    var f = $('ofilter'); if (!f.children.length) {
      [['all', 'Sab'], ['pending_approval', 'Approve baaki'], ['preparing', 'Ban raha'], ['ready', 'Ready'], ['served', 'Served'], ['cancelled', 'Cancel']].forEach(function (x) {
        var b = el('button', x[0] === ofilter ? 'on' : '', x[1]); b.dataset.s = x[0]; b.onclick = function () { ofilter = x[0]; [].forEach.call(f.children, function (y) { y.classList.toggle('on', y === b); }); renderOrders(window.__ol || []); }; f.append(b);
      });
    }
    window.__ol = list; var tb = $('otbody'); tb.replaceChildren();
    var rows = list.filter(function (o) { return ofilter === 'all' || o.status === ofilter; });
    if (!rows.length) { var tr = el('tr'), td = el('td', 'empty', 'Koi order nahi'); td.colSpan = 5; tr.append(td); tb.append(tr); return; }
    rows.forEach(function (o) {
      var tr = el('tr'); tr.append(el('td', null, new Date(o.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })), el('td', null, 'Table ' + o.table_no),
        el('td', null, (o.order_items || []).map(function (i) { return i.qty + '× ' + ((i.menu_items && i.menu_items.name) || '?'); }).join(', ')), el('td', null, o.source === 'qr' ? 'QR' : 'Captain'));
      var s = el('td'); s.append(el('span', 'tag ' + o.status, LABEL[o.status] || o.status)); tr.append(s); tb.append(tr);
    });
  }

  // ---------- menu ----------
  function loadMenu() {
    sb.from('menu_items').select('id, name, price_paise, is_available, category, description, image_url, is_veg').eq('restaurant_id', P.rid).order('category').order('name').then(function (r) {
      if (r.error) throw r.error; menu = r.data; renderMenu();
    }).catch(function () { $('mtbody').replaceChildren(); toast('Menu load nahi hua'); });
  }
  $('msearch').oninput = function () { renderMenu(); }; $('mcat').onchange = function () { renderMenu(); };
  $('madd').onclick = function () { editItem(); };
  function thumb(m) { var t = el('div', 'thumb'); if (m.image_url) { var i = el('img'); i.src = m.image_url; i.alt = ''; i.loading = 'lazy'; i.onerror = function () { i.remove(); t.textContent = m.name.charAt(0).toUpperCase(); }; t.append(i); } else t.textContent = m.name.charAt(0).toUpperCase(); return t; }
  function renderMenu() {
    var sel = $('mcat'), cur = sel.value, cats = []; menu.forEach(function (m) { if (cats.indexOf(m.category) < 0) cats.push(m.category); });
    sel.replaceChildren(); var all = el('option', null, 'Sab categories'); all.value = ''; sel.append(all); cats.forEach(function (c) { var o = el('option', null, c); o.value = c; sel.append(o); }); sel.value = cats.indexOf(cur) >= 0 ? cur : '';
    var q = $('msearch').value.trim().toLowerCase(), tb = $('mtbody'); tb.replaceChildren();
    var rows = menu.filter(function (m) { return (!sel.value || m.category === sel.value) && (!q || m.name.toLowerCase().indexOf(q) >= 0); });
    if (!rows.length) { var tr = el('tr'), td = el('td', 'empty', 'Koi item nahi'); td.colSpan = 6; tr.append(td); tb.append(tr); }
    rows.forEach(function (m) {
      var tr = el('tr'), a = el('td'); a.append(thumb(m));
      var n = el('td'), v = el('span', 'veg' + (m.is_veg ? '' : ' nv')); n.append(v, document.createTextNode(m.name)); if (m.description) n.append(el('div', 'muted', m.description));
      var sw = el('button', 'sw' + (m.is_available ? ' on' : '')); sw.setAttribute('aria-label', 'available'); var s = el('td'); s.append(sw);
      sw.onclick = function () { sb.from('menu_items').update({ is_available: !m.is_available }).eq('id', m.id).then(function (r) { if (r.error) toast(friendly(r.error)); loadMenu(); }); };
      var ac = el('td'), box = el('div', 'act'), e = el('button', null, 'Edit'), d = el('button', 'd', 'Delete'); e.onclick = function () { editItem(m); }; d.onclick = function () { delItem(m); }; box.append(e, d); ac.append(box);
      tr.append(a, n, el('td', null, m.category), el('td', 'r', rs(m.price_paise)), s, ac); tb.append(tr);
    });
  }
  function compress(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(); }, 'image/webp', 0.8);
      }; img.onerror = function () { rej(); }; img.src = url;
    });
  }
  function editItem(m) {
    var f = {}, imgUrl = m ? m.image_url : null, prev;
    modal(m ? 'Item edit karein' : 'Naya item', function () {
      var w = el('div');
      prev = el('div', 'thumb'); function paint() { prev.replaceChildren(); if (imgUrl) { var i = el('img'); i.src = imgUrl; i.alt = ''; i.onerror = function () { i.remove(); prev.textContent = '!'; }; prev.append(i); } else prev.textContent = '+'; } paint();
      var pick = el('div', 'imgpick'), btns = el('div', 'btns'), file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
      var up = el('button', 'btn', 'Photo upload'), rm = el('button', 'btn', 'Photo hatao'); up.type = rm.type = 'button';
      up.onclick = function () { file.click(); }; rm.onclick = function () { imgUrl = null; paint(); };
      file.onchange = function () {
        if (!file.files[0]) return; up.disabled = true; up.textContent = 'Upload ho raha hai...';
        compress(file.files[0]).then(function (blob) {
          var path = P.rid + '/' + uid() + '.webp';
          return sb.storage.from('menu-images').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' }).then(function (r) {
            if (r.error) throw r.error; imgUrl = C.SUPABASE_URL + '/storage/v1/object/public/menu-images/' + path; paint();
          });
        }).catch(function () { toast('Photo upload nahi hui (1 MB se chhoti JPG/PNG try karein)'); }).then(function () { up.disabled = false; up.textContent = 'Photo upload'; });
      };
      btns.append(up, rm, file); pick.append(prev, btns); w.append(pick);
      f.url = el('input'); f.url.placeholder = 'ya photo ka link (https://...)'; f.url.value = ''; f.url.onchange = function () { var v = f.url.value.trim(); if (/^https:\/\//.test(v)) { imgUrl = v; paint(); } else if (v) toast('Link https:// se shuru hona chahiye'); };
      w.append(field('Photo link (optional)', f.url));
      f.name = el('input'); f.name.maxLength = 120; f.name.value = m ? m.name : ''; w.append(field('Dish ka naam', f.name));
      f.price = el('input'); f.price.type = 'number'; f.price.min = '0'; f.price.step = '0.5'; f.price.value = m ? m.price_paise / 100 : ''; w.append(field('Kimat (₹)', f.price));
      f.cat = el('input'); f.cat.maxLength = 40; f.cat.setAttribute('list', 'catlist'); f.cat.value = m ? m.category : ''; var dl = el('datalist'); dl.id = 'catlist'; var seen = {}; menu.forEach(function (x) { if (!seen[x.category]) { seen[x.category] = 1; var o = el('option'); o.value = x.category; dl.append(o); } }); w.append(field('Category', f.cat), dl);
      f.desc = el('input'); f.desc.maxLength = 200; f.desc.value = (m && m.description) || ''; w.append(field('Chhota description (optional)', f.desc));
      var vl = el('label', 'chk'); f.veg = el('input'); f.veg.type = 'checkbox'; f.veg.checked = m ? m.is_veg : true; vl.append(f.veg, document.createTextNode('Veg hai')); w.append(vl);
      return w;
    }, [{ label: 'Wapas' }, { label: 'Save karo', pri: 1, fn: function () {
      var name = f.name.value.trim(), ru = parseFloat(f.price.value);
      if (!name || !(ru >= 0)) { toast('Naam aur sahi kimat daalein'); return false; }
      var v = f.url.value.trim(); if (/^https:\/\//.test(v)) imgUrl = v;
      var row = { name: name, price_paise: Math.round(ru * 100), category: f.cat.value.trim() || 'Other', description: f.desc.value.trim() || null, image_url: imgUrl || null, is_veg: f.veg.checked };
      var q = m ? sb.from('menu_items').update(row).eq('id', m.id) : sb.from('menu_items').insert(Object.assign({ restaurant_id: P.rid }, row));
      q.then(function (r) { if (r.error) toast(friendly(r.error)); else toast('Save ho gaya'); loadMenu(); });
    } }]);
  }
  function delItem(m) {
    modal(m.name + ' hatayein?', function () { return el('p', 'muted', 'Purane orders/bills me ye item dikhta rahega. Agar sirf kuch din ke liye band karna hai to "Available" switch off karein.'); },
      [{ label: 'Wapas' }, { label: 'Hatao', pri: 1, fn: function () { sb.from('menu_items').delete().eq('id', m.id).then(function (r) { toast(r.error ? 'Ye item purane orders me use hua hai - isko "Available" off karke chhupa dein.' : 'Hata diya'); loadMenu(); }); } }]);
  }

  // ---------- tables ----------
  function base() { return location.origin; }
  function renderTables() {
    $('tcount').value = R.table_count; $('tcount').disabled = $('tsave').disabled = P.role !== 'owner';
    $('tprint').href = '/qr-sheet.html?r=' + encodeURIComponent(R.slug) + '&n=' + R.table_count;
    var g = $('tgrid'); g.replaceChildren();
    for (var i = 1; i <= R.table_count; i++) (function (n) {
      var c = el('div', 'tc'), im = el('img'); im.src = '/qr/' + R.slug + '/' + n + '.svg'; im.alt = 'QR table ' + n; im.loading = 'lazy';
      var b = el('button', null, 'Link copy'); b.onclick = function () { var u = base() + '/?r=' + R.slug + '&t=' + n; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('Link copy ho gaya'); }).catch(function () { toast(u); }); };
      c.append(im, el('b', null, 'Table ' + n), b); g.append(c);
    })(i);
  }
  $('tsave').onclick = function () {
    var n = parseInt($('tcount').value, 10); if (!(n >= 1 && n <= 200)) { toast('1 se 200 ke beech number daalein'); return; }
    sb.from('restaurants').update({ table_count: n }).eq('id', P.rid).then(function (r) { if (r.error) return toast(friendly(r.error)); R.table_count = n; toast('Save ho gaya'); renderTables(); });
  };

  // ---------- staff ----------
  function api(path, body) {
    return sb.auth.getSession().then(function (s) {
      var tok = s.data && s.data.session && s.data.session.access_token;
      return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); });
    });
  }
  var RL = { owner: 'Owner', manager: 'Manager', captain: 'Captain', kitchen: 'Kitchen' };
  function loadStaff() {
    sb.from('staff').select('id, role, display_name').eq('restaurant_id', P.rid).order('created_at').then(function (r) {
      if (r.error) throw r.error; var tb = $('stbody'); tb.replaceChildren();
      r.data.forEach(function (s) {
        var tr = el('tr'), a = el('td'), box = el('div', 'act');
        if (s.role !== 'owner') { var pw = el('button', null, 'Password'), d = el('button', 'd', 'Hatao'); pw.onclick = function () { resetPw(s); }; d.onclick = function () { removeStaff(s); }; box.append(pw, d); }
        a.append(box); tr.append(el('td', null, s.display_name), el('td', null, RL[s.role] || s.role), a); tb.append(tr);
      });
    }).catch(function () { toast('Staff load nahi hua'); });
  }
  $('sadd').onclick = function () {
    var nm, em, pw, rl;
    modal('Naya staff', function () {
      var w = el('div'); nm = el('input'); em = el('input'); em.type = 'email'; pw = el('input'); pw.type = 'text'; rl = el('select');
      [['captain', 'Captain (order lena)'], ['kitchen', 'Kitchen'], ['manager', 'Manager (admin access)']].forEach(function (x) { var o = el('option', null, x[1]); o.value = x[0]; rl.append(o); });
      w.append(field('Naam', nm), field('Email (login ke liye)', em), field('Password (8+ akshar)', pw), field('Role', rl)); return w;
    }, [{ label: 'Wapas' }, { label: 'Account banao', pri: 1, fn: function () {
      if (!nm.value.trim() || !em.value.trim() || pw.value.length < 8) { toast('Naam, email aur 8+ akshar ka password daalein'); return false; }
      api('/api/staff', { displayName: nm.value.trim(), email: em.value.trim(), password: pw.value, role: rl.value }).then(function (r) { toast(r.ok ? 'Account ban gaya. Email-password staff ko de dein.' : (r.j.error === 'email_exists' ? 'Ye email pehle se hai' : 'Account nahi bana')); loadStaff(); });
    } }]);
  };
  function resetPw(s) {
    var pw; modal(s.display_name + ': naya password', function () { pw = el('input'); return field('Naya password (8+ akshar)', pw); }, [{ label: 'Wapas' }, { label: 'Badlo', pri: 1, fn: function () {
      if (pw.value.length < 8) { toast('Kam se kam 8 akshar'); return false; }
      api('/api/staff/password', { staffId: s.id, password: pw.value }).then(function (r) { toast(r.ok ? 'Password badal gaya' : 'Nahi badla'); });
    } }]);
  }
  function removeStaff(s) {
    modal(s.display_name + ' ko hatayein?', function () { return el('p', 'muted', 'Iska access turant band ho jayega.'); }, [{ label: 'Wapas' }, { label: 'Hatao', pri: 1, fn: function () { sb.from('staff').delete().eq('id', s.id).then(function (r) { toast(r.error ? friendly(r.error) : 'Hata diya'); loadStaff(); }); } }]);
  }

  // ---------- settings ----------
  function fillSettings() { $('s-name').value = R.name; $('s-phone').value = R.phone || ''; $('s-addr').value = R.address || ''; $('s-gst').value = R.gst_scheme; }
  $('s-save').onclick = function () {
    var name = $('s-name').value.trim(); if (!name) { toast('Naam zaroori hai'); return; }
    var row = { name: name, phone: $('s-phone').value.trim() || null, address: $('s-addr').value.trim() || null, gst_scheme: $('s-gst').value };
    sb.from('restaurants').update(row).eq('id', P.rid).then(function (r) { if (r.error) return toast(friendly(r.error)); Object.assign(R, row); $('rname').textContent = R.name; toast('Save ho gaya'); });
  };
  $('s-pwb').onclick = function () {
    var p = $('s-pw').value; if (p.length < 8) { toast('Kam se kam 8 akshar'); return; }
    sb.auth.updateUser({ password: p }).then(function (r) { toast(r.error ? 'Password nahi badla, dobara login karke try karein' : 'Password badal gaya'); $('s-pw').value = ''; });
  };

  sb.auth.getSession().then(function (s) { if (s.data && s.data.session) start(); else show('login'); }).catch(function () { show('login'); });
})();
