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
    const SUPABASE_URL = 'https://qgjocvjmspntldkaghtb.supabase.co';

    // Empaquetamos todos los datos del pedido en external_reference
    // El webhook los va a usar para crear el pedido SOLO si el pago fue exitoso
    const datosParaWebhook = JSON.stringify({
      producto_id,
      producto_nombre,
      talle,
      precio_total,
      precio_sena,
      nombre_cliente,
      email_cliente,
      telefono_cliente,
    });

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
      external_reference: datosParaWebhook,
      back_urls: {
        success: `https://atscfutsal.vercel.app/pago-exitoso.html`,
        failure: `https://atscfutsal.vercel.app/pago-fallido.html`,
        pending: `https://atscfutsal.vercel.app/pago-pendiente.html`,
      },
      auto_return: 'approved',
      notification_url: `${SUPABASE_URL}/functions/v1/webhook-mp`,
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
    console.log("MP RESPONSE:", mpData);

    if (!mpData.init_point && !mpData.sandbox_init_point) {
      console.error("ERROR EN MERCADO PAGO:", mpData);
      return new Response(JSON.stringify({
        error: "Error creando preferencia en Mercado Pago",
        detalle: mpData
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // No se crea nada en Supabase acá.
    // El pedido se registra únicamente cuando MP confirma el pago.
    return new Response(JSON.stringify({
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("ERROR GENERAL:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});