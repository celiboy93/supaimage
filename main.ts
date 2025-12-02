import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_KEY") || ""; // Service Role Key သုံးရင် ပိုကောင်း
const supabase = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = "lugyiapp"; 

serve(async (req) => {
  const url = new URL(req.url);

  // --- 1. CORS Proxy (Remote URL တွေဆွဲဖို့အတွက်) ---
  // Browser ကနေ တခြား Link ကိုတန်းဆွဲရင် CORS error တက်တတ်လို့ Deno ကို ကြားခံခံတာပါ
  if (url.pathname === "/proxy") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("Missing URL", { status: 400 });
    try {
      const resp = await fetch(targetUrl);
      return new Response(resp.body, {
        headers: { "Content-Type": resp.headers.get("Content-Type") || "image/jpeg" }
      });
    } catch (e) {
      return new Response("Failed to fetch image", { status: 500 });
    }
  }

  // --- 2. Upload API ---
  if (req.method === "POST" && url.pathname === "/upload") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      
      if (!file) return new Response("No file uploaded", { status: 400 });

      // မြန်မာနာမည် ပြဿနာရှင်းရန် Random Name ပေးခြင်း
      const fileExt = file.name.split('.').pop() || 'jpg';
      const safeName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(safeName, file, {
          contentType: file.type,
          upsert: false
        });

      if (error) throw error;

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

  // --- 3. Frontend UI ---
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Smart Poster Uploader</title>
      <style>
        :root { --primary: #0ea5e9; --bg: #f8fafc; }
        body { font-family: sans-serif; background: var(--bg); display: flex; justify-content: center; padding: 20px; min-height: 100vh; }
        .card { background: white; width: 100%; max-width: 450px; padding: 25px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; }
        h2 { margin-top: 0; color: #334155; }
        
        /* Tabs */
        .tabs { display: flex; gap: 10px; margin-bottom: 20px; background: #e2e8f0; padding: 5px; border-radius: 8px; }
        .tab { flex: 1; padding: 10px; cursor: pointer; border-radius: 6px; font-weight: 600; font-size: 14px; color: #64748b; transition: 0.3s; }
        .tab.active { background: white; color: var(--primary); shadow: 0 2px 5px rgba(0,0,0,0.05); }

        /* Inputs */
        .input-group { margin-bottom: 15px; display: none; }
        .input-group.active { display: block; }
        
        .upload-box { border: 2px dashed #cbd5e1; padding: 30px; border-radius: 10px; cursor: pointer; color: #64748b; }
        .upload-box:hover { border-color: var(--primary); background: #f0f9ff; }
        
        input[type="text"] { width: 90%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; }
        input[type="text"]:focus { border-color: var(--primary); }

        /* Preview & Status */
        #preview { max-width: 100%; max-height: 250px; border-radius: 8px; margin: 15px auto; display: none; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .status { font-size: 13px; margin: 10px 0; color: #64748b; font-weight: 500; min-height: 20px;}
        
        .btn { background: var(--primary); color: white; border: none; padding: 12px; width: 100%; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; display: none; }
        .btn:disabled { opacity: 0.7; }

        /* Result */
        .result { margin-top: 20px; background: #f1f5f9; padding: 15px; border-radius: 8px; display: none; word-break: break-all; text-align: left; font-size: 13px; color: #334155; border: 1px solid #e2e8f0; }
        .copy-btn { float: right; background: #334155; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 10px;}
      </style>
    </head>
    <body>

      <div class="card">
        <h2>🍌 Smart Uploader</h2>
        
        <div class="tabs">
          <div class="tab active" onclick="switchTab('file')">File Upload</div>
          <div class="tab" onclick="switchTab('url')">Remote URL</div>
        </div>

        <div class="input-group active" id="fileSection">
          <div class="upload-box" onclick="document.getElementById('fileInput').click()">
            📂 Tap to select image
          </div>
          <input type="file" id="fileInput" accept="image/*" style="display:none">
        </div>

        <div class="input-group" id="urlSection">
          <input type="text" id="urlInput" placeholder="Paste image link here (https://...)" >
          <button onclick="fetchFromUrl()" style="margin-top:10px; padding:8px; width:100%; background:#e2e8f0; border:none; border-radius:6px; cursor:pointer;">Fetch Image</button>
        </div>

        <div class="status" id="statusText"></div>
        <img id="preview">
        
        <button class="btn" id="uploadBtn">Upload to Supabase 🚀</button>

        <div class="result" id="resultBox">
          <button class="copy-btn" onclick="copyLink()">Copy</button>
          <div id="finalLink"></div>
        </div>
      </div>

      <script>
        let currentFile = null;
        const uploadBtn = document.getElementById('uploadBtn');
        const statusText = document.getElementById('statusText');
        const preview = document.getElementById('preview');
        const resultBox = document.getElementById('resultBox');

        // Tab Switching
        function switchTab(type) {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.input-group').forEach(g => g.classList.remove('active'));
          
          if(type === 'file') {
            document.querySelectorAll('.tab')[0].classList.add('active');
            document.getElementById('fileSection').classList.add('active');
          } else {
            document.querySelectorAll('.tab')[1].classList.add('active');
            document.getElementById('urlSection').classList.add('active');
          }
          resetUI();
        }

        // 1. Handle File Selection
        document.getElementById('fileInput').addEventListener('change', (e) => processFile(e.target.files[0]));

        // 2. Handle URL Fetching
        async function fetchFromUrl() {
          const url = document.getElementById('urlInput').value;
          if(!url) return alert("Please enter a URL");
          
          statusText.innerText = "Fetching image from URL...";
          try {
            // Use our Deno proxy to avoid CORS
            const res = await fetch('/proxy?url=' + encodeURIComponent(url));
            if(!res.ok) throw new Error("Failed to fetch");
            const blob = await res.blob();
            const file = new File([blob], "remote_image.jpg", { type: blob.type });
            processFile(file);
          } catch (e) {
            statusText.innerText = "Error: Could not load image.";
          }
        }

        // 3. CORE LOGIC: Process & Check Size
        async function processFile(file) {
          if(!file) return;
          resetUI();
          
          // Display Original Info
          const originalSizeKB = (file.size / 1024).toFixed(2);
          statusText.innerHTML = \`Original: <b>\${originalSizeKB} KB</b>. Checking size limit...\`;
          
          // Show Preview
          preview.src = URL.createObjectURL(file);
          preview.style.display = "block";

          // --- 70KB Logic ---
          if (file.size > 71680) { // 70 * 1024 = 71680 bytes
             statusText.innerHTML += " <span style='color:orange'>Too big (>70KB). Resizing...</span>";
             
             // Resize to 800px width, 70% Quality
             currentFile = await resizeImage(file, 800, 0.7);
             
             const newSizeKB = (currentFile.size / 1024).toFixed(2);
             statusText.innerHTML = \`Original: \${originalSizeKB} KB -> <b>Resized: \${newSizeKB} KB</b>\`;
          } else {
             statusText.innerHTML += " <span style='color:green'>Size OK. Keeping original.</span>";
             currentFile = file;
          }
          
          uploadBtn.style.display = "block";
        }

        // 4. Upload Logic
        uploadBtn.addEventListener('click', async () => {
           if(!currentFile) return;
           uploadBtn.innerText = "Uploading...";
           uploadBtn.disabled = true;

           const formData = new FormData();
           formData.append('file', currentFile);

           try {
             const res = await fetch('/upload', { method: 'POST', body: formData });
             const data = await res.json();
             
             if(data.url) {
               resultBox.style.display = "block";
               document.getElementById('finalLink').innerText = data.url;
               uploadBtn.style.display = "none";
               statusText.innerHTML = "✅ Upload Successful!";
             } else {
               throw new Error(data.error);
             }
           } catch(e) {
             alert("Upload Failed: " + e.message);
             uploadBtn.innerText = "Try Again";
             uploadBtn.disabled = false;
           }
        });

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
              canvas.toBlob(blob => {
                resolve(new File([blob], file.name, { type: file.type }));
              }, file.type, quality);
            };
          });
        }

        function copyLink() {
          navigator.clipboard.writeText(document.getElementById('finalLink').innerText);
          alert("Copied!");
        }

        function resetUI() {
          preview.style.display = "none";
          uploadBtn.style.display = "none";
          resultBox.style.display = "none";
          statusText.innerText = "";
          uploadBtn.innerText = "Upload to Supabase 🚀";
          uploadBtn.disabled = false;
        }
      </script>
    </body>
    </html>
  `, { headers: { "content-type": "text/html; charset=utf-8" } });
});
