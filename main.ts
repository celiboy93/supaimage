import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Bucket နာမည် (မိတ်ဆွေ Link မှာပါတဲ့အတိုင်း "lugyiapp" လို့ ထားလိုက်ပါတယ်)
const BUCKET_NAME = "lugyiapp"; 

serve(async (req) => {
  const url = new URL(req.url);

  // ၁။ ပုံ Upload တင်တဲ့ အပိုင်း (API)
  if (req.method === "POST" && url.pathname === "/upload") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      
      if (!file) {
        return new Response("No file uploaded", { status: 400 });
      }

      // နာမည်မထပ်အောင် Timestamp ထည့်ပေးမယ်
      const fileName = `${Date.now()}_${file.name}`;
      
      // Supabase ကို လှမ်းသိမ်းမယ်
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false
        });

      if (error) throw error;

      // Public URL ပြန်ထုတ်ပေးမယ်
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

      return new Response(JSON.stringify({ url: publicUrl }), {
        headers: { "Content-Type": "application/json" },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // ၂။ Frontend အပိုင်း (UI Page)
  return new Response(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Movie Poster Uploader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: sans-serif; padding: 20px; text-align: center; }
          .container { max-width: 500px; margin: 0 auto; }
          #preview { max-width: 100%; margin-top: 10px; border-radius: 8px; display: none; }
          button { padding: 10px 20px; background: #3ecf8e; border: none; color: white; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 10px;}
          input { margin-bottom: 20px; }
          .result-box { margin-top: 20px; padding: 10px; background: #f0f0f0; word-break: break-all; display: none; border: 1px solid #ccc; border-radius: 5px;}
          .loading { color: blue; display: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🍌 Poster Uploader</h2>
          <p>ပုံရွေးလိုက်တာနဲ့ Auto ချုံ့ပီးမှ တင်ပေးပါမယ်</p>
          
          <input type="file" id="fileInput" accept="image/*">
          <br>
          <img id="preview" />
          <br>
          <button id="uploadBtn" style="display:none;">Upload to Supabase</button>
          
          <p class="loading" id="loading">ပုံတင်နေပါပြီ...</p>
          
          <div class="result-box" id="resultBox">
            <p><strong>Copy Link:</strong></p>
            <a id="linkResult" href="#" target="_blank"></a>
          </div>
        </div>

        <script>
          const fileInput = document.getElementById('fileInput');
          const uploadBtn = document.getElementById('uploadBtn');
          const preview = document.getElementById('preview');
          const loading = document.getElementById('loading');
          const resultBox = document.getElementById('resultBox');
          const linkResult = document.getElementById('linkResult');

          let resizedFile = null;

          fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Preview ပြမယ်
            preview.src = URL.createObjectURL(file);
            preview.style.display = 'block';
            uploadBtn.style.display = 'inline-block';
            
            // --- Auto Resize Logic (Data Size ချုံ့ခြင်း) ---
            loading.innerText = "ပုံကို ချုံ့နေပါသည်...";
            loading.style.display = "block";
            
            resizedFile = await resizeImage(file, 1000, 0.7); // Max Width 1000px, Quality 70%
            
            loading.style.display = "none";
            console.log("Original size:", file.size / 1024, "KB");
            console.log("Resized size:", resizedFile.size / 1024, "KB");
          });

          uploadBtn.addEventListener('click', async () => {
            if (!resizedFile) return;

            loading.innerText = "Supabase သို့ ပို့နေပါသည်...";
            loading.style.display = "block";
            resultBox.style.display = "none";
            uploadBtn.disabled = true;

            const formData = new FormData();
            formData.append('file', resizedFile);

            try {
              const res = await fetch('/upload', { method: 'POST', body: formData });
              const data = await res.json();

              if (data.url) {
                linkResult.href = data.url;
                linkResult.textContent = data.url;
                resultBox.style.display = 'block';
              } else {
                alert('Error: ' + data.error);
              }
            } catch (err) {
              alert('Upload failed');
            } finally {
              loading.style.display = "none";
              uploadBtn.disabled = false;
            }
          });

          // ပုံချုံ့ပေးတဲ့ Function (ဖုန်းထဲမှာတင် အလုပ်လုပ်သည်)
          function resizeImage(file, maxWidth, quality) {
            return new Promise((resolve) => {
              const img = document.createElement('img');
              img.src = URL.createObjectURL(file);
              img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // အချိုးအစား တွက်ချက်ခြင်း
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                  height *= maxWidth / width;
                  width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                // Blob (File) အဖြစ် ပြန်ထုတ်ခြင်း
                canvas.toBlob((blob) => {
                  // နဂိုနာမည်နဲ့ File Object ပြန်ဆောက်မယ်
                  const newFile = new File([blob], file.name, { type: 'image/jpeg' });
                  resolve(newFile);
                }, 'image/jpeg', quality); 
              };
            });
          }
        </script>
      </body>
    </html>
  `, { headers: { "content-type": "text/html; charset=utf-8" } });
});
