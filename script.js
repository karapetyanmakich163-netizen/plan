/* ================= STORAGE ================= */
// Every list lives in LocalStorage under its own key.
const KEYS = ['tasks','notes','contacts','messages','reminders','shopping','expenses','goals'];
const db = {};
KEYS.forEach(k => db[k] = JSON.parse(localStorage.getItem(k) || '[]'));
let settings = JSON.parse(localStorage.getItem('settings') || '{"dark":false,"lang":"en","h24":true}');
const save = k => localStorage.setItem(k, JSON.stringify(db[k]));
const saveSettings = () => localStorage.setItem('settings', JSON.stringify(settings));

/* ================= HELPERS ================= */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const find = (k, id) => db[k].find(i => i.id === id);
const sum = a => a.reduce((s, x) => s + (+x || 0), 0);
const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
let view = 'home', chat = null, q = '';

/* ================= TRANSLATIONS ================= */
// Values are listed in the same order as the keys in K.
const K = 'home,tasks,notes,messages,contacts,reminders,shopping,expenses,goals,tools,settings,save,cancel,empty,sure,hello,dark,lang,export,import,reset,title,date,due,priority,amount,name,phone,time,price'.split(',');
const L = {
  en: 'Home|Tasks|Notes|Messages|Contacts|Reminders|Shopping|Money|Goals|Tools|Settings|Save|Cancel|Nothing here yet|Are you sure?|Hello|Dark mode|Language|Export my data|Import data|Delete all data|Title|Date|Due|Priority|Amount|Name|Phone|Time|Price',
  hy: 'Գլխավոր|Առաջադրանքներ|Նշումներ|Հաղորդագրություններ|Կոնտակտներ|Հիշեցումներ|Գնումներ|Ֆինանսներ|Նպատակներ|Գործիքներ|Կարգավորումներ|Պահպանել|Չեղարկել|Դեռ ոչինչ չկա|Համոզվա՞ծ եք|Բարև|Մութ ռեժիմ|Լեզու|Արտահանել տվյալները|Ներմուծել տվյալներ|Ջնջել բոլոր տվյալները|Վերնագիր|Ամսաթիվ|Ժամկետ|Առաջնահերթություն|Գումար|Անուն|Հեռախոս|Ժամ|Գին',
  ru: 'Главная|Задачи|Заметки|Сообщения|Контакты|Напоминания|Покупки|Финансы|Цели|Инструменты|Настройки|Сохранить|Отмена|Пока ничего нет|Вы уверены?|Привет|Тёмная тема|Язык|Экспорт данных|Импорт данных|Удалить все данные|Название|Дата|Срок|Приоритет|Сумма|Имя|Телефон|Время|Цена'
};
const tr = k => { const i = K.indexOf(k); return i < 0 ? k : L[settings.lang].split('|')[i]; };

/* ================= DATA MODELS =================
   Each module lists its form fields: [name, type, options, required]
   t = how to show the title, sub = subtitle line, check = has a checkbox */
const M = {
  tasks:{f:[['title','text',0,1],['due','date'],['priority','select',['Low','Medium','High']]],check:1,sub:i=>[i.due,i.priority].filter(Boolean).join(' · ')},
  notes:{f:[['title','text',0,1],['text','textarea'],['pinned','check']],sub:i=>(i.pinned?'📌 ':'')+(i.text||''),sort:(a,b)=>!!b.pinned-!!a.pinned},
  contacts:{f:[['name','text',0,1],['phone','text'],['email','text'],['birthday','date']],t:i=>i.name,sub:i=>[i.phone,i.email].filter(Boolean).join(' · '),msg:1},
  reminders:{f:[['title','text',0,1],['date','date'],['time','time']],sub:i=>[i.date,i.time].join(' ')},
  shopping:{f:[['title','text',0,1],['qty','number'],['price','number']],check:1,sub:i=>`${i.qty||1} × ${i.price||0}`},
  goals:{f:[['title','text',0,1],['deadline','date'],['progress','number']],goal:1,sub:i=>i.deadline||''},
  expenses:{f:[['type','select',['Expense','Income']],['amount','number',0,1],['category','select',['Food','Transport','Shopping','Education','Entertainment','Other']],['desc','text'],['date','date']],
    t:i=>`${i.type==='Income'?'+':'−'}${i.amount} · ${i.category}`,sub:i=>[i.desc,i.date].filter(Boolean).join(' · ')}
};

/* ================= MODAL ================= */
// Shows a form; onSave(form) returns an error string or nothing.
function modal(html, onSave, ok) {
  const m = $('#modal');
  m.innerHTML = `<form class="box">${html}<div class="row"><button type="button" class="btn ghost" id="cx">${tr('cancel')}</button><button class="btn">${ok || tr('save')}</button></div></form>`;
  m.classList.remove('hidden');
  const f = m.firstChild;
  m.onclick = e => e.target === m && close();
  $('#cx').onclick = close;
  f.onsubmit = e => {
    e.preventDefault();
    const err = onSave(f);
    if (err) { f.querySelector('.err').textContent = err; return; }
    close(); render();
  };
}
const close = () => $('#modal').classList.add('hidden');
function toast(s) { const t = $('#toast'); t.textContent = s; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }

/* ================= CREATE / EDIT / DELETE ================= */
function openForm(k, item) {
  const v = item || {};
  const fields = M[k].f.map(([n, type, o]) => {
    let input;
    if (type === 'select') input = `<select name="${n}">${o.map(x => `<option ${v[n] === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
    else if (type === 'textarea') input = `<textarea name="${n}" rows="4">${esc(v[n])}</textarea>`;
    else if (type === 'check') input = `<input type="checkbox" name="${n}" ${v[n] ? 'checked' : ''}>`;
    else input = `<input type="${type}" name="${n}" value="${esc(v[n])}">`;
    return `<label>${esc(tr(n))}${input}</label>`;
  }).join('');
  modal(`<h2>${tr(k)}</h2>${fields}<p class="err"></p>`, f => {
    const d = {};
    for (const [n, type, , req] of M[k].f) {
      const e = f.elements[n];
      d[n] = type === 'check' ? e.checked : e.value.trim();
      if (req && !d[n]) return `Please enter: ${tr(n)}`;              // validation
      if (type === 'number' && d[n] !== '') {
        if (isNaN(d[n]) || +d[n] < 0) return 'Please enter a valid amount.';
        d[n] = +d[n];
      }
    }
    if (k === 'goals') d.progress = Math.min(100, d.progress || 0);
    if (item) Object.assign(item, d); else db[k].push({ id: uid(), done: false, ...d });
    save(k);
  });
}
function del(k, id) {
  modal(`<p>${tr('sure')}</p>`, () => { db[k] = db[k].filter(i => i.id !== id); save(k); }, '🗑');
}
function toggle(k, id) { const i = find(k, id); i.done = !i.done; save(k); render(); }
function step(id, d) { const g = find('goals', id); g.progress = Math.min(100, Math.max(0, (+g.progress || 0) + d)); save('goals'); render(); }

/* ================= MESSAGES ================= */
function addMsg(to, text) {
  const m = { id: uid(), to, text, time: Date.now(), status: 'Sent' };
  db.messages.push(m); save('messages');
  // Local demo only: nothing is sent anywhere. Status changes are simulated.
  setTimeout(() => setStatus(m, 'Delivered'), 1000);
  setTimeout(() => setStatus(m, 'Read'), 2500);
}
function setStatus(m, s) { m.status = s; save('messages'); if (view === 'messages') render(); }
function openMsg(id) {
  if (!db.contacts.length) { toast('Add a contact first'); return openForm('contacts'); }
  modal(`<h2>${tr('messages')}</h2><label>To<select name="to">${db.contacts.map(c => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><label>Message<textarea name="text" rows="4"></textarea></label><p class="err"></p>`, f => {
    const text = f.elements.text.value.trim();
    if (!text) return 'Please write a message.';
    addMsg(f.elements.to.value, text); chat = f.elements.to.value; view = 'messages';
  });
}
function sendMsg(e) {
  e.preventDefault();
  const text = $('#mi').value.trim();
  if (!chat) return toast('Add a contact first');
  if (!text) return toast('Please write a message.');
  addMsg(chat, text); render();
}
function delMsg(id) { db.messages = db.messages.filter(m => m.id !== id); save('messages'); render(); }
function msgView() {
  if (!find('contacts', chat) && db.contacts.length) chat = db.contacts[0].id;
  const ms = db.messages.filter(m => m.to === chat);
  return `<div class="chat"><div class="card">${db.contacts.map(c => `<div class="ct ${c.id === chat ? 'on' : ''}" onclick="chat='${c.id}';render()"><span class="av">${esc(c.name[0])}</span>${esc(c.name)}</div>`).join('') || `<p class="empty">${tr('empty')}</p>`}<button class="btn" onclick="openForm('contacts')">＋ ${tr('contacts')}</button></div>
  <div class="card"><div class="msgs">${ms.map(m => `<div class="bubble">${esc(m.text)}<small>${m.status} · ${new Date(m.time).toLocaleTimeString()} <a onclick="delMsg('${m.id}')">🗑</a></small></div>`).join('')}</div>
  <form onsubmit="sendMsg(event)" class="row"><input id="mi" placeholder="${tr('messages')}…"><button class="btn">➤</button></form></div></div>`;
}

/* ================= GENERIC LIST VIEW ================= */
function listItems(k) {
  const m = M[k], title = m.t || (i => i.title);
  const items = db[k].filter(i => JSON.stringify(i).toLowerCase().includes(q.toLowerCase()));
  if (m.sort) items.sort(m.sort);
  if (!items.length) return `<p class="empty">📭 ${tr('empty')}</p>`;
  return items.map(i => `<div class="card item ${i.done ? 'done' : ''}">
    ${m.check ? `<input type="checkbox" ${i.done ? 'checked' : ''} onchange="toggle('${k}','${i.id}')">` : ''}
    <div class="grow"><b>${esc(title(i))}</b><small>${esc(m.sub ? m.sub(i) : '')}</small>
      ${m.goal ? `<div class="bar"><i style="width:${+i.progress || 0}%"></i></div>` : ''}</div>
    ${m.goal ? `<button onclick="step('${i.id}',-10)">−</button><small>${+i.progress || 0}%</small><button onclick="step('${i.id}',10)">＋</button>` : ''}
    ${m.msg ? `<button onclick="openMsg('${i.id}')">✉️</button>` : ''}
    <button onclick="openForm('${k}',find('${k}','${i.id}'))">✏️</button>
    <button onclick="del('${k}','${i.id}')">🗑</button></div>`).join('');
}
function modView(k) {
  let head = '';
  if (k === 'expenses') {
    const ex = db.expenses.filter(e => e.type === 'Expense'), inc = sum(db.expenses.filter(e => e.type === 'Income').map(e => e.amount)), out = sum(ex.map(e => e.amount));
    const cats = {}; ex.forEach(e => cats[e.category] = (cats[e.category] || 0) + +e.amount);
    const mx = Math.max(1, ...Object.values(cats));
    head = `<div class="stats"><div class="card">💵 ${inc}</div><div class="card">💸 ${out}</div><div class="card">⚖️ ${inc - out}</div></div>` +
      (ex.length ? `<div class="card">${Object.entries(cats).map(([c, v]) => `<div class="hb"><span>${c}</span><i style="width:${v / mx * 100}%"></i><b>${v}</b></div>`).join('')}</div>` : '');
  }
  if (k === 'shopping') {
    const s = db.shopping;
    head = `<div class="stats"><div class="card">🛒 ${s.length}</div><div class="card">✔ ${s.filter(i => i.done).length}</div><div class="card">≈ ${sum(s.map(i => (i.qty || 1) * (i.price || 0)))}</div></div>`;
  }
  return head + `<input placeholder="🔍" value="${esc(q)}" oninput="q=this.value;$('#list').innerHTML=listItems('${k}')"><div id="list">${listItems(k)}</div>`;
}

/* ================= HOME ================= */
function home() {
  const today = todayStr(), tt = db.tasks.filter(t => t.due === today), done = tt.filter(t => t.done).length;
  const pct = tt.length ? Math.round(done / tt.length * 100) : 0;
  const rem = db.reminders.filter(r => r.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 3);
  return `<div class="card"><h2>${tr('hello')}! 👋</h2><small>${new Date().toLocaleDateString(settings.lang, { dateStyle: 'full' })}</small></div>
  <div class="grid"><button class="btn" onclick="openForm('tasks')">✅ ＋</button><button class="btn" onclick="openMsg()">✉️ ＋</button><button class="btn" onclick="openForm('notes')">📝 ＋</button><button class="btn" onclick="openForm('reminders')">🔔 ＋</button><button class="btn" onclick="openForm('expenses')">💰 ＋</button></div><br>
  <div class="card"><b>${tr('tasks')}: ${done}/${tt.length}</b><div class="bar"><i style="width:${pct}%"></i></div>${tt.map(t => `<div class="${t.done ? 'item done' : ''}"><b>${esc(t.title)}</b></div>`).join('') || `<small>${tr('empty')}</small>`}</div>
  <div class="card"><b>${tr('reminders')}</b>${rem.map(r => `<small>🔔 ${esc(r.title)} · ${r.date} ${r.time}</small>`).join('') || `<small>${tr('empty')}</small>`}</div>
  <div class="card"><b>${tr('notes')}: ${db.notes.length}</b></div>`;
}

/* ================= TOOLS: stopwatch + countdown ================= */
let sw = { t: 0, id: 0 }, cdId = 0;
const fmt = ms => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '.' + Math.floor(ms % 1000 / 100); };
function swToggle() {
  if (sw.id) { clearInterval(sw.id); sw.id = 0; return; }
  const start = Date.now() - sw.t;
  sw.id = setInterval(() => { sw.t = Date.now() - start; const e = $('#swd'); if (e) e.textContent = fmt(sw.t); }, 100);
}
function cdStart() {
  const min = +$('#cm').value;
  if (!(min > 0)) return toast('Please enter a valid amount.');
  const end = Date.now() + min * 60000; clearInterval(cdId);
  cdId = setInterval(() => {
    const left = end - Date.now(), e = $('#cd');
    if (left <= 0) { clearInterval(cdId); toast('⏰ Time is up!'); if (e) e.textContent = '00:00'; return; }
    if (e) e.textContent = fmt(left).slice(0, 5);
  }, 250);
}
const tools = () => `<div class="card"><h3>⏱ Stopwatch</h3><h1 id="swd">${fmt(sw.t)}</h1><button class="btn" onclick="swToggle()">Start / Stop</button> <button class="btn ghost" onclick="sw.t=0;$('#swd').textContent=fmt(0)">Reset</button></div>
<div class="card"><h3>⏳ Countdown</h3><label>Minutes<input id="cm" type="number" min="1" value="5"></label><h1 id="cd">--:--</h1><button class="btn" onclick="cdStart()">Start</button></div>`;

/* ================= SETTINGS ================= */
function setView() {
  const langs = [['en', '🇬🇧 English'], ['hy', '🇦🇲 Հայերեն'], ['ru', '🇷🇺 Русский']];
  return `<div class="card"><label class="row">${tr('dark')}<input type="checkbox" ${settings.dark ? 'checked' : ''} onchange="settings.dark=this.checked;saveSettings();render()"></label>
  <label class="row">${tr('lang')}<select onchange="settings.lang=this.value;saveSettings();render()">${langs.map(([c, n]) => `<option value="${c}" ${settings.lang === c ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
  <label class="row">24h<input type="checkbox" ${settings.h24 ? 'checked' : ''} onchange="settings.h24=this.checked;saveSettings();tick()"></label></div>
  <div class="card grid"><button class="btn" onclick="exportData()">${tr('export')}</button><label class="btn ghost">${tr('import')}<input type="file" accept=".json" hidden onchange="importData(event)"></label><button class="btn danger" onclick="resetAll()">${tr('reset')}</button></div>`;
}
function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = 'my-day-backup.json'; a.click();
}
function importData(e) {
  const r = new FileReader();
  r.onload = () => {
    try { const d = JSON.parse(r.result); KEYS.forEach(k => { db[k] = Array.isArray(d[k]) ? d[k] : []; save(k); }); render(); toast('✔'); }
    catch { toast('Invalid backup file.'); }
  };
  r.readAsText(e.target.files[0]);
}
function resetAll() { modal(`<p>${tr('sure')}</p>`, () => { localStorage.clear(); location.reload(); }, '🗑'); }

/* ================= NAVIGATION + RENDER ================= */
const NAV = [['home','🏠'],['tasks','✅'],['messages','✉️'],['notes','📝'],['reminders','🔔'],['expenses','💰'],['shopping','🛒'],['contacts','👤'],['goals','🎯'],['tools','⏱'],['settings','⚙️']];
const V = { home, messages: msgView, tools, settings: setView };
function go(k) { view = k; q = ''; render(); }
function render() {
  document.body.classList.toggle('dark', settings.dark);
  $('#nav').innerHTML = NAV.map(([k, i]) => `<a class="${k === view ? 'on' : ''}" onclick="go('${k}')"><span>${i}</span><em>${tr(k)}</em></a>`).join('');
  $('#title').textContent = tr(view);
  $('#addBtn').style.display = M[view] || view === 'messages' ? '' : 'none';
  $('#view').innerHTML = V[view] ? V[view]() : modView(view);
}
$('#addBtn').onclick = () => view === 'messages' ? openMsg() : openForm(view);

/* ================= CLOCK, REMINDER POPUPS, SHORTCUTS ================= */
function tick() { $('#clock').textContent = new Date().toLocaleTimeString([], { hour12: !settings.h24 }); }
setInterval(tick, 1000);
// When a reminder's time arrives, show an in-app popup once.
setInterval(() => {
  const n = new Date(), d = todayStr(), t = n.toTimeString().slice(0, 5);
  db.reminders.forEach(r => { if (!r.fired && r.date === d && r.time && r.time <= t) { r.fired = 1; save('reminders'); toast('🔔 ' + r.title); } });
}, 15000);
// Shortcuts: N = new item, Esc = close window
document.onkeydown = e => {
  if (e.key === 'Escape') close();
  else if (e.key === 'n' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $('#addBtn').style.display !== 'none') { e.preventDefault(); $('#addBtn').click(); }
};
tick(); render();