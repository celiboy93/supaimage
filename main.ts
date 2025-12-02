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

  // --- 1. Proxy (URL Upload) ---
  if (url.pathname === "/proxy") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("Missing URL", { status: 400 });
    try {
      const resp = await fetch(targetUrl);
      return new Response(resp.body, { headers: { "Content-Type": resp.headers.get("Content-Type") || "image/jpeg" }});
    } catch (e) { return new Response("Error", { status: 500 }); }
  }

  // --- 2. Upload API (Auto saves to History) ---
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

      // 🔥 AUTO SAVE TO HISTORY 🔥
      await supabase.from('history').insert({ public_url: publicUrl, file_name: safeName });

      return new Response(JSON.stringify({ url: publicUrl }), { headers: { "Content-Type": "application/json" } });
    } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }); }
  }

  // --- 3. Draft APIs (Queue) ---
  if (req.method === "POST" && url.pathname === "/draft/save") {
    const body = await req.json();
    await supabase.from('drafts').insert({ image_url: body.url, caption: body.caption });
    return new Response(JSON.stringify({ success: true }));
  }
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
    // Get last 50 uploads
    const { data } = await supabase.from('history').select('*').order('created_at', { ascending: false }).limit(50);
    return new Response(JSON.stringify({ items: data || [] }));
  }
  if (req.method === "POST" && url.pathname === "/history/delete") {
    const body = await req.json();
    // Delete record only (Optionally delete from storage too if needed)
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
      <title>Movie Admin Ultimate</title>
      <style>
        :root { --primary: #4f46e5; --bg: #f3f4f6; }
        body { font-family: sans-serif; background: var(--bg); padding: 10px; max-width: 600px; margin: 0 auto; }
        .card { background: white; padding: 15px; border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); margin-bottom: 15px; }
        
        /* Navigation */
        .nav { display: flex; gap: 5px; margin-bottom: 15px; background: #e5e7eb; padding: 5px; border-radius: 10px; }
        .nav-item { flex: 1; padding: 10px; text-align: center; cursor: pointer; border-radius: 8px; font-weight: 600; color: #6b7280; font-size: 14px; }
        .nav-item.active { background: white; color: var(--primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .view { display: none; }
        .view.active { display: block; }

        /* Upload Styles */
        .upload-zone { border: 2px dashed #a5b4fc; padding: 25px; text-align: center; border-radius: 10px; cursor: pointer; background: #eef2ff; color: #4f46e5; }
        .sub-tabs { display: flex; gap: 10px; margin-bottom: 10px; }
        .sub-tab { padding: 5px 10px; font-size: 12px; background: #f3f4f6; border-radius: 5px; cursor: pointer; }
        .sub-tab.active { background: #c7d2fe; color: #312e81; font-weight: bold; }
        .inp-area { display: none; } .inp-area.active { display: block; }
        input[type="text"], textarea { width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; }
        
        .btn { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-top: 10px; }
        
        /* List Items (Queue & History) */
        .item { display: flex; gap: 10px; padding: 10px; border-bottom: 1px solid #f3f4f6; align-items: center; }
        .item:last-child { border-bottom: none; }
        .thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; background: #eee; }
        .info { flex: 1; overflow: hidden; }
        .info-txt { font-size: 13px; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .meta { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .actions { display: flex; gap: 5px; }
        .btn-xs { padding: 5px 10px; border-radius: 4px; border: none; font-size: 11px; cursor: pointer; color: white; }
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
            <div class="sub-tab active" onclick="setInp('file')">File</div>
            <div class="sub-tab" onclick="setInp('url')">URL</div>
          </div>

          <div id="inp-file" class="inp-area active">
            <div class="upload-zone" onclick="document.getElementById('fileInput').click()">📸 Select Image</div>
            <input type="file" id="fileInput" accept="image/*" style="display:none">
          </div>
          <div id="inp-url" class="inp-area">
             <input type="text" id="urlInput" placeholder="Paste URL here...">
             <button class="btn" style="background:#6b7280; margin-top:0;" onclick="fetchUrl()">Fetch</button>
          </div>

          <div id="previewBox" style="display:none; margin-top:15px; text-align:center;">
             <div id="sizeMsg" style="font-size:12px; margin-bottom:5px; color:#6b7280;"></div>
             <img id="previewImg" style="max-height:150px; border-radius:8px;">
             <button class="btn" id="uploadBtn">Upload</button>
          </div>

          <div id="resultBox" style="display:none; margin-top:15px; padding-top:10px; border-top:1px solid #eee;">
             <input type="text" id="directLink" readonly onclick="this.select()">
             <button class="btn" style="background:#059669; padding:8px;" onclick="copyLink()">Copy Link</button>
             
             <div style="margin-top:15px;">
               <textarea id="caption" rows="2" placeholder="Caption for Queue..."></textarea>
               <button class="btn" style="background:#374151;" onclick="saveDraft()">Add to Queue 📥</button>
             </div>
          </div>
        </div>
      </div>

      <div id="view-queue" class="view">
        <div class="card">
           <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
             <b style="color:#374151">Pending Posts</b>
             <button onclick="sendAll()" style="background:#111827; color:white; border:none; padding:5px 10px; border-radius:4px; font-size:12px;">Send ALL 🚀</button>
           </div>
           <div id="queueList">Loading...</div>
        </div>
      </div>

      <div id="view-history" class="view">
        <div class="card">
           <b style="color:#374151; display:block; margin-bottom:10px;">Upload History (Last 50)</b>
           <div id="historyList">Loading...</div>
        </div>
      </div>

      <script>
        // --- Navigation ---
        function setView(v) {
          document.querySelectorAll('.view').forEach(e => e.classList.remove('active'));
          document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
          document.getElementById('view-'+v).classList.add('active');
          const idx = ['upload','queue','history'].indexOf(v);
          document.querySelectorAll('.nav-item')[idx].classList.add('active');
          if(v==='queue') loadList('draft');
          if(v==='history') loadList('history');
        }
        function setInp(t) {
          document.querySelectorAll('.inp-area').forEach(e => e.classList.remove('active'));
          document.querySelectorAll('.sub-tab').forEach(e => e.classList.remove('active'));
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
             processFile(new File([blob], "rem.jpg", { type: blob.type }));
           } catch(e) { alert("Error fetching"); }
        }

        async function processFile(f) {
           if(!f) return;
           let msg = \`Orig: \${(f.size/1024).toFixed(1)} KB\`;
           if(f.size > 71680) {
             msg += " -> Compressing...";
             document.getElementById('sizeMsg').innerText = msg;
             currFile = await compress(f, 0.6); // Keep resolution
             msg += \` \${(currFile.size/1024).toFixed(1)} KB\`;
           } else { currFile = f; }
           
           document.getElementById('sizeMsg').innerText = msg;
           document.getElementById('previewImg').src = URL.createObjectURL(currFile);
           document.getElementById('previewBox').style.display = 'block';
           document.getElementById('resultBox').style.display = 'none';
        }

        document.getElementById('uploadBtn').addEventListener('click', async () => {
           const btn = document.getElementById('uploadBtn');
           btn.innerText = "Uploading..."; btn.disabled = true;
           const fd = new FormData(); fd.append('file', currFile);
           
           const res = await fetch('/upload', { method:'POST', body:fd });
           const data = await res.json();
           
           if(data.url) {
             document.getElementById('directLink').value = data.url;
             document.getElementById('resultBox').style.display = 'block';
             btn.style.display = 'none';
           }
           btn.innerText = "Upload"; btn.disabled = false;
        });

        // --- Queue & History Logic ---
        async function saveDraft() {
           const url = document.getElementById('directLink').value;
           const cap = document.getElementById('caption').value;
           await fetch('/draft/save', { method:'POST', body:JSON.stringify({url, caption:cap}) });
           alert("Added to Queue");
           document.getElementById('caption').value = "";
           setView('queue');
        }

        async function loadList(type) {
           const div = document.getElementById(type+'List');
           div.innerHTML = "Loading...";
           const res = await fetch('/'+type+'/list');
           const data = await res.json();
           const items = data.items || [];
           
           if(items.length === 0) { div.innerHTML = "<p align='center' style='color:#ccc'>Empty</p>"; return; }

           div.innerHTML = items.map(i => {
             const date = new Date(i.created_at).toLocaleTimeString();
             // Difference between Draft and History items
             if(type === 'draft') {
               return \`<div class="item">
                 <img src="\${i.image_url}" class="thumb" onclick="window.open(this.src)">
                 <div class="info">
                   <div class="info-txt">\${i.caption || 'No Caption'}</div>
                   <div class="meta">\${date}</div>
                 </div>
                 <div class="actions">
                   <button class="btn-xs" style="background:#10b981" onclick="sendDraft(\${i.id})">Send</button>
                   <button class="btn-xs" style="background:#ef4444" onclick="delDraft(\${i.id})">Del</button>
                 </div>
               </div>\`;
             } else {
               // History Item
               return \`<div class="item">
                 <img src="\${i.public_url}" class="thumb" onclick="window.open(this.src)">
                 <div class="info">
                   <div class="info-txt"><a href="\${i.public_url}" target="_blank" style="text-decoration:none; color:#2563eb;">Link</a></div>
                   <div class="meta">\${date}</div>
                 </div>
                 <div class="actions">
                   <button class="btn-xs" style="background:#6366f1" onclick="copyHist('\${i.public_url}')">Copy</button>
                   <button class="btn-xs" style="background:#ef4444" onclick="delHist(\${i.id})">Del</button>
                 </div>
               </div>\`;
             }
           }).join('');
        }

        // Actions
        async function sendDraft(id) {
           const res = await fetch('/draft/list'); const d = await res.json();
           const item = d.items.find(x => x.id === id);
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
           if(d.items.length === 0) return alert("Empty");
           if(!confirm("Send all?")) return;
           for(const i of d.items) {
              await fetch('/draft/send', { method:'POST', body:JSON.stringify(i) });
              await new Promise(r => setTimeout(r, 1000));
           }
           alert("Done"); loadList('draft');
        }

        // History Actions
        async function delHist(id) {
           if(!confirm("Remove from history?")) return;
           await fetch('/history/delete', { method:'POST', body:JSON.stringify({id}) });
           loadList('history');
        }
        function copyHist(url) {
           navigator.clipboard.writeText(url); alert("Copied!");
        }
        function copyLink() { copyHist(document.getElementById('directLink').value); }

        // Utils
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
