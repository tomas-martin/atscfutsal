import SibApiV3Sdk from "sib-api-v3-sdk";

const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications["api-key"];

apiKey.apiKey = process.env.BREVO_API_KEY;

const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

export async function enviarEmail(email) {
  await tranEmailApi.sendTransacEmail({
    sender: {
      email: "subcomision.atsc@gmail.com", // TU MAIL VERIFICADO
      name: "Andes Talleres",
    },
    to: [{ email }],
    subject: "Pago confirmado",
    htmlContent: "<h1>Pago confirmado ✅</h1><p>Gracias por tu compra</p>",
  });
}