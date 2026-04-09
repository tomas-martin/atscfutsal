import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import SibApiV3Sdk from "npm:sib-api-v3-sdk";

async function enviarEmailConfirmacion(pedido: any, pedidoId: number) {
  try {
    const client = SibApiV3Sdk.ApiClient.instance;
    const apiKey = client.authentications["api-key"];

    apiKey.apiKey = Deno.env.get("BREVO_API_KEY");

    const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

    const total = Number(pedido.precio_total) || 0;
    const pagado = Number(pedido.monto_transferido) || 0;
    const saldo = total - pagado;

    const html = `
  <div style="font-family: Arial, sans-serif; color:#333; max-width:600px; margin:auto;">

    <h1 style="color:#16a34a;">✅ ¡Pago confirmado!</h1>

    <p>Hola <strong>${pedido.nombre_cliente || "cliente"}</strong>,</p>

    <p>
      Recibimos tu pago correctamente 🙌  
      Tu pedido ya está confirmado y en proceso.
    </p>

    <hr style="margin:20px 0;" />

    <h2 style="font-size:18px;">🧾 Detalle del pedido</h2>

    <p><strong>Número de pedido:</strong> #${pedidoId}</p>
    <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>

    ${
  pedido.productos && pedido.productos.length > 0
    ? `
    <h3 style="font-size:16px;">🛍️ Productos</h3>
    <ul>
      ${pedido.productos
        .map((p) => `
          <li>${p.producto_nombre || p.nombre || 'Producto'}${p.talle ? ` (Talle: ${p.talle})` : ''}${p.cantidad ? ` x${p.cantidad}` : ''} — $${Number(p.precio || 0).toLocaleString('es-AR')}</li>
        `)
        .join('')}
    </ul>
    `
    : ''
}

    <hr style="margin:20px 0;" />

    <h2 style="font-size:18px;">💳 Información de pago</h2>

    <p><strong>Total:</strong> $${pedido.precio_total || 0}</p>
    <p><strong>Pagado:</strong> $${pedido.monto_recibido || pedido.precio_sena || 0}</p>
    <p>
      <strong>Saldo pendiente:</strong> 
      $${Math.max(
        (pedido.precio_total || 0) -
        (pedido.monto_recibido || pedido.precio_sena || 0),
        0
      )}
    </p>

    <p><strong>Estado:</strong> ${pedido.estado}</p>

    <hr style="margin:20px 0;" />

    <h2 style="font-size:18px;">📦 ¿Qué sigue?</h2>

    <p>
      En breve nos vamos a contactar con vos por WhatsApp o email para coordinar 
      la entrega o el envío de tu pedido.
    </p>

    <p>
      Si tenés alguna duda, podés responder directamente a este correo.
    </p>

    <br />

    <p style="font-size:14px; color:#666;">
      Gracias por confiar en nosotros 💛
    </p>

  </div>
`;

    await tranEmailApi.sendTransacEmail({
      sender: {
        email: "subcomision.atsc@gmail.com",
        name: "Andes Talleres",
      },
      to: [{ email: pedido.email_cliente }],
      subject: `Pedido #${pedidoId} confirmado`,
      htmlContent: html,
    });

    console.log("Email enviado a:", pedido.email_cliente);

  } catch (error) {
    console.error("Error enviando email:", error);
  }
}

serve(async (req) => {
  try {
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");
    const SUPABASE_URL = "https://qgjocvjmspntldkaghtb.supabase.co";

    const body = await req.json();
    console.log("WEBHOOK BODY:", JSON.stringify(body));

    // Ignorar merchant_order
    if (
      body.topic === "merchant_order" ||
      body.resource?.toString().includes("merchant_orders")
    ) {
      return new Response("ok", { status: 200 });
    }

    if (body.type !== "payment") {
      return new Response("ok", { status: 200 });
    }

    const paymentId = body.data?.id;
    if (!paymentId) return new Response("ok", { status: 200 });

    // Obtener pago de Mercado Pago
    const pagoRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      }
    );
    const pago = await pagoRes.json();
    console.log("PAGO MP status:", pago.status, "ref:", pago.external_reference);

    if (pago.status !== "approved" && pago.status !== "pending") {
      return new Response("ok", { status: 200 });
    }

    const pedidoTempId = pago.external_reference;
    if (!pedidoTempId) {
      console.error("Sin external_reference");
      return new Response("ok", { status: 200 });
    }

    // Buscar en pedidos_temp
    const tempRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pedidos_temp?id=eq.${pedidoTempId}`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    const tempRows = await tempRes.json();
    const row = tempRows[0];

    if (!row) {
      console.error("No encontrado en pedidos_temp:", pedidoTempId);
      return new Response("error", { status: 400 });
    }

    const d = row.data;

    // Insertar en pedidos
    const pedidoPayload = {
      nombre_cliente: d.nombre_cliente ?? null,
      email_cliente: d.email_cliente ?? null,
      telefono_cliente: d.telefono_cliente ?? null,
      categoria: d.categoria ?? null,
      productos: d.productos ?? [],
      precio_total: Number(d.precio_total) || 0,
      precio_sena: Number(d.precio_sena) || 0,
      monto_transferido: Number(d.monto_transferido) || 0,
      mp_payment_id: String(paymentId),
      mp_status: pago.status,
      estado: pago.status === "approved" ? "confirmada" : "pendiente",
    };

    console.log("Insertando pedido:", JSON.stringify(pedidoPayload));

    const pedidoRes = await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(pedidoPayload),
    });

    const pedidoData = await pedidoRes.json();
    console.log("PEDIDO GUARDADO:", JSON.stringify(pedidoData));

    if (!pedidoRes.ok) {
      console.error("Error insertando pedido:", JSON.stringify(pedidoData));
      return new Response("error", { status: 500 });
    }

    // ID del pedido recién insertado
    const pedidoId = Array.isArray(pedidoData) ? pedidoData[0]?.id : pedidoData?.id;
    
    if (pedidoId) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_temp?id=eq.${pedidoTempId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pedido_id: pedidoId }),
    }
  );
}

    // ✅ Enviar email de confirmación via Resend
    if (pedidoPayload.email_cliente && pedidoId) {
      try {
        await enviarEmailConfirmacion(pedidoPayload, pedidoId);
        console.log("Email enviado a:", pedidoPayload.email_cliente);
      } catch (emailError) {
        console.error("Error enviando email (no crítico):", emailError);
      }
    }

    // Borrar de temp
    await fetch(
      `${SUPABASE_URL}/rest/v1/pedidos_temp?id=eq.${pedidoTempId}`,
      {
        method: "DELETE",
        headers: {
          apikey: SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("error", { status: 500 });
  }
});