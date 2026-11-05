module.exports = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>СеверМодуль — администрирование</title>
  <style nonce="__CSP_NONCE__">
    :root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#173b31;background:#f3f8f5;font-synthesis:none}
    *{box-sizing:border-box}body{margin:0;min-height:100vh}button,input,select,textarea{font:inherit}
    button{cursor:pointer}.hidden{display:none!important}.layout{min-height:100vh;display:grid;grid-template-columns:240px 1fr}
    aside{background:#123d32;color:#fff;padding:25px 16px;display:flex;flex-direction:column;gap:24px}
    .brand{font-size:19px;font-weight:700;line-height:1.25;padding:0 10px}.brand small{display:block;color:#a8d7c5;font-size:12px;font-weight:500;margin-top:5px}
    nav{display:grid;gap:7px}nav button{border:0;border-radius:10px;padding:12px;text-align:left;background:transparent;color:#d9eee5}
    nav button.active,nav button:hover{background:#245b4b;color:#fff}.logout{margin-top:auto;border:1px solid #6f9d8c;border-radius:10px;padding:10px;background:transparent;color:white}
    main{padding:30px;min-width:0}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}
    h1{font-size:26px;margin:0}h2{font-size:19px;margin:0 0 16px}p{line-height:1.5}.muted{color:#71837c}
    .panel{background:#fff;border:1px solid #e0ebe5;border-radius:16px;padding:20px;box-shadow:0 5px 20px #153d3210}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.service{padding:18px;border:1px solid #e1ebe5;border-radius:13px;background:#fbfdfb}
    .service b{display:block;margin-bottom:8px}.pill{display:inline-block;border-radius:99px;padding:5px 10px;font-size:12px;background:#e9f4ed;color:#246246}
    .pill.error{background:#fff0ec;color:#9c3d2c}.pill.pending{background:#fff7df;color:#806319}
    .toolbar{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:15px}.toolbar input,.toolbar select,input,textarea,select{min-width:0;border:1px solid #cad9d1;border-radius:9px;padding:10px;background:white;color:#173b31}
    .toolbar input{flex:1;min-width:170px}.primary,.secondary,.danger{border:0;border-radius:9px;padding:10px 14px;font-weight:600}
    .primary{background:#227653;color:white}.primary:hover{background:#175f41}.secondary{background:#e8f3ec;color:#1f6144}.danger{background:#fff0ec;color:#983f31}
    .table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:750px}th,td{text-align:left;padding:12px 10px;border-bottom:1px solid #edf2ef;vertical-align:top}
    th{font-size:12px;color:#71837c;text-transform:uppercase;letter-spacing:.04em}td{font-size:14px}.question{max-width:320px;white-space:pre-wrap;overflow-wrap:anywhere}
    .record{border:1px solid #e2ece6;border-radius:12px;padding:15px;margin-top:12px}.record h3{margin:0 0 6px;font-size:16px}.record pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0}
    .form-grid{display:grid;gap:12px}.form-grid label{display:grid;gap:6px;font-size:13px;color:#566b62}.form-grid textarea{min-height:120px;resize:vertical}
    .form-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.check{display:flex!important;align-items:center;gap:8px!important}.check input{min-width:auto}
    .message-list{display:grid;gap:10px;max-height:60vh;overflow:auto}.message{padding:12px;border-radius:11px;background:#eff6f1;white-space:pre-wrap;overflow-wrap:anywhere}
    .message.user{background:#e8f0fb}.message small{display:block;color:#71837c;margin-bottom:5px}.notice{min-height:22px;color:#9b3c2a;font-size:13px}
    .login-wrap{min-height:100vh;display:grid;place-items:center;padding:20px}.login{width:min(420px,100%)}.login h1{margin-bottom:8px}.login .form-grid{margin-top:22px}
    .mobile-brand{display:none}
    @media(max-width:850px){.layout{grid-template-columns:1fr}aside{padding:14px;gap:12px}.brand{display:none}.mobile-brand{display:block;font-weight:700}nav{display:flex;overflow:auto}nav button{white-space:nowrap}.logout{margin:0;align-self:flex-start}main{padding:18px}.grid{grid-template-columns:1fr}}
    @media(max-width:480px){main{padding:13px}.panel{padding:14px}.topbar{align-items:flex-start;flex-direction:column}h1{font-size:22px}}
  </style>
</head>
<body>
  <section id="loginScreen" class="login-wrap">
    <div class="panel login">
      <h1>Панель СеверМодуль</h1>
      <p class="muted">Вход для администратора</p>
      <form id="loginForm" class="form-grid">
        <label>Пароль администратора
          <input id="password" type="password" autocomplete="current-password" required maxlength="512">
        </label>
        <button class="primary" type="submit">Войти</button>
        <div id="loginNotice" class="notice" role="status"></div>
      </form>
    </div>
  </section>
  <div id="app" class="layout hidden">
    <aside>
      <div class="brand">СеверМодуль<small>Тестовая панель</small></div>
      <div class="mobile-brand">СеверМодуль · панель</div>
      <nav aria-label="Разделы панели">
        <button data-tab="health" class="active">Подключения</button>
        <button data-tab="leads">Заявки</button>
        <button data-tab="conversations">Переписки</button>
        <button data-tab="knowledge">База знаний</button>
      </nav>
      <button id="logout" class="logout">Выйти</button>
    </aside>
    <main>
      <div class="topbar"><h1 id="pageTitle">Подключения</h1><span class="pill">Тестовая среда</span></div>
      <section id="healthTab" class="tab panel">
        <h2>Проверка сервисов</h2>
        <p class="muted">Проверки не отправляют заявки и не создают Telegram-сообщений.</p>
        <div class="grid">
          <div class="service"><b>Neon / PostgreSQL</b><span id="neonStatus" class="pill pending">Не проверено</span></div>
          <div class="service"><b>Groq API</b><span id="groqStatus" class="pill pending">Не проверено</span></div>
          <div class="service"><b>Telegram Bot API</b><span id="telegramStatus" class="pill pending">Не проверено</span></div>
        </div>
        <p><button id="checkHealth" class="primary">Проверить подключения</button></p>
        <div id="healthNotice" class="notice" role="status"></div>
        <p class="muted">Секреты интеграций настраиваются только в Neon Console. Панель не показывает и не изменяет их.</p>
      </section>
      <section id="leadsTab" class="tab panel hidden">
        <h2>Заявки клиентов</h2>
        <form id="leadFilters" class="toolbar">
          <input name="q" placeholder="Поиск по имени и контакту" maxlength="120">
          <select name="status"><option value="">Все статусы</option><option value="new">Новая</option><option value="in_progress">В работе</option><option value="completed">Завершена</option><option value="cancelled">Отменена</option></select>
          <select name="direction"><option value="desc">Сначала новые</option><option value="asc">Сначала старые</option></select>
          <button class="secondary" type="submit">Найти</button>
        </form>
        <div class="table-wrap"><table><thead><tr><th>Дата</th><th>Имя / контакт</th><th>Вопрос</th><th>Статус</th><th>Диалог</th></tr></thead><tbody id="leadsBody"></tbody></table></div>
        <div id="leadsNotice" class="notice" role="status"></div>
      </section>
      <section id="conversationsTab" class="tab panel hidden">
        <h2>Переписки</h2><div class="table-wrap"><table><thead><tr><th>Дата</th><th>Статус</th><th>Сообщения</th><th>Заявка</th><th></th></tr></thead><tbody id="conversationsBody"></tbody></table></div>
        <div id="conversationDetails" class="record hidden"></div><div id="conversationsNotice" class="notice" role="status"></div>
      </section>
      <section id="knowledgeTab" class="tab panel hidden">
        <h2>База знаний</h2>
        <form id="knowledgeFilters" class="toolbar"><input name="q" placeholder="Поиск по заголовку и содержимому" maxlength="120"><input name="category" placeholder="Категория" maxlength="80"><button class="secondary" type="submit">Найти</button><button id="newKnowledge" class="primary" type="button">Добавить запись</button></form>
        <div id="knowledgeEditor" class="record hidden"></div><div id="knowledgeRecords"></div><div id="knowledgeNotice" class="notice" role="status"></div>
      </section>
    </main>
  </div>
  <script nonce="__CSP_NONCE__">
  (() => {
    const $ = (id) => document.getElementById(id);
    const labels = {health:'Подключения',leads:'Заявки',conversations:'Переписки',knowledge:'База знаний'};
    let csrf = '';
    const statusLabels = {new:'Новая',in_progress:'В работе',completed:'Завершена',cancelled:'Отменена'};
    async function api(action, options = {}) {
      const method = options.method || 'GET';
      const headers = new Headers(options.headers || {});
      const separator = action.indexOf('&');
      const params = new URLSearchParams();
      params.set('action', separator < 0 ? action : action.slice(0, separator));
      if (separator >= 0) {
        new URLSearchParams(action.slice(separator + 1)).forEach((value,key)=>params.set(key,value));
      }
      if (options.body !== undefined) headers.set('Content-Type','application/json');
      if (method !== 'GET' && csrf) headers.set('X-CSRF-Token',csrf);
      const response = await fetch('?'+params.toString(), {
        method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials:'same-origin', cache:'no-store'
      });
      let data;
      try { data = await response.json(); } catch { data = {}; }
      if (response.status === 401) { showLogin(); throw new Error('Сессия завершена. Войдите снова.'); }
      if (!response.ok || data.ok === false) throw new Error(data.error || 'Операция не выполнена.');
      return data;
    }
    function showLogin() {$('app').classList.add('hidden');$('loginScreen').classList.remove('hidden');csrf='';}
    function showApp() {$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden');}
    function el(tag, text, className) {const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(className)node.className=className;return node;}
    function setService(id, value) {
      const node=$(id);node.className='pill '+(value==='ok'?'':value==='not_configured'?'pending':'error');
      node.textContent=value==='ok'?'Подключено':value==='not_configured'?'Не настроено':'Ошибка проверки';
    }
    function date(value) {const parsed=new Date(value);return Number.isNaN(parsed.getTime())?'—':parsed.toLocaleString('ru-RU');}
    function setNotice(id, text) {$(id).textContent=text||'';}
    async function checkHealth() {
      setNotice('healthNotice','Проверяем…');
      try {const data=await api('admin-health');setService('neonStatus',data.services.neon);setService('groqStatus',data.services.groq);setService('telegramStatus',data.services.telegram);setNotice('healthNotice','Проверка завершена. Секреты и ответы внешних API не отображаются.');}
      catch(error){setNotice('healthNotice',error.message);}
    }
    function statusSelect(lead) {
      const select=document.createElement('select');
      for(const [value,label] of Object.entries(statusLabels)){const option=el('option',label);option.value=value;select.append(option);}
      select.value=lead.status;select.setAttribute('aria-label','Статус заявки');
      select.addEventListener('change',async()=>{select.disabled=true;try{await api('admin-lead-status',{method:'PATCH',body:{id:lead.id,status:select.value}});setNotice('leadsNotice','Статус сохранён.');}catch(error){select.value=lead.status;setNotice('leadsNotice',error.message);}finally{select.disabled=false;}});
      return select;
    }
    async function loadLeads(event) {
      if(event)event.preventDefault();setNotice('leadsNotice','Загружаем…');
      const form=new FormData($('leadFilters'));const query=new URLSearchParams();
      for(const key of ['q','status','direction'])if(form.get(key))query.set(key,form.get(key));
      try {const data=await api('admin-leads&'+query.toString());const body=$('leadsBody');body.replaceChildren();
        for(const lead of data.leads){const row=document.createElement('tr');row.append(el('td',date(lead.created_at)));
          row.append(el('td',[lead.name||'—',lead.contact||'—'].join('\\n')));
          row.append(el('td',lead.question||'—','question'));row.append(el('td'));row.lastChild.append(statusSelect(lead));
          const dialog=el('button',lead.conversation_id?'Открыть':'—','secondary');if(lead.conversation_id)dialog.addEventListener('click',()=>openConversation(lead.conversation_id));
          row.append(el('td'));row.lastChild.append(dialog);body.append(row);}
        setNotice('leadsNotice',data.leads.length?'':'Заявок не найдено.');
      }catch(error){setNotice('leadsNotice',error.message);}
    }
    async function loadConversations() {
      setNotice('conversationsNotice','Загружаем…');
      try {const data=await api('admin-conversations');const body=$('conversationsBody');body.replaceChildren();
        for(const item of data.conversations){const row=document.createElement('tr');row.append(el('td',date(item.created_at)));row.append(el('td',item.status));row.append(el('td',item.message_count));row.append(el('td',item.lead_id||'—'));const button=el('button','Просмотр','secondary');button.addEventListener('click',()=>openConversation(item.id));row.append(el('td'));row.lastChild.append(button);body.append(row);}
        setNotice('conversationsNotice',data.conversations.length?'':'Переписок не найдено.');
      }catch(error){setNotice('conversationsNotice',error.message);}
    }
    async function openConversation(id) {
      const box=$('conversationDetails');box.classList.remove('hidden');box.replaceChildren(el('p','Загружаем переписку…'));
      try {const data=await api('admin-conversation&id='+encodeURIComponent(id));box.replaceChildren(el('h3','Переписка '+data.conversation.id));
        if(data.lead){box.append(el('p','Связанная заявка · '+(data.lead.name||'')+' · '+(data.lead.contact||'')));box.append(el('pre',data.lead.question||''));}
        const messages=el('div',undefined,'message-list');for(const message of data.messages){const item=el('div',undefined,'message '+message.role);item.append(el('small',(message.role==='user'?'Клиент':message.role==='assistant'?'Консультант':'Система')+' · '+date(message.created_at)));item.append(el('span',message.content));messages.append(item);}box.append(messages);
      }catch(error){box.replaceChildren(el('p',error.message));}
    }
    function knowledgeForm(record) {
      const box=$('knowledgeEditor');box.classList.remove('hidden');box.replaceChildren(el('h3',record?'Редактировать запись':'Новая запись'));
      const form=document.createElement('form');form.className='form-grid';
      const fields=[['title','Заголовок',200],['category','Категория',100],['source','Источник',200]];
      for(const [key,label,max] of fields){const wrapper=el('label',label);const input=document.createElement('input');input.name=key;input.maxLength=max;input.value=record?.[key]||'';input.required=key!=='source';wrapper.append(input);form.append(wrapper);}
      const contentLabel=el('label','Содержимое');const textarea=document.createElement('textarea');textarea.name='content';textarea.maxLength=20000;textarea.required=true;textarea.value=record?.content||'';contentLabel.append(textarea);form.append(contentLabel);
      const activeLabel=el('label','Активна','check');const active=document.createElement('input');active.type='checkbox';active.name='is_active';active.checked=record?record.is_active:true;activeLabel.append(active);form.append(activeLabel);
      const actions=el('div',undefined,'form-row');const save=el('button','Сохранить','primary');save.type='submit';const cancel=el('button','Отмена','secondary');cancel.type='button';cancel.addEventListener('click',()=>box.classList.add('hidden'));actions.append(save,cancel);form.append(actions);
      form.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form));const body={title:values.title,category:values.category,source:values.source,content:values.content,is_active:active.checked};save.disabled=true;try{await api(record?'admin-knowledge-update':'admin-knowledge-create',{method:record?'PATCH':'POST',body:record?{...body,id:record.id}:body});box.classList.add('hidden');setNotice('knowledgeNotice','Запись сохранена.');loadKnowledge();}catch(error){setNotice('knowledgeNotice',error.message);}finally{save.disabled=false;}});
      box.append(form);box.scrollIntoView({behavior:'smooth',block:'start'});
    }
    async function loadKnowledge(event) {
      if(event)event.preventDefault();setNotice('knowledgeNotice','Загружаем…');const form=new FormData($('knowledgeFilters'));const query=new URLSearchParams();
      for(const key of ['q','category'])if(form.get(key))query.set(key,form.get(key));
      try {const data=await api('admin-knowledge&'+query.toString());const list=$('knowledgeRecords');list.replaceChildren();
        for(const record of data.records){const card=el('article',undefined,'record');card.append(el('h3',record.title));card.append(el('p','Категория: '+record.category+' · источник: '+(record.source||'не указан')+' · версия: '+record.version+' · '+(record.is_active?'активна':'отключена'),record.is_active?'muted':'notice'));if((record.source||'').startsWith('demo_'))card.append(el('span','Демонстрационная запись','pill pending'));card.append(el('pre',record.content));const edit=el('button','Редактировать','secondary');edit.addEventListener('click',()=>knowledgeForm(record));card.append(edit);list.append(card);}
        setNotice('knowledgeNotice',data.records.length?'':'Записей не найдено.');
      }catch(error){setNotice('knowledgeNotice',error.message);}
    }
    document.querySelectorAll('nav button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('nav button').forEach(item=>item.classList.toggle('active',item===button));document.querySelectorAll('.tab').forEach(tab=>tab.classList.add('hidden'));$(button.dataset.tab+'Tab').classList.remove('hidden');$('pageTitle').textContent=labels[button.dataset.tab];if(button.dataset.tab==='leads')loadLeads();if(button.dataset.tab==='conversations')loadConversations();if(button.dataset.tab==='knowledge')loadKnowledge();}));
    $('loginForm').addEventListener('submit',async event=>{event.preventDefault();setNotice('loginNotice','Выполняем вход…');try{const data=await api('admin-login',{method:'POST',body:{password:$('password').value}});csrf=data.csrf;$('password').value='';showApp();checkHealth();}catch(error){$('password').value='';setNotice('loginNotice',error.message);}});
    $('logout').addEventListener('click',async()=>{try{await api('admin-logout',{method:'POST'});showLogin();}catch(error){setNotice('healthNotice',error.message);}});
    $('checkHealth').addEventListener('click',checkHealth);$('leadFilters').addEventListener('submit',loadLeads);$('knowledgeFilters').addEventListener('submit',loadKnowledge);$('newKnowledge').addEventListener('click',()=>knowledgeForm(null));
    api('admin-session').then(data=>{csrf=data.csrf;showApp();checkHealth();}).catch(()=>showLogin());
  })();
  </script>
</body>
</html>`;
