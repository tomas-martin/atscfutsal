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

    // Obtener detalles del pago desde MP
    const pagoRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const pago = await pagoRes.json();
    console.log("PAGO MP:", JSON.stringify(pago));

    const status = pago.status;
    const mpPaymentId = String(paymentId);

    if (status !== 'approved' && status !== 'pending') {
      console.log(`Pago ignorado, status: ${status}`);
      return new Response('ok', { status: 200 });
    }

    // Recuperar datos del pedido desde external_reference
    let datos: any = {};
    try {
      datos = JSON.parse(pago.external_reference || '{}');
    } catch (e) {
      console.error("No se pudo parsear external_reference:", pago.external_reference);
      return new Response('error: external_reference inválido', { status: 400 });
    }

    const {
      productos,           // array [{ producto_id, producto_nombre, talle, precio, cantidad, ... }]
      precio_total,
      precio_sena,
      monto_transferido,
      tipo_pago,
      nombre_cliente,
      email_cliente,
      telefono_cliente,
    } = datos;

    // Expandir productos por cantidad para guardar en la BD
    const productosExpandidos: any[] = [];
    (productos || []).forEach((p: any) => {
      const cant = p.cantidad || 1;
      for (let i = 0; i < cant; i++) {
        productosExpandidos.push({
          producto_id: p.producto_id,
          producto_nombre: p.producto_nombre,
          categoria: p.categoria || '',
          talle: p.talle,
          precio: p.precio,
          imagen_url: p.imagen_url || null,
        });
      }
    });

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
        productos: productosExpandidos,
        precio_total,
        precio_sena,
        monto_transferido,
        tipo_pago: tipo_pago || 'sena',
        nombre_cliente,
        email_cliente,
        telefono_cliente,
        mp_payment_id: mpPaymentId,
        mp_status: status,
        estado: status === 'approved' ? 'confirmada' : 'pendiente',
      }),
    });

    const pedidoData = await pedidoRes.json();
    console.log("PEDIDO CREADO:", JSON.stringify(pedidoData));

    // Si el pago fue aprobado, descontar stock por cada producto (agrupado por producto+talle)
    if (status === 'approved') {
      // Agrupar descuentos: { "producto_id|talle": cantidad_total }
      const descuentos: Record<string, { producto_id: any; talle: string; cantidad: number }> = {};
      (productos || []).forEach((p: any) => {
        const key = `${p.producto_id}|${p.talle}`;
        if (!descuentos[key]) {
          descuentos[key] = { producto_id: p.producto_id, talle: p.talle, cantidad: 0 };
        }
        descuentos[key].cantidad += (p.cantidad || 1);
      });

      for (const d of Object.values(descuentos)) {
        await descontarStock(SUPABASE_URL, SERVICE_ROLE_KEY!, d.producto_id, d.talle, d.cantidad);
      }
    }

    return new Response('ok', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('error', { status: 500 });
  }
});

async function descontarStock(
  supabaseUrl: string,
  key: string,
  productoId: any,
  talle: string,
  cantidad: number
) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/productos?id=eq.${productoId}&select=id,tallas,stock_total`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
    });
    const [producto] = await res.json();
    if (!producto) return;

    const nuevasTallas = (producto.tallas || []).map((t: any) => ({
      ...t,
      stock: t.talla === talle ? Math.max(0, t.stock - cantidad) : t.stock,
    }));
    const nuevoTotal = nuevasTallas.reduce((s: number, t: any) => s + t.stock, 0);

    await fetch(`${supabaseUrl}/rest/v1/productos?id=eq.${productoId}`, {
      method: 'PATCH',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tallas: nuevasTallas, stock_total: nuevoTotal }),
    });

    console.log(`Stock descontado: producto ${productoId}, talle ${talle}, cantidad ${cantidad}`);
  } catch (e) {
    console.error('Error descontando stock:', e);
  }
}