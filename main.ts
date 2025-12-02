import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = "lugyiapp"; 

serve(async (req) => {
  const url = new URL(req.url);

  // --- API: Upload Section ---
  if (req.method === "POST" && url.pathname === "/upload") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      
      if (!file) return new Response("No file uploaded", { status: 400 });

      // 🔥 မြန်မာစာ ပြဿနာဖြေရှင်းခြင်း 🔥
      // မူရင်းနာမည်ကို မယူတော့ဘဲ၊ အချိန်နဲ့ Random နံပါတ်ကို ပေါင်းပြီး English နာမည်အသစ် ပေးလိုက်မယ်
      const fileExt = file.name.split('.').pop() || 'jpg';
      const safeName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      
      // Supabase သို့ Upload တင်ခြင်း
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(safeName, file, {
          contentType: file.type,
          upsert: false
        });

      if (error) throw error;

      // Public URL ထုတ်ယူခြင်း
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

  // --- UI: Frontend Design Section ---
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Poster Uploader Pro</title>
      <style>
        :root {
          --primary: #6366f1;
          --primary-dark: #4f46e5;
          --bg-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        body {
          margin: 0;
          padding: 20px;
          min-height: 100vh;
          font-family: 'Segoe UI', sans-serif;
          background: var(--bg-gradient);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #333;
        }
        .card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          width: 100%;
          max-width: 400px;
          padding: 30px;
          border-radius: 20px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          text-align: center;
        }
        h2 { margin-top: 0; color: #444; font-weight: 700; }
        
        /* Upload Area Design */
        .upload-area {
          border: 2px dashed #cbd5e1;
          border-radius: 12px;
          padding: 20px;
          margin: 20px 0;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
        }
        .upload-area:hover { border-color: var(--primary); background: #f8fafc; }
        .upload-icon { font-size: 40px; color: #94a3b8; display: block; margin-bottom: 10px; }
        
        /* Preview Image */
        #preview {
          max-width: 100%;
          max-height: 250px;
          border-radius: 10px;
          display: none;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          margin: 0 auto;
        }

        /* Buttons */
        .btn {
          background: var(--primary);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: transform 0.1s;
          display: none; /* Hidden initially */
        }
        .btn:active { transform: scale(0.98); }
        .btn:disabled { opacity: 0.7; cursor: not-allowed; }

        /* Link Result Box */
        .result-box {
          margin-top: 20px;
          background: #f1f5f9;
          padding: 15px;
          border-radius: 10px;
          display: none;
          text-align: left;
        }
        .link-text {
          font-size: 13px;
          color: #64748b;
          word-break: break-all;
          margin-bottom: 8px;
          font-family: monospace;
        }
        .copy-btn {
          background: #334155;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          width: auto;
          display: inline-block;
        }

        /* Input file hidden */
        input[type="file"] { display: none; }
        
        .loading-text { color: var(--primary); font-weight: 600; margin-top: 10px; display: none; }
      </style>
    </head>
    <body>

      <div class="card">
        <h2>🍌 Poster Upload</h2>
        <p style="color:#666; font-size:14px;">Upload your movie poster here</p>
        
        <div class="upload-area" id="dropArea" onclick="document.getElementById('fileInput').click()">
          <span class="upload-icon">📷</span>
          <span id="uploadText">Tap to choose image</span>
          <img id="preview" />
        </div>
        
        <input type="file" id="fileInput" accept="image/*">

        <p class="loading-text" id="loadingText">Processing...</p>
        
        <button class="btn" id="uploadBtn">Upload to Cloud 🚀</button>

        <div class="result-box" id="resultBox">
          <div class="link-text" id="linkResult">https://...</div>
          <button class="copy-btn" onclick="copyLink()">📋 Copy Link</button>
        </div>
      </div>

      <script>
        const fileInput = document.getElementById('fileInput');
        const preview = document.getElementById('preview');
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadText = document.getElementById('uploadText');
        const loadingText = document.getElementById('loadingText');
        const resultBox = document.getElementById('resultBox');
        const linkResult = document.getElementById('linkResult');
        const uploadIcon = document.querySelector('.upload-icon');
        
        let resizedFile = null;

        // 1. Image Select Logic
        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          // Show loading for resize
          loadingText.innerText = "Resizing image...";
          loadingText.style.display = "block";
          uploadText.style.display = "none";
          uploadIcon.style.display = "none";
          resultBox.style.display = "none";

          // Resize Logic (Client Side)
          resizedFile = await resizeImage(file, 1000, 0.7);
          
          // Show Preview
          preview.src = URL.createObjectURL(resizedFile);
          preview.style.display = "block";
          loadingText.style.display = "none";
          
          // Show Upload Button
          uploadBtn.style.display = "block";
        });

        // 2. Upload Logic
        uploadBtn.addEventListener('click', async () => {
          if (!resizedFile) return;

          loadingText.innerText = "Uploading to Supabase...";
          loadingText.style.display = "block";
          uploadBtn.disabled = true;
          uploadBtn.innerText = "Uploading...";

          const formData = new FormData();
          formData.append('file', resizedFile); // Send the resized file

          try {
            const res = await fetch('/upload', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.url) {
              loadingText.style.display = "none";
              uploadBtn.style.display = "none"; // Hide button after success
              
              // Show Result
              resultBox.style.display = "block";
              linkResult.innerText = data.url;
            } else {
              alert("Error: " + (data.error || "Unknown error"));
              uploadBtn.disabled = false;
              uploadBtn.innerText = "Upload to Cloud 🚀";
            }
          } catch (err) {
            alert("Upload Failed!");
            uploadBtn.disabled = false;
          }
        });

        // 3. Copy Function
        function copyLink() {
          const text = linkResult.innerText;
          navigator.clipboard.writeText(text).then(() => {
            const btn = document.querySelector('.copy-btn');
            btn.innerText = "✅ Copied!";
            setTimeout(() => btn.innerText = "📋 Copy Link", 2000);
          });
        }

        // 4. Resize Function (Standard)
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
                resolve(new File([blob], "image.jpg", { type: "image/jpeg" }));
              }, 'image/jpeg', quality);
            };
          });
        }
      </script>
    </body>
    </html>
  `, { headers: { "content-type": "text/html; charset=utf-8" } });
});
