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
    const body = await req.json();

    const {
      productos,
      precio_total,
      tipo_pago = 'sena',
      nombre_cliente,
      email_cliente,
      telefono_cliente,
      categoria,
    } = body;

    const precioTotalNum = Number(precio_total) || 0;
    const precio_sena = Math.ceil(precioTotalNum * 0.5);
    const monto_a_cobrar = tipo_pago === 'total' ? precioTotalNum : precio_sena;

    const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY');
    const SUPABASE_URL = 'https://qgjocvjmspntldkaghtb.supabase.co';

    // 🟢 Crear ID único del pedido
    const external_reference = crypto.randomUUID();

    // 🟢 Guardar pedido en Supabase (ANTES de ir a Mercado Pago)
    await fetch(`${SUPABASE_URL}/rest/v1/pedidos_temp`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: external_reference,
        data: {
          productos,
          precio_total: precioTotalNum,
          precio_sena,
          monto_transferido: monto_a_cobrar,
          tipo_pago,
          nombre_cliente,
          email_cliente,
          telefono_cliente,
          categoria,
        }
      }),
    });

    // 🟢 Construir items correctamente
    if (!productos || productos.length === 0) {
  return new Response(JSON.stringify({
    error: "Carrito vacío"
  }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const items = productos.map((p: any) => {
  const cant = Number(p.cantidad) || 1;
  const precioBase = Number(p.precio);

  if (!precioBase || precioBase <= 0) {
    throw new Error("Precio inválido en producto");
  }

return {
  id: String(p.producto_id || crypto.randomUUID()),
  title: `${p.producto_nombre || 'Producto'}${p.talle ? ` — Talle ${p.talle}` : ''}`,
  description: tipo_pago === 'sena'
    ? 'Seña del 50% del precio total'
    : 'Pago completo del producto',
  quantity: cant,
  currency_id: 'ARS',
  unit_price: tipo_pago === 'total'
    ? precioBase
    : Math.ceil(precioBase * 0.5),
};
});

    const preferencia = {
      items,
      payer: {
        name: nombre_cliente,
        email: email_cliente,
        phone: { number: String(telefono_cliente || '') },
      },
      external_reference, // 👈 SOLO ID (clave para que funcione)
      back_urls: {
        success: `https://atscfutsal.vercel.app/pago-exitoso.html`,
        failure: `https://atscfutsal.vercel.app/pago-fallido.html`,
        pending: `https://atscfutsal.vercel.app/pago-exitoso.html`,
      },
      auto_return: 'approved',
      notification_url: `${SUPABASE_URL}/functions/v1/webhook-mp`,
      statement_descriptor: 'ANDES TALLERES',
      payment_methods: {
        excluded_payment_types: [],
        installments: 1,
      },
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
    console.log("MP RESPONSE:", JSON.stringify(mpData));

    if (!mpData.init_point && !mpData.sandbox_init_point) {
      console.error("ERROR EN MERCADO PAGO:", mpData);
      return new Response(JSON.stringify({
        error: "Error creando preferencia en Mercado Pago",
        detalle: mpData,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("ERROR GENERAL:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});