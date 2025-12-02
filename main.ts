import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const TG_BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN") || ""; 
const TG_CHAT_ID = Deno.env.get("TG_CHAT_ID") || ""; 
const BUCKET_NAME = "lugyiapp"; 

serve(async (req) => {
  const url = new URL(req.url);

  // --- 1. Proxy (Remote URL Helper) ---
  if (url.pathname === "/proxy") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("Missing URL", { status: 400 });
    try {
      const resp = await fetch(targetUrl);
      return new Response(resp.body, { headers: { "Content-Type": resp.headers.get("Content-Type") || "image/jpeg" }});
    } catch (e) { return new Response("Error", { status: 500 }); }
  }

  // --- 2. Upload API (Saves to History automatically) ---
  if (req.method === "POST" && url.pathname === "/upload") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) return new Response("No file", { status: 400 });

      const fileExt = file.name.split('.').pop() || 'jpg';
      const safeName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      
      const { error: upError } = await supabase.storage.from(BUCKET_NAME).upload(safeName, file, { contentType: file.type, upsert: false });
      if (upError) throw upError;

      const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(safeName);

      // Save to History
      await supabase.from('history').insert({ public_url: publicUrl, file_name: safeName });

      return new Response(JSON.stringify({ url: publicUrl }), { headers: { "Content-Type": "application/json" } });
    } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
  }

  // --- 3. Draft/Queue APIs ---
  if (req.method === "POST" && url.pathname === "/draft/save") {
    const body = await req.json();
    await supabase.from('drafts').insert({ image_url: body.url, caption: body.caption });
    return new Response(JSON.stringify({ success: true }));
  }
  // Fixed: Returns 'items' to match frontend expectation
  if (req.method === "GET" && url.pathname === "/draft/list") {
    const { data } = await supabase.from('drafts').select('*').order('created_at', { ascending: true });
    return new Response(JSON.stringify({ items: data || [] }));
  }
  if (req.method === "POST" && url.pathname === "/draft/delete") {
    const body = await req.json();
    await supabase.from('drafts').delete().eq('id', body.id);
    return new Response(JSON.stringify({ success: true }));
  }
  if (req.method === "POST" && url.pathname === "/draft/send") {
    const body = await req.json();
    const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`;
    await fetch(tgUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, photo: body.image_url, caption: body.caption, parse_mode: "HTML" })
    });
    await supabase.from('drafts').delete().eq('id', body.id);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- 4. History APIs ---
  if (req.method === "GET" && url.pathname === "/history/list") {
    const { data } = await supabase.from('history').select('*').order('created_at', { ascending: false }).limit(50);
    return new Response(JSON.stringify({ items: data || [] }));
  }
  if (req.method === "POST" && url.pathname === "/history/delete") {
    const body = await req.json();
    await supabase.from('history').delete().eq('id', body.id);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- Frontend UI ---
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Movie Admin X</title>
      <style>
        :root { --primary: #6366f1; --bg: #f8fafc; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); padding: 15px; max-width: 600px; margin: 0 auto; color: #334155; }
        
        /* Navigation Tabs */
        .nav { display: flex; background: #e2e8f0; padding: 4px; border-radius: 10px; margin-bottom: 20px; }
        .nav-item { flex: 1; padding: 10px; text-align: center; cursor: pointer; border-radius: 8px; font-weight: 600; font-size: 14px; color: #64748b; transition: 0.2s; }
        .nav-item.active { background: white; color: var(--primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        
        .view { display: none; animation: fadeIn 0.3s; }
        .view.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* Card Style */
        .card { background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 20px; }
        
        /* Upload Section */
        .sub-tabs { display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
        .sub-tab { font-size: 13px; font-weight: 600; cursor: pointer; color: #94a3b8; padding: 5px 0; }
        .sub-tab.active { color: var(--primary); border-bottom: 2px solid var(--primary); }
        
        .inp-area { display: none; } .inp-area.active { display: block; }
        
        .upload-zone { border: 2px dashed #cbd5e1; border-radius: 12px; padding: 30px; text-align: center; cursor: pointer; background: #f8fafc; color: #64748b; margin-top: 10px; }
        .upload-zone:active { border-color: var(--primary); background: #eef2ff; color: var(--primary); }

        input, textarea { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; margin-top: 8px; box-sizing: border-box; font-family: inherit; }
        input:focus, textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1); }

        .btn { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 15px; font-size: 15px; }
        .btn:disabled { opacity: 0.7; cursor: wait; }
        
        /* List Items */
        .list-container { min-height: 100px; }
        .item { display: flex; gap: 12px; padding: 12px; border: 1px solid #f1f5f9; border-radius: 10px; margin-bottom: 10px; background: white; align-items: center; }
        .thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; background: #eee; border: 1px solid #e2e8f0; }
        .info { flex: 1; overflow: hidden; }
        .caption { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .meta { font-size: 12px; color: #94a3b8; margin-top: 3px; }
        .actions { display: flex; flex-direction: column; gap: 6px; }
        .btn-sm { padding: 6px 10px; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; color: white; min-width: 50px; }
        
        #previewBox { display: none; text-align: center; margin-top: 20px; }
        #previewImg { max-height: 180px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        #resultBox { display: none; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>

      <div class="nav">
        <div class="nav-item active" onclick="setView('upload')">1. Upload</div>
        <div class="nav-item" onclick="setView('queue')">2. Queue</div>
        <div class="nav-item" onclick="setView('history')">3. History</div>
      </div>

      <div id="view-upload" class="view active">
        <div class="card">
          <div class="sub-tabs">
            <div class="sub-tab active" onclick="setInp('file')">FILE UPLOAD</div>
            <div class="sub-tab" style="margin-left:15px;" onclick="setInp('url')">REMOTE URL</div>
          </div>

          <div id="inp-file" class="inp-area active">
            <div class="upload-zone" onclick="document.getElementById('fileInput').click()">
              📸 Tap to Select Image
            </div>
            <input type="file" id="fileInput" accept="image/*" style="display:none">
          </div>

          <div id="inp-url" class="inp-area">
             <input type="text" id="urlInput" placeholder="Paste image URL here...">
             <button class="btn" style="background:#475569; margin-top:10px;" onclick="fetchUrl()">Fetch Image</button>
          </div>

          <div id="previewBox">
             <div id="sizeMsg" style="font-size:12px; color:#64748b; margin-bottom:8px;"></div>
             <img id="previewImg">
             <button class="btn" id="uploadBtn">Upload to Supabase 🚀</button>
          </div>

          <div id="resultBox">
             <label style="font-size:12px; font-weight:bold; color:#059669;">DIRECT LINK:</label>
             <div style="display:flex; gap:5px;">
               <input type="text" id="directLink" readonly onclick="this.select()" style="margin-top:0;">
               <button onclick="copyLink()" style="background:#059669; color:white; border:none; border-radius:8px; padding:0 12px; cursor:pointer;">Copy</button>
             </div>
             
             <div style="margin-top:20px; background:#f0fdf4; padding:15px; border-radius:10px; border:1px solid #bbf7d0;">
               <label style="font-size:12px; font-weight:bold; color:#15803d;">ADD TO QUEUE:</label>
               <textarea id="caption" rows="2" placeholder="Movie Title / Caption..."></textarea>
               <button class="btn" style="background:#15803d; margin-top:8px;" onclick="saveDraft()">Save Draft 📥</button>
             </div>
          </div>
        </div>
      </div>

      <div id="view-queue" class="view">
        <div class="card">
           <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
             <b style="color:#0f172a;">Pending Posts</b>
             <button onclick="sendAll()" style="background:#0f172a; color:white; border:none; padding:8px 12px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">Send ALL 🚀</button>
           </div>
           <div id="queueList" class="list-container">Loading...</div>
        </div>
      </div>

      <div id="view-history" class="view">
        <div class="card">
           <b style="color:#0f172a; display:block; margin-bottom:15px;">Upload History</b>
           <div id="historyList" class="list-container">Loading...</div>
        </div>
      </div>

      <script>
        // --- Navigation Logic ---
        function setView(v) {
          // Update Tabs
          document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
          const idx = ['upload','queue','history'].indexOf(v);
          document.querySelectorAll('.nav-item')[idx].classList.add('active');
          
          // Update View
          document.querySelectorAll('.view').forEach(e => e.classList.remove('active'));
          document.getElementById('view-'+v).classList.add('active');

          // Load Data if needed
          if(v === 'queue') loadList('draft'); // FIXED NAME MAPPING HERE
          if(v === 'history') loadList('history');
        }

        function setInp(t) {
          document.querySelectorAll('.sub-tab').forEach(e => e.classList.remove('active'));
          document.querySelectorAll('.inp-area').forEach(e => e.classList.remove('active'));
          
          document.getElementById('inp-'+t).classList.add('active');
          const idx = ['file','url'].indexOf(t);
          document.querySelectorAll('.sub-tab')[idx].classList.add('active');
        }

        // --- Upload Logic ---
        let currFile = null;
        document.getElementById('fileInput').addEventListener('change', (e) => processFile(e.target.files[0]));

        async function fetchUrl() {
           const u = document.getElementById('urlInput').value;
           if(!u) return;
           try {
             const res = await fetch('/proxy?url='+encodeURIComponent(u));
             const blob = await res.blob();
             processFile(new File([blob], "remote.jpg", { type: blob.type }));
           } catch(e) { alert("Failed to fetch image"); }
        }

        async function processFile(f) {
           if(!f) return;
           let msg = \`Original: \${(f.size/1024).toFixed(1)} KB\`;
           
           if(f.size > 71680) { // 70KB
             msg += " <span style='color:#eab308'>(Compressing...)</span>";
             document.getElementById('sizeMsg').innerHTML = msg;
             currFile = await compress(f, 0.6);
             msg += \` ➝ \${(currFile.size/1024).toFixed(1)} KB\`;
           } else {
             currFile = f;
           }
           
           document.getElementById('sizeMsg').innerHTML = msg;
           document.getElementById('previewImg').src = URL.createObjectURL(currFile);
           document.getElementById('previewBox').style.display = 'block';
           document.getElementById('resultBox').style.display = 'none';
        }

        document.getElementById('uploadBtn').addEventListener('click', async () => {
           const btn = document.getElementById('uploadBtn');
           btn.innerText = "Uploading..."; btn.disabled = true;
           
           const fd = new FormData(); fd.append('file', currFile);
           try {
             const res = await fetch('/upload', { method:'POST', body:fd });
             const data = await res.json();
             if(data.url) {
               document.getElementById('directLink').value = data.url;
               document.getElementById('resultBox').style.display = 'block';
               btn.style.display = 'none';
             }
           } catch(e) { alert("Error uploading"); }
           btn.innerText = "Upload to Supabase 🚀"; btn.disabled = false;
        });

        // --- Draft & Queue Logic ---
        async function saveDraft() {
           const url = document.getElementById('directLink').value;
           const cap = document.getElementById('caption').value;
           await fetch('/draft/save', { method:'POST', body:JSON.stringify({url, caption:cap}) });
           alert("Added to Queue ✅");
           document.getElementById('caption').value = "";
           setView('queue'); // Auto go to queue
        }

        async function loadList(type) {
           // FIXED: Map 'draft' type to 'queueList' ID
           const targetId = type === 'draft' ? 'queueList' : 'historyList';
           const div = document.getElementById(targetId);
           
           div.innerHTML = "<div style='text-align:center; color:#94a3b8; padding:20px;'>Loading...</div>";
           
           try {
             const res = await fetch(type === 'draft' ? '/draft/list' : '/history/list');
             const data = await res.json();
             const items = data.items || []; // Backend returns { items: [...] }

             if(items.length === 0) {
               div.innerHTML = "<div style='text-align:center; color:#94a3b8; padding:20px;'>Empty</div>";
               return;
             }

             div.innerHTML = items.map(i => {
               const date = new Date(i.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
               
               if(type === 'draft') {
                 // Draft Item
                 return \`
                   <div class="item">
                     <img src="\${i.image_url}" class="thumb" onclick="window.open(this.src)">
                     <div class="info">
                       <div class="caption">\${i.caption || '<i style="color:#ccc">No Caption</i>'}</div>
                       <div class="meta">\${date}</div>
                     </div>
                     <div class="actions">
                       <button class="btn-sm" style="background:#10b981" onclick="sendDraft(\${i.id})">Send</button>
                       <button class="btn-sm" style="background:#ef4444" onclick="delDraft(\${i.id})">Del</button>
                     </div>
                   </div>\`;
               } else {
                 // History Item
                 return \`
                   <div class="item">
                     <img src="\${i.public_url}" class="thumb" onclick="window.open(this.src)">
                     <div class="info">
                       <div class="caption" style="font-size:12px; color:#2563eb;">\${i.file_name}</div>
                       <div class="meta">\${date}</div>
                     </div>
                     <div class="actions">
                       <button class="btn-sm" style="background:#3b82f6" onclick="copyUrl('\${i.public_url}')">Copy</button>
                       <button class="btn-sm" style="background:#ef4444" onclick="delHist(\${i.id})">Del</button>
                     </div>
                   </div>\`;
               }
             }).join('');
           } catch(e) {
             div.innerHTML = "<div style='color:red; text-align:center'>Error loading list</div>";
           }
        }

        // --- Actions ---
        async function sendDraft(id) {
           // Reload to get full item data (safest way)
           const res = await fetch('/draft/list'); const d = await res.json();
           const item = d.items.find(x => x.id === id);
           if(!item) return;
           
           await fetch('/draft/send', { method:'POST', body:JSON.stringify(item) });
           loadList('draft');
        }
        async function delDraft(id) {
           if(!confirm("Delete?")) return;
           await fetch('/draft/delete', { method:'POST', body:JSON.stringify({id}) });
           loadList('draft');
        }
        async function sendAll() {
           const res = await fetch('/draft/list'); const d = await res.json();
           if(d.items.length === 0) return alert("Queue is empty");
           if(!confirm(\`Send all \${d.items.length} posts?\`)) return;
           
           for(const item of d.items) {
             await fetch('/draft/send', { method:'POST', body:JSON.stringify(item) });
             await new Promise(r => setTimeout(r, 1000)); // 1 sec delay
           }
           alert("All Sent! 🎉");
           loadList('draft');
        }
        
        // History Actions
        async function delHist(id) {
           if(!confirm("Delete from history?")) return;
           await fetch('/history/delete', { method:'POST', body:JSON.stringify({id}) });
           loadList('history');
        }
        function copyUrl(u) { navigator.clipboard.writeText(u); alert("Copied!"); }
        function copyLink() { copyUrl(document.getElementById('directLink').value); }

        // Compressor
        function compress(file, quality) {
          return new Promise((resolve) => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = img.width; canvas.height = img.height;
              ctx.drawImage(img, 0, 0, img.width, img.height);
              canvas.toBlob(blob => resolve(new File([blob], file.name, { type: "image/jpeg" })), 'image/jpeg', quality); 
            };
          });
        }
      </script>
    </body>
    </html>
  `, { headers: { "content-type": "text/html; charset=utf-8" } });
});
