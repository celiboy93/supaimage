import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Deno Deploy Env Variables
const TG_BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN") || ""; 
const TG_CHAT_ID = Deno.env.get("TG_CHAT_ID") || ""; 
const BUCKET_NAME = "lugyiapp"; 

serve(async (req) => {
  const url = new URL(req.url);

  // --- 1. Upload API (Only Uploads, No Telegram) ---
  if (req.method === "POST" && url.pathname === "/upload") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) return new Response("No file", { status: 400 });

      // Resize & Upload logic
      const fileExt = file.name.split('.').pop() || 'jpg';
      const safeName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      
      const { error: upError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(safeName, file, { contentType: file.type, upsert: false });

      if (upError) throw upError;

      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(safeName);

      return new Response(JSON.stringify({ url: publicUrl }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // --- 2. Telegram Send API (Only Sends, No Upload) ---
  if (req.method === "POST" && url.pathname === "/send-tg") {
    try {
      const body = await req.json();
      const { photoUrl, caption } = body;

      if (!TG_BOT_TOKEN || !TG_CHAT_ID) throw new Error("Bot Token missing");

      // Telegram API Call
      const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`;
      const tgResp = await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TG_CHAT_ID,
          photo: photoUrl,
          caption: caption || "",
          parse_mode: "HTML"
        })
      });
      
      const tgData = await tgResp.json();
      return new Response(JSON.stringify({ success: tgData.ok, result: tgData }), {
        headers: { "Content-Type": "application/json" },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // --- 3. Frontend UI ---
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Toolbox</title>
      <style>
        :root { --primary: #2563eb; --bg: #f1f5f9; }
        body { font-family: sans-serif; background: var(--bg); padding: 10px; display: flex; justify-content: center; }
        .container { width: 100%; max-width: 500px; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        
        /* Tabs Design */
        .tabs { display: flex; background: #e2e8f0; }
        .tab { flex: 1; padding: 15px; text-align: center; cursor: pointer; font-weight: bold; color: #64748b; transition: 0.2s; border-bottom: 3px solid transparent; }
        .tab.active { background: white; color: var(--primary); border-bottom-color: var(--primary); }

        .content { padding: 20px; display: none; }
        .content.active { display: block; }

        /* Elements */
        .upload-area { border: 2px dashed #cbd5e1; border-radius: 8px; padding: 30px; text-align: center; cursor: pointer; margin-bottom: 15px; }
        .upload-area:hover { border-color: var(--primary); background: #eff6ff; }
        
        textarea { width: 94%; height: 100px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-family: inherit; resize: vertical; margin-bottom: 10px; }
        input[type="text"] { width: 94%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 10px; }
        
        .btn { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 16px; }
        .btn:disabled { opacity: 0.7; }
        
        .preview-img { max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 10px; display: none; }
        .status-msg { margin-top: 10px; font-size: 14px; text-align: center; color: #475569; }
        
        .copy-row { display: flex; gap: 5px; margin-top: 10px; background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; }
        .copy-row input { margin: 0; flex: 1; border: none; background: transparent; font-size: 12px; }
        .copy-btn { padding: 5px 10px; background: #334155; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }

        .note { font-size: 12px; color: #64748b; margin-bottom: 10px; }
      </style>
    </head>
    <body>

      <div class="container">
        <div class="tabs">
          <div class="tab active" onclick="showTab(1)">1. Upload Photo</div>
          <div class="tab" onclick="showTab(2)">2. Post to TG</div>
        </div>

        <div id="tab1" class="content active">
          <div class="upload-area" onclick="document.getElementById('fileInput').click()">
            📸 Tap to Upload Poster
          </div>
          <input type="file" id="fileInput" accept="image/*" style="display:none">
          
          <img id="preview1" class="preview-img">
          <button class="btn" id="uploadBtn" style="display:none">Upload to Supabase</button>
          
          <div id="result1" style="display:none">
            <div class="status-msg">✅ Uploaded! Copy this link for Admin Panel:</div>
            <div class="copy-row">
              <input type="text" id="linkOutput" readonly>
              <button class="copy-btn" onclick="copyLink()">Copy</button>
            </div>
            <div class="note" style="margin-top:10px; text-align:center;">
              (Tip: Copy this link, use it in your Admin Panel. Then go to Tab 2 to post.)
            </div>
          </div>
        </div>

        <div id="tab2" class="content">
          <div class="note">Paste the poster link and write your caption here.</div>
          
          <input type="text" id="tgPhotoUrl" placeholder="Paste Poster URL here...">
          
          <textarea id="tgCaption" placeholder="Movie Title&#10;Resolution: 1080p&#10;Link: https://..."></textarea>
          
          <img id="preview2" class="preview-img" src="" onerror="this.style.display='none'">
          
          <button class="btn" id="sendTgBtn">Send to Telegram 🚀</button>
          <div id="status2" class="status-msg"></div>
        </div>
      </div>

      <script>
        // --- UI Logic ---
        function showTab(n) {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
          document.querySelectorAll('.tab')[n-1].classList.add('active');
          document.getElementById('tab'+n).classList.add('active');
        }

        // --- Tab 1: Upload Logic ---
        let currentFile = null;
        document.getElementById('fileInput').addEventListener('change', async (e) => {
           const file = e.target.files[0];
           if(!file) return;
           
           // Resize Logic
           currentFile = await resizeImage(file, 800, 0.7);
           
           document.getElementById('preview1').src = URL.createObjectURL(currentFile);
           document.getElementById('preview1').style.display = 'block';
           document.getElementById('uploadBtn').style.display = 'block';
           document.getElementById('result1').style.display = 'none';
        });

        document.getElementById('uploadBtn').addEventListener('click', async () => {
           const btn = document.getElementById('uploadBtn');
           btn.innerText = "Uploading...";
           btn.disabled = true;

           const formData = new FormData();
           formData.append('file', currentFile);

           try {
             const res = await fetch('/upload', { method: 'POST', body: formData });
             const data = await res.json();
             if(data.url) {
               document.getElementById('linkOutput').value = data.url;
               document.getElementById('result1').style.display = 'block';
               // Auto fill Tab 2
               document.getElementById('tgPhotoUrl').value = data.url;
               document.getElementById('preview2').src = data.url;
               document.getElementById('preview2').style.display = 'block';
             }
           } catch(e) { alert("Error"); }
           
           btn.innerText = "Upload to Supabase";
           btn.disabled = false;
        });

        // --- Tab 2: Send Logic ---
        document.getElementById('tgPhotoUrl').addEventListener('input', (e) => {
           const url = e.target.value;
           if(url.startsWith('http')) {
             document.getElementById('preview2').src = url;
             document.getElementById('preview2').style.display = 'block';
           }
        });

        document.getElementById('sendTgBtn').addEventListener('click', async () => {
           const url = document.getElementById('tgPhotoUrl').value;
           const cap = document.getElementById('tgCaption').value;
           const btn = document.getElementById('sendTgBtn');
           
           if(!url) return alert("Please enter image URL");
           
           btn.innerText = "Sending...";
           btn.disabled = true;

           try {
             const res = await fetch('/send-tg', {
               method: 'POST',
               headers: {'Content-Type': 'application/json'},
               body: JSON.stringify({ photoUrl: url, caption: cap })
             });
             const data = await res.json();
             
             if(data.success) {
               document.getElementById('status2').innerHTML = "<span style='color:green'>✅ Sent Successfully!</span>";
               // Clear inputs
               document.getElementById('tgCaption').value = "";
             } else {
               document.getElementById('status2').innerHTML = "<span style='color:red'>❌ Failed: " + (data.error || "Check bot token") + "</span>";
             }
           } catch(e) {
             document.getElementById('status2').innerText = "Network Error";
           }
           btn.innerText = "Send to Telegram 🚀";
           btn.disabled = false;
        });

        function copyLink() {
          const copyText = document.getElementById("linkOutput");
          copyText.select();
          copyText.setSelectionRange(0, 99999); 
          navigator.clipboard.writeText(copyText.value);
          alert("Copied!");
        }

        function resizeImage(file, maxWidth, quality) {
          return new Promise((resolve) => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              let w = img.width, h = img.height;
              if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; }
              canvas.width = w; canvas.height = h;
              ctx.drawImage(img, 0, 0, w, h);
              canvas.toBlob(blob => resolve(new File([blob], file.name, { type: file.type })), file.type, quality);
            };
          });
        }
      </script>
    </body>
    </html>
  `, { headers: { "content-type": "text/html; charset=utf-8" } });
});
