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

    // Soporta tanto un solo producto (legacy) como múltiples (carrito)
    // body.productos = [ { producto_id, producto_nombre, talle, precio, cantidad, categoria, imagen_url } ]
    // body.tipo_pago = 'sena' | 'total'
    const {
      productos,
      precio_total,
      tipo_pago = 'sena',
      nombre_cliente,
      email_cliente,
      telefono_cliente,
    } = body;

    const precio_sena = Math.ceil(precio_total * 0.5);
    const monto_a_cobrar = tipo_pago === 'total' ? precio_total : precio_sena;

    const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    const SUPABASE_URL = 'https://qgjocvjmspntldkaghtb.supabase.co';

    // Construir items de MP — un item por línea de producto (agrupado por producto+talle)
    const items = productos.map((p: any) => {
      const cant = p.cantidad || 1;
      const precioUnit = tipo_pago === 'total'
        ? (p.precio || 0)
        : Math.ceil((p.precio || 0) * 0.5);
      return {
        id: String(p.producto_id),
        title: `${p.producto_nombre} — Talle ${p.talle}`,
        description: tipo_pago === 'sena'
          ? `Seña 50% · Precio unit. total: $${(p.precio || 0).toLocaleString('es-AR')}`
          : `Pago completo`,
        quantity: cant,
        currency_id: 'ARS',
        unit_price: precioUnit,
      };
    });

    // Guardamos todos los datos del pedido en external_reference para el webhook
    const datosParaWebhook = JSON.stringify({
      productos,           // array completo con cantidades
      precio_total,
      precio_sena,
      monto_transferido: monto_a_cobrar,
      tipo_pago,
      nombre_cliente,
      email_cliente,
      telefono_cliente,
    });

    const preferencia = {
      items,
      payer: {
        name: nombre_cliente,
        email: email_cliente,
        phone: { number: String(telefono_cliente || '') },
      },
      external_reference: datosParaWebhook,
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
        installments: 1, // sin cuotas — es una transferencia/seña
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