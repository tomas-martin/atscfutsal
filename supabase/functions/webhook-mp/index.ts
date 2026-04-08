import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Enviar email via Resend ──
async function enviarEmailConfirmacion(pedido: any, pedidoId: number) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY no configurada, saltando email");
    return;
  }

  const total = Number(pedido.precio_total) || 0;
  const pagado = Number(pedido.monto_transferido) || 0;
  const saldo = total - pagado;

  // Armar filas de productos
  const productosHTML = Array.isArray(pedido.productos)
    ? pedido.productos.map((p: any) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #1e2d47;color:#c8d3f0;font-family:sans-serif;font-size:15px">
            ${p.producto_nombre || "Producto"} — Talle ${p.talle || "?"}${(p.cantidad || 1) > 1 ? ` × ${p.cantidad}` : ""}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #1e2d47;text-align:right;color:#eef2ff;font-weight:700;font-family:sans-serif;font-size:15px">
            $${(Number(p.precio || 0) * (p.cantidad || 1)).toLocaleString("es-AR")}
          </td>
        </tr>
      `).join("")
    : `<tr><td colspan="2" style="color:#8a96b8;font-size:14px;padding:8px 0">Sin detalle de productos</td></tr>`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09111f;font-family:sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09111f;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0f1929;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden">

        <!-- Header -->
        <tr>
          <td style="background:#0f1929;border-bottom:3px solid #c0192a;padding:28px 32px;text-align:center">
            <img src="https://qgjocvjmspntldkaghtb.supabase.co/storage/v1/object/public/productos/Talleres%20Futsal.png"
                 alt="Andes Talleres" width="52" height="52"
                 style="display:block;margin:0 auto 14px;object-fit:contain" />
            <p style="margin:0;font-size:11px;letter-spacing:.25em;text-transform:uppercase;color:#c0192a;font-weight:700">Andes Talleres Futsal</p>
            <h1 style="margin:8px 0 0;font-size:26px;letter-spacing:.04em;color:#eef2ff;font-weight:900">
              ✅ PEDIDO CONFIRMADO
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px">

            <!-- Saludo -->
            <p style="margin:0 0 20px;color:#c8d3f0;font-size:16px;line-height:1.6">
              Hola <strong style="color:#eef2ff">${pedido.nombre_cliente || "cliente"}</strong>,<br>
              recibimos tu seña correctamente. Tu pedido está registrado y en proceso de verificación.
            </p>

            <!-- Datos del pedido -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#182238;border-radius:6px;padding:16px 20px;margin-bottom:20px">
              <tr>
                <td style="color:#4f5a76;font-size:11px;letter-spacing:.18em;text-transform:uppercase;padding-bottom:6px">N° de Pedido</td>
                <td style="text-align:right;color:#eef2ff;font-weight:700;font-size:16px">#${pedidoId}</td>
              </tr>
              <tr>
                <td style="color:#4f5a76;font-size:11px;letter-spacing:.18em;text-transform:uppercase;padding:6px 0">Categoría</td>
                <td style="text-align:right;color:#eef2ff;font-size:14px">${pedido.categoria || "—"}</td>
              </tr>
              <tr>
                <td style="color:#4f5a76;font-size:11px;letter-spacing:.18em;text-transform:uppercase;padding-top:6px">Estado</td>
                <td style="text-align:right"><span style="background:rgba(29,158,117,.15);border:1px solid rgba(29,158,117,.3);color:#1d9e75;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:3px 10px;border-radius:3px">✓ Confirmado</span></td>
              </tr>
            </table>

            <!-- Productos -->
            <p style="margin:0 0 10px;color:#4f5a76;font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:700">Detalle del pedido</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
              ${productosHTML}
            </table>

            <!-- Montos -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#182238;border-radius:6px;padding:16px 20px;margin-bottom:24px">
              <tr>
                <td style="color:#8a96b8;font-size:14px;padding:4px 0">Total del pedido</td>
                <td style="text-align:right;color:#eef2ff;font-size:14px">$${total.toLocaleString("es-AR")}</td>
              </tr>
              <tr>
                <td style="color:#1d9e75;font-size:14px;font-weight:700;padding:4px 0">Seña pagada</td>
                <td style="text-align:right;color:#1d9e75;font-size:14px;font-weight:700">$${pagado.toLocaleString("es-AR")}</td>
              </tr>
              ${saldo > 0 ? `
              <tr>
                <td style="color:#ba7517;font-size:14px;font-weight:700;border-top:1px solid rgba(255,255,255,0.07);padding-top:8px;margin-top:4px">Saldo a pagar al retirar</td>
                <td style="text-align:right;color:#ba7517;font-size:14px;font-weight:700;border-top:1px solid rgba(255,255,255,0.07);padding-top:8px">$${saldo.toLocaleString("es-AR")}</td>
              </tr>` : `
              <tr>
                <td colspan="2" style="border-top:1px solid rgba(255,255,255,0.07);padding-top:8px;color:#1d9e75;font-size:13px;font-weight:700">✓ Pago completo — sin saldo pendiente</td>
              </tr>`}
            </table>

            <!-- Mensaje -->
            <div style="background:rgba(29,61,154,.12);border:1px solid rgba(29,61,154,.25);border-radius:6px;padding:16px 20px;margin-bottom:24px">
              <p style="margin:0;color:#c8d3f0;font-size:14px;line-height:1.7">
                📦 Te vamos a contactar por <strong style="color:#eef2ff">WhatsApp</strong> al número <strong style="color:#eef2ff">${pedido.telefono_cliente || "registrado"}</strong> para coordinar la entrega.<br><br>
                No necesitás enviar ningún comprobante adicional.
              </p>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#09111f;border-top:1px solid rgba(255,255,255,0.06);padding:20px 32px;text-align:center">
            <p style="margin:0;color:#4f5a76;font-size:12px;letter-spacing:.08em">
              © 2026 Andes Talleres Sport Club · Godoy Cruz, Mendoza<br>
              <span style="color:#1d3d9a">#SomosTalleres &nbsp; #SomosFamilia</span>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Andes Talleres <onboarding@resend.dev>",
      to: [pedido.email_cliente],
      subject: `✅ Pedido #${pedidoId} confirmado — Andes Talleres Futsal`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    throw new Error("Error enviando email via Resend");
  }

  const result = await res.json();
  console.log("Email enviado OK, id:", result.id);
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