import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      producto_id, producto_nombre, talle, precio_total,
      nombre_cliente, email_cliente, telefono_cliente
    } = await req.json();

    const precio_sena = Math.ceil(precio_total * 0.5);
    const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY');
    const SUPABASE_URL = 'https://qgjocvjmspntldkaghtb.supabase.co';

    // 1. Insertar pedido en Supabase con estado "iniciado"
    const pedidoRes = await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        producto_id, producto_nombre, talle,
        precio_total, precio_sena,
        nombre_cliente, email_cliente, telefono_cliente,
        estado: 'iniciado',
      }),
    });
    const [pedido] = await pedidoRes.json();

    // 2. Crear preferencia en Mercado Pago
    const preferencia = {
      items: [{
        id: String(producto_id),
        title: `Seña — ${producto_nombre} (Talle ${talle})`,
        description: `50% de seña. Precio total: $${precio_total.toLocaleString('es-AR')}`,
        quantity: 1,
        currency_id: 'ARS',
        unit_price: precio_sena,
      }],
      payer: {
        name: nombre_cliente,
        email: email_cliente,
        phone: { number: telefono_cliente },
      },
      back_urls: {
        success: `https://atscfutsal.vercel.app/pago-exitoso.html?pedido=${pedido.id}`,
        failure: `https://atscfutsal.vercel.app/pago-fallido.html?pedido=${pedido.id}`,
        pending: `https://atscfutsal.vercel.app/pago-pendiente.html?pedido=${pedido.id}`,
      },
      auto_return: 'approved',
      notification_url: `${SUPABASE_URL}/functions/v1/webhook-mp`,
      external_reference: String(pedido.id),
      statement_descriptor: 'ANDES TALLERES',
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferencia),
    });
    const mpData = await mpRes.json();

    // 3. Actualizar pedido con preference_id de MP
    await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mp_status: mpData.id }),
    });

    return new Response(JSON.stringify({
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      pedido_id: pedido.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});