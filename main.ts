// main.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deno Deploy ရဲ့ Environment Variables တွေထဲကနေ ယူသုံးမှာပါ
// Code ထဲမှာ Key တွေကို တိုက်ရိုက်မထည့်ရပါ (Security အရ)
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  // စမ်းသပ်ဖို့ - Supabase ထဲက ပုံတစ်ပုံရဲ့ URL ကို ယူကြည့်မယ် (ဥပမာ)
  // ဒါမှမဟုတ် ရိုးရိုး Hello World ပြမယ်
  
  const { data, error } = await supabase
    .from('products') // products ဆိုတဲ့ table ရှိတယ်လို့ သဘောထားမယ်
    .select('*')
    .limit(1);

  if (error) {
     return new Response(JSON.stringify({ error: error.message }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ 
    message: "Connected to Supabase!", 
    data: data 
  }), {
    headers: { "content-type": "application/json" },
  });
});
