import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Enviar email via Gmail SMTP ──
async function enviarEmailConfirmacion(pedido: any, paymentId: string) {
  const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");

  // Armar productos
  const productosHTML = Array.isArray(pedido.productos)
    ? pedido.productos.map((p: any) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#374151">
          ${p.producto_nombre} — Talle ${p.talle}${p.cantidad > 1 ? ` × ${p.cantidad}` : ""}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;font-weight:600">
          $${(Number(p.precio) * (p.cantidad || 1)).toLocaleString("es-AR")}
        </td>
      </tr>
    `).join("")
    : "";

  const totalStr = `$${Number(pedido.precio_total).toLocaleString("es-AR")}`;
  const pagadoStr = `$${Number(pedido.monto_transferido).toLocaleString("es-AR")}`;
  const saldo = Number(pedido.precio_total) - Number(pedido.monto_transferido);
  const saldoStr = saldo > 0 ? `$${saldo.toLocaleString("es-AR")}` : null;

  const emailBody = `...TODO TU HTML EXACTO (no lo toques)...`;

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: pedido.email_cliente }],
          subject: `✅ Pedido confirmado #${paymentId} — Andes Talleres`
        }
      ],
      from: {
        email: "subcomision.atsc@gmail.com", // 🔴 IMPORTANTE: email verificado en SendGrid
        name: "Andes Talleres"
      },
      content: [
        {
          type: "text/html",
          value: emailBody
        }
      ]
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("SendGrid error:", errorText);
    throw new Error("Error enviando email");
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

    // ✅ Enviar email de confirmación via Gmail SMTP
    if (pedidoPayload.email_cliente) {
      try {
        await enviarEmailConfirmacion(pedidoPayload, paymentId);
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