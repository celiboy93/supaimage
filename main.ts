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

  // --- 1. CORS Proxy (URL Upload အတွက်) ---
  if (url.pathname === "/proxy") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("Missing URL", { status: 400 });
    try {
      const resp = await fetch(targetUrl);
      return new Response(resp.body, {
        headers: { "Content-Type": resp.headers.get("Content-Type") || "image/jpeg" }
      });
    } catch (e) { return new Response("Error", { status: 500 }); }
  }

  // --- 2. Upload API ---
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
      return new Response(JSON.stringify({ url: publicUrl }), { headers: { "Content-Type": "application/json" } });
    } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
  }

  // --- 3. Draft APIs ---
  if (req.method === "POST" && url.pathname === "/draft/save") {
    const body = await req.json();
    await supabase.from('drafts').insert({ image_url: body.url, caption: body.caption });
    return new Response(JSON.stringify({ success: true }));
  }
  if (req.method === "GET" && url.pathname === "/draft/list") {
    const { data } = await supabase.from('drafts').select('*').order('created_at', { ascending: true });
    return new Response(JSON.stringify({ drafts: data || [] }));
  }
  if (req.method === "POST" && url.pathname === "/draft/delete") {
    const body = await req.json();
    await supabase.from('drafts').delete().eq('id', body.id);
    return new Response(JSON.stringify({ success: true }));
  }
  if (req.method === "POST" && url.pathname === "/draft/send") {
    const body = await req.json();
    const { id, image_url, caption } = body;
    const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`;
    await fetch(tgUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, photo: image_url, caption: caption, parse_mode: "HTML" })
    });
    await supabase.from('drafts').delete().eq('id', id);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- Frontend UI ---
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Movie Admin Pro</title>
      <style>
        :root { --primary: #0284c7; --bg: #f0f9ff; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); padding: 10px; max-width: 600px; margin: 0 auto; }
        .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 20px; }
        h3 { margin: 0 0 15px 0; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
        
        /* Main Tabs */
        .nav-tabs { display: flex; gap: 8px; margin-bottom: 15px; }
        .nav-btn { flex: 1; padding: 12px; border: none; background: #e0f2fe; border-radius: 8px; font-weight: 600; color: #0369a1; cursor: pointer; }
        .nav-btn.active { background: var(--primary); color: white; }
        .view-section { display: none; }
        .view-section.active { display: block; }

        /* Sub Tabs (File vs URL) */
        .sub-tabs { display: flex; gap: 5px; margin-bottom: 10px; }
        .sub-tab { padding: 6px 12px; font-size: 13px; background: #f1f5f9; border-radius: 6px; cursor: pointer; color: #64748b; font-weight: 500; }
        .sub-tab.active { background: #bae6fd; color: #0284c7; }
        .input-area { display: none; }
        .input-area.active { display: block; }

        .upload-zone { border: 2px dashed #93c5fd; border-radius: 10px; padding: 30px; text-align: center; cursor: pointer; color: #0284c7; background: #f0f9ff; }
        
        input[type="text"], textarea { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; }
        .btn { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 10px; }
        
        /* Queue Item */
        .q-item { background: #fff; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; margin-bottom: 10px; display: flex; gap: 10px; }
        .q-img { width: 70px; height: 70px; object-fit: cover; border-radius: 6px; background:#eee; }
        .q-actions { display: flex; flex-direction: column; gap: 5px; justify-content: center; margin-left: auto; }
        .btn-sm { padding: 6px 10px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; color: white; }

        .status-txt { font-size: 12px; color: #64748b; margin-top: 5px; text-align: center; }
      </style>
    </head>
    <body>

      <div class="nav-tabs">
        <button class="nav-btn active" onclick="setView('upload')">1. Upload</button>
        <button class="nav-btn" onclick="setView('queue'); loadQueue()">2. Queue</button>
      </div>

      <div id="view-upload" class="view-section active">
        <div class="card">
          <div class="sub-tabs">
            <div class="sub-tab active" onclick="setInput('file')">File Upload</div>
            <div class="sub-tab" onclick="setInput('url')">Remote URL</div>
          </div>

          <div id="in-file" class="input-area active">
            <div class="upload-zone" onclick="document.getElementById('fileInput').click()">📂 Tap to Select File</div>
            <input type="file" id="fileInput" accept="image/*" style="display:none">
          </div>

          <div id="in-url" class="input-area">
            <input type="text" id="urlInput" placeholder="Paste image URL here...">
            <button class="btn" onclick="fetchUrl()" style="background:#64748b; margin-top:0;">Fetch Image</button>
          </div>

          <div class="status-txt" id="sizeStatus"></div>

          <div id="previewBox" style="display:none; margin-top:15px; text-align:center;">
             <img id="previewImg" style="max-height:200px; border-radius:8px;">
             <button class="btn" id="uploadBtn">Upload to Supabase</button>
          </div>

          <div id="resultForm" style="display:none; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:10px;">
             <label style="font-size:12px; font-weight:bold;">Direct Link:</label>
             <input type="text" id="directLink" readonly onclick="this.select()">
             <button class="btn" style="background:#10b981; padding:8px;" onclick="copyLink()">Copy Link</button>
             
             <div style="margin-top:15px;">
               <label style="font-size:12px; font-weight:bold;">Caption for Telegram:</label>
               <textarea id="caption" rows="3" placeholder="Movie Title..."></textarea>
               <button class="btn" onclick="saveDraft()" style="background:#334155;">Save to Queue 📥</button>
             </div>
          </div>
        </div>
      </div>

      <div id="view-queue" class="view-section">
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
             <h3>Pending Posts</h3>
             <button onclick="sendAll()" style="background:#0f172a; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">Send ALL 🚀</button>
          </div>
          <div id="queueList">Loading...</div>
        </div>
      </div>

      <script>
        // --- UI Switching ---
        function setView(v) {
          document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active'));
          document.querySelectorAll('.nav-btn').forEach(e => e.classList.remove('active'));
          document.getElementById('view-'+v).classList.add('active');
          if(v==='upload') document.querySelector('.nav-btn:nth-child(1)').classList.add('active');
          else document.querySelector('.nav-btn:nth-child(2)').classList.add('active');
        }
        function setInput(t) {
          document.querySelectorAll('.input-area').forEach(e => e.classList.remove('active'));
          document.querySelectorAll('.sub-tab').forEach(e => e.classList.remove('active'));
          document.getElementById('in-'+t).classList.add('active');
          if(t==='file') document.querySelector('.sub-tab:nth-child(1)').classList.add('active');
          else document.querySelector('.sub-tab:nth-child(2)').classList.add('active');
        }

        let currentFile = null;

        // --- 1. File Handling ---
        document.getElementById('fileInput').addEventListener('change', (e) => processFile(e.target.files[0]));

        // --- 2. URL Handling ---
        async function fetchUrl() {
          const u = document.getElementById('urlInput').value;
          if(!u) return;
          document.getElementById('sizeStatus').innerText = "Fetching...";
          try {
            const res = await fetch('/proxy?url=' + encodeURIComponent(u));
            if(!res.ok) throw new Error("Failed");
            const blob = await res.blob();
            processFile(new File([blob], "remote.jpg", { type: blob.type }));
          } catch(e) { alert("Invalid URL"); }
        }

        // --- 3. Process & Compress (Keep Resolution) ---
        async function processFile(file) {
          if(!file) return;
          
          const originalKB = (file.size / 1024).toFixed(1);
          let msg = \`Original: \${originalKB} KB. \`;

          if (file.size > 71680) { // > 70KB
             msg += "<span style='color:orange'>Too big. Compressing (keeping resolution)...</span>";
             document.getElementById('sizeStatus').innerHTML = msg;
             
             // Compress with quality 0.6, BUT KEEP original Width/Height
             currentFile = await compressImage(file, 0.6); 
             
             const newKB = (currentFile.size / 1024).toFixed(1);
             msg += \`<br><b>New Size: \${newKB} KB</b>\`;
          } else {
             msg += "<span style='color:green'>Size OK.</span>";
             currentFile = file;
          }
          document.getElementById('sizeStatus').innerHTML = msg;
          document.getElementById('previewImg').src = URL.createObjectURL(currentFile);
          document.getElementById('previewBox').style.display = 'block';
          document.getElementById('resultForm').style.display = 'none';
        }

        // --- 4. Upload ---
        document.getElementById('uploadBtn').addEventListener('click', async () => {
           const btn = document.getElementById('uploadBtn');
           btn.innerText = "Uploading..."; btn.disabled = true;
           const fd = new FormData(); fd.append('file', currentFile);
           
           const res = await fetch('/upload', { method:'POST', body:fd });
           const data = await res.json();
           
           if(data.url) {
             document.getElementById('directLink').value = data.url;
             document.getElementById('resultForm').style.display = 'block';
             btn.style.display = 'none';
           }
           btn.innerText = "Upload"; btn.disabled = false;
        });

        // --- 5. Draft/Queue ---
        async function saveDraft() {
           const url = document.getElementById('directLink').value;
           const cap = document.getElementById('caption').value;
           await fetch('/draft/save', { method:'POST', body:JSON.stringify({url, caption:cap}) });
           alert("Saved to Queue ✅");
           // Reset
           document.getElementById('caption').value = "";
           document.getElementById('previewBox').style.display = 'none';
           document.getElementById('resultForm').style.display = 'none';
           document.getElementById('sizeStatus').innerText = "";
           setView('queue'); loadQueue();
        }

        async function loadQueue() {
           const list = document.getElementById('queueList');
           list.innerHTML = "Loading...";
           const res = await fetch('/draft/list');
           const data = await res.json();
           const drafts = data.drafts || [];
           
           if(drafts.length === 0) { list.innerHTML = "<p align='center'>Queue empty.</p>"; return; }
           
           list.innerHTML = drafts.map(d => \`
             <div class="q-item">
               <img src="\${d.image_url}" class="q-img" onclick="window.open(this.src)">
               <div style="flex:1">
                 <div style="font-size:13px; font-weight:500;">\${d.caption || 'No Caption'}</div>
               </div>
               <div class="q-actions">
                 <button class="btn-sm" style="background:#10b981" onclick="sendOne(\${d.id})">Send</button>
                 <button class="btn-sm" style="background:#ef4444" onclick="delOne(\${d.id})">Del</button>
               </div>
             </div>\`).join('');
        }

        async function sendOne(id) { 
            // We need full object, simplest is to refetch or pass props. 
            // Quick hack: find in global state is better, but here we reload to be safe
            const res = await fetch('/draft/list');
            const data = await res.json();
            const d = data.drafts.find(x => x.id === id);
            await fetch('/draft/send', { method:'POST', body:JSON.stringify(d) });
            loadQueue();
        }
        async function delOne(id) {
            if(!confirm("Delete?")) return;
            await fetch('/draft/delete', { method:'POST', body:JSON.stringify({id}) });
            loadQueue();
        }
        async function sendAll() {
            const res = await fetch('/draft/list');
            const data = await res.json();
            if(data.drafts.length === 0) return alert("Empty");
            if(!confirm("Send all?")) return;
            for(const d of data.drafts) {
               await fetch('/draft/send', { method:'POST', body:JSON.stringify(d) });
               await new Promise(r => setTimeout(r, 1000));
            }
            alert("Done!"); loadQueue();
        }
        function copyLink() {
           const e = document.getElementById('directLink'); e.select(); e.setSelectionRange(0,99999);
           navigator.clipboard.writeText(e.value); alert("Copied!");
        }

        // --- CORE: Compress without Resizing Dimensions ---
        function compressImage(file, quality) {
          return new Promise((resolve) => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              // Use ORIGINAL width/height (No Resizing of dimensions)
              canvas.width = img.width;
              canvas.height = img.height;
              
              ctx.drawImage(img, 0, 0, img.width, img.height);
              
              // Export with lower quality to reduce file size
              canvas.toBlob(blob => {
                resolve(new File([blob], file.name, { type: "image/jpeg" }));
              }, 'image/jpeg', quality); 
            };
          });
        }
      </script>
    </body>
    </html>
  `, { headers: { "content-type": "text/html; charset=utf-8" } });
});
