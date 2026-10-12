(function(){
  var q=new URLSearchParams(location.search), slug=(q.get('r')||'').toLowerCase(), n=Math.min(parseInt(q.get('n')||'10',10)||10,100);
  var g=document.getElementById('g');
  document.getElementById('p').onclick=function(){window.print();};
  if(!/^[a-z0-9-]{3,40}$/.test(slug)){g.textContent='Link me ?r=restaurant-slug&n=10 zaroor daalein.';return;}
  document.getElementById('h').textContent='Table QR - '+slug;
  for(var i=1;i<=n;i++){
    var c=document.createElement('div'); c.className='card';
    var im=document.createElement('img'); im.src='/qr/'+slug+'/'+i+'.svg'; im.alt='QR table '+i;
    var b=document.createElement('b'); b.textContent='Table '+i;
    var s=document.createElement('span'); s.textContent='Scan karke order karein';
    c.append(im,b,s); g.append(c);
  }
})();
