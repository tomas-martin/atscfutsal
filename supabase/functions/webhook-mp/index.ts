import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

// ── Enviar email via Gmail SMTP ──
async function enviarEmailConfirmacion(pedido: any, paymentId: string) {
  const GMAIL_USER = Deno.env.get("GMAIL_USER")!;
  const GMAIL_PASS = Deno.env.get("GMAIL_PASS")!;

  // Armar lista de productos para el email
  const productosHTML = Array.isArray(pedido.productos)
    ? pedido.productos
        .map(
          (p: any) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#374151">
            ${p.producto_nombre} — Talle ${p.talle}${p.cantidad > 1 ? ` × ${p.cantidad}` : ""}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;font-weight:600">
            $${(Number(p.precio) * (p.cantidad || 1)).toLocaleString("es-AR")}
          </td>
        </tr>`
        )
        .join("")
    : "";

  const totalStr = `$${Number(pedido.precio_total).toLocaleString("es-AR")}`;
  const pagadoStr = `$${Number(pedido.monto_transferido).toLocaleString("es-AR")}`;
  const saldo = Number(pedido.precio_total) - Number(pedido.monto_transferido);
  const saldoStr = saldo > 0 ? `$${saldo.toLocaleString("es-AR")}` : null;

  const emailBody = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    
    <!-- Header -->
    <div style="background:#09111f;padding:28px 32px;text-align:center;">
      <img src="https://qgjocvjmspntldkaghtb.supabase.co/storage/v1/object/public/productos/Talleres%20Futsal.png"
           alt="Andes Talleres" width="56" height="56"
           style="display:block;margin:0 auto 12px;" />
      <div style="color:#eef2ff;font-size:22px;font-weight:700;letter-spacing:2px;">ANDES TALLERES</div>
      <div style="color:#c0192a;font-size:11px;letter-spacing:4px;margin-top:3px;">FUTSAL · INDUMENTARIA</div>
    </div>

    <!-- Cuerpo -->
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:20px;">
        ✅ ¡Pedido confirmado, ${pedido.nombre_cliente?.split(" ")[0] || "campeón"}!
      </h2>
      <p style="color:#6b7280;margin:0 0 24px;font-size:15px;line-height:1.6;">
        Recibimos tu pago correctamente. Tu pedido <strong style="color:#111827">#${paymentId}</strong> quedó registrado y listo para coordinar la entrega.
      </p>

      <!-- Productos -->
      <div style="background:#f9fafb;border-radius:6px;padding:20px;margin-bottom:20px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:12px;">
          Detalle del pedido
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${productosHTML}
        </table>
      </div>

      <!-- Montos -->
      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#6b7280;font-size:14px;">Total del pedido</span>
          <span style="color:#111827;font-weight:600;font-size:14px;">${totalStr}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:${saldoStr ? "8px" : "0"};">
          <span style="color:#6b7280;font-size:14px;">Pagado ahora</span>
          <span style="color:#059669;font-weight:700;font-size:14px;">${pagadoStr}</span>
        </div>
        ${
          saldoStr
            ? `
        <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Saldo a pagar al retirar</span>
          <span style="color:#d97706;font-weight:700;font-size:14px;">${saldoStr}</span>
        </div>`
            : ""
        }
      </div>

      <!-- Aviso retiro -->
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:16px;margin-bottom:24px;">
        <div style="font-size:13px;color:#1e40af;line-height:1.6;">
          📍 <strong>Retiro en:</strong> Belgrano 1547, Godoy Cruz, Mendoza<br/>
          📱 <strong>Te vamos a contactar por WhatsApp</strong> para coordinar la entrega.
        </div>
      </div>

      <p style="color:#9ca3af;font-size:13px;text-align:center;margin:0;">
        ¿Dudas? Escribinos por Instagram <strong>@atscfutsal</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        © 2026 Andes Talleres Sport Club · Mendoza, Argentina
      </p>
    </div>
  </div>
</body>
</html>`;

  const client = new SmtpClient();

  await client.connectTLS({
    hostname: "smtp.gmail.com",
    port: 465,
    username: GMAIL_USER,
    password: GMAIL_PASS,
  });

  await client.send({
    from: `Andes Talleres Futsal <${GMAIL_USER}>`,
    to: pedido.email_cliente,
    subject: `✅ Pedido confirmado #${paymentId} — Andes Talleres Futsal`,
    content: emailBody,
    html: emailBody,
  });

  await client.close();
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