(function () {
  var C = window.RESTROPRO;
  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  var $ = function (id) { return document.getElementById(id); };
  var days = 1, restaurantId = null, timer = null, debounce = null, channel = null;

  function rs(p) { p = Number(p) || 0; var w = Math.floor(p / 100), f = p % 100; return '₹' + w.toLocaleString('en-IN') + (f ? '.' + String(f).padStart(2, '0') : ''); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function dur(s) { s = Math.round(Number(s) || 0); if (!s) return '-'; var m = Math.floor(s / 60); return m ? m + ' min ' + (s % 60) + ' sec' : s + ' sec'; }
  function show(id) { ['login', 'dash'].forEach(function (x) { $(x).hidden = x !== id; }); }

  // ---------- login ----------
  $('lf').addEventListener('submit', function (ev) {
    ev.preventDefault(); $('lerr').textContent = ''; $('lbtn').disabled = true;
    sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value }).then(function (r) {
      $('lbtn').disabled = false;
      if (r.error) { $('lerr').textContent = 'Email ya password galat hai'; return; }
      start();
    }).catch(function () { $('lbtn').disabled = false; $('lerr').textContent = 'Internet check karein'; });
  });
  $('out').onclick = function () { stop(); sb.auth.signOut().then(function () { show('login'); }); };
  $('tabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    days = Number(b.dataset.d);
    [].forEach.call($('tabs').children, function (x) { x.classList.toggle('on', x === b); });
    refresh();
  });

  // ---------- data ----------
  function range() {
    var now = new Date(), end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
    return { from: from.toISOString(), to: end.toISOString() };
  }

  function refresh() {
    if (!restaurantId) return;
    var r = range();
    Promise.all([
      sb.rpc('owner_dashboard', { p_restaurant_id: restaurantId, p_from: r.from, p_to: r.to }),
      sb.from('orders').select('id, table_no, status, source, created_at, order_items(qty, menu_items(name))')
        .in('status', ['pending_approval', 'approved', 'preparing', 'ready']).order('created_at')
    ]).then(function (res) {
      if (res[0].error || res[1].error) throw (res[0].error || res[1].error);
      render(res[0].data, res[1].data);
      $('dash').querySelector('.live').classList.remove('off');
      $('foot').textContent = 'Last update: ' + new Date().toLocaleTimeString('en-IN');
    }).catch(function () { $('dash').querySelector('.live').classList.add('off'); $('foot').textContent = 'Connection problem - dobara try ho raha hai...'; });
  }

  var LABEL = { pending_approval: 'Approve baaki', approved: 'Kitchen me', preparing: 'Ban raha hai', ready: 'Serve karo' };

  function render(d, live) {
    $('k-sales').textContent = rs(d.sales_paise);
    $('k-bills').textContent = d.bills;
    $('k-avg').textContent = rs(d.avg_bill_paise);
    $('k-orders').textContent = d.orders;
    $('k-qr').textContent = d.qr_orders;
    $('k-cancel').textContent = d.cancelled;
    $('k-prep').textContent = dur(d.avg_prep_seconds);
    $('k-gst').textContent = rs(d.gst_paise);

    var board = $('board'); board.replaceChildren();
    $('active-count').textContent = '(' + live.length + ')';
    if (!live.length) board.append(el('div', 'empty', 'Abhi koi order chal nahi raha'));
    live.forEach(function (o) {
      var c = el('div', 'o s-' + o.status), t = el('b', null, 'Table ' + o.table_no), tag = el('em', null, LABEL[o.status] || o.status);
      c.append(tag, t);
      var ul = el('ul'); (o.order_items || []).forEach(function (i) { ul.append(el('li', null, i.qty + ' x ' + ((i.menu_items && i.menu_items.name) || '?'))); });
      c.append(ul); board.append(c);
    });

    var bars = $('bars'); bars.replaceChildren();
    var byHour = {}; (d.hourly || []).forEach(function (h) { byHour[h.hour] = Number(h.sales_paise); });
    var max = Math.max.apply(null, [1].concat(Object.keys(byHour).map(function (k) { return byHour[k]; })));
    for (var h = 0; h < 24; h++) {
      var b = el('div', 'bar'), i = el('i'); i.style.height = Math.round((byHour[h] || 0) / max * 100) + '%';
      i.title = h + ':00 - ' + rs(byHour[h] || 0);
      b.append(i, el('span', null, h % 3 === 0 ? String(h) : '')); bars.append(b);
    }

    var top = $('top'); top.replaceChildren();
    if (!(d.top_items || []).length) top.append(el('div', 'empty', 'Abhi data nahi'));
    (d.top_items || []).forEach(function (t) { var li = el('li', null, t.name + ' '), s = el('small', null, t.qty + ' plate • ' + rs(t.sales_paise)); li.append(s); top.append(li); });
  }

  // ---------- live updates ----------
  function later() { clearTimeout(debounce); debounce = setTimeout(refresh, 600); }
  function stop() { clearInterval(timer); if (channel) { sb.removeChannel(channel); channel = null; } restaurantId = null; }

  function start() {
    sb.auth.getUser().then(function (u) {
      if (u.error || !u.data.user) { show('login'); return; }
      return sb.from('staff').select('role, restaurant_id, restaurants(name)').eq('user_id', u.data.user.id).limit(1).maybeSingle().then(function (r) {
        if (r.error || !r.data) { show('login'); $('lerr').textContent = 'Ye account kisi restaurant se juda nahi hai'; return; }
        if (r.data.role !== 'owner' && r.data.role !== 'manager') { sb.auth.signOut(); show('login'); $('lerr').textContent = 'Dashboard sirf owner / manager ke liye hai'; return; }
        restaurantId = r.data.restaurant_id;
        $('rname').textContent = (r.data.restaurants && r.data.restaurants.name) || 'Dashboard';
        document.title = $('rname').textContent + ' - Dashboard';
        show('dash'); refresh();
        channel = sb.channel('dash-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, later)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, later)
          .subscribe();
        clearInterval(timer); timer = setInterval(refresh, 30000); // safety net if the live connection drops
      });
    }).catch(function () { show('login'); });
  }

  sb.auth.getSession().then(function (s) { if (s.data && s.data.session) start(); else show('login'); }).catch(function () { show('login'); });
})();
