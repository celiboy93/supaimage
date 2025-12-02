import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Deno Deploy Settings ထဲမှာ ဒီ ၂ ခု ထပ်ဖြည့်ပေးရမယ်
const TG_BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN") || ""; 
const TG_CHAT_ID = Deno.env.get("TG_CHAT_ID") || ""; // ဥပမာ -100xxxx သို့ @mychannel

const BUCKET_NAME = "lugyiapp"; 

serve(async (req) => {
  const url = new URL(req.url);

  // --- 1. CORS Proxy ---
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

  // --- 2. Upload & Post API ---
  if (req.method === "POST" && url.pathname === "/upload") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const caption = formData.get("caption") as string; // Telegram စာသား
      
      if (!file) return new Response("No file", { status: 400 });

      // Upload to Supabase
      const fileExt = file.name.split('.').pop() || 'jpg';
      const safeName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      
      const { error: upError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(safeName, file, { contentType: file.type, upsert: false });

      if (upError) throw upError;

      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(safeName);

      // 🔥 Post to Telegram Logic 🔥
      let tgResult = "Skipped";
      if (TG_BOT_TOKEN && TG_CHAT_ID && caption) {
        // Supabase Link ကိုယူပီး Telegram ကို လှမ်းပို့တာ (ပုံပြန်တင်စရာမလိုတော့ဘူး)
        const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`;
        const tgResp = await fetch(tgUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TG_CHAT_ID,
            photo: publicUrl,
            caption: caption,
            parse_mode: "HTML" // Bold, Italic သုံးလို့ရအောင်
          })
        });
        const tgData = await tgResp.json();
        tgResult = tgData.ok ? "Sent ✅" : "Failed ❌";
      }

      return new Response(JSON.stringify({ url: publicUrl, telegram: tgResult }), {
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
      <title>Poster + Telegram</title>
      <style>
        :root { --primary: #0088cc; --bg: #f0f2f5; } /* Telegram Color Theme */
        body { font-family: sans-serif; background: var(--bg); display: flex; justify-content: center; padding: 20px; }
        .card { background: white; width: 100%; max-width: 450px; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h2 { text-align: center; color: var(--primary); margin-top: 0; }
        
        .input-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 14px; color: #555; }
        
        textarea { width: 95%; padding: 10px; border: 1px solid #ccc; border-radius: 8px; height: 80px; resize: none; font-family: inherit; }
        
        .upload-box { border: 2px dashed #ccc; padding: 20px; text-align: center; border-radius: 8px; cursor: pointer; background: #fafafa; }
        .upload-box:hover { border-color: var(--primary); background: #eef6fa; }

        #preview { max-width: 100%; height: auto; border-radius: 8px; margin-top: 10px; display: none; }
        
        .btn { background: var(--primary); color: white; border: none; padding: 12px; width: 100%; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 10px; display: none;}
        .btn:disabled { opacity: 0.6; }

        .result { margin-top: 15px; padding: 10px; background: #eef; border-radius: 8px; display: none; border: 1px solid #ccd; }
        .copy-btn { float: right; background: #333; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer;}
      </style>
    </head>
    <body>
      <div class="card">
        <h2>✈️ Poster & Telegram</h2>
        
        <div class="input-group">
            <div class="upload-box" onclick="document.getElementById('fileInput').click()">
                📷 Tap to select Poster
            </div>
            <input type="file" id="fileInput" accept="image/*" style="display:none">
            <img id="preview">
            <div id="sizeInfo" style="font-size:12px; color:#888; margin-top:5px; text-align:center;"></div>
        </div>

        <div class="input-group">
            <label>Telegram Caption (Optional)</label>
            <textarea id="caption" placeholder="Enter movie title, quality, etc..."></textarea>
        </div>

        <button class="btn" id="uploadBtn">Upload & Post</button>
        <div id="status" style="text-align:center; margin-top:10px; font-size:13px; color:#666;"></div>

        <div class="result" id="resultBox">
            <button class="copy-btn" onclick="copyLink()">Copy</button>
            <strong>Image Link:</strong><br>
            <span id="finalLink" style="font-size:12px; color:#006699; word-break:break-all;"></span>
            <div id="tgStatus" style="margin-top:5px; font-size:12px; font-weight:bold;"></div>
        </div>
      </div>

      <script>
        let currentFile = null;
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        const status = document.getElementById('status');

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if(!file) return;

            // Preview
            const preview = document.getElementById('preview');
            preview.src = URL.createObjectURL(file);
            preview.style.display = 'block';

            // Resize Logic (70KB Limit)
            status.innerText = "Checking size...";
            if (file.size > 71680) {
                currentFile = await resizeImage(file, 800, 0.7);
                document.getElementById('sizeInfo').innerText = \`Resized to: \${(currentFile.size/1024).toFixed(1)} KB\`;
            } else {
                currentFile = file;
                document.getElementById('sizeInfo').innerText = \`Original: \${(file.size/1024).toFixed(1)} KB\`;
            }
            uploadBtn.style.display = 'block';
            status.innerText = "";
        });

        uploadBtn.addEventListener('click', async () => {
            if(!currentFile) return;
            
            uploadBtn.disabled = true;
            uploadBtn.innerText = "Processing...";
            status.innerText = "Uploading to Cloud & Telegram...";

            const formData = new FormData();
            formData.append('file', currentFile);
            formData.append('caption', document.getElementById('caption').value);

            try {
                const res = await fetch('/upload', { method: 'POST', body: formData });
                const data = await res.json();
                
                if(data.url) {
                    document.getElementById('resultBox').style.display = 'block';
                    document.getElementById('finalLink').innerText = data.url;
                    document.getElementById('tgStatus').innerHTML = "Telegram: " + data.telegram;
                    uploadBtn.style.display = 'none';
                    status.innerText = "✅ Done!";
                } else {
                    alert("Error: " + data.error);
                }
            } catch(e) {
                alert("Failed");
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.innerText = "Upload & Post";
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
              canvas.toBlob(blob => resolve(new File([blob], file.name, { type: file.type })), file.type, quality);
            };
          });
        }
        
        function copyLink() {
            navigator.clipboard.writeText(document.getElementById('finalLink').innerText);
            alert("Copied!");
        }
      </script>
    </body>
    </html>
  `, { headers: { "content-type": "text/html; charset=utf-8" } });
});
