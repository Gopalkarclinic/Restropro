(function(){
  var C = window.RESTROPRO, q = new URLSearchParams(location.search);
  var slug = (q.get('r')||'').toLowerCase(), table = (q.get('t')||'').slice(0,10);
  var app = document.getElementById('app'), bar = document.getElementById('bar'), send = document.getElementById('send');
  var cart = {}, items = [], idemKey = null;

  function el(tag, cls, text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!==undefined) e.textContent=text; return e; }
  function rupees(p){ return '₹' + (p/100).toFixed(p%100 ? 2 : 0); }
  function msg(t){ app.replaceChildren(el('div','msg',t)); bar.hidden = true; }

  if(!/^[a-z0-9-]{3,40}$/.test(slug) || !table){ msg('QR code sahi nahi hai. Waiter ko bulayein.'); return; }
  document.getElementById('tinfo').textContent = 'Table ' + table;

  fetch(C.SUPABASE_URL + '/rest/v1/menu_items?select=id,name,price_paise,is_available,category,description,image_url,is_veg,restaurants!inner(name,slug)&restaurants.slug=eq.' + encodeURIComponent(slug) + '&order=category,name',
    { headers: { apikey: C.SUPABASE_KEY } })
  .then(function(r){ if(!r.ok) throw 0; return r.json(); })
  .then(function(rows){
    if(!rows.length){ msg('Menu abhi available nahi hai.'); return; }
    items = rows;
    document.getElementById('rname').textContent = rows[0].restaurants.name;
    document.title = rows[0].restaurants.name;
    render(); bar.hidden = false;
  }).catch(function(){ msg('Menu load nahi hua. Internet check karein.'); });

  function render(){
    var list = document.createDocumentFragment(), lastCat = null;
    items.forEach(function(it){
      if(it.category !== lastCat){ lastCat = it.category; list.append(el('h2','cat',lastCat)); }
      var row = el('div','item' + (it.is_available ? '' : ' off'));
      if(it.image_url){ var im = el('img','pic'); im.src = it.image_url; im.alt = ''; im.loading = 'lazy'; im.onerror = function(){ im.remove(); }; row.append(im); }
      var info = el('div','info'), nm = el('div','name'); nm.append(el('span','veg' + (it.is_veg === false ? ' nv' : '')), document.createTextNode(it.name));
      info.append(nm); if(it.description) info.append(el('div','desc',it.description)); info.append(el('div','price', it.is_available ? rupees(it.price_paise) : 'Abhi khatam'));
      row.append(info);
      if(it.is_available){
        var qty = el('div','qty'), minus = el('button',null,'−'), n = el('span',null,String(cart[it.id]||0)), plus = el('button',null,'+');
        minus.onclick = function(){ cart[it.id]=Math.max(0,(cart[it.id]||0)-1); n.textContent=cart[it.id]; update(); };
        plus.onclick = function(){ cart[it.id]=Math.min(99,(cart[it.id]||0)+1); n.textContent=cart[it.id]; update(); };
        minus.setAttribute('aria-label','kam karo'); plus.setAttribute('aria-label','badhao');
        qty.append(minus,n,plus); row.append(qty);
      }
      list.append(row);
    });
    app.replaceChildren(list); update();
  }

  function update(){
    var count=0,total=0;
    items.forEach(function(it){ var c=cart[it.id]||0; count+=c; total+=c*it.price_paise; });
    send.disabled = count===0;
    send.textContent = count ? ('Order bhejo • ' + count + ' item • ' + rupees(total)) : 'Order bhejo';
    idemKey = null; // cart changed -> a new order
  }

  send.onclick = function(){
    var lines = items.filter(function(it){return cart[it.id]>0;}).map(function(it){return {menuItemId:it.id, qty:cart[it.id]};});
    if(!lines.length) return;
    if(!idemKey) idemKey = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(36).slice(2));
    send.disabled = true; send.textContent = 'Bhej rahe hain...';
    fetch(C.API_BASE + '/api/public/orders', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({restaurantSlug:slug, tableNo:table, idempotencyKey:idemKey, items:lines}) })
    .then(function(r){ if(r.status===422) return r.json().then(function(j){ throw j.error; }); if(!r.ok) throw 0; return r.json(); })
    .then(function(res){
      bar.hidden = true; cart = {};
      track(res.orderId);
    }).catch(function(e){
      send.disabled = false; update();
      alert(e==='item_unavailable' ? 'Koi item abhi available nahi hai. Page refresh karein.' : 'Order nahi gaya. Internet check karke dobara dabayein.');
    });
  };

  // ---- live order status for the guest (polls the server every few seconds) ----
  var STAGES = {
    pending_approval: ['Order mil gaya!', 'Waiter confirm karenge, phir kitchen me jayega.'],
    approved: ['Kitchen me gaya', 'Aapka order banna shuru hone wala hai.'],
    preparing: ['Ban raha hai', 'Thoda intezaar karein, garma-garam aa raha hai.'],
    ready: ['Aa raha hai!', 'Aapka order table par aa raha hai.'],
    served: ['Enjoy your meal!', 'Dobara order karna ho to page refresh karein.'],
    cancelled: ['Order cancel hua', 'Kripya waiter se baat karein.']
  };
  var pollTimer = null;
  function track(orderId){
    var box = el('div','ok'), h = el('h2'), p = el('p');
    box.append(h,p); app.replaceChildren(box);
    function show(status){ var s = STAGES[status] || STAGES.pending_approval; h.textContent = s[0]; p.textContent = s[1]; }
    show('pending_approval');
    function poll(){
      fetch(C.API_BASE + '/api/public/orders/' + encodeURIComponent(orderId))
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){
          if(j && j.status){ show(j.status); if(j.status==='served'||j.status==='cancelled') return; }
          pollTimer = setTimeout(poll, 6000);
        }).catch(function(){ pollTimer = setTimeout(poll, 10000); });
    }
    clearTimeout(pollTimer); pollTimer = setTimeout(poll, 4000);
  }
})();
