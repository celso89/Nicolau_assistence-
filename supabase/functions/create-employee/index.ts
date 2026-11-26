import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const callerClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: caller }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !caller) return new Response(JSON.stringify({ error: 'Sessão inválida.' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
    const admin = createClient(url, serviceKey)
    const { data: profile } = await admin.from('profiles').select('role').eq('id', caller.id).single()
    if (profile?.role !== 'admin') return new Response(JSON.stringify({ error: 'Apenas o administrador pode criar funcionários.' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })
    const body = await req.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const full_name = String(body.full_name || '').trim()
    if (!email || password.length < 8 || !full_name) return new Response(JSON.stringify({ error: 'Informe nome, email e palavra-passe com pelo menos 8 caracteres.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })
    if (error) throw error
    await admin.from('profiles').upsert({ id: data.user.id, email, full_name, role: 'employee' })
    return new Response(JSON.stringify({ id: data.user.id, email, role: 'employee' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) { return new Response(JSON.stringify({ error: e.message || 'Erro interno.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }) }
})

