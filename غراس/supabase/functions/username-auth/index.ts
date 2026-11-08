import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeUsername = (value: unknown) =>
  String(value ?? "").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

function validUsername(value: string) {
  return value.length >= 3 && value.length <= 40 &&
    /^[\p{L}\p{N}._ -]+$/u.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const body = await req.json();
    const action = String(body?.action || "");

    // تسجيل الدخول باسم المستخدم: لا نعيد البريد الداخلي إلى المتصفح مطلقاً.
    if (action === "login") {
      const username = normalizeUsername(body.username);
      const password = String(body.password || "");
      if (!username || !password) return json({ error: "اسم المستخدم وكلمة المرور مطلوبان." }, 400);

      const { data: profile, error: profileError } = await admin
        .from("profiles").select("user_id")
        .ilike("username", username).maybeSingle();
      if (profileError || !profile) return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);

      const { data: authData, error: authError } = await admin.auth.admin.getUserById(profile.user_id);
      const email = authData?.user?.email;
      if (authError || !email) return json({ error: "تعذر التحقق من بيانات الحساب." }, 401);

      const publicClient = createClient(url, anonKey, { auth: { persistSession: false } });
      const { data, error } = await publicClient.auth.signInWithPassword({ email, password });
      if (error || !data.session) return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
      return json({ session: data.session, user: data.user });
    }

    // جميع العمليات التالية تتطلب جلسة مستخدم صالحة وصلاحية مدير.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "يلزم تسجيل الدخول." }, 401);
    const { data: verified, error: verifyError } = await admin.auth.getUser(token);
    if (verifyError || !verified.user) return json({ error: "جلسة الدخول غير صالحة." }, 401);

    const callerId = verified.user.id;
    const { data: callerProfile, error: callerError } = await admin
      .from("profiles").select("role").eq("user_id", callerId).single();
    if (callerError || callerProfile?.role !== "manager") {
      return json({ error: "هذه العملية متاحة للمدير فقط." }, 403);
    }

    if (action === "claim_manager_username") {
      const username = normalizeUsername(body.username);
      if (!validUsername(username)) return json({ error: "اسم المستخدم يجب أن يكون 3 إلى 40 حرفاً." }, 400);
      const { data: current } = await admin.from("profiles")
        .select("username").eq("user_id", callerId).single();
      if (current?.username && normalizeUsername(current.username) !== username) {
        return json({ error: "تم ربط اسم مستخدم لهذا الحساب مسبقاً. تواصل مع الدعم لتغييره." }, 409);
      }
      const { error } = await admin.from("profiles")
        .update({ username }).eq("user_id", callerId);
      if (error) {
        if (error.code === "23505") return json({ error: "اسم المستخدم مستخدم بالفعل." }, 409);
        throw error;
      }
      return json({ success: true, username });
    }

    if (action === "create_teacher") {
      const full_name = String(body.full_name || "").trim();
      const username = normalizeUsername(body.username);
      const password = String(body.password || "");
      const phone = String(body.phone || "").trim();
      if (full_name.length < 3) return json({ error: "اكتب اسم المعلمة كاملاً." }, 400);
      if (!validUsername(username)) return json({ error: "اسم المستخدم يجب أن يكون 3 إلى 40 حرفاً." }, 400);
      if (password.length < 10) return json({ error: "كلمة المرور يجب ألا تقل عن 10 أحرف." }, 400);

      const { data: duplicate } = await admin.from("profiles")
        .select("user_id").ilike("username", username).maybeSingle();
      if (duplicate) return json({ error: "اسم المستخدم مستخدم بالفعل، اختَر اسماً آخر." }, 409);

      // بريد داخلي اصطناعي لا يظهر للمعلمة؛ الدخول يتم بالاسم عبر هذه الوظيفة.
      const encoded = btoa(unescape(encodeURIComponent(username)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const internalEmail = `user-${encoded}@accounts.gheras.invalid`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: internalEmail, password, email_confirm: true,
        user_metadata: { full_name, phone, login_type: "username" },
      });
      if (createError || !created.user) throw createError || new Error("تعذر إنشاء الحساب.");

      const { error: profileError } = await admin.from("profiles").upsert({
        user_id: created.user.id, full_name, role: "teacher", username,
      }, { onConflict: "user_id" });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        if (profileError.code === "23505") return json({ error: "اسم المستخدم مستخدم بالفعل." }, 409);
        throw profileError;
      }
      return json({ success: true, user_id: created.user.id, full_name, username });
    }

    return json({ error: "العملية غير معروفة." }, 400);
  } catch (error) {
    console.error("username-auth:", error);
    return json({ error: "حدث خطأ أثناء تنفيذ العملية. راجع سجلات الوظيفة." }, 500);
  }
});
