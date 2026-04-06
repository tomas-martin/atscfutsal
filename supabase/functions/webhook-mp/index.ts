import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY');
    const SUPABASE_URL = 'https://qgjocvjmspntldkaghtb.supabase.co';

    const body = await req.json();
    console.log("WEBHOOK BODY:", JSON.stringify(body));

    if (body.type !== 'payment') {
      return new Response('ok', { status: 200 });
    }

    const paymentId = body.data?.id;
    if (!paymentId) return new Response('ok', { status: 200 });

    // 🔎 Obtener pago de Mercado Pago
    const pagoRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
    });

    const pago = await pagoRes.json();
    console.log("PAGO MP:", JSON.stringify(pago));

    const status = pago.status;
    const mpPaymentId = String(paymentId);

    if (status !== 'approved' && status !== 'pending') {
      return new Response('ok', { status: 200 });
    }

    // 🟢 1. Obtener ID del pedido
    const pedidoId = pago.external_reference;

    // 🟢 2. Buscar en pedidos_temp
    const tempRes = await fetch(`${SUPABASE_URL}/rest/v1/pedidos_temp?id=eq.${pedidoId}`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    const [row] = await tempRes.json();
    if (!row) {
      console.error("Pedido no encontrado en temp");
      return new Response('error', { status: 400 });
    }

    const datos = row.data;

    const {
      productos,
      precio_total,
      precio_sena,
      monto_transferido,
      tipo_pago,
      nombre_cliente,
      email_cliente,
      telefono_cliente,
    } = datos;

    // 🟢 3. Guardar en tabla FINAL pedidos
    const pedidoRes = await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        productos,
        precio_total,
        precio_sena,
        monto_transferido,
        tipo_pago,
        nombre_cliente,
        email_cliente,
        telefono_cliente,
        mp_payment_id: mpPaymentId,
        mp_status: status,
        estado: status === 'approved' ? 'confirmada' : 'pendiente',
      }),
    });

    const pedidoData = await pedidoRes.json();
    console.log("PEDIDO GUARDADO:", JSON.stringify(pedidoData));

    // 🟢 (opcional) borrar de temp
    await fetch(`${SUPABASE_URL}/rest/v1/pedidos_temp?id=eq.${pedidoId}`, {
      method: 'DELETE',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    return new Response('ok', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('error', { status: 500 });
  }
});