import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY');
    const SUPABASE_URL = 'https://qgjocvjmspntldkaghtb.supabase.co';

    const body = await req.json();

    // MP manda distintos tipos de notificaciones, solo nos interesan pagos
    if (body.type !== 'payment') {
      return new Response('ok', { status: 200 });
    }

    const paymentId = body.data?.id;
    if (!paymentId) return new Response('ok', { status: 200 });

    // Obtener detalles del pago desde MP
    const pagoRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const pago = await pagoRes.json();

    const pedidoId = pago.external_reference;
    const status = pago.status; // approved, pending, rejected

    // Actualizar estado del pedido
    await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mp_payment_id: String(paymentId),
        mp_status: status,
        estado: status === 'approved' ? 'sena_pagada'
               : status === 'pending'  ? 'pendiente'
               : 'rechazado',
      }),
    });

    // Si el pago fue aprobado, bajar el stock del talle
    if (status === 'approved') {
      // Obtener el pedido
      const pedidoRes = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&select=*`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      });
      const [pedido] = await pedidoRes.json();

      // Obtener el producto
      const prodRes = await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${pedido.producto_id}&select=*`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      });
      const [producto] = await prodRes.json();

      // Bajar stock del talle correspondiente en 1
      const nuevasTallas = (producto.tallas || []).map((t: any) => ({
        ...t,
        stock: t.talla === pedido.talle ? Math.max(0, t.stock - 1) : t.stock,
      }));
      const nuevoTotal = nuevasTallas.reduce((sum: number, t: any) => sum + t.stock, 0);

      await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${pedido.producto_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tallas: nuevasTallas, stock_total: nuevoTotal }),
      });
    }

    return new Response('ok', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('error', { status: 500 });
  }
});