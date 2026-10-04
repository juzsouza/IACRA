// Supabase Edge Function: admin-toggle-user-access
// Executa o bloqueio e liberação oficial de usuários via Supabase Auth Admin API (ban_duration)
// NUNCA expõe a SUPABASE_SERVICE_ROLE_KEY no frontend.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // 1. Tratar preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Método não permitido. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 2. Extrair variáveis de ambiente do Supabase (injetadas nativamente no runtime de Edge Functions)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    // Resolução robusta da chave administrativa:
    // Suporta tanto o formato legado SUPABASE_SERVICE_ROLE_KEY quanto o mecanismo moderno SUPABASE_SECRET_KEYS (JSON ou lista de chaves)
    let supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || null;

    if (!supabaseServiceRoleKey) {
      const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS")?.trim();
      if (secretKeysRaw) {
        try {
          const parsed = JSON.parse(secretKeysRaw);
          if (typeof parsed === "object" && parsed !== null) {
            // Pode vir como { service_role: "...", ... } ou { SERVICE_ROLE_KEY: "..." } ou array
            supabaseServiceRoleKey =
              parsed.service_role ||
              parsed.serviceRole ||
              parsed.SERVICE_ROLE ||
              parsed.SERVICE_ROLE_KEY ||
              parsed.supabase_service_role_key ||
              (Array.isArray(parsed) ? parsed.find((k: any) => typeof k === "string" && k.startsWith("eyJ")) : null) ||
              null;
          } else if (typeof parsed === "string") {
            supabaseServiceRoleKey = parsed;
          }
        } catch {
          // Se não for JSON, pode ser a própria chave diretamente em formato string
          if (secretKeysRaw.startsWith("eyJ") || secretKeysRaw.length > 20) {
            supabaseServiceRoleKey = secretKeysRaw;
          }
        }
      }
    }

    if (!supabaseUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Configuração ausente: SUPABASE_URL não encontrada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Configuração de segurança ausente: SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEYS não configurada na Edge Function."
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validar token JWT do chamador
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Acesso não autorizado: token JWT ausente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // Cliente com credenciais do chamador para validar identidade e permissões
    const callerClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceRoleKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: callerUser }, error: callerUserErr } = await callerClient.auth.getUser();
    if (callerUserErr || !callerUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Sessão inválida ou expirada." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Validar se o perfil do chamador possui role = 'super_admin'
    // Usa o cliente admin para consulta autoritativa do perfil
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile, error: callerProfErr } = await adminClient
      .from("profiles")
      .select("id, email, role, access_status")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (callerProfErr || !callerProfile) {
      return new Response(
        JSON.stringify({ success: false, error: "Perfil do chamador não localizado no sistema." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (callerProfile.role !== "super_admin") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Permissão negada. Apenas Super Administradores podem bloquear ou liberar acesso de usuários."
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Parsear e validar payload
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Corpo da requisição deve ser um JSON válido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { target_user_id, target_access_status } = body || {};

    if (!target_user_id || typeof target_user_id !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "target_user_id é obrigatório e deve ser uma string." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (target_access_status !== "active" && target_access_status !== "blocked") {
      return new Response(
        JSON.stringify({ success: false, error: "target_access_status inválido. Valores aceitos: 'active' ou 'blocked'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Impedir auto-bloqueio do Super Admin
    if (callerUser.id === target_user_id && target_access_status === "blocked") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Operação não permitida: você não pode bloquear a sua própria conta de Super Administrador."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Localizar o usuário alvo no Auth do Supabase para conferência
    const { data: targetAuthUser, error: getAuthErr } = await adminClient.auth.admin.getUserById(target_user_id);
    if (getAuthErr || !targetAuthUser?.user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Usuário não encontrado no Supabase Auth: ${getAuthErr?.message || "ID inexistente"}`
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Executar o Bloqueio / Desbloqueio via Supabase Auth Admin API (Mecanismo Oficial)
    // - Para bloquear: ban_duration = '876000h' (100 anos)
    // - Para liberar: ban_duration = 'none' (remove banimento)
    const isBlocking = target_access_status === "blocked";
    const banDuration = isBlocking ? "876000h" : "none";

    const { data: updatedAuthUser, error: updateAuthErr } = await adminClient.auth.admin.updateUserById(
      target_user_id,
      { ban_duration: banDuration }
    );

    if (updateAuthErr) {
      console.error("[EDGE FUNCTION] Falha ao atualizar Supabase Auth via Admin API:", updateAuthErr);
      // REGRA DE SEGURANÇA: Se o Auth falhar, NÃO atualizar profiles.access_status!
      return new Response(
        JSON.stringify({
          success: false,
          error: `Falha ao sincronizar o estado no Supabase Auth: ${updateAuthErr.message}`
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Confirmação física do Auth Admin API
    const authSuccessConfirmed = !!updatedAuthUser?.user;
    if (!authSuccessConfirmed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Não foi possível confirmar a atualização do usuário no Supabase Auth Admin API."
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. SOMENTE APÓS O SUCESSO CONFIRMADO NO AUTH: Atualizar profiles.access_status
    const { error: profileUpdateErr } = await adminClient
      .from("profiles")
      .update({ access_status: target_access_status })
      .eq("id", target_user_id);

    if (profileUpdateErr) {
      console.error("[EDGE FUNCTION] Falha ao atualizar public.profiles após Auth ter sido alterado:", profileUpdateErr);
      // Tentar reverter o Auth para manter consistência absoluta
      const rollbackBanDuration = isBlocking ? "none" : "876000h";
      await adminClient.auth.admin.updateUserById(target_user_id, { ban_duration: rollbackBanDuration });

      return new Response(
        JSON.stringify({
          success: false,
          error: `Erro ao atualizar perfil do usuário: ${profileUpdateErr.message}. Ação revertida no Supabase Auth por consistência.`
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[EDGE FUNCTION] Sucesso: Usuário ${target_user_id} alterado para ${target_access_status} via Auth Admin API.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: isBlocking
          ? "Usuário bloqueado com sucesso no Supabase Auth e no perfil."
          : "Acesso do usuário liberado com sucesso no Supabase Auth e no perfil.",
        access_status: target_access_status,
        banned: isBlocking,
        user_id: target_user_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[EDGE FUNCTION] Erro inesperado:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Erro interno na Edge Function." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
