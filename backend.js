/* Connect the static UI to the local Python API. UI remains usable in demo mode if API is stopped. */
(() => {
  const tokenKey='vibrantToken', userKey='vibrantUser', roleKey='vibrantRole', page=document.body.dataset.page;
  const token=()=>sessionStorage.getItem(tokenKey);
  const role=()=>sessionStorage.getItem(roleKey)||'';
  async function api(path, options={}){
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    if(token()) headers.Authorization = 'Bearer ' + token();
    const response=await fetch(path,{...options,headers});
    const data=await response.json().catch(()=>({error:'Server response was not valid JSON.'}));
    if(!response.ok) throw new Error(data.error||`Request failed (${response.status})`);
    return data;
  }
  function message(form,text,error=false){let el=form.querySelector('.api-message');if(!el){el=document.createElement('p');el.className='api-message';form.append(el)}el.textContent=text;el.style.color=error?'#b42318':'#16804a'}
  function photo(e){const value=e.photo||'photo-1521737711867-e3b97375f902';return value.startsWith('/uploads/')||value.startsWith('data:')||value.startsWith('http')?value:`https://images.unsplash.com/${value}?auto=format&fit=crop&w=1000&q=80`}
  function money(n){return Number(n)===0?'Free':'₹'+Number(n).toLocaleString('en-IN')}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function exportCsv(filename, rows){
    const csv=rows.map(row=>row.map(cell=>{const text=String(cell ?? '').replace(/\r?\n/g,' ');return `"${text.replace(/"/g,'""')}"`;}).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    return csv;
  }
  function exportAttendeeSheet(rows=[]){
    const attendeeRows=[['Attendee','Email','Event','Date','Tickets','Total','Status']];
    const source=Array.isArray(rows)?rows:[];
    if(source.length){
      source.forEach(booking=>attendeeRows.push([booking.name||'',booking.email||'',booking.title||'',booking.date||'',booking.qty||0,booking.total||0,booking.status||'']));
    }
    localStorage.setItem('vibrantGoogleSheetExport', JSON.stringify(attendeeRows));
    exportCsv('vibrant-attendee-data.csv', attendeeRows);
    return attendeeRows;
  }
  const signIn=(form,route)=>{form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form);try{const data=await api(`/api/auth/${route}`,{method:'POST',body:JSON.stringify(Object.fromEntries(f))});sessionStorage.setItem(tokenKey,data.token);sessionStorage.setItem(userKey,data.user.email);sessionStorage.setItem(roleKey,data.user.role||'attendee');location.href=data.user.role==='organizer'?'organizer.html':'index.html'}catch(err){message(form,err.message,true)}}};
  if(page==='login')signIn(document.getElementById('login'),'login');
  if(page==='register')signIn(document.getElementById('register'),'register');
  if(page==='login'||page==='register'){
    const small=document.querySelector('form small');if(small)small.textContent=page==='register'?'Choose an account type: Organizers publish events; Attendees discover and book them.':'Your account opens the Organizer or Attendee area assigned at registration.';
    return;
  }
  const requiredRole={create:'organizer',organizer:'organizer',checkout:'attendee',bookings:'attendee',plan:'attendee',ai:'attendee'}[page];
  function logout(){
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(userKey);
    sessionStorage.removeItem(roleKey);
    sessionStorage.removeItem('checkout');
    location.href='login.html';
  }
  function ensureLogoutButton(){
    const header=document.querySelector('header');
    if(!header)return;
    let button=header.querySelector('.logout-btn');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='button outline logout-btn';
      button.textContent='Logout';
      const signIn=header.querySelector('a[href="login.html"]');
      if(signIn) signIn.insertAdjacentElement('afterend',button);
      else header.appendChild(button);
    }
    const loggedIn=Boolean(token());
    button.style.display=loggedIn?'inline-block':'none';
    button.onclick=logout;
    document.querySelectorAll('header a[href="login.html"]').forEach(a=>{a.hidden=loggedIn;});
  }
  function applyRoleUI(activeRole){
    const isOrganizer=activeRole==='organizer';
    const allowedNav=isOrganizer?new Set(['events.html','organizer.html']):new Set(['events.html','ai-assistant.html','plan-together.html','bookings.html']);
    document.querySelectorAll('header nav a').forEach(a=>{a.hidden=!allowedNav.has(a.getAttribute('href')?.split('?')[0])});
    ensureLogoutButton();
    document.querySelectorAll('a[href="organizer.html"]').forEach(a=>{a.style.display=isOrganizer?'':'none'});
    document.querySelectorAll('a[href="create-event.html"]').forEach(a=>{a.style.display=isOrganizer?'':'none'});
    document.querySelectorAll('a[href="bookings.html"],a[href="plan-together.html"]').forEach(a=>{a.style.display=isOrganizer?'none':''});
    document.querySelectorAll('a[href="ai-assistant.html"]').forEach(a=>{a.style.display=isOrganizer?'none':''});
    if(isOrganizer){const book=document.getElementById('book');if(book){book.style.display='none';if(!document.getElementById('roleNotice')){const note=document.createElement('p');note.id='roleNotice';note.className='muted';note.textContent='Organizer accounts can publish and manage events. Booking is available to Attendee accounts.';book.insertAdjacentElement('afterend',note)}}}
  }
  if(!token()&&requiredRole)location.replace('login.html');
  else if(token())api('/api/auth/me').then(({user})=>{
    if(!user)return;
    sessionStorage.setItem(roleKey,user.role||'attendee');applyRoleUI(user.role||'attendee');
    if(requiredRole&&user.role!==requiredRole)location.replace(user.role==='organizer'?'organizer.html':'events.html');
  }).catch(()=>{sessionStorage.removeItem(tokenKey);sessionStorage.removeItem(roleKey);if(requiredRole)location.replace('login.html')});
  else applyRoleUI('');
  if(page==='home'&&!token()) location.replace('login.html');
  api('/api/events').then(serverEvents=>{
    if(!Array.isArray(serverEvents)||!serverEvents.length)return;
    events=serverEvents;
    const filters=document.querySelector('.filters');
    if(filters){const known=new Set([...filters.querySelectorAll('[data-category]')].map(b=>b.dataset.category));[...new Set(events.map(x=>x.category).filter(Boolean))].forEach(cat=>{if(known.has(cat))return;const button=document.createElement('button');button.type='button';button.dataset.category=cat;button.textContent=cat;button.onclick=()=>{category=cat;filters.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('selected',x===button));drawList()};filters.append(button)})}
    drawList();
    const plannerCategory=document.getElementById('planCategory');
    if(plannerCategory){const knownOptions=new Set([...plannerCategory.options].map(o=>o.value));[...new Set(events.map(x=>x.category).filter(Boolean))].forEach(cat=>{if(knownOptions.has(cat))return;const option=document.createElement('option');option.value=cat;option.textContent=cat;plannerCategory.append(option)});window.refreshPlanEvents?.()}
    const detail=document.getElementById('detail');
    const eventId=Number(new URLSearchParams(location.search).get('id'));
    const currentEvent=events.find(x=>x.id===eventId)||events[0];
    if(detail){const stats=[{label:'Seats left',value:Math.max(0,(currentEvent.capacity||100)-((currentEvent.booked||0)))},{label:'Format',value:currentEvent.location==='Online'?'Virtual':'In person'},{label:'Price',value:money(currentEvent.price)}];detail.innerHTML=`<div class="detail-hero"><div class="detail-cover" style="background-image:url('${photo(currentEvent)}')"><span class="detail-badge">${esc(currentEvent.category)}</span></div><div class="detail-body"><div class="detail-meta"><span class="chip">📍 ${esc(currentEvent.location)}</span><span class="chip">📅 ${esc(currentEvent.date)}</span><span class="chip">⏰ ${esc(currentEvent.time)}</span></div><h1>${esc(currentEvent.title)}</h1><div class="detail-description">${esc(currentEvent.description)}</div><div class="detail-stats">${stats.map(s=>`<div class="detail-stat"><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></div>`).join('')}</div></div></div><div class="detail-grid two-column"><div class="box"><h2>What you'll get</h2><ul class="feature-list"><li>Curated sessions led by experienced speakers and founders.</li><li>Hands-on networking time with fellow attendees and operators.</li><li>Practical takeaways you can use immediately after the event.</li></ul></div><div class="box"><h2>Agenda snapshot</h2><div class="agenda-list"><div class="agenda-item"><div class="agenda-time">9:30</div><div class="agenda-copy"><h3>Welcome + introductions</h3><p>Fast-paced opening and community check-in.</p></div></div><div class="agenda-item"><div class="agenda-time">10:15</div><div class="agenda-copy"><h3>Keynote session</h3><p>Actionable lessons from top operators and builders.</p></div></div><div class="agenda-item"><div class="agenda-time">12:00</div><div class="agenda-copy"><h3>Networking break</h3><p>Meet peers, collaborators, and event partners.</p></div></div></div></div></div><div class="box detail-panel"><h2>About this event</h2><p class="detail-description">${esc(currentEvent.description)}</p><ul class="notes-list"><li>Great for people who want to learn, connect, and grow with the community.</li><li>Includes access to all sessions, workshops, and the networking lounge.</li></ul></div><div class="box detail-panel"><div class="title-row" style="margin:0 0 12px"><div><h2>Reviews & feedback</h2><p id="reviewSummary" class="muted">Loading reviews…</p></div></div><div id="reviewList"></div><form id="reviewForm" style="display:grid;gap:10px;margin-top:16px"><label>Rating<select name="rating"><option value="5">5 — Excellent</option><option value="4">4 — Very good</option><option value="3">3 — Good</option><option value="2">2 — Fair</option><option value="1">1 — Poor</option></select></label><label>Your feedback<textarea name="comment" placeholder="Share what stood out about this event." required maxlength="500"></textarea></label><p id="reviewPrompt" class="muted" style="margin:0">Attendee accounts can leave feedback after booking.</p><button type="submit" class="button full">Submit review</button></form></div>`;const priceEl=document.getElementById('price');if(priceEl){priceEl.innerHTML=`<div class="price-pill">${money(currentEvent.price)}<small>/ person</small></div><div class="ticket-summary">${currentEvent.location==='Online'?'Online access':'Location: '+esc(currentEvent.location)}<br><strong>${Math.max(0,(currentEvent.capacity||100)-((currentEvent.booked||0)))} spots left</strong></div>`;}document.getElementById('book').onclick=()=>{if(!token()){location.href='login.html';return}const ticket=document.getElementById('ticketType').value,qty=Number(document.getElementById('qty').value),unit=ticket==='vip'?1499:ticket==='student'?299:currentEvent.price;sessionStorage.setItem('checkout',JSON.stringify({id:currentEvent.id,qty,total:unit*qty,ticket}));location.href='checkout.html'}};
    const reviewForm=document.getElementById('reviewForm');
    const reviewList=document.getElementById('reviewList');
    const reviewSummary=document.getElementById('reviewSummary');
    const reviewPrompt=document.getElementById('reviewPrompt');
    async function loadReviews(){
      try{
        const data=await api(`/api/events/${currentEvent.id}/reviews`);
        const reviews=Array.isArray(data.reviews)?data.reviews:[];
        const average=Number(data.average_rating||0);
        reviewSummary.textContent=`${reviews.length ? `${average.toFixed(1)} / 5 average` : 'No reviews yet'} • ${reviews.length} review${reviews.length===1?'':'s'}`;
        if(!reviews.length){reviewList.innerHTML='<div class="empty">Be the first to share feedback for this event.</div>';return;}
        reviewList.innerHTML=reviews.map(r=>`<div class="box" style="margin:8px 0;padding:14px 16px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><strong>${esc(r.user_name||'Guest')}</strong><div style="color:#6f6a8f;font-size:12px">${'★'.repeat(Number(r.rating||0))}${'☆'.repeat(5-(Number(r.rating||0)))} · ${new Date(r.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div></div>${r.can_delete?`<button type="button" data-delete-review="${r.id}" class="text-button">Delete</button>`:''}</div><p style="margin:12px 0 0;color:#4b4761;line-height:1.7">${esc(r.comment)}</p></div>`).join('');
      }catch(err){
        reviewSummary.textContent='Reviews unavailable right now.';
        reviewList.innerHTML=`<div class="empty">${esc(err.message)}</div>`;
      }
    }
    if(reviewForm){
      const submitButton=reviewForm.querySelector('button[type="submit"]');
      const hasToken=Boolean(token());
      if(!hasToken){
        reviewForm.querySelector('textarea').disabled=true;
        reviewForm.querySelector('select').disabled=true;
        submitButton.disabled=true;
        submitButton.textContent='Sign in to review';
        reviewPrompt.textContent='Sign in with an attendee account and book this event to leave feedback.';
      }else{
        reviewForm.onsubmit=async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(reviewForm));try{const data=await api(`/api/events/${currentEvent.id}/reviews`,{method:'POST',body:JSON.stringify({rating:Number(payload.rating),comment:String(payload.comment).trim()})});message(reviewForm,`Your review was saved. ${data.rating}/5`,false);reviewForm.reset();await loadReviews();}catch(err){message(reviewForm,err.message,true);}};
      }
      loadReviews();
    }
    if(reviewList){reviewList.addEventListener('click',async e=>{const button=e.target.closest('[data-delete-review]');if(!button)return;try{await api(`/api/events/${currentEvent.id}/reviews/${button.dataset.deleteReview}`,{method:'DELETE'});await loadReviews();}catch(err){message(reviewForm||document.body,err.message,true);}});}
    const results=document.getElementById('aiResults');if(results&&typeof renderAI==='function')renderAI();
  }).catch(()=>{});
  const create=document.getElementById('create');
  const imageInput=document.getElementById('eventImage'),imagePreview=document.getElementById('eventImagePreview');
  if(imageInput&&imagePreview)imageInput.onchange=()=>{const file=imageInput.files[0];imagePreview.replaceChildren();if(!file){imagePreview.hidden=true;return}if(file.size>5*1024*1024){imageInput.value='';message(create,'Image must be 5 MB or smaller.',true);imagePreview.hidden=true;return}const img=document.createElement('img');img.src=URL.createObjectURL(file);img.alt='Selected event image preview';imagePreview.append(img);imagePreview.hidden=false};
  const editId=new URLSearchParams(location.search).get('id');
  let editingEvent=null;
  if(create&&editId){
    const title=document.getElementById('eventFormTitle'),description=document.getElementById('eventFormDescription'),submit=document.getElementById('eventSubmit'),cancel=document.getElementById('eventCancel');
    title.textContent='Update event';description.textContent='Edit the event details and save your changes.';submit.textContent='Save changes';cancel.hidden=false;
    api(`/api/events/${encodeURIComponent(editId)}`).then(ev=>{
      editingEvent=ev;
      for(const [name,value] of Object.entries({title:ev.title,category:ev.category,location:ev.location,date:/^\d{4}-\d{2}-\d{2}$/.test(ev.date)?ev.date:(()=>{const d=new Date(ev.date);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})(),time:/^\d{2}:\d{2}$/.test(ev.time)?ev.time:(()=>{const m=String(ev.time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return '';let h=Number(m[1])%12;if(m[3].toUpperCase()==='PM')h+=12;return `${String(h).padStart(2,'0')}:${m[2]}`})(),price:ev.price,capacity:ev.capacity,description:ev.description}))if(create.elements.namedItem(name))create.elements.namedItem(name).value=value??'';
      if(imagePreview&&ev.photo){const img=document.createElement('img');img.src=photo(ev);img.alt='Current event image';imagePreview.replaceChildren(img);imagePreview.hidden=false}
    }).catch(err=>message(create,err.message,true));
  }
  if(create)create.onsubmit=async e=>{e.preventDefault();try{if(!token())throw new Error('Sign in before saving an event.');if(editId&&!editingEvent)throw new Error('Event details are still loading. Please try again.');const payload=Object.fromEntries(new FormData(create));const file=imageInput?.files?.[0];delete payload.eventImage;if(file){if(file.size>5*1024*1024)throw new Error('Image must be 5 MB or smaller.');payload.imageData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read the selected image.'));reader.readAsDataURL(file)})}if(editId)await api(`/api/events/${encodeURIComponent(editId)}`,{method:'PUT',body:JSON.stringify(payload)});else await api('/api/events',{method:'POST',body:JSON.stringify(payload)});location.href='organizer.html'}catch(err){message(create,err.message,true)}};
  const checkoutForm=document.getElementById('checkout');if(checkoutForm)checkoutForm.onsubmit=async e=>{e.preventDefault();const order=JSON.parse(sessionStorage.getItem('checkout')||'null');if(!order){message(checkoutForm,'Your order is empty.',true);return}try{if(!token())throw new Error('Sign in before completing your booking.');const info=Object.fromEntries(new FormData(checkoutForm));await api('/api/bookings',{method:'POST',body:JSON.stringify({...order,...info,eventId:order.id})});sessionStorage.removeItem('checkout');location.href='bookings.html'}catch(err){message(checkoutForm,err.message,true)}};
  const bookingTable=document.getElementById('bookings');if(bookingTable&&token())api('/api/bookings').then(list=>{const totalSpend=list.reduce((sum,b)=>sum+Number(b.total||0),0),totalTickets=list.reduce((sum,b)=>sum+Number(b.qty||1),0);bookingTable.innerHTML=list.length?`<div class="booking-shell"><div class="booking-header"><div><p class="eyebrow">Your plans</p><h2>Upcoming experiences</h2></div><a class="button outline" href="events.html">Browse events</a></div><div class="booking-stats"><div class="booking-stat"><span>Total bookings</span><strong>${list.length}</strong></div><div class="booking-stat"><span>Tickets</span><strong>${totalTickets}</strong></div><div class="booking-stat"><span>Spent</span><strong>${money(totalSpend)}</strong></div></div><div class="booking-list">${list.map(b=>{const status=(b.status||'Confirmed').toLowerCase();const photoUrl=b.photo||'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80';return `<article class="booking-item"><div class="booking-cover" style="background-image:linear-gradient(180deg,rgba(21,16,41,.12),rgba(21,16,41,.72)),url('${photoUrl}')"><span class="booking-date">${esc(b.date||'Upcoming')}</span></div><div class="booking-body"><div class="booking-topline"><span class="booking-tag">${esc(b.category||'Event')}</span><span class="status-badge ${status}">${esc(b.status||'Confirmed')}</span></div><h3>${esc(b.title)}</h3><p>${esc(b.location||'Your city')} · ${esc(b.date||'Flexible date')}</p><div class="booking-meta"><div><small>Tickets</small><strong>${Number(b.qty||1)}</strong></div><div><small>Total</small><strong>${money(b.total||0)}</strong></div><div><small>Booked by</small><strong>${esc(b.name||'Guest')}</strong></div></div></div></article>`}).join('')}</div></div>`:'<div class="empty"><h2>No bookings yet</h2><a class="button" href="events.html">Explore events</a></div>'}).catch(()=>{});
  const aiForm=document.getElementById('aiForm');if(aiForm)aiForm.onsubmit=async e=>{e.preventDefault();const f=new FormData(aiForm),parts=[f.get('prompt'),f.get('city')&&`in ${f.get('city')}`,f.get('budget')!==''&&(Number(f.get('budget'))===0?'free events':`under ₹${f.get('budget')}`)].filter(Boolean),query=parts.join(' ');try{const data=await api('/api/ai/recommendations',{method:'POST',body:JSON.stringify({query})});const results=document.getElementById('aiResults');results.innerHTML=`<div class="box"><p>${esc(data.message)}</p></div><div class="title-row"><h2>Your event matches</h2><small>Picked for your request</small></div><div class="cards">${data.recommendations.length?data.recommendations.map(x=>`<article class="card"><a href="event-details.html?id=${x.id}"><div class="cover" style="background-image:linear-gradient(0deg,#17102a99,transparent 78%),url('${photo(x)}')"><span class="date">${esc(x.date)}</span><h3>${esc(x.category)}</h3></div></a><div class="card-body"><h3><a href="event-details.html?id=${x.id}">${esc(x.title)}</a></h3><p>${esc(x.location)} · ${money(x.price)}</p></div></article>`).join(''):'<p class="empty">Try another interest, location, or budget.</p>'}</div>`}catch(err){message(aiForm,err.message,true)}};
  const aiChat=document.getElementById('aiChat');if(aiChat)aiChat.onsubmit=async e=>{e.preventDefault();const input=aiChat.querySelector('input'),q=input.value.trim(),messages=document.getElementById('aiMessages');if(!q)return;messages.insertAdjacentHTML('beforeend',`<div class="ai-msg">${esc(q)}</div>`);input.value='';const pending=document.createElement('div');pending.className='ai-msg';pending.textContent='Finding events for you…';messages.append(pending);try{const data=await api('/api/ai/recommendations',{method:'POST',body:JSON.stringify({query:q})});pending.innerHTML=`${esc(data.message)}${data.recommendations.map(x=>`<a href="event-details.html?id=${x.id}">${esc(x.title)} · ${esc(x.location)} · ${money(x.price)}</a>`).join('')}`;messages.scrollTop=messages.scrollHeight}catch(err){pending.textContent=err.message}};
  if(page==='organizer'&&token()){
    const el=document.getElementById('dashboard');let dashboardData=null,activeTab='overview',refreshing=false;
    const paint=tab=>{
      if(!dashboardData)return;
      const {stats,ownedEvents,attendees,allEvents,analytics}=dashboardData;
      if(tab==='events'){
        const manageableEvents=[...allEvents].sort((a,b)=>b.id-a.id),ownedIds=new Set(ownedEvents.map(event=>event.id));
        el.innerHTML=`<div class="box"><p class="muted">All events visible to attendees are listed here. Shared listings and your own events can be managed; events owned by another organizer are view-only.</p><table class="table"><tr><th>Event</th><th>Date</th><th>Price</th><th>Status</th><th>Action</th></tr>${manageableEvents.length?manageableEvents.map(event=>{const canManage=!event.owner_id||ownedIds.has(event.id);return `<tr><td>${esc(event.title)}</td><td>${esc(event.date)}</td><td>${money(event.price)}</td><td>${event.owner_id?'Organizer event':'Shared event'}</td><td>${canManage?`<a class="button outline" href="create-event.html?id=${event.id}">Edit</a> <button class="button" style="background:#b42318" data-delete-event="${event.id}">Delete</button>`:'<span class="muted">Managed by its organizer</span>'}</td></tr>`}).join(''):'<tr><td colspan="5">No events are listed yet.</td></tr>'}</table></div>`;
        el.querySelectorAll('[data-delete-event]').forEach(button=>button.onclick=async()=>{const id=Number(button.dataset.deleteEvent),event=manageableEvents.find(x=>x.id===id);if(!event||!window.confirm(`Delete “${event.title}” from the shared website? This cannot be undone.`))return;try{await api(`/api/events/${id}`,{method:'DELETE'});await refreshDashboard()}catch(error){window.alert(error.message)}});
      }else if(tab==='attendees'){
        const attendeeTable=attendees.length?`<table class="table"><tr><th>Attendee</th><th>Email</th><th>Event</th><th>Date</th><th>Tickets</th><th>Total</th><th>Status</th></tr>${attendees.map(booking=>`<tr><td>${esc(booking.name)}</td><td>${esc(booking.email)}</td><td>${esc(booking.title)}</td><td>${esc(booking.date)}</td><td>${booking.qty}</td><td>${money(booking.total)}</td><td>${esc(booking.status)}</td></tr>`).join('')}</table>`:'<div class="box empty">No attendee bookings have been recorded yet.</div>';
        el.innerHTML=`<div class="box"><div class="title-row"><div><h2>Attendee bookings</h2></div><button class="button outline" id="downloadAttendeeSheet" type="button" ${attendees.length?'':'disabled'}>Download CSV</button></div>${attendeeTable}</div>`;
        const downloadButton=document.getElementById('downloadAttendeeSheet');
        if(downloadButton)downloadButton.onclick=()=>exportAttendeeSheet(attendees);
      }else if(tab==='analytics'){
        const categories=Object.entries(allEvents.reduce((counts,event)=>{counts[event.category]=(counts[event.category]||0)+1;return counts},{})).sort((a,b)=>b[1]-a[1]);
        const locations=Object.entries(allEvents.reduce((counts,event)=>{counts[event.location]=(counts[event.location]||0)+1;return counts},{})).sort((a,b)=>b[1]-a[1]);
        const bookingsByEvent=Object.values(attendees.reduce((groups,booking)=>{const group=groups[booking.event_id]||(groups[booking.event_id]={title:booking.title,bookings:0,tickets:0,revenue:0,attendees:new Set()});group.bookings++;group.tickets+=Number(booking.qty)||0;group.revenue+=Number(booking.total)||0;if(booking.email)group.attendees.add(String(booking.email).trim().toLowerCase());return groups},{}));
        el.innerHTML=`<div class="stat-grid"><div class="stat"><small>Events listed</small><b>${analytics.events}</b></div><div class="stat"><small>Tickets booked</small><b>${analytics.tickets}</b></div><div class="stat"><small>Total revenue</small><b>${money(analytics.revenue)}</b></div><div class="stat"><small>Attendees registered</small><b>${analytics.attendees}</b></div></div><p class="muted">Live totals from confirmed bookings across all events. Overall attendees are counted once by email; event breakdowns count attendees per event.</p><div class="box"><h2>Bookings by event</h2>${bookingsByEvent.length?`<table class="table"><tr><th>Event</th><th>Bookings</th><th>Attendees</th><th>Tickets</th><th>Revenue</th></tr>${bookingsByEvent.map(event=>`<tr><td>${esc(event.title)}</td><td>${event.bookings}</td><td>${event.attendees.size}</td><td>${event.tickets}</td><td>${money(event.revenue)}</td></tr>`).join('')}</table>`:'<p class="empty">No confirmed attendee bookings have been recorded yet.</p>'}</div><div class="two-column"><div class="box"><h2>Events by category</h2><table class="table"><tr><th>Category</th><th>Events</th></tr>${categories.map(([name,count])=>`<tr><td>${esc(name)}</td><td>${count}</td></tr>`).join('')||'<tr><td colspan="2">No events yet.</td></tr>'}</table></div><div class="box"><h2>Events by location</h2><table class="table"><tr><th>Location</th><th>Events</th></tr>${locations.map(([name,count])=>`<tr><td>${esc(name)}</td><td>${count}</td></tr>`).join('')||'<tr><td colspan="2">No events yet.</td></tr>'}</table></div></div>`;
      }else{
        el.innerHTML=`<div class="stat-grid"><div class="stat"><small>Events listed</small><b>${stats.events}</b></div><div class="stat"><small>Tickets booked</small><b>${stats.tickets}</b></div><div class="stat"><small>Revenue</small><b>${money(stats.revenue)}</b></div><div class="stat"><small>Attendees</small><b>${stats.attendees}</b></div></div><div class="box"><h2>Recent bookings</h2><p class="muted">Latest attendee bookings recorded across all events.</p>${attendees.length?`<table class="table"><tr><th>Attendee</th><th>Event</th><th>Tickets</th><th>Total</th></tr>${attendees.slice(0,5).map(booking=>`<tr><td>${esc(booking.name)}</td><td>${esc(booking.title)}</td><td>${booking.qty}</td><td>${money(booking.total)}</td></tr>`).join('')}</table>`:'<p class="empty">New bookings will appear here when attendees reserve tickets.</p>'}</div>`;
      }
    };
    async function refreshDashboard(){
      if(refreshing)return;
      refreshing=true;
      try{
        const [stats,ownedEvents,attendees,allEvents,analytics]=await Promise.all([api('/api/organizer/stats'),api('/api/organizer/events'),api('/api/organizer/attendees'),api('/api/events'),api('/api/organizer/analytics')]);
        dashboardData={stats,ownedEvents:[...ownedEvents].sort((a,b)=>b.id-a.id),attendees,allEvents,analytics};
        paint(activeTab);
      }catch(error){el.innerHTML=`<div class="box empty">${esc(error.message)}</div>`}
      finally{refreshing=false}
    }
    document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{activeTab=button.dataset.tab;document.querySelectorAll('[data-tab]').forEach(item=>item.classList.toggle('selected',item===button));paint(activeTab);refreshDashboard()});
    document.getElementById('refreshDashboard')?.addEventListener('click',refreshDashboard);
    refreshDashboard();
    window.setInterval(refreshDashboard,30000);
  }
  // Persist collaborative-plan snapshots whenever the existing planner saves changes.
  if(page==='plan'&&token()){
    const previous=localStorage.setItem.bind(localStorage);let syncTimer;
    localStorage.setItem=function(key,value){previous(key,value);if(key==='vibrantWeekendPlan'){clearTimeout(syncTimer);syncTimer=setTimeout(async()=>{try{const p=JSON.parse(value),saved=JSON.parse(sessionStorage.getItem('vibrantPlan')||'null'),out=await api('/api/plans',{method:'POST',body:JSON.stringify({id:saved?.id,name:p.name||'Weekend plan',city:'',budget:0,eventIds:p.ids||[],votes:p.votes||{}})});sessionStorage.setItem('vibrantPlan',JSON.stringify(out))}catch{}},400)}};
  }
})();
