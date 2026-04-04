import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY');
    const SUPABASE_URL = 'https://qgjocvjmspntldkaghtb.supabase.co';

    const body = await req.json();
    console.log("WEBHOOK BODY:", JSON.stringify(body));

    // MP manda distintos tipos, solo nos interesan pagos
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
    console.log("PAGO MP:", JSON.stringify(pago));

    const status = pago.status; // approved, pending, rejected, cancelled
    const mpPaymentId = String(paymentId);
    const mpStatus = pago.status;

    // Solo procesamos pagos aprobados o pendientes (no iniciados, no rechazados)
    if (status !== 'approved' && status !== 'pending') {
      console.log(`Pago ignorado, status: ${status}`);
      return new Response('ok', { status: 200 });
    }

    // Recuperar los datos del pedido que viajaron en external_reference
    let datos: any = {};
    try {
      datos = JSON.parse(pago.external_reference || '{}');
    } catch (e) {
      console.error("No se pudo parsear external_reference:", pago.external_reference);
      return new Response('error: external_reference inválido', { status: 400 });
    }

    const {
      producto_id, producto_nombre, talle,
      precio_total, precio_sena,
      nombre_cliente, email_cliente, telefono_cliente,
    } = datos;

    // Insertar pedido en Supabase
    const pedidoRes = await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        producto_id,
        producto_nombre,
        talle,
        precio_total,
        precio_sena,
        nombre_cliente,
        email_cliente,
        telefono_cliente,
        mp_payment_id: mpPaymentId,   // número de comprobante MP
        mp_status: mpStatus,
        estado: status === 'approved' ? 'sena_pagada' : 'pendiente',
      }),
    });

    const pedidoData = await pedidoRes.json();
    console.log("PEDIDO CREADO:", JSON.stringify(pedidoData));
    const pedido = pedidoData[0];

    // Si el pago fue aprobado, bajar el stock del talle correspondiente
    if (status === 'approved' && producto_id && talle) {
      const prodRes = await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${producto_id}&select=*`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      });
      const [producto] = await prodRes.json();

      if (producto) {
        const nuevasTallas = (producto.tallas || []).map((t: any) => ({
          ...t,
          stock: t.talla === talle ? Math.max(0, t.stock - 1) : t.stock,
        }));
        const nuevoTotal = nuevasTallas.reduce((sum: number, t: any) => sum + t.stock, 0);

        await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${producto_id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tallas: nuevasTallas, stock_total: nuevoTotal }),
        });

        console.log(`Stock actualizado: producto ${producto_id}, talle ${talle}`);
      }
    }

    return new Response('ok', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('error', { status: 500 });
  }
});