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

  // --- API 1: Upload Image ---
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

  // --- API 2: Draft Operations ---
  
  // Save Draft
  if (req.method === "POST" && url.pathname === "/draft/save") {
    const body = await req.json();
    const { error } = await supabase.from('drafts').insert({ image_url: body.url, caption: body.caption });
    return new Response(JSON.stringify({ success: !error, error }), { headers: { "Content-Type": "application/json" } });
  }

  // Get Drafts
  if (req.method === "GET" && url.pathname === "/draft/list") {
    const { data, error } = await supabase.from('drafts').select('*').order('created_at', { ascending: true });
    return new Response(JSON.stringify({ drafts: data || [] }), { headers: { "Content-Type": "application/json" } });
  }

  // Delete Draft
  if (req.method === "POST" && url.pathname === "/draft/delete") {
    const body = await req.json();
    await supabase.from('drafts').delete().eq('id', body.id);
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  }

  // Send Single Draft to Telegram
  if (req.method === "POST" && url.pathname === "/draft/send") {
    try {
      const body = await req.json();
      const { id, image_url, caption } = body;
      
      // Send to TG
      const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`;
      const tgResp = await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, photo: image_url, caption: caption, parse_mode: "HTML" })
      });
      const tgData = await tgResp.json();

      if (tgData.ok) {
        // Success: Delete from draft
        await supabase.from('drafts').delete().eq('id', id);
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ success: false, error: tgData.description }), { headers: { "Content-Type": "application/json" } });
      }
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
  }

  // --- Frontend UI ---
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Draft Manager</title>
      <style>
        :root { --primary: #7c3aed; --bg: #f3f4f6; }
        body { font-family: sans-serif; background: var(--bg); padding: 10px; display: flex; justify-content: center; }
        .container { width: 100%; max-width: 500px; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        
        .tabs { display: flex; background: #e5e7eb; }
        .tab { flex: 1; padding: 15px; text-align: center; cursor: pointer; font-weight: bold; color: #6b7280; border-bottom: 3px solid transparent; }
        .tab.active { background: white; color: var(--primary); border-bottom-color: var(--primary); }
        .content { padding: 20px; display: none; }
        .content.active { display: block; }

        .upload-area { border: 2px dashed #d1d5db; padding: 20px; text-align: center; border-radius: 8px; cursor: pointer; margin-bottom: 10px; }
        .btn { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 10px; }
        .btn-outline { background: white; border: 1px solid var(--primary); color: var(--primary); }
        .btn-danger { background: #ef4444; }
        
        textarea, input { width: 94%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; margin-bottom: 10px; }
        
        /* Draft List Styles */
        .draft-item { border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px; margin-bottom: 10px; background: #fafafa; }
        .draft-header { display: flex; gap: 10px; align-items: flex-start; }
        .draft-img { width: 60px; height: 80px; object-fit: cover; border-radius: 4px; background: #ddd; }
        .draft-text { flex: 1; font-size: 13px; color: #374151; white-space: pre-wrap; }
        .draft-actions { display: flex; gap: 5px; margin-top: 10px; }
        .action-btn { flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; color: white; font-size: 12px; font-weight: bold; }
        .send-btn { background: #10b981; }
        .del-btn { background: #ef4444; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="tabs">
          <div class="tab active" onclick="showTab(1)">1. Upload</div>
          <div class="tab" onclick="showTab(2)">2. Add Draft</div>
          <div class="tab" onclick="showTab(3); loadDrafts()">3. Queue</div>
        </div>

        <div id="tab1" class="content active">
          <div class="upload-area" onclick="document.getElementById('fileInput').click()">📸 Tap to Upload</div>
          <input type="file" id="fileInput" accept="image/*" style="display:none">
          <img id="preview1" style="max-width:100%; display:none; border-radius:8px;">
          <button class="btn" id="uploadBtn" style="display:none">Upload & Get Link</button>
          
          <div id="result1" style="display:none; margin-top:10px;">
            <input type="text" id="linkOutput" readonly>
            <button class="btn btn-outline" onclick="copyLink()">Copy Link</button>
            <p style="text-align:center; font-size:12px; color:#666;">(Link copied! Go to Tab 2 to save draft)</p>
          </div>
        </div>

        <div id="tab2" class="content">
          <input type="text" id="draftUrl" placeholder="Paste Image URL">
          <textarea id="draftCaption" style="height:100px" placeholder="Enter Caption..."></textarea>
          <img id="preview2" style="width:100px; display:none; border-radius:4px; margin-bottom:10px;">
          <button class="btn" id="saveDraftBtn">Save to Queue 📥</button>
        </div>

        <div id="tab3" class="content">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
             <h3 style="margin:0">Draft Queue</h3>
             <button onclick="sendAll()" style="background:#10b981; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-size:12px;">🚀 Send ALL</button>
          </div>
          <div id="draftList">Loading...</div>
        </div>
      </div>

      <script>
        function showTab(n) {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
          document.querySelectorAll('.tab')[n-1].classList.add('active');
          document.getElementById('tab'+n).classList.add('active');
        }

        // --- TAB 1: Upload ---
        let currentFile = null;
        document.getElementById('fileInput').addEventListener('change', async (e) => {
           currentFile = await resizeImage(e.target.files[0], 800, 0.7);
           document.getElementById('preview1').src = URL.createObjectURL(currentFile);
           document.getElementById('preview1').style.display = 'block';
           document.getElementById('uploadBtn').style.display = 'block';
        });

        document.getElementById('uploadBtn').addEventListener('click', async () => {
           const btn = document.getElementById('uploadBtn');
           btn.innerText = "Uploading..."; btn.disabled = true;
           const fd = new FormData(); fd.append('file', currentFile);
           
           const res = await fetch('/upload', { method: 'POST', body: fd });
           const data = await res.json();
           
           if(data.url) {
             document.getElementById('linkOutput').value = data.url;
             document.getElementById('result1').style.display = 'block';
             // Auto-fill Tab 2
             document.getElementById('draftUrl').value = data.url;
             document.getElementById('preview2').src = data.url;
             document.getElementById('preview2').style.display = 'block';
             copyLink();
           }
           btn.innerText = "Upload & Get Link"; btn.disabled = false;
        });

        // --- TAB 2: Save Draft ---
        document.getElementById('saveDraftBtn').addEventListener('click', async () => {
           const url = document.getElementById('draftUrl').value;
           const cap = document.getElementById('draftCaption').value;
           if(!url) return alert("Need Image URL");
           
           const res = await fetch('/draft/save', { 
             method: 'POST', headers: {'Content-Type':'application/json'},
             body: JSON.stringify({ url, caption: cap })
           });
           const data = await res.json();
           if(data.success) {
             alert("Saved to Queue! ✅");
             document.getElementById('draftCaption').value = ""; // Clear caption
             showTab(3); loadDrafts(); // Go to Queue
           } else { alert("Error saving"); }
        });

        // --- TAB 3: Draft List ---
        let drafts = [];
        async function loadDrafts() {
           const list = document.getElementById('draftList');
           list.innerHTML = "Loading...";
           const res = await fetch('/draft/list');
           const data = await res.json();
           drafts = data.drafts;
           renderList();
        }

        function renderList() {
           const list = document.getElementById('draftList');
           if(drafts.length === 0) { list.innerHTML = "<p style='text-align:center;color:#888'>No drafts yet.</p>"; return; }
           
           list.innerHTML = drafts.map(d => \`
             <div class="draft-item" id="draft-\${d.id}">
               <div class="draft-header">
                 <img src="\${d.image_url}" class="draft-img" onclick="window.open(this.src)">
                 <div class="draft-text">\${d.caption || '(No caption)'}</div>
               </div>
               <div class="draft-actions">
                 <button class="action-btn send-btn" onclick="sendDraft(\${d.id})">Send Now</button>
                 <button class="action-btn del-btn" onclick="deleteDraft(\${d.id})">Delete</button>
               </div>
             </div>
           \`).join('');
        }

        async function sendDraft(id) {
           const d = drafts.find(x => x.id === id);
           if(!confirm("Send this post to Telegram?")) return;
           
           // UI Update
           const div = document.getElementById('draft-'+id);
           div.style.opacity = '0.5';
           
           const res = await fetch('/draft/send', { 
             method: 'POST', headers: {'Content-Type':'application/json'},
             body: JSON.stringify(d)
           });
           const data = await res.json();
           
           if(data.success) {
             loadDrafts(); // Reload list
           } else {
             alert("Failed: " + data.error);
             div.style.opacity = '1';
           }
        }

        async function deleteDraft(id) {
           if(!confirm("Delete this draft?")) return;
           await fetch('/draft/delete', { method:'POST', body: JSON.stringify({id}) });
           loadDrafts();
        }

        async function sendAll() {
           if(drafts.length === 0) return alert("Queue is empty");
           if(!confirm(\`Send ALL \${drafts.length} posts to Telegram one by one?\`)) return;
           
           const btn = document.querySelector('button[onclick="sendAll()"]');
           btn.disabled = true; btn.innerText = "Sending...";

           for (const d of drafts) {
              await fetch('/draft/send', { 
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify(d)
              });
              // Small delay to be polite to Telegram API
              await new Promise(r => setTimeout(r, 1000));
           }
           
           btn.disabled = false; btn.innerText = "🚀 Send ALL";
           loadDrafts();
           alert("All sent! 🎉");
        }

        function copyLink() {
          const c = document.getElementById("linkOutput"); c.select(); c.setSelectionRange(0,99999);
          navigator.clipboard.writeText(c.value);
        }
        function resizeImage(f,w,q){return new Promise(r=>{const i=document.createElement('img');i.src=URL.createObjectURL(f);i.onload=()=>{const c=document.createElement('canvas'),x=c.getContext('2d');let a=i.width,b=i.height;if(a>w){b*=w/a;a=w}c.width=a;c.height=b;x.drawImage(i,0,0,a,b);c.toBlob(z=>r(new File([z],f.name,{type:f.type})),f.type,q)}})}
      </script>
    </body>
    </html>
  `, { headers: { "content-type": "text/html; charset=utf-8" } });
});
